import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import styles from "./styles.css?inline";

const styleElement = document.createElement("style");
styleElement.setAttribute("data-ps1-news-styles", "true");
styleElement.textContent = styles;
document.head.appendChild(styleElement);

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
