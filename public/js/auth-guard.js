(function enforceAuthentication() {
    const loggedIn = localStorage.getItem("chronicAILoggedIn") === "true";
    const rawRole = (localStorage.getItem("chronicAIRole") || "").toLowerCase().trim();
    const page = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();

    // Determine normalized role
    let role = "citizen";
    if (rawRole === "admin" || rawRole === "officer") {
        role = "admin";
    } else if (rawRole === "responder" || rawRole === "field_worker") {
        role = "responder";
    } else if (loggedIn) {
        role = "citizen";
    } else {
        role = null;
    }

    const publicPages = new Set([
        "index.html",
        "login.html",
        "register.html",
        "admin-login.html",
        "resource-center.html",
        "missing-persons.html",
        "risk-dashboard.html",
        "support.html"
    ]);

    // 1. Unauthenticated users trying to access protected pages
    if (!loggedIn && !publicPages.has(page)) {
        const destination = `${page}${window.location.search}${window.location.hash}`;
        window.location.replace(`login.html?redirect=${encodeURIComponent(destination)}`);
        return;
    }

    // 2. Strict Role Separation for Stakeholder Dashboards
    if (loggedIn && role) {
        const roleHomes = {
            citizen: "citizen-dashboard.html",
            admin: "admin-dashboard.html",
            responder: "responder-dashboard.html"
        };

        const isCitizenDashboard = page === "citizen-dashboard.html";
        const isAdminDashboard = page === "admin-dashboard.html";
        const isResponderDashboard = page === "responder-dashboard.html";

        let unauthorized = false;
        let unauthorizedMessage = "";

        if (role === "citizen") {
            if (isAdminDashboard || isResponderDashboard || page === "admin-login.html") {
                unauthorized = true;
                unauthorizedMessage = "Access Denied: You are signed in as a Citizen. You cannot access Government EOC Command or Field Mission Console.";
            }
        } else if (role === "responder") {
            if (isAdminDashboard || isCitizenDashboard || page === "admin-login.html") {
                unauthorized = true;
                unauthorizedMessage = "Access Denied: You are signed in as a Field Response Unit. You cannot access the Citizen Portal or EOC Command Center.";
            }
        } else if (role === "admin") {
            if (isCitizenDashboard || isResponderDashboard) {
                unauthorized = true;
                unauthorizedMessage = "Access Restricted: You are signed in as an EOC Officer. Please use your authorized Government Command Center.";
            }
        }

        if (unauthorized) {
            console.warn(`[ChronicAI Auth Guard] Blocked unauthorized access to '${page}' by role '${role}'.`);
            alert(unauthorizedMessage);
            window.location.replace(roleHomes[role] || "index.html");
            return;
        }
    }

    document.documentElement.classList.toggle("authenticated", loggedIn);
})();

