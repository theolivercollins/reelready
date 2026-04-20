import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export function V2ThemeToggle() {
  const initial = typeof window !== "undefined"
    ? (localStorage.getItem("le-theme") as "light" | "dark" | null) ?? "dark"
    : "dark";
  const [theme, setTheme] = useState<"light" | "dark">(initial);

  useEffect(() => {
    document.querySelectorAll<HTMLElement>(".le-root, [data-v2-root]").forEach(el => {
      el.setAttribute("data-theme", theme);
    });
    document.documentElement.setAttribute("data-v2-theme", theme);
    localStorage.setItem("le-theme", theme);
  }, [theme]);

  return (
    <button
      onClick={() => setTheme(t => (t === "dark" ? "light" : "dark"))}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className="le-btn le-btn-glass"
      style={{ padding: "6px 10px", borderRadius: 999 }}
    >
      {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  );
}
