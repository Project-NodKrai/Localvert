import { chromium } from 'playwright';

const models = [
  ['quicksrnet-small-4x', 4],
  ['quicksrnet-medium-4x', 4],
  ['realesr-general-x4v3', 4],
  ['realesr-animevideov3', 4],
  ['realesrgan-x4plus-anime', 4],
  ['realesrgan-x4plus', 4],
  ['realesrgan-anime-4b32f', 4],
  ['swin2sr-lightweight-2x', 2],
  ['swin2sr-classical-4x', 4],
  ['swin2sr-realworld-4x', 4],
  ['swin2sr-compressed-4x', 4],
  ['realcugan-hfa2k-2x', 2],
  ['nomosuni-span-2x', 2],
  ['modernspanimation-2x', 2],
  ['purephoto-span-4x', 4],
  ['nomos2-hq-mosr-4x', 4],
  ['xlsr-4x', 4],
  ['quicksrnet-large-4x', 4],
  ['realplksr-2x', 2],
  ['realplksr-4x', 4],
];

// Allow extra time on CPU for transformer and RRDB models.
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('console', msg => { if (msg.type() === 'error') console.error('[browser]', msg.text()); });
page.on('pageerror', err => console.error('[pageerror]', err.message));

try {
  await page.goto('http://127.0.0.1:3000/upscale', { waitUntil: 'domcontentloaded', timeout: 30000 });
  for (const [id, scale] of models) {
    page.setDefaultTimeout(120_000);
    console.log('Smoke-checking ONNX model:', id);
    const result = await page.evaluate(async ({ modelId, expectedScale }) => {
      try {
        const { upscaleOnnxImage } = await import('/src/lib/upscalers/onnx.ts');
        const canvas = document.createElement('canvas');
        canvas.width = 5;
        canvas.height = 3;
        const context = canvas.getContext('2d');
        context.fillStyle = '#8040a0';
        context.fillRect(0, 0, 5, 3);
        context.fillStyle = '#20c080';
        context.fillRect(2, 1, 2, 2);
        const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!png) throw new Error('Fixture image creation failed');
        const source = new File([png], 'smoke.png', { type: 'image/png' });
        const output = await upscaleOnnxImage(source, modelId);
        const decoded = await createImageBitmap(output);
        const dims = [decoded.width, decoded.height];
        decoded.close();
        if (dims[0] !== 5 * expectedScale || dims[1] !== 3 * expectedScale) {
          throw new Error('Wrong output dimensions: ' + dims.join('x'));
        }
        if (output.type !== 'image/png' || output.size < 70) {
          throw new Error('Invalid PNG output: ' + output.type + ', ' + output.size + ' bytes');
        }
        return { passed: true, dimensions: dims, bytes: output.size };
      } catch (error) {
        return { passed: false, error: error instanceof Error ? error.stack || error.message : String(error) };
      }
    }, { modelId: id, expectedScale: scale });
    if (!result.passed) throw new Error(id + ': ' + result.error);
    console.log('PASS', id, result.dimensions.join('x'), result.bytes, 'bytes');
  }
} finally {
  await browser.close();
}
