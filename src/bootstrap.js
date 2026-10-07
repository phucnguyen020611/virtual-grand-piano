import "./style.css";
import { language, savedLanguage, setLanguage } from "./i18n.js";

// The language first, so the welcome card is already in it. Each language
// button offers the other one, by its own name.
const NAMES = { en: "English", vi: "Tiếng Việt" };
function showLanguage(lang) {
  setLanguage(lang);
  const other = lang === "vi" ? "en" : "vi";
  for (const button of document.querySelectorAll(".langBtn")) {
    button.lang = other;
    button.querySelector("span").textContent = NAMES[other];
    button.ariaLabel =
      other === "vi" ? "Chuyển sang tiếng Việt" : "Switch to English";
    button.title = button.ariaLabel;
  }
  document.dispatchEvent(new Event("vgp:language"));
}
for (const button of document.querySelectorAll(".langBtn"))
  button.onclick = () => showLanguage(language() === "vi" ? "en" : "vi");
showLanguage(savedLanguage());

// Keep a usable entry screen even if WebGL or the scene module cannot start.
import("./main.js").catch(() => {
  const gate = document.querySelector("#audioGate");
  gate.classList.remove("hidden");
  gate.removeAttribute("aria-hidden");
  document.querySelector("#gateNote").textContent =
    "The 3D piano could not start. Check your connection and WebGL support, then retry.";
  const button = document.querySelector("#enterBtn");
  button.textContent = "Retry piano";
  button.onclick = () => location.reload();
});
