import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'localvert-identity-'));
const inputVideo = join(dir, 'original.mp4');
const evidence = { generatedBy: 'scripts/smoke-upscale-identity.mjs', image: [], video: [] };
const origin = 'http://127.0.0.1:3000/upscale';
const examples = [
  { id: 'quicksrnet-small-4x', tier: 'nano', purpose: '동영상' },
  { id: 'xlsr-4x', tier: 'nano', purpose: '동영상' },
  { id: 'quicksrnet-medium-4x', tier: 'lite', purpose: '동영상' },
];

function command(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 90000 });
  if (r.status !== 0) throw new Error(cmd + ' failed: ' + (r.stderr || r.error?.message));
  return r.stdout;
}
const digest = buffer => createHash('sha256').update(buffer).digest('hex');

async function imageFixture(page) {
  const pixels = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 12;
    const context = canvas.getContext('2d');
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 16; x++) {
        context.fillStyle = 'rgb(' + ((x * 31 + y * 11) % 256) + ',' +
          ((x * 19 + y * 53) % 256) + ',' + ((x * 67 + y * 7) % 256) + ')';
        context.fillRect(x, y, 1, 1);
      }
    }
    const blob = await new Promise((resolve, reject) => canvas.toBlob(
      value => value ? resolve(value) : reject(new Error('PNG encode failed')), 'image/png'));
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  return Buffer.from(pixels);
}

async function waitAndRecordDownload(page, filename, modelId) {
  const row = page.locator('[data-upscale-studio] li').filter({ hasText: filename });
  const link = row.locator('a[data-job-id]');
  await link.waitFor({ state: 'visible', timeout: 120000 });
  const recorded = await link.evaluate(async anchor => {
    const buffer = await (await fetch(anchor.href)).arrayBuffer();
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))]
      .map(b => b.toString(16).padStart(2, '0')).join('');
    return { ...anchor.dataset, href: anchor.href, digest, actualBytes: buffer.byteLength };
  });
  if (recorded.effectiveModelId !== modelId) {
    throw new Error(filename + ' used ' + recorded.effectiveModelId + ' instead of ' + modelId);
  }
  if (recorded.outputSha256 !== recorded.digest ||
      Number(recorded.outputBytes) !== recorded.actualBytes ||
      !recorded.href.startsWith('blob:') || !recorded.modelResource ||
      Number(recorded.inferenceCalls) < 1) {
    throw new Error('Wrong Blob, SHA, model resource, or inference trace for ' + filename + ': ' + JSON.stringify(recorded));
  }
  evidence.image.push({
    file: filename, jobId: recorded.jobId,
    model: recorded.effectiveModelId, resource: recorded.modelResource,
    modelGraphSha256: recorded.modelGraphSha256 || undefined,
    inferences: Number(recorded.inferenceCalls),
    outputBytes: recorded.actualBytes, sha256: recorded.digest,
  });
  return recorded;
}

async function runImageJob(page, bytes, filename, modelId) {
  await page.locator('[data-testid="upscale-file-input"]').setInputFiles({
    name: filename, mimeType: 'image/png', buffer: bytes,
  });
  await page.locator('[data-upscale-studio] li').filter({ hasText: filename })
    .getByText('준비 완료').waitFor({ state: 'visible', timeout: 20000 });
  await page.getByRole('button', { name: filename + ' 복원 시작' }).click();
  const proceed = page.getByRole('alert').getByRole('button', { name: '그래도 실행' });
  if (await proceed.isVisible().catch(() => false)) await proceed.click();
  return waitAndRecordDownload(page, filename, modelId);
}

let browser;
try {
  command('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc2=size=24x16:rate=4:duration=0.5',
    '-f', 'lavfi', '-i', 'sine=frequency=450:sample_rate=44100:duration=0.5',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-shortest', inputVideo,
  ]);
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-upscale-studio]').waitFor({ state: 'visible', timeout: 25000 });

  // Images: A->B->C with the same pixel bytes, exercising UI controls,
  // enqueue snapshots and distinct Blob URLs bound to the right Job IDs.
  const bytes = await imageFixture(page);
  const dock = page.getByRole('region', { name: '모델 수준' });
  const slider = dock.getByRole('slider', { name: 'AI 복원 등급' });
  await slider.focus();
  await slider.press('Home');
  await runImageJob(page, bytes, 'image-A.png', 'quicksrnet-small-4x');

  await dock.getByRole('button', { name: '모델 상세 설정', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: '품질 수준 선택' });
  await sheet.waitFor({ state: 'visible' });
  await sheet.getByRole('button', { name: 'XLSR 4×', exact: true }).click();
  await sheet.getByRole('button', { name: '이 모델로 적용하기' }).click();
  await runImageJob(page, bytes, 'image-B.png', 'xlsr-4x');

  await slider.focus();
  await slider.press('ArrowRight');
  await runImageJob(page, bytes, 'image-C.png', 'quicksrnet-medium-4x');

  if (new Set(evidence.image.map(item => item.jobId)).size !== 3) throw new Error('Image jobs share task ID');
  if (new Set(evidence.image.map(item => item.resource)).size !== 3) throw new Error('Image jobs reused a model resource');
  if (new Set(evidence.image.map(item => item.sha256)).size !== 3) {
    throw new Error('Images generated by three different models produced identical output bytes');
  }
  // The first download must still return its original objectURL and hash after
  // B and C have finished, not the latest Blob from a shared component state.
  const first = await page.locator('[data-upscale-studio] li').filter({ hasText: 'image-A.png' })
    .locator('a[data-job-id]').evaluate(async anchor => {
      const bytes = await (await fetch(anchor.href)).arrayBuffer();
      return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
        .map(b => b.toString(16).padStart(2, '0')).join('');
    });
  if (first !== evidence.image[0].sha256) throw new Error('First image download was replaced by a newer result');
  // A -> B -> C -> A: reselecting a previously used model may load or reuse
  // a session, but it must resolve to the original graph. Equal output bytes
  // for the SAME source+model are valid; distinct jobs still require distinct URLs.
  await slider.focus();
  await slider.press('Home');
  const again = await runImageJob(page, bytes, 'image-A-again.png', 'quicksrnet-small-4x');
  if (again.jobId === evidence.image[0].jobId ||
      again.href === evidence.image[0].href ||
      again.modelGraphSha256 !== evidence.image[0].modelGraphSha256 ||
      again.digest !== evidence.image[0].sha256) {
    throw new Error('Returning to a previous model reused a download or changed its ONNX graph');
  }
  evidence.sessionRevisit = {
    model: again.effectiveModelId,
    originalJobId: evidence.image[0].jobId,
    revisitedJobId: again.jobId,
    originalSha256: evidence.image[0].sha256,
    revisitedSha256: again.digest,
    graphSha256: again.modelGraphSha256,
    separateBlobUrls: again.href !== evidence.image[0].href,
  };
  console.log('PASS A->B->C->A: model graph stable, job-specific Blob URLs independent');
  console.log('PASS image A->B->C actual ONNX inference, job-bound Blob URL and SHA256');

  // Video A->B->C: direct browser FFmpeg.wasm + ONNX per-frame inference,
  // verifying effective session identity, resource hashes and encoder frames.
  const originalBase64 = readFileSync(inputVideo).toString('base64');
  for (const configuration of examples) {
    const result = await page.evaluate(async ({ base64, config }) => {
      const { upscaleVideo } = await import('/src/lib/upscalers/index.ts');
      const { UpscaleExecutionTrace, makeUpscaleJobSnapshot } =
        await import('/src/lib/upscalers/executionTrace.ts');
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const file = new File([bytes], 'original.mp4', { type: 'video/mp4' });
      const jobId = 'video-' + config.id;
      const task = {
        id: jobId, file, mode: 'upscale', type: 'video',
        status: 'processing', progress: 0, stored: true,
        model: config.id, upscaleTier: config.tier, upscalePurpose: config.purpose,
        videoMethod: 'ai', limitSeconds: 1,
      };
      const trace = new UpscaleExecutionTrace(makeUpscaleJobSnapshot(task));
      const output = await upscaleVideo(jobId, file, 'ai', 1, undefined, config.id, trace);
      const verification = await trace.finish(file, output);
      const url = URL.createObjectURL(output);
      try {
        const downloaded = new Uint8Array(await (await fetch(url)).arrayBuffer());
        const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', downloaded))]
          .map(b => b.toString(16).padStart(2, '0')).join('');
        // Small synthetic test fixture: returning encoded bytes enables an
        // independent ffprobe and frame-decode verification in native FFmpeg.
        let raw = '';
        for (const byte of downloaded) raw += String.fromCharCode(byte);
        return { verification, sha, encodedBase64: btoa(raw), downloadBytes: downloaded.length };
      } finally {
        URL.revokeObjectURL(url);
      }
    }, { base64: originalBase64, config: configuration });
    const { verification, sha } = result;
    if (verification.requestedModelId !== configuration.id ||
        verification.effectiveModelId !== configuration.id ||
        verification.engine !== 'onnx-wasm' ||
        !verification.resource?.includes(configuration.id.replace(/-4x$/, '')) && !verification.resource?.includes('.onnx') ||
        verification.inferenceCalls < 1 ||
        verification.inferredFrames < 1 ||
        verification.encodedFrames !== verification.inferredFrames ||
        verification.jobId !== 'video-' + configuration.id ||
        verification.outputSha256 !== sha ||
        verification.outputBytes !== result.downloadBytes) {
      throw new Error('Wrong video model/encoder/download evidence: ' + JSON.stringify(verification));
    }
    const filePath = join(dir, configuration.id + '.mp4');
    writeFileSync(filePath, Buffer.from(result.encodedBase64, 'base64'));
    const probe = JSON.parse(command('ffprobe', [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,avg_frame_rate', '-of', 'json', filePath,
    ])).streams?.[0];
    if (probe.width !== 96 || probe.height !== 64 || probe.avg_frame_rate !== '4/1') {
      throw new Error('Video dimensions/fps mismatch: ' + JSON.stringify(probe));
    }
    const rawFrame = join(dir, configuration.id + '.rgb');
    command('ffmpeg', ['-hide_banner','-loglevel','error','-y', '-i',filePath,
      '-map','0:v:0','-f','rawvideo','-pix_fmt','rgb24',rawFrame]);
    evidence.video.push({
      jobId: verification.jobId,
      requestedModelId: verification.requestedModelId,
      effectiveModelId: verification.effectiveModelId,
      modelResource: verification.resource,
      modelGraphSha256: verification.modelGraphSha256,
      inferenceCalls: verification.inferenceCalls,
      inferredFrames: verification.inferredFrames,
      encodedFrames: verification.encodedFrames,
      outputBytes: verification.outputBytes,
      inputSha256: verification.inputSha256,
      outputSha256: sha,
      decodedFramesSha256: digest(readFileSync(rawFrame)),
      resolution: probe.width + 'x' + probe.height,
      frameRate: probe.avg_frame_rate,
    });
    console.log('PASS real video model', configuration.id, 'frames', verification.encodedFrames, sha);
  }
  if (new Set(evidence.video.map(item => item.modelResource)).size !== 3) throw new Error('Video models share ONNX resource');
  if (new Set(evidence.video.map(item => item.decodedFramesSha256)).size !== 3) {
    throw new Error('Three model outputs have identical decoded video frames');
  }
  if (new Set(evidence.video.map(item => item.outputSha256)).size !== 3) {
    throw new Error('Three model runs produced byte-identical MP4');
  }
  if (new Set(evidence.video.map(item => item.inputSha256)).size !== 1) throw new Error('Video source differs between runs');
  // Deliberately overlap A/B/C ONNX loads and runs. An active session must
  // not be released by another model's 2-entry LRU eviction.
  const parallel = await page.evaluate(async configs => {
    const { upscaleOnnxImage } = await import('/src/lib/upscalers/onnx.ts');
    const { makeUpscaleJobSnapshot, UpscaleExecutionTrace } =
      await import('/src/lib/upscalers/executionTrace.ts');
    const canvas = document.createElement('canvas');
    canvas.width = 5;
    canvas.height = 3;
    const context = canvas.getContext('2d');
    context.fillStyle = '#12aadd';
    context.fillRect(0, 0, 5, 3);
    context.fillStyle = '#bd1244';
    context.fillRect(2, 0, 2, 3);
    const input = await new Promise((resolve, reject) => canvas.toBlob(
      value => value ? resolve(value) : reject(new Error('Parallel PNG missing')), 'image/png'));
    const file = new File([input], 'race.png', { type: 'image/png' });
    return Promise.all(configs.map(async config => {
      const snapshot = makeUpscaleJobSnapshot({
        id: 'parallel-' + config.id, file, mode: 'upscale', type: 'image',
        status: 'processing', progress: 0, stored: true,
        model: config.id, upscaleTier: config.tier, upscalePurpose: '실사',
        videoMethod: 'ai',
      });
      const trace = new UpscaleExecutionTrace(snapshot);
      const blob = await upscaleOnnxImage(file, config.id, undefined, trace);
      return await trace.finish(file, blob);
    }));
  }, examples);
  for (let i = 0; i < examples.length; i++) {
    if (parallel[i].effectiveModelId !== examples[i].id ||
        !parallel[i].modelGraphSha256 ||
        parallel[i].inferenceCalls < 1) {
      throw new Error('Concurrent ONNX session was swapped or released early: ' + JSON.stringify(parallel[i]));
    }
  }
  if (new Set(parallel.map(item => item.modelGraphSha256)).size !== 3) {
    throw new Error('Concurrent ONNX sessions were bound to duplicate graphs');
  }
  evidence.concurrent = parallel.map(item => ({
    jobId: item.jobId, effectiveModelId: item.effectiveModelId,
    modelResource: item.resource, modelGraphSha256: item.modelGraphSha256,
    outputSha256: item.outputSha256,
  }));
  console.log('PASS concurrent ONNX A/B/C model loads, execution leases and independent graph hashes');

  // The first Start click creates a pending model snapshot, even when a
  // low-memory warning needs manual confirmation. Changing the tier must
  // invalidate that previous confirmation instead of running the old request.
  const limited = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await limited.addInitScript(() => {
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 2 });
  });
  await limited.goto(origin, { waitUntil: 'domcontentloaded' });
  await limited.locator('[data-upscale-studio]').waitFor({ state: 'visible' });
  await limited.locator('[data-testid="upscale-file-input"]').setInputFiles({
    name: 'low-memory.png', mimeType: 'image/png', buffer: bytes,
  });
  await limited.locator('[data-upscale-studio] li').filter({ hasText: 'low-memory.png' })
    .getByText('준비 완료').waitFor({ state: 'visible', timeout: 20000 });
  await limited.getByRole('button', { name: 'low-memory.png 복원 시작' }).click();
  await limited.getByRole('alert').getByRole('button', { name: '그래도 실행' })
    .waitFor({ state: 'visible', timeout: 5000 });
  const limitedSlider = limited.getByRole('region', { name: '모델 수준' })
    .getByRole('slider', { name: 'AI 복원 등급' });
  await limitedSlider.focus();
  await limitedSlider.press('Home');
  await limited.getByRole('alert').getByRole('button', { name: '그래도 실행' })
    .waitFor({ state: 'hidden', timeout: 5000 });
  await limited.getByRole('button', { name: 'low-memory.png 복원 시작' }).click();
  await limited.getByRole('alert').getByRole('button', { name: '그래도 실행' })
    .click({ timeout: 5000 });
  const confirmed = await waitAndRecordDownload(limited, 'low-memory.png', 'quicksrnet-small-4x');
  evidence.warningConfirmation = {
    priorStartCancelledOnModelChange: true,
    confirmedJobId: confirmed.jobId,
    executedModel: confirmed.effectiveModelId,
    outputSha256: confirmed.digest,
  };
  await limited.close();
  console.log('PASS model change invalidates pending warning; confirmed job retains its own snapshot');

  if (errors.length) throw new Error('Browser errors: ' + errors.join(' | '));
  writeFileSync('identity-evidence.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log('PASS video A->B->C session/resource/frame/download identity');
  console.log('EVIDENCE:', JSON.stringify(evidence));
} finally {
  await browser?.close();
  rmSync(dir, { recursive: true, force: true });
}
