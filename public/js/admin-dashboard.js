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
let currentUser;
let currentRole = "viewer";
let debounceTimer;
let locationMap;
const localAdminMode = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

const $ = (id) => document.getElementById(id);
const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));

async function api(path, options = {}) {
    const headers = localAdminMode ? { Accept: "application/json", "X-Local-Admin": "true", ...options.headers } : { Accept: "application/json", ...options.headers, Authorization: `Bearer ${await currentUser.getIdToken()}` };
    const response = await fetch(path, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
    return data;
}

function renderMetrics(stats) {
    const metrics = [["Total reports", stats.totalReports, "All submitted cases"], ["Active emergencies", stats.activeEmergencies, "Pending response"], ["Critical cases", stats.criticalCases, "Severe or critical"], ["People needing help", stats.peopleNeedingHelp, "Rescue signals"], ["Missing persons", stats.missingPersons, "Open records"], ["Trapped / stranded", stats.trappedPeople, "Urgent assistance"], ["Resource requests", stats.resourceRequests, "Supply signals"], ["Damaged assets", stats.damagedAssets, "Houses & infrastructure"], ["Resolved cases", stats.resolvedCases, "Closed or resolved"]];
    $("metricGrid").innerHTML = metrics.map(([label, value, note]) => `<article class="metric"><span>${escapeHTML(label)}</span><strong>${Number(value) || 0}</strong><small>${escapeHTML(note)}</small></article>`).join("");
}

function renderAlerts(alerts) {
    $("alertList").innerHTML = alerts.length ? alerts.map((alert) => `<div class="alert-item"><strong>${escapeHTML(alert.title)}</strong><span>${escapeHTML(alert.location)} · ${escapeHTML(alert.severity)} · ${escapeHTML(alert.status)}</span></div>`).join("") : `<div class="empty">No unresolved critical alerts.</div>`;
    const critical = alerts[0];
    $("criticalAlert").innerHTML = critical ? `<i class="fa-solid fa-triangle-exclamation"></i><div><strong>${escapeHTML(critical.title)}</strong><span>${escapeHTML(critical.location)} · ${escapeHTML(critical.severity)} · ${escapeHTML(critical.status)}</span></div>` : `<i class="fa-solid fa-circle-check"></i><div><strong>No critical alerts</strong><span>Current protected case data has no unresolved severe or critical alert.</span></div>`;
}

function renderMissing(people) {
    $("missingList").innerHTML = people.length ? people.slice(0, 8).map((person) => `<div class="alert-item"><strong>${escapeHTML(person.name || "Unnamed person")}</strong><span>${escapeHTML(person.location || "Location unavailable")} · ${escapeHTML(person.status || "Pending")}</span></div>`).join("") : `<div class="empty">No missing-person records found.</div>`;
}

function renderChart(reports) {
    const buckets = [0, 0, 0, 0, 0, 0, 0];
    reports.forEach((report) => { const day = Math.max(0, Math.min(6, Math.floor((Date.now() - new Date(report.createdAt || Date.now()).getTime()) / 86400000))); buckets[6 - day] += 1; });
    const max = Math.max(...buckets, 1);
    $("trendChart").innerHTML = buckets.map((value, index) => `<div class="bar" style="--height:${Math.max(12, (value / max) * 140)}px"><span>${index === 6 ? "Now" : `${6 - index}d`}</span></div>`).join("");
}

function renderMap(signals) {
    const legend = [["emergency", "Emergency"], ["critical", "Critical access"], ["needs-help", "Need help"], ["missing-person", "Missing person"], ["report", "Civic report"]];
    if (!signals.length) {
        $("mapPreview").innerHTML = `<div class="empty">No location signals available.</div>`;
        return;
    }
    const mappedSignals = signals.filter((signal) => Number.isFinite(Number(signal.latitude)) && Number.isFinite(Number(signal.longitude)));
    const items = signals.map((signal) => `<li class="signal-item ${escapeHTML(signal.type)}"><span class="signal-icon"><i class="fa-solid ${signal.type === "missing-person" ? "fa-person" : signal.type === "needs-help" ? "fa-hand-holding-medical" : signal.type === "critical" ? "fa-triangle-exclamation" : signal.type === "emergency" ? "fa-bolt" : "fa-location-dot"}"></i></span><span><strong>${escapeHTML(signal.label)} · ${escapeHTML(signal.title)}</strong><small>${escapeHTML(signal.location)} · ${escapeHTML(signal.status)}</small></span></li>`).join("");
    const legendMarkup = legend.map(([type, label]) => `<span><i class="legend-dot ${type}"></i>${label}</span>`).join("");
    $("mapPreview").innerHTML = `<div class="map-canvas" id="realLocationMap"></div><div class="map-side"><div class="map-legend">${legendMarkup}</div><p class="map-status">${mappedSignals.length} of ${signals.length} locations placed on the map.</p><ul class="signal-list">${items}</ul></div>`;
    if (locationMap) locationMap.remove();
    locationMap = L.map("realLocationMap", { scrollWheelZoom: true }).setView([22.5, 88.3], 5);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap contributors", maxZoom: 19 }).addTo(locationMap);
    const bounds = [];
    mappedSignals.forEach((signal) => {
        const point = [Number(signal.latitude), Number(signal.longitude)];
        bounds.push(point);
        const color = signal.type === "critical" ? "#df5365" : signal.type === "needs-help" ? "#438fd0" : signal.type === "missing-person" ? "#8b62c7" : signal.type === "emergency" ? "#ed9a32" : "#4c91a0";
        L.circleMarker(point, { radius: 8, color: "#ffffff", weight: 2, fillColor: color, fillOpacity: 0.95 }).addTo(locationMap).bindPopup(`<strong>${escapeHTML(signal.label)}</strong><br>${escapeHTML(signal.title)}<br><small>${escapeHTML(signal.location)} · ${escapeHTML(signal.status)}</small>`);
    });
    if (bounds.length === 1) locationMap.setView(bounds[0], 13);
    if (bounds.length > 1) locationMap.fitBounds(bounds, { padding: [24, 24] });
    setTimeout(() => locationMap.invalidateSize(), 50);
}

function renderTypes(reports) {
    const select = $("typeFilter");
    const values = [...new Set(reports.map((report) => report.analysis?.category).filter(Boolean))].sort();
    select.innerHTML = `<option value="">All case types</option>${values.map((value) => `<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`).join("")}`;
}

async function loadDashboard() {
    const params = new URLSearchParams({ page: "1", pageSize: "100", q: $("searchInput").value.trim(), severity: $("severityFilter").value, status: $("statusFilter").value, type: $("typeFilter").value });
    try {
        const data = await api(`/api/admin/overview?${params}`);
        currentRole = data.user.role;
        $("officialName").textContent = data.user.name || data.user.email;
        $("roleName").textContent = data.user.role.replaceAll("_", " ");
        renderMetrics(data.stats); renderAlerts(data.alerts); renderMissing(data.missingPersons); renderChart(data.reports); renderMap(data.locationSignals || []); renderTypes(data.reports);
        $("paginationLabel").textContent = `${data.pagination.total} cases · page ${data.pagination.page}`;
        document.querySelectorAll(".case-table tbody").forEach((node) => { node.innerHTML = ""; });
        $("caseRows").innerHTML = data.reports.length ? data.reports.map((report) => { const severity = String(report.analysis?.severity || report.priority || "medium").toLowerCase(); const canWrite = ["admin", "super_admin", "government_officer", "rescue_coordinator"].includes(currentRole); return `<tr><td><strong>${escapeHTML(report.reportId)}</strong><small>${escapeHTML(report.analysis?.problem || report.description || "Civic report")}</small></td><td>${escapeHTML(report.location || "Unavailable")}</td><td><span class="pill ${severity}">${escapeHTML(report.analysis?.severity || report.priority || "Medium")}</span></td><td>${escapeHTML(report.status || "Submitted")}</td><td>${canWrite ? `<form class="status-form" data-id="${escapeHTML(report.reportId)}"><select aria-label="Update ${escapeHTML(report.reportId)}"><option>Submitted</option><option>Verified</option><option>Assigned</option><option>In Progress</option><option>Resolved</option></select><button class="case-actions" type="submit">Save</button></form>` : `<small>Read only</small>`}</td></tr>`; }).join("") : `<tr><td colspan="5" class="empty">No cases match the selected filters.</td></tr>`;
        $("caseRows").querySelectorAll(".status-form").forEach((form) => form.addEventListener("submit", updateStatus));
    } catch (error) { $("criticalAlert").innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i><div><strong>Dashboard unavailable</strong><span>${escapeHTML(error.message)}</span></div>`; }
}

async function updateStatus(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button");
    button.disabled = true;
    try { await api(`/api/reports/${encodeURIComponent(form.dataset.id)}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: form.querySelector("select").value, adminNote: `Updated by ${currentUser?.email || "local administrator"}` }) }); await loadDashboard(); } catch (error) { alert(error.message); button.disabled = false; }
}

onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (!user && !localAdminMode) { window.location.replace("admin-login.html"); return; }
    try { await api("/api/admin/session"); await loadDashboard(); } catch { await signOut(auth); sessionStorage.removeItem("governmentSession"); window.location.replace("admin-login.html"); }
});

$("logoutButton").addEventListener("click", async () => { await signOut(auth); sessionStorage.removeItem("governmentSession"); window.location.replace("admin-login.html"); });
$("refreshButton").addEventListener("click", loadDashboard);
["searchInput", "severityFilter", "statusFilter", "typeFilter"].forEach((id) => $(id).addEventListener("input", () => { clearTimeout(debounceTimer); debounceTimer = setTimeout(loadDashboard, 250); }));
