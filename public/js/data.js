// BrewMap — Data Loading, Caching & Scanning

import * as state from './state.js';
import { FLAVOR_TAGS } from './config.js';
import { hashCode, mulberry32, getDistance, slugify, sleep } from './utils.js';
import { hydrateShop, populateOriginFilter, filterShops } from './filters.js';
import { updateLoading, showScanError, updateStats } from './render.js';
import { updateDataSourceBadge as renderDataSourceBadge } from './render.js';

export async function loadCachedCities() {
  try {
    const r = await fetch('/api/cities');
    const data = await r.json();
    if (data.available && data.cities?.length) {
      const cities = {};
      data.cities.forEach(c => { cities[c.slug] = c; });
      state.setCachedCities(cities);
      console.log(`[Cache] ${data.cities.length} cities available (${data.totalShops} shops)`);
    }
  } catch (e) {
    console.warn('[Cache] Cities index unavailable:', e.message);
  }
}

export async function loadFromCache(citySlug) {
  try {
    const r = await fetch('/api/city/' + encodeURIComponent(citySlug));
    const data = await r.json();
    if (data.available && data.shops?.length) {
      return data;
    }
  } catch (e) {
    console.warn('[Cache] Failed to load city:', e.message);
  }
  return null;
}

export function findNearestCachedCity(lat, lng, maxDistMi) {
  if (!state.cachedCities) return null;
  let best = null, bestDist = maxDistMi || 30;
  for (const city of Object.values(state.cachedCities)) {
    const d = getDistance(lat, lng, city.lat, city.lng);
    if (d < bestDist) { bestDist = d; best = city; }
  }
  return best;
}

export async function scanArea() {
  if (!state.userLat || !state.userLng) {
    console.warn('scanArea called without coordinates');
    return;
  }
  if (state.currentScanController) { state.currentScanController.abort(); }
  state.setCurrentScanController(new AbortController());
  const scanAbort = state.currentScanController.signal;
  const scanToken = ++state.scanRequestToken;
  const scanBtn = document.getElementById('scanBtn');
  scanBtn.disabled = true;
  state.setLastScanRadius(state.radiusMiles);
  document.getElementById('loadingOverlay').classList.remove('hidden');

  try {
    // === TRY CACHE FIRST ===
    const nearestCity = findNearestCachedCity(state.userLat, state.userLng, 30);
    if (nearestCity) {
      updateLoading('Loading coffee shops...', 'Using cached data for ' + nearestCity.name);
      const cached = await loadFromCache(nearestCity.slug);
      if (scanAbort.aborted || scanToken !== state.scanRequestToken) {
        scanBtn.disabled = false;
        return;
      }
      if (cached?.shops?.length) {
        const shops = cached.shops.map(s => ({
          ...s,
          distance: getDistance(state.userLat, state.userLng, s.lat, s.lng),
          reviews: s.yelpReviews && s.yelpReviews.length > 0
            ? s.yelpReviews.map(r => ({ text: r.text, source: 'Yelp', rating: r.rating, user: r.user, flavorsFound: [] }))
            : generateReviews(s.name, s.flavorProfile, mulberry32(hashCode(s.name)), s.reviewCount),
        })).map(hydrateShop).filter(s => s.distance <= state.radiusMiles).sort((a, b) => a.distance - b.distance);

        if (shops.length === 0) {
          console.log('[Cache] No shops within ' + state.radiusMiles + 'mi \u2014 falling back to Overpass');
        } else {
          state.setAllShops(shops);
          populateOriginFilter();
          updateDataSourceBadge('cached', cached.updatedAt);
          filterShops();
          document.getElementById('loadingOverlay').classList.add('hidden');
          document.getElementById('refreshBtn').style.display = 'flex';
          updateStats();
          updateHash();
          scanBtn.disabled = false;
          return;
        }
      }
    }

    // === FALLBACK: ON-DEMAND DISCOVER ===
    updateLoading('Discovering coffee shops...', 'Scanning and caching this area');
    const cityName = document.getElementById('locationText').textContent || 'Unknown Area';
    const discoverRes = await fetch('/api/city/discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: state.userLat, lng: state.userLng, name: cityName, radiusMi: state.radiusMiles }),
      signal: scanAbort,
    });
    const discoverData = await discoverRes.json();
    if (scanAbort.aborted || scanToken !== state.scanRequestToken) {
      scanBtn.disabled = false;
      return;
    }
    if (!discoverRes.ok || !discoverData.available) {
      throw new Error(discoverData.error || 'Could not discover coffee shops in this area.');
    }

    const shops = discoverData.shops.map(s => ({
      ...s,
      distance: getDistance(state.userLat, state.userLng, s.lat, s.lng),
      reviews: s.yelpReviews && s.yelpReviews.length > 0
        ? s.yelpReviews.map(r => ({ text: r.text, source: 'Yelp', rating: r.rating, user: r.user, flavorsFound: [] }))
        : generateReviews(s.name, s.flavorProfile, mulberry32(hashCode(s.name)), s.reviewCount),
    })).map(hydrateShop).filter(s => s.distance <= state.radiusMiles).sort((a, b) => a.distance - b.distance);

    if (discoverData.source === 'discovered' && state.cachedCities) {
      state.cachedCities[discoverData.city] = {
        slug: discoverData.city, name: cityName,
        lat: discoverData.lat, lng: discoverData.lng,
        shopCount: discoverData.shopCount,
      };
    }

    state.setAllShops(shops);
    populateOriginFilter();
    updateDataSourceBadge(discoverData.source === 'cached' ? 'cached' : 'discovered', discoverData.updatedAt);
    filterShops();
    document.getElementById('loadingOverlay').classList.add('hidden');
    document.getElementById('refreshBtn').style.display = 'flex';
    updateStats();
    updateHash();
  } catch (err) {
    if (err.name === 'AbortError') {
      document.getElementById('loadingOverlay').classList.add('hidden');
      scanBtn.disabled = false;
      return;
    }
    if (scanToken !== state.scanRequestToken) {
      scanBtn.disabled = false;
      return;
    }
    console.error('Scan error:', err);
    showScanError('The map database may be temporarily unavailable.');
  }
  scanBtn.disabled = false;
}

export function updateDataSourceBadge(source, updatedAt) {
  state.setDataSource(source);
  state.setCurrentDataSourceMode(source);
  state.setCurrentDataUpdatedAt(updatedAt || null);
  const el = document.getElementById('dataSourceBadge');
  if (!el) return;
  if (source === 'cached') {
    const date = updatedAt ? new Date(updatedAt).toLocaleDateString() : '';
    el.innerHTML = '&#9889; Cached' + (date ? ' &middot; ' + date : '');
    el.style.display = 'inline-flex';
    el.style.background = 'rgba(93,186,125,0.15)';
    el.style.color = '#5dba7d';
  } else if (source === 'discovered') {
    el.innerHTML = '&#10024; Freshly discovered';
    el.style.display = 'inline-flex';
    el.style.background = 'rgba(93,141,232,0.15)';
    el.style.color = '#5d8de8';
  } else {
    el.innerHTML = '&#128260; Live API';
    el.style.display = 'inline-flex';
    el.style.background = 'rgba(232,180,93,0.15)';
    el.style.color = '#e8b45d';
  }
}

export function parseHash() {
  const h = window.location.hash.slice(1);
  const p = {};
  h.split('&').forEach(pair => {
    const [k, v] = pair.split('=');
    if (k && v) p[k] = decodeURIComponent(v);
  });
  if (p.lat) p.lat = parseFloat(p.lat);
  if (p.lng) p.lng = parseFloat(p.lng);
  if (p.r) p.r = parseFloat(p.r);
  return p;
}

export function updateHash() {
  if (!state.userLat || !state.userLng) return;
  const locName = document.getElementById('locationText').textContent;
  window.location.hash = 'lat=' + state.userLat.toFixed(4) + '&lng=' + state.userLng.toFixed(4) + '&r=' + state.radiusMiles + (locName ? '&name=' + encodeURIComponent(locName) : '');
}

function generateReviews(shopName, fp, rng, total) {
  const top = Object.entries(fp).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
  const f1 = top[0], f2 = top[1], f3 = top[2];
  const templates = [
    'The coffee here has a wonderful ' + f1 + ' quality. Really ' + f2 + ' with hints of ' + f3 + '.',
    'Best local spot! Their pour-over is incredibly ' + f1 + ' and ' + f2 + '. You can taste the ' + f3 + ' notes.',
    'Love the ' + f1 + ' flavor profile. Not your typical chain coffee \u2014 this is ' + f2 + ' and ' + f3 + '.',
    'Their signature blend is ' + f1 + ' with ' + f2 + ' undertones. Highly recommend if you like ' + f3 + ' coffee.',
    'Amazing ' + f1 + ' espresso. The baristas know their stuff. Notes of ' + f2 + ' and ' + f3 + ' come through perfectly.',
    'If you are looking for ' + f1 + ' coffee, this is the place. So ' + f2 + ' and the finish is ' + f3 + '.',
    'Hidden gem! The cold brew is ' + f1 + ' and ' + f2 + '. Way better than chain coffee.',
    'Their house roast is perfectly ' + f1 + '. The ' + f2 + ' notes really shine. A must-try.'
  ];
  const sources = ['AI Estimate','AI Estimate','AI Estimate','AI Estimate','AI Estimate'];
  return templates.sort(() => rng() - 0.5).slice(0, 4).map(text => ({
    text,
    source: sources[Math.floor(rng() * sources.length)],
    rating: Math.round((3.5 + rng() * 1.5) * 10) / 10,
    flavorsFound: top
  }));
}
