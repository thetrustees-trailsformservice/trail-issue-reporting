document.addEventListener("DOMContentLoaded", () => {
// ========================
// CONFIG
// ========================
const POWER_AUTOMATE_URL =
  "https://default912a785a67cc420da3dce817f6ff7b.fc.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/7823418fc89b4417928398e5c3fee82b/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=GEAypdes3LSTSZEm39ASOMtQH1isZ3x95j-_fppaBcc";

// ========================
// GLOBALS
// ========================
let map;
let marker = null;
let boundaryLayer = null;
let boundaryShadowLayer = null;
let isSubmitting = false;
let trailsLayer = null;

// ========================
// ELEMENTS
// ========================
const siteSelect = document.getElementById("siteSelect");
const submitBtn = document.getElementById("submitBtn");
const statusMessage = document.getElementById("statusMessage");
const photoInput = document.getElementById("photo");
const photoPreview = document.getElementById("photoPreview");
const issueType = document.getElementById("issueType");
const severity = document.getElementById("severity");
const description = document.getElementById("description");
const fakeFileBtn = document.getElementById("fakeFileBtn");
const fileNameEl = document.getElementById("fileName");
const mapHint = document.getElementById("mapHint");

submitBtn.disabled = true;

// ========================
// SUBMIT BUTTON CLICK
// ========================
submitBtn.addEventListener("click", (e) => {
  e.preventDefault();
  submitIssue();
});

// ========================
// STATUS HELPERS
// ========================
function showStatus(message, type) {
  if (!statusMessage) return;
  statusMessage.textContent = message;
  statusMessage.className = `status ${type}`;
  statusMessage.classList.remove("hidden");
}

function clearStatus() {
  if (!statusMessage) return;
  statusMessage.className = "status hidden";
  statusMessage.textContent = "";
}

function showSuccessToast() {
  const toast = document.getElementById("successToast");
  if (!toast) return;
  toast.classList.add("show");
  toast.classList.remove("hidden");
}

function hideSuccessToast() {
  const toast = document.getElementById("successToast");
  if (!toast) return;
  toast.classList.remove("show");
  toast.classList.add("hidden");
}

function refreshFieldStates() {
  document.querySelectorAll(".input-wrapper input, .input-wrapper textarea, .input-wrapper select")
    .forEach(el => {
      const wrapper = el.closest(".input-wrapper");
      const requiredHint = document.querySelector(`.fieldHint.required[data-for="${el.id}"]`);
      const filled = el.value.trim().length > 0;

      wrapper?.classList.toggle("filled", filled);
      requiredHint?.classList.toggle("hintHidden", filled);
    });

  updateMapRequiredState();
}


function resetForm() {
  if (marker) map.removeLayer(marker);
  marker = null;

  description.value = "";
  photoInput.value = "";
  photoPreview.classList.add("hidden");

  // reset submit button state
  submitBtn.disabled = true;
  siteSelect.value = "";
  issueType.value = "";
  severity.value = "";
  map.setView([42.3, -71.8], 8);

  const mapHintEl = document.getElementById("mapHint");
  if (mapHintEl) mapHintEl.classList.remove("hidden");

  clearStatus();

  updateMapRequiredState();
  updateSubmitState();

  refreshFieldStates();
}

function updateSubmitState() {
  const hasMarker = !!marker;

  submitBtn.disabled = !(
    siteSelect.value &&
    issueType.value &&
    severity.value &&
    description.value.trim() &&
    hasMarker
  );
}

// REQUIRED FIELD LISTENERS
siteSelect.addEventListener("change", updateSubmitState);
issueType.addEventListener("change", updateSubmitState);
severity.addEventListener("change", updateSubmitState);
description.addEventListener("input", updateSubmitState);

function updateMapRequiredState() {
  const mapRequired = document.getElementById("mapRequired");
  if (!mapRequired) return;

  const hasMarker = !!marker;
  mapRequired.classList.toggle("hintHidden", hasMarker);
}


// ========================
// SITE DROPDOWN
// ========================
Object.keys(sites).forEach(site => {
  const opt = document.createElement("option");
  opt.value = site;
  opt.textContent = site;
  siteSelect.appendChild(opt);
});

// ========================
// MAP INIT
// ========================
map = L.map("map").setView([42.3, -71.8], 8);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

// ========================
// MAP EVENTS
// ========================
map.on("click", e => {
  if (marker) map.removeLayer(marker);

  marker = L.marker(e.latlng).addTo(map);

  document.getElementById("mapHint")?.classList.add("hidden");

  updateMapRequiredState();
  updateSubmitState();
});


siteSelect.addEventListener("change", () => {
  const site = sites[siteSelect.value];
  map.setView(site.center, site.zoom);
  applySiteBoundary(site);
  applySiteTrails(site);

  if (marker) {
    map.removeLayer(marker);
    marker = null;
  }

  updateMapRequiredState();
  updateSubmitState();
});

// ========================
// TRAILS
// ========================
async function applySiteTrails(site) {
  if (trailsLayer) {
    map.removeLayer(trailsLayer);
    trailsLayer = null;
  }

  if (!site.trails) return;

  try {
    const res = await fetch(site.trails);
    const geojson = await res.json();

    trailsLayer = L.geoJSON(geojson, {
      style: feature => ({
        color: "#8B4513",
        weight: 3,
        opacity: 0.9
      }),
      onEachFeature: (feature, layer) => {
        if (feature.properties?.name) {
          layer.bindPopup(`<strong>${feature.properties.name}</strong>`);
        }
      }
    }).addTo(map);

  } catch (err) {
    console.error("Trail load failed", err);
  }
}

// ========================
// BOUNDARIES
// ========================
async function applySiteBoundary(site) {
  if (boundaryLayer) map.removeLayer(boundaryLayer);
  if (boundaryShadowLayer) map.removeLayer(boundaryShadowLayer);

  if (!site.boundary) return;

  try {
    const res = await fetch(site.boundary);
    const geojson = await res.json();

    boundaryShadowLayer = L.geoJSON(geojson, {
      style: { color: "#C4D600", weight: 8, opacity: 0.6, fillOpacity: 0 }
    }).addTo(map);

    boundaryLayer = L.geoJSON(geojson, {
      style: { color: "#569602", weight: 3, fillOpacity: 0.1 }
    }).addTo(map);

    map.fitBounds(boundaryLayer.getBounds());
  } catch (err) {
    console.error("Boundary load failed", err);
  }
}

// ========================
// PHOTO PREVIEW
// ========================
fakeFileBtn.addEventListener("click", () => {
  photoInput.click();
});

photoInput.addEventListener("change", () => {
  const file = photoInput.files[0];

  if (!file) {
    fileNameEl.textContent = "No file chosen";
    photoPreview.classList.add("hidden");
    return;
  }

  fileNameEl.textContent = file.name;

  const reader = new FileReader();
  reader.onload = e => {
    photoPreview.src = e.target.result;
    photoPreview.classList.remove("hidden");
  };
  reader.readAsDataURL(file);
});

// ========================
// BASE64 CONVERSION
// ========================
function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result);
      let binary = "";
      for (let b of bytes) binary += String.fromCharCode(b);
      resolve(btoa(binary));
    };
    reader.onerror = reject;
  });
}

// ========================
// FLOATING LABELS
// ========================
function initFloatingLabels() {
  document.querySelectorAll(".input-wrapper input, .input-wrapper textarea, .input-wrapper select")
    .forEach(el => {
      const wrapper = el.closest(".input-wrapper");
      const requiredHint = document.querySelector(
        `.fieldHint.required[data-for="${el.id}"]`
      );

      function hasValue() {
        if (el.tagName === "SELECT") {
          return el.value !== "";
        }
        return el.value.trim().length > 0;
      }

      function updateState() {
        const filled = hasValue();

        wrapper.classList.toggle("filled", filled);

        if (requiredHint) {
          requiredHint.classList.toggle("hintHidden", filled);
        }
      }

      el.addEventListener("focus", () => {
        wrapper.classList.add("focussed");
      });

      el.addEventListener("blur", () => {
        wrapper.classList.remove("focussed");
        updateState();
      });

      el.addEventListener("input", updateState);
      el.addEventListener("change", updateState);

      // Initialize
      updateState();
    });


}

initFloatingLabels();

function initHintVisibility() {
  const requiredFields = [
    { el: document.getElementById("siteSelect"), hint: document.querySelector("#siteHint") },
    { el: document.getElementById("issueType"), hint: document.querySelector("#issueTypeHint") },
    { el: document.getElementById("severity"), hint: document.querySelector("#severityHint") },
    { el: document.getElementById("description"), hint: document.querySelector("#descriptionHint") }
  ];

  requiredFields.forEach(item => {

    // SAFETY CHECK
    if (!item.el || !item.hint) return;

    const check = () => {
      if (item.el.value) item.hint.classList.add("hintHidden");
      else item.hint.classList.remove("hintHidden");
    };

    item.el.addEventListener("input", check);
    item.el.addEventListener("change", check);
    check();
  });
}


initHintVisibility();


// ========================
// SUBMIT
// ========================
async function submitIssue() {
  if (isSubmitting) return;
  isSubmitting = true;

  clearStatus();

  if (!marker) {
    showStatus("Please click the map to mark the issue location.", "error");
    isSubmitting = false;
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting…";

  let photoBase64 = null;
  let photoBase64Name = null;

  if (photoInput.files.length) {
    const file = photoInput.files[0];
    photoBase64 = await toBase64(file);
    photoBase64Name = file.name;
  }

  const payload = {
    site: siteSelect.value,
    issueType: document.getElementById("issueType").value,
    severity: document.getElementById("severity").value,
    latitude: marker.getLatLng().lat,
    longitude: marker.getLatLng().lng,
    description: document.getElementById("description").value,
    submittedAt: new Date().toISOString(),
    photoBase64: photoBase64 ?? null,
    photoBase64Name: photoBase64Name ?? null
  };

  try {
  const response = await fetch(POWER_AUTOMATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

    showSuccessToast();
    resetForm();

  } catch (err) {
    console.error(err);
    showStatus(
      "Something went wrong while submitting. Please try again or contact staff.",
      "error"
    );
  } finally {
    isSubmitting = false;
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit Issue";
  }
}

// ========================
// TOAST HANDLING
// ========================
const successToast = document.getElementById("successToast");
const newReportBtn = document.getElementById("newReportBtn");

if (newReportBtn) {
  newReportBtn.addEventListener("click", () => {
    resetForm();
    hideSuccessToast();
  });
}
});