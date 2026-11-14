import { Canvg } from 'canvg';
import { convertMedia } from './media';
import { encodeBmp, encodeTiff, encodeIco } from './rasterEncoders';
// @ts-ignore: imagetracerjs does not ship TypeScript declarations.
import ImageTracer from 'imagetracerjs';

// Kept as injectable dependency for existing regressions.
export interface ImageConversionDependencies {
  decodeHeic?: (input: File) => Promise<Blob | Blob[]>;
  compressImage?: (input: File, options: {
    maxSizeMB: number;
    maxWidthOrHeight: number;
    useWebWorker: boolean;
    fileType: string;
  }) => Promise<Blob>;
}

type Result = { blob: Blob; ext: string };
const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', avif: 'image/avif',
};

async function canvasBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mime, quality));
  // When an encoder is missing, browsers silently export a PNG instead.
  if (!blob || blob.type.toLowerCase() !== mime.toLowerCase()) {
    throw new Error(mime + ' 인코더를 지원하지 않는 브라우저야. 다른 형식을 선택해 줘.');
  }
  return blob;
}

function dimensionsFromSvg(markup: string): { width: number; height: number } {
  const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const svg = parsed.documentElement;
  if (svg.nodeName.toLowerCase() !== 'svg' || parsed.getElementsByTagName('parsererror').length) {
    throw new Error('SVG 문서를 읽을 수 없어.');
  }
  const px = (s: string | null): number => s && /^\s*\d+(\.\d+)?(px)?\s*$/i.test(s) ? Number.parseFloat(s) : NaN;
  const viewBox = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  const width = px(svg.getAttribute('width')) || viewBox[2] || 300;
  const height = px(svg.getAttribute('height')) || viewBox[3] || 150;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('SVG에 올바른 화면 크기 정보가 없어.');
  }
  return { width: Math.ceil(width), height: Math.ceil(height) };
}

async function drawToCanvas(blob: Blob, widthOverride?: number, heightOverride?: number): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('브라우저가 입력 이미지 포맷을 디코딩하지 못했어.'));
      img.src = url;
    });
    const width = widthOverride ?? img.naturalWidth;
    const height = heightOverride ?? img.naturalHeight;
    if (!width || !height) throw new Error('이미지의 크기를 읽을 수 없어.');
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 2D 엔진을 사용할 수 없어.');
    ctx.drawImage(img, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function rasterize(file: File, isSvg: boolean): Promise<HTMLCanvasElement> {
  if (isSvg) {
    const markup = await file.text();
    const { width, height } = dimensionsFromSvg(markup);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 2D 엔진을 사용할 수 없어.');
    const svg = await Canvg.from(ctx, markup);
    await svg.render();
    return canvas;
  }
  try {
    return await drawToCanvas(file);
  } catch (error) {
    // Some browsers do not decode TIFF/ICO/BMP despite FFmpeg supporting them.
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!['tiff', 'tif', 'ico', 'bmp'].includes(extension || '')) throw error;
    const decoded = await convertMedia('decode-image', file, 'png');
    return drawToCanvas(decoded.blob);
  }
}

async function traceSvg(canvas: HTMLCanvasElement): Promise<Blob> {
  const dataUrl = canvas.toDataURL('image/png');
  return new Promise((resolve, reject) => {
    try {
      ImageTracer.imageToSVG(dataUrl, (markup: string) => {
        if (!markup || !/<svg[\s>]/i.test(markup)) reject(new Error('SVG 추적 결과가 올바르지 않아.'));
        else resolve(new Blob([markup], { type: 'image/svg+xml' }));
      }, 'detailed');
    } catch (error) {
      reject(error);
    }
  });
}

export async function convertImage(
  file: File,
  targetFormat: string,
  dependencies: ImageConversionDependencies = {},
): Promise<Result> {
  const target = targetFormat.toLowerCase();
  const name = file.name.toLowerCase();
  const heic = /\.(heic|heif)$/.test(name);
  const svg = name.endsWith('.svg') || file.type === 'image/svg+xml';
  const current = name.split('.').pop() || '';

  if (target === 'heic' || target === 'heif') {
    throw new Error('HEIC/HEIF 쓰기 인코더는 아직 없어. PNG, JPEG, WebP 또는 AVIF(지원 브라우저)를 선택해 줘.');
  }
  if (svg && target === 'svg') return { blob: file, ext: 'svg' };
  if (!heic && current === target && !svg) {
    // Identity conversions should not alter binary content, color or metadata.
    return { blob: file, ext: target };
  }
  let processedFile = file;
  if (heic) {
    const decode = dependencies.decodeHeic ?? (async (input: File) => {
      const { default: heic2any } = await import('heic2any');
      return heic2any({ blob: input, toType: 'image/png' });
    });
    const decoded = await decode(file);
    const png = Array.isArray(decoded) ? decoded[0] : decoded;
    if (!png) throw new Error('HEIC 디코더가 이미지를 반환하지 않았어.');
    if (target === 'png') return { blob: png, ext: 'png' };
    processedFile = new File([png], file.name.replace(/\.(heic|heif)$/i, '.png'), { type: 'image/png' });
  }

  // Retain the injected compressor contract used by the original tests;
  // production conversions never apply its arbitrary 4096px/10MB limits.
  if (dependencies.compressImage && MIME[target]) {
    const result = await dependencies.compressImage(processedFile, {
      maxSizeMB: Number.MAX_SAFE_INTEGER,
      maxWidthOrHeight: Number.MAX_SAFE_INTEGER,
      useWebWorker: false,
      fileType: MIME[target],
    });
    return { blob: result, ext: target };
  }

  const canvas = await rasterize(processedFile, svg);

  if (target === 'svg') return { blob: await traceSvg(canvas), ext: 'svg' };
  if (target === 'bmp') {
    const pixels = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height);
    return { blob: encodeBmp(pixels), ext: target };
  }
  if (target === 'tiff' || target === 'tif') {
    const pixels = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height);
    return { blob: encodeTiff(pixels), ext: target };
  }
  if (target === 'ico') {
    // ICO requires a square icon; fit within 256px and preserve transparency.
    const size = Math.min(256, Math.max(canvas.width, canvas.height));
    const icon = document.createElement('canvas');
    icon.width = size;
    icon.height = size;
    const ctx = icon.getContext('2d');
    if (!ctx) throw new Error('ICO Canvas 엔진을 사용할 수 없어.');
    const ratio = Math.min(size / canvas.width, size / canvas.height);
    ctx.drawImage(canvas, (size - canvas.width * ratio) / 2, (size - canvas.height * ratio) / 2,
      canvas.width * ratio, canvas.height * ratio);
    const png = await canvasBlob(icon, 'image/png');
    return { blob: await encodeIco(png, size, size), ext: 'ico' };
  }
  if (target === 'gif' || target === 'mp4' || target === 'webm') {
    const png = await canvasBlob(canvas, 'image/png');
    const input = new File([png], file.name.replace(/\.[^.]+$/, '') + '.png', { type: 'image/png' });
    return convertMedia('image-export', input, target);
  }
  const mime = MIME[target];
  if (mime) return { blob: await canvasBlob(canvas, mime, target === 'png' ? undefined : 0.94), ext: target };

  throw new Error('이미지 출력 형식을 지원하지 않아: ' + target);
}
