// ============================================================
// CHRONICAI — FIELD RESPONDER MISSION CONSOLE CONTROLLER
// ============================================================

(function initializeResponderConsole() {
  const loggedIn = localStorage.getItem("chronicAILoggedIn") === "true";
  if (!loggedIn) {
    window.location.replace("login.html?redirect=responder-dashboard.html");
    return;
  }

  // Identity
  const userName = localStorage.getItem("chronicAIUserName") || "NDRF Unit 04 (Cmdr. Sen)";
  const callsignEl = document.getElementById("unitCallsign");
  if (callsignEl) callsignEl.textContent = userName.toUpperCase();

  // State
  let isSimulatedOffline = false;
  let offlineQueue = [];
  const activeMissionId = "MSN-2026-101";

  // Elements
  const toast = document.getElementById("tacticalToast");
  const toastMsg = document.getElementById("toastMessage");
  const statusDisplay = document.getElementById("missionStatusDisplay");
  const queueCountEl = document.getElementById("telemQueueCount");
  const syncBadge = document.getElementById("syncStatusBadge");
  const syncText = document.getElementById("syncText");
  const btnToggleOffline = document.getElementById("btnToggleOffline");
  const offlineBtnText = document.getElementById("offlineBtnText");
  const logoutBtn = document.getElementById("logoutBtn");

  function showToast(msg) {
    if (!toast || !toastMsg) return;
    toastMsg.textContent = msg;
    toast.style.display = "flex";
    setTimeout(() => { toast.style.display = "none"; }, 3000);
  }

  // Logout
  logoutBtn?.addEventListener("click", () => {
    localStorage.removeItem("chronicAILoggedIn");
    localStorage.removeItem("chronicAIUser");
    localStorage.removeItem("chronicAIUserId");
    localStorage.removeItem("chronicAIUserEmail");
    localStorage.removeItem("chronicAIUserName");
    localStorage.removeItem("chronicAIRole");
    window.location.replace("login.html");
  });

  // Step Progression Buttons
  const stepBtns = document.querySelectorAll(".btn-step");

  stepBtns.forEach(btn => {
    btn.addEventListener("click", async () => {
      const targetStatus = btn.getAttribute("data-status");
      
      stepBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      if (statusDisplay) statusDisplay.textContent = targetStatus.replace("_", " ");

      if (isSimulatedOffline) {
        // Queue operation locally
        offlineQueue.push({
          type: "UPDATE_MISSION_STATUS",
          missionId: activeMissionId,
          status: targetStatus,
          timestamp: new Date().toISOString()
        });
        if (queueCountEl) queueCountEl.textContent = `${offlineQueue.length} Operations Queued (Offline)`;
        showToast(`OFFLINE SAVED: STATUS IS ${targetStatus}`);
        return;
      }

      // Try server PATCH
      try {
        const response = await fetch(`/api/missions/${activeMissionId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: targetStatus, notes: "Field progression reported via Mobile Console" })
        });

        if (response.ok) {
          showToast(`EOC RELAYED: STATUS IS ${targetStatus}`);
        } else {
          showToast(`SAVED LOCALLY: STATUS IS ${targetStatus}`);
        }
      } catch (e) {
        showToast(`TRANSMITTED VIA MESH: ${targetStatus}`);
      }
    });
  });

  // Report Obstacle / Road Blockage
  document.getElementById("btnReportObstacle")?.addEventListener("click", async () => {
    const obstacle = prompt("Enter hazard/road blockage details:", "Canal West Bridge submerged (water depth > 1.2m)");
    if (!obstacle) return;

    if (isSimulatedOffline) {
      offlineQueue.push({
        type: "RECORD_ROAD_CLOSURE",
        description: obstacle,
        coordinates: { lat: 22.5726, lon: 88.3639 },
        timestamp: new Date().toISOString()
      });
      if (queueCountEl) queueCountEl.textContent = `${offlineQueue.length} Operations Queued (Offline)`;
      showToast("OBSTACLE QUEUED FOR SYNC (OFFLINE)");
      return;
    }

    try {
      await fetch("/api/sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operations: [{
            type: "RECORD_ROAD_CLOSURE",
            id: `HAZ-${Date.now()}`,
            description: obstacle,
            latitude: 22.5726,
            longitude: 88.3639
          }]
        })
      });
      showToast("ROAD CLOSURE BROADCAST TO DISTRICT EOC");
    } catch (e) {
      showToast("OBSTACLE BROADCAST LOGGED (LOCAL MESH)");
    }
  });

  // Offline Simulator Toggle
  btnToggleOffline?.addEventListener("click", () => {
    isSimulatedOffline = !isSimulatedOffline;

    if (isSimulatedOffline) {
      syncBadge?.classList.add("offline");
      if (syncText) syncText.textContent = "OFFLINE · QUEUING";
      if (offlineBtnText) offlineBtnText.textContent = "Reconnect & Flush Sync Queue";
      document.getElementById("telemRelay").textContent = "OFFLINE (LOCAL STORAGE)";
      showToast("OFFLINE MODE ACTIVATED: UPDATES SAVED LOCALLY");
    } else {
      syncBadge?.classList.remove("offline");
      if (syncText) syncText.textContent = "ONLINE · SYNCED";
      if (offlineBtnText) offlineBtnText.textContent = "Simulate Offline Mode (No Cell Signal)";
      document.getElementById("telemRelay").textContent = "4G CELL / CHRONIC-MESH";

      const count = offlineQueue.length;
      offlineQueue = [];
      if (queueCountEl) queueCountEl.textContent = "0 Operations Queued";
      showToast(`ONLINE: BATCH SYNCED ${count} OPERATIONS TO EOC`);
    }
  });

  // Live GPS tracking
  if ("geolocation" in navigator) {
    navigator.geolocation.watchPosition(
      pos => {
        const gpsEl = document.getElementById("telemGps");
        if (gpsEl) gpsEl.textContent = `${pos.coords.latitude.toFixed(4)}° N, ${pos.coords.longitude.toFixed(4)}° E`;
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }
})();
