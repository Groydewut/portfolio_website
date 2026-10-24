package main

import (
	"log"
	"net/http"
)

func main() {
	mux := http.NewServeMux()

	// Обработчик формы обратной связи.
	mux.HandleFunc("/api/contact", handleContact)

	// Раздача HTML, CSS, JavaScript и других статических файлов.
	fs := http.FileServer(http.Dir("./static"))
	mux.Handle("/", fs)

	log.Println("Сервер запущен: http://localhost:8080")

	if err := http.ListenAndServe(":8080", mux); err != nil {
		log.Fatal(err)
	}
}
