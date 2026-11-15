import { chromium } from 'playwright';

let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.addInitScript(() => {
    // Simulate a low-memory handset to exercise the advice UI without running
    // computationally expensive inference on the CI runner.
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 2 });
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:3000/upscale', { waitUntil: 'domcontentloaded' });
  // Workspaces mount only after the asynchronous IndexedDB initialization.
  // Converter/Compressor/Upscaler all remain mounted to preserve queued jobs.
  // Select the actual /upscale input, not the first hidden workspace's input.
  await page.locator('input[type="file"]').first().waitFor({ state: 'attached', timeout: 25000 });
  const uploadIndex = await page.locator('input[type="file"]').evaluateAll(inputs =>
    inputs.findIndex(input => !input.closest('[hidden]')));
  if (uploadIndex < 0) throw new Error('Visible upscaler file input not found');

  const pixels = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 16;
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG encoder unavailable')), 'image/png');
    });
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  // Use a genuine browser file input event; assigning input.files by hand
  // does not reliably trigger React's file-change handling.
  await page.locator('input[type="file"]').nth(uploadIndex).setInputFiles({
    name: 'smoke.png', mimeType: 'image/png', buffer: Buffer.from(pixels),
  });
  try {
    await page.getByTitle('설정').waitFor({ state: 'visible', timeout: 20000 });
  } catch (error) {
    console.error('UI upload state:', (await page.locator('body').innerText()).slice(0, 3000));
    console.error('Browser exceptions:', errors);
    throw error;
  }

  await page.getByTitle('설정').click();

  const trigger = page.getByRole('button', { name: /Standard \(실사\)/ });
  await trigger.waitFor({ state: 'visible' });
  await trigger.click();
  const sheet = page.getByRole('dialog', { name: '복원 모델 선택' });
  await sheet.waitFor({ state: 'visible' });

  const box = await sheet.boundingBox();
  if (!box || box.x < -1 || box.x + box.width > 391) {
    throw new Error('Bottom sheet overflows the mobile viewport: ' + JSON.stringify(box));
  }
  await sheet.getByTitle('용도 변경').click();
  await sheet.getByRole('button', { name: '일러스트', exact: true }).click();
  const slider = sheet.getByRole('slider', { name: 'AI 복원 등급' });
  await slider.focus();
  await slider.press('ArrowRight');

  await page.getByRole('alert').getByText(/메모리/).first().waitFor({ state: 'visible', timeout: 5000 });
  if (await sheet.getByText('권장 범위').count()) {
    throw new Error('Specification warnings must not be pinned inside the sheet');
  }
  await sheet.getByRole('button', { name: '완료', exact: true }).click();
  await sheet.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '적용완료' }).click();

  await page.getByTitle('시작').click();
  const snackbar = page.getByRole('alert');
  await snackbar.getByRole('button', { name: '그래도 실행' }).waitFor({ state: 'visible', timeout: 6000 });
  if (await page.getByRole('alertdialog').count()) throw new Error('Old blocking warning dialog is still mounted');
  await snackbar.getByRole('button', { name: '취소' }).click();
  await snackbar.waitFor({ state: 'hidden' });
  if (errors.length) throw new Error('React/browser error(s): ' + errors.join(' | '));
  console.log('PASS mobile sheet, purpose chevron, tier slider, transient warning, nonmodal confirmation, cancel');
} finally {
  await browser?.close();
}
