import test from 'node:test';
import assert from 'node:assert/strict';
import { imageOptions, videoOptions, scaleFilter, outputIsSmaller } from '../src/lib/compressors/settings';

test('one simple slider means higher compression always maps to lower quality', () => {
  const mild = imageOptions(10, { mode: 'simple' }, 5_000_000, 'jpg');
  const strong = imageOptions(90, { mode: 'simple' }, 5_000_000, 'jpg');
  assert.ok(mild.initialQuality > strong.initialQuality);
  assert.ok(mild.maxSizeMB > strong.maxSizeMB);
  assert.ok(videoOptions(90, { mode: 'simple' }).crf > videoOptions(10, { mode: 'simple' }).crf);
  assert.equal(mild.maxWidthOrHeight, undefined);
  assert.equal(strong.maxWidthOrHeight, 1920);
});

test('advanced mode overrides compression strength with explicit controls', () => {
  const opts = imageOptions(90, { mode: 'advanced', imageFormat: 'webp', imageQuality: 95, maxWidth: 800 }, 8_000_000, 'png');
  assert.equal(opts.fileType, 'image/webp');
  assert.equal(opts.initialQuality, 0.95);
  assert.equal(opts.maxWidthOrHeight, 800);
  const vid = videoOptions(10, { mode: 'advanced', videoCrf: 35, resolution: '720p', mute: true, audioBitrate: 192 });
  assert.deepEqual(vid, { crf: 35, preset: 'veryfast', resolution: '720p', mute: true, audioBitrate: 192 });
});

test('a PNG default stays PNG and metadata is never falsely marked preserved', () => {
  const opts = imageOptions(25, { mode: 'simple', keepMetadata: true }, 2_000_000, 'png');
  assert.equal(opts.ext, 'png');
  assert.equal(opts.preserveExif, false);
});

test('unknown image formats use WebP rather than pretending output has HEIC encoder', () => {
  assert.equal(imageOptions(50, { mode: 'simple' }, 2_000_000, 'heic').ext, 'webp');
});

test('video resolution never upscales and preserves aspect ratio', () => {
  assert.equal(scaleFilter('original'), null);
  assert.match(scaleFilter('720p')!, /force_original_aspect_ratio=decrease/);
});

test('size guard prefers the original only when output is not smaller', () => {
  assert.equal(outputIsSmaller(900, 1000), true);
  assert.equal(outputIsSmaller(1100, 1000), false);
});
