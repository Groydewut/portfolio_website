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

    // Создаём вторую копию карточек для бесшовного цикла.
    originalCards.forEach((card) => {
        const clone = card.cloneNode(true);
        clone.setAttribute("aria-hidden", "true");

        clone.querySelectorAll("a").forEach((link) => {
            link.setAttribute("tabindex", "-1");
        });

        projectsTrack.appendChild(clone);
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
    let animationFrame = null;

    const speed = 28; // Скорость автопрокрутки, пикселей в секунду.

    function getLoopWidth() {
        return projectsTrack.scrollWidth / 2;
    }

    function normalizeScroll() {
        const loopWidth = getLoopWidth();

        if (loopWidth <= 0) return;

        if (projectsViewport.scrollLeft >= loopWidth) {
            projectsViewport.scrollLeft -= loopWidth;
        } else if (projectsViewport.scrollLeft < 0) {
            projectsViewport.scrollLeft += loopWidth;
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

        animationFrame = requestAnimationFrame(animate);
    }

    function startAnimation() {
        if (animationFrame !== null) return;

        lastTime = 0;
        animationFrame = requestAnimationFrame(animate);
    }

    function scrollByCard(direction) {
        const firstCard = projectsTrack.querySelector(".project-card");

        if (!firstCard) return;

        const gap = parseFloat(
            getComputedStyle(projectsTrack).gap
        ) || 0;

        projectsViewport.scrollBy({
            left: direction * (firstCard.getBoundingClientRect().width + gap),
            behavior: reduceMotion.matches ? "auto" : "smooth"
        });
    }

    projectsPrev.addEventListener("click", () => {
        scrollByCard(-1);
    });

    projectsNext.addEventListener("click", () => {
        scrollByCard(1);
    });

    projectsViewport.addEventListener("scroll", normalizeScroll, {
        passive: true
    });

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

        if (Math.abs(distance) > 4) {
            moved = true;
        }

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

    projectsViewport.addEventListener("click", (event) => {
        if (!moved) return;

        event.preventDefault();
        event.stopPropagation();
        moved = false;
    }, true);

    startAnimation();
}
