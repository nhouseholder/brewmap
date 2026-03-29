// BrewMap — Deterministic flavor profile generation
// Extracted from index.html to share between frontend and harvester
// IMPORTANT: These must stay in sync with index.html — same hash, same RNG, same profiles

export const FLAVOR_TAGS = [
  'dark','bold','rich','toasty','nutty','chocolatey','smoky','medium','balanced','smooth',
  'clean','mild','fruity','bright','tart','citrus','berry','floral','sweet','caramel',
  'vanilla','earthy','spicy','herbal','complex','acidic'
];

export const FLAVOR_BAR_COLORS = {
  dark:'#8B5A2B',bold:'#B4503C',rich:'#A05050',toasty:'#C88C3C',nutty:'#B48C50',
  chocolatey:'#785032',smoky:'#64646E',medium:'#64A064',balanced:'#5D9DE8',smooth:'#64B4A0',
  clean:'#8CC8DC',mild:'#B4B4B4',fruity:'#E85DA8',bright:'#E8B45D',tart:'#E85D5D',
  citrus:'#E8C85D',berry:'#A85DE8',floral:'#C882DC',sweet:'#E8935D',caramel:'#D2A050',
  vanilla:'#E6DCB4',earthy:'#788250',spicy:'#C8503C',herbal:'#50A050',complex:'#A87DE8',
  acidic:'#C8DC3C'
};

const PROFILES = {
  dark:     { dark:85, bold:70, rich:65, toasty:55, smoky:40, chocolatey:35, nutty:30, earthy:25 },
  bold:     { bold:80, dark:55, rich:60, toasty:45, nutty:35, chocolatey:40, spicy:20 },
  balanced: { balanced:80, medium:65, smooth:55, clean:40, nutty:30, caramel:25, sweet:20 },
  bright:   { bright:80, fruity:55, tart:45, citrus:40, floral:30, clean:35, acidic:25 },
  fruity:   { fruity:85, bright:60, berry:50, tart:45, citrus:35, floral:40, sweet:30 },
  smooth:   { smooth:80, balanced:60, medium:50, caramel:45, sweet:35, vanilla:30, clean:25 },
};

export function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function weightedFlavors(rng, primary) {
  const base = PROFILES[primary] || PROFILES.balanced;
  const result = {};
  for (const [tag, score] of Object.entries(base)) {
    result[tag] = Math.min(100, Math.max(5, score + Math.floor((rng() - 0.5) * 20)));
  }
  const extras = FLAVOR_TAGS.filter(t => !result[t]);
  for (let i = 0; i < 3; i++) {
    const t = extras[Math.floor(rng() * extras.length)];
    if (t) result[t] = Math.floor(5 + rng() * 20);
  }
  return result;
}

/**
 * Generate deterministic flavor data for a shop name.
 * Returns: { rating, reviewCount, flavorProfile, flavorTags }
 */
export function generateFlavorData(name) {
  const seed = hashCode(name);
  const rng = mulberry32(seed);
  const rating = Math.round((3.5 + rng() * 1.5) * 10) / 10;
  const reviewCount = Math.floor(20 + rng() * 480);
  const nameLower = name.toLowerCase();

  let fp;
  if (nameLower.includes('roast') || nameLower.includes('dark') || nameLower.includes('black')) {
    fp = weightedFlavors(rng, 'dark');
  } else if (nameLower.includes('bright') || nameLower.includes('light') || nameLower.includes('sun') || nameLower.includes('morning')) {
    fp = weightedFlavors(rng, 'bright');
  } else if (nameLower.includes('bean') || nameLower.includes('brew') || nameLower.includes('grind')) {
    fp = weightedFlavors(rng, 'balanced');
  } else if (nameLower.includes('espresso') || nameLower.includes('italian') || nameLower.includes('cafe')) {
    fp = weightedFlavors(rng, 'bold');
  } else {
    const p = ['dark', 'bold', 'balanced', 'bright', 'fruity', 'smooth'];
    fp = weightedFlavors(rng, p[Math.floor(rng() * p.length)]);
  }

  const flavorTags = Object.entries(fp)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag, score]) => ({ tag, score }));

  return { rating, reviewCount, flavorProfile: fp, flavorTags };
}
