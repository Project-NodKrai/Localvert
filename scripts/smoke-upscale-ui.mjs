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
  await page.locator('input[type="file"]').first().waitFor({ state: 'attached', timeout: 25000 });

  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 16;
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG encoder unavailable')), 'image/png');
    });
    const input = document.querySelector('input[type="file"]');
    if (!input) throw new Error('Missing image upload input');
    const items = new DataTransfer();
    items.items.add(new File([blob], 'smoke.png', { type: 'image/png' }));
    Object.defineProperty(input, 'files', { configurable: true, value: items.files });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await page.getByTitle('설정').waitFor({ state: 'visible', timeout: 20000 });
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
