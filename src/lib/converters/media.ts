import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { buildMediaOutputArgs, matchesMediaSignature, MEDIA_MIME } from './mediaProfiles';

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
      const next = queue.shift();
      if (next) next();
      throw new Error('FFmpeg 엔진을 불러올 수 없어. 네트워크 및 브라우저 보안 설정을 확인해 줘.');
    }
  }
  return ffmpeg;
}

export function releaseFFmpeg() {
  ffmpegBusy = false;
  const next = queue.shift();
  if (next) next();
}

const AUDIO_INPUTS = new Set([
  'mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a', 'wma', 'opus', 'amr', 'alac', 'aiff', 'mka',
]);
const IMAGE_INPUTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff', 'tif', 'ico', 'avif']);
const VIDEO_INPUTS = new Set(['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'm4v', 'ogv', '3gp', 'hevc', 'h265', 'gif']);

function sourceKind(file: File): 'image' | 'audio' | 'video' {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (AUDIO_INPUTS.has(ext)) return 'audio';
  if (IMAGE_INPUTS.has(ext)) return 'image';
  if (VIDEO_INPUTS.has(ext)) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('image/')) return 'image';
  return 'video';
}

export async function convertMedia(
  id: string,
  file: File,
  targetFormat: string,
  onProgress?: (p: number) => void,
): Promise<{ blob: Blob; ext: string }> {
  const target = targetFormat.toLowerCase();
  const kind = sourceKind(file);
  // Validate before loading the expensive WASM engine or allocating its FS.
  const outputArgs = buildMediaOutputArgs(target, kind);
  const instance = await acquireFFmpeg();
  const logs: string[] = [];
  const progressHandler = ({ progress }: { progress: number }) => {
    if (onProgress && Number.isFinite(progress)) onProgress(Math.max(0, Math.min(100, Math.round(progress * 100))));
  };
  const logHandler = ({ message }: { message: string }) => {
    logs.push(message);
    if (logs.length > 60) logs.shift();
  };
  instance.on('progress', progressHandler);
  instance.on('log', logHandler);

  const extension = (file.name.split('.').pop() || 'bin').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');
  const inputName = 'localvert_' + safeId + '_in.' + extension;
  const outputName = 'localvert_' + safeId + '_out.' + target;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!bytes.length) throw new Error('빈 입력 파일은 변환할 수 없어.');
    await instance.writeFile(inputName, bytes);

    const inputArgs = kind === 'image'
      ? ['-loop', '1', '-framerate', '24', '-i', inputName]
      : ['-i', inputName];
    // Static image -> video: produce a short 3-second still video.
    const stillToVideo = kind === 'image' && !['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(target);
    const args = [
      '-hide_banner', '-y', ...inputArgs,
      ...(stillToVideo ? ['-t', '3'] : []),
      ...outputArgs,
      outputName,
    ];
    const exit = await instance.exec(args);
    if (exit !== 0) {
      const summary = logs.slice(-8).filter(line => /error|invalid|unknown|not found|unsupported|could not|encoder/i.test(line));
      throw new Error('FFmpeg ' + target.toUpperCase() + ' 변환 실패 (코드 ' + exit + '). ' +
        (summary.join(' | ') || '입력 파일이나 브라우저 FFmpeg 코덱 지원을 확인해 줘.'));
    }

    const result = await instance.readFile(outputName);
    if (typeof result === 'string') throw new Error('FFmpeg가 바이너리 파일 대신 텍스트를 반환했어.');
    const data = new Uint8Array(result);
    if (!matchesMediaSignature(data, target)) {
      throw new Error('변환 출력이 실제 ' + target.toUpperCase() + ' 형식과 일치하지 않아 다운로드를 중단했어.');
    }
    if (onProgress) onProgress(100);
    return { blob: new Blob([data], { type: MEDIA_MIME[target] || 'application/octet-stream' }), ext: target };
  } finally {
    instance.off('progress', progressHandler);
    instance.off('log', logHandler);
    try { await instance.deleteFile(inputName); } catch {}
    try { await instance.deleteFile(outputName); } catch {}
    releaseFFmpeg();
  }
}
