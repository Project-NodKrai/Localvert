import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;
let ffmpegBusy = false;
const queue: (() => void)[] = [];

export async function acquireFFmpeg(): Promise<FFmpeg> {
  if (ffmpegBusy) {
    await new Promise<void>((resolve) => queue.push(resolve));
  }
  ffmpegBusy = true;
  
  if (!ffmpeg) {
    ffmpeg = new FFmpeg();
    
    // Check for Cross-Origin Isolation to provide better error feedback
    const isIsolated = typeof self !== 'undefined' && self.crossOriginIsolated;
    if (!isIsolated) {
      console.warn('Environment is NOT cross-origin isolated. FFmpeg might fail or run very slowly.');
    }

    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';
    try {
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      
      ffmpeg.on('log', ({ message }) => {
        console.log('[FFmpeg Log]:', message);
      });
    } catch (err) {
      ffmpegBusy = false;
      ffmpeg = null;
      throw new Error('Failed to load FFmpeg engine. This might be due to security headers (COOP/COEP) or network issues.');
    }
  }
  return ffmpeg;
}

export function releaseFFmpeg() {
  ffmpegBusy = false;
  const next = queue.shift();
  if (next) next();
}

export async function convertMedia(id: string, file: File, targetFormat: string, onProgress?: (p: number) => void): Promise<{ blob: Blob; ext: string }> {
  const instance = await acquireFFmpeg();
  const logs: string[] = [];

  const logHandler = ({ message }: { message: string }) => {
    logs.push(message);
    if (logs.length > 30) logs.shift();
    console.log('[FFmpeg Log]:', message);
  };
  
  const progressHandler = ({ progress }: { progress: number }) => {
    if (onProgress) onProgress(Math.round(progress * 100)); // progress ranges from 0 to 1
  };
  
  instance.on('log', logHandler);
  instance.on('progress', progressHandler);

  const extMap: Record<string, string> = {
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/x-msvideo': 'avi',
    'video/quicktime': 'mov',
    'video/x-matroska': 'mkv',
    'video/x-flv': 'flv',
    'video/x-ms-wmv': 'wmv',
    'video/x-m4v': 'm4v',
    'video/ogg': 'ogv',
    'video/3gpp': '3gp',
    'image/gif': 'gif',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/flac': 'flac',
    'audio/x-flac': 'flac',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/x-ms-wma': 'wma',
    'audio/opus': 'opus',
    'audio/amr': 'amr'
  };

  const fileExt = file.name.split('.').pop() || extMap[file.type] || 'tmp';
  const inputName = `input.${fileExt}`;
  const outputName = `output.${targetFormat}`;

  try {
    const uint8 = new Uint8Array(await file.arrayBuffer());
    
    // Safety check for empty buffer
    if (uint8.length === 0) {
      throw new Error('Input file is empty.');
    }

    // Ensure a clean state
    try { await instance.deleteFile(inputName); } catch {}
    try { await instance.deleteFile(outputName); } catch {}

    await instance.writeFile(inputName, uint8);
    
    let args = ['-i', inputName, '-hide_banner', '-y'];
    
    const audioFormats = ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'wma', 'opus', 'amr', 'alac', 'aiff', 'mka'];
    const isAudioTarget = audioFormats.includes(targetFormat);

    // Optimized codec mapping for browser WASM performance and compatibility
    if (isAudioTarget) {
      args.push('-vn');
      if (targetFormat === 'mp3') {
        args.push('-c:a', 'libmp3lame', '-q:a', '4', '-ar', '44100');
      } else if (targetFormat === 'wav') {
        args.push('-c:a', 'pcm_s16le');
      } else if (targetFormat === 'aac' || targetFormat === 'm4a') {
        args.push('-c:a', 'aac');
      }
    } else if (targetFormat === 'mp4' || targetFormat === 'hevc') {
      args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', 'faststart');
    } else if (targetFormat === 'gif') {
      args.push('-vf', 'fps=10,scale=320:-1:flags=lanczos', '-c:v', 'gif');
    } else if (targetFormat === 'webm') {
      args.push('-c:v', 'libvpx', '-preset', 'ultrafast', '-c:a', 'libvorbis');
    } else if (['jpg', 'jpeg', 'png', 'webp'].includes(targetFormat)) {
      args.push('-vframes', '1', '-q:v', '2');
    }

    args.push(outputName);

    const exitCode = await instance.exec(args);
    if (exitCode !== 0) {
      console.warn(`Primary conversion failed (${exitCode}), retrying with simplest configuration...`);
      try { await instance.deleteFile(outputName); } catch {}
      
      // Fallback: Extremely simple one-pass conversion
      const fallbackExitCode = await instance.exec(['-i', inputName, outputName]);
      if (fallbackExitCode !== 0) {
        // Look for common fatal error patterns in logs
        const fatalError = logs.find(l => 
          l.includes('Error while') || 
          l.includes('Invalid data') || 
          l.includes('Unknown encoder') ||
          l.includes('Could not write header')
        );
        
        throw new Error(`FFmpeg failed (Code ${fallbackExitCode}).\n${fatalError ? `[원인]: ${fatalError}` : '브라우저 메모리 부족(대용량 파일) 혹은 인코딩 불가 포맷입니다.'}`);
      }
    }

    const data = await instance.readFile(outputName);
    
    // Cleanup
    try {
      await instance.deleteFile(inputName);
      await instance.deleteFile(outputName);
    } catch (e) {
      console.warn('Cleanup failed:', e);
    }

    const mimeMap: Record<string, string> = {
      'mp4': 'video/mp4',
      'webm': 'video/webm',
      'avi': 'video/x-msvideo',
      'mov': 'video/quicktime',
      'mkv': 'video/x-matroska',
      'flv': 'video/x-flv',
      'wmv': 'video/x-ms-wmv',
      'm4v': 'video/x-m4v',
      'ogv': 'video/ogg',
      '3gp': 'video/3gpp',
      'hevc': 'video/mp4',
      'gif': 'image/gif',
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'ogg': 'audio/ogg',
      'flac': 'audio/flac',
      'm4a': 'audio/mp4',
      'aac': 'audio/aac',
      'wma': 'audio/x-ms-wma',
      'opus': 'audio/opus',
      'amr': 'audio/amr',
      'alac': 'audio/mp4',
      'aiff': 'audio/x-aiff',
      'mka': 'audio/x-matroska',
      'ts': 'video/mp2t',
      'vob': 'video/x-ms-vob',
      'rmvb': 'video/vnd.rn-realvideo',
      'dv': 'video/x-dv',
      'mpg': 'video/mpeg',
      'mpeg': 'video/mpeg',
      'm2ts': 'video/mp2t',
      'mts': 'video/mp2t'
    };

    const mimeType = mimeMap[targetFormat] || 'application/octet-stream';

    return { blob: new Blob([(data as Uint8Array).buffer], { type: mimeType }), ext: targetFormat };
  } finally {
    instance.off('log', logHandler);
    instance.off('progress', progressHandler);
    releaseFFmpeg();
  }
}

