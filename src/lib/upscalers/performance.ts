import { activeModel } from './catalog';
import type { UpscaleModelSelection } from './catalog';

export type ImageUpscaleModel = UpscaleModelSelection;

export interface DeviceHints {
  /** Browser hints are not a measurement of total RAM or GPU VRAM. */
  memoryHintGB?: number;
  logicalCores?: number;
  webglAvailable?: boolean;
  maxTextureSize?: number;
}

export interface UpscaleAdvice {
  recommendedSystemRamGB: number;
  inputMegapixels: number;
  outputMegapixels: number;
  estimatedOutputRGBABytes: number;
  patchSize: number;
  warnings: string[];
  /** Advisory only. A user who acknowledges the warning may always proceed. */
  caution: boolean;
}

export function detectDeviceHints(): DeviceHints {
  const hints: DeviceHints = {};
  if (typeof navigator !== 'undefined') {
    hints.memoryHintGB = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    hints.logicalCores = navigator.hardwareConcurrency;
  }
  if (typeof document === 'undefined') return hints;

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    hints.webglAvailable = Boolean(gl);
    if (gl && 'getParameter' in gl) {
      const context = gl as WebGLRenderingContext;
      hints.maxTextureSize = context.getParameter(context.MAX_TEXTURE_SIZE) as number;
      context.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    hints.webglAvailable = false;
  }
  return hints;
}

export function adviseImageUpscale(
  model: ImageUpscaleModel,
  width: number,
  height: number,
  hints: DeviceHints = {},
): UpscaleAdvice {
  const pixels = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? width * height : 0;
  const inputMegapixels = pixels / 1_000_000;
  const selected = activeModel(model);
  const factor = selected.scale!;
  const outputMegapixels = inputMegapixels * factor * factor;
  const warnings: string[] = [];
  // Conservative initial values; these are guidance, not benchmark measurements.
  const recommendationLimit = selected.tier === 'plus' ? 4 : selected.tier === 'standard' ? 8 : 12;

  if (inputMegapixels > recommendationLimit) {
    warnings.push('입력 이미지가 ' + recommendationLimit + 'MP 권장 범위를 넘어 처리 시간과 메모리 사용량이 크게 늘어날 수 있어.');
  }
  if (hints.memoryHintGB !== undefined && hints.memoryHintGB <= 2) {
    warnings.push('브라우저의 메모리 힌트가 2GB 이하여서 메모리 부족이 발생할 수 있어.');
  }
  if (hints.webglAvailable === false) {
    warnings.push('WebGL 가속을 확인하지 못했어. WASM 또는 CPU 대체 처리는 상당히 느릴 수 있어.');
  }
  if (hints.maxTextureSize && width > 0 && height > 0 &&
      (width * factor > hints.maxTextureSize || height * factor > hints.maxTextureSize)) {
    warnings.push('예상 출력 크기가 GPU 텍스처 한도를 초과해. 분할 추론을 하더라도 출력 합성 단계에서 실패할 수 있어.');
  }
  const constrained = inputMegapixels > recommendationLimit ||
    (hints.memoryHintGB !== undefined && hints.memoryHintGB <= 4) ||
    hints.webglAvailable === false;
  const defaultPatch = selected.tier === 'plus' ? 64 : selected.tier === 'standard' ? 128 : 256;
  const patchSize = constrained ? Math.max(32, defaultPatch / 2) : defaultPatch;

  return {
    recommendedSystemRamGB: selected.tier === 'plus' ? 32 : selected.tier === 'standard' ? 24 : 8,
    inputMegapixels,
    outputMegapixels,
    estimatedOutputRGBABytes: pixels * 4 * 4,
    patchSize,
    warnings,
    caution: warnings.length > 0,
  };
}
