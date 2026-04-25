// BrewMap — City Search, Switching & Location Services

import * as state from './state.js';
import { CITIES } from './config.js';
import { escHtml } from './utils.js';
import { placeUserMarker } from './map.js';
import { scanArea, loadFromCache } from './data.js';

let searchDebounce = null;

export function searchCity() {
  const q = document.getElementById('citySearchInput').value.trim();
  if (q.length < 2) return;
  const results = document.getElementById('citySearchResults');
  results.innerHTML = '<div class="city-result" style="color:var(--text3)">Searching...</div>';
  results.classList.add('open');
  updateCitySearchExpanded(true);
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(async () => {
    try {
      const r = await fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(q) + '&format=json&limit=5&addressdetails=1');
      const data = await r.json();
      if (data.length === 0) {
        results.innerHTML = '<div class="city-result" style="color:var(--text3)">No results found</div>';
        return;
      }
      const container = document.createDocumentFragment();
      data.forEach((d, i) => {
        const div = document.createElement('div');
        div.className = 'city-result';
        div.setAttribute('role', 'option');
        div.tabIndex = 0;
        const label = d.display_name.split(',').slice(0, 2).join(', ');
        const detail = d.display_name.split(',').slice(2, 4).join(', ');
        div.innerHTML = '<div class="city-result-name">' + escHtml(label) + '</div><div class="city-result-detail">' + escHtml(detail) + '</div>';
        const handler = () => selectSearchResult(parseFloat(d.lat), parseFloat(d.lon), label);
        div.addEventListener('click', handler);
        div.addEventListener('keydown', e => { if (e.key === 'Enter') handler(); });
        container.appendChild(div);
      });
      results.innerHTML = '';
      results.appendChild(container);
    } catch (e) {
      results.innerHTML = '<div class="city-result" style="color:var(--text3)">Search failed \u2014 try again</div>';
    }
  }, 300);
}

export function handleCitySearchKey(e) {
  const results = document.getElementById('citySearchResults');
  const items = results.querySelectorAll('.city-result[role="option"]');
  if (e.key === 'Enter' && items.length === 0) { searchCity(); return; }
  if (!items.length || !results.classList.contains('open')) { if (e.key === 'Enter') searchCity(); return; }
  const focused = results.querySelector('.city-result.focused');
  let idx = Array.from(items).indexOf(focused);
  if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(idx + 1, items.length - 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(idx - 1, 0); }
  else if (e.key === 'Enter' && focused) { e.preventDefault(); focused.click(); return; }
  else if (e.key === 'Escape') { results.classList.remove('open'); updateCitySearchExpanded(false); return; }
  else return;
  items.forEach(i => i.classList.remove('focused'));
  if (items[idx]) { items[idx].classList.add('focused'); items[idx].scrollIntoView({ block: 'nearest' }); }
}

export function updateCitySearchExpanded(open) {
  const input = document.getElementById('citySearchInput');
  if (input) input.setAttribute('aria-expanded', open ? 'true' : 'false');
}

export function showCachedCitiesDropdown(filter) {
  if (!state.cachedCities) return false;
  const cities = Object.values(state.cachedCities);
  const q = (filter || '').toLowerCase();
  const matches = q ? cities.filter(c => c.name.toLowerCase().includes(q)) : cities;
  if (matches.length === 0) return false;
  matches.sort((a, b) => b.shopCount - a.shopCount);
  const results = document.getElementById('citySearchResults');
  const container = document.createDocumentFragment();
  const header = document.createElement('div');
  header.style.cssText = 'padding:6px 12px;font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border)';
  header.textContent = q ? 'Cached cities' : 'Instant load \u2014 ' + cities.length + ' cities cached';
  container.appendChild(header);
  matches.slice(0, 12).forEach(c => {
    const div = document.createElement('div');
    div.className = 'city-result';
    div.setAttribute('role', 'option');
    div.tabIndex = 0;
    div.innerHTML = '<div class="city-result-name">' + escHtml(c.name) + '</div><div class="city-result-detail">' + c.shopCount + ' shops \u2022 instant</div>';
    div.addEventListener('click', () => selectSearchResult(c.lat, c.lng, c.name));
    div.addEventListener('keydown', e => { if (e.key === 'Enter') selectSearchResult(c.lat, c.lng, c.name); });
    container.appendChild(div);
  });
  results.innerHTML = '';
  results.appendChild(container);
  results.classList.add('open');
  updateCitySearchExpanded(true);
  return true;
}

export async function selectSearchResult(lat, lng, name) {
  document.getElementById('citySearchResults').classList.remove('open');
  document.getElementById('citySearchInput').value = '';
  state.setCurrentCity('custom');
  state.setUserLat(lat);
  state.setUserLng(lng);
  state.setRadiusMiles(5);
  document.getElementById('radiusSlider').value = 5;
  document.getElementById('radiusLabel').textContent = '5 mi';
  state.map.setView([lat, lng], 14);
  placeUserMarker();
  document.getElementById('locationText').textContent = name;
  document.getElementById('findNearMeBtn').style.display = 'none';
  window.closeDetail && window.closeDetail();
  window.updateHash && window.updateHash();
  scanArea();
}

export function switchCity(cityKey) {
  const city = CITIES[cityKey];
  if (!city) return;
  window.closeDetail && window.closeDetail();
  if (cityKey === 'current') {
    findNearMe();
    return;
  }
  state.setCurrentCity(cityKey);
  state.setUserLat(city.lat);
  state.setUserLng(city.lng);
  state.setRadiusMiles(city.defaultRadius);
  document.getElementById('radiusSlider').value = city.defaultRadius;
  document.getElementById('radiusLabel').textContent = city.defaultRadius + ' mi';
  state.map.setView([city.lat, city.lng], city.zoom);
  placeUserMarker();
  document.getElementById('locationText').textContent = city.name;
  updateCityButtons({ nyc: 0, phoenix: 1, galveston: 2, current: 3 }[cityKey]);
  if (!state.hasUsedLocation) {
    document.getElementById('findNearMeBtn').style.display = 'flex';
  }
  scanArea();
}

export function updateCityButtons(activeKey) {
  const keyMap = { nyc: 0, phoenix: 1, galveston: 2, current: 3 };
  const idx = typeof activeKey === 'number' ? activeKey : (keyMap[activeKey] ?? -1);
  document.querySelectorAll('.city-btn').forEach((b, i) => b.classList.toggle('active', i === idx));
}

export function findNearMe() {
  if (!navigator.geolocation) {
    alert('Location services are not available on this device.');
    return;
  }
  const btn = document.getElementById('findNearMeBtn');
  btn.classList.add('scanning');
  btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg> Locating...';
  document.getElementById('loadingOverlay').classList.remove('hidden');
  document.getElementById('skipLocationBtn').style.display = 'inline-block';
  window.updateLoading && window.updateLoading('Getting your location...', 'Please allow location access when prompted');

  navigator.geolocation.getCurrentPosition(pos => {
    document.getElementById('skipLocationBtn').style.display = 'none';
    state.setHasUsedLocation(true);
    state.setCurrentCity('current');
    CITIES.current.lat = pos.coords.latitude;
    CITIES.current.lng = pos.coords.longitude;
    state.setUserLat(pos.coords.latitude);
    state.setUserLng(pos.coords.longitude);
    state.setRadiusMiles(5);
    document.getElementById('radiusSlider').value = 5;
    document.getElementById('radiusLabel').textContent = '5 mi';
    state.map.setView([state.userLat, state.userLng], 15);
    placeUserMarker();
    updateCityButtons(3);
    reverseGeocode(state.userLat, state.userLng);
    btn.style.display = 'none';
    document.getElementById('mapLocateBtn').style.display = 'flex';
    scanArea();
  }, err => {
    btn.classList.remove('scanning');
    btn.innerHTML = '<div class="find-near-me-pulse"></div><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg> Find Coffee Near Me';
    document.getElementById('loadingOverlay').classList.add('hidden');
    document.getElementById('skipLocationBtn').style.display = 'none';
    if (err.code === 1) {
      alert('Location access was denied. Please enable location services in your device settings and try again.');
    } else {
      alert('Could not determine your location. Please try again.');
    }
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
}

export function skipGeolocation() {
  document.getElementById('loadingOverlay').classList.add('hidden');
  document.getElementById('skipLocationBtn').style.display = 'none';
  const btn = document.getElementById('findNearMeBtn');
  if (btn) {
    btn.classList.remove('scanning');
    btn.innerHTML = '<div class="find-near-me-pulse"></div><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg> Find Coffee Near Me';
  }
  const input = document.getElementById('citySearchInput');
  if (input) { input.focus(); input.click(); }
}

export function locateMe() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(pos => {
    state.setUserLat(pos.coords.latitude);
    state.setUserLng(pos.coords.longitude);
    CITIES.current.lat = state.userLat;
    CITIES.current.lng = state.userLng;
    state.map.setView([state.userLat, state.userLng], Math.max(state.map.getZoom(), 14));
    placeUserMarker();
    if (state.currentCity !== 'current') {
      state.setCurrentCity('current');
      updateCityButtons(3);
      scanArea();
    }
  }, () => {}, { enableHighAccuracy: true, timeout: 10000 });
}

function reverseGeocode(lat, lng) {
  fetch('https://nominatim.openstreetmap.org/reverse?lat=' + lat + '&lon=' + lng + '&format=json&zoom=12')
    .then(r => r.json())
    .then(d => {
      const city = d.address?.city || d.address?.town || d.address?.village || 'Your Area';
      const st = d.address?.state_code || d.address?.state || '';
      document.getElementById('locationText').textContent = city + (st ? ', ' + st : '');
    }).catch(() => {
      document.getElementById('locationText').textContent = 'Your Location';
    });
}
