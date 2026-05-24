import { useEffect, useMemo, useState } from "react";
import BrandLogo from "./BrandLogo.jsx";
import "../styles/navbar.css";

function Navbar({ copy, theme, onToggleTheme }) {
  const navItems = useMemo(
    () => [
      { id: "home", label: copy.nav.home },
      { id: "overview", label: copy.nav.overview },
      { id: "features", label: copy.nav.features },
      { id: "architecture", label: copy.nav.architecture },
      { id: "hardware", label: copy.nav.hardware },
      { id: "software", label: copy.nav.software },
      { id: "testing", label: copy.nav.testing },
      { id: "budget", label: copy.nav.budget },
      { id: "team", label: copy.nav.team },
    ],
    [copy]
  );

  const [activeId, setActiveId] = useState(navItems[0]?.id ?? "home");

  useEffect(() => {
    let rafId = 0;

    const getSections = () =>
      navItems.map((item) => document.getElementById(item.id)).filter(Boolean);

    const getHeaderHeight = () =>
      document.querySelector(".site-header")?.getBoundingClientRect().height ?? 0;

    const updateActiveSection = () => {
      rafId = 0;

      const sections = getSections();
      if (!sections.length) {
        return;
      }

      const scrollMarker =
        window.scrollY +
        getHeaderHeight() +
        Math.max(window.innerHeight * 0.18, 72);
      const isAtBottom =
        window.scrollY + window.innerHeight >=
        document.documentElement.scrollHeight - 4;

      let nextActiveId = sections[0].id;

      for (const section of sections) {
        if (scrollMarker >= section.offsetTop) {
          nextActiveId = section.id;
        } else {
          break;
        }
      }

      if (isAtBottom) {
        nextActiveId = sections[sections.length - 1].id;
      }

      setActiveId((currentId) =>
        currentId === nextActiveId ? currentId : nextActiveId
      );
    };

    const requestUpdate = () => {
      if (rafId) {
        return;
      }

      rafId = window.requestAnimationFrame(updateActiveSection);
    };

    updateActiveSection();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);

    return () => {
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);

      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [navItems]);

  const handleLinkClick = (event, id) => {
    event.preventDefault();
    setActiveId(id);

    const target = document.getElementById(id);
    if (!target) {
      return;
    }

    const header = document.querySelector(".site-header");
    const headerHeight = header?.getBoundingClientRect().height ?? 0;
    const extraOffset = id === "home" ? 0 : 16;
    const nextTop =
      id === "home"
        ? 0
        : Math.max(
            window.scrollY +
              target.getBoundingClientRect().top -
              headerHeight -
              extraOffset,
            0
          );

    window.history.pushState(null, "", `#${id}`);
    window.scrollTo({
      top: nextTop,
      behavior: "smooth",
    });
  };

  const themeLabel =
    theme === "dark" ? copy.toggles.theme.toLight : copy.toggles.theme.toDark;
  return (
    <header className="site-header">
      <div className="container header__inner">
        <a className="logo-link" href="#home">
          <BrandLogo />
        </a>
        <div className="header__links">
          <nav className="nav" aria-label="Primary">
            {navItems.map((item) => {
              const isActive = activeId === item.id;
              return (
                <a
                  key={item.id}
                  className={`nav__link${isActive ? " active" : ""}`}
                  href={`#${item.id}`}
                  onClick={(event) => handleLinkClick(event, item.id)}
                  aria-current={isActive ? "page" : undefined}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>
          <div className="nav__actions">
            <button
              className="toggle-button"
              type="button"
              onClick={onToggleTheme}
              aria-pressed={theme === "dark"}
            >
              {themeLabel}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Navbar;
