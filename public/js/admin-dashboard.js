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
let canonicalDebounceTimer;
let locationMap;
let fleetMap;
let fleetMarkers = new Map();
let briefingRequest = null;
let briefingRefreshTimer;
const localAdminMode = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
const sihDemoMode = sessionStorage.getItem("sihDemoSession") === "active";

const $ = (id) => document.getElementById(id);
const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
const cleanBriefingText = (value) => String(value ?? "").replace(/^\s*#{1,6}\s*/gm, "").replace(/\*{2,}/g, "").replace(/\s{2,}/g, " ").trim();

function showToast(message, type = "info") {
    const container = $("toastContainer");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    const icon = type === "success" ? "fa-circle-check" : type === "error" ? "fa-circle-exclamation" : "fa-bell";
    toast.innerHTML = `<i class="fa-solid ${icon}"></i><span>${escapeHTML(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 300);
    }, 4500);
}

async function api(path, options = {}) {
    const headers = sihDemoMode
        ? { Accept: "application/json", "X-SIH-Demo": "true", ...options.headers }
        : localAdminMode
            ? { Accept: "application/json", "X-Local-Admin": "true", ...options.headers }
            : { Accept: "application/json", ...options.headers, Authorization: `Bearer ${await currentUser?.getIdToken?.() || ""}` };
    const response = await fetch(path, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || `Request failed: ${response.status}`);
    return data;
}

// ============================================================
// PHASE 4: AI SITREP DISTRICT BRIEFING
// ============================================================

async function loadBriefing() {
        if (briefingRequest) return briefingRequest;
    const headlineEl = $("sitrepHeadline");
    const threatEl = $("sitrepThreatLevel");
        const statusEl = $("sitrepLiveStatus");
        const refreshButton = $("refreshBriefingBtn");
        if (refreshButton) refreshButton.disabled = true;
        if (statusEl) statusEl.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> LIVE · syncing telemetry';

        briefingRequest = (async () => {
            try {
                const data = await api(`/api/dashboard/briefing?district=${encodeURIComponent($("sitrepDistrict")?.textContent.trim() || "Ward 7")}`);
                if (!data?.briefing || !data.metrics) throw new Error("Live briefing data is incomplete.");

        const briefing = data.briefing;
        const metrics = data.metrics || {};

        if (headlineEl) headlineEl.textContent = cleanBriefingText(briefing.headline) || "Situation Report Active";
        if (threatEl) {
            const threat = (briefing.threatLevel || "MONITOR").toLowerCase();
            threatEl.className = `threat-badge ${threat}`;
            threatEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${escapeHTML(briefing.threatLevel || "MONITOR")}`;
        }

        if ($("sP1Count")) $("sP1Count").textContent = metrics.p1Count ?? 0;
        if ($("sP2Count")) $("sP2Count").textContent = metrics.p2Count ?? 0;
        if ($("sRiskCount")) $("sRiskCount").textContent = metrics.totalVictimsAtRisk ?? 0;
        if ($("sInjuredCount")) $("sInjuredCount").textContent = metrics.totalInjured ?? 0;
        if ($("sRescuedCount")) $("sRescuedCount").textContent = metrics.totalRescued ?? 0;
        if ($("sAmbulanceCount")) $("sAmbulanceCount").textContent = metrics.availableAmbulances ?? 0;
        if ($("sBlockedRoadsCount")) $("sBlockedRoadsCount").textContent = metrics.blockedRoadsCount ?? 0;

        if ($("sitrepSummaryText")) $("sitrepSummaryText").textContent = cleanBriefingText(briefing.situationSummary) || "Telemetry aggregated.";
        if ($("sitrepRouteText")) $("sitrepRouteText").textContent = cleanBriefingText(briefing.routeAdvisory) || "All primary evacuation routes passable.";
        if ($("sitrepCasualtyText")) $("sitrepCasualtyText").textContent = cleanBriefingText(briefing.casualtySitRep) || "Triage monitoring ongoing.";

        const directivesList = $("sitrepDirectivesList");
        if (directivesList && Array.isArray(briefing.tacticalDirectives)) {
            directivesList.innerHTML = briefing.tacticalDirectives.map((d) => `<li>${escapeHTML(cleanBriefingText(d))}</li>`).join("");
        }
                if (statusEl) statusEl.innerHTML = `<i class="fa-solid fa-circle"></i> LIVE · updated ${new Date(data.timestamp || Date.now()).toLocaleTimeString()}`;
            } catch (error) {
        console.warn("Failed to load AI briefing:", error);
                if (statusEl) statusEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> LIVE · telemetry unavailable';
                if (headlineEl) headlineEl.textContent = "District SitRep unavailable — retrying automatically";
                if ($("sitrepSummaryText")) $("sitrepSummaryText").textContent = error.message;
            } finally {
                if (refreshButton) refreshButton.disabled = false;
                briefingRequest = null;
            }
        })();
        return briefingRequest;
}

// ============================================================
// PHASE 4: WARD 7 FLASH FLOOD SCENARIO SEEDER
// ============================================================

async function seedScenario() {
    const btn = $("seedScenarioBtn");
    if (btn) btn.disabled = true;
    showToast("Deploying Ward 7 Flash Flood Hackathon Scenario...", "info");
    try {
        const result = await api("/api/dashboard/seed-ward7", { method: "POST" });
        const stats = result.stats || {};
        showToast(`Ward 7 Scenario Seeded: ${stats.reportsCount} citizen reports, ${stats.incidentsCount} canonical incidents, ${stats.resourcesCount} fleet units!`, "success");
        await Promise.all([loadBriefing(), loadCanonicalIncidents(), loadDashboard()]);
    } catch (error) {
        console.error("Failed to seed Ward 7 scenario:", error);
        showToast(`Failed to seed scenario: ${error.message}`, "error");
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ============================================================
// PHASE 4: CANONICAL INCIDENT QUEUE (P1–P4)
// ============================================================

async function loadCanonicalIncidents() {
    const rows = $("canonicalRows");
    if (!rows) return;

    const query = new URLSearchParams({
        priority: $("canonicalPriorityFilter")?.value || "",
        status: $("canonicalStatusFilter")?.value || "",
        q: $("canonicalSearchInput")?.value.trim() || "",
        limit: "50"
    });

    try {
        const data = await api(`/api/incidents?${query}`);
        const incidents = data.incidents || [];

        if ($("canonicalCountBadge")) {
            $("canonicalCountBadge").textContent = `${incidents.length} Active`;
        }

        if (!incidents.length) {
            rows.innerHTML = `<tr><td colspan="5" class="empty">No canonical incidents match the selected filters.</td></tr>`;
            return;
        }

        rows.innerHTML = incidents.map((inc) => {
            const p = String(inc.priority || "P3").toUpperCase();
            const pClass = p.toLowerCase();
            const status = String(inc.status || "REPORTED");
            const statusClass = status.toLowerCase();
            const ai = inc.aiAnalysis || {};
            const urgencySignals = (ai.urgencySignals || []).slice(0, 3);
            const scoreVal = inc.priorityScore?.totalScore != null ? inc.priorityScore.totalScore : "—";
            const canWrite = ["admin", "super_admin", "government_officer", "rescue_coordinator"].includes(currentRole) || localAdminMode;

            return `
            <tr>
              <td>
                <div class="inc-title-line">
                  <span class="inc-id-badge">${escapeHTML(inc.incidentId)}</span>
                  <span class="inc-public-id">${escapeHTML(inc.publicId || "")}</span>
                  <strong>${escapeHTML(inc.title)}</strong>
                </div>
                <div class="inc-desc">${escapeHTML(inc.description || "")}</div>
                ${urgencySignals.length ? `<div class="inc-signals">${urgencySignals.map(s => `<span class="signal-chip"><i class="fa-solid fa-tag"></i> ${escapeHTML(s)}</span>`).join("")}</div>` : ""}
              </td>
              <td>
                <span class="pill ${pClass}">${p}</span>
                <span class="priority-score-tag">Score: <strong>${scoreVal}</strong>/100</span>
                <small style="margin-top:4px;display:block;">
                  Risk: <strong>${ai.peopleAtRisk || 0}</strong> · Injured: <strong>${ai.injuredPeople || 0}</strong>
                </small>
              </td>
              <td>
                <strong>${escapeHTML(inc.location?.text || "Sector Zone")}</strong>
                <small>${escapeHTML(inc.location?.ward || "Ward 7")} ${inc.location?.latitude ? `· [${inc.location.latitude.toFixed(3)}, ${inc.location.longitude.toFixed(3)}]` : ""}</small>
                ${(ai.hazards || []).length ? `<small style="color:#a85324;"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHTML(ai.hazards.slice(0, 2).join(", "))}</small>` : ""}
              </td>
              <td>
                <span class="pill ${statusClass}">${escapeHTML(status.replace(/_/g, " "))}</span>
                ${inc.verification?.verified ? `<small style="color:#1b7450;"><i class="fa-solid fa-check-double"></i> Verified by ${escapeHTML(inc.verification.verifiedBy || "Officer")}</small>` : `<small style="color:#b27d0a;">Awaiting Verification</small>`}
                ${inc.sourceReportIds?.length > 1 ? `<small style="color:#1a667d;"><i class="fa-solid fa-layer-group"></i> ${inc.sourceReportIds.length} merged reports</small>` : ""}
              </td>
              <td>
                <div class="tactical-actions-group">
                  ${status === "NEEDS_VERIFICATION" && canWrite ? `
                    <button class="btn-action btn-verify" data-inc-id="${escapeHTML(inc.incidentId)}" title="Verify Incident Priority"><i class="fa-solid fa-check"></i> Verify</button>
                    <button class="btn-action btn-reject" data-inc-id="${escapeHTML(inc.incidentId)}" title="Reject Incident"><i class="fa-solid fa-xmark"></i> Reject</button>
                  ` : ""}
                  <button class="btn-action btn-recommend" data-inc-id="${escapeHTML(inc.incidentId)}" data-inc-title="${escapeHTML(inc.title)}" title="Find Top-3 Recommended Fleet"><i class="fa-solid fa-truck-fast"></i> Top 3 Fleet</button>
                  <button class="btn-action btn-duplicates" data-inc-id="${escapeHTML(inc.incidentId)}" data-inc-title="${escapeHTML(inc.title)}" title="Check duplicate reports"><i class="fa-solid fa-object-group"></i> Merge Check</button>
                </div>
              </td>
            </tr>
            `;
        }).join("");

        // Attach action handlers
        rows.querySelectorAll(".btn-verify").forEach((btn) => {
            btn.addEventListener("click", () => verifyIncident(btn.dataset.incId));
        });
        rows.querySelectorAll(".btn-reject").forEach((btn) => {
            btn.addEventListener("click", () => rejectIncident(btn.dataset.incId));
        });
        rows.querySelectorAll(".btn-recommend").forEach((btn) => {
            btn.addEventListener("click", () => openResourceModal(btn.dataset.incId, btn.dataset.incTitle));
        });
        rows.querySelectorAll(".btn-duplicates").forEach((btn) => {
            btn.addEventListener("click", () => openDuplicateModal(btn.dataset.incId, btn.dataset.incTitle));
        });
    } catch (error) {
        console.error("Failed to load canonical incidents:", error);
        rows.innerHTML = `<tr><td colspan="5" class="empty">Failed to load canonical incidents: ${escapeHTML(error.message)}</td></tr>`;
    }
}

async function verifyIncident(incidentId) {
    if (!incidentId) return;
    try {
        await api(`/api/incidents/${encodeURIComponent(incidentId)}/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ overrideReason: null })
        });
        showToast(`Incident ${incidentId} verified successfully!`, "success");
        await Promise.all([loadCanonicalIncidents(), loadBriefing()]);
    } catch (error) {
        showToast(`Verification failed: ${error.message}`, "error");
    }
}

async function rejectIncident(incidentId) {
    if (!incidentId) return;
    const reason = window.prompt(`Enter rejection reason for incident ${incidentId}:`, "Duplicate or false alert");
    if (!reason) return;
    try {
        await api(`/api/incidents/${encodeURIComponent(incidentId)}/reject`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason })
        });
        showToast(`Incident ${incidentId} rejected.`, "info");
        await Promise.all([loadCanonicalIncidents(), loadBriefing()]);
    } catch (error) {
        showToast(`Rejection failed: ${error.message}`, "error");
    }
}

// ============================================================
// PHASE 4: TOP-3 RESOURCE RECOMMENDATION & DISPATCH MODAL
// ============================================================

async function openResourceModal(incidentId, incidentTitle) {
    const modal = $("resourceModal");
    const body = $("resourceModalBody");
    const titleEl = $("resModalTitle");
    if (!modal || !body) return;

    if (titleEl) titleEl.textContent = `Dispatch Fleet to: ${incidentTitle || incidentId}`;
    body.innerHTML = `<div class="empty"><i class="fa-solid fa-spinner fa-spin"></i> Calculating multi-criteria fleet recommendations (capability, proximity, route risk)...</div>`;
    modal.style.display = "flex";

    try {
        const data = await api(`/api/resources/recommend/${encodeURIComponent(incidentId)}`);
        const recs = data.recommendations || [];

        if (!recs.length) {
            body.innerHTML = `<div class="empty">No available fleet units found matching this incident category.</div>`;
            return;
        }

        body.innerHTML = `
        <div class="rec-cards-list">
          ${recs.map((rec, index) => {
            const riskColor = rec.routeRisk === "HIGH" ? "#c91d39" : rec.routeRisk === "MEDIUM" ? "#a86400" : "#18734e";
            return `
            <div class="rec-card">
              <div class="rec-score-box">
                <span class="rec-score-num">${Math.min(99, Math.max(1, rec.score || 80))}%</span>
                <span class="rec-score-lbl">Rank #${index + 1}</span>
              </div>
              <div class="rec-info">
                <h4>${escapeHTML(rec.name)} <small style="color:#567580;">(${escapeHTML(rec.type)})</small></h4>
                <div class="rec-meta">
                  <span><i class="fa-solid fa-clock"></i> ETA: <strong>${rec.etaMinutes} min</strong></span>
                  <span><i class="fa-solid fa-users"></i> Capacity: <strong>${rec.capacity} patients</strong></span>
                  <span><i class="fa-solid fa-shield-halved" style="color:${riskColor};"></i> Route Risk: <strong style="color:${riskColor};">${escapeHTML(rec.routeRisk)}</strong></span>
                </div>
                <div class="rec-reasons">${(rec.reasons || []).map(r => `• ${escapeHTML(r)}`).join("<br>")}</div>
              </div>
              <div>
                <button class="rec-dispatch-btn" data-res-id="${escapeHTML(rec.resourceId)}" data-res-name="${escapeHTML(rec.name)}">
                  <i class="fa-solid fa-paper-plane"></i> Dispatch Now
                </button>
              </div>
            </div>
            `;
          }).join("")}
        </div>
        `;

        body.querySelectorAll(".rec-dispatch-btn").forEach((btn) => {
            btn.addEventListener("click", async () => {
                btn.disabled = true;
                btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Dispatching...`;
                try {
                    await api("/api/missions", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            incidentId,
                            resourceId: btn.dataset.resId,
                            assignedTo: "EOC Emergency Dispatch Team",
                            notes: `Dispatched from Command Room recommendation rank.`
                        })
                    });
                    showToast(`Mission active: ${btn.dataset.resName} dispatched to incident!`, "success");
                    modal.style.display = "none";
                    await Promise.all([loadCanonicalIncidents(), loadBriefing(), loadDashboard()]);
                } catch (error) {
                    showToast(`Dispatch failed: ${error.message}`, "error");
                    btn.disabled = false;
                    btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Dispatch Now`;
                }
            });
        });
    } catch (error) {
        body.innerHTML = `<div class="empty">Failed to load recommendations: ${escapeHTML(error.message)}</div>`;
    }
}

// ============================================================
// PHASE 4: DUPLICATE DETECTION & MERGE MODAL
// ============================================================

async function openDuplicateModal(incidentId, incidentTitle) {
    const modal = $("duplicateModal");
    const body = $("duplicateModalBody");
    const titleEl = $("dupModalTitle");
    if (!modal || !body) return;

    if (titleEl) titleEl.textContent = `Duplicate Candidate Check: ${incidentTitle || incidentId}`;
    body.innerHTML = `<div class="empty"><i class="fa-solid fa-spinner fa-spin"></i> Scanning nearby reports (< 300m, < 30min, high text similarity)...</div>`;
    modal.style.display = "flex";

    try {
        const data = await api(`/api/incidents/${encodeURIComponent(incidentId)}/duplicate-candidates`);
        const candidates = data.candidates || [];

        if (!candidates.length) {
            body.innerHTML = `
            <div style="text-align:center;padding:24px;">
              <i class="fa-solid fa-circle-check" style="font-size:32px;color:#18734e;margin-bottom:10px;"></i>
              <h4>No Duplicates Detected</h4>
              <p style="color:#627c85;font-size:13px;">No other open incidents found within 300m and 30 minutes of this location.</p>
            </div>`;
            return;
        }

        body.innerHTML = `
        <div class="dup-cards-list">
          <p style="font-size:12px;color:#5a7680;margin:0 0 10px;">
            The following candidate incidents corroborate this event. Merging will preserve all citizen reports into a single canonical incident.
          </p>
          ${candidates.map((cand) => `
            <div class="dup-card">
              <div>
                <strong>${escapeHTML(cand.title || cand.incidentId)}</strong>
                <div class="dup-meta">
                  <span><i class="fa-solid fa-location-crosshairs"></i> Distance: <strong>${Math.round(cand.distanceMeters || 0)}m</strong></span>
                  <span><i class="fa-solid fa-clock-rotate-left"></i> Time Delta: <strong>${Math.round((cand.temporalDeltaMs || 0) / 60000)} min</strong></span>
                  <span class="dup-score-badge">Similarity: ${Math.round((cand.similarityScore || 0) * 100)}%</span>
                </div>
                <small style="color:#6d848d;">${escapeHTML(cand.description || "")}</small>
              </div>
              <button class="btn-merge-action" data-dup-id="${escapeHTML(cand.incidentId)}">
                <i class="fa-solid fa-object-group"></i> Merge into Primary
              </button>
            </div>
          `).join("")}
        </div>
        `;

        body.querySelectorAll(".btn-merge-action").forEach((btn) => {
            btn.addEventListener("click", async () => {
                btn.disabled = true;
                btn.textContent = "Merging...";
                try {
                    await api("/api/incidents/merge", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            primaryIncidentId: incidentId,
                            duplicateIncidentIds: [btn.dataset.dupId],
                            mergeReason: "Corroborated duplicate hazard report"
                        })
                    });
                    showToast(`Incidents merged successfully!`, "success");
                    modal.style.display = "none";
                    await Promise.all([loadCanonicalIncidents(), loadBriefing(), loadDashboard()]);
                } catch (error) {
                    showToast(`Merge failed: ${error.message}`, "error");
                    btn.disabled = false;
                    btn.textContent = "Merge into Primary";
                }
            });
        });
    } catch (error) {
        body.innerHTML = `<div class="empty">Failed to check duplicates: ${escapeHTML(error.message)}</div>`;
    }
}

// Close modals
$("closeResourceModal")?.addEventListener("click", () => { $("resourceModal").style.display = "none"; });
$("closeDuplicateModal")?.addEventListener("click", () => { $("duplicateModal").style.display = "none"; });
window.addEventListener("click", (e) => {
    if (e.target === $("resourceModal")) $("resourceModal").style.display = "none";
    if (e.target === $("duplicateModal")) $("duplicateModal").style.display = "none";
});

// ============================================================
// LEGACY REPORT DASHBOARD & MAP LOGIC
// ============================================================

function renderMetrics(stats) {
    const metrics = [
        ["Total reports", stats.totalReports, "All submitted cases"],
        ["Active emergencies", stats.activeEmergencies, "Pending response"],
        ["Critical cases", stats.criticalCases, "Severe or critical"],
        ["People needing help", stats.peopleNeedingHelp, "Rescue signals"],
        ["Missing persons", stats.missingPersons, "Open records"],
        ["Trapped / stranded", stats.trappedPeople, "Urgent assistance"],
        ["Resource requests", stats.resourceRequests, "Supply signals"],
        ["Damaged assets", stats.damagedAssets, "Houses & infrastructure"],
        ["Resolved cases", stats.resolvedCases, "Closed or resolved"],
        ["Support requests", stats.supportTotal, "All support submissions"],
        ["Financial donations", stats.financialDonations, "Support offers"],
        ["Resource donations", stats.resourceDonations, "Supply offers"],
        ["Civic volunteers", stats.civicVolunteers, "Volunteer registrations"],
        ["Support pending", stats.supportPending, "Awaiting review"],
        ["Support under review", stats.supportUnderReview, "Admin action"],
        ["Support completed", stats.supportCompleted, "Closed support requests"],
        ["SOS alerts", stats.sosAlertsTotal, "All emergency alerts"],
        ["Active SOS", stats.activeSosAlerts, "Needs immediate attention"],
        ["SOS notification rate", `${Number(stats.sosNotificationRate) || 0}%`, "Authority email delivery"],
        ["Avg SOS response", `${Number(stats.averageSosResponseSeconds) || 0}s`, "Alert to notification"]
    ];
    $("metricGrid").innerHTML = metrics.map(([label, value, note]) => `<article class="metric"><span>${escapeHTML(label)}</span><strong>${typeof value === "number" ? (Number.isFinite(value) ? value : 0) : escapeHTML(value)}</strong><small>${escapeHTML(note)}</small></article>`).join("");
}

function renderAlerts(alerts) {
    $("alertList").innerHTML = alerts.length ? alerts.map((alert) => {
        const isSos = String(alert.id || "").startsWith("SOS-");
        return `<div class="alert-item${isSos ? " sos-alert" : ""}"><strong>${isSos ? '<i class="fa-solid fa-bell"></i> ' : ""}${escapeHTML(alert.title)}</strong><span>${escapeHTML(alert.location)} · ${escapeHTML(alert.severity)} · ${escapeHTML(alert.status)}</span></div>`;
    }).join("") : `<div class="empty">No unresolved critical alerts.</div>`;
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
        const color = signal.type === "critical" ? "#B91C1C" : signal.type === "emergency" ? "#D97706" : signal.type === "needs-help" ? "#1B3A6B" : signal.type === "missing-person" ? "#7c3aed" : "#15803D";
        const scale = signal.type === "critical" ? 1.25 : signal.type === "emergency" ? 1.15 : 1.0;
        const pinIcon = L.divIcon({
            className: "dimensional-pin-wrap",
            html: `<div class="dimensional-map-pin" style="transform: scale(${scale});">
                     <div class="pin-head" style="background-color: ${color};"></div>
                     <div class="pin-stem"></div>
                   </div>`,
            iconSize: [22, 28],
            iconAnchor: [11, 26],
            popupAnchor: [0, -24]
        });
        L.marker(point, { icon: pinIcon }).addTo(locationMap).bindPopup(`<strong>${escapeHTML(signal.label)}</strong><br>${escapeHTML(signal.title)}<br><small>${escapeHTML(signal.location)} · ${escapeHTML(signal.status)}</small>`);
    });
    if (bounds.length === 1) locationMap.setView(bounds[0], 13);
    if (bounds.length > 1) locationMap.fitBounds(bounds, { padding: [24, 24] });
    setTimeout(() => locationMap.invalidateSize(), 50);
}

function renderTypes(reports) {
    const select = $("typeFilter");
    if (!select) return;
    const values = [...new Set(reports.map((report) => report.analysis?.category).filter(Boolean))].sort();
    select.innerHTML = `<option value="">All case types</option>${values.map((value) => `<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`).join("")}`;
}

async function loadDashboard() {
    const params = new URLSearchParams({ page: "1", pageSize: "100", q: $("searchInput")?.value.trim() || "", severity: $("severityFilter")?.value || "", status: $("statusFilter")?.value || "", type: $("typeFilter")?.value || "" });
    try {
        const data = await api(`/api/admin/overview?${params}`);
        currentRole = data.user?.role || "admin";
        if ($("officialName")) $("officialName").textContent = data.user?.name || data.user?.email || "Government official";
        if ($("roleName")) $("roleName").textContent = String(data.user?.role || "admin").replaceAll("_", " ");
        renderMetrics(data.stats);
        renderAlerts(data.alerts);
        renderMissing(data.missingPersons);
        renderChart(data.reports);
        renderMap(data.locationSignals || []);
        renderTypes(data.reports);
        await loadSupportRequests();
        if ($("paginationLabel")) $("paginationLabel").textContent = `${data.pagination.total} cases · page ${data.pagination.page}`;
        if ($("caseRows")) {
            $("caseRows").innerHTML = data.reports.length ? data.reports.map((report) => {
                const severity = String(report.analysis?.severity || report.priority || "medium").toLowerCase();
                const canWrite = ["admin", "super_admin", "government_officer", "rescue_coordinator"].includes(currentRole) || localAdminMode;
                return `<tr><td><strong>${escapeHTML(report.reportId)}</strong><small>${escapeHTML(report.analysis?.problem || report.description || "Civic report")}</small></td><td>${escapeHTML(report.location || "Unavailable")}</td><td><span class="pill ${severity}">${escapeHTML(report.analysis?.severity || report.priority || "Medium")}</span></td><td>${escapeHTML(report.status || "Submitted")}</td><td>${canWrite ? `<div class="case-action-group"><form class="status-form" data-id="${escapeHTML(report.reportId)}"><select aria-label="Update ${escapeHTML(report.reportId)}"><option>Submitted</option><option>Verified</option><option>Assigned</option><option>In Progress</option><option>Resolved</option></select><button class="case-actions" type="submit">Save</button></form><button class="case-delete" type="button" data-id="${escapeHTML(report.reportId)}">Delete</button></div>` : `<small>Read only</small>`}</td></tr>`;
            }).join("") : `<tr><td colspan="5" class="empty">No cases match the selected filters.</td></tr>`;
            $("caseRows").querySelectorAll(".status-form").forEach((form) => form.addEventListener("submit", updateStatus));
            $("caseRows").querySelectorAll(".case-delete").forEach((button) => button.addEventListener("click", deleteReport));
        }
    } catch (error) {
        if ($("criticalAlert")) $("criticalAlert").innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i><div><strong>Dashboard unavailable</strong><span>${escapeHTML(error.message)}</span></div>`;
    }
}

async function loadSupportRequests() {
    const params = new URLSearchParams({ q: $("supportSearchInput")?.value.trim() || "", category: $("supportCategoryFilter")?.value || "", status: $("supportStatusFilter")?.value || "" });
    try {
        const data = await api(`/api/admin/support-requests?${params}`);
        const rows = $("supportRows");
        if (!rows) return;
        const requests = data.requests || [];
        if ($("supportNewBadge")) $("supportNewBadge").textContent = `${requests.filter((item) => item.status === "pending").length} pending`;
        rows.innerHTML = requests.length ? requests.map((item) => {
            const info = item.personalInfo || {};
            const category = item.category === "financial_donation" ? "Financial" : item.category === "resource_donation" ? "Resources" : "Volunteer";
            return `<tr><td><strong>${escapeHTML(item.requestId)}</strong><small>${escapeHTML(info.fullName || "Unnamed")}</small></td><td>${escapeHTML(info.mobile || "Unavailable")}<small>${escapeHTML(info.email || "")}</small></td><td>${category}</td><td>${escapeHTML([info.city, info.district, info.state].filter(Boolean).join(", ") || info.address || "Unavailable")}</td><td>${escapeHTML(item.status)}</td><td><form class="support-status-form" data-support-id="${escapeHTML(item.requestId)}"><select aria-label="Update ${escapeHTML(item.requestId)}"><option value="pending">Pending</option><option value="under_review">Under review</option><option value="approved">Approved</option><option value="contacted">Contacted</option><option value="completed">Completed</option><option value="rejected">Rejected</option></select><button type="submit">Save</button></form></td></tr>`;
        }).join("") : `<tr><td colspan="6" class="empty">No support requests match the selected filters.</td></tr>`;
        rows.querySelectorAll(".support-status-form").forEach((form) => {
            form.querySelector("select").value = requests.find((item) => item.requestId === form.dataset.supportId)?.status || "pending";
            form.addEventListener("submit", async (event) => {
                event.preventDefault();
                const button = form.querySelector("button");
                button.disabled = true;
                try {
                    await api(`/api/admin/support-requests/${encodeURIComponent(form.dataset.supportId)}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status: form.querySelector("select").value, adminNotes: `Updated by ${currentUser?.email || "government administrator"}` })
                    });
                    await loadSupportRequests();
                } catch (error) {
                    alert(error.message);
                } finally {
                    button.disabled = false;
                }
            });
        });
    } catch (error) {
        if ($("supportRows")) $("supportRows").innerHTML = `<tr><td colspan="6" class="empty">Support requests unavailable: ${escapeHTML(error.message)}</td></tr>`;
    }
}

async function updateStatus(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button");
    button.disabled = true;
    try {
        await api(`/api/reports/${encodeURIComponent(form.dataset.id)}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: form.querySelector("select").value, adminNote: `Updated by ${currentUser?.email || "local administrator"}` })
        });
        await loadDashboard();
    } catch (error) {
        alert(error.message);
        button.disabled = false;
    }
}

async function deleteReport(event) {
    const button = event.currentTarget;
    const reportId = button.dataset.id;
    if (!reportId) return;
    const confirmed = window.confirm(`Delete report ${reportId}? This action cannot be undone.`);
    if (!confirmed) return;
    button.disabled = true;
    try {
        await api(`/api/reports/${encodeURIComponent(reportId)}`, { method: "DELETE" });
        await loadDashboard();
    } catch (error) {
        alert(error.message);
        button.disabled = false;
    }
}

async function loadFleet() {
    const rows = $("fleetRows");
    if (!rows) return;
    try {
        const data = await api("/api/fleet/vehicles");
        const vehicles = data.vehicles || [];
        renderFleetMap(vehicles);
        rows.innerHTML = vehicles.length ? vehicles.map((vehicle) => {
            const age = vehicle.lastUpdated ? Math.max(0, Math.round((Date.now() - vehicle.lastUpdated) / 1000)) : null;
            const stale = age === null || age > 90;
            const status = stale && vehicle.trackingActive ? "OFFLINE" : vehicle.status || "AVAILABLE";
            return `<tr><td><strong>${escapeHTML(vehicle.vehicleNumber || vehicle.id)}</strong><small>${escapeHTML(vehicle.type || "Emergency vehicle")}</small></td><td>${escapeHTML(vehicle.agency || "Unavailable")}<small>${escapeHTML(vehicle.driverName || "")}</small></td><td>${vehicle.latitude != null ? `${Number(vehicle.latitude).toFixed(5)}, ${Number(vehicle.longitude).toFixed(5)}` : "Location unavailable"}<small>${age === null ? "No GPS update" : `Updated ${age}s ago`}</small></td><td><span class="pill ${status.toLowerCase()}">${escapeHTML(status.replaceAll("_", " "))}</span></td><td>${escapeHTML(vehicle.assignedIncidentId || "Unassigned")}</td><td><div class="case-action-group"><select data-fleet-status="${escapeHTML(vehicle.id)}" aria-label="Update vehicle status">${["AVAILABLE", "ASSIGNED", "EN_ROUTE", "ARRIVED", "RETURNING", "OFFLINE"].map((option) => `<option ${option === status ? "selected" : ""}>${option}</option>`).join("")}</select><input data-fleet-assignment="${escapeHTML(vehicle.id)}" value="${escapeHTML(vehicle.assignedIncidentId || "")}" placeholder="Incident/SOS ID" aria-label="Assignment"><button class="case-actions" data-fleet-save="${escapeHTML(vehicle.id)}" type="button">Save</button></div></td></tr>`;
        }).join("") : `<tr><td colspan="6" class="empty">No emergency vehicles registered.</td></tr>`;
        rows.querySelectorAll("[data-fleet-save]").forEach((button) => button.addEventListener("click", async () => {
            const id = button.dataset.fleetSave;
            button.disabled = true;
            try {
                await api(`/api/fleet/vehicles/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: rows.querySelector(`[data-fleet-status="${CSS.escape(id)}"]`).value, assignedIncidentId: rows.querySelector(`[data-fleet-assignment="${CSS.escape(id)}"]`).value.trim() || null }) });
                showToast("Fleet vehicle updated.", "success");
                await loadFleet();
            } catch (error) { showToast(error.message, "error"); } finally { button.disabled = false; }
        }));
    } catch (error) { rows.innerHTML = `<tr><td colspan="6" class="empty">Fleet unavailable: ${escapeHTML(error.message)}</td></tr>`; }
}

function renderFleetMap(vehicles) {
    const mapElement = $("fleetMap");
    if (!mapElement || typeof L === "undefined") return;
    if (!fleetMap) {
        fleetMap = L.map(mapElement, { scrollWheelZoom: true }).setView([22.5, 88.3], 5);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap contributors", maxZoom: 19 }).addTo(fleetMap);
    }
    fleetMarkers.forEach((marker) => marker.remove());
    fleetMarkers.clear();
    const bounds = [];
    vehicles.filter((vehicle) => Number.isFinite(Number(vehicle.latitude)) && Number.isFinite(Number(vehicle.longitude))).forEach((vehicle) => {
        const point = [Number(vehicle.latitude), Number(vehicle.longitude)];
        bounds.push(point);
        const marker = L.marker(point).addTo(fleetMap).bindPopup(`<strong>${escapeHTML(vehicle.vehicleNumber || vehicle.id)}</strong><br>${escapeHTML(vehicle.type || "Emergency vehicle")} · ${escapeHTML(vehicle.status || "OFFLINE")}<br><small>${escapeHTML(vehicle.assignedIncidentId || "Unassigned")} · Last updated ${vehicle.lastUpdated ? new Date(vehicle.lastUpdated).toLocaleTimeString() : "unavailable"}</small>`);
        fleetMarkers.set(vehicle.id, marker);
    });
    if (bounds.length > 1) fleetMap.fitBounds(bounds, { padding: [24, 24] });
    else if (bounds.length === 1) fleetMap.setView(bounds[0], 13);
    setTimeout(() => fleetMap.invalidateSize(), 50);
}

$("fleetVehicleForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    try { await api("/api/fleet/vehicles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); showToast("Emergency vehicle registered.", "success"); form.reset(); await loadFleet(); } catch (error) { showToast(error.message, "error"); }
});
$("fleetRefreshButton")?.addEventListener("click", loadFleet);

// ============================================================
// INITIALIZATION
// ============================================================

async function initialize() {
    await Promise.all([
        loadBriefing(),
        loadCanonicalIncidents(),
        loadDashboard(),
        loadFleet()
    ]);
    clearInterval(briefingRefreshTimer);
    briefingRefreshTimer = setInterval(loadBriefing, 30000);
}

onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (!user && !localAdminMode && !sihDemoMode) {
        window.location.replace("admin-login.html");
        return;
    }
    try {
        await api("/api/admin/session");
        await initialize();
    } catch {
        if (!localAdminMode && !sihDemoMode) {
            await signOut(auth);
            sessionStorage.removeItem("governmentSession");
            window.location.replace("admin-login.html");
        } else {
            await initialize();
        }
    }
});

$("logoutButton")?.addEventListener("click", async () => {
    await signOut(auth);
    sessionStorage.removeItem("governmentSession");
    window.location.replace("admin-login.html");
});

$("refreshButton")?.addEventListener("click", () => {
    loadBriefing();
    loadCanonicalIncidents();
    loadDashboard();
});

$("refreshBriefingBtn")?.addEventListener("click", loadBriefing);
$("seedScenarioBtn")?.addEventListener("click", seedScenario);

["searchInput", "severityFilter", "statusFilter", "typeFilter"].forEach((id) => $(id)?.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(loadDashboard, 250);
}));

["canonicalSearchInput", "canonicalPriorityFilter", "canonicalStatusFilter"].forEach((id) => $(id)?.addEventListener("input", () => {
    clearTimeout(canonicalDebounceTimer);
    canonicalDebounceTimer = setTimeout(loadCanonicalIncidents, 250);
}));

["supportSearchInput", "supportCategoryFilter", "supportStatusFilter"].forEach((id) => $(id)?.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(loadSupportRequests, 250);
}));

window.setInterval(() => {
    if (currentUser || localAdminMode) {
        loadBriefing();
        loadCanonicalIncidents();
        loadSupportRequests();
    }
}, 30000);
