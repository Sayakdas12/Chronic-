import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { get, onValue, push, ref, remove, set, update } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";
import { getDownloadURL, ref as storageRef, uploadBytes } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js";
import { auth, database, storage } from "./firebase-client.js";

const state = { user: null, isAdmin: false, people: [], markers: [], map: null };
const $ = id => document.getElementById(id);
const safe = value => String(value || "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const show = id => $(id).showModal();
const message = (id, text, ok = false) => { $(id).textContent = text; $(id).style.color = ok ? "#8fe7c9" : "#ff9ba2"; };
const knownIds = JSON.parse(localStorage.getItem("missingPersonReportIds") || "[]");
const hiddenIds = JSON.parse(localStorage.getItem("hiddenMissingPersonIds") || "[]");

$("personPhoto").required = true;
document.addEventListener("submit", event => {
  if (event.target.id === "missingForm" && !state.user) {
    event.preventDefault();
    event.stopImmediatePropagation();
    message("reportMessage", "Please wait for authentication to finish, then try again.");
  }
}, true);

document.addEventListener("submit", event => {
  if (event.target.id !== "missingForm") return;
  const file = $("personPhoto").files?.[0];
  if (!file) {
    event.preventDefault();
    event.stopImmediatePropagation();
    message("reportMessage", "Please upload a photo before reporting a missing person.");
    return;
  }
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) {
    event.preventDefault();
    event.stopImmediatePropagation();
    message("reportMessage", "Photo must be JPG, PNG, or WEBP under 5 MB.");
  }
}, true);

function firebaseMessage(error) {
  const code = error?.code || "";
  if (code.includes("permission-denied")) return "Firebase denied this action. Deploy database.rules.json and sign in again.";
  if (code.includes("storage/unauthorized")) return "Photo upload was denied. Deploy storage.rules or submit without a photo.";
  if (code.includes("storage/unknown")) return "Firebase Storage is not enabled for this project yet.";
  if (code.includes("network")) return "Network error. Check your connection and try again.";
  return error?.message || "Unable to submit this report.";
}

function withTimeout(promise, label, milliseconds = 10000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out. Check Firebase Database, Storage, and network settings.`)), milliseconds))
  ]);
}

window.addEventListener("unhandledrejection", event => {
  if (event.reason?.code) message("reportMessage", firebaseMessage(event.reason));
});

const locationField = $("lastSeenLocation");
const locationLabel = locationField?.parentElement;
if (locationField && locationLabel && !$("personLocationButton")) {
  const wrapper = document.createElement("div");
  wrapper.className = "inline-field";
  locationField.parentElement.insertBefore(wrapper, locationField);
  wrapper.appendChild(locationField);
  const button = document.createElement("button");
  button.type = "button";
  button.id = "personLocationButton";
  button.className = "outline-button";
  button.setAttribute("aria-label", "Use current location");
  button.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i>';
  wrapper.appendChild(button);
  ["personLatitude", "personLongitude"].forEach(id => { const input = document.createElement("input"); input.type = "hidden"; input.id = id; locationLabel.appendChild(input); });
  button.addEventListener("click", () => navigator.geolocation?.getCurrentPosition(position => { $("personLatitude").value = position.coords.latitude; $("personLongitude").value = position.coords.longitude; locationField.value = `Current location (${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)})`; }, () => message("reportMessage", "Location permission was not granted.")));
}

function normalize(item, id) { return { id, ...item, status: item.status || "Pending" }; }
function matches(person) {
  const name = $("searchName").value.trim().toLowerCase();
  const location = $("searchLocation").value.trim().toLowerCase();
  const age = $("searchAge").value.trim();
  const status = $("searchStatus").value;
  return (!name || person.name?.toLowerCase().includes(name)) && (!location || person.location?.toLowerCase().includes(location)) && (!age || String(person.age) === age) && (!status || person.status === status);
}
function renderPeople() {
  const people = state.people.filter(person => !hiddenIds.includes(person.id)).filter(matches);
  $("resultCount").textContent = `${people.length} alert${people.length === 1 ? "" : "s"}`;
  $("personGrid").innerHTML = people.length ? people.map(person => `<article class="person-card" data-person="${safe(person.id)}"><img src="${safe(person.photoUrl || "../images/person.jpeg")}" onerror="this.onerror=null;this.src='../images/person.jpeg'" alt="${safe(person.name)}" loading="lazy"><div class="person-card-body"><h3>${safe(person.name)}</h3><p>${safe(person.age)} years old Â· ${safe(person.location)}</p><small>Last seen: ${safe(person.lastSeenDate)}</small><span class="status-pill ${person.status === "Found" ? "status-found" : ""}">${safe(person.status)}</span></div></article>`).join("") : `<div class="empty-state"><i class="fa-solid fa-magnifying-glass"></i><p>No approved missing-person alerts match your search.</p></div>`;
  document.querySelectorAll(".person-card").forEach(card => card.addEventListener("click", () => openDetails(card.dataset.person)));
  renderMap(people);
}
function renderMyReports() {
  const reports = JSON.parse(localStorage.getItem("localMissingPersonReports") || "[]").filter(item => !hiddenIds.includes(item.id));
  $("myReportsGrid").innerHTML = reports.length ? reports.map(person => `<div class="my-report-row"><img src="${safe(person.photoUrl || "../images/person.jpeg")}" onerror="this.onerror=null;this.src='../images/person.jpeg'" alt="${safe(person.name)}"><span><strong>${safe(person.name)}</strong><small>${safe(person.status)} Â· ${safe(person.id)}</small></span><button class="delete-local-button" data-hide-report="${safe(person.id)}" type="button"><i class="fa-solid fa-trash"></i></button></div>`).join("") : `<p class="empty-state">Your submitted reports will appear here.</p>`;
  document.querySelectorAll("[data-hide-report]").forEach(button => button.addEventListener("click", () => { const id = button.dataset.hideReport; hiddenIds.push(id); localStorage.setItem("hiddenMissingPersonIds", JSON.stringify(hiddenIds)); renderMyReports(); renderPeople(); }));
}
function renderMap(people) {
  if (!state.map) { state.map = L.map("missingMap").setView([22.5726, 88.3639], 5); L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "Â© OpenStreetMap contributors" }).addTo(state.map); }
  state.markers.forEach(marker => marker.remove()); state.markers = [];
  people.filter(person => person.approved && Number.isFinite(Number(person.latitude)) && Number.isFinite(Number(person.longitude))).forEach(person => { const marker = L.marker([person.latitude, person.longitude]).addTo(state.map).bindPopup(`<strong>${safe(person.name)}</strong><br>${safe(person.location)}<br>${safe(person.status)}`); state.markers.push(marker); });
}
function loadLocalPeople() {
  const localPeople = JSON.parse(localStorage.getItem("localMissingPersonReports") || "[]").map(item => normalize(item, item.id));
  if (localPeople.length) {
    state.people = localPeople;
    renderPeople();
    renderMyReports();
  }
}
async function loadPeople() { let remotePeople = []; try { const snapshot = await get(ref(database, state.isAdmin ? "missingPersons" : "missingPublic")); remotePeople = snapshot.exists() ? Object.entries(snapshot.val()).map(([id, item]) => normalize(item, id)).filter(item => state.isAdmin || item.approved) : []; } catch (error) { console.warn("Firebase alerts unavailable; showing local alerts.", error); } const localPeople = JSON.parse(localStorage.getItem("localMissingPersonReports") || "[]").map(item => normalize(item, item.id)); state.people = [...remotePeople, ...localPeople.filter(local => !remotePeople.some(remote => remote.id === local.id))]; renderPeople(); renderMyReports(); }
async function openDetails(id) { const person = state.people.find(item => item.id === id); if (!person) return; $("detailContent").innerHTML = `<span class="eyebrow">${safe(person.status)} ALERT</span><h2>${safe(person.name)}</h2><img src="${safe(person.photoUrl || "../images/person.jpeg")}" onerror="this.onerror=null;this.src='../images/person.jpeg'" alt="${safe(person.name)}"><p><strong>Age:</strong> ${safe(person.age)}</p><p><strong>Last seen:</strong> ${safe(person.location)} on ${safe(person.lastSeenDate)}</p><p>${safe(person.details)}</p><p class="privacy-note">If you have information, use the Submit a Tip option. Do not approach a person in danger.</p>`; $("detailModal").showModal(); }
async function uploadPhoto(file, path) { if (!file) return ""; if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) throw new Error("Photo must be JPG, PNG, or WEBP under 5 MB."); const target = storageRef(storage, `${path}/${crypto.randomUUID()}-${file.name.replace(/[^a-z0-9._-]/gi, "_")}`); return getDownloadURL(await uploadBytes(target, file)); }
function readLocalPhoto(file) { return new Promise((resolve, reject) => { if (!file) return resolve(""); const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }); }

$("searchButton").addEventListener("click", renderPeople);
["searchName", "searchLocation", "searchAge", "searchStatus"].forEach(id => $(id).addEventListener("input", renderPeople));
$("closeDetail").addEventListener("click", () => $("detailModal").close());
["reportModal", "tipModal", "detailModal"].forEach(id => {
  const modal = $(id);
  modal?.querySelector(".close-modal")?.addEventListener("click", event => {
    event.preventDefault();
    modal.close();
  });
});
[...document.querySelectorAll("[data-open]")].forEach(button => button.addEventListener("click", () => show(button.dataset.open)));
$("tipAnonymous").addEventListener("change", event => { $("tipContactWrap").classList.toggle("hidden", event.target.checked); });
$("refreshAdmin").addEventListener("click", loadPeople);

$("missingForm").addEventListener("submit", async event => { event.preventDefault(); const button = $("submitMissing"); button.disabled = true; message("reportMessage", "Sending for admin verification..."); try { const photoUrl = await uploadPhoto($("personPhoto").files[0], `missing-persons/${state.user.uid}`); const newRef = push(ref(database, "missingPersons")); await set(newRef, { name: $("personName").value.trim(), age: Number($("personAge").value), location: $("lastSeenLocation").value.trim(), latitude: Number($("personLatitude")?.value) || null, longitude: Number($("personLongitude")?.value) || null, lastSeenDate: $("lastSeenDate").value, details: $("personDetails").value.trim(), contactInfo: $("contactInfo").value.trim(), photoUrl, locationApproved: $("locationApproved").checked, status: "Pending", approved: false, reporterUid: state.user.uid, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); knownIds.push(newRef.key); localStorage.setItem("missingPersonReportIds", JSON.stringify(knownIds)); message("reportMessage", "Report submitted for verification.", true); setTimeout(() => { $("reportModal").close(); event.target.reset(); }, 800); } catch (error) { message("reportMessage", error.message || "Unable to submit report."); } finally { button.disabled = false; } });
$("tipForm").addEventListener("submit", async event => { event.preventDefault(); try { const personId = $("tipPersonId").value.trim(); await push(ref(database, `missingTips/${personId}`), { message: $("tipMessage").value.trim(), anonymous: $("tipAnonymous").checked, contact: $("tipAnonymous").checked ? null : $("tipContact").value.trim(), reporterUid: $("tipAnonymous").checked ? null : state.user.uid, status: "New", createdAt: new Date().toISOString() }); message("tipMessageStatus", "Tip submitted securely.", true); setTimeout(() => { $("tipModal").close(); event.target.reset(); }, 800); } catch { message("tipMessageStatus", "Unable to submit tip. Please try again."); } });

async function publishPublic(id, person, approved) { const publicRecord = { name: person.name, age: person.age, location: person.location, lastSeenDate: person.lastSeenDate, details: person.details, photoUrl: person.photoUrl || "", status: person.status, approved, latitude: person.latitude || null, longitude: person.longitude || null, updatedAt: new Date().toISOString() }; if (approved) await set(ref(database, `missingPublic/${id}`), publicRecord); else await remove(ref(database, `missingPublic/${id}`)); }
async function renderAdmin() { if (!state.isAdmin) return; $("adminSection").classList.remove("hidden"); const snapshot = await get(ref(database, "missingPersons")); const entries = snapshot.exists() ? Object.entries(snapshot.val()).map(([id, item]) => normalize(item, id)) : []; $("adminGrid").innerHTML = entries.length ? entries.map(person => `<div class="admin-row"><div class="admin-row-head"><h3>${safe(person.name)} <small>${safe(person.id)}</small></h3><span class="status-pill">${safe(person.status)}</span></div><p>${safe(person.location)} Â· ${safe(person.details)}</p><div class="admin-controls"><select data-status="${person.id}">${["Pending","Active","Found","Closed"].map(status => `<option ${status === person.status ? "selected" : ""}>${status}</option>`).join("")}</select><button data-approve="${person.id}">${person.approved ? "Unapprove" : "Approve"}</button><button data-delete="${person.id}">Delete</button></div></div>`).join("") : `<div class="empty-state"><p>No reports to review.</p></div>`; document.querySelectorAll("[data-status]").forEach(select => select.addEventListener("change", async () => { const person = entries.find(item => item.id === select.dataset.status); await update(ref(database, `missingPersons/${select.dataset.status}`), { status: select.value, updatedAt: new Date().toISOString() }); if (person?.approved) await publishPublic(person.id, { ...person, status: select.value }, true); await renderAdmin(); })); document.querySelectorAll("[data-approve]").forEach(button => button.addEventListener("click", async () => { const person = entries.find(item => item.id === button.dataset.approve); const approved = !person.approved; await update(ref(database, `missingPersons/${button.dataset.approve}`), { approved, updatedAt: new Date().toISOString() }); await publishPublic(person.id, { ...person, approved }, approved); await loadPeople(); await renderAdmin(); })); document.querySelectorAll("[data-delete]").forEach(button => button.addEventListener("click", async () => { if (confirm("Delete this missing-person report?")) { await remove(ref(database, `missingPersons/${button.dataset.delete}`)); await remove(ref(database, `missingPublic/${button.dataset.delete}`)); await loadPeople(); await renderAdmin(); } })); }

loadLocalPeople();
renderMyReports();
onAuthStateChanged(auth, async user => { state.user = user; if (!user) return; const profile = await get(ref(database, `users/${user.uid}`)); state.isAdmin = profile.exists() && profile.val().role === "admin"; await loadPeople(); await renderAdmin(); });

function watchStatusUpdates() {
  knownIds.forEach(id => onValue(ref(database, `missingPersons/${id}/status`), snapshot => {
    const status = snapshot.val();
    if (!status || !("Notification" in window)) return;
    const last = localStorage.getItem(`missingStatus:${id}`);
    if (last && last !== status && Notification.permission === "granted") new Notification("Missing-person report updated", { body: `${id} is now ${status}.` });
    localStorage.setItem(`missingStatus:${id}`, status);
  }));
}

if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
watchStatusUpdates();

const adminObserver = new MutationObserver(() => {
  document.querySelectorAll(".admin-row").forEach(row => {
    if (row.querySelector("[data-edit]") || !row.querySelector("[data-status]")) return;
    const id = row.querySelector("[data-status]").dataset.status;
    const edit = document.createElement("button");
    edit.type = "button";
    edit.dataset.edit = id;
    edit.textContent = "Edit";
    row.querySelector(".admin-controls")?.prepend(edit);
  });
});
adminObserver.observe($("adminGrid"), { childList: true });

document.addEventListener("submit", async event => {
  if (event.target.id !== "missingForm" || !state.user) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const button = $("submitMissing");
  button.disabled = true;
  message("reportMessage", "Saving your help alert...");
  let record = {
    name: $("personName").value.trim(), age: Number($("personAge").value),
    location: $("lastSeenLocation").value.trim(),
    latitude: Number($("personLatitude")?.value) || null,
    longitude: Number($("personLongitude")?.value) || null,
    lastSeenDate: $("lastSeenDate").value, details: $("personDetails").value.trim(),
    contactInfo: $("contactInfo").value.trim(), photoUrl: "",
    locationApproved: $("locationApproved").checked, status: "Active", approved: true,
    reporterUid: state.user.uid, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  try {
    const file = $("personPhoto").files?.[0];
    const localPhoto = await readLocalPhoto(file);
    let photoUrl = localPhoto;
    try { photoUrl = await withTimeout(uploadPhoto(file, `missing-persons/${state.user.uid}`), "Photo upload"); } catch (uploadError) { console.warn("Firebase photo upload failed; keeping the photo locally.", uploadError); }
    const newRef = push(ref(database, "missingPersons"));
    record.photoUrl = photoUrl;
    await withTimeout(set(newRef, record), "Private report save");
    await withTimeout(set(ref(database, `missingPublic/${newRef.key}`), {
      name: record.name, age: record.age, location: record.location, lastSeenDate: record.lastSeenDate,
      details: record.details, photoUrl: record.photoUrl, status: record.status, approved: true,
      reporterUid: record.reporterUid, latitude: record.latitude, longitude: record.longitude, updatedAt: record.updatedAt
    }), "Public alert publish");
    knownIds.push(newRef.key);
    localStorage.setItem("missingPersonReportIds", JSON.stringify(knownIds));
    message("reportMessage", "Alert published successfully.", true);
    setTimeout(() => { $("reportModal").close(); event.target.reset(); loadPeople(); }, 800);
  } catch (error) {
    const localId = `LOCAL-MISSING-${Date.now()}`;
    const localReports = JSON.parse(localStorage.getItem("localMissingPersonReports") || "[]");
    localReports.push({ ...record, id: localId, syncStatus: "pending" });
    localStorage.setItem("localMissingPersonReports", JSON.stringify(localReports));
    knownIds.push(localId);
    localStorage.setItem("missingPersonReportIds", JSON.stringify(knownIds));
    message("reportMessage", `Saved locally as ${localId}. Firebase sync is unavailable.`, true);
    console.warn("Firebase missing-person sync failed:", error);
    setTimeout(() => { $("reportModal").close(); event.target.reset(); loadPeople(); }, 900);
  } finally {
    button.disabled = false;
  }
}, true);

$("adminGrid").addEventListener("click", async event => {
  const button = event.target.closest("[data-edit]");
  if (!button) return;
  const snapshot = await get(ref(database, `missingPersons/${button.dataset.edit}`));
  if (!snapshot.exists()) return;
  const person = snapshot.val();
  const name = prompt("Person name", person.name);
  if (name === null) return;
  const location = prompt("Last-seen location", person.location);
  const details = prompt("Details", person.details);
  await update(ref(database, `missingPersons/${button.dataset.edit}`), { name: name.trim().slice(0, 120), location: (location || person.location).trim().slice(0, 240), details: (details || person.details).trim().slice(0, 2000), updatedAt: new Date().toISOString() });
  await renderAdmin();
});

