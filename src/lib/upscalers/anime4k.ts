import type { ActiveUpscaleModelId } from './catalog';

export const ANIME4K_MODELS = [
  'anime4k-v4-s-2x', 'anime4k-v4-m-2x', 'anime4k-v4-l-2x',
] as const;
export type Anime4KModelId = (typeof ANIME4K_MODELS)[number];

export function isAnime4KModelId(id: ActiveUpscaleModelId): id is Anime4KModelId {
  return (ANIME4K_MODELS as readonly string[]).includes(id);
}

export async function upscaleAnime4K(
  file: File,
  model: Anime4KModelId,
  onProgress?: (percent: number) => void,
): Promise<Blob> {
  // The MIT-licensed Anime4K.js 1.1.9 implementation bundles the 4.0.1 GLSL
  // shader weights. The app loads code from npm, not from a remote script CDN.
  const anime4k = await import('anime4k.js');
  if (typeof OffscreenCanvas === 'undefined' || !anime4k.ImageUpscaler.isSupported()) {
    throw new Error('이 브라우저에서는 Anime4K WebGL GPU 가속을 사용할 수 없어. 다른 모델을 선택해 줘.');
  }
  const preset = model === 'anime4k-v4-s-2x' ? anime4k.ANIME4KJS_SIMPLE_S_2X
    : model === 'anime4k-v4-m-2x' ? anime4k.ANIME4KJS_SIMPLE_M_2X
    : anime4k.ANIME4KJS_SIMPLE_L_2X;
  onProgress?.(5);
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  const worker = new anime4k.ImageUpscaler(preset);
  try {
    const pixelCount = bitmap.width * bitmap.height * 4;
    if (pixelCount > 80_000_000) {
      throw new Error('예상 출력 해상도가 80MP를 넘어서 브라우저에서 처리하기 어려워.');
    }
    worker.attachSource(bitmap, canvas);
    if (canvas.width !== bitmap.width * 2 || canvas.height !== bitmap.height * 2) {
      throw new Error('Anime4K 출력 해상도를 준비하지 못했어.');
    }
    onProgress?.(20);
    worker.upscale();
    // Canvas.toBlob is called before releasing the WebGL framebuffer.
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob || blob.type !== 'image/png' || blob.size < 70) {
      throw new Error('Anime4K GPU가 유효한 PNG 결과를 반환하지 않았어.');
    }
    onProgress?.(100);
    return blob;
  } finally {
    worker.detachSource();
    bitmap.close();
  }
}
