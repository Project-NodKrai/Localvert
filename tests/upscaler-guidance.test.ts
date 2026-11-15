import test from 'node:test';
import assert from 'node:assert/strict';
import { adviseImageUpscale } from '../src/lib/upscalers/performance';

test('standard and ultra have distinct advisory requirements and patch sizes', () => {
  const hints = { memoryHintGB: 8, logicalCores: 8, webglAvailable: true, maxTextureSize: 16384 };
  const standard = adviseImageUpscale('standard', 2000, 1500, hints);
  const ultra = adviseImageUpscale('ultra', 2000, 1500, hints);
  assert.equal(standard.recommendedSystemRamGB, 8);
  assert.equal(ultra.recommendedSystemRamGB, 24);
  assert.equal(standard.patchSize, 256);
  assert.equal(ultra.patchSize, 128);
  assert.equal(standard.outputMegapixels, 12);
  assert.equal(ultra.outputMegapixels, 12);
  assert.equal(standard.caution, false);
  assert.equal(ultra.caution, false);
});

test('a large Ultra input raises a warning and reduces patch size but never blocks', () => {
  const advice = adviseImageUpscale('ultra', 6000, 4000, { webglAvailable: true, maxTextureSize: 16384 });
  assert.equal(advice.caution, true);
  assert.equal(advice.patchSize, 64);
  assert.ok(advice.warnings.some(w => w.includes('8MP')));
  assert.equal(advice.estimatedOutputRGBABytes, 384000000);
});

test('browser memory hint is not treated as total system RAM', () => {
  const guidance = adviseImageUpscale('ultra', 1000, 1000, { memoryHintGB: 8, webglAvailable: true });
  assert.equal(guidance.caution, false);
  assert.equal(guidance.recommendedSystemRamGB, 24);
});

test('WebGL-unavailable devices can still choose CPU or WASM execution', () => {
  const guidance = adviseImageUpscale('standard', 1200, 800, { webglAvailable: false });
  assert.equal(guidance.caution, true);
  assert.ok(guidance.warnings.some(w => w.includes('WebGL')));
});

test('output exceeding GPU texture limit prompts a warning even with tiling', () => {
  const guidance = adviseImageUpscale('standard', 5000, 4000, { webglAvailable: true, maxTextureSize: 8192 });
  assert.equal(guidance.caution, true);
  assert.ok(guidance.warnings.some(w => w.includes('텍스처 한도')));
});

test('unknown browser hints do not invent a below-requirements result', () => {
  const guidance = adviseImageUpscale('standard', 1800, 1200);
  assert.equal(guidance.caution, false);
});
