"use strict";

const FEED_CONFIG = Object.freeze({ refreshMs: 5 * 60 * 1000, staleAfterMs: 15 * 60 * 1000 });
const state = { events: [], markerLayer: null, controller: null, timer: null, updatedAt: null, suppressCardClick: false };

const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[character]));
const severityConfig = Object.freeze({
  low: { color: "#22c55e", label: "LOW", icon: "fa-house-crack" },
  moderate: { color: "#eab308", label: "MODERATE", icon: "fa-house-crack" },
  high: { color: "#f97316", label: "HIGH", icon: "fa-house-crack" },
  critical: { color: "#ef4444", label: "CRITICAL", icon: "fa-house-crack" }
});

function timeAgo(value) {
  const age = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(age / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

function severity(value) {
  return severityConfig[String(value || "low").toLowerCase()] || severityConfig.low;
}

function eventInformationUrl(event) {
  if (event.sourceUrl || event.detailUrl) return event.sourceUrl || event.detailUrl;
  const query = encodeURIComponent(`${event.type || "disaster"} ${event.title || "event"} ${event.location || "South Asia"}`);
  return `https://www.google.com/search?q=${query}`;
}

function eventCard(event, index) {
  const config = severity(event.severity);
  const informationUrl = eventInformationUrl(event);
  return `<a class="live-disaster-card" data-disaster-index="${index}" href="${escapeHtml(informationUrl)}" target="_self" aria-label="Open official article about ${escapeHtml(event.title)}" style="--event-color:${config.color}"><div class="live-disaster-card-top"><span class="live-disaster-icon"><i class="fa-solid ${escapeHtml(event.icon || config.icon)}"></i></span><span class="live-disaster-type">${escapeHtml(event.type)}</span><span class="live-disaster-severity">${config.label}</span></div><strong>${escapeHtml(event.title)}</strong><span class="live-disaster-location"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(event.location)}</span><span class="live-disaster-measurement">${escapeHtml(event.measurement)}</span><div class="live-disaster-card-bottom"><span>${timeAgo(event.timestamp || event.updatedAt)}</span><span class="live-disaster-article-link">Read article <i class="fa-solid fa-arrow-up-right-from-square"></i></span></div></a>`;
}

function centerEvent(event) {
  const map = window.homepageDisasterMap;
  if (!map || !Number.isFinite(Number(event.latitude)) || !Number.isFinite(Number(event.longitude))) return;
  map.setView([Number(event.latitude), Number(event.longitude)], 8, { animate: true });
  const marker = state.markerLayer?.getLayers().find((item) => item.options?.disasterId === event.id);
  marker?.openPopup();
  document.getElementById("homepageMapTitle")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function renderMarkers() {
  // The homepage national radar owns the single live map layer.
  // This feed only renders the telemetry cards to avoid duplicate markers.
  return;
}

function render() {
  const track = $("liveDisasterTrack");
  const status = $("liveDisasterStatus");
  const updated = $("liveDisasterUpdated");
  if (!track) return;
  if (!state.events.length) {
    track.innerHTML = '<div class="live-disaster-empty"><i class="fa-solid fa-circle-check"></i> No major active disaster alerts reported in India.</div>';
    status.textContent = "No recent authoritative disaster events reported for India.";
    if (updated) {
      updated.textContent = state.updatedAt ? new Date(state.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "No recent update";
    }
    return;
  }
  const cards = state.events.map(eventCard).join("");
  track.innerHTML = cards + cards;
  track.classList.toggle("is-animated", state.events.length > 0);
  status.textContent = `${state.events.length} recent South Asia event${state.events.length === 1 ? "" : "s"} · click a card to view it on the map.`;
  track.querySelectorAll("[data-disaster-index]").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (!state.suppressCardClick) return;
      event.preventDefault();
      state.suppressCardClick = false;
    });
  });
}

async function loadFeed() {
  state.controller?.abort();
  state.controller = new AbortController();
  try {
    const response = await fetch("/api/disasters/india", { cache: "no-store", signal: state.controller.signal });
    if (!response.ok) throw new Error("India disaster feed unavailable");
    const payload = await response.json();
    state.events = (payload.events || []).filter((event) => event.timestamp && Date.now() - new Date(event.timestamp).getTime() <= 7 * 24 * 60 * 60 * 1000);
    state.updatedAt = new Date();
    $("liveDisasterUpdated").textContent = state.updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (payload.sourceUrl) { $("liveDisasterSource").href = payload.sourceUrl; $("liveDisasterSource").textContent = payload.source; }
    render();
    renderMarkers();
  } catch (error) {
    if (error.name === "AbortError") return;
    state.events = [];
    state.updatedAt = new Date();
    $("liveDisasterStatus").textContent = "Live India disaster data is temporarily unavailable; no recent events are being reported.";
    $("liveDisasterUpdated").textContent = new Date(state.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    render();
  } finally {
    state.controller = null;
  }
}

function initialize() {
  loadFeed();
  state.timer = window.setInterval(loadFeed, FEED_CONFIG.refreshMs);
  const viewport = $("liveDisasterViewport");
  const track = $("liveDisasterTrack");
  viewport?.addEventListener("mouseenter", () => track?.classList.add("is-paused"));
  viewport?.addEventListener("mouseleave", () => track?.classList.remove("is-paused"));
  viewport?.addEventListener("focusin", () => track?.classList.add("is-paused"));
  viewport?.addEventListener("focusout", () => track?.classList.remove("is-paused"));
  let dragStartX = 0;
  let dragOffsetX = 0;
  let isDragging = false;
  let dragMoved = false;

  viewport?.addEventListener("pointerdown", (event) => {
    if (!track || event.button !== 0) return;
    const transform = getComputedStyle(track).transform;
    const matrix = transform !== "none" ? new DOMMatrixReadOnly(transform) : null;
    dragStartX = event.clientX;
    dragOffsetX = matrix?.m41 || 0;
    isDragging = true;
    dragMoved = false;
    state.suppressCardClick = false;
    track.classList.add("is-dragging", "is-paused");
    track.style.transform = `translate3d(${dragOffsetX}px, 0, 0)`;
    viewport.setPointerCapture(event.pointerId);
  });

  viewport?.addEventListener("pointermove", (event) => {
    if (!isDragging || !track) return;
    const deltaX = event.clientX - dragStartX;
    if (Math.abs(deltaX) > 8) dragMoved = true;
    track.style.transform = `translate3d(${dragOffsetX + deltaX}px, 0, 0)`;
    event.preventDefault();
  });

  const stopDragging = (event) => {
    if (!isDragging || !track) return;
    isDragging = false;
    state.suppressCardClick = dragMoved;
    track.classList.remove("is-dragging");
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
  };
  viewport?.addEventListener("pointerup", stopDragging);
  viewport?.addEventListener("pointercancel", stopDragging);
  window.addEventListener("beforeunload", () => { state.controller?.abort(); if (state.timer) clearInterval(state.timer); });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
else initialize();
