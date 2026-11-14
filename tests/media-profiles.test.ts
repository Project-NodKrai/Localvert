import test from 'node:test';
import assert from 'node:assert/strict';
import { AUDIO_OUTPUT_FORMATS, VIDEO_OUTPUT_FORMATS, MEDIA_IMAGE_OUTPUT_FORMATS, buildMediaOutputArgs, matchesMediaSignature } from '../src/lib/converters/mediaProfiles';

for (const format of [...AUDIO_OUTPUT_FORMATS, ...VIDEO_OUTPUT_FORMATS, ...MEDIA_IMAGE_OUTPUT_FORMATS]) {
  test('FFmpeg output profile: ' + format, () => {
    const kind = AUDIO_OUTPUT_FORMATS.includes(format as never) ? 'audio' : 'video';
    const args = buildMediaOutputArgs(format, kind);
    assert.ok(args.length > 2);
    assert.ok(args.includes('-f'));
    assert.equal(args.at(-1)?.startsWith('-'), false);
  });
}

test('HEVC uses H.265, not H.264 with a different filename', () => {
  assert.ok(buildMediaOutputArgs('hevc', 'video').includes('libx265'));
});

test('AMR and ALAC do not falsely claim working encoders', () => {
  assert.throws(() => buildMediaOutputArgs('amr', 'audio'), /AMR/);
  assert.throws(() => buildMediaOutputArgs('alac', 'audio'), /ALAC/);
});

test('image input cannot yield audio, and audio cannot yield a fake video', () => {
  assert.throws(() => buildMediaOutputArgs('mp3', 'image'), /오디오/);
  assert.throws(() => buildMediaOutputArgs('mp4', 'audio'), /오디오/);
});

test('common binary signatures are checked against output extension', () => {
  const png = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
  assert.equal(matchesMediaSignature(png, 'png'), true);
  assert.equal(matchesMediaSignature(png, 'avif'), false);
  assert.equal(matchesMediaSignature(png, 'jpg'), false);
  const mp4 = new Uint8Array([0,0,0,24,102,116,121,112,105,115,111,109,0]);
  assert.equal(matchesMediaSignature(mp4, 'mp4'), true);
  assert.equal(matchesMediaSignature(mp4, 'webm'), false);
  const h265 = new Uint8Array([0,0,0,1,64,1,0,0,0,0,0,0]);
  assert.equal(matchesMediaSignature(h265, 'hevc'), true);
});
