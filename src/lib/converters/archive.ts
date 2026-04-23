import JSZip from 'jszip';

export async function convertArchive(file: File, targetFormat: string, onProgress?: (p: number) => void): Promise<{ blob: Blob; ext: string }> {
  if (targetFormat === 'zip') {
    const zip = new JSZip();
    zip.file(file.name, file);
    const blob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
      if (onProgress) onProgress(metadata.percent);
    });
    return { blob, ext: 'zip' };
  }
  throw new Error(`Unsupported archive format: ${targetFormat}`);
}
