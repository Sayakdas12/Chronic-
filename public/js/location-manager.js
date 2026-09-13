"use strict";

const LOCATION_STORAGE_KEY = "chronicAILocation";
const LOCATION_EVENT_NAME = "chronicai:location-updated";
const DEFAULT_OPTIONS = Object.freeze({ enableHighAccuracy: true, maximumAge: 30000, timeout: 12000 });
let activeRequest = null;

function normalizeLocation(value) {
    const latitude = Number(value?.latitude ?? value?.lat);
    const longitude = Number(value?.longitude ?? value?.lng ?? value?.lon);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
    return {
        latitude,
        longitude,
        accuracy: Number.isFinite(Number(value?.accuracy)) ? Number(value.accuracy) : null,
        capturedAt: Number(value?.capturedAt || value?.savedAt) || 0
    };
}

export function getSavedLocation() {
    try {
        return normalizeLocation(JSON.parse(localStorage.getItem(LOCATION_STORAGE_KEY) || "null"));
    } catch {
        return null;
    }
}

export function saveLocation(location, source = "application") {
    const normalized = normalizeLocation({ ...location, capturedAt: location?.capturedAt || Date.now() });
    if (!normalized) return null;
    localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify({ ...normalized, source, updatedAt: Date.now() }));
    window.dispatchEvent(new CustomEvent(LOCATION_EVENT_NAME, { detail: normalized }));
    return normalized;
}

export function subscribeToLocationUpdates(listener) {
    const handler = (event) => listener(event.detail);
    window.addEventListener(LOCATION_EVENT_NAME, handler);
    return () => window.removeEventListener(LOCATION_EVENT_NAME, handler);
}

export function requestLocation(options = {}) {
    if (!navigator.geolocation) return Promise.reject(new Error("Location is not available in this browser."));
    if (activeRequest) return activeRequest;
    const geolocationOptions = { ...DEFAULT_OPTIONS, ...options };
    activeRequest = new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const location = saveLocation({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    capturedAt: Date.now()
                }, options.source || "user-update");
                activeRequest = null;
                location ? resolve(location) : reject(new Error("The browser returned an invalid location."));
            },
            (error) => {
                activeRequest = null;
                reject(error);
            },
            geolocationOptions
        );
    });
    return activeRequest;
}

export async function ensureInitialLocation(options = {}) {
    const saved = getSavedLocation();
    if (saved) return saved;
    return requestLocation({ ...options, source: options.source || "initial-login" });
}

export { LOCATION_STORAGE_KEY, LOCATION_EVENT_NAME };
