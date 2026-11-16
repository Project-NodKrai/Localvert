import { chromium } from 'playwright';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const dir = mkdtempSync(join(tmpdir(), 'localvert-mixed-ui-'));
const videoPath = join(dir, 'smoke.mp4');
let browser;
try {
  const ffmpeg = spawnSync('ffmpeg', [
    '-hide_banner','-loglevel','error','-y',
    '-f','lavfi','-i','color=c=blue:s=48x32:r=4:d=0.5',
    '-c:v','libx264','-pix_fmt','yuv420p','-an','-movflags','+faststart',videoPath,
  ], { encoding: 'utf8', timeout: 30000 });
  if (ffmpeg.status !== 0) throw new Error('Cannot build MP4 fixture: ' + (ffmpeg.stderr || ffmpeg.error?.message));
  const movie = readFileSync(videoPath);

  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 2 });
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') console.error('Console:', message.text().slice(0, 400));
  });
  await page.goto('http://127.0.0.1:3000/upscale', { waitUntil: 'domcontentloaded' });
  const root = page.locator('[data-upscale-studio]');
  await root.waitFor({ state: 'visible', timeout: 25000 });
  const background = await root.evaluate(element => getComputedStyle(element).backgroundColor);
  if (background !== 'rgb(247, 249, 253)') throw new Error('Concept-2 light styling was removed');
  if (await page.getByRole('navigation', { name: '고화질 복원 내비게이션' }).count()) throw new Error('Sidebar still exists');
  if (await page.getByText('향상 설정').count()) throw new Error('Fixed model settings card still exists');

  const segment = root.getByRole('group', { name: '복원 파일 종류' });
  for (const name of ['이미지', '동영상', '혼합']) await segment.getByRole('button', { name }).waitFor({ state: 'visible' });
  const dock = page.getByRole('region', { name: '모델 수준' });
  await dock.waitFor({ state: 'visible' });
  const dockBox = await dock.boundingBox();
  if (!dockBox || dockBox.y < 570 || dockBox.y + dockBox.height > 845) {
    throw new Error('Bottom level dock is misplaced: ' + JSON.stringify(dockBox));
  }
  await dock.getByRole('button', { name: '모델 상세 설정', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: '품질 수준 선택' });
  await sheet.waitFor({ state: 'visible' });
  const sheetBox = await sheet.boundingBox();
  if (!sheetBox || sheetBox.x < -1 || sheetBox.x + sheetBox.width > 391) throw new Error('Sheet overflows viewport');
  await sheet.getByTitle('용도 변경').click();
  await sheet.getByRole('button', { name: '일러스트', exact: true }).first().click();
  await sheet.getByRole('button', { name: '이 모델로 적용하기' }).click();
  await sheet.waitFor({ state: 'hidden' });
  const grip = dock.getByRole('button', { name: '모델 상세 설정 펼치기' });
  const g = await grip.boundingBox();
  if (!g) throw new Error('Swipe grip not rendered');
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2, g.y - 75, { steps: 8 });
  await page.mouse.up();
  await sheet.waitFor({ state: 'visible' });
  await sheet.getByRole('button', { name: '모델 선택 닫기' }).click();

  await segment.getByRole('button', { name: '혼합', exact: true }).click();
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 16;
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG encoding failed')), 'image/png');
    });
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  const input = page.locator('[data-testid="upscale-file-input"]');
  const accept = await input.getAttribute('accept');
  if (!accept?.includes('video/*') || !accept.includes('image/*')) throw new Error('Mixed chooser does not accept both media');
  await input.setInputFiles([
    { name: 'smoke.png', mimeType: 'image/png', buffer: Buffer.from(bytes) },
    { name: 'smoke.mp4', mimeType: 'video/mp4', buffer: movie },
  ]);
  await root.getByText('smoke.png').waitFor({ state: 'visible' });
  await root.getByText('smoke.mp4').waitFor({ state: 'visible' });
  await root.getByText('준비 완료').first().waitFor({ state: 'visible', timeout: 20000 });
  await segment.getByRole('button', { name: '이미지', exact: true }).click();
  if (await root.getByText('smoke.mp4').count()) throw new Error('Image tab incorrectly displays video task');
  await segment.getByRole('button', { name: '동영상', exact: true }).click();
  if (await root.getByText('smoke.png').count()) throw new Error('Video tab incorrectly displays image task');
  await segment.getByRole('button', { name: '혼합', exact: true }).click();

  const slider = dock.getByRole('slider', { name: 'AI 복원 등급' });
  await slider.focus();
  await slider.press('ArrowLeft');
  const label = await dock.getByRole('button', { name: '모델 상세 설정', exact: true }).innerText();
  if (!label.includes('Lite (혼합)')) throw new Error('Shared mixed tier did not update both models: ' + label);
  await page.getByRole('alert').getByText(/메모리/).first().waitFor({ state: 'visible', timeout: 7000 });

  await dock.getByRole('button', { name: '모델 상세 설정', exact: true }).click();
  await sheet.getByRole('group', { name: '혼합 모델 종류' }).getByRole('button', { name: '동영상 모델' }).click();
  await sheet.getByText(/사용 모델 · Lite \(동영상\)/).waitFor({ state: 'visible' });
  await sheet.getByRole('group', { name: '혼합 모델 종류' }).getByRole('button', { name: '이미지 모델' }).click();
  await sheet.getByRole('button', { name: '이 모델로 적용하기' }).click();

  await root.getByRole('button', { name: '복원 시작', exact: true }).click();
  const snackbar = page.getByRole('alert');
  await snackbar.getByRole('button', { name: '그래도 실행' }).waitFor({ state: 'visible', timeout: 7000 });
  await snackbar.getByRole('button', { name: '취소' }).click();
  await snackbar.waitFor({ state: 'hidden' });
  if (errors.length) throw new Error('Browser errors: ' + errors.join(' | '));

  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await desktop.goto('http://127.0.0.1:3000/upscale', { waitUntil: 'domcontentloaded' });
  await desktop.locator('[data-upscale-studio]').waitFor({ state: 'visible', timeout: 25000 });
  if (await desktop.getByRole('navigation', { name: '고화질 복원 내비게이션' }).count()) {
    throw new Error('Desktop sidebar still mounted');
  }
  await desktop.getByRole('region', { name: '모델 수준' }).waitFor({ state: 'visible' });
  await desktop.getByRole('button', { name: '모델 상세 설정', exact: true }).click();
  await desktop.getByRole('dialog', { name: '품질 수준 선택' }).waitFor({ state: 'visible' });

  const narrow = await browser.newPage({ viewport: { width: 320, height: 640 }, isMobile: true });
  await narrow.goto('http://127.0.0.1:3000/upscale', { waitUntil: 'domcontentloaded' });
  await narrow.locator('[data-upscale-studio]').waitFor({ state: 'visible', timeout: 25000 });
  const scrollWidth = await narrow.evaluate(() => document.documentElement.scrollWidth);
  if (scrollWidth > 321) throw new Error('Horizontal overflow at 320px: ' + scrollWidth);
  console.log('PASS white-blue upscale studio: 3-way media tabs, mixed real media, compact bottom dock, swipe/detail, snackbar, 320px mobile and desktop');
} finally {
  await browser?.close();
  rmSync(dir, { recursive: true, force: true });
}
