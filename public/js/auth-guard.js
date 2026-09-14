(function enforceAuthentication() {
    const loggedIn = localStorage.getItem("chronicAILoggedIn") === "true";
    const page = window.location.pathname.split("/").pop() || "index.html";
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

    if (!loggedIn && !publicPages.has(page)) {
        const destination = `${page}${window.location.search}${window.location.hash}`;
        window.location.replace(`login.html?redirect=${encodeURIComponent(destination)}`);
        return;
    }

    document.documentElement.classList.toggle("authenticated", loggedIn);
})();

