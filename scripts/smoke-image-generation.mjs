import { chromium } from 'playwright';

const workflow = {
  '1': { class_type: 'CheckpointLoaderSimple', inputs: {
    ckpt_name: 'flux2-klein-4b-fp8.safetensors',
  } },
  '2': { class_type: 'CLIPTextEncode', inputs: {
    text: 'original prompt', clip: ['1', 1],
  } },
  '5': { class_type: 'CLIPTextEncode', inputs: {
    text: 'original negative', clip: ['1', 1],
  } },
  '3': { class_type: 'KSampler', inputs: {
    positive: ['2', 0], negative: ['5', 0],
    seed: 42, steps: 80, cfg: 12, sampler_name: 'euler', scheduler: 'normal',
  } },
  '4': { class_type: 'EmptyLatentImage', inputs: {
    width: 512, height: 512, batch_size: 1,
  } },
  '6': { class_type: 'SaveImage', inputs: {
    images: ['3', 0], filename_prefix: 'Test',
  } },
};

let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  for (const width of [320, 390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: width === 1440 ? 900 : 770 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:3000/generate', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: '이미지 생성', exact: true }).waitFor({ state: 'visible', timeout: 25000 });
    const group = page.getByRole('group', { name: '이미지 생성 수준' });
    for (const item of ['Instant', 'Medium', 'High']) {
      await group.getByRole('button', { name: item }).waitFor({ state: 'visible' });
    }
    const scrollbarWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    if (scrollbarWidth > width + 1) {
      throw new Error(width + 'px horizontal overflow ' + scrollbarWidth);
    }
    if (errors.length) throw new Error('Page errors at ' + width + ': ' + errors.join(' | '));
    await page.close();
  }

  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors = [];
  const submissions = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:3000/generate', { waitUntil: 'domcontentloaded' });
  const bytes = Buffer.from(await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 20; canvas.height = 20;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#336bd1'; ctx.fillRect(0, 0, 20, 20);
    const blob = await new Promise((resolve, reject) =>
      canvas.toBlob(item => item ? resolve(item) : reject(new Error('PNG fixture failed')), 'image/png'));
    return [...new Uint8Array(await blob.arrayBuffer())];
  }));

  await page.route('http://127.0.0.1:8188/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
    };
    if (req.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
    } else if (url.pathname === '/system_stats') {
      await route.fulfill({ status: 200, headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ system: { comfyui_version: 'test' } }) });
    } else if (url.pathname === '/prompt' && req.method() === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      submissions.push(body);
      await route.fulfill({ status: 200, headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ prompt_id: 'prompt-' + submissions.length }) });
    } else if (url.pathname.startsWith('/history/')) {
      const promptId = url.pathname.split('/')[2];
      await route.fulfill({ status: 200, headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({
          [promptId]: {
            status: { status_str: 'success', completed: true },
            outputs: { '6': { images: [{ filename: promptId + '.png', subfolder: '', type: 'output' }] } },
          },
        }) });
    } else if (url.pathname === '/view') {
      await route.fulfill({ status: 200, headers: { ...headers, 'content-type': 'image/png' },
        body: bytes });
    } else {
      await route.fulfill({ status: 404, headers });
    }
  });
  await page.getByRole('heading', { name: '이미지 생성' }).waitFor({ state: 'visible' });
  await page.getByRole('group', { name: '이미지 생성 실행 환경' }).getByRole('button', { name: 'ComfyUI' }).click();
  await page.getByRole('group', { name: '이미지 생성 수준' }).getByRole('button', { name: 'Medium' }).click();
  await page.locator('#gen-model').selectOption('flux2-klein-4b');
  await page.locator('#gen-prompt').fill('A bright lunar observatory');
  await page.getByRole('button', { name: '16:9' }).click();
  const advanced = page.locator('details').filter({ has: page.locator('summary').getByText('생성 설정') });
  await advanced.locator('summary').click();
  await advanced.getByRole('checkbox', { name: 'Random Seed' }).uncheck();
  await advanced.getByRole('spinbutton', { name: 'Seed' }).fill('123');
  await page.locator('input[aria-label="ComfyUI API 워크플로 JSON 업로드"]').setInputFiles({
    name: 'comfy-api.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(workflow)),
  });
  await page.getByText(/체크포인트 파일명 일치/).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '연결 확인' }).click();
  await page.getByText('연결됨').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '이미지 생성', exact: true }).click();
  await page.getByText('생성 완료').waitFor({ state: 'visible', timeout: 18000 });
  const result = page.locator('.gen-result');
  await result.first().waitFor({ state: 'visible' });
  if (!await result.first().locator('img').evaluate(img => img.complete && img.naturalWidth > 0)) {
    throw new Error('Generated image is not decoded in the results gallery');
  }
  if (submissions.length !== 1) throw new Error('Expected one actual prompt submission, saw ' + submissions.length);
  const first = submissions[0].prompt;
  if (first['1'].inputs.ckpt_name !== 'flux2-klein-4b-fp8.safetensors' ||
      first['2'].inputs.text !== 'A bright lunar observatory' ||
      first['3'].inputs.seed !== 123 || first['3'].inputs.steps !== 4 ||
      first['3'].inputs.cfg !== 1 ||
      first['4'].inputs.width !== 1344 || first['4'].inputs.height !== 768) {
    throw new Error('Mismatch between selected UI values and executed API workflow: ' + JSON.stringify(first));
  }
  await page.getByRole('button', { name: '이미지 생성', exact: true }).click();
  await page.locator('.gen-result').nth(1).waitFor({ state: 'visible', timeout: 18000 });
  if (submissions.length !== 2 || submissions[1].prompt['3'].inputs.seed !== 123) {
    throw new Error('Second run reused a pending workflow or changed fixed seed');
  }
  const links = await page.locator('.gen-result a[download]').evaluateAll(anchors =>
    anchors.map(anchor => anchor.getAttribute('href')));
  if (new Set(links).size !== 2 || links.some(link => !link?.startsWith('blob:'))) {
    throw new Error('Two completed jobs share a stale output Blob URL: ' + JSON.stringify(links));
  }
  const blobs = await page.locator('.gen-result a[download]').evaluateAll(async links => {
    const hashes = [];
    for (const link of links) {
      const blob = await (await fetch(link.href)).blob();
      const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
      hashes.push(Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join(''));
    }
    return hashes;
  });
  if (blobs.length !== 2 || blobs[0] !== blobs[1]) throw new Error('Result fixture hash mismatch');
  await page.getByRole('group', { name: '이미지 생성 수준' }).getByRole('button', { name: 'High' }).click();
  if (!await page.getByRole('button', { name: '이미지 생성', exact: true }).isDisabled()) {
    throw new Error('Model mismatch was not blocked');
  }
  if (errors.length) throw new Error('Browser errors: ' + errors.join(' | '));

  // Independent browser-engine wiring smoke. Workers are mocked; real ONNX weights
  // are NOT loaded by this test. This verifies local job routing and Blob identity.
  const nativePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await nativePage.addInitScript(() => {
    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: {
        requestAdapter: async () => ({
          features: new Set(['shader-f16']),
          limits: { maxBufferSize: 4294967296 },
        }),
      },
    });
    class MockWebGpuWorker {
      onmessage = null;
      onerror = null;
      constructor(url) {
        if (!String(url).includes('/workers/flux2-stage.js')) throw new Error('Wrong worker script');
      }
      postMessage({ requestId, stage, payload }) {
        queueMicrotask(() => {
          let data;
          if (stage === 'encode') data = new Float32Array(512 * 7680).buffer;
          else if (stage === 'denoise') data = payload.latent;
          else if (stage === 'decode') {
            const size = payload.width * payload.height;
            const result = new Uint8ClampedArray(size * 4);
            const source = Math.abs(new Float32Array(payload.latent)[0]);
            const shade = Math.max(1, Math.floor((source * 1e6) % 254));
            for (let i = 0; i < size; i++) {
              result[i * 4] = shade;
              result[i * 4 + 1] = 150;
              result[i * 4 + 2] = 200;
              result[i * 4 + 3] = 255;
            }
            data = result.buffer;
          }
          if (this.onmessage) this.onmessage({
            data: { requestId, type: 'result', data, shape: stage === 'encode' ? [1,512,7680] : undefined },
          });
        });
      }
      terminate() {}
    }
    globalThis.Worker = MockWebGpuWorker;
  });
  const localCalls = [];
  nativePage.on('request', request => {
    if (request.url().startsWith('http://127.0.0.1:8188')) localCalls.push(request.url());
  });
  await nativePage.goto('http://127.0.0.1:3000/generate', { waitUntil: 'domcontentloaded' });
  await nativePage.getByRole('heading', { name: '이미지 생성' }).waitFor({ state: 'visible' });
  await nativePage.getByRole('group', { name: '이미지 생성 수준' }).getByRole('button', { name: 'Medium' }).click();
  await nativePage.locator('#gen-model').selectOption('flux2-klein-4b');
  await nativePage.locator('#gen-prompt').fill('A blue flower in moonlight');
  await nativePage.getByRole('checkbox', { name: /대용량 모델 다운로드/ }).check();
  const nativeAdvanced = nativePage.locator('details').filter({ has: nativePage.locator('summary').getByText('생성 설정') });
  await nativeAdvanced.locator('summary').click();
  await nativeAdvanced.getByRole('checkbox', { name: 'Random Seed' }).uncheck();
  await nativeAdvanced.getByRole('spinbutton', { name: 'Seed' }).fill('77');
  await nativeAdvanced.getByRole('spinbutton', { name: 'Batch Count' }).fill('2');
  await nativePage.getByRole('button', { name: '이미지 생성', exact: true }).click();
  await nativePage.getByText('생성 완료').waitFor({ state: 'visible', timeout: 20000 });
  if (await nativePage.locator('.gen-result').count() !== 2) throw new Error('WebGPU mode did not emit two independent image results');
  if (localCalls.length) throw new Error('Browser mode attempted to contact ComfyUI: ' + localCalls.join(', '));
  const nativeHashes = await nativePage.locator('.gen-result a[download]').evaluateAll(async anchors => {
    const hashes = [];
    for (const a of anchors) {
      const bytes = await (await fetch(a.href)).arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      hashes.push([...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join(''));
    }
    return hashes;
  });
  if (new Set(nativeHashes).size !== 2) throw new Error('Browser mode reused the previous generated Blob bytes');
  await nativePage.close();

  console.log('PASS 320/390/1440 responsive layout, Instant/Medium/High, local API workflow, seed/steps/cfg/dimensions, 2 independent job Blobs, mismatch blocking');
  console.log('PASS browser WebGPU UI wiring, explicit download consent, mocked-worker generation and job-specific Blob output (no weights tested)');
} finally {
  await browser?.close();
}
