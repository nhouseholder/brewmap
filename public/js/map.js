// BrewMap — Leaflet Map Lifecycle

import * as state from './state.js';
import { FLAVOR_BAR_COLORS } from './config.js';
import { escHtml } from './utils.js';

export function initMap() {
  state.setMap(L.map('map', { zoomControl: true, attributionControl: false }).setView([40.7128, -74.0060], 13));
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
  }).addTo(state.map);
  // Fix iOS map rendering issues
  setTimeout(() => state.map.invalidateSize(), 100);
  window.addEventListener('resize', () => { setTimeout(() => state.map.invalidateSize(), 150); });
}

export function placeUserMarker() {
  if (state.userMarker) state.map.removeLayer(state.userMarker);
  const icon = L.divIcon({
    className: '',
    html: '<div class="user-marker"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
  state.setUserMarker(L.marker([state.userLat, state.userLng], { icon, zIndexOffset: 1000 }).addTo(state.map));
}

export function renderMapMarkers() {
  Object.values(state.markers).forEach(m => state.map.removeLayer(m));
  state.setMarkers({});
  state.filteredShops.forEach(shop => {
    const safeTags = window.BrewMapLogic.sanitizeFlavorTags(shop.flavorTags, window.FLAVOR_TAGS, shop.flavorProfile, 4);
    const tf = safeTags[0]?.tag || 'balanced';
    const mc = FLAVOR_BAR_COLORS[tf] || '#d4a053';
    const icon = L.divIcon({
      className: '',
      html: '<div class="coffee-marker" style="background:' + mc + '"><span class="coffee-marker-inner">&#9749;</span></div>',
      iconSize: [28, 28],
      iconAnchor: [14, 28],
      popupAnchor: [0, -28]
    });
    const marker = L.marker([shop.lat, shop.lng], { icon }).addTo(state.map)
      .bindPopup(
        '<div class="popup-name">' + escHtml(shop.name) + '</div>' +
        '<div class="popup-rating">&#9733; ' + shop.rating + ' (' + shop.reviewCount + ' reviews)' + (shop.dataSource === 'yelp' ? ' <span style="font-size:10px;opacity:0.7;">via Yelp</span>' : '') + '</div>' +
        '<div class="popup-address">' + escHtml(shop.address || '') + '</div>' +
        '<div class="popup-flavors">' + safeTags.map(f => '<span class="popup-flavor ft-' + f.tag + '">' + f.tag + '</span>').join('') + '</div>',
        { maxWidth: 240 }
      );
    marker.on('click', () => window.selectShop(shop.id));
    state.markers[shop.id] = marker;
  });
}
