import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_STUDIO_PROFILES, isStudioProfileRunnable, updateStudioProfile, canAcceptStudioFile,
} from '../src/lib/upscalers/studio';

test('upscale studio starts with independent compatible image and video profiles', () => {
  assert.equal(isStudioProfileRunnable(DEFAULT_STUDIO_PROFILES.image, 'image'), true);
  assert.equal(isStudioProfileRunnable(DEFAULT_STUDIO_PROFILES.video, 'video'), true);
  assert.equal(DEFAULT_STUDIO_PROFILES.image.model, 'esrgan-slim-2x');
  assert.equal(DEFAULT_STUDIO_PROFILES.video.upscalePurpose, '동영상');
});

test('tier and purpose select a compatible model when one is installed', () => {
  const next = updateStudioProfile(DEFAULT_STUDIO_PROFILES.image, { upscaleTier: 'nano' });
  assert.equal(next.upscaleTier, 'nano');
  assert.equal(next.model, 'quicksrnet-small-4x');
  assert.equal(isStudioProfileRunnable(next, 'image'), true);
});

test('unavailable profile cannot silently reuse another tier', () => {
  const next = updateStudioProfile(DEFAULT_STUDIO_PROFILES.image, { upscaleTier: 'reference' });
  assert.equal(next.upscaleTier, 'reference');
  assert.equal(isStudioProfileRunnable(next, 'image'), false);
});

test('video filter can run without an AI model but video AI must validate the selection', () => {
  const profile = updateStudioProfile(DEFAULT_STUDIO_PROFILES.video, { upscaleTier: 'reference' });
  assert.equal(isStudioProfileRunnable(profile, 'video'), true);
  assert.equal(isStudioProfileRunnable({ ...profile, videoMethod: 'ai' }, 'video'), false);
});


test('image/video/mixed file selectors filter by MIME and supported extensions', () => {
  assert.equal(canAcceptStudioFile('image', { name: 'sample.png', type: 'image/png' }), true);
  assert.equal(canAcceptStudioFile('image', { name: 'sample.mp4', type: 'video/mp4' }), false);
  assert.equal(canAcceptStudioFile('video', { name: 'sample.mkv', type: '' }), true);
  assert.equal(canAcceptStudioFile('mixed', { name: 'sample.png', type: 'image/png' }), true);
  assert.equal(canAcceptStudioFile('mixed', { name: 'sample.mp4', type: 'video/mp4' }), true);
  assert.equal(canAcceptStudioFile('mixed', { name: 'data.csv', type: 'text/csv' }), false);
});
