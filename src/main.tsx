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
    void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch((error: unknown) => {
      console.warn("Vejoy service worker registration failed:", error);
    });
  });
}

// A production tab can remain open through several deployments. Detect a new
// hashed application bundle, but never reload automatically while staff may
// be entering production data. AppUpdateBanner lets them reload when safe.
if (import.meta.env.PROD) {
  const currentBundle = Array.from(document.scripts)
    .map((script) => script.src)
    .find((source) => /\/assets\/index-[^/]+\.js(?:\?|$)/.test(source));
  let updateNotified = false;

  const checkForAppUpdate = async () => {
    if (!currentBundle || updateNotified || document.visibilityState === "hidden") return;
    try {
      const response = await fetch(`/?__vejoy_version=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) return;
      const html = await response.text();
      const latestPath = html.match(/<script[^>]+src=["']([^"']*\/assets\/index-[^"']+\.js)["']/)?.[1];
      if (!latestPath) return;
      const latestBundle = new URL(latestPath, window.location.origin).href;
      if (latestBundle === currentBundle) return;
      updateNotified = true;
      document.documentElement.dataset.vejoyUpdateAvailable = "true";
      window.dispatchEvent(new Event("vejoy:update-available"));
    } catch (error) {
      console.warn("Vejoy version check failed:", error);
    }
  };

  window.addEventListener("focus", checkForAppUpdate);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void checkForAppUpdate();
  });
  window.setInterval(checkForAppUpdate, 5 * 60 * 1000);
  window.setTimeout(checkForAppUpdate, 10 * 1000);
}
