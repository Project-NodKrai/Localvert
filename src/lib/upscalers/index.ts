import Upscaler from 'upscaler';
import type { UpscaleExecutionTrace } from './executionTrace';
import * as tf from '@tensorflow/tfjs';
import { setWasmPaths } from '@tensorflow/tfjs-backend-wasm';
import { acquireFFmpeg, releaseFFmpeg } from '../converters/media';
import { matchesMediaSignature } from '../converters/mediaProfiles';
import { validateVideoModel, parseVideoFrameRate, videoFrameEncodeArgs, videoFrameExtractArgs } from './videoFrames';
import { adviseImageUpscale, detectDeviceHints } from './performance';
import type { ImageUpscaleModel } from './performance';
import { normalizeModelId } from './catalog';
import { isOnnxModelId } from './onnxProfiles';
import { upscaleOnnxImage } from './onnx';
import { isAnime4KModelId, upscaleAnime4K } from './anime4k';

// Explicitly set WASM paths from CDN for reliability in sandboxed environment
setWasmPaths('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm/dist/');

const imageUpscalers: Partial<Record<ImageUpscaleModel, Promise<any>>> = {};
let tfInitialized = false;

async function initTfjs() {
  if (tfInitialized) return;

  const tryBackend = async (name: string) => {
    try {
      await tf.setBackend(name);
      await tf.ready();
      
      // Smoke test: Perform a tiny operation to trigger shader compilation
      // 'Failed to compile fragment shader' often happens during the first actual op.
      const testTensor = tf.tensor1d([1, 2, 3]);
      testTensor.square().dataSync();
      testTensor.dispose();
      
      console.log(`TFJS initialized with ${name} backend successfully.`);
      return true;
    } catch (e) {
      console.warn(`${name} backend failed or has shader issues:`, e);
      return false;
    }
  };

  // 1. Try WebGL (Fastest)
  if (await tryBackend('webgl')) {
    tfInitialized = true;
    return;
  }

  // 2. Try WASM (Stable & reasonably fast)
  if (await tryBackend('wasm')) {
    tfInitialized = true;
    return;
  }

  // 3. Fallback to CPU (Safest, but slow)
  console.log('Falling back to CPU backend.');
  await tf.setBackend('cpu');
  await tf.ready();
  tfInitialized = true;
}

export async function getUpscaler(selection: ImageUpscaleModel = 'esrgan-slim-2x') {
  const model = normalizeModelId(selection);
  await initTfjs();
  if (!imageUpscalers[model]) {
    imageUpscalers[model] = (async () => {
      if (model === 'esrgan-medium-2x') {
        const { default: medium2x } = await import('@upscalerjs/esrgan-medium/2x');
        return new Upscaler({ model: medium2x });
      }
      if (model === 'esrgan-medium-4x') {
        const { default: medium4x } = await import('@upscalerjs/esrgan-medium/4x');
        return new Upscaler({ model: medium4x });
      }
      if (model !== 'esrgan-slim-2x') {
        throw new Error('선택한 모델에 맞는 TensorFlow.js 복원 엔진이 없어.');
      }
      return new Upscaler();
    })().catch((error) => {
      delete imageUpscalers[model];
      throw error;
    });
  }
  return imageUpscalers[model];
}

export async function upscaleImage(file: File, model: ImageUpscaleModel, onProgress?: (p: number) => void,
  trace?: UpscaleExecutionTrace): Promise<Blob> {
  const modelId = normalizeModelId(model);
  if (isOnnxModelId(modelId)) return upscaleOnnxImage(file, modelId, onProgress, trace);
  if (isAnime4KModelId(modelId)) return upscaleAnime4K(file, modelId, onProgress, trace);
  try {
    return await upscaleImageInternal(file, model, onProgress, trace);
  } catch (e: any) {
    if (e?.message?.includes('shader') || e?.message?.includes('fragment') || e?.message?.includes('WebGL')) {
      console.warn('Shader error detected during image upscale. Retrying with WASM backend...');
      await tf.setBackend('wasm');
      await tf.ready();
      // Recreate the model on the fallback backend rather than retaining the failed instance.
      for (const key of Object.keys(imageUpscalers) as ImageUpscaleModel[]) delete imageUpscalers[key];
      return await upscaleImageInternal(file, model, onProgress, trace);
    }
    throw e;
  }
}

async function upscaleImageInternal(file: File, model: ImageUpscaleModel, onProgress?: (p: number) => void,
  trace?: UpscaleExecutionTrace): Promise<Blob> {
  const upscaler = await getUpscaler(model);

  const img = new Image();
  const imageUrl = URL.createObjectURL(file);
  img.src = imageUrl;
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('이미지를 불러올 수 없습니다.'));
    });
  } catch (error) {
    URL.revokeObjectURL(imageUrl);
    throw error;
  }

  const advice = adviseImageUpscale(model, img.naturalWidth, img.naturalHeight, detectDeviceHints());
  
  try {
    // Strategy 1: Forced Tiling to avoid GPU Memory Limit (16384^2)
    const result = await upscaler.upscale(img, {
      patchSize: advice.patchSize,
      padding: 10,
      progress: (progress: number) => {
        if (onProgress) onProgress(Math.round(progress * 100));
      },
    });
    
    const response = await fetch(result);
    const output = await response.blob();
    if (!output.size) throw new Error('AI 모델이 출력 이미지를 반환하지 않았어.');
    const resolvedId = normalizeModelId(model);
    const source = resolvedId === 'esrgan-medium-2x' ? '@upscalerjs/esrgan-medium/2x'
      : resolvedId === 'esrgan-medium-4x' ? '@upscalerjs/esrgan-medium/4x'
      : '@upscalerjs/esrgan-slim/2x';
    trace?.recordInference(resolvedId, 'tfjs-' + tf.getBackend(), source);
    return output;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

/**
 * Filter and AI video paths share the same FFmpeg WASM lock. AI mode now
 * processes every extracted frame with the exact image model selected by user.
 */
export async function upscaleVideo(
  id: string,
  file: File,
  method: 'filter' | 'ai',
  limitSeconds: number | undefined,
  onProgress?: (percent: number) => void,
  model: ImageUpscaleModel = 'quicksrnet-small-4x',
  trace?: UpscaleExecutionTrace,
): Promise<Blob> {
  if (method === 'filter') return upscaleVideoFilter(id, file, onProgress, trace);
  return upscaleVideoAI(id, file, limitSeconds, model, onProgress, trace);
}

function safeVideoNames(id: string, file: File, prefix: string) {
  const clean = id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'task';
  const extension = (file.name.split('.').pop() || 'mp4').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return {
    inputName: prefix + '_' + clean + '_input.' + extension,
    outputName: prefix + '_' + clean + '_output.mp4',
    framePrefix: prefix + '_' + clean + '_frame_',
    upscaledPrefix: prefix + '_' + clean + '_upscaled_',
  };
}

async function upscaleVideoFilter(
  id: string,
  file: File,
  onProgress?: (percent: number) => void,
  trace?: UpscaleExecutionTrace,
): Promise<Blob> {
  const instance = await acquireFFmpeg();
  const { inputName, outputName } = safeVideoNames(id, file, 'filter');
  const progressHandler = ({ progress }: { progress: number }) => {
    if (Number.isFinite(progress)) onProgress?.(Math.max(0, Math.min(100, Math.round(progress * 100))));
  };
  instance.on('progress', progressHandler);
  try {
    await instance.writeFile(inputName, new Uint8Array(await file.arrayBuffer()));
    const code = await instance.exec([
      '-hide_banner', '-y', '-i', inputName,
      '-map', '0:v:0', '-map', '0:a:0?',
      '-vf', 'unsharp=5:5:1.0:5:5:0.0,scale=trunc(iw*1.5/2)*2:trunc(ih*1.5/2)*2:flags=lanczos',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast',
      '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
      '-f', 'mp4', outputName,
    ]);
    if (code !== 0) throw new Error('영상 필터 변환에 실패했어 (FFmpeg 코드 ' + code + ').');
    const data = await instance.readFile(outputName);
    if (typeof data === 'string' || !matchesMediaSignature(new Uint8Array(data), 'mp4')) {
      throw new Error('필터 결과물이 정상적인 MP4 파일이 아니야.');
    }
    trace?.recordFilter();
    onProgress?.(100);
    return new Blob([new Uint8Array(data)], { type: 'video/mp4' });
  } finally {
    instance.off('progress', progressHandler);
    try { await instance.deleteFile(inputName); } catch {}
    try { await instance.deleteFile(outputName); } catch {}
    releaseFFmpeg();
  }
}

async function upscaleVideoAI(
  id: string,
  file: File,
  limitSeconds: number | undefined,
  model: ImageUpscaleModel,
  onProgress?: (percent: number) => void,
  trace?: UpscaleExecutionTrace,
): Promise<Blob> {
  // Do not quietly substitute the default model when a different one was chosen.
  validateVideoModel(model);
  const instance = await acquireFFmpeg();
  const { inputName, outputName, framePrefix, upscaledPrefix } = safeVideoNames(id, file, 'ai');
  const originalPattern = framePrefix + '%05d.png';
  const outputPattern = upscaledPrefix + '%05d.png';
  const logs: string[] = [];
  const logHandler = ({ message }: { message: string }) => {
    logs.push(message);
    if (logs.length > 120) logs.shift();
  };
  instance.on('log', logHandler);
  try {
    await instance.writeFile(inputName, new Uint8Array(await file.arrayBuffer()));
    // An input-only probe returns a nonzero code but emits original stream metadata.
    await instance.exec(['-hide_banner', '-i', inputName]);
    const fps = parseVideoFrameRate(logs);

    const extractCode = await instance.exec(videoFrameExtractArgs(inputName, originalPattern, fps, limitSeconds));
    if (extractCode !== 0) throw new Error('원본 영상에서 프레임을 추출하지 못했어 (FFmpeg 코드 ' + extractCode + ').');

    const entries = await instance.listDir('.');
    const frameNames = entries
      .filter(entry => !entry.isDir && entry.name.startsWith(framePrefix) && entry.name.endsWith('.png'))
      .map(entry => entry.name).sort();
    if (!frameNames.length) throw new Error('추출된 동영상 프레임이 없어.');

    for (let i = 0; i < frameNames.length; i++) {
      const originalFrame = frameNames[i];
      const raw = await instance.readFile(originalFrame);
      if (typeof raw === 'string') throw new Error('프레임 바이너리를 읽지 못했어.');
      const input = new File([new Uint8Array(raw)], originalFrame, { type: 'image/png' });
      const upscale = await upscaleImage(input, model, (percentage) => {
        onProgress?.(Math.round(90 * (i + percentage / 100) / frameNames.length));
      }, trace);
      trace?.recordInferredFrame();
      const targetFrame = upscaledPrefix + originalFrame.slice(framePrefix.length);
      await instance.writeFile(targetFrame, new Uint8Array(await upscale.arrayBuffer()));
      await instance.deleteFile(originalFrame);
    }

    const args = videoFrameEncodeArgs(outputPattern, inputName, outputName, fps, frameNames.length);
    const encodeCode = await instance.exec(args);
    if (encodeCode !== 0) throw new Error('AI 복원 프레임을 MP4로 결합하지 못했어 (FFmpeg 코드 ' + encodeCode + ').');
    trace?.recordEncodedFrames(frameNames.length);
    const result = await instance.readFile(outputName);
    if (typeof result === 'string' || !matchesMediaSignature(new Uint8Array(result), 'mp4')) {
      throw new Error('AI 복원 결과물이 정상적인 MP4 파일이 아니야.');
    }
    onProgress?.(100);
    return new Blob([new Uint8Array(result)], { type: 'video/mp4' });
  } finally {
    instance.off('log', logHandler);
    // Interrupted jobs must not retain hundreds of frames in the shared FFmpeg FS.
    try {
      const entries = await instance.listDir('.');
      for (const item of entries) {
        if (!item.isDir && (item.name.startsWith(framePrefix) || item.name.startsWith(upscaledPrefix))) {
          try { await instance.deleteFile(item.name); } catch {}
        }
      }
    } catch {}
    try { await instance.deleteFile(inputName); } catch {}
    try { await instance.deleteFile(outputName); } catch {}
    releaseFFmpeg();
  }
}
