import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { get, onValue, ref } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";
import { auth, database } from "./firebase-client.js";
import { getSavedLocation, requestLocation as requestSavedLocation, saveLocation as saveSharedLocation } from "./location-manager.js";

const $ = (id) => document.getElementById(id);
const state = { map: null, user: null, vehicles: [], filter: "all", markers: new Map(), animations: new Map(), selected: null, route: null, locationWatch: null, vehicleTrackingWatch: null, lastVehicleUpdateAt: 0, vehicleUnsubscribe: null, incidentUnsubscribe: null, incidentId: new URLSearchParams(location.search).get("incidentId") || "", vehicleId: new URLSearchParams(location.search).get("vehicleId") || "", destination: null };
const vehicleIcons = { police: "fa-car-side", ambulance: "fa-truck-medical", fire: "fa-fire-extinguisher", rescue: "fa-life-ring", boat: "fa-ship", helicopter: "fa-helicopter" };
const staleAfterMs = 90000;

function escapeHtml(value) { return String(value ?? "").replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[character])); }
function distanceKm(a, b) { const r = 6371; const rad = (v) => v * Math.PI / 180; const dLat = rad(b.lat - a.lat); const dLng = rad(b.lng - a.lng); const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2; return r * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)); }
function formatDistance(km) { return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`; }
function etaMinutes(vehicle) { return Number(vehicle.eta) || Math.max(1, Math.round((vehicle.distanceKm || 0) / 0.45)); }
function normalizeType(value) { const type = String(value || "rescue").toLowerCase().replace(/[ _-]+/g, ""); if (type.includes("ambulance")) return "ambulance"; if (type.includes("police")) return "police"; if (type.includes("fire")) return "fire"; if (type.includes("boat")) return "boat"; if (type.includes("helicopter")) return "helicopter"; return "rescue"; }
function normalizeStatus(value, lastUpdated) { const status = String(value || "OFFLINE").toUpperCase().replace(/[ _-]+/g, "-"); if (Date.now() - Number(lastUpdated || 0) > staleAfterMs) return "STALE"; return status; }
function setText(id, value) { const element = $(id); if (element) element.textContent = value; }
function pointFrom(value) { const lat = Number(value?.latitude ?? value?.lat); const lng = Number(value?.longitude ?? value?.lng ?? value?.lon); return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null; }
function currentUserPoint() { return state.user; }
function setConnection(connected, message) { const pill = $("rescueConnectionStatus"); if (!pill) return; pill.classList.toggle("offline", !connected); pill.innerHTML = `<span></span> ${escapeHtml(message)}`; }

async function sendVehiclePosition(position) {
	if (!state.vehicleId || !auth.currentUser) return;
	const now = Date.now();
	if (now - state.lastVehicleUpdateAt < 15000) return;
	state.lastVehicleUpdateAt = now;
	const token = await auth.currentUser.getIdToken();
	const response = await fetch(`/api/fleet/vehicles/${encodeURIComponent(state.vehicleId)}/location`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy }) });
	if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "GPS update failed");
	setText("vehicleTrackingStatus", `GPS shared · updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
}

function stopVehicleTracking() {
	const wasTracking = state.vehicleTrackingWatch !== null;
	if (state.vehicleTrackingWatch !== null) navigator.geolocation?.clearWatch(state.vehicleTrackingWatch);
	state.vehicleTrackingWatch = null;
	setText("vehicleTrackingStatus", "Tracking stopped");
	if (wasTracking && state.vehicleId && auth.currentUser) auth.currentUser.getIdToken().then((token) => fetch(`/api/fleet/vehicles/${encodeURIComponent(state.vehicleId)}/tracking/stop`, { method: "POST", headers: { Authorization: `Bearer ${token}` } })).catch(() => {});
}

function startVehicleTracking() {
	if (!state.vehicleId || !navigator.geolocation) return setText("vehicleTrackingStatus", "GPS unavailable on this device");
	stopVehicleTracking();
	setText("vehicleTrackingStatus", "Waiting for GPS permission...");
	state.vehicleTrackingWatch = navigator.geolocation.watchPosition((position) => sendVehiclePosition(position).catch((error) => setText("vehicleTrackingStatus", error.message)), (error) => setText("vehicleTrackingStatus", error.code === 1 ? "GPS permission denied" : "GPS unavailable"), { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 });
}

function initMap() { if (state.map || typeof L === "undefined") return; state.map = L.map("rescueMap", { center: [20, 0], zoom: 2, preferCanvas: true }); L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(state.map); setTimeout(() => state.map.invalidateSize(true), 200); }
function updateUserMarker() { if (!state.map || !state.user) return; const point = [state.user.lat, state.user.lng]; const icon = L.divIcon({ className: "rescue-user-wrap", html: "<span class='rescue-user-marker'></span>", iconSize: [26, 26], iconAnchor: [13, 13] }); if (!state.user.marker) state.user.marker = L.marker(point, { icon, zIndexOffset: 1500, title: "Your Location" }).addTo(state.map); else state.user.marker.setLatLng(point); state.user.marker.bindTooltip("Your Location", { direction: "top" }); state.map.setView(point, 14); }
function useUserPosition(position, source = "GPS permission granted") { const point = pointFrom(position.coords || position); if (!point) return; state.user = { ...point, source, marker: state.user?.marker }; updateUserMarker(); setText("rescueLocationInput", `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`); renderVehicles(); }
function requestUserLocation() { requestSavedLocation({ source: "rescue-tracking-update" }).then((location) => useUserPosition({ coords: location }, "Updated saved location")).catch(() => loadSavedLocation("GPS unavailable; saved location fallback")); }
function startLocationWatch() { if (!navigator.geolocation) return; if (state.locationWatch !== null) navigator.geolocation.clearWatch(state.locationWatch); state.locationWatch = navigator.geolocation.watchPosition((position) => useUserPosition(position), () => console.warn("ChronicAI: live GPS updates unavailable; keeping the last known location."), { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 }); }
function loadSavedLocation(reason) { const saved = getSavedLocation() || JSON.parse(localStorage.getItem("rescueTrackingLocation") || "null"); if (saved?.latitude && saved?.longitude) { useUserPosition({ coords: saved }, reason); } }
async function searchLocation() { const input = $("rescueLocationInput"); if (!input?.value.trim()) return requestUserLocation(); try { const params = new URLSearchParams({ format: "jsonv2", limit: "1", q: input.value.trim() }); const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`); const result = (await response.json())[0]; if (!result) throw new Error("Location not found"); const saved = saveSharedLocation({ latitude: Number(result.lat), longitude: Number(result.lon), accuracy: 100 }, "rescue-tracking-search"); localStorage.setItem("rescueTrackingLocation", JSON.stringify(saved)); useUserPosition({ coords: saved }, "Manually selected location"); } catch (error) { console.warn("ChronicAI: location search failed.", error); } }

function normalizeVehicle(id, value) { const point = pointFrom(value); if (!point) return null; const lastUpdated = Number(value.lastUpdated || value.updatedAt || 0); const vehicle = { id, ...value, ...point, type: normalizeType(value.type || value.vehicleType), status: normalizeStatus(value.status, lastUpdated), lastUpdated, distanceKm: state.user ? distanceKm(state.user, point) : Infinity }; return vehicle; }
function listenVehicles() {
	if (state.incidentId) return;
	state.vehicleUnsubscribe?.();
	const vehiclesRef = ref(database, "rescueVehicles");
	state.vehicleUnsubscribe = onValue(vehiclesRef, (snapshot) => {
		const raw = snapshot.val() || {};
		state.vehicles = Object.entries(raw).map(([id, value]) => normalizeVehicle(id, value)).filter(Boolean);
		setConnection(true, state.vehicles.length ? `LIVE TRACKING · Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "LIVE TRACKING · No units currently sharing location");
		renderVehicles();
	}, (error) => {
		console.warn("ChronicAI: rescue vehicle feed unavailable.", error?.code || error?.message || error);
		setConnection(false, "LIVE FEED UNAVAILABLE · sign in again or try later");
	});
}
function listenAssignedVehicle(vehicleId) {
	state.vehicleUnsubscribe?.();
	if (!vehicleId) { state.vehicles = []; renderVehicles(); return; }
	state.vehicleUnsubscribe = onValue(ref(database, `rescueVehicles/${vehicleId}`), (snapshot) => {
		const value = snapshot.val();
		state.vehicles = value ? [normalizeVehicle(vehicleId, value)].filter(Boolean) : [];
		setConnection(true, state.vehicles.length ? "LIVE ASSIGNED VEHICLE" : "ASSIGNMENT ENDED");
		renderVehicles();
	}, () => setConnection(false, "LIVE ASSIGNED VEHICLE UNAVAILABLE"));
}
function visibleVehicles() { return state.vehicles.filter((vehicle) => (!state.incidentId || vehicle.assignedIncidentId === state.incidentId) && (state.filter === "all" || vehicle.type === state.filter)).sort((a, b) => a.distanceKm - b.distanceKm); }
function iconFor(vehicle) { return L.divIcon({ className: "rescue-vehicle-wrap", html: `<span class="rescue-marker ${vehicle.type}"><i class="fa-solid ${vehicleIcons[vehicle.type] || vehicleIcons.rescue}"></i></span>`, iconSize: [28, 28], iconAnchor: [14, 14] }); }
function animateMarker(vehicle) { const existing = state.markers.get(vehicle.id); if (!existing) { const marker = L.marker([vehicle.lat, vehicle.lng], { icon: iconFor(vehicle), title: `${vehicle.agency || "Authorized agency"} ${vehicle.id}` }).addTo(state.map); marker.on("click", () => selectVehicle(vehicle.id)); state.markers.set(vehicle.id, marker); return; } const from = existing.getLatLng(); const start = performance.now(); const duration = 850; cancelAnimationFrame(state.animations.get(vehicle.id)); const step = (now) => { const progress = Math.min(1, (now - start) / duration); existing.setLatLng([from.lat + (vehicle.lat - from.lat) * progress, from.lng + (vehicle.lng - from.lng) * progress]); if (progress < 1) state.animations.set(vehicle.id, requestAnimationFrame(step)); }; state.animations.set(vehicle.id, requestAnimationFrame(step)); existing.setIcon(iconFor(vehicle)); }
function renderMarkers() { if (!state.map) return; const visible = new Set(visibleVehicles().map((vehicle) => vehicle.id)); state.markers.forEach((marker, id) => { if (!visible.has(id)) state.map.removeLayer(marker); }); visibleVehicles().forEach(animateMarker); }
function renderVehicles() { state.vehicles = state.vehicles.map((vehicle) => ({ ...vehicle, distanceKm: state.user ? distanceKm(state.user, vehicle) : Infinity, status: normalizeStatus(vehicle.status, vehicle.lastUpdated) })); renderMarkers(); const list = $("rescueVehicleList"); if (!list) return; const vehicles = visibleVehicles(); setText("rescueVehicleCount", String(vehicles.length)); ["ambulance", "police", "fire", "rescue"].forEach((type) => setText(`rescue${type[0].toUpperCase() + type.slice(1)}Count`, String(state.vehicles.filter((vehicle) => vehicle.type === type).length))); list.innerHTML = vehicles.length ? vehicles.map(vehicleCard).join("") : `<div class="rescue-empty"><i class="fa-solid fa-satellite-dish"></i><span>No authorized ${state.filter === "all" ? "rescue vehicles" : state.filter + " units"} are currently sharing a location.</span></div>`; list.querySelectorAll(".rescue-vehicle-card").forEach((card) => card.addEventListener("click", () => selectVehicle(card.dataset.vehicleId))); }
function vehicleCard(vehicle) { const statusClass = vehicle.status.toLowerCase(); const updated = vehicle.lastUpdated ? `${Math.max(0, Math.round((Date.now() - vehicle.lastUpdated) / 1000))} sec ago` : "last update unavailable"; return `<article class="rescue-vehicle-card ${state.selected?.id === vehicle.id ? "selected" : ""}" data-vehicle-id="${escapeHtml(vehicle.id)}"><div class="rescue-vehicle-top"><span class="rescue-vehicle-icon"><i class="fa-solid ${vehicleIcons[vehicle.type] || vehicleIcons.rescue}"></i></span><div><strong>${escapeHtml(vehicle.id)}</strong><small>${escapeHtml(vehicle.agency || "Authorized agency")} · ${escapeHtml(vehicle.type)}</small></div></div><div class="rescue-vehicle-meta"><span class="rescue-status ${statusClass}">${escapeHtml(vehicle.status.replace("-", " "))}</span><span>${Number.isFinite(vehicle.distanceKm) ? formatDistance(vehicle.distanceKm) : "Distance unavailable"}</span></div><div class="rescue-vehicle-meta"><span>${vehicle.status === "STALE" ? "Last known location" : `Updated ${updated}`}</span><span>ETA ${etaMinutes(vehicle)} min</span></div>${vehicle.mission || vehicle.destination ? `<div class="rescue-vehicle-meta"><span>${escapeHtml(vehicle.mission || "Responding")}</span><span>${escapeHtml(vehicle.destination || "Live dispatch")}</span></div>` : ""}</article>`; }

function selectVehicle(id) { const vehicle = state.vehicles.find((item) => item.id === id); if (!vehicle) return; state.selected = vehicle; $("rescueSelectedPanel").hidden = false; setText("selectedRescueTitle", `${vehicle.type.toUpperCase()} · ${vehicle.id}`); setText("selectedRescueMeta", `${vehicle.status.replace("-", " ")} · ${vehicle.agency || "Authorized agency"} · ${Number.isFinite(vehicle.distanceKm) ? formatDistance(vehicle.distanceKm) : "Distance unavailable"} away · ETA ${etaMinutes(vehicle)} min · ${vehicle.status === "STALE" ? "Last updated data only" : "Live update received"}`); const contact = $("rescueContactButton"); if (vehicle.contact && vehicle.status !== "STALE") { contact.hidden = false; contact.href = `tel:${encodeURIComponent(vehicle.contact)}`; } else contact.hidden = true; renderVehicles(); if (state.map) state.map.setView([vehicle.lat, vehicle.lng], 15); }
async function showRoute() { const vehicle = state.selected; const destination = state.destination || pointFrom(vehicle?.incidentLocation) || pointFrom(vehicle?.destination); if (!vehicle || !destination) return; try { const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${vehicle.lng},${vehicle.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`); const data = await response.json(); if (!data.routes?.[0]) throw new Error("Route unavailable"); if (state.route) state.map.removeLayer(state.route); state.route = L.geoJSON(data.routes[0].geometry, { style: { color: "#22c55e", weight: 5, opacity: .85, className: "rescue-route-line" } }).addTo(state.map); state.map.fitBounds(state.route.getBounds(), { padding: [30, 30] }); setText("selectedRescueMeta", `${vehicle.id} responding · ${formatDistance(data.routes[0].distance / 1000)} remaining · ETA ${Math.max(1, Math.round(data.routes[0].duration / 60))} min · route based on current map data`); } catch (error) { setText("selectedRescueMeta", `${vehicle.id} · Route unavailable right now. ${vehicle.status === "STALE" ? "Last known location only." : "Live unit remains visible."}`); } }
function listenIncident(user) { if (!state.incidentId || !user) return; state.incidentUnsubscribe = onValue(ref(database, `emergencyRequests/${state.incidentId}`), (snapshot) => { const incident = snapshot.val(); if (!incident || (incident.userId && incident.userId !== user.uid)) return; state.destination = pointFrom(incident); setText("rescueIncidentTitle", `Emergency Request #${state.incidentId}`); setText("rescueIncidentStatus", `${incident.emergencyType || "Emergency"} · ${incident.status || "PENDING"} · Assigned ${incident.assignedVehicleId || "awaiting authorized dispatch"}`); listenAssignedVehicle(incident.assignedVehicleId); }); }
function setup() { initMap(); if (state.vehicleId) { $("responderTrackingControls")?.removeAttribute("hidden"); $("startVehicleTracking")?.addEventListener("click", startVehicleTracking); $("stopVehicleTracking")?.addEventListener("click", stopVehicleTracking); } $("rescueLocationButton")?.addEventListener("click", searchLocation); $("rescueLocationInput")?.addEventListener("keydown", (event) => { if (event.key === "Enter") searchLocation(); }); $("viewRescueRouteButton")?.addEventListener("click", showRoute); document.querySelectorAll("[data-rescue-filter]").forEach((button) => button.addEventListener("click", () => { state.filter = button.dataset.rescueFilter; document.querySelectorAll("[data-rescue-filter]").forEach((item) => item.classList.toggle("active", item === button)); renderVehicles(); })); loadSavedLocation("Using saved location"); onAuthStateChanged(auth, (user) => { if (user) { listenVehicles(); listenIncident(user); } else { state.vehicleUnsubscribe?.(); setConnection(false, "SIGN IN REQUIRED · waiting for account"); } }); window.addEventListener("beforeunload", () => { if (state.locationWatch !== null) navigator.geolocation?.clearWatch(state.locationWatch); stopVehicleTracking(); state.vehicleUnsubscribe?.(); state.incidentUnsubscribe?.(); state.animations.forEach(cancelAnimationFrame); }); }
document.addEventListener("DOMContentLoaded", setup);
