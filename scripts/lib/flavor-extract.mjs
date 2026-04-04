// BrewMap — Extract real flavor profiles from review text
// Scans Yelp reviews for flavor keywords and builds weighted profiles
// from what actual customers say, replacing the deterministic PRNG approach.

// The canonical 26 flavor tags + expanded synonyms that map to each tag.
// When a review mentions "chocolate" or "cocoa", it maps to the "chocolatey" tag.
const FLAVOR_SYNONYMS = {
  dark:       ['dark', 'dark roast', 'deep', 'intense', 'strong roast'],
  bold:       ['bold', 'robust', 'powerful', 'full-bodied', 'full bodied', 'strong', 'heavy'],
  rich:       ['rich', 'luxurious', 'decadent', 'indulgent', 'velvety'],
  toasty:     ['toasty', 'toasted', 'roasted', 'warm', 'baked'],
  nutty:      ['nutty', 'nut', 'nuts', 'almond', 'hazelnut', 'walnut', 'pecan', 'peanut'],
  chocolatey: ['chocolatey', 'chocolate', 'chocolaty', 'cocoa', 'cacao', 'mocha'],
  smoky:      ['smoky', 'smokey', 'smoke', 'charred', 'ashy', 'campfire'],
  medium:     ['medium', 'medium roast', 'moderate', 'middle'],
  balanced:   ['balanced', 'well-balanced', 'well balanced', 'round', 'rounded', 'even'],
  smooth:     ['smooth', 'silky', 'creamy', 'mellow', 'soft', 'gentle', 'easy drinking'],
  clean:      ['clean', 'crisp', 'clear', 'pure', 'refreshing'],
  mild:       ['mild', 'light', 'delicate', 'subtle', 'understated'],
  fruity:     ['fruity', 'fruit', 'stone fruit', 'tropical'],
  bright:     ['bright', 'lively', 'vibrant', 'zesty', 'zingy', 'sparkling'],
  tart:       ['tart', 'tangy', 'sour', 'sharp'],
  citrus:     ['citrus', 'citrusy', 'lemon', 'lime', 'orange', 'grapefruit', 'bergamot'],
  berry:      ['berry', 'berries', 'blueberry', 'raspberry', 'strawberry', 'blackberry', 'cranberry'],
  floral:     ['floral', 'flower', 'flowery', 'jasmine', 'rose', 'lavender', 'hibiscus'],
  sweet:      ['sweet', 'sugary', 'honey', 'syrupy', 'maple', 'brown sugar', 'molasses'],
  caramel:    ['caramel', 'caramelly', 'butterscotch', 'toffee', 'dulce'],
  vanilla:    ['vanilla', 'vanillin'],
  earthy:     ['earthy', 'earth', 'soil', 'mushroom', 'mossy', 'woody', 'cedar', 'tobacco'],
  spicy:      ['spicy', 'spice', 'cinnamon', 'clove', 'pepper', 'ginger', 'cardamom', 'nutmeg'],
  herbal:     ['herbal', 'herb', 'herbs', 'tea-like', 'grassy', 'mint', 'sage', 'thyme'],
  complex:    ['complex', 'complexity', 'layered', 'nuanced', 'multidimensional', 'interesting'],
  acidic:     ['acidic', 'acid', 'acidity', 'wine-like', 'winey'],
};

// Build a flat lookup: word/phrase → tag
const PHRASE_TO_TAG = new Map();
for (const [tag, synonyms] of Object.entries(FLAVOR_SYNONYMS)) {
  for (const syn of synonyms) {
    PHRASE_TO_TAG.set(syn, tag);
  }
}

// Sort phrases by length descending so longer phrases match first
// ("dark roast" before "dark", "full-bodied" before "full")
const SORTED_PHRASES = [...PHRASE_TO_TAG.keys()].sort((a, b) => b.length - a.length);

/**
 * Extract a flavor profile from an array of review texts.
 * Returns { flavorProfile, flavorTags, dataSource } ready to merge into a shop.
 *
 * @param {string[]} reviewTexts - Array of review text strings
 * @param {object} fallbackProfile - Existing AI-estimated profile to fall back on
 * @returns {object} { flavorProfile, flavorTags, dataSource }
 */
export function extractFlavorProfile(reviewTexts, fallbackProfile = null) {
  if (!reviewTexts || reviewTexts.length === 0) {
    return fallbackProfile ? { flavorProfile: fallbackProfile, dataSource: 'ai-estimate' } : null;
  }

  const tagCounts = {};
  const combined = reviewTexts.join(' ').toLowerCase();

  // Count flavor mentions across all reviews
  for (const phrase of SORTED_PHRASES) {
    const tag = PHRASE_TO_TAG.get(phrase);
    // Word boundary matching — avoid matching "bold" inside "Kobolds"
    const regex = new RegExp('\\b' + escapeRegex(phrase) + '\\b', 'gi');
    const matches = combined.match(regex);
    if (matches) {
      tagCounts[tag] = (tagCounts[tag] || 0) + matches.length;
    }
  }

  const mentionedTags = Object.keys(tagCounts);

  // Not enough signal — need at least 2 distinct flavor mentions
  if (mentionedTags.length < 2) {
    if (fallbackProfile) {
      return { flavorProfile: fallbackProfile, flavorTags: profileToTags(fallbackProfile), dataSource: 'ai-estimate' };
    }
    return null;
  }

  // Normalize counts to 0-100 scores
  const maxCount = Math.max(...Object.values(tagCounts));
  const flavorProfile = {};
  for (const [tag, count] of Object.entries(tagCounts)) {
    // Scale: most-mentioned = 90, others proportional, minimum 15
    flavorProfile[tag] = Math.max(15, Math.round((count / maxCount) * 90));
  }

  const flavorTags = profileToTags(flavorProfile);

  return {
    flavorProfile,
    flavorTags,
    dataSource: 'yelp-reviews',
  };
}

/**
 * Combine flavor profiles from multiple sources with weighted confidence.
 * Website tasting notes (2x) > Yelp reviews (1x) > AI estimate (0.3x)
 *
 * @param {object|null} websiteProfile - From website scraping
 * @param {object|null} reviewProfile - From Yelp review extraction
 * @param {object|null} aiProfile - Deterministic AI estimate
 * @returns {{ flavorProfile, flavorTags }}
 */
export function combineFlavorSources(websiteProfile, reviewProfile, aiProfile) {
  const combined = {};
  const weights = { website: 2.0, review: 1.0, ai: 0.3 };

  function addProfile(profile, weight) {
    if (!profile) return;
    for (const [tag, score] of Object.entries(profile)) {
      combined[tag] = (combined[tag] || 0) + score * weight;
    }
  }

  addProfile(websiteProfile, weights.website);
  addProfile(reviewProfile, weights.review);
  addProfile(aiProfile, weights.ai);

  // Normalize to 0-100
  const maxScore = Math.max(...Object.values(combined), 1);
  const flavorProfile = {};
  for (const [tag, score] of Object.entries(combined)) {
    flavorProfile[tag] = Math.max(5, Math.round((score / maxScore) * 95));
  }

  return { flavorProfile, flavorTags: profileToTags(flavorProfile) };
}

function profileToTags(profile) {
  return Object.entries(profile)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag, score]) => ({ tag, score }));
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
