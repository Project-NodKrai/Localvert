import imageCompression from 'browser-image-compression';
import heic2any from 'heic2any';
import { Canvg } from 'canvg';
// @ts-ignore
import ImageTracer from 'imagetracerjs';

export async function convertImage(file: File, targetFormat: string): Promise<{ blob: Blob; ext: string }> {
  let mimeType = 'image/png';
  let ext = targetFormat;
  const name = file.name.toLowerCase();
  
  const mimeMap: Record<string, string> = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'webp': 'image/webp',
    'gif': 'image/gif',
    'bmp': 'image/bmp',
    'tiff': 'image/tiff',
    'ico': 'image/x-icon',
    'avif': 'image/avif',
    'svg': 'image/svg+xml'
  };

  if (mimeMap[targetFormat]) {
    mimeType = mimeMap[targetFormat];
  }

  // Handle HEIC/HEIF Source
  let processedFile = file;
  if (name.endsWith('.heic') || name.endsWith('.heif')) {
    const result = await heic2any({ blob: file, toType: 'image/png' });
    const blob = Array.isArray(result) ? result[0] : result;
    processedFile = new File([blob], file.name.replace(/\.(heic|heif)$/i, '.png'), { type: 'image/png' });
  }

  // Handle SVG Source
  if (name.endsWith('.svg') || file.type === 'image/svg+xml') {
    if (targetFormat === 'svg') return { blob: file, ext: 'svg' }; // No-op if already SVG
    
    const text = await file.text();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const v = await Canvg.from(ctx, text);
      await v.render();
      const blob = await new Promise<Blob>((res) => canvas.toBlob(b => res(b!), mimeType));
      return { blob, ext };
    }
  }

  // Handle SVG Target (Tracing with ImageTracer)
  if (targetFormat === 'svg') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        try {
          // Tracing logic
          ImageTracer.imageToSVG(
            dataUrl,
            (svgString: string) => {
              const blob = new Blob([svgString], { type: 'image/svg+xml' });
              resolve({ blob, ext: 'svg' });
            },
            'prime' // predefined options: 'default', 'posterized1', 'posterized2', 'curvy', 'sharp', 'detailed', 'smoothed', 'grayscale', 'fixedpalette', 'randompalette', 'artistic1', 'artistic2', 'artistic3', 'artistic4'
          );
        } catch (err) {
          // If tracing fails, fallback to simple embed
          const img = new Image();
          img.onload = () => {
            const svgEmbed = `<svg xmlns="http://www.w3.org/2000/svg" width="${img.width}" height="${img.height}"><image href="${dataUrl}" width="${img.width}" height="${img.height}" /></svg>`;
            const blob = new Blob([svgEmbed], { type: 'image/svg+xml' });
            resolve({ blob, ext: 'svg' });
          };
          img.onerror = () => reject(err);
          img.src = dataUrl;
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(processedFile);
    });
  }

  try {
    const options = {
      maxSizeMB: 10,
      maxWidthOrHeight: 4096,
      useWebWorker: true,
      fileType: mimeType,
    };
    
    const compressedFile = await imageCompression(processedFile, options);
    return { blob: compressedFile, ext };
  } catch (error) {
    console.error(error);
    // fallback to canvas
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(processedFile);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas context not available'));
        ctx.drawImage(img, 0, 0);
  
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve({ blob, ext });
            } else {
              reject(new Error('Failed to create image blob'));
            }
          },
          mimeType,
          0.9
        );
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = objectUrl;
    });
  }
}

