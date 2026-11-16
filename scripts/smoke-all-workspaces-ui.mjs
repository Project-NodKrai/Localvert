import { chromium } from 'playwright';

let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const pngBytes = async page => Buffer.from(await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 24;
    const context = canvas.getContext('2d');
    context.fillStyle = '#2255cc';
    context.fillRect(0, 0, 32, 24);
    const blob = await new Promise((resolve, reject) => canvas.toBlob(
      result => result ? resolve(result) : reject(new Error('PNG fixture failed')), 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }));

  for (const width of [320, 390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: width === 1440 ? 900 : 780 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: '파일 변환', exact: true }).waitFor({ state: 'visible', timeout: 25000 });
    if (await page.locator('.lv-app:visible').evaluate(el => getComputedStyle(el).backgroundColor) !== 'rgb(247, 249, 253)') {
      throw new Error('Converter is not using the shared canvas background at ' + width);
    }
    if (await page.evaluate(() => document.documentElement.scrollWidth) > width + 1) {
      throw new Error('Converter horizontally overflows viewport ' + width);
    }
    const nav = page.getByRole('navigation', { name: '주요 기능' });
    for (const label of ['변환', '압축', '고화질 복원', '기능 안내']) {
      if (!await nav.getByRole('link', { name: label }).count()) throw new Error('Header missing ' + label);
    }
    await page.getByRole('button', { name: '파일 선택', exact: true }).waitFor({ state: 'visible' });
    await nav.getByRole('link', { name: '압축' }).click();
    await page.getByRole('heading', { name: '용량 압축' }).waitFor({ state: 'visible' });
    if (await page.evaluate(() => document.documentElement.scrollWidth) > width + 1) {
      throw new Error('Compressor horizontally overflows viewport ' + width);
    }
    await nav.getByRole('link', { name: '기능 안내' }).click();
    await page.getByRole('heading', { name: '기능 안내' }).waitFor({ state: 'visible' });
    if (await page.evaluate(() => document.documentElement.scrollWidth) > width + 1) {
      throw new Error('Details horizontally overflows viewport ' + width);
    }
    if (errors.length) throw new Error('Browser error at ' + width + ': ' + errors.join(' | '));
    await page.close();
  }

  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '파일 변환' }).waitFor({ state: 'visible', timeout: 25000 });
  const bytes = await pngBytes(page);
  await page.locator('[data-testid="convert-file-input"]').setInputFiles({
    name: 'source.png', mimeType: 'image/png', buffer: bytes,
  });
  await page.getByText('source.png').first().waitFor({ state: 'visible', timeout: 20000 });
  await page.getByRole('button', { name: '출력 형식 선택' }).first().click();
  await page.getByRole('group', { name: '출력 형식' }).getByRole('button', { name: 'JPG' }).click();
  await page.getByRole('button', { name: '출력 형식 선택' }).first().getByText('JPG').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'source.png 변환 시작' }).click();
  await page.getByRole('link', { name: '다운로드' }).waitFor({ state: 'visible', timeout: 35000 });
  await page.getByRole('button', { name: '파일 추가' }).click();
  await page.locator('#lv-add-more-convert').setInputFiles({
    name: 'second.png', mimeType: 'image/png', buffer: bytes,
  });
  await page.getByText('second.png').waitFor({ state: 'visible', timeout: 20000 });

  await page.getByRole('navigation', { name: '주요 기능' }).getByRole('link', { name: '압축' }).click();
  await page.getByRole('heading', { name: '용량 압축' }).waitFor({ state: 'visible' });
  await page.locator('[data-testid="compress-file-input"]').setInputFiles({
    name: 'compress.png', mimeType: 'image/png', buffer: bytes,
  });
  await page.getByText('compress.png').first().waitFor({ state: 'visible', timeout: 20000 });
  await page.getByRole('button', { name: 'compress.png 설정' }).click();
  const dialog = page.getByRole('dialog', { name: '고급 압축 설정' });
  await dialog.waitFor({ state: 'visible' });
  await dialog.getByRole('button', { name: '고급', exact: true }).click();
  if (await dialog.getByRole('button', { name: '고급', exact: true }).getAttribute('aria-pressed') !== 'true') {
    throw new Error('Advanced settings selection is not accessible');
  }
  await dialog.getByText('출력 형식').waitFor({ state: 'visible' });
  await dialog.getByRole('button', { name: '적용완료' }).click();
  await dialog.waitFor({ state: 'hidden' });

  // Persistent workspaces preserve the converter queue when switching tools.
  await page.getByRole('navigation', { name: '주요 기능' }).getByRole('link', { name: '변환' }).click();
  await page.getByText('second.png').waitFor({ state: 'visible' });
  await page.getByRole('navigation', { name: '주요 기능' }).getByRole('link', { name: '고화질 복원' }).click();
  await page.locator('[data-upscale-studio]').waitFor({ state: 'visible', timeout: 25000 });
  await page.getByRole('region', { name: '모델 수준' }).waitFor({ state: 'visible' });
  if (errors.length) throw new Error('Browser errors: ' + errors.join(' | '));
  console.log('PASS shared white-blue design: 320/390/1440 layouts, convert+compress+details+upscale, format picker, actual PNG conversion, advanced settings, persistent jobs');
} finally {
  await browser?.close();
}
