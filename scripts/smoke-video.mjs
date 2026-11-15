import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'localvert-video-smoke-'));
const source = join(dir, 'source.mp4');
const output = join(dir, 'upscaled.mp4');

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 90000 });
  if (result.status !== 0) throw new Error(command + ' failed: ' + (result.stderr || result.error?.message));
  return result.stdout;
}

function probe(path, streamType, entries) {
  const output = run('ffprobe', ['-v', 'error', '-select_streams', streamType,
    '-show_entries', 'stream=' + entries, '-of', 'json', path]);
  return JSON.parse(output).streams?.[0] || {};
}

let browser;
try {
  // 5 fps is intentionally different from 30 fps: the old implementation
  // played these clips back at the wrong speed and removed their audio.
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc2=size=48x32:rate=5:duration=0.8',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=0.8',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', source]);

  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('pageerror', error => console.error('[browser error]', error.message));
  page.on('console', message => { if (message.type() === 'error') console.error('[browser console]', message.text()); });
  await page.goto('http://127.0.0.1:3000/upscale', { waitUntil: 'domcontentloaded' });

  const sourceBytes = readFileSync(source).toString('base64');
  const result = await page.evaluate(async payload => {
    try {
      const { upscaleVideo } = await import('/src/lib/upscalers/index.ts');
      const inputData = Uint8Array.from(atob(payload), ch => ch.charCodeAt(0));
      const file = new File([inputData], 'source.mp4', { type: 'video/mp4' });
      const blob = await upscaleVideo('browser-smoke', file, 'ai', 1, undefined, 'quicksrnet-small-4x');
      const data = new Uint8Array(await blob.arrayBuffer());
      if (blob.type !== 'video/mp4' || data.length < 1000 ||
          String.fromCharCode(...data.subarray(4, 8)) !== 'ftyp') {
        throw new Error('Browser returned invalid MP4');
      }
      let raw = '';
      for (const byte of data) raw += String.fromCharCode(byte);
      return { ok: true, base64: btoa(raw), bytes: data.byteLength };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.stack || error.message : String(error) };
    }
  }, sourceBytes);
  if (!result.ok) throw new Error('Browser video upscale: ' + result.error);
  const fs = await import('node:fs');
  fs.writeFileSync(output, Buffer.from(result.base64, 'base64'));
  const video = probe(output, 'v:0', 'width,height,avg_frame_rate,codec_name');
  const audio = probe(output, 'a:0', 'codec_name');
  if (video.width !== 192 || video.height !== 128) {
    throw new Error('Expected 4x video (192x128), got: ' + JSON.stringify(video));
  }
  if (audio.codec_name !== 'aac') throw new Error('Original audio missing: ' + JSON.stringify(audio));
  if (!['5/1','5000/1000'].includes(video.avg_frame_rate)) {
    throw new Error('Input 5fps was not retained: ' + video.avg_frame_rate);
  }
  console.log('PASS: real Chromium + ONNX 4x video + source FPS + audio', result.bytes, video, audio);
} finally {
  await browser?.close();
  rmSync(dir, { recursive: true, force: true });
}
