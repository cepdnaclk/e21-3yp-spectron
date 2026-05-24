import { useEffect, useMemo, useState } from "react";
import Navbar from "./components/Navbar.jsx";
import Home from "./pages/Home.jsx";
import { siteCopy } from "./data/siteCopy.js";

const THEME_KEY = "spectron-theme";

const getInitialTheme = () => {
  if (typeof window === "undefined") {
    return "light";
  }

  const storedTheme = window.localStorage.getItem(THEME_KEY);
  if (storedTheme) {
    return storedTheme;
  }

  return "light";
};

function App() {
  const [theme, setTheme] = useState(getInitialTheme);
  const copy = useMemo(() => siteCopy.en, []);

  useEffect(() => {
    // Keep theme state in sync with the document for CSS variables.
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    // Keep the document language fixed to English.
    document.documentElement.setAttribute("lang", "en");
  }, []);

  const handleThemeToggle = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  return (
    <>
      <Navbar
        copy={copy}
        theme={theme}
        onToggleTheme={handleThemeToggle}
      />
      <Home copy={copy} />
    </>
  );
}

export default App;
