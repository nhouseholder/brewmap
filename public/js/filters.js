// BrewMap — Filter Logic & UI

import * as state from './state.js';
import { FLAVOR_TAGS } from './config.js';
import { renderShopList, renderMapMarkers, renderFeaturedRails, updateStats } from './render.js';

export function renderFlavorFilters() {
  const c = document.getElementById('flavorFilters'); c.innerHTML = '';
  const categories = [
    { title: 'Roast character', tags: ['dark','bold','rich','toasty','smoky'] },
    { title: 'Balanced & smooth', tags: ['medium','balanced','smooth','clean','mild'] },
    { title: 'Bright & fruity', tags: ['bright','fruity','tart','citrus','berry','floral'] },
    { title: 'Sweet & rich', tags: ['sweet','caramel','vanilla','chocolatey','nutty'] },
    { title: 'Earthy & complex', tags: ['earthy','spicy','herbal','complex','acidic'] },
  ];
  categories.forEach(cat => {
    const section = document.createElement('div');
    section.className = 'flavor-category';
    const titleEl = document.createElement('div');
    titleEl.className = 'flavor-category-title';
    titleEl.textContent = cat.title;
    section.appendChild(titleEl);
    const wrap = document.createElement('div');
    wrap.className = 'flavor-filters';
    cat.tags.forEach(tag => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'flavor-tag ' + (state.activeFlavorFilters.has(tag) ? 'active' : '');
      el.textContent = tag;
      el.setAttribute('aria-pressed', state.activeFlavorFilters.has(tag) ? 'true' : 'false');
      el.onclick = () => {
        clearActiveIntent();
        if (state.activeFlavorFilters.has(tag)) state.activeFlavorFilters.delete(tag);
        else state.activeFlavorFilters.add(tag);
        if (state.activeFlavorFilters.size > 0) document.getElementById('sortSelect').value = 'flavor';
        else if (document.getElementById('sortSelect').value === 'flavor') document.getElementById('sortSelect').value = 'distance';
        renderFlavorFilters(); renderQuickIntents(); filterShops();
      };
      wrap.appendChild(el);
    });
    section.appendChild(wrap);
    c.appendChild(section);
  });
  document.getElementById('clearFlavorsBtn').style.display = state.activeFlavorFilters.size > 0 ? 'inline' : 'none';
}

export function getSafeFlavorTags(shop, limit = 5) {
  return window.BrewMapLogic.sanitizeFlavorTags(shop.flavorTags, FLAVOR_TAGS, shop.flavorProfile, limit);
}

export function hydrateShop(shop) {
  const flavorTags = getSafeFlavorTags(shop);
  const sourceMeta = window.BrewMapLogic.getShopSourceMeta(shop);
  const roastLevel = shop.roastLevel || window.BrewMapLogic.deriveRoastLevel(shop.flavorProfile);
  return { ...shop, flavorTags, _sourceMeta: sourceMeta, roastLevel };
}

export function clearActiveIntent() {
  if (!state.activeIntentId) return;
  state.setActiveIntentId('');
}

export function updateVerifiedOnlyUI() {
  const button = document.getElementById('verifiedOnlyBtn');
  const caption = document.getElementById('verifiedOnlyCaption');
  if (!button || !caption) return;
  button.classList.toggle('active', state.verifiedOnly);
  button.setAttribute('aria-pressed', state.verifiedOnly ? 'true' : 'false');
  caption.textContent = state.verifiedOnly
    ? 'Only shops with Yelp or website evidence'
    : 'Includes estimated shops when evidence is missing';
}

export function toggleVerifiedOnly() {
  clearActiveIntent();
  state.setVerifiedOnly(!state.verifiedOnly);
  updateVerifiedOnlyUI();
  renderQuickIntents();
  filterShops();
}

export function handleManualFilterChange() {
  clearActiveIntent();
  renderQuickIntents();
  filterShops();
}

export function renderQuickIntents() {
  const container = document.getElementById('quickIntents');
  if (!container) return;
  container.innerHTML = '';
  window.BrewMapLogic.getQuickIntents().forEach(intent => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'intent-chip' + (state.activeIntentId === intent.id ? ' active' : '');
    button.textContent = intent.label;
    button.onclick = () => applyIntent(intent.id);
    container.appendChild(button);
  });
}

export function applyIntent(intentId) {
  const intent = window.BrewMapLogic.getQuickIntents().find(item => item.id === intentId);
  if (!intent) return;
  state.setActiveIntentId(intentId);
  state.setVerifiedOnly(intent.verifiedOnly);
  state.setActiveFlavorFilters(new Set(intent.flavors));
  state.setActiveRoastFilter(intent.roast);
  document.getElementById('searchInput').value = intent.search;
  document.getElementById('sortSelect').value = intent.sort;
  document.getElementById('ratingSlider').value = 0;
  document.getElementById('ratingLabel').textContent = '0';
  document.getElementById('originSelect').value = '';
  document.querySelectorAll('.roast-pill').forEach(p => p.classList.toggle('active', p.dataset.roast === intent.roast));
  updateVerifiedOnlyUI();
  renderFlavorFilters();
  renderQuickIntents();
  filterShops();
}

export function setRoastFilter(level, preserveIntent = false) {
  if (!preserveIntent) clearActiveIntent();
  state.setActiveRoastFilter(level);
  document.querySelectorAll('.roast-pill').forEach(p => p.classList.toggle('active', p.dataset.roast === level));
  renderQuickIntents();
  filterShops();
}

export function populateOriginFilter() {
  const origins = new Set();
  state.allShops.forEach(s => { if (s.beanOrigins) s.beanOrigins.forEach(o => origins.add(o)); });
  const sel = document.getElementById('originSelect');
  const current = sel.value;
  sel.innerHTML = '<option value="">All Origins (' + origins.size + ')</option>';
  [...origins].sort().forEach(o => {
    const opt = document.createElement('option');
    opt.value = o; opt.textContent = o;
    sel.appendChild(opt);
  });
  sel.value = current;
}

export function clearFlavorSelection() {
  clearActiveIntent();
  state.setActiveFlavorFilters(new Set());
  if (document.getElementById('sortSelect').value === 'flavor') document.getElementById('sortSelect').value = 'distance';
  renderFlavorFilters(); renderQuickIntents(); filterShops();
}

export function flavorMatchScore(shop) {
  if (state.activeFlavorFilters.size === 0) return 0;
  const fp = shop.flavorProfile;
  if (!fp) return 0;
  let dotProduct = 0, magA = 0, magB = 0;
  for (const tag of state.activeFlavorFilters) {
    const shopVal = fp[tag] || 0;
    dotProduct += 100 * shopVal;
    magA += 100 * 100;
  }
  for (const val of Object.values(fp)) magB += val * val;
  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);
  if (magA === 0 || magB === 0) return 0;
  return Math.round((dotProduct / (magA * magB)) * 100);
}

export function updateRatingFilter() {
  clearActiveIntent();
  const val = parseFloat(document.getElementById('ratingSlider').value);
  document.getElementById('ratingLabel').textContent = val > 0 ? val.toFixed(1) : '0';
  renderQuickIntents();
  filterShops();
}

export function filterShops() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const sort = document.getElementById('sortSelect').value;
  const minRating = parseFloat(document.getElementById('ratingSlider').value) || 0;
  const originFilter = document.getElementById('originSelect').value;

  let result = state.allShops.filter(shop => {
    if (search && !shop.name.toLowerCase().includes(search) && !(shop.address || '').toLowerCase().includes(search)) return false;
    if (state.activeFlavorFilters.size > 0) {
      const sf = new Set(shop.flavorTags.map(f => f.tag));
      for (const fl of state.activeFlavorFilters) { if (!sf.has(fl)) return false; }
    }
    if (shop.distance > state.radiusMiles) return false;
    if (minRating > 0 && shop.rating < minRating) return false;
    if (state.verifiedOnly && !window.BrewMapLogic.isVerifiedShop(shop)) return false;
    if (!window.BrewMapLogic.matchesRoastFilter(shop.roastLevel, state.activeRoastFilter, shop.flavorProfile)) return false;
    if (originFilter && (!shop.beanOrigins || !shop.beanOrigins.includes(originFilter))) return false;
    return true;
  });

  result.forEach(s => { s._matchPct = flavorMatchScore(s); });

  switch (sort) {
    case 'verified': result.sort((a, b) => window.BrewMapLogic.compareByTrust(a, b)); break;
    case 'distance': result.sort((a, b) => a.distance - b.distance || window.BrewMapLogic.compareByTrust(a, b)); break;
    case 'rating': result.sort((a, b) => b.rating - a.rating || window.BrewMapLogic.compareByTrust(a, b)); break;
    case 'reviews': result.sort((a, b) => b.reviewCount - a.reviewCount || window.BrewMapLogic.compareByTrust(a, b)); break;
    case 'flavor': result.sort((a, b) => b._matchPct - a._matchPct || window.BrewMapLogic.compareByTrust(a, b)); break;
    case 'name': result.sort((a, b) => a.name.localeCompare(b.name) || window.BrewMapLogic.compareByTrust(a, b)); break;
  }

  state.setFilteredShops(result);

  const verifiedCount = result.filter(shop => window.BrewMapLogic.isVerifiedShop(shop)).length;
  const countText = result.length + ' of ' + state.allShops.length + ' shops' + (verifiedCount ? ' &middot; ' + verifiedCount + ' verified' : '');
  document.getElementById('resultsCount').textContent = countText;
  const a11y = document.getElementById('a11yStatus');
  if (a11y) a11y.textContent = countText + (state.verifiedOnly ? ', verified only' : '') + (state.activeFlavorFilters.size ? ', filtered by ' + Array.from(state.activeFlavorFilters).join(', ') : '');

  renderFeaturedRails();
  renderShopList();
  renderMapMarkers();
  updateStats();
}
