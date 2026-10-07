import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Polyfill global to avoid "Cannot set property fetch of #<Window>" errors from node-fetch polyfills
if (typeof (window as any).global === 'undefined') {
  (window as any).global = Object.create(window);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
