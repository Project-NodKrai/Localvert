import test from 'node:test';
import assert from 'node:assert/strict';
import { validateVideoModel, parseVideoFrameRate, videoFrameEncodeArgs, videoFrameExtractArgs } from '../src/lib/upscalers/videoFrames';

test('real video AI uses selected ONNX model instead of silently defaulting to ESRGAN', () => {
  assert.equal(validateVideoModel('quicksrnet-small-4x', 'nano', '동영상'), 'quicksrnet-small-4x');
  assert.equal(validateVideoModel('realesr-animevideov3', 'lite', '애니메이션'), 'realesr-animevideov3');
  assert.equal(validateVideoModel('esrgan-slim-2x', 'standard', '실사'), 'esrgan-slim-2x');
});

test('unavailable tier or mismatched purpose cannot trigger an unrelated model', () => {
  assert.throws(() => validateVideoModel('quicksrnet-small-4x', 'reference', '동영상'), /모델/);
  assert.throws(() => validateVideoModel('quicksrnet-small-4x', 'nano', '일러스트'), /모델/);
});

test('metadata-based source FPS preserves 23.976, 24, 29.97 and 60fps', () => {
  for (const fps of [23.976, 24, 25, 29.97, 59.94, 60]) {
    assert.equal(parseVideoFrameRate([
      'Stream #0:0: Video: h264, yuv420p, 1280x720, 500 kb/s, ' + fps + ' fps, 30 tbr, 90k tbn',
    ]), fps);
  }
  assert.throws(() => parseVideoFrameRate(['Audio: aac', 'Video: h264 (no metadata)']), /프레임 속도/);
});

test('video frame remux keeps source audio as an optional stream and encodes MP4', () => {
  const args = videoFrameEncodeArgs('frame_%05d.png', 'original.mov', 'out.mp4', 25, 50);
  assert.deepEqual(args.slice(0, 9), ['-hide_banner','-y','-framerate','25','-i','frame_%05d.png','-i','original.mov','-map']);
  assert.ok(args.includes('1:a:0?'));
  assert.ok(args.includes('libx264'));
  assert.ok(args.includes('aac'));
  assert.equal(args[args.indexOf('-t') + 1], '2.000000');
  assert.equal(args.at(-1), 'out.mp4');
});

test('video frame remux rejects invalid timeline', () => {
  assert.throws(() => videoFrameEncodeArgs('p', 'in', 'out', 0, 1));
  assert.throws(() => videoFrameEncodeArgs('p', 'in', 'out', 30, 0));
});

test('variable frame rate inputs are sampled at constant FPS before frame inference', () => {
  const args = videoFrameExtractArgs('original.mp4', 'frame_%05d.png', 29.97, 5);
  assert.ok(args.includes('fps=29.97'));
  assert.equal(args[args.indexOf('-t') + 1], '5');
  assert.equal(args[args.indexOf('-start_number') + 1], '1');
  assert.ok(!args.includes('-vsync'));
});
