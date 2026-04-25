// BrewMap — DOM Rendering

import * as state from './state.js';
import { FLAVOR_BAR_COLORS } from './config.js';
import { escHtml, formatDistance } from './utils.js';

export function sourceBadgeHtml(shop) {
  const meta = shop._sourceMeta || window.BrewMapLogic.getShopSourceMeta(shop);
  return '<span class="source-badge ' + meta.tone + '">' + escHtml(meta.label) + '</span>';
}

export function renderFeaturedRails() {
  const container = document.getElementById('featuredRails');
  if (!container) return;
  const sections = window.BrewMapLogic.buildFeaturedSections(state.filteredShops, {
    updatedAt: state.currentDataUpdatedAt,
    source: state.currentDataSourceMode,
    activeFlavorTags: Array.from(state.activeFlavorFilters),
  });
  if (sections.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = sections.map(section =>
    '<div class="featured-section">' +
      '<div class="featured-section-header">' +
        '<div class="featured-section-title">' + escHtml(section.title) + '</div>' +
        '<div class="featured-section-subtitle">' + escHtml(section.subtitle) + '</div>' +
      '</div>' +
      '<div class="featured-cards">' + section.shops.map(shop => {
        const tags = window.BrewMapLogic.sanitizeFlavorTags(shop.flavorTags, window.FLAVOR_TAGS, shop.flavorProfile, 3);
        return '<button type="button" class="featured-card" onclick="window.selectShop(' + shop.id + ')">' +
          '<div class="featured-card-name">' + escHtml(shop.name) + '</div>' +
          '<div class="featured-card-meta">' + formatDistance(shop.distance) + ' &middot; ' + shop.rating + ' stars &middot; ' + shop.reviewCount + ' reviews</div>' +
          sourceBadgeHtml(shop) +
          '<div class="featured-card-tags">' + tags.map(f => '<span class="shop-flavor-tag ft-' + f.tag + '">' + f.tag + '</span>').join('') + '</div>' +
        '</button>';
      }).join('') + '</div>' +
    '</div>'
  ).join('');
}

export function renderShopList() {
  const c = document.getElementById('shopList');
  if (state.filteredShops.length === 0) {
    c.innerHTML = '<div class="empty-state"><div class="empty-icon">&#9749;</div><div class="empty-title">No shops match your filters</div><div class="empty-subtitle">Try adjusting your flavor filters or search radius</div></div>';
    return;
  }
  c.innerHTML = state.filteredShops.map(shop => {
    const safeTags = window.BrewMapLogic.sanitizeFlavorTags(shop.flavorTags, window.FLAVOR_TAGS, shop.flavorProfile, 5);
    return '<div class="shop-card ' + (state.selectedShopId === shop.id ? 'active' : '') + '" onclick="window.selectShop(' + shop.id + ')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();window.selectShop(' + shop.id + ');}" id="card-' + shop.id + '" tabindex="0" role="button" aria-label="' + escHtml(shop.name) + ', rated ' + shop.rating + ' stars">' +
      '<div class="shop-card-header"><div class="shop-name">' + escHtml(shop.name) + '</div><div style="display:flex;align-items:center;gap:5px">' + (state.activeFlavorFilters.size > 0 && shop._matchPct > 0 ? '<span class="flavor-match-pct">' + shop._matchPct + '%</span>' : '') + '<div class="shop-distance">' + formatDistance(shop.distance) + '</div></div></div>' +
      '<div class="shop-meta"><div class="shop-rating"><div class="stars">' + renderStars(shop.rating) + '</div><span>' + shop.rating + '</span><span class="review-count">(' + shop.reviewCount + ')</span></div></div>' +
      (shop.address ? '<div class="shop-address">' + escHtml(shop.address) + '</div>' : '') +
      (shop.beanOrigins || shop.roastLevel ? '<div class="shop-bean-info">' + (shop.beanOrigins ? '<span class="bean-origin">&#127758; ' + escHtml(shop.beanOrigins.join(', ')) + '</span>' : '') + (shop.roastLevel ? '<span class="bean-roast">' + escHtml(shop.roastLevel) + ' roast</span>' : '') + (shop.beanType ? '<span class="bean-type">' + escHtml(shop.beanType) + '</span>' : '') + '</div>' : '') +
      '<div class="shop-flavors">' + safeTags.map(f => '<span class="shop-flavor-tag ft-' + f.tag + '">' + f.tag + '</span>').join('') + '</div>' +
      '<div class="shop-card-trust">' + sourceBadgeHtml(shop) + '<span class="ai-badge">' + flavorBadge(shop) + '</span></div></div>';
  }).join('');
}

export function shopSimilarity(a, b) {
  if (!a.flavorProfile || !b.flavorProfile) return 0;
  const allTags = new Set([...Object.keys(a.flavorProfile), ...Object.keys(b.flavorProfile)]);
  let dot = 0, magA = 0, magB = 0;
  for (const tag of allTags) {
    const va = a.flavorProfile[tag] || 0;
    const vb = b.flavorProfile[tag] || 0;
    dot += va * vb; magA += va * va; magB += vb * vb;
  }
  if (magA === 0 || magB === 0) return 0;
  return Math.round((dot / (Math.sqrt(magA) * Math.sqrt(magB))) * 100);
}

export function findSimilarShops(shop, allShops, count = 4) {
  return allShops
    .filter(s => s.id !== shop.id)
    .map(s => ({ shop: s, similarity: shopSimilarity(shop, s) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, count);
}

export function renderSimilarShops(shop) {
  const similar = findSimilarShops(shop, state.allShops);
  const section = document.getElementById('similarShopsSection');
  const container = document.getElementById('similarShops');
  if (similar.length === 0) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  container.innerHTML = similar.map(({ shop: s, similarity }) =>
    '<div class="similar-shop" onclick="window.selectShop(' + s.id + ')">' +
    '<div class="similar-shop-info"><div class="similar-shop-name">' + escHtml(s.name) + '</div>' +
    '<div class="similar-shop-meta">' + formatDistance(s.distance) + ' &middot; ' + s.flavorTags.slice(0, 3).map(f => f.tag).join(', ') + '</div></div>' +
    '<div class="similar-shop-match">' + similarity + '% match</div></div>'
  ).join('');
}

export function flavorBadge(shop) {
  const meta = shop._sourceMeta || window.BrewMapLogic.getShopSourceMeta(shop);
  if (meta.hasWebsiteFlavor) return 'Flavor profile verified from shop data';
  if (meta.hasReviewFlavor) return 'Flavor profile extracted from Yelp reviews';
  if (meta.hasYelpRating) return 'Ratings verified with Yelp';
  return 'Estimated flavor profile';
}

export function flavorProfileTitle(shop) {
  if (shop.flavorSource === 'website') return 'Flavor Profile (from website)';
  if (shop.flavorSource === 'yelp-reviews') return 'Flavor Profile (from reviews)';
  return 'Flavor Profile (estimated)';
}

export function dataSourcesHtml(shop) {
  let html = '<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text3);margin-bottom:6px">Data Sources</div>';
  if (shop.dataSource === 'yelp') html += '<div style="font-size:11px;color:var(--text2);margin-bottom:3px">&#9733; Rating: <span style="color:var(--text)">Yelp (' + shop.rating + ')</span></div>';
  else html += '<div style="font-size:11px;color:var(--text2);margin-bottom:3px">&#9733; Rating: <span style="color:var(--text3)">Estimated</span></div>';
  if (shop.flavorSource === 'website') html += '<div style="font-size:11px;color:var(--text2);margin-bottom:3px">&#127912; Flavors: <span style="color:var(--green)">Shop website</span></div>';
  else if (shop.flavorSource === 'yelp-reviews') html += '<div style="font-size:11px;color:var(--text2);margin-bottom:3px">&#127912; Flavors: <span style="color:var(--blue)">Yelp reviews</span></div>';
  else html += '<div style="font-size:11px;color:var(--text2);margin-bottom:3px">&#127912; Flavors: <span style="color:var(--text3)">AI estimate</span></div>';
  if (shop.beanOrigins) html += '<div style="font-size:11px;color:var(--text2)">&#127758; Origins: <span style="color:var(--green)">Shop website</span></div>';
  return html;
}

export function renderStars(rating) {
  let h = '';
  for (let i = 1; i <= 5; i++) h += '<span class="star ' + (i <= Math.round(rating) ? '' : 'empty') + '">&#9733;</span>';
  return h;
}

export function selectShop(id) {
  state.setSelectedShopId(id);
  const shop = state.allShops.find(s => s.id === id);
  if (!shop) return;
  const card = document.getElementById('card-' + id);
  if (card) {
    document.querySelectorAll('.shop-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  state.map.setView([shop.lat, shop.lng], Math.max(state.map.getZoom(), 15));
  if (state.markers[id]) state.markers[id].openPopup();
  document.getElementById('detailName').textContent = shop.name;
  document.getElementById('detailAddress').textContent = shop.address || 'Address not available';

  let detailExtras = '';
  if (shop.hours) detailExtras += '<div style="font-size:12px;color:var(--text2);margin-bottom:4px;">&#128336; ' + escHtml(shop.hours) + '</div>';
  if (shop.phone) detailExtras += '<div style="font-size:12px;color:var(--text2);margin-bottom:4px;">&#128222; ' + escHtml(shop.phone) + '</div>';
  const dirUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(shop.lat + ',' + shop.lng);
  detailExtras += '<div class="detail-actions">';
  detailExtras += '<a href="' + dirUrl + '" target="_blank" rel="noopener" class="detail-action-btn primary">&#128506; Directions</a>';
  if (shop.website) detailExtras += '<a href="' + escHtml(shop.website) + '" target="_blank" rel="noopener" class="detail-action-btn secondary">&#127760; Website</a>';
  detailExtras += '</div>';

  if (shop.beanOrigins || shop.roastLevel || shop.beanType) {
    detailExtras += '<div style="margin-top:8px;padding:8px 10px;background:var(--surface2);border-radius:8px;font-size:12px;">';
    detailExtras += '<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text3);margin-bottom:4px;">Bean Info</div>';
    if (shop.beanOrigins) detailExtras += '<div style="margin-bottom:3px;">&#127758; Origin: <strong style="color:var(--text);">' + escHtml(shop.beanOrigins.join(', ')) + '</strong>' + (shop.beanRegions ? ' (' + escHtml(shop.beanRegions.join(', ')) + ')' : '') + '</div>';
    if (shop.roastLevel) detailExtras += '<div style="margin-bottom:3px;">&#128293; Roast: <strong style="color:var(--text);">' + escHtml(shop.roastLevel) + '</strong></div>';
    if (shop.beanType) detailExtras += '<div style="margin-bottom:3px;">&#9749; Type: <strong style="color:var(--text);">' + escHtml(shop.beanType) + '</strong></div>';
    if (shop.processMethod) detailExtras += '<div style="margin-bottom:3px;">&#9881; Process: <strong style="color:var(--text);">' + escHtml(shop.processMethod) + '</strong></div>';
    if (shop.websiteTastingNotes) detailExtras += '<div style="margin-top:4px;font-style:italic;color:var(--text2);">"' + escHtml(shop.websiteTastingNotes) + '"</div>';
    detailExtras += '</div>';
  }
  const extrasEl = document.getElementById('detailExtras');
  if (extrasEl) { extrasEl.innerHTML = detailExtras; extrasEl.style.display = detailExtras ? 'block' : 'none'; }

  document.getElementById('detailRating').textContent = shop.rating;
  document.getElementById('detailStars').innerHTML = renderStars(shop.rating);
  document.getElementById('detailReviewCount').innerHTML = shop.dataSource === 'yelp' ? shop.reviewCount + ' reviews on <a href="' + escHtml(shop.yelpUrl || '') + '" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none;">Yelp</a>' : 'Estimated';
  document.getElementById('detailFlavors').innerHTML = window.BrewMapLogic.sanitizeFlavorTags(shop.flavorTags, window.FLAVOR_TAGS, shop.flavorProfile, 5).map(f => '<span class="shop-flavor-tag ft-' + f.tag + '">' + f.tag + ' <span class="flavor-confidence">' + f.score + '%</span></span>').join('');
  const ce = Object.entries(shop.flavorProfile).sort((a, b) => b[1] - a[1]).slice(0, 8);
  document.getElementById('flavorChart').innerHTML = ce.map(([fl, sc]) => '<div class="flavor-bar-row"><div class="flavor-bar-label">' + fl + '</div><div class="flavor-bar-track"><div class="flavor-bar-fill" style="width:' + sc + '%;background:' + (FLAVOR_BAR_COLORS[fl] || '#d4a053') + '"></div></div><div class="flavor-bar-pct">' + sc + '%</div></div>').join('');
  document.getElementById('reviewQuotes').innerHTML = shop.reviews.slice(0, 4).map(r => {
    let t = escHtml(r.text);
    if (r.flavorsFound) r.flavorsFound.forEach(f => { t = t.replace(new RegExp('\\b' + f + '\\b', 'gi'), '<span class="highlight">' + f + '</span>'); });
    const src = r.source === 'Yelp' ? (r.user ? r.user + ' on Yelp' : 'Yelp') : r.source;
    return '<div class="review-quote">"' + t + '"<div class="review-source">' + escHtml(src) + ' &middot; &#9733; ' + r.rating + '</div></div>';
  }).join('');
  document.getElementById('flavorProfileTitle').textContent = flavorProfileTitle(shop);
  document.getElementById('dataSourcesSection').innerHTML = dataSourcesHtml(shop);
  renderSimilarShops(shop);
  const panel = document.getElementById('detailPanel');
  panel.classList.add('open');
  panel.focus();
}

export function closeDetail() {
  const prevCard = state.selectedShopId ? document.getElementById('card-' + state.selectedShopId) : null;
  document.getElementById('detailPanel').classList.remove('open');
  state.setSelectedShopId(null);
  document.querySelectorAll('.shop-card').forEach(c => c.classList.remove('active'));
  if (prevCard) prevCard.focus();
}

export function updateStats() {
  document.getElementById('statShops').textContent = state.allShops.length;
  if (state.allShops.length > 0) {
    document.getElementById('statAvgRating').textContent = (state.allShops.reduce((s, shop) => s + shop.rating, 0) / state.allShops.length).toFixed(1);
    const fc = {};
    state.allShops.forEach(s => { if (s.flavorTags[0]) fc[s.flavorTags[0].tag] = (fc[s.flavorTags[0].tag] || 0) + 1; });
    const top = Object.entries(fc).sort((a, b) => b[1] - a[1])[0];
    document.getElementById('statTopFlavor').textContent = top ? top[0] : '-';
  }
}

export function ensureLoadingOverlay() {
  const overlay = document.getElementById('loadingOverlay');
  if (document.getElementById('loadingText') && document.getElementById('loadingStep') && document.getElementById('skipLocationBtn')) return overlay;
  overlay.innerHTML = '';
  const spinner = document.createElement('div'); spinner.className = 'spinner';
  const loadingText = document.createElement('div'); loadingText.className = 'loading-text'; loadingText.id = 'loadingText'; loadingText.textContent = 'Loading...';
  const loadingStep = document.createElement('div'); loadingStep.className = 'loading-step'; loadingStep.id = 'loadingStep';
  const skipButton = document.createElement('button'); skipButton.className = 'skip-location-btn'; skipButton.id = 'skipLocationBtn'; skipButton.style.display = 'none'; skipButton.textContent = 'Skip \u2014 search manually';
  skipButton.addEventListener('click', () => window.skipGeolocation && window.skipGeolocation());
  overlay.append(spinner, loadingText, loadingStep, skipButton);
  return overlay;
}

export function updateLoading(text, step) {
  ensureLoadingOverlay();
  document.getElementById('loadingText').textContent = text;
  document.getElementById('loadingStep').textContent = step;
}

export function showScanError(message) {
  const overlay = document.getElementById('loadingOverlay');
  overlay.innerHTML = '';
  const wrapper = document.createElement('div'); wrapper.style.textAlign = 'center'; wrapper.style.padding = '24px';
  const icon = document.createElement('div'); icon.style.fontSize = '40px'; icon.style.marginBottom = '12px'; icon.innerHTML = '&#9888;';
  const title = document.createElement('div'); title.style.fontSize = '16px'; title.style.fontWeight = '600'; title.style.color = 'var(--text)'; title.style.marginBottom = '8px'; title.textContent = 'Could not load coffee shops';
  const detail = document.createElement('div'); detail.style.fontSize = '13px'; detail.style.color = 'var(--text2)'; detail.style.marginBottom = '16px'; detail.textContent = message;
  const retryButton = document.createElement('button');
  retryButton.style.cssText = 'background:linear-gradient(135deg,var(--accent),#b8863a);color:#000;border:none;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;';
  retryButton.textContent = 'Retry';
  retryButton.addEventListener('click', () => { ensureLoadingOverlay(); updateLoading('Retrying...', ''); window.scanArea && window.scanArea(); });
  const dismissButton = document.createElement('button');
  dismissButton.style.cssText = 'background:var(--surface2);color:var(--text2);border:1px solid var(--border);padding:10px 24px;border-radius:8px;font-size:14px;cursor:pointer;font-family:inherit;margin-left:8px;';
  dismissButton.textContent = 'Dismiss';
  dismissButton.addEventListener('click', () => overlay.classList.add('hidden'));
  wrapper.append(icon, title, detail, retryButton, dismissButton);
  overlay.appendChild(wrapper);
  overlay.classList.remove('hidden');
}
