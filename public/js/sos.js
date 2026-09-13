"use strict";

const sosButtons = [...document.querySelectorAll("[data-sos-action]")];

function setSosState(loading, text) {
    sosButtons.forEach(button => {
        button.disabled = loading;
        button.innerHTML = loading
            ? `<i class="fa-solid fa-spinner fa-spin"></i><span>${text}</span>`
            : `<i class="fa-solid fa-truck-medical"></i><span>${button.classList.contains("mobile-sos-btn") ? "Send Emergency SOS" : "Send SOS"}</span>`;
    });
}

function requestHelpMessage() {
    return new Promise(resolve => {
        const overlay = document.createElement("div");
        overlay.className = "sos-message-overlay";
        overlay.innerHTML = `
            <div class="sos-message-dialog" role="dialog" aria-modal="true" aria-labelledby="sosMessageTitle">
                <h2 id="sosMessageTitle">Send emergency SOS</h2>
                <p>Your live location will be sent to the response team.</p>
                <label for="sosMessageInput">What help do you need?</label>
                <textarea id="sosMessageInput" rows="4" maxlength="1000" required>I need urgent help.</textarea>
                <div class="sos-message-actions">
                    <button type="button" class="sos-cancel-button">Cancel</button>
                    <button type="button" class="sos-confirm-button">Send SOS</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        const input = overlay.querySelector("#sosMessageInput");
        const finish = value => {
            overlay.remove();
            resolve(value);
        };
        overlay.querySelector(".sos-cancel-button").addEventListener("click", () => finish(null));
        overlay.querySelector(".sos-confirm-button").addEventListener("click", () => finish(input.value.trim() || null));
        input.focus();
    });
}

function readQueuedSos() {
    try {
        const queue = JSON.parse(localStorage.getItem("chronicAISosQueue") || "[]");
        return Array.isArray(queue) ? queue : [];
    } catch {
        return [];
    }
}

function queueSos(payload) {
    const queue = readQueuedSos();
    queue.push({ ...payload, queuedAt: Date.now() });
    localStorage.setItem("chronicAISosQueue", JSON.stringify(queue.slice(-5)));
}

async function getSosHeaders(auth) {
    const user = auth.currentUser || await new Promise(resolve => {
        let unsubscribe;
        import("https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js").then(({ onAuthStateChanged }) => {
            unsubscribe = onAuthStateChanged(auth, currentUser => {
                unsubscribe();
                resolve(currentUser);
            });
            setTimeout(() => {
                unsubscribe?.();
                resolve(null);
            }, 5000);
        }).catch(() => resolve(null));
    });
    const isLocalDemo = !user && localStorage.getItem("chronicAIUserId") === "local-demo-citizen";
    if (!user && !isLocalDemo) throw new Error("Your sign-in session has expired. Please sign in again.");
    const headers = { "Content-Type": "application/json" };
    if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
    if (isLocalDemo) headers["X-Local-Demo"] = "true";
    return headers;
}

async function sendQueuedSos() {
    const queue = readQueuedSos();
    if (!queue.length || !navigator.onLine) return;
    try {
        const { auth } = await import("./firebase-client.js");
        const headers = await getSosHeaders(auth);
        const remaining = [];
        for (const payload of queue) {
            const response = await fetch("/api/sos", { method: "POST", headers, body: JSON.stringify(payload) });
            if (!response.ok) remaining.push(payload);
        }
        localStorage.setItem("chronicAISosQueue", JSON.stringify(remaining));
    } catch {
        // Keep the queue for the next online event.
    }
}

async function sendSos() {
    if (localStorage.getItem("chronicAILoggedIn") !== "true") {
        window.location.href = "login.html?redirect=index.html";
        return;
    }
    const helpMessage = await requestHelpMessage();
    if (!helpMessage?.trim()) return;

    const storedLocation = (() => {
        try {
            const location = JSON.parse(localStorage.getItem("chronicAILocation") || "null");
            const latitude = Number(location?.latitude);
            const longitude = Number(location?.longitude);
            return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
                ? { latitude, longitude, accuracy: Number(location.accuracy) || null, capturedAt: Number(location.capturedAt) || 0 }
                : null;
        } catch {
            return null;
        }
    })();
    if (!storedLocation) {
        window.alert("Your saved location is not available yet. Open the location panel once, then try SOS again.");
        return;
    }

    setSosState(true, "Sending SOS...");
    try {
            const { auth } = await import("./firebase-client.js");
            const headers = await getSosHeaders(auth);
            const payload = {
                latitude: storedLocation.latitude,
                longitude: storedLocation.longitude,
                accuracy: storedLocation.accuracy,
                capturedAt: storedLocation.capturedAt,
                message: helpMessage.trim()
            };
            const response = await fetch("/api/sos", {
                method: "POST",
                headers,
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.error || "Unable to send SOS.");
            window.alert(`SOS sent successfully. Reference: ${result.sosId}`);
        } catch (error) {
            if (!navigator.onLine || error instanceof TypeError) {
                queueSos({ latitude: storedLocation.latitude, longitude: storedLocation.longitude, accuracy: storedLocation.accuracy, capturedAt: storedLocation.capturedAt, message: helpMessage.trim() });
                window.alert("SOS saved offline. It will retry automatically when the connection returns.");
                return;
            }
            window.alert(error.message || "Unable to send SOS. Please call emergency services directly.");
        } finally {
            setSosState(false);
        }
}

sosButtons.forEach(button => button.addEventListener("click", sendSos));
window.addEventListener("online", sendQueuedSos);
