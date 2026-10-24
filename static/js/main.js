
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

const projectsViewport = document.querySelector("#projects-viewport");
const projectsTrack = document.querySelector("#projects-track");
const projectsPrev = document.querySelector("#projects-prev");
const projectsNext = document.querySelector("#projects-next");

if (projectsViewport && projectsTrack) {
    const originalCards = Array.from(projectsTrack.children);

    if (originalCards.length > 0) {
        // Создаём копии слева и справа от оригинальных карточек.
        function cloneCards() {
            return originalCards.map((card) => {
                const clone = card.cloneNode(true);
                clone.setAttribute("aria-hidden", "true");

                clone.querySelectorAll("a, button").forEach((element) => {
                    element.setAttribute("tabindex", "-1");
                });

                return clone;
            });
        }

        const leftClones = cloneCards();
        const rightClones = cloneCards();

        leftClones.forEach((card) => {
            projectsTrack.insertBefore(card, projectsTrack.firstChild);
        });

        rightClones.forEach((card) => {
            projectsTrack.appendChild(card);
        });

        const reduceMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)"
        );

        let paused = false;
        let dragging = false;
        let startX = 0;
        let startScrollLeft = 0;
        let moved = false;
        let lastTime = 0;

        const speed = 28;

        function getLoopWidth() {
            const firstOriginal = projectsTrack.children[originalCards.length];
            const firstRightClone =
                projectsTrack.children[originalCards.length * 2];

            if (!firstOriginal || !firstRightClone) return 0;

            return (
                firstRightClone.getBoundingClientRect().left -
                firstOriginal.getBoundingClientRect().left
            );
        }


        function normalizeScroll() {
            const loopWidth = getLoopWidth();

            if (loopWidth <= 0) return;

            const maxScroll =
                projectsViewport.scrollWidth - projectsViewport.clientWidth;

            // Если лента приблизилась к правому краю,
            // переносим её на один цикл влево.
            if (projectsViewport.scrollLeft >= maxScroll - 100) {
                projectsViewport.scrollLeft -= loopWidth;
            }

            // Если лента приблизилась к левому краю,
            // переносим её на один цикл вправо.
            if (projectsViewport.scrollLeft <= 100) {
                projectsViewport.scrollLeft += loopWidth;
            }
        }


        // Начинаем с оригинального набора, а не с левых копий.
        function setInitialPosition() {
            const loopWidth = getLoopWidth();
            if (loopWidth > 0) {
                projectsViewport.scrollLeft = loopWidth;
            }
        }

        function animate(time) {
            if (!lastTime) lastTime = time;

            const delta = Math.min((time - lastTime) / 1000, 0.05);
            lastTime = time;

            if (
                !paused &&
                !dragging &&
                !reduceMotion.matches &&
                !document.hidden
            ) {
                projectsViewport.scrollLeft += speed * delta;
                normalizeScroll();
            }

            requestAnimationFrame(animate);
        }

        function scrollByCard(direction) {
            const card = projectsTrack.children[originalCards.length];

            if (!card) return;

            const gap =
                parseFloat(getComputedStyle(projectsTrack).gap) || 0;

            projectsViewport.scrollLeft +=
                direction * (card.getBoundingClientRect().width + gap);

            normalizeScroll();
        }

        if (projectsPrev) {
            projectsPrev.onclick = () => scrollByCard(-1);
        }

        if (projectsNext) {
            projectsNext.onclick = () => scrollByCard(1);
        }

        projectsViewport.addEventListener(
            "scroll",
            normalizeScroll,
            { passive: true }
        );

        projectsViewport.addEventListener("mouseenter", () => {
            paused = true;
        });

        projectsViewport.addEventListener("mouseleave", () => {
            paused = false;
        });

        projectsViewport.addEventListener("focusin", () => {
            paused = true;
        });

        projectsViewport.addEventListener("focusout", (event) => {
            if (!projectsViewport.contains(event.relatedTarget)) {
                paused = false;
            }
        });

        projectsViewport.addEventListener("pointerdown", (event) => {
            if (event.button !== 0) return;
            if (event.target.closest("a, button")) return;

            dragging = true;
            moved = false;
            startX = event.clientX;
            startScrollLeft = projectsViewport.scrollLeft;

            projectsViewport.classList.add("is-dragging");
            projectsViewport.setPointerCapture(event.pointerId);
        });

        projectsViewport.addEventListener("pointermove", (event) => {
            if (!dragging) return;

            const distance = event.clientX - startX;

            if (Math.abs(distance) > 4) moved = true;

            if (moved) {
                projectsViewport.scrollLeft = startScrollLeft - distance;
                normalizeScroll();
            }
        });

        function stopDragging() {
            dragging = false;
            projectsViewport.classList.remove("is-dragging");
        }

        projectsViewport.addEventListener("pointerup", stopDragging);
        projectsViewport.addEventListener("pointercancel", stopDragging);
        projectsViewport.addEventListener("lostpointercapture", stopDragging);

        projectsViewport.addEventListener(
            "click",
            (event) => {
                if (!moved) return;

                event.preventDefault();
                event.stopPropagation();
                moved = false;
            },
            true
        );

        // Ждём расчёта размеров карточек браузером.
        requestAnimationFrame(() => {
            setInitialPosition();
            requestAnimationFrame(animate);
        });
    }
}

const contactForm = document.querySelector("#contact-form");
const contactStatus = document.querySelector("#contact-form-status");

if (contactForm && contactStatus) {
    contactForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const submitButton = contactForm.querySelector(
            'button[type="submit"]'
        );
        const buttonText = submitButton.querySelector("span");
        const originalText = buttonText.textContent;

        contactStatus.textContent = "";
        submitButton.disabled = true;
        buttonText.textContent = "Отправка...";

        try {
            const formData = new FormData(contactForm);
            const data = Object.fromEntries(formData.entries());

            const response = await fetch("/api/contact", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    result.message || "Не удалось отправить сообщение."
                );
            }

            contactStatus.textContent = result.message;
            contactForm.reset();
        } catch (error) {
            contactStatus.textContent =
                error.message || "Ошибка сети. Попробуйте позже.";
        } finally {
            submitButton.disabled = false;
            buttonText.textContent = originalText;
        }
    });
}
