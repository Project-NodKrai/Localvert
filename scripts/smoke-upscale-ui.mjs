import { chromium } from 'playwright';

let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 2 });
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') console.error('Browser console:', message.text().slice(0, 500));
  });
  await page.goto('http://127.0.0.1:3000/upscale', { waitUntil: 'domcontentloaded' });
  const root = page.locator('[data-upscale-studio="true"]');
  await root.waitFor({ state: 'visible', timeout: 25000 });
  const background = await root.evaluate(element => getComputedStyle(element).backgroundColor);
  if (background !== 'rgb(247, 249, 253)') throw new Error('Not using concept-2 light theme: ' + background);

  await page.getByRole('button', { name: '품질 수준 선택' }).click();
  const sheet = page.getByRole('dialog', { name: '품질 수준 선택' });
  await sheet.waitFor({ state: 'visible' });
  const box = await sheet.boundingBox();
  if (!box || box.x < -1 || box.x + box.width > 391) throw new Error('Mobile sheet viewport overflow');
  await sheet.getByTitle('용도 변경').click();
  await sheet.getByRole('button', { name: '일러스트', exact: true }).first().click();
  const slider = sheet.getByRole('slider', { name: 'AI 복원 등급' });
  await slider.focus();
  await slider.press('ArrowRight');
  await sheet.getByRole('button', { name: '이 모델로 적용하기' }).click();
  await sheet.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '세부 모델 선택' }).click();
  await sheet.waitFor({ state: 'visible' });
  await sheet.getByRole('button', { name: '이 모델로 적용하기' }).click();
  await sheet.waitFor({ state: 'hidden' });

  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 16;
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG encode failed')), 'image/png');
    });
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await page.locator('[data-testid="upscale-file-input"]').setInputFiles({
    name: 'smoke.png', mimeType: 'image/png', buffer: Buffer.from(bytes),
  });
  await page.getByText('smoke.png').waitFor({ state: 'visible', timeout: 20000 });
  await root.getByText('준비 완료').waitFor({ state: 'visible', timeout: 20000 });

  await page.getByRole('button', { name: '품질 수준 선택' }).click();
  await sheet.getByRole('button', { name: 'Pro', exact: true }).click();
  await page.getByRole('alert').getByText(/메모리/).first().waitFor({ state: 'visible', timeout: 8000 });
  if (await sheet.getByText('권장 범위').count()) throw new Error('Resource warning pinned in model sheet');
  await sheet.getByRole('button', { name: '이 모델로 적용하기' }).click();

  await page.getByRole('button', { name: '복원 시작', exact: true }).click();
  const snackbar = page.getByRole('alert');
  await snackbar.getByRole('button', { name: '그래도 실행' }).waitFor({ state: 'visible', timeout: 8000 });
  if (await page.getByRole('alertdialog').count()) throw new Error('Old blocking alert dialog mounted');
  await snackbar.getByRole('button', { name: '취소' }).click();
  await snackbar.waitFor({ state: 'hidden' });
  if (errors.length) throw new Error('Mobile React errors: ' + errors.join(' | '));

  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await desktop.goto('http://127.0.0.1:3000/upscale', { waitUntil: 'domcontentloaded' });
  await desktop.locator('[data-upscale-studio]').waitFor({ state: 'visible', timeout: 25000 });
  await desktop.getByRole('navigation', { name: '고화질 복원 내비게이션' }).waitFor({ state: 'visible' });
  await desktop.getByRole('button', { name: '품질 수준 선택' }).click();
  const dSheet = desktop.getByRole('dialog', { name: '품질 수준 선택' });
  await dSheet.waitFor({ state: 'visible' });
  const dBounds = await dSheet.boundingBox();
  if (!dBounds || dBounds.width < 600 || dBounds.x + dBounds.width > 1441) {
    throw new Error('Desktop bottom sheet position or width is incorrect: ' + JSON.stringify(dBounds));
  }
  console.log('PASS concept-2 light theme desktop/mobile, model sheet, tier/purpose, real upload, snackbar and cancel');
} finally {
  await browser?.close();
}
