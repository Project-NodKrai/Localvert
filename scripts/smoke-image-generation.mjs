import { chromium } from 'playwright';

let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  for (const width of [320, 390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: width === 1440 ? 900 : 770 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:3000/generate', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: '이미지 생성', exact: true }).waitFor({ state: 'visible', timeout: 25000 });
    const levels = page.getByRole('group', { name: '이미지 생성 수준' });
    for (const level of ['Instant', 'Medium', 'High']) {
      await levels.getByRole('button', { name: level }).waitFor({ state: 'visible' });
    }
    if (await page.getByRole('group', { name: '이미지 생성 실행 환경' }).count()) {
      throw new Error('Unexpected backend execution switch');
    }
    if (await page.locator('#gen-endpoint').count() || await page.locator('input[aria-label*="워크플로"]').count()) {
      throw new Error('Legacy server connection UI remains');
    }
    if (!await page.locator('#gen-model option[value="sana-sprint-06b"]').count()) {
      throw new Error('Instant SANA-Sprint 0.6B is missing from the catalogue');
    }
    const scrollbarWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    if (scrollbarWidth > width + 1) throw new Error(width + 'px horizontal overflow ' + scrollbarWidth);
    if (errors.length) throw new Error('Page errors at ' + width + ': ' + errors.join(' | '));
    await page.close();
  }

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  const backendCalls = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (/^https?:\/\/(?:localhost|127\.0\.0\.1):8188(?:\/|$)/.test(request.url())) {
      backendCalls.push(request.url());
    }
  });
  await page.addInitScript(() => {
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
        if (!String(url).includes('flux2-stage.js')) throw Error('Unexpected worker: ' + url);
      }
      postMessage({ requestId, stage, payload }) {
        queueMicrotask(() => {
          let data;
          if (stage === 'encode') data = new Float32Array(512 * 7680).buffer;
          else if (stage === 'denoise') data = payload.latent;
          else if (stage === 'decode') {
            const plane = payload.width * payload.height;
            const px = new Uint8ClampedArray(plane * 4);
            const noise = Math.abs(new Float32Array(payload.latent)[0]);
            const red = Math.max(1, Math.floor(noise * 1000000) % 254);
            for (let i = 0; i < plane; i++) {
              px[i * 4] = red;
              px[i * 4 + 1] = 140;
              px[i * 4 + 2] = 190;
              px[i * 4 + 3] = 255;
            }
            data = px.buffer;
          } else throw Error('Unknown stage: ' + stage);
          this.onmessage?.({
            data: { requestId, type: 'result', data, shape: stage === 'encode' ? [1, 512, 7680] : undefined },
          });
        });
      }
      terminate() {}
    }
    globalThis.Worker = MockWebGpuWorker;
  });
  await page.goto('http://127.0.0.1:3000/generate', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '이미지 생성', exact: true }).waitFor({ state: 'visible' });
  if (!await page.locator('#gen-model').inputValue().then(value => value === 'sana-sprint-06b')) {
    throw Error('Instant must default to SANA-Sprint 0.6B');
  }
  await page.locator('#gen-prompt').fill('A calm moonlit hillside');
  await page.getByRole('checkbox', { name: /대용량 모델 다운로드/ }).check();
  if (!await page.getByRole('button', { name: '이미지 생성', exact: true }).isDisabled()) {
    throw Error('Unconverted SANA-Sprint checkpoint incorrectly marked as browser-ready');
  }

  await page.getByRole('group', { name: '이미지 생성 수준' }).getByRole('button', { name: 'Medium' }).click();
  await page.locator('#gen-model').selectOption('flux2-klein-4b');
  await page.locator('#gen-prompt').fill('A blue flower in moonlight');
  await page.getByRole('checkbox', { name: /대용량 모델 다운로드/ }).check();
  const advanced = page.locator('details').filter({ has: page.locator('summary').getByText('생성 설정') });
  await advanced.locator('summary').click();
  await advanced.getByRole('checkbox', { name: 'Random Seed' }).uncheck();
  await advanced.getByRole('spinbutton', { name: 'Seed' }).fill('77');
  await advanced.getByRole('spinbutton', { name: 'Batch Count' }).fill('2');
  await page.getByRole('button', { name: '이미지 생성', exact: true }).click();
  await page.getByText('생성 완료').waitFor({ state: 'visible', timeout: 20000 });
  if (await page.locator('.gen-result').count() !== 2) {
    throw Error('Two sequential local browser jobs should have two image results');
  }
  if (backendCalls.length) throw Error('Unexpected external inference endpoint request: ' + backendCalls);
  const digests = await page.locator('.gen-result a[download]').evaluateAll(async anchors => {
    const result = [];
    for (const a of anchors) {
      if (!a.href.startsWith('blob:')) throw Error('Generated result is not a Blob URL');
      const bytes = await (await fetch(a.href)).arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      result.push([...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join(''));
    }
    return result;
  });
  if (new Set(digests).size !== 2) throw Error('Generated results incorrectly share identical bytes');
  if (errors.length) throw Error('Browser errors: ' + errors.join(' | '));
  await page.close();
  console.log('PASS browser-only UI, preserved levels, truthful SANA-Sprint availability, isolated mocked WebGPU worker jobs, distinct blobs. Real model inference NOT tested.');
} finally {
  await browser?.close();
}
