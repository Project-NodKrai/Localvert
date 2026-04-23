import { convertImage } from './image';
import { convertDocument } from './document';
import { convertArchive } from './archive';
import { convertMedia } from './media';
import { FileType } from '../../types';

export async function processConversion(
  id: string,
  file: File,
  type: FileType,
  targetFormat: string,
  onProgress?: (p: number) => void
): Promise<{ blob: Blob; ext: string }> {
  switch (type) {
    case 'image':
      if (onProgress) onProgress(50);
      const imgRes = await convertImage(file, targetFormat);
      if (onProgress) onProgress(100);
      return imgRes;
    case 'document':
      if (onProgress) onProgress(50);
      const docRes = await convertDocument(file, targetFormat);
      if (onProgress) onProgress(100);
      return docRes;
    case 'archive':
      const archRes = await convertArchive(file, targetFormat, onProgress);
      if (onProgress) onProgress(100);
      return archRes;
    case 'video':
    case 'audio':
    case 'unknown':
      return await convertMedia(id, file, targetFormat, onProgress);
    default:
      throw new Error(`Unsupported type for conversion: ${type}`);
  }
}
