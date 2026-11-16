import test from 'node:test';
import assert from 'node:assert/strict';
import { fluxSigmas, seededGaussian, unpackFluxLatent, float32ToHalf, halfToFloat32 } from '../src/lib/imageGeneration/browserMath';

test('FLUX.2 Klein dynamic shifted 4-step scheduler agrees with model reference', () => {
  const a = fluxSigmas(4, 1024);
  assert.equal(a.length, 5);
  assert.equal(a[0], 1);
  assert.equal(a[4], 0);
  for (let i = 1; i < 5; i++) assert.ok(a[i - 1] > a[i]);
  // 1024 image tokens corresponds to a 512x512 generated image.
  assert.ok(Math.abs(a[1] - 0.849) < 0.01);
  assert.ok(Math.abs(a[2] - 0.652) < 0.01);
  assert.ok(Math.abs(a[3] - 0.385) < 0.02);
});

test('fixed seeds give reproducible but independent Gaussian noise', () => {
  assert.deepEqual(seededGaussian(1024, 27), seededGaussian(1024, 27));
  assert.notDeepEqual(seededGaussian(1024, 27), seededGaussian(1024, 28));
  assert.ok([...seededGaussian(1024, 27)].every(Number.isFinite));
});

test('unpacks FLUX packed 128-channel tokens into 32-channel 2x2 patches', () => {
  const token = Float32Array.from({length: 128}, (_, i) => i);
  const out = unpackFluxLatent(token, 16, 16);
  assert.equal(out.length, 128);
  // One packed token is a [32,2,2] latent.
  assert.deepEqual([...out.slice(0, 4)], [0,1,2,3]);
  assert.deepEqual([...out.slice(4, 8)], [4,5,6,7]);
  assert.throws(() => unpackFluxLatent(token, 32, 16), /dimensions mismatch/);
});

test('float16 conversion roundtrip is bounded and handles infinities', () => {
  for (const value of [0, -1, 0.75, 4.2, 65504]) {
    const restored = halfToFloat32(float32ToHalf(value));
    assert.ok(Math.abs(restored - value) <= Math.max(0.002, Math.abs(value) * 0.001));
  }
  assert.equal(halfToFloat32(float32ToHalf(Infinity)), Infinity);
  assert.ok(Number.isNaN(halfToFloat32(float32ToHalf(NaN))));
});

test('invalid model settings are rejected before large model downloads', () => {
  assert.throws(() => fluxSigmas(0, 1024), /Invalid step count/);
  assert.throws(() => fluxSigmas(4, 0), /Invalid image sequence/);
  assert.throws(() => unpackFluxLatent(new Float32Array(), 15, 16), /multiples of 16/);
});
