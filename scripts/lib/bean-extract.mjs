// BrewMap — Extract bean origin, roast level, and tasting notes from website text
// Parses scraped coffee shop website content for structured coffee data.

// Major coffee-producing countries
const ORIGIN_COUNTRIES = [
  'Ethiopia', 'Colombia', 'Brazil', 'Guatemala', 'Kenya', 'Costa Rica',
  'Honduras', 'Peru', 'Indonesia', 'Rwanda', 'Tanzania', 'Mexico',
  'Nicaragua', 'El Salvador', 'Panama', 'Uganda', 'Burundi', 'Congo',
  'Papua New Guinea', 'Jamaica', 'Hawaii', 'Sumatra', 'Java', 'India',
  'Vietnam', 'Yemen', 'Myanmar', 'Bolivia', 'Ecuador', 'Dominican Republic',
];

// Notable coffee regions (mapped to their country)
const ORIGIN_REGIONS = {
  'yirgacheffe': 'Ethiopia', 'sidamo': 'Ethiopia', 'guji': 'Ethiopia',
  'harrar': 'Ethiopia', 'limu': 'Ethiopia', 'jimma': 'Ethiopia',
  'huila': 'Colombia', 'nariño': 'Colombia', 'narino': 'Colombia',
  'cauca': 'Colombia', 'tolima': 'Colombia', 'antioquia': 'Colombia',
  'minas gerais': 'Brazil', 'cerrado': 'Brazil', 'mogiana': 'Brazil',
  'santos': 'Brazil', 'sul de minas': 'Brazil',
  'antigua': 'Guatemala', 'huehuetenango': 'Guatemala', 'atitlan': 'Guatemala',
  'nyeri': 'Kenya', 'kirinyaga': 'Kenya', 'kiambu': 'Kenya', 'muranga': 'Kenya',
  'tarrazú': 'Costa Rica', 'tarrazu': 'Costa Rica', 'central valley': 'Costa Rica',
  'west valley': 'Costa Rica',
  'copán': 'Honduras', 'copan': 'Honduras', 'lempira': 'Honduras',
  'cajamarca': 'Peru', 'cusco': 'Peru', 'san martín': 'Peru',
  'mandheling': 'Indonesia', 'lintong': 'Indonesia', 'gayo': 'Indonesia',
  'toraja': 'Indonesia', 'flores': 'Indonesia',
  'kona': 'Hawaii', 'ka\'u': 'Hawaii', 'maui': 'Hawaii',
  'blue mountain': 'Jamaica',
  'boquete': 'Panama', 'geisha': 'Panama',
  'jinotega': 'Nicaragua', 'matagalpa': 'Nicaragua',
  'apaneca': 'El Salvador', 'santa ana': 'El Salvador',
  'mt meru': 'Tanzania', 'kilimanjaro': 'Tanzania',
  'kayanza': 'Burundi', 'ngozi': 'Burundi',
  'kivu': 'Congo',
};

// Roast level patterns (ordered by specificity)
const ROAST_PATTERNS = [
  { pattern: /\b(extra[\s-]?light|blonde|cinnamon)\s*roast/i, level: 'light' },
  { pattern: /\blight[\s-]?(medium|roast)/i, level: 'light' },
  { pattern: /\blight\s+roast/i, level: 'light' },
  { pattern: /\bmedium[\s-]?dark/i, level: 'medium-dark' },
  { pattern: /\bmedium[\s-]?light/i, level: 'medium-light' },
  { pattern: /\bmedium\s+roast/i, level: 'medium' },
  { pattern: /\b(full[\s-]?city|vienna)\s*roast/i, level: 'medium-dark' },
  { pattern: /\b(french|italian|espresso)\s*roast/i, level: 'dark' },
  { pattern: /\bdark\s*roast/i, level: 'dark' },
  { pattern: /\b(city|american)\s*roast/i, level: 'medium' },
  // Standalone mentions (lower confidence)
  { pattern: /\blight[\s-]?roasted\b/i, level: 'light' },
  { pattern: /\bdark[\s-]?roasted\b/i, level: 'dark' },
];

// Tasting note extraction patterns
const NOTE_PATTERNS = [
  /tasting\s*notes?\s*[:–—-]\s*([^.;\n]{5,120})/i,
  /notes?\s+of\s+([^.;\n]{5,80})/i,
  /flavou?rs?\s+of\s+([^.;\n]{5,80})/i,
  /you'?ll\s+taste\s+([^.;\n]{5,80})/i,
  /flavor\s*(?:profile|notes?)\s*[:–—-]\s*([^.;\n]{5,120})/i,
  /cupping\s*notes?\s*[:–—-]\s*([^.;\n]{5,120})/i,
  /we\s+taste\s+([^.;\n]{5,80})/i,
  /characterized\s+by\s+([^.;\n]{5,80})/i,
  /(?:hints?|notes?|undertones?)\s+of\s+([^.;\n]{5,80})/i,
];

// Bean type patterns
const BEAN_PATTERNS = {
  'single-origin': /\bsingle[\s-]?origin\b/i,
  'blend': /\b(?:house\s+)?blend\b/i,
  'arabica': /\barabica\b/i,
  'robusta': /\brobusta\b/i,
  'specialty': /\bspecialty[\s-]?(?:grade|coffee)\b/i,
  'micro-lot': /\bmicro[\s-]?lot\b/i,
  'direct-trade': /\bdirect[\s-]?trade\b/i,
  'fair-trade': /\bfair[\s-]?trade\b/i,
  'organic': /\borganic\b/i,
};

// Processing method patterns
const PROCESS_PATTERNS = {
  'washed': /\b(?:fully\s+)?washed\b/i,
  'natural': /\bnatural[\s-]?(?:process|dried)?\b/i,
  'honey': /\bhoney[\s-]?process(?:ed)?\b/i,
  'wet-hulled': /\bwet[\s-]?hull(?:ed)?\b/i,
  'anaerobic': /\banaerobic\b/i,
  'fermented': /\bfermented\b/i,
};

/**
 * Extract structured coffee data from website text.
 * @param {string} text - Scraped and stripped website text
 * @returns {object} Structured bean/origin/roast data
 */
export function extractBeanData(text) {
  if (!text || text.length < 50) return null;

  const lower = text.toLowerCase();
  const result = {
    origins: [],
    regions: [],
    roastLevel: null,
    beanType: null,
    beanTraits: [],
    processMethod: null,
    tastingNotes: null,
    confidence: 0, // 0-100 — how much coffee-specific info we found
  };

  // Extract origins (countries)
  for (const country of ORIGIN_COUNTRIES) {
    if (new RegExp('\\b' + escapeRegex(country) + '\\b', 'i').test(text)) {
      if (!result.origins.includes(country)) result.origins.push(country);
    }
  }

  // Extract regions
  for (const [region, country] of Object.entries(ORIGIN_REGIONS)) {
    if (new RegExp('\\b' + escapeRegex(region) + '\\b', 'i').test(text)) {
      if (!result.regions.includes(region)) result.regions.push(region);
      if (!result.origins.includes(country)) result.origins.push(country);
    }
  }

  // Extract roast level
  for (const { pattern, level } of ROAST_PATTERNS) {
    if (pattern.test(text)) {
      result.roastLevel = level;
      break; // Take first (most specific) match
    }
  }

  // Extract tasting notes
  for (const pattern of NOTE_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1]) {
      result.tastingNotes = match[1].trim()
        .replace(/\s+/g, ' ')
        .replace(/,\s*$/, ''); // Remove trailing comma
      break;
    }
  }

  // Extract bean type
  for (const [type, pattern] of Object.entries(BEAN_PATTERNS)) {
    if (pattern.test(text)) {
      if (type === 'single-origin' || type === 'blend') {
        result.beanType = type;
      } else {
        result.beanTraits.push(type);
      }
    }
  }

  // Extract process method
  for (const [method, pattern] of Object.entries(PROCESS_PATTERNS)) {
    if (pattern.test(text)) {
      result.processMethod = method;
      break;
    }
  }

  // Calculate confidence score
  let conf = 0;
  if (result.origins.length > 0) conf += 25;
  if (result.regions.length > 0) conf += 15;
  if (result.roastLevel) conf += 20;
  if (result.tastingNotes) conf += 25;
  if (result.beanType) conf += 10;
  if (result.processMethod) conf += 5;
  result.confidence = Math.min(100, conf);

  // If we found nothing coffee-related, return null
  if (result.confidence === 0) return null;

  // Clean up empty arrays
  if (result.origins.length === 0) delete result.origins;
  if (result.regions.length === 0) delete result.regions;
  if (result.beanTraits.length === 0) delete result.beanTraits;

  return result;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
