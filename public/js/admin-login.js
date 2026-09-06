import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyCdRDpgvJGgX6rl7qbR3a0982rbvajj4n0",
    authDomain: "chronic-ai-4dc64.firebaseapp.com",
    databaseURL: "https://chronic-ai-4dc64-default-rtdb.firebaseio.com",
    projectId: "chronic-ai-4dc64",
    storageBucket: "chronic-ai-4dc64.firebasestorage.app",
    messagingSenderId: "711618829524",
    appId: "1:711618829524:web:8028006eefe89aeee52f41"
};

const auth = getAuth(initializeApp(firebaseConfig));
const form = document.getElementById("adminLoginForm");
const button = document.getElementById("loginButton");
const message = document.getElementById("loginMessage");
const emailInput = document.getElementById("adminEmail");
const passwordInput = document.getElementById("adminPassword");
const localAdminMode = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
const localAdminEmail = "admin@chronic";
const localAdminPassword = "chronic";

async function verifyGovernmentSession(user) {
    const headers = localAdminMode ? { "X-Local-Admin": "true" } : { Authorization: `Bearer ${await user.getIdToken(true)}` };
    const response = await fetch("/api/admin/session", { headers });
    const contentType = response.headers.get("content-type") || "";
    const body = await response.text();
    const appOrigin = window.location.origin;
    let data = {};
    if (contentType.includes("application/json")) {
        try {
            data = JSON.parse(body);
        } catch {
            throw new Error("The server returned invalid JSON. Restart the ChronicAI backend.");
        }
    } else {
        throw new Error(`The API route returned a web page instead of JSON. Open this app through the running ChronicAI server at ${appOrigin}.`);
    }
    if (!response.ok) throw new Error(data.error || "Government access denied.");
    sessionStorage.setItem("governmentSession", "active");
    window.location.replace("admin-dashboard.html");
}

onAuthStateChanged(auth, async (user) => {
    if (!user || !sessionStorage.getItem("governmentSession")) return;
    try { await verifyGovernmentSession(user); } catch { await signOut(auth); sessionStorage.removeItem("governmentSession"); }
});

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    button.disabled = true;
    message.textContent = "Checking government access...";
    try {
        if (localAdminMode) {
            if (emailInput.value.trim().toLowerCase() !== localAdminEmail || passwordInput.value !== localAdminPassword) {
                throw new Error("Invalid government email or password.");
            }
            await verifyGovernmentSession(null);
        } else {
            throw new Error("Firebase government authentication is required outside localhost.");
        }
    } catch (error) {
        await signOut(auth).catch(() => undefined);
        sessionStorage.removeItem("governmentSession");
        message.textContent = error.message || "Unable to sign in.";
        button.disabled = false;
    }
});
