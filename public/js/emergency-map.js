import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { get, ref } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";
import { auth, database } from "./firebase-client.js";

const $ = (id) => document.getElementById(id);
const state = {
  position: null,
  watchId: null,
  locationSource: "Waiting for permission",
  facilities: [],
  facilityFilter: "all",
  destination: null,
  reports: [],
  routeLayers: [],
  facilityLayer: null,
  hazardLayer: null,
  locationMarker: null,
  accuracyCircle: null,
  map: null,
  reportController: null,
  facilityController: null,
  lastFacilityLoadAt: 0,
  lastReportLoadAt: 0,
  refreshInterval: null,
  searchTimer: null
};

const facilityIcons = {
  hospital: "fa-hospital",
  police: "fa-shield-halved",
  fire: "fa-fire-extinguisher",
  shelter: "fa-house-chimney",
  rescue: "fa-life-ring",
  medical: "fa-pills",
  relief: "fa-box-open",
  fuel: "fa-gas-pump"
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[character]));
}

function haversineKm(first, second) {
  const radius = 6371;
  const radians = (value) => value * Math.PI / 180;
  const deltaLat = radians(second.lat - first.lat);
  const deltaLng = radians(second.lng - first.lng);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(radians(first.lat)) * Math.cos(radians(second.lat)) * Math.sin(deltaLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(km) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function formatEta(km) {
  return `${Math.max(1, Math.round(km / 0.45))} min`;
}

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function setLocationStatus(message, source = state.locationSource) {
  state.locationSource = source;
  setText("locationSourceStatus", message);
  setText("lastUpdated", new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  setText("emergencyLastUpdate", new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
}

function showMessage(message) {
  if (typeof window.showToast === "function") window.showToast(message, "!");
  else console.info(message);
}

function getMap() {
  if (state.map) return state.map;
  if (window.safeJourneyMap) state.map = window.safeJourneyMap;
  return state.map;
}

function currentPoint() {
  return state.position ? { lat: state.position.coords.latitude, lng: state.position.coords.longitude } : null;
}

function updateLocationMarker(position) {
  const map = getMap();
  if (!map || !position?.coords) return;
  const point = [position.coords.latitude, position.coords.longitude];
  const icon = L.divIcon({ className: "emergency-user-marker", html: "<span></span>", iconSize: [26, 26], iconAnchor: [13, 13] });
  if (!state.locationMarker) state.locationMarker = L.marker(point, { icon, zIndexOffset: 1500, title: "Your Location" }).addTo(map);
  else state.locationMarker.setLatLng(point);
  state.locationMarker.bindTooltip("Your Location", { direction: "top", offset: [0, -12] });
  if (!state.accuracyCircle) state.accuracyCircle = L.circle(point, { radius: position.coords.accuracy || 30, color: "#4f8cff", fillColor: "#4f8cff", fillOpacity: 0.08, weight: 1 }).addTo(map);
  else state.accuracyCircle.setLatLng(point).setRadius(position.coords.accuracy || 30);
  setText("currentCoordinates", `${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`);
  setText("latitude", position.coords.latitude.toFixed(6));
  setText("longitude", position.coords.longitude.toFixed(6));
  setText("accuracy", `${Math.round(position.coords.accuracy || 0)} m`);
  setLocationStatus("GPS permission granted", "GPS permission granted");
}

function usePosition(position, source = "GPS permission granted") {
  if (!position?.coords) return;
  state.position = position;
  updateLocationMarker(position);
  setText("mapStatusText", "Location active");
  setText("mapStatusDot", "");
  setLocationStatus(source, source);
  loadWeather();
  loadNearbyFacilities();
  loadVerifiedReports();
}

async function loadWeather() {
  const point = currentPoint();
  if (!point) return;
  try {
    const params = new URLSearchParams({ latitude: point.lat, longitude: point.lng, current: "temperature_2m,precipitation,rain,wind_speed_10m,weather_code", timezone: "auto" });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!response.ok) throw new Error("Weather unavailable");
    const payload = await response.json();
    const current = payload.current || {};
    const rain = Number(current.rain ?? current.precipitation ?? 0);
    const temperature = Number.isFinite(Number(current.temperature_2m)) ? `${Math.round(current.temperature_2m)}°C` : "Weather available";
    setText("emergencyWeatherStatus", `${temperature} · ${rain > 0 ? `${rain} mm rain` : "No rain signal"}`);
  } catch (error) {
    setText("emergencyWeatherStatus", "Weather unavailable");
  }
}

function startLocationWatch() {
  if (!navigator.geolocation) {
    setLocationStatus("GPS unavailable", "Saved location fallback");
    return;
  }
  if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
  state.watchId = navigator.geolocation.watchPosition((position) => usePosition(position), (error) => {
    if (error.code === 1) loadSavedLocation("Location permission denied");
    else if (!state.position) loadSavedLocation("GPS unavailable; using saved location");
  }, { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 });
}

function loadSavedLocation(reason = "Using saved profile location") {
  const stored = JSON.parse(localStorage.getItem("safeJourneyPreferredLocation") || "null");
  if (stored?.latitude && stored?.longitude) {
    usePosition({ coords: { latitude: Number(stored.latitude), longitude: Number(stored.longitude), accuracy: stored.accuracy || 100 } }, reason);
    return true;
  }
  setLocationStatus("No saved location", reason);
  return false;
}

async function loadProfileLocation(user) {
  if (!user || state.position) return;
  try {
    const snapshot = await get(ref(database, `users/${user.uid}`));
    const profile = snapshot.val() || {};
    const location = profile.preferredLocation || profile.locationCoordinates || profile.savedLocation;
    if (location && Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude))) {
      const saved = { latitude: Number(location.latitude), longitude: Number(location.longitude), accuracy: Number(location.accuracy) || 100 };
      localStorage.setItem("safeJourneyPreferredLocation", JSON.stringify(saved));
      loadSavedLocation("Saved profile location");
    }
  } catch (error) {
    console.warn("Profile location fallback unavailable", error);
  }
}

function requestLocation() {
  if (!navigator.geolocation) return loadSavedLocation("GPS unavailable; using saved location");
  setLocationStatus("Waiting for GPS permission", "Waiting for permission");
  navigator.geolocation.getCurrentPosition((position) => {
    usePosition(position);
    startLocationWatch();
  }, () => {
    if (!loadSavedLocation("GPS denied; using saved location")) setLocationStatus("Permission needed for live location", "Permission denied");
  }, { enableHighAccuracy: true, maximumAge: 30000, timeout: 12000 });
}

async function geocode(query) {
  const params = new URLSearchParams({ format: "jsonv2", limit: "5", q: query });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Destination search unavailable");
  return response.json();
}

function renderSuggestions(results) {
  const container = $("destinationSuggestions");
  if (!container) return;
  container.innerHTML = results.map((item, index) => `<button class="destination-suggestion" type="button" data-result-index="${index}">${escapeHtml(item.display_name)}</button>`).join("");
  container.querySelectorAll(".destination-suggestion").forEach((button) => button.addEventListener("click", () => {
    const result = results[Number(button.dataset.resultIndex)];
    state.destination = { lat: Number(result.lat), lng: Number(result.lon), name: result.display_name };
    $("destinationSearch").value = result.display_name;
    container.innerHTML = "";
    calculateRoutes();
  }));
}

async function searchDestination() {
  const input = $("destinationSearch");
  if (!input?.value.trim()) return showMessage("Enter a destination first.");
  try {
    const results = await geocode(input.value.trim());
    if (!results.length) return showMessage("No destination found.");
    renderSuggestions(results);
    if (results.length === 1) {
      state.destination = { lat: Number(results[0].lat), lng: Number(results[0].lon), name: results[0].display_name };
      calculateRoutes();
    }
  } catch (error) { showMessage(error.message); }
}

function facilityType(element) {
  const tags = element.tags || {};
  if (tags.amenity === "hospital") return "hospital";
  if (tags.amenity === "police") return "police";
  if (tags.amenity === "fire_station") return "fire";
  if (tags.amenity === "shelter") return "shelter";
  if (tags.emergency === "rescue_station") return "rescue";
  if (tags.amenity === "pharmacy") return "medical";
  if (tags.amenity === "fuel") return "fuel";
  return "relief";
}

function elementPoint(element) {
  return { lat: Number(element.lat ?? element.center?.lat), lng: Number(element.lon ?? element.center?.lon) };
}

async function loadNearbyFacilities() {
  const point = currentPoint();
  if (!point || state.facilityController || Date.now() - state.lastFacilityLoadAt < 120000) return;
  state.lastFacilityLoadAt = Date.now();
  state.facilityController = new AbortController();
  const query = `[out:json][timeout:20];(nwr[amenity~"hospital|police|fire_station|shelter|pharmacy|fuel"](around:8000,${point.lat},${point.lng});nwr[emergency~"rescue_station|ambulance_station"](around:8000,${point.lat},${point.lng}););out center tags;`;
  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: query, signal: state.facilityController.signal });
    if (!response.ok) throw new Error("Nearby facility service unavailable");
    const data = await response.json();
    state.facilities = (data.elements || []).map((element) => {
      const location = elementPoint(element);
      return { id: element.id, location, type: facilityType(element), name: element.tags?.name || "Unnamed facility", phone: element.tags?.phone || element.tags?.contact?.phone || "", opening: element.tags?.opening_hours || "Status unavailable", services: element.tags?.healthcare || element.tags?.description || "Emergency assistance" , distance: haversineKm(point, location) };
    }).filter((facility) => Number.isFinite(facility.distance)).sort((a, b) => a.distance - b.distance);
    renderFacilities();
    renderFacilityMarkers();
  } catch (error) {
    if (error.name !== "AbortError") showMessage("Nearby facilities could not be loaded right now.");
  } finally { state.facilityController = null; }
}

function filteredFacilities() {
  return state.facilityFilter === "all" ? state.facilities : state.facilities.filter((facility) => facility.type === state.facilityFilter);
}

function renderFacilities() {
  const list = $("facilityList");
  if (!list) return;
  const facilities = filteredFacilities().slice(0, 8);
  setText("facilityCount", String(filteredFacilities().length));
  list.innerHTML = facilities.length ? facilities.map((facility) => `<article class="facility-item"><div class="facility-item-header"><span class="facility-icon"><i class="fa-solid ${facilityIcons[facility.type] || facilityIcons.relief}"></i></span><div><strong>${escapeHtml(facility.name)}</strong><small>${formatDistance(facility.distance)} · ${formatEta(facility.distance)} · ${escapeHtml(facility.opening)}</small></div></div><p>${escapeHtml(facility.services)}${facility.phone ? ` · ${escapeHtml(facility.phone)}` : ""}</p><button class="facility-route-btn" type="button" data-facility-id="${facility.id}">Get Route</button></article>`).join("") : `<div class="empty-facilities"><i class="fa-solid fa-magnifying-glass"></i><span>No mapped facilities of this type were found nearby.</span></div>`;
  list.querySelectorAll(".facility-route-btn").forEach((button) => button.addEventListener("click", () => {
    const facility = state.facilities.find((item) => String(item.id) === button.dataset.facilityId);
    if (facility) { state.destination = { ...facility.location, name: facility.name }; $("destinationSearch").value = facility.name; calculateRoutes(); }
  }));
}

function renderFacilityMarkers() {
  const map = getMap();
  if (!map) return;
  if (state.facilityLayer) state.facilityLayer.clearLayers(); else state.facilityLayer = L.layerGroup().addTo(map);
  state.facilities.forEach((facility) => {
    const marker = L.marker([facility.location.lat, facility.location.lng], { icon: L.divIcon({ className: "facility-marker-wrap", html: `<span class="facility-map-marker"><i class="fa-solid ${facilityIcons[facility.type] || facilityIcons.relief}"></i></span>`, iconSize: [26, 26], iconAnchor: [13, 13] }) });
    marker.bindPopup(`<strong>${escapeHtml(facility.name)}</strong><br>${formatDistance(facility.distance)} · ${formatEta(facility.distance)}<br>${escapeHtml(facility.opening)}${facility.phone ? `<br>${escapeHtml(facility.phone)}` : ""}<br><button class="popup-route-button" data-facility-id="${facility.id}">Get Route</button>`);
    marker.on("popupopen", (event) => event.popup.getElement()?.querySelector(".popup-route-button")?.addEventListener("click", () => { state.destination = { ...facility.location, name: facility.name }; calculateRoutes(); }));
    marker.addTo(state.facilityLayer);
  });
}

function reportCoordinates(report) {
  const latitude = Number(report.latitude ?? report.lat ?? report.location?.latitude ?? report.coordinates?.latitude);
  const longitude = Number(report.longitude ?? report.lng ?? report.location?.longitude ?? report.coordinates?.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { lat: latitude, lng: longitude } : null;
}

async function loadVerifiedReports() {
  if (Date.now() - state.lastReportLoadAt < 120000) return;
  state.lastReportLoadAt = Date.now();
  try {
    const response = await fetch("/api/reports", { headers: { Accept: "application/json" } });
    if (!response.ok) return;
    const payload = await response.json();
    state.reports = (payload.reports || []).map((report) => ({ ...report, point: reportCoordinates(report) })).filter((report) => report.point && String(report.status || "").toLowerCase() !== "resolved");
    renderHazardMarkers();
    const active = state.reports.length;
    setText("emergencyDataSource", active ? `LIVE VERIFIED DATA: ${active} report${active === 1 ? "" : "s"}` : "LIVE VERIFIED DATA: no active reports");
    setText("emergencyRiskLevel", active ? "Review required" : "No signal");
    setText("emergencyDisasterTitle", active ? "Verified incidents nearby" : "Monitoring verified alerts");
    setText("emergencyDisasterSummary", active ? "Routes are evaluated against published report locations. Verify conditions before travel." : "No active verified disaster signal has been loaded for this area.");
  } catch (error) { console.warn("Verified report overlay unavailable", error); }
}

function renderHazardMarkers() {
  const map = getMap();
  if (!map) return;
  if (state.hazardLayer) state.hazardLayer.clearLayers(); else state.hazardLayer = L.layerGroup().addTo(map);
  state.reports.forEach((report) => {
    const marker = L.marker([report.point.lat, report.point.lng], { icon: L.divIcon({ className: "hazard-marker-wrap", html: `<span class="hazard-map-marker"><i class="fa-solid fa-triangle-exclamation"></i></span>`, iconSize: [30, 30], iconAnchor: [15, 15] }) });
    marker.bindPopup(`<strong>${escapeHtml(report.title || report.category || "Verified emergency report")}</strong><br>${escapeHtml(report.location || "Location reported") }<br><small>Source: LIVE VERIFIED DATA</small>`).addTo(state.hazardLayer);
  });
}

async function calculateRoutes() {
  const origin = currentPoint();
  if (!origin || !state.destination) return showMessage(origin ? "Choose a destination first." : "Allow location before calculating a route.");
  const routeOptions = $("routeOptions");
  routeOptions.innerHTML = `<div class="route-empty"><i class="fa-solid fa-spinner fa-spin"></i><span>Comparing route time, distance and verified hazard proximity...</span></div>`;
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${state.destination.lng},${state.destination.lat}?alternatives=true&overview=full&geometries=geojson&steps=false`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Routing service unavailable");
    const payload = await response.json();
    const routes = payload.routes || [];
    if (!routes.length) throw new Error("No drivable route found");
    renderRoutes(routes, origin);
  } catch (error) {
    routeOptions.innerHTML = `<div class="route-empty"><i class="fa-solid fa-circle-exclamation"></i><span>${escapeHtml(error.message)}. Try again when route services are available.</span></div>`;
  }
}

function routeHazardPenalty(route) {
  const coordinates = route.geometry?.coordinates || [];
  return state.reports.reduce((penalty, report) => {
    const nearby = coordinates.some(([lng, lat]) => haversineKm({ lat, lng }, report.point) < 0.8);
    return penalty + (nearby ? 100 : 0);
  }, 0);
}

function renderRoutes(routes, origin) {
  const map = getMap();
  state.routeLayers.forEach((layer) => map?.removeLayer(layer));
  state.routeLayers = [];
  const fastest = routes.reduce((best, route) => route.duration < best.duration ? route : best, routes[0]);
  const shortest = routes.reduce((best, route) => route.distance < best.distance ? route : best, routes[0]);
  const safest = routes.reduce((best, route) => (routeHazardPenalty(route) || route.distance / 100000) < (routeHazardPenalty(best) || best.distance / 100000) ? route : best, routes[0]);
  const chosen = safest;
  const routeRows = [{ title: "RECOMMENDED SAFER ROUTE", route: chosen, className: "recommended", reason: state.reports.length ? "Avoids the highest available verified hazard proximity." : "No verified hazard overlay is available; route selected using distance as a practical fallback." }, { title: "FASTEST ROUTE", route: fastest, reason: "Minimum estimated travel time from the routing provider." }, { title: "SHORTEST ROUTE", route: shortest, reason: "Minimum mapped driving distance from the routing provider." }];
  if (map) routeRows.forEach((row, index) => { const line = L.geoJSON(row.route.geometry, { style: { color: index === 0 ? "#22c55e" : index === 1 ? "#f59e0b" : "#60a5fa", weight: index === 0 ? 6 : 4, opacity: index === 0 ? 0.9 : 0.58, dashArray: index === 0 ? "" : "8 7" } }).addTo(map); state.routeLayers.push(line); });
  $("routeOptions").innerHTML = routeRows.map((row, index) => `<article class="route-option ${row.className || ""}"><h4>${index === 0 ? "🛡 " : index === 1 ? "⚡ " : "📍 "}${row.title}</h4><div class="route-meta"><span>${(row.route.distance / 1000).toFixed(1)} km</span><span>${Math.max(1, Math.round(row.route.duration / 60))} min</span></div><p>${escapeHtml(row.reason)} ${index === 0 ? "Safety information may change." : ""}</p><button class="route-use-btn" type="button" data-route-index="${index}">${index === 0 ? "USE SAFER ROUTE" : "SHOW ROUTE"} →</button></article>`).join("");
  document.querySelectorAll(".route-use-btn").forEach((button) => button.addEventListener("click", () => { const row = routeRows[Number(button.dataset.routeIndex)]; map?.fitBounds(L.geoJSON(row.route.geometry).getBounds(), { padding: [30, 30] }); }));
  if (map) map.fitBounds(L.geoJSON(chosen.geometry).getBounds(), { padding: [30, 30] });
}

function setupEmergencyActions() {
  $("destinationSearchBtn")?.addEventListener("click", searchDestination);
  $("destinationSearch")?.addEventListener("keydown", (event) => { if (event.key === "Enter") searchDestination(); });
  $("destinationSearch")?.addEventListener("input", (event) => { clearTimeout(state.searchTimer); state.searchTimer = setTimeout(() => { if (event.target.value.trim().length > 2) searchDestination(); }, 500); });
  $("useMyLocationBtn")?.addEventListener("click", () => { const map = getMap(); const point = currentPoint(); if (point && map) map.setView([point.lat, point.lng], 16); else requestLocation(); });
  $("centerMapBtn")?.addEventListener("click", () => { const point = currentPoint(); const map = getMap(); if (point && map) map.setView([point.lat, point.lng], 16); });
  $("findHospitalBtn")?.addEventListener("click", () => selectNearest("hospital"));
  $("findShelterBtn")?.addEventListener("click", () => selectNearest("shelter"));
  document.querySelectorAll("[data-facility-filter]").forEach((button) => button.addEventListener("click", () => { state.facilityFilter = button.dataset.facilityFilter; document.querySelectorAll("[data-facility-filter]").forEach((item) => item.classList.toggle("active", item === button)); renderFacilities(); }));
  $("reportHazardBtn")?.addEventListener("click", () => { window.location.href = "report-problem.html"; });
  $("emergencyButton")?.addEventListener("click", () => { const menu = $("emergencyActionMenu"); menu.hidden = !menu.hidden; });
  $("requestRescueBtn")?.addEventListener("click", () => { window.location.href = "request.html?type=rescue"; });
  $("navigateSafeBtn")?.addEventListener("click", () => { const facility = state.facilities.find((item) => ["hospital", "shelter", "rescue"].includes(item.type)); if (facility) { state.destination = { ...facility.location, name: facility.name }; calculateRoutes(); } else showMessage("No mapped safer facility is available yet."); });
  $("shareLocationBtn")?.addEventListener("click", shareLocation);
}

function selectNearest(type) {
  const facility = state.facilities.find((item) => item.type === type);
  if (!facility) return showMessage(`No mapped ${type} nearby.`);
  state.destination = { ...facility.location, name: facility.name };
  $("destinationSearch").value = facility.name;
  calculateRoutes();
}

async function shareLocation() {
  const point = currentPoint();
  if (!point) return showMessage("Allow location before sharing it.");
  const url = `https://www.openstreetmap.org/?mlat=${point.lat}&mlon=${point.lng}#map=17/${point.lat}/${point.lng}`;
  try { if (navigator.share) await navigator.share({ title: "My emergency location", url }); else await navigator.clipboard.writeText(url); showMessage("Location link ready to share."); } catch (error) { if (error.name !== "AbortError") showMessage("Could not share location."); }
}

function initializeEmergencyMap() {
  setupEmergencyActions();
  const waitForMap = () => { if (!getMap()) return setTimeout(waitForMap, 100); loadVerifiedReports(); requestLocation(); };
  waitForMap();
  onAuthStateChanged(auth, loadProfileLocation);
  state.refreshInterval = window.setInterval(() => { loadVerifiedReports(); loadNearbyFacilities(); }, 120000);
  window.addEventListener("beforeunload", () => { if (state.watchId !== null) navigator.geolocation?.clearWatch(state.watchId); if (state.refreshInterval) window.clearInterval(state.refreshInterval); state.reportController?.abort(); state.facilityController?.abort(); });
}

document.addEventListener("DOMContentLoaded", initializeEmergencyMap);
