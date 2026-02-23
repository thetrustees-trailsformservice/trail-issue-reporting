document.addEventListener("DOMContentLoaded", () => {
// ========================
// CONFIG
// ========================
const isFormPage = !!document.getElementById("map");
const isIssuesPage = !!document.getElementById("issuesMap");

const POWER_AUTOMATE_URL =
  "https://default912a785a67cc420da3dce817f6ff7b.fc.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/7823418fc89b4417928398e5c3fee82b/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=GEAypdes3LSTSZEm39ASOMtQH1isZ3x95j-_fppaBcc";

const ISSUES_GEOJSON_URL =
  "https://default912a785a67cc420da3dce817f6ff7b.fc.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/d05f1cd01f824e8a86771bfe1e69ba1c/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=o6rqskcqxVZdNtyo5Wj_-FL0W97sT9WPmQN_BZXO2rs";

// ========================
// GLOBALS
// ========================
let map;
let marker = null;
let boundaryLayer = null;
let boundaryShadowLayer = null;
let isSubmitting = false;
let trailsLayer = null;
let issuesLayer = null;

// ========================
// GEOJSON CACHE
// ========================
const geoJsonCache = {};

function initBaseMap(mapId, center = [41.8029231, -70.6108888], zoom = 8) {
  const container = L.DomUtil.get(mapId);
  if (container && container._leaflet_id) return map;

  map = L.map(mapId, {
    zoomSnap: 0.25,
    zoomDelta: 0.5
  }).setView(center, zoom);

  map.doubleClickZoom.disable();

  map.createPane("boundaryPane");
  map.getPane("boundaryPane").style.zIndex = 400;

  map.createPane("trailsPane");
  map.getPane("trailsPane").style.zIndex = 450;

  map.createPane("issuesPane");
  map.getPane("issuesPane").style.zIndex = 600;
  map.getPane("issuesPane").style.pointerEvents = "auto";

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
    updateWhenIdle: true,
    keepBuffer: 2
  }).addTo(map);

  return map;
}

function clearSiteOverlays() {
  [boundaryLayer, boundaryShadowLayer, trailsLayer].forEach(layer => {
    if (layer) map.removeLayer(layer);
  });
}

async function fetchGeoJson(url) {
  if (!url) return null;

  if (geoJsonCache[url]) {
    return geoJsonCache[url]; // return cached copy
  }

  const response = await fetch(url);
  const data = await response.json();

  geoJsonCache[url] = data; // store in cache
  return data;
}

// -------------------- Issue SVG & Unicode Icon Mapping --------------------
const severityColors = {
  High: "#d73027",   // red
  Medium: "#fc8d59", // orange
  Low: "#91cf60"     // green
};

const issueIcons = {
  Erosion: "⛰️",
  Blowdown: "🌳",
  Invasives: "🌿",
  Drainage: "💧",
  Safety: "⚠️",
  Other: "❓"
};

function createIssueSVG(issueType, severity) {
  const fillColor = severityColors[severity] || "#666";
  const unicodeIcon = issueIcons[issueType] || "❓";

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
      <circle cx="14" cy="14" r="12" fill="${fillColor}" stroke="white" stroke-width="2"/>
      <text x="14" y="18" font-size="14" text-anchor="middle" fill="black" stroke="white" stroke-width="0.5" paint-order="stroke">${unicodeIcon}</text>
    </svg>
  `;
}

function createLeafletIssueIcon(issueType, severity) {
  return L.divIcon({
    className: "issue-icon",
    html: createIssueSVG(issueType, severity),
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14]
  });
}


async function loadSiteBoundary(site, doZoom = true) {
  if (!site?.boundary) return;

  const geojson = await fetchGeoJson(site.boundary);

  boundaryShadowLayer = L.geoJSON(geojson, {
    pane: "boundaryPane",
    style: { color: "#C4D600", weight: 8, opacity: 0.6, fillOpacity: 0 }
  }).addTo(map);

  boundaryLayer = L.geoJSON(geojson, {
    pane: "boundaryPane",
    style: { color: "#4B6F44", weight: 3, fillOpacity: 0.1 }
  }).addTo(map);

  if (doZoom) {
    const bounds = boundaryLayer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  }
}

async function loadSiteTrails(site) {
  if (!site?.trails) return;

  const geojson = await fetchGeoJson(site.trails);

  trailsLayer = L.geoJSON(geojson, {
    pane: "trailsPane",
    style: { color: "#8B5A2B", weight: 3, opacity: 0.9 }
  }).addTo(map);
}

async function zoomToAllSites() {
  const layers = [];

  for (const site of Object.values(sites)) {
    if (site.boundary) {
      const geojson = await fetchGeoJson(site.boundary);
      layers.push(L.geoJSON(geojson));
    }
  }

  const group = L.featureGroup(layers);
  const bounds = group.getBounds();

  if (bounds.isValid()) {
    map.fitBounds(bounds, { padding: [40, 40] });
  }
}

/* =========================================================
   ===================== FORM PAGE =========================
   ========================================================= */
if (isFormPage) {
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

  clearSiteOverlays();

  description.value = "";
  photoInput.value = "";
  photoPreview.classList.add("hidden");

  // reset submit button state
  submitBtn.disabled = true;
  siteSelect.value = "";
  issueType.value = "";
  severity.value = "";
  map.setView([41.8029231, -70.6108888], 8);

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

siteSelect.addEventListener("change", async () => {
  const site = sites[siteSelect.value];
  if (!site) return;

  clearSiteOverlays();
  await loadSiteBoundary(site, true);
  await loadSiteTrails(site);

  if (marker) {
    map.removeLayer(marker);
    marker = null;
  }

  updateMapRequiredState();
  updateSubmitState();
});


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
map = initBaseMap("map", [41.8029231, -70.6108888], 8);

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

}

/* =========================================================
   ==================== ISSUES PAGE ========================
   ========================================================= */
if (isIssuesPage) {
  // ========================
  // UTILITY
  // ========================
  let activeIssueId = null;

  function getSeverityColor(severity) {
    if (!severity) return "#999";

    const s = severity.trim();
    if (s === "High") return "#d73027";
    if (s === "Medium") return "#fc8d59";
    if (s === "Low") return "#91cf60";
    return "#999";
  }

  function formatIssueAge(isoDate) {
  if (!isoDate) return "Unknown";

  const submitted = new Date(isoDate);
  const now = new Date();
  const diffMs = now - submitted;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
}

// ========================
// INIT MAP
// ========================
map = initBaseMap("issuesMap", [41.8029231, -70.6108888], 9);

// ========================
// LOAD ALL SITE BOUNDARIES + TRAILS (ISSUES MAP ONLY)
// ========================
Object.values(sites).forEach(site => {
  if (site.boundary) {
    loadSiteBoundary(site, false);
  }
  if (site.trails) {
    loadSiteTrails(site);
  }
});

// ========================
// LOAD ISSUES
// ========================
async function loadIssues(map) {
  const geojson = await fetchOpenIssues();
  if (!geojson) return;

  if (issuesLayer) {
    map.removeLayer(issuesLayer);
  }

  issuesLayer = L.geoJSON(geojson, {
    pointToLayer: (feature, latlng) => {
      // Create custom SVG icon
      const icon = createLeafletIssueIcon(feature.issueType, feature.severity);
      const marker = L.marker(latlng, {
        icon: icon,
        pane: "issuesPane"
      });

      // Fly to marker on click and open popup
      marker.on('click', () => {
        const targetZoom = 16;
        const markerLatLng = marker.getLatLng();

        // Convert to pixel space
        const point = map.project(markerLatLng, targetZoom);
        // Shift UP so popup appears above marker
        point.y -= 120;

        const offsetLatLng = map.unproject(point, targetZoom);

        map.flyTo(offsetLatLng, targetZoom, {
          animate: true,
          duration: 0.6,
          easeLinearity: 0.2
        });

        // Open popup after map finishes moving
        map.once("moveend", () => {
          marker.openPopup();
        });
      });

      return marker;
    },
    onEachFeature: (feature, layer) => {
      const p = feature;
      const severityColor = getSeverityColor(p.severity);
      const sharepointUrl = `https://thetrustees.sharepoint.com/sites/SouthShoreRegionVolunteers/Lists/Trail%20Monitoring%20Reports/DispForm.aspx?ID=${p.id}`;
      const photoAdded = p.photoUrl ? `<a href="${p.photoUrl}" target="_blank">View Image</a>` : "No";

      layer.bindPopup(
        `<div class="popup-content">
            <div class="popup-header">${p.issueType} — ${p.site}</div>

            <div class="popup-row">
              <span class="popup-label">Issue:</span>
              <span class="popup-value">${p.issueType}</span>
            </div>

            <div class="popup-row">
              <span class="popup-label">Severity:</span>
              <span class="popup-value" style="color:${severityColor}">${p.severity}</span>
            </div>

            <div class="popup-row">
              <span class="popup-label">Status:</span>
              <span class="popup-value">${p.status}</span>
            </div>

            <div class="popup-row">
              <span class="popup-label">Reported:</span>
              <span class="popup-value">${formatIssueAge(p.submittedAt)}</span>
            </div>

            <div class="popup-row">
              <span class="popup-label">Description:</span>
              <span class="popup-value">${p.description || "<em>No description</em>"}</span>
            </div>

            <div class="popup-row">
              <span class="popup-label">Photo:</span>
              <span class="popup-value">${photoAdded}</span>
            </div>

            <div class="popup-row">
              <button onclick="window.open('${sharepointUrl}', '_blank')" class="popup-button view-btn">View in SharePoint</button>
            </div>

            <div class="popup-row">
              <button onclick="markCompleted(${p.id}, this)" class="popup-button complete-btn">Mark Completed</button>
            </div>
        </div>`,
        {
          className: `custom-popup severity-${p.severity.toLowerCase()}`,
          maxWidth: 340,
          minWidth: 240,
          autoPan: false,
          keepInView: false,
          closeButton: true,
          closeOnMove: false,
          offset: [0, -10]
        }
      );
    }
  }).addTo(map);

  // ========================
  // REOPEN ACTIVE POPUP AFTER REFRESH
  // ========================
  if (activeIssueId !== null && issuesLayer) {
    issuesLayer.eachLayer(layer => {
      if (layer.feature.id === activeIssueId) {
        layer.openPopup();
      }
    });
  }
}


  async function fetchOpenIssues() {
    try {
      const res = await fetch(ISSUES_GEOJSON_URL);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json();

      if (!json?.data || !json.data.features) {
        console.warn("No issues returned or invalid GeoJSON. Falling back to empty FeatureCollection.");
        return { type: "FeatureCollection", features: [] };
      }

      return json.data;
    } catch (err) {
      console.error("Failed to load issues", err);
      return { type: "FeatureCollection", features: [] };
    }
  }

  async function markCompleted(id, button) {
    try {
      button.disabled = true;
      button.textContent = "Updating…";

      const res = await fetch("https://default912a785a67cc420da3dce817f6ff7b.fc.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/5b136aad51c94c51a010f2dc4e6ed490/triggers/manual/paths/invoke?api-version=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ID: id })
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // Remove the marker from the map
      issuesLayer.eachLayer(layer => {
        if (layer.feature.id === id) {
          issuesLayer.removeLayer(layer);
        }
      });

    } catch (err) {
      console.error(err);
      alert("Failed to mark completed. Please try again.");
      button.disabled = false;
      button.textContent = "Mark Completed";
    }
  }

  // ========================
  // SITE FILTER
  // ========================
  const siteFilter = document.getElementById("siteFilter");

  Object.keys(sites).forEach(siteName => {
    const opt = document.createElement("option");
    opt.value = siteName;
    opt.textContent = siteName;
    siteFilter.appendChild(opt);
  });

  siteFilter.addEventListener("change", async () => {
    const selected = siteFilter.value;

    // Close any open popup
    map.closePopup();

    // Clear current site boundaries and trails
    clearSiteOverlays();

    if (!selected) {
      // Show all sites and all issues
      zoomToAllSites();

      issuesLayer.eachLayer(layer => {
        layer.setStyle({ opacity: 1, fillOpacity: 0.85 });
      });

      return;
    }

    // Show boundaries/trails for the selected site
    const site = sites[selected];
    if (!site) return;

    await loadSiteBoundary(site, true);
    await loadSiteTrails(site);

    // Filter markers by selected site
    issuesLayer.eachLayer(layer => {
      const match = layer.feature.site === selected;
      layer.setStyle({
        opacity: match ? 1 : 0,
        fillOpacity: match ? 0.85 : 0
      });
      if (!match) layer.closePopup(); // ensure hidden markers don't have open popups
    });
  });



  // ========================
  // INITIAL LOAD + AUTO-REFRESH
  // ========================
  loadIssues(map);
}



})