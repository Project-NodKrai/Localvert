/**
 * Independently executable ONNX image super-resolution profiles.
 * Model binaries are fetched lazily and inferred locally on the user's device.
 * The CDN requests contain model URLs only; user images are never transmitted.
 */
const LOCAL_ASSETS = '/models/';

export const ONNX_MODEL_PROFILES = {
  'quicksrnet-small-4x': {
    name: 'QuickSRNet Small',
    scale: 4,
    fixedInput: 128,
    core: 104,
    pad: 12,
    source: LOCAL_ASSETS + 'quicksrnet-small-4x.onnx',
    archive: false,
    externalData: 'quicksrnetsmall.data',
    license: 'BSD-3-Clause',
  },
  'quicksrnet-medium-4x': {
    name: 'QuickSRNet Medium',
    scale: 4,
    fixedInput: 128,
    core: 104,
    pad: 12,
    source: LOCAL_ASSETS + 'quicksrnet-medium-4x.onnx',
    archive: false,
    externalData: 'quicksrnetmedium.data',
    license: 'BSD-3-Clause',
  },
  'realesr-general-x4v3': {
    name: 'Real-ESRGAN General x4v3',
    scale: 4,
    fixedInput: null,
    core: 64,
    pad: 12,
    source: LOCAL_ASSETS + 'realesr-general-x4v3.onnx',
    archive: false,
    externalData: null,
    license: 'BSD-3-Clause',
  },
  'realesr-animevideov3': {
    name: 'Real-ESRGAN AnimeVideo v3',
    scale: 4,
    fixedInput: null,
    core: 64,
    pad: 12,
    source: LOCAL_ASSETS + 'realesr-animevideov3.onnx',
    archive: false,
    externalData: null,
    license: 'BSD-3-Clause',
  },
  'realesrgan-x4plus-anime': {
    name: 'Real-ESRGAN Anime 6B',
    scale: 4,
    fixedInput: null,
    core: 48,
    pad: 12,
    source: LOCAL_ASSETS + 'realesrgan-x4plus-anime.onnx',
    archive: false,
    externalData: null,
    license: 'BSD-3-Clause',
  },
  'realesrgan-x4plus': {
    name: 'Real-ESRGAN x4plus',
    scale: 4, fixedInput: null, core: 32, pad: 12,
    source: LOCAL_ASSETS + 'realesrgan-x4plus.onnx',
    archive: false, externalData: null, license: 'BSD-3-Clause',
  },
  'realesrgan-anime-4b32f': {
    name: 'Real-ESRGAN Anime 4B32F',
    scale: 4, fixedInput: null, core: 48, pad: 12,
    source: LOCAL_ASSETS + 'realesrgan-anime-4b32f.onnx',
    archive: false, externalData: null, license: 'BSD-3-Clause',
  },
  'swin2sr-lightweight-2x': {
    name: 'Swin2SR Lightweight',
    scale: 2, fixedInput: 64, core: 48, pad: 8,
    source: LOCAL_ASSETS + 'swin2sr-lightweight-2x.onnx',
    archive: false, externalData: null, license: 'Apache-2.0',
  },
  'swin2sr-classical-4x': {
    name: 'Swin2SR Classical',
    scale: 4, fixedInput: 64, core: 48, pad: 8,
    source: LOCAL_ASSETS + 'swin2sr-classical-4x.onnx',
    archive: false, externalData: null, license: 'Apache-2.0',
  },
  'swin2sr-realworld-4x': {
    name: 'Swin2SR RealWorld',
    scale: 4, fixedInput: 64, core: 48, pad: 8,
    source: LOCAL_ASSETS + 'swin2sr-realworld-4x.onnx',
    archive: false, externalData: null, license: 'Apache-2.0',
  },
  'swin2sr-compressed-4x': {
    name: 'Swin2SR Compressed',
    scale: 4, fixedInput: 48, core: 32, pad: 8,
    source: LOCAL_ASSETS + 'swin2sr-compressed-4x.onnx',
    archive: false, externalData: null, license: 'Apache-2.0',
  },
  'realcugan-hfa2k-2x': {
    name: 'Real-CUGAN HFA2k',
    scale: 2, fixedInput: null, core: 48, pad: 10,
    source: LOCAL_ASSETS + 'realcugan-hfa2k-2x.onnx',
    archive: false, externalData: null, license: 'CC-BY-4.0',
    outputHalo: 1,
  },
  'nomosuni-span-2x': {
    name: 'NomosUni SPAN 2×',
    scale: 2, fixedInput: null, core: 64, pad: 8,
    source: LOCAL_ASSETS + 'nomosuni-span-2x.onnx',
    archive: false, externalData: null, license: 'CC-BY-4.0',
  },
  'modernspanimation-2x': {
    name: 'ModernSpanimation SPAN 2×',
    scale: 2, fixedInput: null, core: 64, pad: 8,
    source: LOCAL_ASSETS + 'modernspanimation-2x.onnx',
    archive: false, externalData: null, license: 'MIT',
  },
  'xlsr-4x': {
    name: 'XLSR',
    scale: 4, fixedInput: 128, core: 104, pad: 12,
    source: LOCAL_ASSETS + 'xlsr-4x.onnx',
    archive: false, externalData: 'xlsr.data', license: 'BSD-3-Clause',
  },
  'quicksrnet-large-4x': {
    name: 'QuickSRNet Large',
    scale: 4, fixedInput: 128, core: 104, pad: 12,
    source: LOCAL_ASSETS + 'quicksrnet-large-4x.onnx',
    archive: false, externalData: 'quicksrnetlarge.data', license: 'BSD-3-Clause',
  },
  'realplksr-2x': {
    name: 'RealPLKSR 2×',
    scale: 2, fixedInput: 512, core: 448, pad: 32,
    source: LOCAL_ASSETS + 'realplksr-2x.onnx',
    archive: false, externalData: null, license: 'MIT',
  },
  'realplksr-4x': {
    name: 'RealPLKSR 4×',
    scale: 4, fixedInput: 256, core: 224, pad: 16,
    source: LOCAL_ASSETS + 'realplksr-4x.onnx',
    archive: false, externalData: null, license: 'MIT',
  },
} as const;
export type OnnxModelId = keyof typeof ONNX_MODEL_PROFILES;

export function isOnnxModelId(id: string): id is OnnxModelId {
  return Object.prototype.hasOwnProperty.call(ONNX_MODEL_PROFILES, id);
}

export interface TileRect {
  x: number;
  y: number;
  coreWidth: number;
  coreHeight: number;
  inputWidth: number;
  inputHeight: number;
}

export function tilePlan(width: number, height: number, id: OnnxModelId): TileRect[] {
  const profile = ONNX_MODEL_PROFILES[id];
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('이미지 크기가 올바르지 않아.');
  }
  const tiles: TileRect[] = [];
  for (let y = 0; y < height; y += profile.core) {
    for (let x = 0; x < width; x += profile.core) {
      const coreWidth = Math.min(profile.core, width - x);
      const coreHeight = Math.min(profile.core, height - y);
      tiles.push({
        x, y, coreWidth, coreHeight,
        inputWidth: profile.fixedInput || coreWidth + 2 * profile.pad,
        inputHeight: profile.fixedInput || coreHeight + 2 * profile.pad,
      });
    }
  }
  return tiles;
}

export function validateTensorShape(
  dims: readonly number[], tile: TileRect, scale: number, outputHalo = 0,
): 'chw' | 'hwc' {
  const w = tile.inputWidth * scale + outputHalo * 2;
  const h = tile.inputHeight * scale + outputHalo * 2;
  if (dims.length === 4 && dims[0] === 1 && dims[1] === 3 && dims[2] === h && dims[3] === w) return 'chw';
  if (dims.length === 4 && dims[0] === 1 && dims[1] === h && dims[2] === w && dims[3] === 3) return 'hwc';
  throw new Error('모델 출력 텐서의 크기가 예상한 ' + w + '×' + h + ' 이미지와 달라. 실제 dims=' + JSON.stringify(dims));
}
