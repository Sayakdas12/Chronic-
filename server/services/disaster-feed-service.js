const SOUTH_ASIA_BOUNDS = Object.freeze({ minLatitude: 5, maxLatitude: 37, minLongitude: 60, maxLongitude: 101 });
const SOUTH_ASIA_COUNTRIES = new Set(["IND", "BGD", "NPL", "BTN", "PAK", "LKA", "MMR"]);
const SOUTH_ASIA_NAMES = ["india", "bangladesh", "nepal", "bhutan", "pakistan", "sri lanka", "myanmar"];
const FEED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const FEED_CACHE_TTL_MS = 5 * 60 * 1000;
const GDACS_URL = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH";
let cachedFeed = null;
let feedRequest = null;

function severityForMagnitude(magnitude) {
    if (magnitude >= 6) return "critical";
    if (magnitude >= 5) return "high";
    if (magnitude >= 4) return "moderate";
    return "low";
}

function isSouthAsia(latitude, longitude) {
    return latitude >= SOUTH_ASIA_BOUNDS.minLatitude && latitude <= SOUTH_ASIA_BOUNDS.maxLatitude && longitude >= SOUTH_ASIA_BOUNDS.minLongitude && longitude <= SOUTH_ASIA_BOUNDS.maxLongitude;
}

async function fetchWithTimeout(url, timeoutMs = 5000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/geo+json, application/json" } });
        if (!response.ok) throw new Error(`Disaster provider returned HTTP ${response.status}`);
        return response.json();
    } finally {
        clearTimeout(timer);
    }
}

function gdacsSeverity(alertLevel) {
    const level = String(alertLevel || "").toLowerCase();
    if (level === "red") return "critical";
    if (level === "orange") return "high";
    if (level === "green") return "low";
    return "moderate";
}

function gdacsType(eventType) {
    return { EQ: ["Earthquake", "fa-house-crack"], FL: ["Flood", "fa-water"], TC: ["Cyclone", "fa-hurricane"], WF: ["Wildfire", "fa-fire"], VO: ["Volcanic activity", "fa-mountain"], DR: ["Drought", "fa-sun"] }[eventType] || ["Disaster alert", "fa-triangle-exclamation"];
}

function isCurrentGdacsEvent(properties) {
    if (String(properties.iscurrent).toLowerCase() === "true") return true;
    const endDate = Date.parse(properties.todate || "");
    return Number.isFinite(endDate) && endDate >= Date.now();
}

async function fetchGdacsIndiaEvents() {
    const payload = await fetchWithTimeout(GDACS_URL);
    return (payload.features || []).map((feature) => {
        const properties = feature.properties || {};
        const [longitude, latitude] = feature.geometry?.coordinates || [];
        const countries = Array.isArray(properties.affectedcountries) ? properties.affectedcountries : [];
        const countryName = String(properties.country || "").toLowerCase();
        const includesSouthAsia = SOUTH_ASIA_NAMES.some((name) => countryName.includes(name)) || countries.some((country) => SOUTH_ASIA_COUNTRIES.has(country.iso3));
        if (!includesSouthAsia || !Number.isFinite(latitude) || !Number.isFinite(longitude) || !isSouthAsia(latitude, longitude) || !isCurrentGdacsEvent(properties)) return null;
        const [type, icon] = gdacsType(properties.eventtype);
        const timestamp = properties.datemodified || properties.fromdate || null;
        return {
            id: `gdacs-${properties.eventtype}-${properties.eventid}-${properties.episodeid}`,
            type,
            icon,
            title: properties.name || properties.description || `${type} in India`,
            location: properties.country || "India",
            latitude: Number(latitude),
            longitude: Number(longitude),
            severity: gdacsSeverity(properties.alertlevel || properties.episodealertlevel),
            measurement: properties.severitydata?.severitytext || "Severity details unavailable",
            timestamp: timestamp ? new Date(timestamp).toISOString() : null,
            updatedAt: timestamp ? new Date(timestamp).toISOString() : null,
            source: `GDACS${properties.source ? ` / ${properties.source}` : ""}`,
            sourceUrl: properties.url?.report || "https://www.gdacs.org/",
            expiresAt: properties.todate || null
        };
    }).filter(Boolean);
}

async function loadIndiaDisasterFeed() {
    const startTime = new Date(Date.now() - FEED_WINDOW_MS).toISOString();
    const params = new URLSearchParams({ format: "geojson", starttime: startTime, minlatitude: SOUTH_ASIA_BOUNDS.minLatitude, maxlatitude: SOUTH_ASIA_BOUNDS.maxLatitude, minlongitude: SOUTH_ASIA_BOUNDS.minLongitude, maxlongitude: SOUTH_ASIA_BOUNDS.maxLongitude, orderby: "time", limit: "100" });
    const [usgsResult, gdacsResult] = await Promise.allSettled([fetchWithTimeout(`https://earthquake.usgs.gov/fdsnws/event/1/query?${params}`), fetchGdacsIndiaEvents()]);
    if (usgsResult.status === "rejected" && gdacsResult.status === "rejected") throw new Error("USGS and GDACS providers are unavailable.");
    const payload = usgsResult.status === "fulfilled" ? usgsResult.value : { features: [] };
    const gdacsEvents = gdacsResult.status === "fulfilled" ? gdacsResult.value : [];
    const usgsEvents = (payload.features || []).map((feature) => {
        const [longitude, latitude, depthKm] = feature.geometry?.coordinates || [];
        const properties = feature.properties || {};
        const magnitude = Number(properties.mag);
        const place = String(properties.place || "");
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !isSouthAsia(latitude, longitude) || !Number.isFinite(magnitude)) return null;
        return { id: `usgs-${feature.id}`, type: "Earthquake", icon: "fa-house-crack", title: properties.title || "Earthquake detected in India", location: place || "India", latitude, longitude, severity: severityForMagnitude(magnitude), measurement: `Magnitude ${magnitude.toFixed(1)} · Depth ${Number.isFinite(Number(depthKm)) ? `${Number(depthKm).toFixed(1)} km` : "depth unavailable"}`, timestamp: properties.time ? new Date(properties.time).toISOString() : null, updatedAt: properties.updated ? new Date(properties.updated).toISOString() : null, source: "USGS Earthquake Hazards Program", sourceUrl: properties.url || "https://earthquake.usgs.gov/earthquakes/map/", detailUrl: properties.detail || properties.url || null };
    }).filter(Boolean);
    const events = [...usgsEvents, ...gdacsEvents].filter((event) => event.timestamp && Date.now() - new Date(event.timestamp).getTime() <= FEED_WINDOW_MS).sort((first, second) => new Date(second.timestamp || 0) - new Date(first.timestamp || 0));
    return { success: true, source: "USGS + GDACS", sourceUrl: "https://www.gdacs.org/", scope: "South Asia", windowHours: 168, updatedAt: new Date().toISOString(), events, sources: [{ name: "USGS Earthquake Hazards Program", url: "https://earthquake.usgs.gov/earthquakes/map/" }, { name: "GDACS", url: "https://www.gdacs.org/" }] };
}

export async function fetchIndiaDisasterFeed() {
    if (cachedFeed && cachedFeed.expiresAt > Date.now()) return cachedFeed.value;
    if (!feedRequest) {
        feedRequest = loadIndiaDisasterFeed()
            .then((value) => {
                cachedFeed = { value, expiresAt: Date.now() + FEED_CACHE_TTL_MS };
                return value;
            })
            .catch((error) => {
                if (cachedFeed) return cachedFeed.value;
                throw error;
            })
            .finally(() => {
                feedRequest = null;
            });
    }
    return feedRequest;
}
