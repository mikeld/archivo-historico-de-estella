import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Polyfill global to avoid "Cannot set property fetch of #<Window>" errors from node-fetch polyfills
if (typeof (window as any).global === 'undefined') {
  (window as any).global = Object.create(window);
}

// Register Progressive Web App (PWA) Service Worker
if ("serviceWorker" in navigator && (import.meta as any).env?.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => console.log("PWA Service Worker listo:", reg.scope))
      .catch((err) => console.debug("PWA SW registration skipped:", err));
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
