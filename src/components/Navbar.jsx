import { useEffect, useMemo, useState } from "react";
import BrandLogo from "./BrandLogo.jsx";
import "../styles/navbar.css";

function Navbar({ copy, theme, onToggleTheme }) {
  const navItems = useMemo(
    () => [
      { id: "home", label: copy.nav.home },
      { id: "overview", label: copy.nav.overview },
      { id: "architecture", label: copy.nav.architecture },
      { id: "tech", label: copy.nav.tech },
      { id: "budget", label: copy.nav.budget },
      { id: "team", label: copy.nav.team },
    ],
    [copy]
  );

  const [activeId, setActiveId] = useState(navItems[0]?.id ?? "home");

  useEffect(() => {
    const sections = navItems
      .map((item) => document.getElementById(item.id))
      .filter(Boolean);

    if (!sections.length || !("IntersectionObserver" in window)) {
      return;
    }

    // Highlight the nav item for the section currently in view.
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      {
        rootMargin: "-35% 0px -55% 0px",
        threshold: 0.1,
      }
    );

    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, [navItems]);

  const handleLinkClick = (id) => {
    setActiveId(id);
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
                  onClick={() => handleLinkClick(item.id)}
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
