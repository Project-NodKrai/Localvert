/**
 * Prepare pinned model binaries as same-origin static assets for the local Vite
 * dev server and deployed GitHub Pages. Original photos never leave the browser.
 *
 * Qualcomm's official S3 endpoint does not send Access-Control-Allow-Origin;
 * downloading once on the build host avoids CORS-based model load failures.
 */
import JSZip from 'jszip';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const outputDir = join(process.cwd(), 'public', 'models');
const upstream = 'https://raw.githubusercontent.com/ningtoba/Browsersnip-Upscale/8e7094416ad91ec7477e968d348cd78742e20dc6/public/models/';
const qBase = 'https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/';

const models = [
  { name: 'quicksrnet-small-4x.onnx', url: qBase + 'quicksrnetsmall/releases/v0.63.0/quicksrnetsmall-onnx-float.zip', zipped: true, dataName: 'quicksrnetsmall.data' },
  { name: 'quicksrnet-medium-4x.onnx', url: qBase + 'quicksrnetmedium/releases/v0.63.0/quicksrnetmedium-onnx-float.zip', zipped: true, dataName: 'quicksrnetmedium.data' },
  { name: 'realesr-general-x4v3.onnx', url: upstream + 'realesr-general-x4v3.onnx', zipped: false },
  { name: 'realesr-animevideov3.onnx', url: upstream + 'realesr-animevideov3.onnx', zipped: false },
  { name: 'realesrgan-x4plus-anime.onnx', url: upstream + 'realesrgan-x4plus-anime.onnx', zipped: false },
  { name: 'realesrgan-x4plus.onnx', url: 'https://huggingface.co/SceneWorks/real-esrgan-onnx/resolve/main/real_esrgan_x4.onnx', zipped: false },
  { name: 'realesrgan-anime-4b32f.onnx', url: 'https://huggingface.co/deepghs/imgutils-models/resolve/main/real_esrgan/RealESRGAN_x4plus_anime_4B32F.onnx', zipped: false },
  { name: 'swin2sr-lightweight-2x.onnx', url: 'https://huggingface.co/Xenova/swin2SR-lightweight-x2-64/resolve/main/onnx/model.onnx', zipped: false },
  { name: 'swin2sr-classical-4x.onnx', url: 'https://huggingface.co/Xenova/swin2SR-classical-sr-x4-64/resolve/main/onnx/model.onnx', zipped: false },
  { name: 'swin2sr-realworld-4x.onnx', url: 'https://huggingface.co/Xenova/swin2SR-realworld-sr-x4-64-bsrgan-psnr/resolve/main/onnx/model.onnx', zipped: false },
  { name: 'swin2sr-compressed-4x.onnx', url: 'https://huggingface.co/Xenova/swin2SR-compressed-sr-x4-48/resolve/main/onnx/model.onnx', zipped: false },
  { name: 'realcugan-hfa2k-2x.onnx', url: 'https://huggingface.co/nesaorg/2xHFA2kReal-CUGAN_fp32_opset17/resolve/main/2xHFA2kReal-CUGAN_fp32_opset17.onnx', zipped: false },
  { name: 'nomosuni-span-2x.onnx', url: 'https://huggingface.co/kortique/photoview-ai-models/resolve/main/permissive/nomosuni_span_x2.onnx', zipped: false },
  { name: 'modernspanimation-2x.onnx', url: 'https://huggingface.co/kortique/photoview-ai-models/resolve/main/permissive/2x_ModernSpanimationV1.onnx', zipped: false },
  { name: 'xlsr-4x.onnx', url: qBase + 'xlsr/releases/v0.63.0/xlsr-onnx-float.zip', zipped: true, dataName: 'xlsr.data' },
  { name: 'quicksrnet-large-4x.onnx', url: qBase + 'quicksrnetlarge/releases/v0.63.0/quicksrnetlarge-onnx-float.zip', zipped: true, dataName: 'quicksrnetlarge.data' },
  { name: 'realplksr-2x.onnx', url: 'https://huggingface.co/darktable-org/upscale-realplksr-onnx/resolve/main/onnx/model_x2.onnx', zipped: false },
  { name: 'realplksr-4x.onnx', url: 'https://huggingface.co/darktable-org/upscale-realplksr-onnx/resolve/main/onnx/model_x4.onnx', zipped: false },
];

async function download(source) {
  const response = await fetch(source, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(source + ': HTTP ' + response.status);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength < 1000) throw new Error(source + ': model download unexpectedly small');
  return bytes;
}

await mkdir(outputDir, { recursive: true });
for (const spec of models) {
  const destination = join(outputDir, spec.name);
  try {
    const existing = await stat(destination);
    let dataReady = true;
    if (spec.dataName) {
      try { dataReady = (await stat(join(outputDir, spec.dataName))).size > 1000; }
      catch { dataReady = false; }
    }
    if (existing.size > 1000 && dataReady) {
      console.log('[model assets] cached:', spec.name, existing.size, 'bytes');
      continue;
    }
  } catch {}

  console.log('[model assets] fetching:', spec.name);
  const content = await download(spec.url);
  let result = new Uint8Array(content);
  if (spec.zipped) {
    const archive = await JSZip.loadAsync(content);
    const onnx = Object.values(archive.files).filter(f => !f.dir && f.name.endsWith('.onnx'));
    if (onnx.length !== 1) throw new Error(spec.name + ': expected one ONNX file, found ' + onnx.length);
    result = await onnx[0].async('uint8array');
    if (spec.dataName) {
      const extras = Object.values(archive.files).filter(f => !f.dir && f.name.endsWith('.data'));
      const external = extras.find(f => f.name.split('/').at(-1) === spec.dataName);
      if (!external) {
        throw new Error(spec.name + ': missing referenced external weight file ' + spec.dataName);
      }
      const externalBytes = await external.async('uint8array');
      if (!externalBytes.byteLength) throw new Error(spec.name + ': empty external data');
      await writeFile(join(outputDir, spec.dataName), externalBytes);
      console.log('[model assets] external weights:', spec.dataName, externalBytes.byteLength, 'bytes');
    }
  }
  if (result.byteLength < 1000) throw new Error(spec.name + ': extracted ONNX is too small');
  const tmp = destination + '.tmp';
  try {
    await writeFile(tmp, result);
    await rename(tmp, destination);
    console.log('[model assets] ready:', spec.name, result.byteLength, 'bytes');
  } catch (error) {
    await rm(tmp, { force: true });
    throw error;
  }
}
