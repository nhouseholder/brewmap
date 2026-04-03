// BrewMap — Yelp Fusion API client
// Searches for coffee shops per city and matches them to Overpass data.
// Docs: https://docs.developer.yelp.com/reference/v3_business_search

const YELP_BASE = 'https://api.yelp.com/v3';
const RESULTS_PER_PAGE = 50; // Yelp max
const MAX_RESULTS = 1000; // Yelp hard limit
const REQUEST_DELAY_MS = 200; // Polite rate limiting

/**
 * Search Yelp for coffee shops near a city center.
 * Paginates automatically. Returns all Yelp businesses found.
 */
export async function searchCityYelp(apiKey, lat, lng, radiusMeters) {
  const radiusClamped = Math.min(Math.round(radiusMeters), 40000); // Yelp max 40km
  const allBusinesses = [];
  let offset = 0;
  let total = Infinity;

  while (offset < total && offset < MAX_RESULTS) {
    const params = new URLSearchParams({
      term: 'coffee',
      latitude: lat.toString(),
      longitude: lng.toString(),
      radius: radiusClamped.toString(),
      categories: 'coffee,coffeeroasteries,coffeeshops',
      sort_by: 'distance',
      limit: RESULTS_PER_PAGE.toString(),
      offset: offset.toString(),
    });

    const res = await fetch(`${YELP_BASE}/businesses/search?${params}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (res.status === 429) {
      console.warn('  ⚠️  Yelp rate limit hit — stopping pagination');
      break;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Yelp search failed: ${res.status} — ${text}`);
    }

    const data = await res.json();
    total = data.total;
    allBusinesses.push(...(data.businesses || []));
    offset += RESULTS_PER_PAGE;

    if ((data.businesses || []).length < RESULTS_PER_PAGE) break;
    await sleep(REQUEST_DELAY_MS);
  }

  return allBusinesses;
}

/**
 * Fetch up to 3 review excerpts for a Yelp business.
 */
export async function fetchYelpReviews(apiKey, yelpBusinessId) {
  const res = await fetch(`${YELP_BASE}/businesses/${encodeURIComponent(yelpBusinessId)}/reviews?limit=3&sort_by=yelp_sort`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });

  if (res.status === 429) {
    console.warn(`  ⚠️  Yelp rate limit on reviews for ${yelpBusinessId}`);
    return [];
  }

  if (!res.ok) return [];

  const data = await res.json();
  return (data.reviews || []).map(r => ({
    text: r.text,
    rating: r.rating,
    user: r.user?.name || 'Anonymous',
    time: r.time_created,
  }));
}

/**
 * Match Yelp businesses to Overpass shops by name + proximity.
 * Returns array of { shop, yelpBiz } pairs.
 */
export function matchShops(yelpBusinesses, overpassShops) {
  const matched = [];
  const unmatched = [];
  const yelpUsed = new Set();

  for (const shop of overpassShops) {
    let bestMatch = null;
    let bestScore = 0;

    for (let i = 0; i < yelpBusinesses.length; i++) {
      if (yelpUsed.has(i)) continue;
      const biz = yelpBusinesses[i];

      const dist = haversine(shop.lat, shop.lng, biz.coordinates.latitude, biz.coordinates.longitude);
      if (dist > 150) continue; // >150m = too far

      const nameSim = nameSimilarity(shop.name, biz.name);

      // Scoring: distance weight + name weight
      let score = 0;
      if (dist < 50 && nameSim > 0.5) score = nameSim + (1 - dist / 50) * 0.3;
      else if (dist < 100 && nameSim > 0.6) score = nameSim + (1 - dist / 100) * 0.2;
      else if (dist < 150 && nameSim > 0.8) score = nameSim;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = { index: i, biz };
      }
    }

    if (bestMatch && bestScore > 0.5) {
      yelpUsed.add(bestMatch.index);
      matched.push({ shop, yelpBiz: bestMatch.biz, score: bestScore });
    } else {
      unmatched.push(shop);
    }
  }

  return { matched, unmatched };
}

/**
 * Merge Yelp data into an existing shop object.
 */
export function mergeYelpData(shop, yelpBiz, yelpReviews = []) {
  return {
    ...shop,
    rating: yelpBiz.rating,
    reviewCount: yelpBiz.review_count,
    dataSource: 'yelp',
    yelpId: yelpBiz.id,
    yelpUrl: yelpBiz.url,
    yelpRating: yelpBiz.rating,
    yelpReviewCount: yelpBiz.review_count,
    yelpReviews: yelpReviews.length > 0 ? yelpReviews : undefined,
    yelpEnrichedAt: new Date().toISOString(),
    // Keep existing flavor data (AI-estimated) — Yelp doesn't provide flavor profiles
  };
}

// =========== UTILITIES ===========

/**
 * Haversine distance in meters between two lat/lng pairs.
 */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Normalize a shop name for comparison.
 * Strips common words, punctuation, possessives, case.
 */
function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/['']s\b/g, '') // possessives
    .replace(/\b(the|coffee|cafe|café|shop|roasters|roasting|company|co|llc|inc)\b/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Simple name similarity: Jaccard on word tokens + longest common substring bonus.
 */
export function nameSimilarity(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);

  // Exact match after normalization
  if (na === nb) return 1.0;

  // Jaccard on words
  const wa = new Set(na.split(' ').filter(Boolean));
  const wb = new Set(nb.split(' ').filter(Boolean));
  const intersection = [...wa].filter(w => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size;
  const jaccard = union > 0 ? intersection / union : 0;

  // Longest common substring bonus (normalized by shorter string length)
  const lcs = longestCommonSubstring(na, nb);
  const shorter = Math.min(na.length, nb.length);
  const lcsBonus = shorter > 0 ? (lcs / shorter) * 0.3 : 0;

  return Math.min(1.0, jaccard + lcsBonus);
}

function longestCommonSubstring(a, b) {
  let max = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      let k = 0;
      while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k++;
      if (k > max) max = k;
    }
  }
  return max;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
