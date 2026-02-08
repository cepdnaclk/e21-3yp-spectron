/* =========================
   Navigation active state
   ========================= */
document.addEventListener("DOMContentLoaded", () => {
  const navLinks = Array.from(document.querySelectorAll(".nav__link"));
  const sections = Array.from(document.querySelectorAll("section[id]"));

  const setActiveLink = (sectionId) => {
    navLinks.forEach((link) => {
      const isActive = link.getAttribute("href") === `#${sectionId}`;
      link.classList.toggle("active", isActive);
      if (isActive) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  };

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveLink(entry.target.id);
          }
        });
      },
      {
        rootMargin: "-35% 0px -55% 0px",
        threshold: 0.1,
      }
    );

    sections.forEach((section) => observer.observe(section));
  }

  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      const targetId = link.getAttribute("href").replace("#", "");
      setActiveLink(targetId);
    });
  });

  /* =========================
     Team modal interactions
     ========================= */
  const cards = Array.from(document.querySelectorAll(".team-card"));
  const modal = document.querySelector("[data-modal]");
  const modalClose = document.querySelector("[data-modal-close]");
  const modalName = document.querySelector("[data-modal-name]");
  const modalRole = document.querySelector("[data-modal-role]");
  const modalSummary = document.querySelector("[data-modal-summary]");
  const modalContribution = document.querySelector("[data-modal-contribution]");
  const modalSkills = document.querySelector("[data-modal-skills]");
  const modalTools = document.querySelector("[data-modal-tools]");
  const modalImg = document.querySelector("[data-modal-img]");

  if (!modal) {
    return;
  }

  const populateList = (listElement, items) => {
    listElement.innerHTML = "";
    items.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item.trim();
      listElement.appendChild(li);
    });
  };

  const openModal = (card) => {
    modalName.textContent = card.dataset.name;
    modalRole.textContent = card.dataset.role;
    modalSummary.textContent = card.dataset.full;
    modalContribution.textContent = card.dataset.contribution;
    modalImg.src = card.dataset.img;
    modalImg.alt = `${card.dataset.name} profile photo`;

    populateList(modalSkills, card.dataset.skills.split(","));
    populateList(modalTools, card.dataset.tools.split(","));

    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");
    modalClose.focus();
  };

  const closeModal = () => {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("no-scroll");
  };

  cards.forEach((card) => {
    card.addEventListener("click", () => openModal(card));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openModal(card);
      }
    });
  });

  modalClose.addEventListener("click", closeModal);

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("is-open")) {
      closeModal();
    }
  });
});
