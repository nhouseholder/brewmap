// BrewMap — Overpass API query logic (Worker-compatible)
// Mirror of scripts/lib/overpass.mjs — uses fetch() (native in Workers)

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

const CHAINS = [
  'starbucks','dunkin','peet','mcdonald','tim horton','panera','caribou',
  'subway','burger','wendy','taco','pizza','popeye','chick-fil','jack in',
  'sonic','whataburger','ihop','denny','krispy','dairy queen'
];

const COFFEE_KEYWORDS = [
  'coffee','espresso','roast','brew','bean','latte','cappuccino','mocha',
  'drip','pourover','pour over','cold brew','coffeehouse','coffee house',
  'café','roaster','roastery','caffeinated'
];

const NOT_COFFEE_PRIMARY = [
  'tea house','tea room','boba','bubble tea','bakery','baking','bagel',
  'donut','doughnut','pizza','burger','taco','burrito','sushi','ramen',
  'noodle','pho','thai','chinese','indian','mexican','italian','greek',
  'bbq','barbecue','bar & grill','bar and grill','pub','tavern','brewery',
  'winery','smoothie','juice bar','ice cream','gelato','frozen yogurt',
  'catering','deli','sandwich','sub shop','wings'
];

function isCoffeeForward(el) {
  const tags = el.tags || {};
  const name = (tags.name || '').toLowerCase();
  const cuisine = (tags.cuisine || '').toLowerCase();
  if (tags.shop === 'coffee') return true;
  if (cuisine.includes('coffee')) return true;
  const hasCoffeeKeyword = COFFEE_KEYWORDS.some(k => name.includes(k));
  const hasNonCoffee = NOT_COFFEE_PRIMARY.some(k => name.includes(k));
  if (hasCoffeeKeyword) return true;
  if (tags.amenity === 'cafe') {
    const nonCoffeeCuisine = ['tea','bubble_tea','bakery','sandwich','pizza','ice_cream','juice'];
    if (nonCoffeeCuisine.some(c => cuisine.includes(c)) && !cuisine.includes('coffee')) return false;
    if (!hasNonCoffee) return true;
  }
  return false;
}

async function fetchOverpass(query, timeout) {
  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.elements) return data;
    } catch (e) {
      // Try next endpoint
    }
  }
  return null;
}

function parseShopFromElement(el) {
  const lat = el.lat || el.center?.lat;
  const lng = el.lon || el.center?.lon;
  if (!lat || !lng) return null;
  const tags = el.tags;
  const parts = [];
  if (tags['addr:housenumber'] && tags['addr:street']) parts.push(tags['addr:housenumber'] + ' ' + tags['addr:street']);
  else if (tags['addr:street']) parts.push(tags['addr:street']);
  if (tags['addr:city']) parts.push(tags['addr:city']);
  if (tags['addr:state']) parts.push(tags['addr:state']);
  return {
    id: el.id,
    name: tags.name,
    lat, lng,
    address: parts.join(', '),
    hours: tags.opening_hours || null,
    website: tags.website || tags['contact:website'] || null,
    phone: tags.phone || tags['contact:phone'] || null,
  };
}

export async function queryOverpass(lat, lng, radiusMeters) {
  const q1 = `[out:json][timeout:25];(` +
    `node["amenity"="cafe"](around:${radiusMeters},${lat},${lng});` +
    `way["amenity"="cafe"](around:${radiusMeters},${lat},${lng});` +
    `node["cuisine"~"coffee"](around:${radiusMeters},${lat},${lng});` +
    `node["shop"="coffee"](around:${radiusMeters},${lat},${lng});` +
    `);out center tags;`;

  let allElements = [];
  const d1 = await fetchOverpass(q1, 25000);
  if (!d1) throw new Error('All Overpass endpoints failed');
  if (d1.elements) allElements = [...d1.elements];

  const namedCount = allElements.filter(e => e.tags?.name).length;
  if (namedCount < 20) {
    const q2 = `[out:json][timeout:25];(` +
      `node["name"~"Coffee|coffee|Cafe|cafe|Espresso|espresso|Roast|roast|Bean|bean|Brew|brew|Latte|latte"](around:${radiusMeters},${lat},${lng});` +
      `way["name"~"Coffee|coffee|Cafe|cafe|Espresso|espresso|Roast|roast"](around:${radiusMeters},${lat},${lng});` +
      `);out center tags;`;
    try {
      const d2 = await fetchOverpass(q2, 15000);
      if (d2?.elements) allElements = allElements.concat(d2.elements);
    } catch (e) { /* Phase 2 is optional */ }
  }

  const seen = new Set();
  return allElements
    .filter(el => { if (!el.tags?.name || seen.has(el.id)) return false; seen.add(el.id); return true; })
    .filter(el => !CHAINS.some(c => el.tags.name.toLowerCase().includes(c)))
    .filter(el => isCoffeeForward(el))
    .map(el => parseShopFromElement(el))
    .filter(Boolean);
}
