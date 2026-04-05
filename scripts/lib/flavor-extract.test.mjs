import test from 'node:test';
import assert from 'node:assert/strict';

import { extractFlavorProfile } from './flavor-extract.mjs';

test('extractFlavorProfile keeps only flavors with repeated review support', () => {
  const result = extractFlavorProfile([
    'Smooth espresso with chocolate notes. Smooth finish and chocolate aroma.',
    'Really smooth cappuccino, chocolate forward and smooth enough to notice.',
    'Balanced shot with a single floral hint.',
  ]);

  assert.ok(result);
  assert.equal(result.dataSource, 'yelp-reviews');
  assert.deepEqual(
    result.flavorTags.map(tag => tag.tag),
    ['smooth', 'chocolatey'],
  );
});

test('extractFlavorProfile falls back when review flavors are too sparse', () => {
  const fallback = { balanced: 80, caramel: 52, nutty: 41 };
  const result = extractFlavorProfile([
    'Bright shop overall with one floral note.',
    'Nice atmosphere and fast service.',
    'Good coffee but nothing especially descriptive.',
  ], fallback);

  assert.ok(result);
  assert.equal(result.dataSource, 'ai-estimate');
  assert.deepEqual(result.flavorProfile, fallback);
  assert.deepEqual(
    result.flavorTags.map(tag => tag.tag),
    ['balanced', 'caramel', 'nutty'],
  );
});