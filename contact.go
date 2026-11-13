package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/mail"
	"os"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/joho/godotenv"
)

var contactLimiter = newRateLimiter(10*time.Second, 10000)

type contactRequest struct {
	Name    string `json:"name"`
	Email   string `json:"email"`
	Message string `json:"message"`
	Website string `json:"website"`
}

type contactResponse struct {
	Message string `json:"message"`
}

func writeContactResponse(
	w http.ResponseWriter,
	status int,
	message string,
) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)

	if err := json.NewEncoder(w).Encode(contactResponse{
		Message: message,
	}); err != nil {
		// Ответ уже отправлен, поэтому повторно менять статус нельзя.
		return
	}
}

func sendContactEmail(name, email, message string) error {
	// .env необязателен: на Render переменные задаются через настройки сервиса.
	if err := godotenv.Load(); err != nil {
		log.Printf("Файл .env не найден, используем переменные окружения: %v", err)
	}

	apiKey := os.Getenv("RESEND_API_KEY")
	from := os.Getenv("RESEND_FROM")
	recipient := os.Getenv("CONTACT_TO")

	if apiKey == "" || from == "" || recipient == "" {
		return fmt.Errorf("не заданы настройки Resend")
	}

	if strings.ContainsAny(email, "\r\n") ||
		strings.ContainsAny(name, "\r\n") {
		return fmt.Errorf("недопустимые символы в данных формы")
	}

	// Данные, которые Resend ожидает получить в JSON.
	payload := struct {
		From    string   `json:"from"`
		To      []string `json:"to"`
		ReplyTo string   `json:"reply_to"`
		Subject string   `json:"subject"`
		Text    string   `json:"text"`
	}{
		From:    from,
		To:      []string{recipient},
		ReplyTo: email,
		Subject: "Новое сообщение с сайта-портфолио",
		Text: fmt.Sprintf(
			"Отправитель: %s\nEmail: %s\n\nСообщение:\n%s\n",
			name,
			email,
			message,
		),
	}

	// Преобразуем структуру в JSON.
	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("не удалось сформировать JSON: %w", err)
	}

	// Создаём HTTPS-запрос к Resend.
	req, err := http.NewRequest(
		http.MethodPost,
		"https://api.resend.com/emails",
		strings.NewReader(string(jsonData)),
	)
	if err != nil {
		return fmt.Errorf("не удалось создать HTTP-запрос: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	// Ограничиваем время ожидания ответа.
	client := &http.Client{
		Timeout: 15 * time.Second,
	}

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("ошибка обращения к Resend API: %w", err)
	}
	defer resp.Body.Close()

	// Читаем ответ сервера для диагностики ошибок.
	responseBody, err := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if err != nil {
		return fmt.Errorf("не удалось прочитать ответ Resend: %w", err)
	}

	// Resend возвращает успешный HTTP-статус при принятии письма.
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf(
			"Resend API вернул HTTP %d: %s",
			resp.StatusCode,
			strings.TrimSpace(string(responseBody)),
		)
	}

	return nil
}

func handleContact(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		writeContactResponse(
			w,
			http.StatusMethodNotAllowed,
			"Разрешён только метод POST",
		)
		return
	}
	ip := clientIP(r)

	if !contactLimiter.allow(ip) {
		writeContactResponse(
			w,
			http.StatusTooManyRequests,
			"Слишком много запросов. Попробуйте через 10 секунд.",
		)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16*1024)
	defer r.Body.Close()

	var request contactRequest

	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(&request); err != nil {
		writeContactResponse(
			w,
			http.StatusBadRequest,
			"Не удалось прочитать данные формы",
		)
		return
	}
	if request.Website != "" {
		// Не раскрываем боту, что он попался на антиспам-поле.
		writeContactResponse(w, http.StatusOK, "Сообщение принято")
		return
	}

	if err := validateContact(request); err != nil {
		writeContactResponse(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := sendContactEmail(
		request.Name,
		request.Email,
		request.Message,
	); err != nil {
		log.Printf("Ошибка отправки контактного письма: %v", err)
		writeContactResponse(
			w,
			http.StatusInternalServerError,
			"Не удалось отправить сообщение. Попробуйте позже.",
		)
		return
	}

	writeContactResponse(
		w,
		http.StatusOK,
		"Сообщение успешно отправлено",
	)
}
func validateContact(request contactRequest) error {
	name := strings.TrimSpace(request.Name)
	email := strings.TrimSpace(request.Email)
	message := strings.TrimSpace(request.Message)

	if utf8.RuneCountInString(name) < 2 ||
		utf8.RuneCountInString(name) > 80 {
		return fmt.Errorf("Имя должно содержать от 2 до 80 символов")
	}

	if len(email) > 254 {
		return fmt.Errorf("Email слишком длинный")
	}

	address, err := mail.ParseAddress(email)
	if err != nil || address.Address != email || !strings.Contains(email, "@") {
		return fmt.Errorf("Укажите корректный email")
	}

	if utf8.RuneCountInString(message) < 10 ||
		utf8.RuneCountInString(message) > 5000 {
		return fmt.Errorf("Сообщение должно содержать от 10 до 5000 символов")
	}

	return nil
}
