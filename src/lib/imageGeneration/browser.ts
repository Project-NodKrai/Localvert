import { fluxSigmas, seededGaussian, unpackFluxLatent } from './browserMath';
import { composePrompt } from './catalog';
import type { GenerationConfig } from './catalog';

export type WebGpuSupport = {
  available: boolean;
  reason: string;
  maxBufferBytes?: number;
};

export async function probeImageWebGpu(): Promise<WebGpuSupport> {
  if (!globalThis.isSecureContext) return { available: false, reason: 'HTTPS 또는 localhost가 필요해.' };
  const gpu = (navigator as Navigator & {
    gpu?: { requestAdapter(opts?: { powerPreference?: string }): Promise<{
      features: Set<string>; limits: { maxBufferSize: number }; info?: { description?: string };
    } | null> };
  }).gpu;
  if (!gpu) return { available: false, reason: '이 브라우저에서는 WebGPU를 사용할 수 없어.' };
  try {
    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return { available: false, reason: '사용할 수 있는 GPU 어댑터가 없어.' };
    if (!adapter.features.has('shader-f16')) {
      return { available: false, reason: '이 GPU는 shader-f16을 지원하지 않아.' };
    }
    return {
      available: true,
      reason: 'WebGPU · shader-f16 사용 가능',
      maxBufferBytes: adapter.limits.maxBufferSize,
    };
  } catch (error) {
    return { available: false, reason: error instanceof Error ? error.message : 'GPU 초기화 실패' };
  }
}

type StageName = 'encode' | 'denoise' | 'decode';
type StagePayload = Record<string, unknown>;
type StageResult = { data: ArrayBuffer; shape?: number[]; width?: number; height?: number };

function runStage(
  stage: StageName,
  payload: StagePayload,
  signal: AbortSignal,
  onProgress: (text: string) => void,
): Promise<StageResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('/workers/flux2-stage.js', location.origin), { type: 'module' });
    const requestId = crypto.randomUUID();
    let finished = false;
    function clean() {
      signal.removeEventListener('abort', abort);
      worker.terminate(); // Critical: ORT WebGPU resources are released by killing the stage worker.
    }
    function done(error?: Error, result?: StageResult) {
      if (finished) return;
      finished = true;
      clean();
      if (error) reject(error);
      else if (result) resolve(result);
      else reject(new Error('모델 실행 결과를 받지 못했어.'));
    }
    function abort() { done(new DOMException('생성을 중단했어.', 'AbortError')); }
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    worker.onerror = event => done(new Error(event.message || 'WebGPU Worker 오류'));
    worker.onmessage = (event: MessageEvent) => {
      const message = event.data;
      if (!message || message.requestId !== requestId || finished) return;
      if (message.type === 'progress') onProgress(String(message.message));
      if (message.type === 'error') done(new Error(String(message.message)));
      if (message.type === 'result' && message.data instanceof ArrayBuffer) {
        done(undefined, { data: message.data, shape: message.shape, width: message.width, height: message.height });
      }
    };
    worker.postMessage({ requestId, stage, payload });
  });
}

/**
 * Experimental native WebGPU execution. Downloads models directly from Hugging Face,
 * not from ComfyUI or a hosted image generation endpoint.
 * Three dedicated workers avoid ORT GPU memory surviving InferenceSession.release().
 */
export async function runBrowserFluxKlein(args: {
  config: GenerationConfig;
  seed: number;
  signal: AbortSignal;
  onState: (status: string) => void;
}): Promise<Blob> {
  const { config, signal, seed, onState } = args;
  const support = await probeImageWebGpu();
  if (!support.available) throw new Error(support.reason);
  const { width, height } = config;
  if (!Number.isInteger(width) || !Number.isInteger(height) ||
      width < 256 || width > 1024 || height < 256 || height > 1024 ||
      width % 64 || height % 64) {
    throw new Error('FLUX.2 Klein WebGPU는 256~1024px, 64px 단위로 지원해.');
  }
  const steps = 4;
  const prompt = composePrompt(config);
  if (!prompt.trim()) throw new Error('프롬프트를 입력해.');
  // 1. Text encoder worker, then terminate before denoising to actually release its GPU buffers.
  const encoded = await runStage('encode', { prompt }, signal, onState);
  if (signal.aborted) throw new DOMException('중단됨', 'AbortError');
  // 2. Transformer worker. Latent and scheduler are pure JS; all denoising forwards run in GPU.
  const sequence = width / 16 * (height / 16);
  const noise = seededGaussian(sequence * 128, seed);
  const sigmas = fluxSigmas(steps, sequence);
  const generated = await runStage('denoise', {
    width, height, steps, sigmas, latent: noise.buffer, embeds: encoded.data,
    embedShape: encoded.shape,
  }, signal, onState);
  if (signal.aborted) throw new DOMException('중단됨', 'AbortError');
  // 3. VAE decoder worker. Unpack pixel-order channels for [1,32,H/8,W/8].
  const unpacked = unpackFluxLatent(new Float32Array(generated.data), width, height);
  const image = await runStage('decode', {
    width, height, latent: unpacked.buffer,
  }, signal, onState);
  const rgba = new Uint8ClampedArray(image.data);
  if (rgba.length !== width * height * 4) throw new Error('생성 이미지의 크기가 올바르지 않아.');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이미지를 출력할 수 없어.');
  ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error('PNG 인코딩 실패')), 'image/png'));
}
