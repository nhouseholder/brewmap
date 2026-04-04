// BrewMap — Shared coffee-forward filter + chain detection
// Single source of truth — imported by both scripts/lib/ (Node.js) and functions/lib/ (Workers)
// IMPORTANT: Must remain pure JS — no Node.js or Workers-specific APIs

export const CHAINS = [
  // National chains
  'starbucks','dunkin','peet','mcdonald','tim horton','panera','caribou',
  'subway','burger','wendy','taco','pizza','popeye','chick-fil','jack in',
  'sonic','whataburger','ihop','denny','krispy','dairy queen',
  // Regional coffee/drive-thru chains
  'dutch bros','black rock coffee','human bean','scooter\'s coffee',
  'biggby','seven brew','ziggi\'s','coffee bean & tea leaf',
  'it\'s a grind','gloria jean','coffee beanery',
];

// Coffee-forward keywords (in name) — indicates primary coffee identity
export const COFFEE_KEYWORDS = [
  'coffee','espresso','roast','brew','bean','latte','cappuccino','mocha',
  'drip','pourover','pour over','cold brew','coffeehouse','coffee house',
  'café','roaster','roastery','caffeinated'
];

// Non-coffee-primary indicators (in name) — reject unless also has coffee keyword
export const NOT_COFFEE_PRIMARY = [
  'tea house','tea room','boba','bubble tea','bakery','baking','bagel',
  'donut','doughnut','pizza','burger','taco','burrito','sushi','ramen',
  'noodle','pho','thai','chinese','indian','mexican','italian','greek',
  'bbq','barbecue','bar & grill','bar and grill','pub','tavern','brewery',
  'winery','smoothie','juice bar','ice cream','gelato','frozen yogurt',
  'catering','deli','sandwich','sub shop','wings'
];

/**
 * Determine if an OSM element represents a coffee-forward shop.
 * @param {object} el - OSM element with .tags
 * @returns {boolean}
 */
export function isCoffeeForward(el) {
  const tags = el.tags || {};
  const name = (tags.name || '').toLowerCase();
  const cuisine = (tags.cuisine || '').toLowerCase();

  // Definite yes: tagged as coffee shop or coffee cuisine
  if (tags.shop === 'coffee') return true;
  if (cuisine.includes('coffee')) return true;

  // Check name for coffee keywords
  const hasCoffeeKeyword = COFFEE_KEYWORDS.some(k => name.includes(k));

  // If name has a coffee keyword, it's coffee-forward (regardless of other words)
  if (hasCoffeeKeyword) return true;

  // Check name for non-coffee-primary indicators
  const hasNonCoffee = NOT_COFFEE_PRIMARY.some(k => name.includes(k));

  // amenity=cafe with no disqualifying signals — benefit of the doubt
  if (tags.amenity === 'cafe') {
    const nonCoffeeCuisine = ['tea','bubble_tea','bakery','sandwich','pizza','ice_cream','juice'];
    if (nonCoffeeCuisine.some(c => cuisine.includes(c)) && !cuisine.includes('coffee')) return false;
    if (!hasNonCoffee) return true;
  }

  return false;
}

/**
 * Check if a shop name matches a known chain.
 * @param {string} name - Shop name
 * @returns {boolean}
 */
export function isChain(name) {
  const lower = name.toLowerCase();
  return CHAINS.some(c => lower.includes(c));
}
