const themeToggle = document.querySelector("#theme-toggle");
const root = document.documentElement;

// Определяем начальную тему
function getInitialTheme() {
    const savedTheme = localStorage.getItem("theme");

    if (savedTheme === "light" || savedTheme === "dark") {
        return savedTheme;
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
}

// Применяем тему к странице
function applyTheme(theme) {
    root.dataset.theme = theme;
    themeToggle.setAttribute(
        "aria-label",
        theme === "dark"
            ? "Включить светлую тему"
            : "Включить тёмную тему"
    );

    themeToggle.querySelector("span").textContent =
        theme === "dark" ? "☀" : "◐";
}

// Обработчик переключения темы
themeToggle.addEventListener("click", () => {
    const currentTheme = root.dataset.theme;
    const nextTheme = currentTheme === "dark" ? "light" : "dark";

    applyTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
});

// Устанавливаем тему при загрузке страницы
applyTheme(getInitialTheme());

// Анимация появления элементов при прокрутке
const animatedElements = document.querySelectorAll(
    ".content-section, .hero-content, .hero-meta, .hero-decoration"
);

if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
        (entries, observer) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("is-visible");
                    observer.unobserve(entry.target);
                }
            });
        },
        {
            threshold: 0.12,
        }
    );

    animatedElements.forEach((element) => {
        element.classList.add("reveal");
        observer.observe(element);
    });
} else {
    animatedElements.forEach((element) => {
        element.classList.add("is-visible");
    });
}
