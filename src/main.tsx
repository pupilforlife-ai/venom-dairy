import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);

// Keep the installable shell available in production. Supabase requests are
// intentionally left to the network so the live shared data is never cached
// or accidentally served as stale offline data.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.warn("Vejoy service worker registration failed:", error);
    });
  });
}
