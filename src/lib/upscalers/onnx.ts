import JSZip from 'jszip';
import {
  ONNX_MODEL_PROFILES, isOnnxModelId, tilePlan, validateTensorShape,
} from './onnxProfiles';
import type { OnnxModelId, TileRect } from './onnxProfiles';

// A pinned CDN runtime avoids modifying the existing TFJS dependency graph.
// The model and runtime are downloaded only after users select one of these models.
const ORT_VERSION = '1.21.0';
const ORT_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@' + ORT_VERSION + '/dist/';
const ORT_MODULE_URL = ORT_BASE + 'ort.wasm.min.mjs';

type OrtTensor = {
  data: Float32Array | number[];
  dims: readonly number[];
  getData?: () => Promise<Float32Array>;
  dispose?: () => void;
};
type OrtSession = {
  inputNames: string[];
  outputNames: string[];
  run: (feeds: Record<string, OrtTensor>) => Promise<Record<string, OrtTensor>>;
  release?: () => Promise<void>;
};
type OrtRuntime = {
  env: { wasm: { numThreads: number; wasmPaths: string; proxy?: boolean } };
  Tensor: new (type: 'float32', data: Float32Array, dims: number[]) => OrtTensor;
  InferenceSession: {
    create: (data: ArrayBuffer, options: Record<string, unknown>) => Promise<OrtSession>;
  };
};

let runtimePromise: Promise<OrtRuntime> | undefined;
const sessions = new Map<OnnxModelId, Promise<OrtSession>>();

async function getRuntime(): Promise<OrtRuntime> {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const runtimeUrl: string = ORT_MODULE_URL;
      const module = await import(/* @vite-ignore */ runtimeUrl) as OrtRuntime;
      const ort = ('default' in module ? module.default : module) as OrtRuntime;
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmPaths = ORT_BASE;
      // Avoid nested workers on Safari/iOS: the main job queue already serializes.
      ort.env.wasm.proxy = false;
      return ort;
    })().catch(error => {
      runtimePromise = undefined;
      throw new Error('ONNX 추론 엔진을 내려받지 못했어: ' + String(error));
    });
  }
  return runtimePromise;
}

async function fetchModel(id: OnnxModelId): Promise<ArrayBuffer> {
  const profile = ONNX_MODEL_PROFILES[id];
  const response = await fetch(profile.source, { mode: 'same-origin' });
  if (!response.ok) throw new Error(profile.name + ' 모델 파일 다운로드 실패 (' + response.status + ')');
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength) throw new Error(profile.name + ' 모델 파일이 비어 있어.');
  if (!profile.archive) return bytes;
  const zip = await JSZip.loadAsync(bytes);
  const onnxFiles = Object.values(zip.files).filter(f => !f.dir && f.name.toLowerCase().endsWith('.onnx'));
  if (!onnxFiles.length) throw new Error(profile.name + ' 배포 압축 파일에 ONNX 모델이 없어.');
  // Qualcomm's float archive contains one ONNX graph; do not accidentally use quantized assets.
  const entry = onnxFiles.find(f => !/quant|w8a8/i.test(f.name)) || onnxFiles[0];
  return entry.async('arraybuffer');
}

async function sessionFor(id: OnnxModelId): Promise<OrtSession> {
  let pending = sessions.get(id);
  if (!pending) {
    pending = (async () => {
      const [ort, weights] = await Promise.all([getRuntime(), fetchModel(id)]);
      const externalData = ONNX_MODEL_PROFILES[id].externalData;
      return ort.InferenceSession.create(weights, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
        intraOpNumThreads: 1,
        ...(externalData ? {
          externalData: [{ path: externalData, data: '/models/' + externalData }],
        } : {}),
      });
    })().catch(error => {
      sessions.delete(id);
      throw new Error(ONNX_MODEL_PROFILES[id].name + ' 모델 실행 준비 실패: ' + String(error));
    });
    sessions.set(id, pending);
    // Do not retain many loaded 4x models in memory on mobile.
    while (sessions.size > 2) {
      const oldestId = sessions.keys().next().value as OnnxModelId;
      if (oldestId === id) break;
      const old = sessions.get(oldestId);
      sessions.delete(oldestId);
      void old?.then(async session => { try { await session.release?.(); } catch {} }).catch(() => {});
    }
  }
  return pending;
}

export function rgbaToNchw(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  tile: TileRect,
  padding: number,
): Float32Array {
  const tw = tile.inputWidth, th = tile.inputHeight;
  const plane = tw * th;
  const out = new Float32Array(plane * 3);
  for (let ry = 0; ry < th; ry++) {
    const sy = Math.min(height - 1, Math.max(0, tile.y + ry - padding));
    for (let rx = 0; rx < tw; rx++) {
      const sx = Math.min(width - 1, Math.max(0, tile.x + rx - padding));
      const src = (sy * width + sx) * 4;
      const dst = ry * tw + rx;
      const alpha = source[src + 3] / 255;
      // Blend transparency over white before RGB inference, preserve alpha in postprocess.
      out[dst] = (source[src] * alpha + 255 * (1 - alpha)) / 255;
      out[plane + dst] = (source[src + 1] * alpha + 255 * (1 - alpha)) / 255;
      out[2 * plane + dst] = (source[src + 2] * alpha + 255 * (1 - alpha)) / 255;
    }
  }
  return out;
}

export function decodeOnnxTile(
  output: Float32Array, dims: readonly number[], tile: TileRect,
  source: Uint8ClampedArray, srcWidth: number, scale: number, padding: number,
): ImageData {
  const layout = validateTensorShape(dims, tile, scale);
  const fullWidth = tile.inputWidth * scale;
  const fullHeight = tile.inputHeight * scale;
  const plane = fullWidth * fullHeight;
  if (output.length !== plane * 3) throw new Error('ONNX 출력 픽셀 수가 올바르지 않아.');
  const drawW = tile.coreWidth * scale;
  const drawH = tile.coreHeight * scale;
  const rgba = new Uint8ClampedArray(drawW * drawH * 4);
  for (let y = 0; y < drawH; y++) {
    for (let x = 0; x < drawW; x++) {
      const ox = padding * scale + x, oy = padding * scale + y;
      const si = oy * fullWidth + ox;
      const di = (y * drawW + x) * 4;
      for (let c = 0; c < 3; c++) {
        const value = layout === 'chw' ? output[si + c * plane] : output[si * 3 + c];
        rgba[di + c] = Math.round(Math.min(1, Math.max(0, value)) * 255);
      }
      // Nearest-neighbor alpha respects transparent pixels without leaking white borders.
      const srcX = tile.x + Math.floor(x / scale);
      const srcY = tile.y + Math.floor(y / scale);
      rgba[di + 3] = source[(srcY * srcWidth + srcX) * 4 + 3];
    }
  }
  return new ImageData(rgba, drawW, drawH);
}

async function createCanvasFromFile(file: File): Promise<HTMLCanvasElement> {
  const img = document.createElement('img');
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('입력 이미지 파일을 읽을 수 없어.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || !canvas.width || !canvas.height) throw new Error('이미지 렌더링을 시작할 수 없어.');
    ctx.drawImage(img, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function upscaleOnnxImage(
  file: File, modelId: string, onProgress?: (percent: number) => void,
): Promise<Blob> {
  if (!isOnnxModelId(modelId)) throw new Error('등록되지 않은 ONNX 복원 모델이야.');
  const profile = ONNX_MODEL_PROFILES[modelId];
  const source = await createCanvasFromFile(file);
  const width = source.width, height = source.height;
  const outWidth = width * profile.scale, outHeight = height * profile.scale;
  if (outWidth > 16384 || outHeight > 16384 || outWidth * outHeight > 100_000_000) {
    throw new Error('출력 이미지가 브라우저 캔버스 한도를 초과해. 더 작은 입력으로 나눠 줘.');
  }
  const srcCtx = source.getContext('2d', { willReadFrequently: true })!;
  const srcPixels = srcCtx.getImageData(0, 0, width, height).data;
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = outWidth;
  outputCanvas.height = outHeight;
  const outputCtx = outputCanvas.getContext('2d');
  if (!outputCtx) throw new Error('출력 캔버스를 생성할 수 없어.');

  const session = await sessionFor(modelId);
  const ort = await getRuntime();
  const tiles = tilePlan(width, height, modelId);
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    const tensorData = rgbaToNchw(srcPixels, width, height, tile, profile.pad);
    const tensor = new ort.Tensor('float32', tensorData, [1, 3, tile.inputHeight, tile.inputWidth]);
    const outputs = await session.run({ [session.inputNames[0]]: tensor });
    const prediction = outputs[session.outputNames[0]];
    if (!prediction) throw new Error('복원 모델이 출력 이미지를 반환하지 않았어.');
    const data = prediction.getData
      ? await prediction.getData()
      : new Float32Array(prediction.data);
    const region = decodeOnnxTile(
      data, prediction.dims, tile, srcPixels, width, profile.scale, profile.pad,
    );
    outputCtx.putImageData(region, tile.x * profile.scale, tile.y * profile.scale);
    prediction.dispose?.();
    tensor.dispose?.();
    onProgress?.(Math.round((i + 1) * 100 / tiles.length));
    // Yield to input events and the progress UI between patches.
    if (i % 4 === 3) await new Promise(resolve => setTimeout(resolve, 0));
  }
  return new Promise<Blob>((resolve, reject) => {
    outputCanvas.toBlob(blob => {
      if (blob?.type === 'image/png') resolve(blob);
      else reject(new Error('PNG 출력 인코딩에 실패했어.'));
    }, 'image/png');
  });
}
