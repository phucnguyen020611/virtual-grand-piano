import "./style.css";

// Keep a usable entry screen even if WebGL or the scene module cannot start.
import("./main.js").catch(() => {
  const gate = document.querySelector("#audioGate");
  gate.classList.remove("hidden");
  gate.removeAttribute("aria-hidden");
  document.querySelector(".gateInner p").textContent =
    "The 3D piano could not start. Check your connection and WebGL support, then retry.";
  const button = document.querySelector("#enterBtn");
  button.textContent = "Retry piano";
  button.onclick = () => location.reload();
});
