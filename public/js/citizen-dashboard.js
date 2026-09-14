// ============================================================
// CHRONICAI — CITIZEN DASHBOARD CONTROLLER
// ============================================================

(function initializeCitizenDashboard() {
  const loggedIn = localStorage.getItem("chronicAILoggedIn") === "true";
  const role = (localStorage.getItem("chronicAIRole") || "").toLowerCase().trim();
  if (!loggedIn) {
    window.location.replace("login.html?redirect=citizen-dashboard.html");
    return;
  }

  if (role !== "citizen" && role !== "") {
    alert("Access Denied: Please use your designated stakeholder operations portal.");
    if (role === "admin" || role === "officer") {
      window.location.replace("admin-dashboard.html");
    } else if (role === "responder" || role === "field_worker") {
      window.location.replace("responder-dashboard.html");
    }
    return;
  }

  // Populate User Identity
  const userName = localStorage.getItem("chronicAIUserName") || "Ravi Kumar (Citizen)";
  const citizenNameEl = document.getElementById("citizenName");
  const heroCitizenNameEl = document.getElementById("heroCitizenName");
  
  if (citizenNameEl) citizenNameEl.textContent = userName.split(" ")[0];
  if (heroCitizenNameEl) heroCitizenNameEl.textContent = userName;

  // Logout Functionality
  const logoutBtn = document.getElementById("logoutBtn");
  logoutBtn?.addEventListener("click", () => {
    localStorage.removeItem("chronicAILoggedIn");
    localStorage.removeItem("chronicAIUser");
    localStorage.removeItem("chronicAIUserId");
    localStorage.removeItem("chronicAIUserEmail");
    localStorage.removeItem("chronicAIUserName");
    localStorage.removeItem("chronicAIRole");
    sessionStorage.removeItem("governmentSession");
    sessionStorage.removeItem("sihDemoSession");
    window.location.replace("login.html");
  });

  // Filter Tab Logic
  const filterBtns = document.querySelectorAll(".filter-btn");
  const incidentItems = document.querySelectorAll(".incident-item");

  filterBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      filterBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const filter = btn.getAttribute("data-filter");

      incidentItems.forEach(item => {
        const itemStatus = item.getAttribute("data-status");
        if (filter === "all") {
          item.style.display = "grid";
        } else if (filter === "active" && (itemStatus === "active" || itemStatus === "review")) {
          item.style.display = "grid";
        } else if (filter === itemStatus) {
          item.style.display = "grid";
        } else {
          item.style.display = "none";
        }
      });
    });
  });

  // Fetch Live Server Telemetry if backend is available
  async function syncCitizenTelemetry() {
    try {
      const res = await fetch("/api/incidents?limit=5", { headers: { "Accept": "application/json" } });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.incidents && data.incidents.length > 0) {
        const activeCount = data.incidents.filter(i => i.status !== "RESOLVED").length;
        const resolvedCount = data.incidents.filter(i => i.status === "RESOLVED").length;
        const totalCount = data.incidents.length;

        const totalEl = document.getElementById("metricTotalReports");
        const activeEl = document.getElementById("metricActiveReports");
        const resolvedEl = document.getElementById("metricResolved");

        if (totalEl) totalEl.textContent = String(totalCount);
        if (activeEl) activeEl.textContent = String(activeCount);
        if (resolvedEl) resolvedEl.textContent = String(resolvedCount);
      }
    } catch (e) {
      console.log("Citizen Dashboard: Using local simulated incident telemetry.");
    }
  }

  syncCitizenTelemetry();

  // Try GPS location detection if allowed
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      pos => {
        const chip = document.getElementById("locationChip");
        if (chip) {
          chip.innerHTML = `<i class="fa-solid fa-location-crosshairs"></i> <span><strong>GPS:</strong> ${pos.coords.latitude.toFixed(4)}° N, ${pos.coords.longitude.toFixed(4)}° E · Live Accuracy</span>`;
        }
      },
      () => {
        // Fallback default kept
      },
      { timeout: 5000 }
    );
  }
})();
