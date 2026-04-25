// BrewMap — Bootstrap & Event Wiring

import * as state from './state.js';
import { CITIES } from './config.js';
import { initMap, placeUserMarker } from './map.js';
import { renderFlavorFilters, renderQuickIntents, updateVerifiedOnlyUI, toggleVerifiedOnly, handleManualFilterChange, setRoastFilter, clearFlavorSelection, updateRatingFilter, filterShops } from './filters.js';
import { selectShop, closeDetail, updateLoading } from './render.js';
import { loadCachedCities, scanArea, parseHash, updateHash } from './data.js';
import { searchCity, handleCitySearchKey, showCachedCitiesDropdown, selectSearchResult, switchCity, findNearMe, skipGeolocation, locateMe, updateCityButtons } from './city-search.js';

// Expose functions needed by dynamically-generated inline HTML
window.selectShop = selectShop;
window.closeDetail = closeDetail;
window.scanArea = scanArea;
window.updateHash = updateHash;
window.skipGeolocation = skipGeolocation;
window.updateLoading = updateLoading;

// Expose functions for static inline HTML (temporarily; will migrate to listeners)
window.toggleVerifiedOnly = toggleVerifiedOnly;
window.setRoastFilter = setRoastFilter;
window.clearFlavorSelection = clearFlavorSelection;
window.findNearMe = findNearMe;
window.locateMe = locateMe;
window.switchCity = switchCity;
window.handleCitySearchKey = handleCitySearchKey;
window.selectSearchResult = selectSearchResult;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  renderFlavorFilters();
  renderQuickIntents();
  updateVerifiedOnlyUI();
  loadCachedCities();

  if (navigator.geolocation) {
    document.getElementById('findNearMeBtn').style.display = 'flex';
  }

  // Check URL hash first
  const hashParams = parseHash();
  if (hashParams.lat && hashParams.lng) {
    state.setUserLat(hashParams.lat);
    state.setUserLng(hashParams.lng);
    state.setRadiusMiles(hashParams.r || 5);
    state.setCurrentCity('custom');
    document.getElementById('radiusSlider').value = state.radiusMiles;
    document.getElementById('radiusLabel').textContent = state.radiusMiles + ' mi';
    state.map.setView([state.userLat, state.userLng], 14);
    placeUserMarker();
    document.getElementById('locationText').textContent = hashParams.name || 'Shared Location';
    document.getElementById('findNearMeBtn').style.display = 'none';
    scanArea();
  } else if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      state.setHasUsedLocation(true);
      state.setCurrentCity('current');
      CITIES.current.lat = pos.coords.latitude;
      CITIES.current.lng = pos.coords.longitude;
      state.setUserLat(pos.coords.latitude);
      state.setUserLng(pos.coords.longitude);
      state.setRadiusMiles(5);
      document.getElementById('radiusSlider').value = 5;
      document.getElementById('radiusLabel').textContent = '5 mi';
      state.map.setView([state.userLat, state.userLng], 12);
      placeUserMarker();
      document.getElementById('findNearMeBtn').style.display = 'none';
      scanArea();
    }, () => {
      switchCity('nyc');
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  } else {
    switchCity('nyc');
  }
});

// City search input
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('citySearchInput');
  if (input) {
    input.addEventListener('focus', () => {
      if (!input.value.trim()) showCachedCitiesDropdown();
    });
    input.addEventListener('input', () => {
      const q = input.value.trim();
      if (q.length === 0) { showCachedCitiesDropdown(); return; }
      if (q.length >= 2 && !showCachedCitiesDropdown(q)) {
        searchCity();
      } else if (q.length >= 2) {
        clearTimeout(window._citySearchDebounce);
        window._citySearchDebounce = setTimeout(() => searchCity(), 600);
      } else if (q.length === 1) {
        showCachedCitiesDropdown(q);
      }
    });
  }
  // Close dropdown on click outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.city-search-wrap')) {
      document.getElementById('citySearchResults').classList.remove('open');
      const inp = document.getElementById('citySearchInput');
      if (inp) inp.setAttribute('aria-expanded', 'false');
    }
  });
});

// Radius slider
document.addEventListener('DOMContentLoaded', () => {
  const slider = document.getElementById('radiusSlider');
  if (slider) {
    slider.addEventListener('input', () => {
      const newRadius = parseFloat(slider.value);
      state.setRadiusMiles(newRadius);
      document.getElementById('radiusLabel').textContent = state.radiusMiles + ' mi';
      if (newRadius > state.lastScanRadius && state.userLat && state.userLng) {
        clearTimeout(window._radiusRescanTimer);
        window._radiusRescanTimer = setTimeout(() => scanArea(), 500);
      } else {
        filterShops();
      }
    });
  }
});

// Escape key to close detail
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('detailPanel').classList.contains('open')) {
    closeDetail();
  }
});

// iOS touchmove fix
function allowNativeTouchMove(target) {
  return Boolean(target.closest('.sidebar') || target.closest('.detail-panel') || target.closest('.city-search-results') || target.closest('#map') || target.closest('.loading-overlay'));
}
document.body.addEventListener('touchmove', (e) => {
  if (allowNativeTouchMove(e.target)) return;
  e.preventDefault();
}, { passive: false });
