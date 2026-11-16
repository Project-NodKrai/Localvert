import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const dir = mkdtempSync(join(tmpdir(), 'localvert-identity-'));
const videoFile = join(dir, 'input.mp4');

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 90000 });
  if (r.status !== 0) throw new Error(cmd + ': ' + (r.stderr || r.error?.message));
  return r.stdout;
}

let browser;
try {
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc2=size=32x24:rate=2:duration=0.5',
    '-f', 'lavfi', '-i', 'sine=frequency=500:sample_rate=44100:duration=0.5',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', videoFile]);
  const videoBase64 = readFileSync(videoFile).toString('base64');

  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 16 });
    Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 16 });
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:3000/upscale', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-upscale-studio]').waitFor({ state: 'visible', timeout: 30000 });
  const models = [
    ['quicksrnet-small-4x', 'nano'],
    ['quicksrnet-medium-4x', 'lite'],
    ['xlsr-4x', 'nano'],
  ];

  const results = await page.evaluate(async ({ videoBase64, models }) => {
    const { upscaleImage, upscaleVideo } = await import('/src/lib/upscalers/index.ts');
    const { makeUpscaleJobSnapshot, UpscaleExecutionTrace } =
      await import('/src/lib/upscalers/executionTrace.ts');
    const binary = Uint8Array.from(atob(videoBase64), char => char.charCodeAt(0));
    const originalVideo = new File([binary], 'original.mp4', { type: 'video/mp4' });
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = 24;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#215fa9'; ctx.fillRect(0, 0, 32, 24);
    ctx.fillStyle = '#f5b142'; ctx.fillRect(4, 2, 11, 16);
    ctx.fillStyle = '#18387f'; ctx.fillRect(15, 11, 17, 8);
    const imageBlob = await new Promise((resolve, reject) => canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('PNG failed')), 'image/png'));
    const originalImage = new File([imageBlob], 'original.png', { type: 'image/png' });
    const records = [];
    for (const [model, tier] of models) {
      for (const media of ['image', 'video']) {
        const file = media === 'image' ? originalImage : originalVideo;
        const id = media + '-' + model;
        const job = {
          id, file, type: media, mode: 'upscale', model, upscaleTier: tier,
          upscalePurpose: media === 'video' ? '동영상' : '실사', videoMethod: 'ai',
        };
        const trace = new UpscaleExecutionTrace(makeUpscaleJobSnapshot(job));
        const output = media === 'image'
          ? await upscaleImage(file, model, undefined, trace)
          : await upscaleVideo(id, file, 'ai', 1, undefined, model, trace);
        const evidence = await trace.finish(file, output);
        const objectUrl = URL.createObjectURL(output);
        const recovered = await fetch(objectUrl).then(r => r.blob());
        URL.revokeObjectURL(objectUrl);
        if (recovered.size !== output.size) throw new Error('Object URL returned wrong Blob size');
        const hash = async blob => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))]
          .map(value => value.toString(16).padStart(2, '0')).join('');
        if (await hash(recovered) !== evidence.outputSha256) {
          throw new Error('Output Blob URL hash did not match execution evidence for ' + id);
        }
        records.push({ id, media, model, evidence, bytes: output.size,
          base64: media === 'video' ? await (async () => {
            const raw = new Uint8Array(await output.arrayBuffer());
            let text = '';
            for (const byte of raw) text += String.fromCharCode(byte);
            return btoa(text);
          })() : undefined });
      }
    }
    return records;
  }, { videoBase64, models });

  const byMedia = { image: [], video: [] };
  for (const record of results) {
    const { evidence, id, model, media } = record;
    assert.equal(evidence.jobId, id);
    assert.equal(evidence.requestedModelId, model);
    assert.equal(evidence.effectiveModelId, model);
    assert.equal(evidence.engine, 'onnx-wasm');
    assert.ok(evidence.resource?.endsWith('.onnx'));
    assert.ok(evidence.inferenceCalls >= 1);
    assert.ok(evidence.outputSha256?.length === 64);
    if (media === 'video') {
      assert.ok(evidence.inferredFrames >= 1);
      assert.equal(evidence.inferredFrames, evidence.encodedFrames);
      const path = join(dir, id + '.mp4');
      writeFileSync(path, Buffer.from(record.base64, 'base64'));
      const probe = JSON.parse(run('ffprobe', ['-v','error', '-select_streams','v:0',
        '-show_entries','stream=width,height', '-of','json', path])).streams[0];
      assert.equal(probe.width, 128);
      assert.equal(probe.height, 96);
    }
    byMedia[media].push(evidence.outputSha256);
    console.log('PASS actual execution:', id, evidence.resource, evidence.inferenceCalls,
      evidence.inferredFrames, evidence.outputSha256);
  }
  assert.ok(new Set(byMedia.image).size >= 2, 'Three different image models unexpectedly returned identical binary results');
  assert.ok(new Set(byMedia.video).size >= 2, 'Three different video models unexpectedly returned identical binary results');

  // End-to-end UI: two uploads with the SAME name, different selected models,
  // independent job IDs, independent Blob URLs and independently hashed downloads.
  const input = page.locator('[data-testid="upscale-file-input"]');
  async function setModel(tier) {
    await page.getByRole('button', { name: '모델 상세 설정', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: '품질 수준 선택' });
    await sheet.getByRole('button', { name: tier, exact: true }).click();
    await sheet.getByRole('button', { name: '이 모델로 적용하기' }).click();
    await sheet.waitFor({ state: 'hidden' });
  }
  const imageBytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 24; canvas.height = 16;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#2687cd'; ctx.fillRect(0,0,24,16);
    ctx.fillStyle = '#e9d334'; ctx.fillRect(3,4,13,8);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });

  await setModel('Nano');
  await input.setInputFiles({ name: 'same.png', mimeType: 'image/png', buffer: Buffer.from(imageBytes) });
  await page.getByText('준비 완료').first().waitFor({ state: 'visible', timeout: 20000 });
  await page.getByRole('button', { name: '복원 시작', exact: true }).click();
  await page.locator('a[data-job-id]').first().waitFor({ state: 'visible', timeout: 120000 });

  await setModel('Lite');
  await input.setInputFiles({ name: 'same.png', mimeType: 'image/png', buffer: Buffer.from(imageBytes) });
  await page.getByText('준비 완료').first().waitFor({ state: 'visible', timeout: 20000 });
  await page.getByRole('button', { name: '복원 시작', exact: true }).click();
  await page.locator('a[data-job-id]').nth(1).waitFor({ state: 'visible', timeout: 120000 });

  const downloads = await page.locator('a[data-job-id]').evaluateAll(async anchors => {
    const output = [];
    for (const link of anchors) {
      const bytes = new Uint8Array(await (await fetch(link.href)).arrayBuffer());
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const sha = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      output.push({
        id: link.dataset.jobId, model: link.dataset.effectiveModelId,
        recordedHash: link.dataset.outputSha256, recoveredHash: sha,
        url: link.href, size: bytes.byteLength,
      });
    }
    return output;
  });
  assert.equal(downloads.length, 2);
  assert.equal(new Set(downloads.map(x => x.id)).size, 2);
  assert.equal(new Set(downloads.map(x => x.url)).size, 2);
  assert.deepEqual(downloads.map(x => x.model), ['quicksrnet-small-4x', 'quicksrnet-medium-4x']);
  for (const record of downloads) {
    assert.equal(record.recordedHash, record.recoveredHash);
    assert.ok(record.size > 100);
    console.log('PASS download Blob integrity:', record.id, record.model, record.recordedHash);
  }
  if (errors.length) throw new Error('Browser errors: ' + errors.join(' | '));
  console.log('PASS 3 model image/video inference + separate queued download identity and hashes');
} finally {
  await browser?.close();
  rmSync(dir, { recursive: true, force: true });
}
