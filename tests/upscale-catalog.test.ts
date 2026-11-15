import test from 'node:test';
import assert from 'node:assert/strict';
import { UPSCALE_TIERS, UPSCALE_CATALOG, ACTIVE_MODEL_IDS, TIER_LABELS, normalizeModelId, activeModel } from '../src/lib/upscalers/catalog';
import { adviseImageUpscale } from '../src/lib/upscalers/performance';

test('all nine requested tiers are ordered, including Ultra Plus and Reference', () => {
  assert.deepEqual(UPSCALE_TIERS, ['nano','lite','standard','plus','pro','max','ultra','ultra-plus','reference']);
  assert.equal(TIER_LABELS['ultra-plus'], 'Ultra Plus');
  for (const tier of UPSCALE_TIERS) assert.ok(UPSCALE_CATALOG.some(m => m.tier === tier));
});

test('existing installed models are re-tiered, not duplicated under misleading labels', () => {
  assert.equal(activeModel('standard').tier, 'lite');
  assert.equal(activeModel('ultra').tier, 'standard');
  assert.equal(activeModel('esrgan-medium-4x').tier, 'plus');
  assert.equal(normalizeModelId('ultra'), 'esrgan-medium-2x');
  assert.equal(ACTIVE_MODEL_IDS.length, 3);
});

test('planned candidates are never marked as installed or executable', () => {
  const ready = UPSCALE_CATALOG.filter(m => m.available);
  assert.deepEqual(ready.map(m => m.id), [...ACTIVE_MODEL_IDS]);
  assert.equal(UPSCALE_CATALOG.find(m => m.id === 'quicksrnet-small-3x')?.available, false);
});

test('4x output changes pixel count and caution thresholds versus 2x', () => {
  const lite = adviseImageUpscale('esrgan-slim-2x', 2000, 1500, { webglAvailable: true });
  const plus = adviseImageUpscale('esrgan-medium-4x', 2000, 1500, { webglAvailable: true });
  assert.equal(lite.outputMegapixels, 12);
  assert.equal(plus.outputMegapixels, 48);
  assert.equal(plus.estimatedOutputRGBABytes, 192000000);
  assert.equal(plus.caution, true);
  assert.ok(plus.patchSize < lite.patchSize);
});
