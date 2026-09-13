"use strict";

import { getSavedLocation, requestLocation as requestSavedLocation, subscribeToLocationUpdates } from "./location-manager.js";

const LOCATION_CONFIG = Object.freeze({
  nearbyResourcesRadiusKm: 50,
  nearbyRiskRadiusKm: 100,
  criticalAlertRadiusKm: 50,
  dataRefreshMs: 5 * 60 * 1000,
  minimumPositionUpdateMs: 30 * 1000,
  geolocationOptions: Object.freeze({
    enableHighAccuracy: true,
    maximumAge: 30 * 1000,
    timeout: 15 * 1000
  })
});

const state = {
  map: null,
  position: null,
  userMarker: null,
  accuracyCircle: null,
  resourceLayer: null,
  riskLayer: null,
  resourceAbortController: null,
  riskAbortController: null,
  watchId: null,
  refreshTimer: null,
  lastPositionUpdateAt: 0,
  lastDataRefreshAt: 0,
  hasCentered: false,
  resources: [],
  alerts: []
};

const elements = {
  panel: document.getElementById("homepageLocationPanel"),
  status: document.getElementById("homepageLocationStatus"),
  button: document.getElementById("homepageEnableLocation")
};

const resourceIcons = {
  AMBULANCE: "fa-truck-medical",
  FIRE_TRUCK: "fa-fire-extinguisher",
  FIRE_STATION: "fa-fire-extinguisher",
  HOSPITAL: "fa-hospital",
  POLICE: "fa-shield-halved",
  SHELTER: "fa-house-chimney",
  RESCUE_TEAM: "fa-life-ring",
  BOAT: "fa-ship",
  RELIEF: "fa-box-open"
};

const resourceSidebarIcons = {
  AMBULANCE: "fa-truck-medical",
  HOSPITAL: "fa-plus",
  POLICE: "fa-shield-halved",
  FIRE_STATION: "fa-fire",
  SHELTER: "fa-house",
  RELIEF: "fa-box-open"
};

const $ = (value) => String(value ?? "");

function escapeHtml(value) {
  return $(value).replace(/[&<>\"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[character]));
}

function isLoggedIn() {
  return localStorage.getItem("chronicAILoggedIn") === "true";
}

function setStatus(message) {
  if (elements.status) elements.status.textContent = message;
}

function setLocationAction(visible, disabled = false) {
  if (!elements.button) return;
  elements.button.hidden = !visible;
  elements.button.disabled = disabled;
}

function pointFromPosition(position) {
  const latitude = Number(position?.coords?.latitude);
  const longitude = Number(position?.coords?.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

function distanceKm(first, second) {
  const radians = (value) => value * Math.PI / 180;
  const deltaLatitude = radians(second.latitude - first.latitude);
  const deltaLongitude = radians(second.longitude - first.longitude);
  const a = Math.sin(deltaLatitude / 2) ** 2 + Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude)) * Math.sin(deltaLongitude / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(value) {
  return value < 1 ? `${Math.round(value * 1000)} m` : `${value.toFixed(1)} km`;
}

function mapInstance() {
  return state.map || window.homepageDisasterMap;
}

function resourcePoint(resource) {
  const location = resource?.location || resource?.coordinates || {};
  const latitude = Number(location.latitude ?? resource?.latitude ?? resource?.lat);
  const longitude = Number(location.longitude ?? resource?.longitude ?? resource?.lng ?? resource?.lon);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

function riskColor(level) {
  const normalized = $(level).toLowerCase();
  if (normalized.includes("extreme") || normalized.includes("severe") || normalized.includes("critical")) return "#ef4444";
  if (normalized.includes("high")) return "#f97316";
  if (normalized.includes("moderate")) return "#eab308";
  return "#22c55e";
}

function resourceType(resource) {
  return $(resource?.type || resource?.category || "Emergency resource").replaceAll("_", " ");
}

function resourceIcon(resource) {
  return resourceIcons[$(resource?.type).toUpperCase()] || "fa-location-dot";
}

function ensureLayers() {
  const map = mapInstance();
  if (!map || typeof L === "undefined") return false;
  state.map = map;
  if (!state.resourceLayer) state.resourceLayer = L.layerGroup().addTo(map);
  if (!state.riskLayer) state.riskLayer = L.layerGroup().addTo(map);
  return true;
}

function renderNearbyResources(resources) {
  const container = document.getElementById("homepageNearbyResources");
  if (!container) return;
  container.innerHTML = resources.slice(0, 5).map(({ resource, distance }) => {
    const type = $(resource?.type).toUpperCase();
    const icon = resourceSidebarIcons[type] || "fa-location-dot";
    return `<article class="sidebar-resource-item" tabindex="0" role="button" data-resource-id="${escapeHtml(resource.id || "")}"><span class="sidebar-resource-icon"><i class="fa-solid ${icon}"></i></span><span class="sidebar-resource-copy"><strong>${escapeHtml(resource.name || "Emergency resource")}</strong><small>${formatDistance(distance)}</small></span><i class="fa-solid fa-chevron-right"></i></article>`;
  }).join("") || '<div class="sidebar-empty">No nearby resources found within 50 km.</div>';
  container.querySelectorAll("[data-resource-id]").forEach((row) => {
    const select = () => selectResource(row.dataset.resourceId);
    row.addEventListener("click", select);
    row.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); } });
  });
}

function renderNearbyAlerts(alerts) {
  const container = document.getElementById("homepageNearbyAlerts");
  if (!container) return;
  container.innerHTML = alerts.slice(0, 5).map((item) => {
    const severity = $(item.severity).toLowerCase();
    const badgeClass = severity.includes("moderate") ? "moderate" : severity.includes("low") ? "low" : "";
    return `<article class="sidebar-alert-item"><span class="sidebar-alert-icon"><i class="fa-solid ${escapeHtml(item.icon || "fa-triangle-exclamation")}"></i></span><span class="sidebar-alert-copy"><strong>${escapeHtml(item.type || "Weather alert")}</strong><small>${formatDistance(Number(item.distanceKm) || 0)}</small></span><span class="risk-badge ${badgeClass}">${escapeHtml(item.severity || "Alert")}</span></article>`;
  }).join("") || '<div class="sidebar-empty">No severe weather or disaster alerts nearby.</div>';
}

function renderCriticalAlert(alerts, point) {
  const container = document.getElementById("homepageCriticalAlert");
  if (!container) return;
  const critical = alerts.find((item) => ["critical", "severe", "extreme"].includes($(item.severity).toLowerCase()) && Number(item.distanceKm) <= LOCATION_CONFIG.criticalAlertRadiusKm);
  if (!critical) {
    container.classList.remove("visible");
    container.textContent = "";
    return;
  }
  container.innerHTML = `<strong><i class="fa-solid fa-triangle-exclamation"></i> Critical live alert</strong>${escapeHtml(critical.type || "Severe weather event")} detected ${formatDistance(Number(critical.distanceKm) || 0)} from your current location.<br><small>${escapeHtml(critical.risk || critical.status || "Follow official emergency guidance.")} · Source: ${escapeHtml(critical.source || "Live provider")}</small><br><button type="button" id="homepageViewCriticalAlert">View on Map</button>`;
  container.classList.add("visible");
  container.querySelector("#homepageViewCriticalAlert")?.addEventListener("click", () => {
    if (state.map && critical.latitude && critical.longitude) state.map.setView([Number(critical.latitude), Number(critical.longitude)], 10, { animate: true });
  });
}

function updateWeatherCard(payload) {
  const weather = payload?.weather || {};
  const temperature = Number.isFinite(Number(weather.temperature)) ? `${Math.round(weather.temperature)}°C` : "--";
  const title = document.getElementById("homepageWeatherTitle");
  const summary = document.getElementById("homepageWeatherSummary");
  const temp = document.getElementById("homepageWeatherTemp");
  if (title) title.textContent = payload?.level ? `${payload.level} Risk` : "Live Weather";
  if (summary) summary.textContent = payload?.summary ? `${payload.summary} · Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Waiting for location data";
  if (temp) temp.textContent = temperature;
}

function selectResource(resourceId) {
  const item = state.resources.find(({ resource }) => String(resource.id) === String(resourceId));
  if (!item || !state.map) return;
  state.map.setView([item.location.latitude, item.location.longitude], 15, { animate: true });
  state.resourceLayer.eachLayer((layer) => {
    if (String(layer.options?.title || "") === String(item.resource.name)) layer.openPopup();
  });
}

async function searchLocation(query) {
  const value = $(query).trim();
  if (!value || !state.map) return;
  try {
    const params = new URLSearchParams({ format: "jsonv2", limit: "1", q: value });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Location search unavailable");
    const result = (await response.json())[0];
    if (!result) throw new Error("Location not found");
    const point = { latitude: Number(result.lat), longitude: Number(result.lon) };
    state.map.setView([point.latitude, point.longitude], 12, { animate: true });
    state.lastDataRefreshAt = 0;
    await Promise.allSettled([loadResources(point), loadRisk(point)]);
    setStatus(`Map centered on ${result.display_name}. Showing live data for this area.`);
  } catch (error) {
    setStatus(error.message || "Location search unavailable.");
  }
}

function updateUserMarker(position) {
  if (!ensureLayers()) return;
  const point = pointFromPosition(position);
  if (!point) return;
  const latLng = [point.latitude, point.longitude];
  const icon = L.divIcon({
    className: "homepage-user-marker-wrap",
    html: '<span class="homepage-user-marker"><i class="fa-solid fa-location-dot"></i></span>',
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
  if (!state.userMarker) state.userMarker = L.marker(latLng, { icon, zIndexOffset: 2000, title: "You are here" }).addTo(state.map);
  else state.userMarker.setLatLng(latLng);
  state.userMarker.bindPopup("<strong>You are here</strong><br><small>Your location is used only to show nearby information on this map.</small>");
  const accuracy = Math.max(20, Number(position.coords.accuracy) || 50);
  if (!state.accuracyCircle) state.accuracyCircle = L.circle(latLng, { radius: accuracy, className: "homepage-location-radius", color: "#38bdf8", fillColor: "#38bdf8", fillOpacity: 0.08, weight: 1 }).addTo(state.map);
  else state.accuracyCircle.setLatLng(latLng).setRadius(accuracy);
  state.hasCentered = true;
}

async function loadResources(point) {
  if (!ensureLayers()) return;
  state.resourceAbortController?.abort();
  state.resourceAbortController = new AbortController();
  try {
    const response = await fetch("/api/resources", { signal: state.resourceAbortController.signal, cache: "no-store" });
    if (!response.ok) throw new Error("Resource service unavailable");
    const payload = await response.json();
    const resources = (payload.resources || []).map((resource) => {
      const location = resourcePoint(resource);
      return location ? { resource, location, distance: distanceKm(point, location) } : null;
    }).filter((item) => item && item.distance <= LOCATION_CONFIG.nearbyResourcesRadiusKm).sort((first, second) => first.distance - second.distance);
    state.resources = resources;
    renderNearbyResources(resources);
    state.resourceLayer.clearLayers();
    resources.forEach(({ resource, location, distance }) => {
      const marker = L.marker([location.latitude, location.longitude], {
        icon: L.divIcon({
          className: "homepage-resource-marker-wrap",
          html: `<span class="homepage-resource-marker"><i class="fa-solid ${resourceIcon(resource)}"></i></span>`,
          iconSize: [27, 27],
          iconAnchor: [13, 13]
        }),
        title: resource.name || "Emergency resource"
      });
      const address = resource.location?.address || resource.location?.ward || "Address unavailable";
      marker.bindPopup(`<strong>${escapeHtml(resource.name || "Emergency resource")}</strong><br><small>${escapeHtml(resourceType(resource))} · ${formatDistance(distance)}</small><br>${escapeHtml(address)}<br><small>Status: ${escapeHtml(resource.status || "Available")}</small>`).addTo(state.resourceLayer);
    });
    if (!resources.length) setStatus("Location active. No nearby resources found within 50 km.");
    else setStatus(`Location active. ${resources.length} nearby resource${resources.length === 1 ? "" : "s"} found.`);
  } catch (error) {
    if (error.name !== "AbortError") setStatus("Location active. Nearby resources are temporarily unavailable.");
  } finally {
    state.resourceAbortController = null;
  }
}

async function loadRisk(point) {
  if (!ensureLayers()) return;
  state.riskAbortController?.abort();
  state.riskAbortController = new AbortController();
  const params = new URLSearchParams({ lat: point.latitude, lon: point.longitude, radius: LOCATION_CONFIG.nearbyRiskRadiusKm });
  try {
    const response = await fetch(`/api/risk?${params}`, { signal: state.riskAbortController.signal, cache: "no-store" });
    if (!response.ok) throw new Error("Risk service unavailable");
    const payload = await response.json();
    const situations = (payload.situations || []).filter((item) => Number(item.latitude) && Number(item.longitude) && Number(item.distanceKm) <= LOCATION_CONFIG.nearbyRiskRadiusKm);
    state.alerts = situations;
    renderNearbyAlerts(situations);
    renderCriticalAlert(situations, point);
    updateWeatherCard(payload);
    state.riskLayer.clearLayers();
    situations.forEach((item) => {
      const color = riskColor(item.severity);
      const marker = L.marker([Number(item.latitude), Number(item.longitude)], {
        icon: L.divIcon({
          className: "homepage-risk-marker-wrap",
          html: `<span class="homepage-risk-marker" style="--risk-color:${color}"><i class="fa-solid ${escapeHtml(item.icon || "fa-triangle-exclamation")}"></i></span>`,
          iconSize: [31, 31],
          iconAnchor: [15, 15]
        })
      });
      const updated = item.startTime ? new Date(item.startTime).toLocaleString() : "Latest available reading";
      marker.bindPopup(`<strong>${escapeHtml(item.type || "Weather / disaster alert")}</strong><br><small>${escapeHtml(item.severity || "Unknown")} · ${escapeHtml(item.affectedArea || "Nearby area")}</small><br>${escapeHtml(item.risk || item.status || "Follow official local guidance.")}<br><small>Updated: ${escapeHtml(updated)} · Source: ${escapeHtml(item.source || "Live provider")}</small>`).addTo(state.riskLayer);
    });
    const weather = payload.weather || {};
    const temperature = Number.isFinite(Number(weather.temperature)) ? `${Math.round(weather.temperature)}°C` : "Weather available";
    const riskLabel = payload.level || "Low";
    setStatus(situations.length ? `${temperature} · ${riskLabel} risk · ${situations.length} nearby warning${situations.length === 1 ? "" : "s"}.` : `${temperature} · ${riskLabel} local risk. No severe nearby alerts.`);
  } catch (error) {
    if (error.name !== "AbortError") setStatus("Location active. Weather and risk updates are temporarily unavailable, but your map location is enabled.");
  } finally {
    state.riskAbortController = null;
  }
}

async function refreshNearbyData(point) {
  state.lastDataRefreshAt = Date.now();
  await Promise.allSettled([loadResources(point), loadRisk(point)]);
}

function handlePosition(position) {
  const point = pointFromPosition(position);
  if (!point) return;
  localStorage.setItem("chronicAILocation", JSON.stringify({
    latitude: point.latitude,
    longitude: point.longitude,
    accuracy: Number(position.coords?.accuracy) || null,
    capturedAt: Date.now()
  }));
  const now = Date.now();
  if (state.position && now - state.lastPositionUpdateAt < LOCATION_CONFIG.minimumPositionUpdateMs) return;
  state.position = position;
  state.lastPositionUpdateAt = now;
  updateUserMarker(position);
  setLocationAction(true, false);
  if (now - state.lastDataRefreshAt >= LOCATION_CONFIG.dataRefreshMs) refreshNearbyData(point);
}

function locationError(error) {
  const messages = {
    1: "Location access was denied. You can enable it any time to find nearby resources and risks.",
    2: "Your location could not be determined. Check your device settings and try again.",
    3: "Location lookup timed out. Try again when your GPS signal is stronger."
  };
  setStatus(messages[error?.code] || "Location is unavailable right now. The map will continue working normally.");
  setLocationAction(true, false);
}

function requestLocation() {
  if (!isLoggedIn()) {
    setStatus("Sign in to find resources and critical weather/disaster conditions near you.");
    setLocationAction(true, false);
    return;
  }
  if (!navigator.geolocation) {
    setStatus("Location is not available in this browser. The map will continue working normally.");
    setLocationAction(true, false);
    return;
  }
  setStatus("Updating your saved location...");
  setLocationAction(true, true);
  requestSavedLocation({ ...LOCATION_CONFIG.geolocationOptions, source: "homepage-update" }).then((location) => {
    handlePosition({ coords: location });
  }).catch(locationError);
}

function startLocationWatch() {
  if (!navigator.geolocation || state.watchId !== null) return;
  state.watchId = navigator.geolocation.watchPosition(handlePosition, locationError, LOCATION_CONFIG.geolocationOptions);
}

function cleanup() {
  if (state.watchId !== null) navigator.geolocation?.clearWatch(state.watchId);
  if (state.refreshTimer) window.clearInterval(state.refreshTimer);
  state.resourceAbortController?.abort();
  state.riskAbortController?.abort();
  state.watchId = null;
  state.refreshTimer = null;
}

function initialize() {
  state.map = mapInstance();
  if (!state.map) return;
  window.homepageLocationController = { searchLocation, selectResource, requestLocation };
  elements.button?.addEventListener("click", requestLocation);
  document.querySelectorAll("[data-map-layer]").forEach((input) => input.addEventListener("change", () => {
    const layerType = input.dataset.mapLayer;
    const layer = layerType === "resources" ? state.resourceLayer : layerType === "risk" ? state.riskLayer : null;
    if (layer) {
      if (input.checked) layer.addTo(state.map);
      else state.map.removeLayer(layer);
    } else if (layerType === "location") {
      [state.userMarker, state.accuracyCircle].forEach((item) => {
        if (!item) return;
        if (input.checked) item.addTo(state.map);
        else state.map.removeLayer(item);
      });
    }
  }));
  if (getSavedLocation()) setStatus("National disaster map active. Your location is hidden until you select Enable Location.");
  else setStatus(isLoggedIn() ? "National disaster map active. Enable location only when you need nearby services." : "National disaster map active. Sign in to use nearby services.");
  setLocationAction(true, false);
  subscribeToLocationUpdates((location) => handlePosition({ coords: location }));
  window.addEventListener("storage", (event) => {
    if (event.key === "chronicAILoggedIn" && event.newValue !== "true") cleanup();
  });
  window.addEventListener("beforeunload", cleanup, { once: true });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
else initialize();
