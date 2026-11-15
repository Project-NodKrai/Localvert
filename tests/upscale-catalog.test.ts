import test from 'node:test';
import assert from 'node:assert/strict';
import { UPSCALE_TIERS, UPSCALE_CATALOG, ACTIVE_MODEL_IDS, TIER_LABELS, normalizeModelId, activeModel, modelsForTierPurpose, runnableModelForTierPurpose, isRunnableSelection, tierPurposeLabel, UPSCALE_PURPOSES } from '../src/lib/upscalers/catalog';
import { adviseImageUpscale } from '../src/lib/upscalers/performance';

test('all nine requested tiers are ordered, including Ultra Plus and Reference', () => {
  assert.deepEqual(UPSCALE_TIERS, ['nano','lite','standard','plus','pro','max','ultra','ultra-plus','reference']);
  assert.equal(TIER_LABELS['ultra-plus'], 'Ultra Plus');
  for (const tier of UPSCALE_TIERS) assert.ok(UPSCALE_CATALOG.some(m => m.tier === tier));
});

test('existing installed models are re-tiered, not duplicated under misleading labels', () => {
  assert.equal(activeModel('standard').tier, 'standard');
  assert.equal(activeModel('ultra').tier, 'plus');
  assert.equal(activeModel('esrgan-medium-4x').tier, 'max');
  assert.equal(normalizeModelId('ultra'), 'esrgan-medium-2x');
  assert.equal(ACTIVE_MODEL_IDS.length, 24);
});

test('planned candidates are never marked as installed or executable', () => {
  const ready = UPSCALE_CATALOG.filter(m => m.available);
  assert.deepEqual(new Set(ready.map(m => m.id)), new Set(ACTIVE_MODEL_IDS));
  assert.equal(UPSCALE_CATALOG.find(m => m.id === 'quicksrnet-small-4x')?.available, true);
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

test('nine-position slider tier labels stay separate from purpose labels', () => {
  assert.equal(UPSCALE_TIERS.length, 9);
  assert.deepEqual(UPSCALE_PURPOSES, ['실사', '일러스트', '애니메이션', '동영상']);
  assert.equal(tierPurposeLabel('ultra-plus', '일러스트'), 'Ultra Plus (일러스트)');
});

test('purpose filters only compatible model candidates within the chosen tier', () => {
  assert.deepEqual(modelsForTierPurpose('plus', '실사').map(m => m.id),
    ['realplksr-4x', 'esrgan-medium-2x', 'realplksr-2x']);
  assert.deepEqual(modelsForTierPurpose('max', '동영상').map(m => m.id), ['flashvsr']);
  assert.equal(runnableModelForTierPurpose('standard', '실사'), 'swin2sr-lightweight-2x');
  assert.equal(runnableModelForTierPurpose('max', '실사'), 'esrgan-medium-4x');
});

test('unavailable tier or purpose never silently selects a different executable model', () => {
  assert.equal(runnableModelForTierPurpose('nano', '실사'), 'quicksrnet-small-4x');
  assert.equal(runnableModelForTierPurpose('lite', '일러스트'), 'anime4k-v4-m-2x');
  assert.equal(runnableModelForTierPurpose('max', '동영상'), null);
  assert.equal(runnableModelForTierPurpose('plus', '애니메이션'), 'realesrgan-anime-4b32f');
  assert.equal(isRunnableSelection('esrgan-slim-2x', 'nano', '실사'), false);
  assert.equal(isRunnableSelection('esrgan-slim-2x', 'standard', '실사'), true);
  assert.equal(isRunnableSelection('esrgan-slim-2x', 'standard', '동영상'), false);
  assert.equal(isRunnableSelection('ultra', 'plus', '실사'), true);
});

test('two extra 2x SPAN executables cover photo and anime as separate purpose models', () => {
  assert.equal(activeModel('nomosuni-span-2x').scale, 2);
  assert.equal(activeModel('modernspanimation-2x').tier, 'lite');
  assert.equal(isRunnableSelection('nomosuni-span-2x', 'lite', '실사'), true);
  assert.equal(isRunnableSelection('modernspanimation-2x', 'lite', '애니메이션'), true);
});

test('Anime4K 4.0.1 profiles have a dedicated GPU backend and separate real model IDs', () => {
  assert.equal(activeModel('anime4k-v4-s-2x').tier, 'nano');
  assert.equal(activeModel('anime4k-v4-m-2x').tier, 'lite');
  assert.equal(activeModel('anime4k-v4-l-2x').tier, 'standard');
  assert.equal(isRunnableSelection('anime4k-v4-s-2x','nano','애니메이션'), true);
  assert.equal(isRunnableSelection('anime4k-v4-l-2x','standard','동영상'), true);
  assert.equal(isRunnableSelection('anime4k-v4-s-2x','nano','실사'), false);
});
