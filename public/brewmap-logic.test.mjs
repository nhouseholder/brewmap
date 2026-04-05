import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadLogic() {
  const code = fs.readFileSync(new URL('./brewmap-logic.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.window.BrewMapLogic;
}

function normalize(value) {
  return JSON.parse(JSON.stringify(value));
}

test('sanitizeFlavorTags removes invalid entries and falls back to profile tags', () => {
  const logic = loadLogic();
  const tags = logic.sanitizeFlavorTags(
    [
      { tag: 'smooth', score: 78 },
      { tag: 'not-real', score: 92 },
      { tag: 'smooth', score: 60 },
    ],
    ['smooth', 'dark', 'bright'],
    { dark: 81, bright: 55 },
  );

  assert.deepEqual(normalize(tags), [{ tag: 'smooth', score: 78 }]);

  const fallback = logic.sanitizeFlavorTags([], ['smooth', 'dark', 'bright'], { dark: 81, bright: 55 });
  assert.deepEqual(normalize(fallback), [
    { tag: 'dark', score: 81 },
    { tag: 'bright', score: 55 },
  ]);
});

test('getShopSourceMeta ranks website and review-backed shops above estimates', () => {
  const logic = loadLogic();

  const websiteShop = logic.getShopSourceMeta({
    flavorSource: 'website',
    beanOrigins: ['Ethiopia'],
    reviewCount: 120,
  });
  const reviewShop = logic.getShopSourceMeta({
    flavorSource: 'yelp-reviews',
    dataSource: 'yelp',
    reviewCount: 180,
  });
  const aiShop = logic.getShopSourceMeta({
    dataSource: 'ai-estimate',
    reviewCount: 420,
  });

  assert.equal(websiteShop.verified, true);
  assert.equal(reviewShop.verified, true);
  assert.equal(aiShop.verified, false);
  assert.ok(websiteShop.trustScore > reviewShop.trustScore);
  assert.ok(reviewShop.trustScore > aiShop.trustScore);
});

test('matchesRoastFilter buckets medium-light and medium-dark correctly', () => {
  const logic = loadLogic();

  assert.equal(logic.matchesRoastFilter('medium-light', 'light'), true);
  assert.equal(logic.matchesRoastFilter('medium-dark', 'medium'), true);
  assert.equal(logic.matchesRoastFilter('medium-dark', 'dark'), true);
  assert.equal(logic.matchesRoastFilter('', 'dark'), false);
});

test('buildFeaturedSections returns verified, reviewed, fresh, and flavor-match rails', () => {
  const logic = loadLogic();

  const shops = [
    { id: 1, name: 'Verified Website', flavorSource: 'website', beanOrigins: ['Kenya'], reviewCount: 80, rating: 4.8, distance: 1.2, _matchPct: 92 },
    { id: 2, name: 'Yelp Favorite', flavorSource: 'yelp-reviews', dataSource: 'yelp', reviewCount: 320, rating: 4.7, distance: 0.8, _matchPct: 85 },
    { id: 3, name: 'AI Nearby', dataSource: 'ai-estimate', reviewCount: 40, rating: 4.5, distance: 0.2, _matchPct: 40 },
    { id: 4, name: 'Verified Nearby', dataSource: 'yelp', reviewCount: 140, rating: 4.4, distance: 0.5, _matchPct: 70 },
  ];

  const sections = logic.buildFeaturedSections(shops, {
    updatedAt: new Date().toISOString(),
    source: 'cached',
    activeFlavorTags: ['smooth'],
  });

  assert.deepEqual(normalize(sections.map(section => section.id)), ['verified', 'reviewed', 'fresh', 'match']);
  assert.equal(sections[0].shops[0].id, 1);
  assert.equal(sections[1].shops[0].id, 2);
  assert.equal(sections[2].shops[0].id, 3);
  assert.equal(sections[3].shops[0].id, 1);
});

test('quick intents expose trust-first presets', () => {
  const logic = loadLogic();
  const intents = logic.getQuickIntents();

  assert.deepEqual(normalize(intents.map(intent => intent.id)), [
    'verified',
    'dark-roast',
    'fruity-espresso',
    'smooth-cappuccino',
    'most-reviewed',
  ]);
  assert.equal(intents[0].verifiedOnly, true);
  assert.deepEqual(normalize(intents[1].flavors), ['dark', 'chocolatey']);
});