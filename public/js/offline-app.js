"use strict";

(function registerOfflineApp() {
    const ensureOfflineBadge = () => {
        let badge = document.getElementById("chronicai-offline-badge");

        if (!badge) {
            badge = document.createElement("div");
            badge.id = "chronicai-offline-badge";
            badge.setAttribute("role", "status");
            badge.setAttribute("aria-live", "polite");
            badge.style.position = "fixed";
            badge.style.right = "18px";
            badge.style.bottom = "18px";
            badge.style.zIndex = "9999";
            badge.style.display = "none";
            badge.style.padding = "8px 12px";
            badge.style.borderRadius = "999px";
            badge.style.fontSize = "11px";
            badge.style.fontWeight = "700";
            badge.style.letterSpacing = "0.04em";
            badge.style.textTransform = "uppercase";
            badge.style.border = "1px solid rgba(251, 191, 36, 0.55)";
            badge.style.background = "rgba(15, 23, 42, 0.9)";
            badge.style.color = "#fcd34d";
            badge.style.boxShadow = "0 10px 25px rgba(15, 23, 42, 0.35)";
            document.body.appendChild(badge);
        }

        return badge;
    };

    const updateConnectionState = () => {
        const isOffline = !navigator.onLine;
        document.documentElement.classList.toggle("offline-mode", isOffline);

        const status = document.getElementById("offlineStatus");
        if (status) {
            status.hidden = !isOffline;
            status.textContent = isOffline
                ? "Offline mode: saved data is available. Local actions will sync when the connection returns."
                : "Online mode: synced data is active.";
        }

        const badge = ensureOfflineBadge();
        if (isOffline) {
            badge.textContent = "Offline";
            badge.style.display = "inline-flex";
            badge.style.color = "#fcd34d";
            badge.style.borderColor = "rgba(251, 191, 36, 0.6)";
        } else {
            badge.textContent = "Online";
            badge.style.display = "inline-flex";
            badge.style.color = "#86efac";
            badge.style.borderColor = "rgba(34, 197, 94, 0.6)";
        }
    };

    window.addEventListener("online", updateConnectionState);
    window.addEventListener("offline", updateConnectionState);
    updateConnectionState();

    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/service-worker.js", { scope: "/" })
            .then((registration) => {
                registration.update().catch(() => {});
            })
            .catch((error) => console.warn("ChronicAI offline support unavailable:", error.message));
    }, { once: true });
})();
