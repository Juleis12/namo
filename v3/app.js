class LocationTracker {
  constructor() {
    this.map = null;
    this.marker = null;
    this.accuracyCircle = null;
    this.watchId = null;
    this.lastPosition = null;

    // Configuration from provided data
    this.config = {
      defaultCoordinates: { lat: 51.505, lng: -0.09, zoom: 13 },
      ntfyBaseUrl: "https://ntfy.sh/",
      mapTileUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      mapAttribution: "© OpenStreetMap contributors",
    };

    // DOM elements
    this.elements = {
      statusText: document.getElementById("statusText"),
      lastUpdate: document.getElementById("lastUpdate"),
      accuracy: document.getElementById("accuracy"),
      coordinates: document.getElementById("coordinates"),
      ntfyTopic: "santiqq",
      refreshBtn: document.getElementById("refreshBtn"),
    };

    this.init();
  }

  init() {
    this.initMap();
    this.setupEventListeners();
    // Small delay to let map initialize before requesting location
    setTimeout(() => {
      this.startLocationTracking();
    }, 1000);
  }

  initMap() {
    try {
      // Initialize Leaflet map
      this.map = L.map("map", {
        center: [this.config.defaultCoordinates.lat, this.config.defaultCoordinates.lng],
        zoom: this.config.defaultCoordinates.zoom,
        zoomControl: true,
      });

      // Add OpenStreetMap tiles with proper attribution
      const tileLayer = L.tileLayer(this.config.mapTileUrl, {
        attribution: this.config.mapAttribution,
        maxZoom: 19,
        subdomains: ["a", "b", "c"],
      });

      tileLayer.addTo(this.map);

      // Add event listeners for tile loading
      tileLayer.on("loading", () => {
        this.updateStatus("Loading map tiles...", "info");
      });

      tileLayer.on("load", () => {
        this.updateStatus("Map loaded. Click refresh to get your location.", "info");
      });

      tileLayer.on("tileerror", (error) => {
        console.error("Tile loading error:", error);
        this.updateStatus("Map tiles failed to load. Check connection.", "warning");
      });

      // Add a sample marker at default location
      const defaultMarker = L.marker([this.config.defaultCoordinates.lat, this.config.defaultCoordinates.lng])
        .addTo(this.map)
        .bindPopup("Default location - London<br>Click refresh to get your actual location");
    } catch (error) {
      console.error("Map initialization error:", error);
      this.updateStatus("Failed to initialize map", "error");
    }
  }

  setupEventListeners() {
    this.elements.refreshBtn.addEventListener("click", () => {
      this.refreshLocation();
    });

    // Save ntfy topic to localStorage when changed
    this.elements.ntfyTopic.addEventListener("input", (e) => {
      try {
        localStorage.setItem("ntfyTopic", e.target.value);
      } catch (error) {
        // Handle localStorage not available
        console.warn("localStorage not available");
      }
    });

    // Load saved ntfy topic
    try {
      const savedTopic = localStorage.getItem("ntfyTopic");
      if (savedTopic) {
        this.elements.ntfyTopic.value = savedTopic;
      }
    } catch (error) {
      // Handle localStorage not available
      console.warn("localStorage not available");
    }
  }

  startLocationTracking() {
    if (!navigator.geolocation) {
      this.updateStatus("Geolocation not supported by this browser", "error");
      return;
    }

    // Check if we're on a secure context (required for geolocation in many browsers)
    if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      this.updateStatus("Geolocation requires HTTPS. Click refresh to try anyway.", "warning");
      return;
    }

    this.updateStatus("Requesting location permission...", "info");

    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000, // 5 minutes
    };

    // Try to get current position first
    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.onLocationSuccess(position);
        this.startWatching();
      },
      (error) => {
        this.onLocationError(error);
      },
      options
    );
  }

  startWatching() {
    if (this.watchId) {
      navigator.geolocation.clearWatch(this.watchId);
    }

    const options = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 60000, // 1 minute
    };

    // Watch position for real-time updates
    this.watchId = navigator.geolocation.watchPosition(
      (position) => this.onLocationSuccess(position),
      (error) => this.onLocationError(error),
      options
    );
  }

  onLocationSuccess(position) {
    const { latitude, longitude, accuracy } = position.coords;
    const timestamp = new Date(position.timestamp);

    this.lastPosition = position;

    // Update map
    this.updateMapLocation(latitude, longitude, accuracy);

    // Update UI
    this.updateLocationDisplay(latitude, longitude, accuracy, timestamp);

    // Send to ntfy if topic is configured
    this.sendToNtfy(latitude, longitude, timestamp, accuracy);

    this.updateStatus("Location tracking active", "success");
  }

  onLocationError(error) {
    let message = "";
    let type = "error";

    switch (error.code) {
      case error.PERMISSION_DENIED:
        message = "Location permission denied. Please enable location access in your browser.";
        break;
      case error.POSITION_UNAVAILABLE:
        message = "Location unavailable. Please check your GPS/network connection.";
        type = "warning";
        break;
      case error.TIMEOUT:
        message = "Location request timeout. Click refresh to try again.";
        type = "warning";
        break;
      default:
        message = `Location error: ${error.message || "Unknown error"}`;
        break;
    }

    this.updateStatus(message, type);
    console.error("Geolocation error:", error);
  }

  updateMapLocation(lat, lng, accuracy) {
    const position = [lat, lng];

    // Remove existing marker and circle
    if (this.marker) {
      this.map.removeLayer(this.marker);
    }
    if (this.accuracyCircle) {
      this.map.removeLayer(this.accuracyCircle);
    }

    // Add new marker with custom icon
    this.marker = L.marker(position, {
      title: "Your current location",
    }).addTo(this.map);

    this.marker
      .bindPopup(
        `
            <div style="font-family: var(--font-family-base); min-width: 200px;">
                <strong>📍 Your Location</strong><br><br>
                <strong>Coordinates:</strong><br>
                ${lat.toFixed(6)}, ${lng.toFixed(6)}<br><br>
                <strong>Accuracy:</strong> ±${Math.round(accuracy)}m<br>
                <strong>Time:</strong> ${new Date().toLocaleTimeString()}
            </div>
        `
      )
      .openPopup();

    // Add accuracy circle
    this.accuracyCircle = L.circle(position, {
      radius: accuracy,
      fillColor: "#1FB8CD",
      fillOpacity: 0.15,
      color: "#1FB8CD",
      weight: 2,
      opacity: 0.8,
    }).addTo(this.map);

    // Center map on new location with appropriate zoom
    const zoomLevel = this.calculateZoomLevel(accuracy);
    this.map.setView(position, zoomLevel);
  }

  calculateZoomLevel(accuracy) {
    // Calculate appropriate zoom level based on accuracy
    if (accuracy <= 10) return 18;
    if (accuracy <= 50) return 16;
    if (accuracy <= 100) return 15;
    if (accuracy <= 500) return 14;
    return 13;
  }

  updateLocationDisplay(lat, lng, accuracy, timestamp) {
    this.elements.coordinates.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    this.elements.accuracy.textContent = `±${Math.round(accuracy)}m`;
    this.elements.lastUpdate.textContent = timestamp.toLocaleTimeString();
  }

  async sendToNtfy(lat, lng, timestamp, accuracy) {
    const topic = this.elements.ntfyTopic.value.trim();
    if (!topic) return;

    const data = {
      title: "📍 Location Update",
      message: `${lat.toFixed(6)}, ${lng.toFixed(6)} (±${Math.round(accuracy)}m)`,
      tags: ["round_pushpin", "location"],
      extras: {
        coordinates: { lat, lng },
        accuracy: Math.round(accuracy),
        timestamp: timestamp.toISOString(),
      },
    };

    try {
      const response = await fetch(`${this.config.ntfyBaseUrl}${topic}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      console.log("Location sent to ntfy successfully");
    } catch (error) {
      console.warn("Failed to send to ntfy:", error);
    }
  }

  refreshLocation() {
    this.elements.refreshBtn.classList.add("loading");
    this.updateStatus("Getting current location...", "info");

    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0, // Force fresh location
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.onLocationSuccess(position);
        this.elements.refreshBtn.classList.remove("loading");
        if (!this.watchId) {
          this.startWatching();
        }
      },
      (error) => {
        this.onLocationError(error);
        this.elements.refreshBtn.classList.remove("loading");
      },
      options
    );
  }

  updateStatus(message, type = "info") {
    this.elements.statusText.textContent = message;
    this.elements.statusText.className = `status status--${type}`;
    console.log(`Status [${type}]: ${message}`);
  }

  destroy() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }
}

// Initialize the application when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  try {
    window.locationTracker = new LocationTracker();
  } catch (error) {
    console.error("Failed to initialize LocationTracker:", error);
    document.getElementById("statusText").textContent = "Failed to initialize application";
    document.getElementById("statusText").className = "status status--error";
  }
});

// Clean up when page is unloaded
window.addEventListener("beforeunload", () => {
  if (window.locationTracker) {
    window.locationTracker.destroy();
  }
});
