/* =============================================================
   TRAIL ISSUE REPORTING — app.js
   Supports: index.html (form page) + issues.html (map page)
   ============================================================= */

// ======================== SHARED GLOBALS ========================
let map;
let voyager, googleHybrid;
let currentBase           = "voyager";
let boundaryLayer         = null;       
let boundaryShadowLayer   = null;
let trailsLayer           = null;
let marker                = null;
let issuesLayer           = null;
let clusterGroup          = null;
let markerById            = {};
let activeMarker          = null;
let isSubmitting          = false;
let allFeatures           = [];
let activeSeverityFilter  = "all";
let activeSearchTerm      = "";
let activeSiteFilter      = "";
let activeSortOrder       = "newest"; // "newest" or "oldest"

document.addEventListener("DOMContentLoaded", () => {

// ======================== CONFIG ========================
const isFormPage   = !!document.getElementById("map");
const isIssuesPage = !!document.getElementById("issuesMap");

const POWER_AUTOMATE_URL =
  "https://default912a785a67cc420da3dce817f6ff7b.fc.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/7823418fc89b4417928398e5c3fee82b/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=GEAypdes3LSTSZEm39ASOMtQH1isZ3x95j-_fppaBcc";

const ISSUES_GEOJSON_URL =
  "https://default912a785a67cc420da3dce817f6ff7b.fc.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/d05f1cd01f824e8a86771bfe1e69ba1c/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=o6rqskcqxVZdNtyo5Wj_-FL0W97sT9WPmQN_BZXO2rs";

const MARK_COMPLETE_URL =
  "https://default912a785a67cc420da3dce817f6ff7b.fc.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/5b136aad51c94c51a010f2dc4e6ed490/triggers/manual/paths/invoke?api-version=1";

const SHAREPOINT_BASE =
  "https://thetrustees.sharepoint.com/sites/SouthShoreRegionVolunteers/Lists/Trail%20Monitoring%20Reports/DispForm.aspx?ID=";

// Auto-refresh interval in ms (5 minutes)
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

// ======================== GEO JSON CACHE ========================
const geoJsonCache = {};
const siteLayersCache = {};
const siteLoadPromises = {};

async function fetchGeoJson(url) {
  if (!url) return null;
  if (geoJsonCache[url]) return geoJsonCache[url];
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    geoJsonCache[url] = data;
    return data;
  } catch (err) {
    console.warn("GeoJSON fetch failed:", url, err);
    return null;
  }
}

// ======================== ICON HELPERS ========================
const severityColors = {
  High:   "#c0392b",
  Medium: "#d97706",
  Low:    "#16a34a"
};

const issueIcons = {
  Erosion:        "⛰️",
  Blowdown:       "🌳",
  Invasives:      "🌿",
  Drainage:       "💧",
  Safety:         "⚠️",
  Infrastructure: "🔧",
  Other:          "❓"
};

function createIssueSVG(issueType, severity, active = false) {
  const fillColor = severityColors[severity] || "#64748b";
  const icon      = issueIcons[issueType] || "❓";
  const size      = active ? 36 : 28;
  const r         = (size / 2) - 2;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="${fillColor}" stroke="white" stroke-width="${active ? 2.5 : 2}"/>
      ${active ? `<circle cx="${size/2}" cy="${size/2}" r="${r+3}" fill="none" stroke="${fillColor}" stroke-width="1.5" opacity="0.4"/>` : ''}
      <text x="${size/2}" y="${size/2 + 5}" font-size="${active ? 16 : 13}" text-anchor="middle" fill="white" paint-order="stroke">${icon}</text>
    </svg>`;
}

function createLeafletIssueIcon(issueType, severity, active = false) {
  const size = active ? 36 : 28;
  return L.divIcon({
    className: "issue-icon",
    html: createIssueSVG(issueType, severity, active),
    iconSize:    [size, size],
    iconAnchor:  [size / 2, size / 2],
    popupAnchor: [0, -(size / 2) - 4]
  });
}

function setActiveMarker(newMarker) {
  if (activeMarker && activeMarker !== newMarker) {
    const prev = activeMarker.feature;
    activeMarker.setIcon(createLeafletIssueIcon(prev.issueType, prev.severity, false));
  }
  activeMarker = newMarker;
  const f = newMarker.feature;
  newMarker.setIcon(createLeafletIssueIcon(f.issueType, f.severity, true));
}

// ======================== BASE MAP ========================
const themes = {
  voyager: {
    shadow: { color: "#A4B600", weight: 8, opacity: 0.4 }, 
    fill:   { color: "#008B8B", weight: 3, fillOpacity: 0.02, dashArray: '8 8' }, 
    trail:  { color: "#853965", weight: 2 } 
  },
  satellite: {
    shadow: { color: "#C4D600", weight: 8, opacity: 0.6 }, 
    fill:   { color: "#9adef3", weight: 3, fillOpacity: 0.02, dashArray: '8 8' }, 
    trail:  { color: "#FFD700", weight: 2 } 
  }
};

function applyCurrentThemeToSiteLayer(layer) {
  if (!layer) return;
  const theme = themes[currentBase];
  layer.eachLayer(l => {
    if (!l.setStyle) return;
    if (l.options.pane === "boundaryPane") l.setStyle(theme.fill);
    if (l.options.pane === "trailsPane")   l.setStyle(theme.trail);
  });
}

function initBaseMap(mapId, center, zoom) {
  const container = L.DomUtil.get(mapId);
  if (container && container._leaflet_id) return map;

  map = L.map(mapId, {
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    attributionControl: false
  }).setView(center, zoom);

  map.doubleClickZoom.disable();

  // Custom panes for z-order control
  map.createPane("boundaryPane");
  map.getPane("boundaryPane").style.zIndex = 400;

  map.createPane("trailsPane");
  map.getPane("trailsPane").style.zIndex = 450;

  map.createPane("issuesPane");
  map.getPane("issuesPane").style.zIndex = 600;
  map.getPane("issuesPane").style.pointerEvents = "auto";

  // Base layers
  voyager = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd',
    updateWhenIdle: true,
    keepBuffer: 2
  });

  googleHybrid = L.tileLayer('http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',{
    maxZoom: 19,
    subdomains:['mt0','mt1','mt2','mt3'],
    updateWhenIdle: true,
    keepBuffer: 2
  });

  // Add default layer
  voyager.addTo(map);

  // EasyButton toggle
    L.easyButton('<div class="layer-toggle-bg"></div>', function(btn, map) {
      if (map.hasLayer(voyager)) {
        map.removeLayer(voyager);
        googleHybrid.addTo(map);
        currentBase = "satellite";
      } else {
        map.removeLayer(googleHybrid);
        voyager.addTo(map);
        currentBase = "voyager";
      }

      // Apply the theme to each child layer
      map.eachLayer(layer => {
        // Only target GeoJSON layers (site boundaries + trails)
        if (layer instanceof L.GeoJSON) {
          applyCurrentThemeToSiteLayer(layer);
        }

        // Also handle LayerGroups (your preloaded sites)
        if (layer instanceof L.LayerGroup) {
          layer.eachLayer(sub => {
            if (sub instanceof L.GeoJSON) {
              applyCurrentThemeToSiteLayer(sub);
            }
          });
        }
      });
    }, { position: 'topright', id: 'button-layer-toggle' }).addTo(map);

  return map;
}

// ======================== SITE OVERLAYS ========================
function clearSiteOverlays() {
  [boundaryLayer, boundaryShadowLayer, trailsLayer].forEach(layer => {
    if (layer && map.hasLayer(layer)) map.removeLayer(layer);
  });
  boundaryLayer = boundaryShadowLayer = trailsLayer = null;
}

async function loadSiteBoundary(site, doZoom = true) {
  if (!site?.boundary) return;

  const geojson = await fetchGeoJson(site.boundary);
  if (!geojson) return;

  const theme = themes[currentBase];

  // Create BOTH layers and store them globally
  boundaryShadowLayer = L.geoJSON(geojson, {
    pane: "boundaryPane",
    style: theme.shadow
  }).addTo(map);

  boundaryLayer = L.geoJSON(geojson, {
    pane: "boundaryPane",
    style: theme.fill
  }).addTo(map);

  if (doZoom && boundaryLayer) {
    const bounds = boundaryLayer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  }
}

async function loadSiteTrails(site) {
  if (!site?.trails) return null;
  const geojson = await fetchGeoJson(site.trails);
  if (!geojson) return null;

  const theme = themes[currentBase]; // use current basemap theme

  // Return the layer, do not add to map
  return L.geoJSON(geojson, {
    pane: "trailsPane",
    style: theme.trail
  });
}

async function zoomToAllSites() {
  const layers = [];
  for (const site of Object.values(sites)) {
    if (site.boundary) {
      const geojson = await fetchGeoJson(site.boundary);
      if (geojson) layers.push(L.geoJSON(geojson));
    }
  }
  if (!layers.length) return;
  const group  = L.featureGroup(layers);
  const bounds = group.getBounds();
  if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40] });
}

// Preload all sites asynchronously
let currentSiteLayer = null;

// ======================== Preload all sites ========================
const totalSites = Object.keys(sites).length;
let sitesLoadedCount = 0;

// Preload all sites asynchronously
// Preload all sites asynchronously
Object.entries(sites).forEach(([siteId, site]) => {
  siteLoadPromises[siteId] = (async () => {
    try {
      const [boundaryData, trailsData] = await Promise.all([
        fetch(site.boundary).then(r => r.json()),
        fetch(site.trails).then(r => r.json())
      ]);

      // Use current base for theme
      const theme = themes[currentBase];

      const boundaryShadow = L.geoJSON(boundaryData, {
        style: theme.shadow,
        pane: "boundaryPane",
        interactive: false
      });

      const boundary = L.geoJSON(boundaryData, {
        style: theme.fill,
        pane: "boundaryPane",
        interactive: false
      });

      const trails = L.geoJSON(trailsData, {
        style: theme.trail,
        pane: "trailsPane"
      });

      // Cache as a single LayerGroup
      siteLayersCache[siteId] = L.layerGroup([boundaryShadow, boundary, trails]);

      sitesLoadedCount++;
      console.log(`Preload progress: ${sitesLoadedCount} / ${totalSites} sites loaded`);

      return siteLayersCache[siteId];
    } catch (err) {
      console.error("Failed to preload site:", siteId, err);
    }
  })();
});

// ======================== UTILITY ========================
function getSeverityColor(severity) {
  return severityColors[severity?.trim()] || "#64748b";
}

function formatIssueAge(isoDate) {
  if (!isoDate) return "Unknown";
  const diffMs   = Date.now() - new Date(isoDate);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7)   return `${diffDays}d ago`;
  if (diffDays < 30)  return `${Math.floor(diffDays/7)}w ago`;
  return `${Math.floor(diffDays/30)}mo ago`;
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result);
      let binary  = "";
      for (let b of bytes) binary += String.fromCharCode(b);
      resolve(btoa(binary));
    };
    reader.onerror = reject;
  });
}

/* =========================================================
   ==================== FORM PAGE ==========================
   ========================================================= */
if (isFormPage) {

  const siteSelect  = document.getElementById("siteSelect");
  const submitBtn   = document.getElementById("submitBtn");
  const submitText  = document.getElementById("submitBtnText");
  const statusMessage = document.getElementById("statusMessage");
  const photoInput  = document.getElementById("photo");
  const photoPreview = document.getElementById("photoPreview");
  const issueType   = document.getElementById("issueType");
  const severity    = document.getElementById("severity");
  const description = document.getElementById("description");
  const fakeFileBtn = document.getElementById("fakeFileBtn");
  const fileNameEl  = document.getElementById("fileName");

  submitBtn.disabled = true;

  // ---- Populate site dropdown ----
  Object.keys(sites).sort().forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    siteSelect.appendChild(opt);
  });

  // ---- Map init ----
  map = initBaseMap("map", [41.8029231, -70.6108888], 8);

  // ---- Map click to place marker ----
  map.on("click", e => {
    if (marker) map.removeLayer(marker);
    marker = L.marker(e.latlng, {
      icon: L.divIcon({
        className: "",
        html: `<div style="
          width:18px;height:18px;
          background:#4B6F44;
          border:3px solid white;
          border-radius:50%;
          box-shadow:0 2px 6px rgba(0,0,0,0.4);
        "></div>`,
        iconSize:    [18, 18],
        iconAnchor:  [9, 9],
        popupAnchor: [0, -12]
      })
    }).addTo(map);

    document.getElementById("mapHint")?.classList.add("hidden");
    document.getElementById("map")?.classList.add("map-active");
    updateMapRequiredState();
    updateSubmitState();
  });

  let currentSiteLayer = null;

  siteSelect.addEventListener("change", async (e) => {
    const siteId = e.target.value;

    if (currentSiteLayer) map.removeLayer(currentSiteLayer);

    let layer = siteLayersCache[siteId];
    if (!layer) {
      console.log(`Waiting for ${siteId} to preload...`);
      layer = await siteLoadPromises[siteId];
      if (!layer) return;
    }

    layer.addTo(map);
    // When changing site
    currentSiteLayer = layer;
    boundaryShadowLayer = layer.getLayers().find(l => l.options.pane === "boundaryPane" && l !== undefined);
    boundaryLayer       = layer.getLayers().find(l => l.options.pane === "boundaryPane" && l !== boundaryShadowLayer);
    trailsLayer         = layer.getLayers().find(l => l.options.pane === "trailsPane");

    // Apply current base theme
    applyCurrentThemeToSiteLayer(boundaryShadowLayer);
    applyCurrentThemeToSiteLayer(boundaryLayer);
    applyCurrentThemeToSiteLayer(trailsLayer);

    // Fit map to site bounds
    const bounds = L.featureGroup(layer.getLayers()).getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });

    if (marker) {
      map.removeLayer(marker);
      marker = null;
    }

    updateMapRequiredState();
    updateSubmitState();
  });

  // ---- Required field listeners ----
  [siteSelect, issueType, severity].forEach(el => el.addEventListener("change", updateSubmitState));
  description.addEventListener("input", updateSubmitState);

  function updateSubmitState() {
    const valid = !!(
      siteSelect.value &&
      issueType.value &&
      severity.value &&
      description.value.trim() &&
      marker
    );
    submitBtn.disabled = !valid;
    submitBtn.setAttribute("aria-disabled", !valid);
  }

  function updateMapRequiredState() {
    const el = document.getElementById("mapRequired");
    if (el) el.classList.toggle("hintHidden", !!marker);
  }

  // ---- Photo upload ----
  fakeFileBtn.addEventListener("click", () => photoInput.click());

  // Allow clicking the whole file-row
  document.getElementById("fileDropZone")?.addEventListener("click", e => {
    if (e.target !== fakeFileBtn) photoInput.click();
  });

  photoInput.addEventListener("change", () => {
    const file = photoInput.files[0];
    if (!file) {
      fileNameEl.textContent = "No file chosen";
      photoPreview.classList.add("hidden");
      return;
    }
    // Validate size (10MB)
    if (file.size > 20 * 1024 * 1024) {
      fileNameEl.textContent = "File too large (max 20MB)";
      photoInput.value = "";
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

  // ---- Submit ----
  submitBtn.addEventListener("click", e => {
    e.preventDefault();
    submitIssue();
  });

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
    if (submitText) submitText.textContent = "Submitting…";

    let photoBase64     = null;
    let photoBase64Name = null;

    if (photoInput.files.length) {
      const file = photoInput.files[0];
      photoBase64     = await toBase64(file);
      photoBase64Name = file.name;
    }

    const payload = {
      site:           siteSelect.value,
      issueType:      issueType.value,
      severity:       severity.value,
      latitude:       marker.getLatLng().lat,
      longitude:      marker.getLatLng().lng,
      description:    description.value.trim(),
      submittedAt:    new Date().toISOString(),
      photoBase64:    photoBase64 ?? null,
      photoBase64Name: photoBase64Name ?? null
    };

    try {
      const response = await fetch(POWER_AUTOMATE_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload)
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      showSuccessToast();
      resetForm();

    } catch (err) {
      console.error("Submit error:", err);
      showStatus("Something went wrong. Please try again or contact staff.", "error");
    } finally {
      isSubmitting = false;
      submitBtn.disabled = false;
      if (submitText) submitText.textContent = "Submit Issue Report";
    }
  }

  // ---- Status helpers ----
  function showStatus(message, type) {
    if (!statusMessage) return;
    statusMessage.textContent = message;
    statusMessage.className = `status ${type}`;
    statusMessage.classList.remove("hidden");
    statusMessage.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function clearStatus() {
    if (!statusMessage) return;
    statusMessage.className = "status hidden";
    statusMessage.textContent = "";
  }

  // ---- Toast ----
  function showSuccessToast() {
    const toast = document.getElementById("successToast");
    if (!toast) return;
    toast.classList.remove("hidden");
    requestAnimationFrame(() => toast.classList.add("show"));
    // Auto-dismiss after 7s
    setTimeout(() => hideSuccessToast(), 7000);
  }

  function hideSuccessToast() {
    const toast = document.getElementById("successToast");
    if (!toast) return;
    toast.classList.remove("show");
    setTimeout(() => toast.classList.add("hidden"), 400);
  }

  document.getElementById("newReportBtn")?.addEventListener("click", () => {
    resetForm();
    hideSuccessToast();
  });

  // ---- Reset form ----
  function resetForm() {
    if (marker) { map.removeLayer(marker); marker = null; }
    clearSiteOverlays();
    [description, photoInput].forEach(el => { if (el) el.value = ""; });
    photoPreview.classList.add("hidden");
    submitBtn.disabled = true;
    siteSelect.value = "";
    issueType.value  = "";
    severity.value   = "";
    map.setView([41.8029231, -70.6108888], 8);
    document.getElementById("mapHint")?.classList.remove("hidden");
    document.getElementById("map")?.classList.remove("map-active");
    clearStatus();
    updateMapRequiredState();
    updateSubmitState();
    refreshFieldStates();
  }

  // ---- Floating labels ----
  function initFloatingLabels() {
    document.querySelectorAll(".input-wrapper input, .input-wrapper textarea, .input-wrapper select")
      .forEach(el => {
        const wrapper      = el.closest(".input-wrapper");
        const requiredHint = document.querySelector(`.fieldHint.required[data-for="${el.id}"]`);

        function hasValue() {
          return el.tagName === "SELECT" ? el.value !== "" : el.value.trim().length > 0;
        }
        function update() {
          wrapper?.classList.toggle("filled", hasValue());
          requiredHint?.classList.toggle("hintHidden", hasValue());
        }
        el.addEventListener("focus",  () => wrapper?.classList.add("focussed"));
        el.addEventListener("blur",   () => { wrapper?.classList.remove("focussed"); update(); });
        el.addEventListener("input",  update);
        el.addEventListener("change", update);
        update();
      });
  }

  function refreshFieldStates() {
    document.querySelectorAll(".input-wrapper input, .input-wrapper textarea, .input-wrapper select")
      .forEach(el => {
        const wrapper = el.closest(".input-wrapper");
        const hint    = document.querySelector(`.fieldHint.required[data-for="${el.id}"]`);
        const filled  = el.tagName === "SELECT" ? el.value !== "" : el.value.trim().length > 0;
        wrapper?.classList.toggle("filled", filled);
        hint?.classList.toggle("hintHidden", filled);
      });
    updateMapRequiredState();
  }

  initFloatingLabels();

} // end isFormPage


/* =========================================================
   ==================== ISSUES PAGE ========================
   ========================================================= */
if (isIssuesPage) {

  // ---- Map init ----
  map = initBaseMap("issuesMap", [41.8029231, -70.6108888], 9);

  // ---- Load all site boundaries + trails on the issues map ----
  (async () => {
    for (const site of Object.values(sites)) {
      if (site.boundary) {
        await loadSiteBoundary(site, false);
      }

      if (site.trails) {
        const trails = await loadSiteTrails(site);
        if (trails) {
          trails.addTo(map);
        }
      }
    }
  })();

  // ---- Populate site filter ----
  const siteFilter = document.getElementById("siteFilter");
  Object.keys(sites).sort().forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    siteFilter.appendChild(opt);
  });

  // ---- Site filter change ----
  siteFilter.addEventListener("change", async () => {
    activeSiteFilter = siteFilter.value;
    map.closePopup();
    clearSiteOverlays();

    if (!activeSiteFilter) {
      zoomToAllSites();
    } else {
      const site = sites[activeSiteFilter];
      if (site) {
        await loadSiteBoundary(site, true);
        const trails = await loadSiteTrails(site);
        if (trails) {
          trailsLayer = trails;
          trails.addTo(map);
        }
      }
    }

    renderCards();
    updateMarkerVisibility();
  });

  // ---- Severity filter buttons ----
  document.querySelectorAll(".filter-btn").forEach(btn => {
    // Skip the sort button
    if (btn.id === "sortDateBtn") return;

    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach(b => {
        if (b.id === "sortDateBtn") return; // leave sort button alone
        b.classList.remove("active");
        b.setAttribute("aria-pressed", "false");
      });

      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");
      activeSeverityFilter = btn.dataset.severity;
      renderCards();
      updateMarkerVisibility();
    });
  });

  const sortBtn = document.getElementById("sortDateBtn");

  sortBtn.addEventListener("click", e => {
    e.preventDefault();

    activeSortOrder = activeSortOrder === "newest" ? "oldest" : "newest";
    sortBtn.textContent = activeSortOrder === "newest"
      ? "🕒 Newest First"
      : "🕒 Oldest First";

    renderCards();
  });

  // ---- Search ----
  document.getElementById("issue-search")?.addEventListener("input", e => {
    activeSearchTerm = e.target.value.toLowerCase().trim();
    renderCards();
    updateMarkerVisibility();
  });

  // ======================== FETCH + RENDER ========================
  async function fetchOpenIssues() {
    setRefreshState("loading");
    try {
      const res = await fetch(ISSUES_GEOJSON_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json?.data?.features) {
        console.warn("Invalid GeoJSON response, using empty collection");
        return { type: "FeatureCollection", features: [] };
      }
      setRefreshState("live");
      return json.data;
    } catch (err) {
      console.error("Failed to load issues:", err);
      setRefreshState("error");
      return { type: "FeatureCollection", features: [] };
    }
  }

  function setRefreshState(state) {
    const dot   = document.getElementById("refreshDot");
    const label = document.getElementById("refreshLabel");
    const ind   = document.getElementById("refreshIndicator");
    if (!dot || !label || !ind) return;

    ind.classList.toggle("loading", state === "loading");
    if (state === "loading") {
      label.textContent = "Loading…";
    } else if (state === "live") {
      label.textContent = `Updated ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`;
    } else {
      label.textContent = "Load error";
      dot.style.background = "var(--severity-high)";
    }
  }

  // ======================== MARKER MAP ========================
  const markerById = {};

  async function loadIssues() {
    const geojson = await fetchOpenIssues();
    allFeatures   = geojson.features || [];

    // Remove old layers / clusters
    if (clusterGroup) map.removeLayer(clusterGroup);
    clusterGroup = null;
    // Remove any individual site cluster groups from previous load
    if (map._siteClusterGroups) {
      map._siteClusterGroups.forEach(g => map.removeLayer(g));
    }
    map._siteClusterGroups = [];

    // Remove loading message
    const loadingMsg = document.getElementById("loadingMsg");
    if (loadingMsg) loadingMsg.remove();

    // ---- SITE-BASED CLUSTERING ----
    // Group features by site name, then create one MarkerClusterGroup per site.
    // disableClusteringAtZoom controls the zoom at which markers within that
    // site pop out of the cluster — set to match roughly "zoomed in to site" level.
    const useCluster = typeof L.markerClusterGroup === "function";

    // --- Bucket features by site ---
    const bySite = {};
    allFeatures.forEach(f => {
      const siteName = f.site || "__unknown__";
      if (!bySite[siteName]) bySite[siteName] = [];
      bySite[siteName].push(f);
    });

    // --- Prepare cluster groups per site ---
    const siteClusterGroups = {}; // siteName -> clusterGroup
    Object.entries(bySite).forEach(([siteName, features]) => {
      if (!useCluster) return;

      const group = L.markerClusterGroup({
        chunkedLoading: true,
        showCoverageOnHover: false,
        disableClusteringAtZoom: 14,
        maxClusterRadius: zoom => zoom < 12 ? 120 : 60,
        iconCreateFunction: cluster => {
          const children  = cluster.getAllChildMarkers();
          const hasHigh   = children.some(m => m.feature?.severity === "High");
          const hasMedium = children.some(m => m.feature?.severity === "Medium");
          const bgColor   = hasHigh ? "#c0392b" : hasMedium ? "#d97706" : "#16a34a";
          const count     = cluster.getChildCount();
          const label     = children[0]?.feature?.site?.split(" ")[0] || "?";
          return L.divIcon({
            className: "",
            html: `<div style="min-width:42px;height:42px;background:${bgColor};
                          color:white;border-radius:8px;display:flex;
                          flex-direction:column;align-items:center;
                          justify-content:center;padding:0 8px;
                          border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);
                          font-family:var(--font-sans,sans-serif);gap:1px">
                    <span style="font-size:14px;font-weight:700;line-height:1;">${count}</span>
                    <span style="font-size:8px;font-weight:600;opacity:.85;
                                  line-height:1;white-space:nowrap;max-width:52px;
                                  overflow:hidden;text-overflow:ellipsis;">${label}</span>
                  </div>`,
            iconSize: [42,42],
            iconAnchor: [21,21]
          });
        }
      });

      siteClusterGroups[siteName] = group;
      map._siteClusterGroups.push(group);
      map.addLayer(group);
    });

    // --- Create markers and assign to site clusters ---
    allFeatures.forEach(feature => {
      const coords = feature.geometry?.coordinates;
      if (!coords) return;

      const latlng = L.latLng(coords[1], coords[0]);
      const icon   = createLeafletIssueIcon(feature.issueType, feature.severity);
      const m      = L.marker(latlng, { icon, pane: "issuesPane" });
      m.feature    = feature;
      m.originalLatLng = latlng;

      m.on("click", () => {
        setActiveMarker(m);
        flyToMarker(m);
        highlightCard(feature.id);
        map.once("moveend", () => {
          m.setLatLng(m.originalLatLng);
          m.openPopup();
        });
      });

      m.bindPopup(() => buildPopupContent(feature), {
        className: `custom-popup severity-${feature.severity?.toLowerCase()}`,
        maxWidth: 300,
        autoPan: true,
        autoPanPaddingTopLeft: [10, 10]
      });

      markerById[feature.id] = m;
      m._siteClusterGroup = siteClusterGroups[feature.site] || null;
    });

    // Update stats
    updateStats(allFeatures);

    // Render cards
    renderCards();
  }

  function flyToMarker(marker) {
    let targetZoom = 16;

    if (marker.__parent && typeof marker.__parent.options.disableClusteringAtZoom === "number") {
      targetZoom = Math.max(marker.__parent.options.disableClusteringAtZoom, map.getZoom() + 2);
    }

    const targetLatLng = marker.originalLatLng || marker.getLatLng();
    const point = map.project(targetLatLng, targetZoom);
    point.y -= 100; // keep popup visible

    map.flyTo(map.unproject(point, targetZoom), targetZoom, {
      animate: true,
      duration: 0.6
    });
  }

  // ======================== POPUP BUILDER ========================
  function buildPopupContent(f) {
    const icon      = issueIcons[f.issueType] || "❓";
    const sevLower  = (f.severity || "").toLowerCase();
    const spUrl     = SHAREPOINT_BASE + f.id;
    const hasPhoto = f.photolink && f.photolink.startsWith("http");

    const container = document.createElement("div");
    container.innerHTML = `
      <div class="popup-header-band severity-${sevLower}">
        <span class="popup-issue-icon">${icon}</span>
        <div>
          <div class="popup-issue-title">${f.issueType || "Unknown Issue"}</div>
          <div class="popup-issue-subtitle">${f.site || "Unknown Site"}</div>
        </div>
      </div>

      ${hasPhoto ? `
        <a href="${f.photolink}" target="_blank" rel="noopener noreferrer" class="popup-photo-link">
          <img class="popup-photo" src="${f.photolink}" alt="Issue photo" loading="lazy" />
        </a>
      ` : ""}

      <div class="popup-body">
        <div class="popup-row">
          <span class="popup-label">Severity</span>
          <span class="popup-value">
            <span class="badge ${sevLower}">${f.severity || "—"}</span>
          </span>
        </div>
        <div class="popup-row">
          <span class="popup-label">Reported</span>
          <span class="popup-value">${formatIssueAge(f.submittedAt)}</span>
        </div>
        ${f.description ? `
        <div class="popup-description">${escapeHtml(f.description)}</div>
        ` : ""}
      </div>

      <div class="popup-actions">
        <a href="${spUrl}" target="_blank" rel="noopener noreferrer" class="popup-btn view-btn">
          📄 View in SharePoint
        </a>
        <button class="popup-btn complete-btn" data-id="${f.id}">
          ✔ Mark Done
        </button>
      </div>
    `;

    // Wire up complete button
    container.querySelector(".complete-btn")?.addEventListener("click", async function() {
      await markCompleted(f.id, this);
    });

    return container;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ======================== MARK COMPLETED ========================
  async function markCompleted(id, button) {
    if (!confirm("Mark this issue as completed and remove it from the map?")) return;

    button.disabled    = true;
    button.textContent = "Updating…";

    try {
      const res = await fetch(MARK_COMPLETE_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ID: id })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // Remove from map
      const m = markerById[id];
      if (m) {
        if (clusterGroup) clusterGroup.removeLayer(m);
        else map.removeLayer(m);
        delete markerById[id];
      }

      // Remove from data + re-render
      allFeatures = allFeatures.filter(f => f.id !== id);
      map.closePopup();
      updateStats(allFeatures);
      renderCards();

    } catch (err) {
      console.error("markCompleted error:", err);
      alert("Failed to mark as completed. Please try again.");
      button.disabled    = false;
      button.textContent = "✔ Mark Done";
    }
  }

  // ======================== STATS ========================
  function updateStats(features) {
    const high   = features.filter(f => f.severity?.trim() === "High").length;
    const medium = features.filter(f => f.severity?.trim() === "Medium").length;
    const low    = features.filter(f => f.severity?.trim() === "Low").length;

    document.getElementById("statTotal") .textContent = features.length;
    document.getElementById("statHigh")  .textContent = high;
    document.getElementById("statMedium").textContent = medium;
    document.getElementById("statLow")   .textContent = low;
  }

  // ======================== CARD LIST ========================
  function getFilteredFeatures() {
    return allFeatures.filter(f => {
      const sevOk  = activeSeverityFilter === "all" ||
        f.severity?.toLowerCase() === activeSeverityFilter;
      const siteOk = !activeSiteFilter || f.site === activeSiteFilter;
      const q = (activeSearchTerm || "").trim().toLowerCase();
      const textOk = !q || [f.issueType, f.site, f.description, f.severity]
      .filter(Boolean)
      .some(v => v.toLowerCase().includes(q));
      return sevOk && siteOk && textOk;
    });
  }

  function renderCards() {
    const list = document.getElementById("issuesList");
    const features = getFilteredFeatures(); // filtered by site/severity/search

    // --- Remove old cards and "no results" ---
    list.querySelectorAll(".issue-card, .no-results").forEach(c => c.remove());

    // --- Sort by date ---
    features.sort((a, b) => {
      if (!activeSortOrder || activeSortOrder === "newest") {
        return new Date(b.submittedAt) - new Date(a.submittedAt);
      } else {
        return new Date(a.submittedAt) - new Date(b.submittedAt);
      }
    });

    // --- Update stats ---
    updateStats(features);

    // --- Clear existing cards ---
    list.querySelectorAll(".issue-card").forEach(c => c.remove());

    if (features.length === 0) {
      if (!list.querySelector(".no-results")) {
        list.innerHTML = `
          <div class="no-results">
            <div class="no-results-icon">🔍</div>
            <div>No issues match your current filters.</div>
          </div>`;
      }
      if (clusterGroup) clusterGroup.clearLayers();
      return;
    }

    // --- Build issue cards (original styling) ---
    features.forEach(f => {
      const sevLower = (f.severity || "").toLowerCase();
      const icon     = issueIcons[f.issueType] || "❓";
      const card     = document.createElement("div");

      card.className    = `issue-card severity-${sevLower}`;
      card.dataset.id   = f.id;
      card.setAttribute("role", "listitem");
      card.setAttribute("tabindex", "0");
      card.setAttribute("aria-label", `${f.issueType} at ${f.site}, ${f.severity} severity`);

      card.innerHTML = `
        <div class="issue-card-icon">${icon}</div>
        <div class="issue-card-body">
          <div class="issue-card-top">
            <span class="issue-card-type">${f.issueType || "Unknown"}</span>
            <span class="badge ${sevLower}">${f.severity || "—"}</span>
          </div>
          <div class="issue-card-site">📍 ${f.site || "Unknown site"}</div>
          ${f.description ? `<div class="issue-card-desc">${escapeHtml(f.description)}</div>` : ""}
          <div class="issue-card-footer">
            <span class="issue-card-age">${formatIssueAge(f.submittedAt)}</span>
          </div>
        </div>
      `;

      card.addEventListener("click", () => {
        const marker = markerById[f.id];
        if (marker) {
          setActiveMarker(marker);
          flyToMarker(marker);
          marker.openPopup();
          highlightCard(f.id);
        }
      });

      list.appendChild(card);
    });

    // --- Update clusters with filtered markers only ---
    if (!clusterGroup) {
      clusterGroup = L.markerClusterGroup({
        chunkedLoading: true,
        showCoverageOnHover: false,
        disableClusteringAtZoom: 14,
        maxClusterRadius: zoom => zoom < 12 ? 120 : 60,
        iconCreateFunction: cluster => {
          const children  = cluster.getAllChildMarkers();
          const hasHigh   = children.some(m => m.feature?.severity === "High");
          const hasMedium = children.some(m => m.feature?.severity === "Medium");
          const bgColor   = hasHigh ? "#c0392b" : hasMedium ? "#d97706" : "#16a34a";
          const count     = cluster.getChildCount();
          const label     = children[0]?.feature?.site?.split(" ")[0] || "?";
          return L.divIcon({
            className: "",
            html: `<div style="min-width:42px;height:42px;background:${bgColor};
                          color:white;border-radius:8px;display:flex;
                          flex-direction:column;align-items:center;
                          justify-content:center;padding:0 8px;
                          border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);
                          font-family:var(--font-sans,sans-serif);gap:1px">
                    <span style="font-size:14px;font-weight:700;line-height:1;">${count}</span>
                    <span style="font-size:8px;font-weight:600;opacity:.85;
                                  line-height:1;white-space:nowrap;max-width:52px;
                                  overflow:hidden;text-overflow:ellipsis;">${label}</span>
                  </div>`,
            iconSize: [42,42],
            iconAnchor: [21,21]
          });
        }
      });
      map.addLayer(clusterGroup);
    } else {
      clusterGroup.clearLayers();
    }

    features.forEach(f => {
      const m = markerById[f.id];
      if (!m) return;
      if (m._siteClusterGroup) {
        m._siteClusterGroup.addLayer(m);
      } else if (clusterGroup) {
        clusterGroup.addLayer(m); // fallback
      }
    });
  }

  function highlightCard(id) {
    document.querySelectorAll(".issue-card").forEach(c => c.classList.remove("active-card"));
    const card = document.querySelector(`.issue-card[data-id="${id}"]`);
    if (card) {
      card.classList.add("active-card");
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function updateMarkerVisibility() {
    const filtered = new Set(getFilteredFeatures().map(f => f.id));
    Object.entries(markerById).forEach(([id, m]) => {
      const show = filtered.has(Number(id)) || filtered.has(id);
      const icon = show
        ? createLeafletIssueIcon(m.feature.issueType, m.feature.severity, m === activeMarker)
        : L.divIcon({ className: "", html: "", iconSize: [0, 0] });
      m.setIcon(icon);
    });
  }

  // ======================== INITIAL LOAD ========================
  loadIssues();

  // ======================== AUTO REFRESH ========================
  // Re-use loadIssues() so site-based clustering is rebuilt correctly.
  setInterval(() => {
    // Clear existing marker refs — loadIssues will rebuild them
    for (const key in markerById) delete markerById[key];
    activeMarker = null;
    loadIssues();
  }, REFRESH_INTERVAL_MS);

} // end isIssuesPage

}); // end DOMContentLoaded}