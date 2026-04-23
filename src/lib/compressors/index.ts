import imageCompression from 'browser-image-compression';
import { acquireFFmpeg, releaseFFmpeg } from '../converters/media';

export async function compressImage(file: File, quality: number, settings: { maxWidth?: number; keepMetadata?: boolean }): Promise<Blob> {
  const options = {
    maxSizeMB: quality > 80 ? 10 : quality > 50 ? 2 : 0.5,
    maxWidthOrHeight: settings.maxWidth ? settings.maxWidth : (quality > 80 ? 3840 : quality > 50 ? 1920 : 1024),
    useWebWorker: true,
    initialQuality: quality / 100,
    preserveExif: settings.keepMetadata ?? false,
  };
  
  try {
    const compressedFile = await imageCompression(file, options);
    return compressedFile;
  } catch (error) {
    console.error('Image compression failed:', error);
    throw error;
  }
}

export async function compressVideo(
  id: string, 
  file: File, 
  quality: number, 
  settings: { resolution?: 'original' | '1080p' | '720p' | '480p'; mute?: boolean },
  onProgress?: (p: number) => void
): Promise<Blob> {
  const instance = await acquireFFmpeg();
  const inputName = `input_${id}_${file.name}`;
  const outputName = `compressed_${id}_${file.name}`;
  
  try {
    const uint8 = new Uint8Array(await file.arrayBuffer());
    await instance.writeFile(inputName, uint8);
    
    // CRF 18 to 51. Quality 100 -> 18, Quality 0 -> 51
    const crf = Math.round(18 + (100 - quality) * (33 / 100));
    
    const progressHandler = ({ progress }: { progress: number }) => {
      if (onProgress) onProgress(Math.round(progress * 100));
    };

    instance.on('progress', progressHandler);

    // Build FFmpeg command
    const args = ['-i', inputName];
    
    // Default to H.264 for compatibility and speed
    args.push('-c:v', 'libx264', '-crf', crf.toString(), '-preset', 'ultrafast');

    // Mute
    if (settings.mute) {
      args.push('-an');
    } else {
      args.push('-c:a', 'aac', '-strict', 'experimental');
    }

    // Resolution
    if (settings.resolution && settings.resolution !== 'original') {
      const scaleMap = {
        '1080p': '1920:-1',
        '720p': '1280:-1',
        '480p': '854:-1'
      };
      args.push('-vf', `scale=${scaleMap[settings.resolution as keyof typeof scaleMap]}`);
    }

    args.push(outputName);

    try {
      await instance.exec(args);
      
      const data = await instance.readFile(outputName);
      return new Blob([data], { type: 'video/mp4' });
    } finally {
      instance.off('progress', progressHandler);
      try {
        await instance.deleteFile(inputName);
        await instance.deleteFile(outputName);
      } catch (e) {}
    }
  } finally {
    releaseFFmpeg();
  }
}
