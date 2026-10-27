package main

import (
	"crypto/tls"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/mail"
	"net/smtp"
	"os"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/joho/godotenv"
)

var contactLimiter = newRateLimiter(30*time.Second, 10000)

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
	err := godotenv.Load()
	if err != nil {
		return fmt.Errorf("не удалось загрузить переменые окружения .env, попытка использовать из терминала...")
	}

	host := os.Getenv("SMTP_HOST")
	port := os.Getenv("SMTP_PORT")
	username := os.Getenv("SMTP_USER")
	password := os.Getenv("SMTP_PASSWORD")
	recipient := os.Getenv("CONTACT_TO")

	if host == "" || port == "" || username == "" ||
		password == "" || recipient == "" {
		return fmt.Errorf("не заданы настройки SMTP")
	}

	if strings.ContainsAny(email, "\r\n") ||
		strings.ContainsAny(name, "\r\n") {
		return fmt.Errorf("недопустимые символы в данных формы")
	}

	address := net.JoinHostPort(host, port)

	conn, err := net.DialTimeout("tcp", address, 10*time.Second)
	if err != nil {
		return fmt.Errorf("не удалось подключиться к SMTP: %w", err)
	}
	defer conn.Close()

	if err := conn.SetDeadline(time.Now().Add(15 * time.Second)); err != nil {
		return fmt.Errorf("не удалось установить тайм-аут: %w", err)
	}

	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return fmt.Errorf("не удалось создать SMTP-клиент: %w", err)
	}
	defer client.Close()

	tlsConfig := &tls.Config{
		ServerName: host,
		MinVersion: tls.VersionTLS12,
	}

	if err := client.StartTLS(tlsConfig); err != nil {
		return fmt.Errorf("не удалось установить защищённое SMTP-соединение: %w", err)
	}

	auth := smtp.PlainAuth("", username, password, host)
	if err := client.Auth(auth); err != nil {
		return fmt.Errorf("ошибка авторизации SMTP: %w ", err)
	}

	if err := client.Mail(username); err != nil {
		return fmt.Errorf("не удалось установить отправителя: %w", err)
	}

	if err := client.Rcpt(recipient); err != nil {
		return fmt.Errorf("не удалось установить получателя: %w", err)
	}

	writer, err := client.Data()
	if err != nil {
		return fmt.Errorf("не удалось начать отправку письма: %w", err)
	}

	subject := "Новое сообщение с сайта-портфолио"
	body := fmt.Sprintf(
		"Отправитель: %s\nEmail: %s\n\nСообщение:\n%s\n",
		name,
		email,
		message,
	)

	content := "From: " + username + "\r\n" +
		"To: " + recipient + "\r\n" +
		"Reply-To: " + email + "\r\n" +
		"Subject: " + subject + "\r\n" +
		"MIME-Version: 1.0\r\n" +
		"Content-Type: text/plain; charset=UTF-8\r\n" +
		"\r\n" + body

	if _, err := fmt.Fprint(writer, content); err != nil {
		_ = writer.Close()
		return fmt.Errorf("не удалось передать текст письма")
	}

	if err := writer.Close(); err != nil {
		return fmt.Errorf("не удалось завершить отправку письма")
	}

	if err := client.Quit(); err != nil {
		return fmt.Errorf("SMTP-сервер не подтвердил завершение отправки")
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
			"Слишком много запросов. Попробуйте через 30 секунд.",
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
