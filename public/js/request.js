"use strict";

const API_BASE = "";
const form = document.getElementById("helpRequestForm");
const descriptionInput = document.getElementById("requestDescription");
const locationInput = document.getElementById("locationText");
const mediaInput = document.getElementById("mediaInput");
const mediaName = document.getElementById("mediaName");
const analyzeButton = document.getElementById("analyzeButton");
const confirmButton = document.getElementById("confirmRequestButton");
const editButton = document.getElementById("editRequestButton");
const reviewCard = document.getElementById("reviewCard");
const reviewContent = document.getElementById("reviewContent");
const successCard = document.getElementById("successCard");
const requestIdOutput = document.getElementById("requestId");
const trackButton = document.getElementById("trackRequestButton");
const message = document.getElementById("formMessage");
const locationStatus = document.getElementById("locationStatus");
const voiceButton = document.getElementById("voiceButton");
const voiceStatus = document.getElementById("voiceStatus");

let requestDraft = null;
let imageData = null;

function setMessage(text, success = false) {
	message.textContent = text;
	message.style.color = success ? "#8fe7c9" : "#ff9ba2";
}

async function readApiResponse(response) {
	const contentType = response.headers.get("content-type") || "";
	const body = await response.text();

	if (!contentType.includes("application/json")) {
		if (body.trimStart().startsWith("<!DOCTYPE") || body.trimStart().startsWith("<html")) {
			throw new Error("The API returned a web page. Open this page through http://localhost:3000 and make sure the server is running.");
		}
		throw new Error(`The server returned an unexpected response (${response.status}).`);
	}

	try {
		return JSON.parse(body);
	} catch {
		throw new Error("The server returned invalid JSON. Restart the ChronicAI server and try again.");
	}
}

function selectedHelpType() {
	return document.querySelector("input[name='helpType']:checked")?.value || "Other";
}

function setLoading(button, loading, loadingText, defaultText) {
	button.disabled = loading;
	button.innerHTML = loading
		? `<i class="fa-solid fa-spinner fa-spin"></i> ${loadingText}`
		: defaultText;
}

function escapeHtml(value) {
	return String(value || "").replace(/[&<>'"]/g, character => ({
		"&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
	}[character]));
}

function renderReview(draft) {
	const analysis = draft.analysis || {};
	reviewContent.innerHTML = `
		<div class="review-item"><small>Help type</small><strong>${escapeHtml(draft.helpType)}</strong></div>
		<div class="review-item"><small>AI priority</small><strong>${escapeHtml(analysis.priority || analysis.severity || "MEDIUM")}</strong></div>
		<div class="review-item"><small>Suggested department</small><strong>${escapeHtml(analysis.department || analysis.responsibleAuthority || "Local response team")}</strong></div>
		<div class="review-item"><small>Location</small><strong>${escapeHtml(draft.location)}</strong></div>
		<div class="review-item"><small>Description</small><strong>${escapeHtml(draft.description)}</strong></div>
		<div class="review-item"><small>Media</small><strong>${escapeHtml(draft.mediaName || "No media attached")}</strong></div>`;
	reviewCard.classList.remove("hidden");
	reviewCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

function readImage(file) {
	return new Promise((resolve, reject) => {
		if (!file || !file.type.startsWith("image/")) {
			resolve(null);
			return;
		}
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result);
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}

mediaInput.addEventListener("change", async () => {
	const file = mediaInput.files?.[0];
	imageData = await readImage(file);
	mediaName.textContent = file ? `${file.name} selected` : "";
});

document.getElementById("locationButton").addEventListener("click", () => {
	if (!navigator.geolocation) {
		locationStatus.textContent = "Location is not available in this browser.";
		return;
	}
	locationStatus.textContent = "Finding your current location...";
	navigator.geolocation.getCurrentPosition(
		position => {
			const { latitude, longitude } = position.coords;
			locationInput.value = `Current location (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`;
			locationStatus.textContent = "Location captured for routing.";
		},
		() => { locationStatus.textContent = "Location permission was not granted. Enter it manually."; },
		{ enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
	);
});

if ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) {
	const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
	voiceButton.addEventListener("click", () => {
		const recognition = new SpeechRecognition();
		recognition.lang = "en-IN";
		recognition.interimResults = false;
		voiceStatus.textContent = "Listening... speak now";
		recognition.onresult = event => {
			const spokenText = event.results[0][0].transcript;
			descriptionInput.value = `${descriptionInput.value} ${spokenText}`.trim();
			voiceStatus.textContent = "Voice description added.";
		};
		recognition.onerror = () => { voiceStatus.textContent = "Voice input was unavailable."; };
		recognition.onend = () => { if (voiceStatus.textContent.includes("Listening")) voiceStatus.textContent = "Text or voice description"; };
		recognition.start();
	});
} else {
	voiceButton.disabled = true;
	voiceStatus.textContent = "Voice input is not supported in this browser.";
}

form.addEventListener("submit", async event => {
	event.preventDefault();
	const description = descriptionInput.value.trim();
	const location = locationInput.value.trim();
	if (!description || !location) {
		setMessage("Add a description and share your current location first.");
		return;
	}
	setLoading(analyzeButton, true, "Analyzing...", "Analyze my request");
	setMessage("");
	try {
		const response = await fetch(`${API_BASE}/api/analyze`, {
			method: "POST", headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				description: `[Help type: ${selectedHelpType()}] ${description}`,
				location,
				reporterName: localStorage.getItem("chronicAIUserName") || "Citizen",
				image: imageData
			})
		});
		const result = await readApiResponse(response);
		if (!response.ok || !result.success) throw new Error(result.error || "AI analysis failed.");
		requestDraft = {
			helpType: selectedHelpType(), description, location,
			mediaName: mediaInput.files?.[0]?.name || "",
			analysis: result.analysis, image: imageData,
			reporterName: localStorage.getItem("chronicAIUserName") || "Citizen",
			reporterUid: localStorage.getItem("chronicAIUserId") || ""
		};
		renderReview(requestDraft);
		setMessage("AI analysis complete. Review your request before sending.", true);
	} catch (error) {
		setMessage(error.message || "Unable to analyze request.");
	} finally {
		setLoading(analyzeButton, false, "Analyzing...", '<i class="fa-solid fa-wand-magic-sparkles"></i> Analyze my request');
	}
});

editButton.addEventListener("click", () => {
	reviewCard.classList.add("hidden");
	descriptionInput.focus();
});

confirmButton.addEventListener("click", async () => {
	if (!requestDraft) return;
	setLoading(confirmButton, true, "Sending...", "Confirm and send");
	try {
		const response = await fetch(`${API_BASE}/api/reports`, {
			method: "POST", headers: { "Content-Type": "application/json" },
			body: JSON.stringify(requestDraft)
		});
		const result = await readApiResponse(response);
		if (!response.ok || !result.success) throw new Error(result.error || "Unable to create request.");
		const id = result.report?.reportId || result.reportId;
		requestIdOutput.textContent = id || "REQUEST-CREATED";
		trackButton.href = `track.html?id=${encodeURIComponent(id || "")}`;
		reviewCard.classList.add("hidden");
		document.querySelector(".request-layout").classList.add("hidden");
		successCard.classList.remove("hidden");
		successCard.scrollIntoView({ behavior: "smooth", block: "center" });
	} catch (error) {
		setMessage(error.message || "Unable to send request.");
	} finally {
		setLoading(confirmButton, false, "Sending...", '<i class="fa-solid fa-paper-plane"></i> Confirm and send');
	}
});

