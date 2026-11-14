import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AUDIO_OUTPUT_FORMATS, VIDEO_OUTPUT_FORMATS, MEDIA_IMAGE_OUTPUT_FORMATS, buildMediaOutputArgs, matchesMediaSignature } from '../src/lib/converters/mediaProfiles';

const available = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }).status === 0;
// This tests the command line against native FFmpeg as a second line of defense.
// The browser's WASM FFmpeg encoder set still requires a separate in-browser test.
for (const target of [...AUDIO_OUTPUT_FORMATS, ...VIDEO_OUTPUT_FORMATS, ...MEDIA_IMAGE_OUTPUT_FORMATS]) {
  test('native FFmpeg fixture -> ' + target + ' has matching codec/container signature', { skip: !available }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'localvert-format-'));
    try {
      const output = join(dir, 'fixture.' + target);
      const isAudio = AUDIO_OUTPUT_FORMATS.includes(target as never);
      const inputs = isAudio
        ? ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=0.4']
        : ['-f', 'lavfi', '-i', 'testsrc2=size=64x64:rate=5:duration=0.4',
          '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=0.4'];
      const args = ['-hide_banner', '-loglevel', 'error', '-y', ...inputs,
        ...buildMediaOutputArgs(target, isAudio ? 'audio' : 'video'), output];
      const completed = spawnSync('ffmpeg', args, { encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024 });
      assert.equal(completed.status, 0, target + ' encoding failed: ' + (completed.stderr || completed.error?.message));
      const data = new Uint8Array(readFileSync(output));
      assert.ok(data.length >= 12, target + ' is empty');
      assert.equal(matchesMediaSignature(data, target), true, target + ' has an incorrect header');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
