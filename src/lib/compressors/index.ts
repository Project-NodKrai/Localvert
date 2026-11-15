import imageCompression from 'browser-image-compression';
import { acquireFFmpeg, releaseFFmpeg } from '../converters/media';
import { imageOptions, outputIsSmaller, scaleFilter, videoOptions } from './settings';
import type { CompressionSettings } from './settings';

async function prepareImage(file: File): Promise<File> {
  if (!/\.(heic|heif)$/i.test(file.name)) return file;
  const { default: heic2any } = await import('heic2any');
  const decoded = await heic2any({ blob: file, toType: 'image/png' });
  const png = Array.isArray(decoded) ? decoded[0] : decoded;
  if (!png) throw new Error('HEIC 이미지 디코딩에 실패했어.');
  return new File([png], file.name.replace(/\.(heic|heif)$/i, '.png'), { type: 'image/png' });
}

export async function compressImage(file: File, strength: number, settings: CompressionSettings): Promise<Blob> {
  const prepared = await prepareImage(file);
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const options = imageOptions(strength, settings, prepared.size, ext);
  const sameContainer = (ext === options.ext || (ext === 'jpeg' && options.ext === 'jpg'));
  try {
    const candidate = await imageCompression(prepared, options);
    if (candidate.type !== options.fileType) {
      throw new Error('브라우저 인코더가 요청한 ' + options.ext.toUpperCase() + ' 형식을 생성하지 못했어.');
    }
    // A default compression must never enlarge an existing same-format image.
    // Advanced users explicitly requesting a format/dimension can still keep it.
    if (sameContainer && (settings.mode !== 'advanced' || settings.imageFormat === 'original') &&
        !outputIsSmaller(candidate.size, file.size)) {
      return file;
    }
    return candidate;
  } catch (error) {
    throw new Error('이미지 압축 실패: ' + (error instanceof Error ? error.message : String(error)));
  }
}

export async function compressVideo(
  id: string,
  file: File,
  strength: number,
  settings: CompressionSettings,
  onProgress?: (p: number) => void,
): Promise<Blob> {
  const opts = videoOptions(strength, settings);
  const instance = await acquireFFmpeg();
  const safeId = id.replace(/[^A-Za-z0-9_-]/g, '');
  const ext = file.name.split('.').pop()?.replace(/[^A-Za-z0-9]/g, '') || 'mp4';
  const inputName = 'compress_' + safeId + '_input.' + ext;
  const outputName = 'compress_' + safeId + '_output.mp4';
  const progressHandler = ({ progress }: { progress: number }) => {
    if (onProgress && Number.isFinite(progress)) onProgress(Math.round(Math.max(0, Math.min(1, progress)) * 100));
  };
  instance.on('progress', progressHandler);
  try {
    const inputBytes = new Uint8Array(await file.arrayBuffer());
    if (!inputBytes.length) throw new Error('빈 영상은 압축할 수 없어.');
    await instance.writeFile(inputName, inputBytes);
    const filter = scaleFilter(opts.resolution);
    const args = [
      '-hide_banner', '-y', '-i', inputName,
      '-map', '0:v:0', ...(opts.mute ? [] : ['-map', '0:a?']),
      '-c:v', 'libx264', '-crf', String(opts.crf), '-preset', opts.preset,
      '-pix_fmt', 'yuv420p',
      ...(filter ? ['-vf', filter] : []),
      ...(opts.mute ? ['-an'] : ['-c:a', 'aac', '-b:a', String(opts.audioBitrate) + 'k']),
      '-movflags', '+faststart', '-f', 'mp4', outputName,
    ];
    const exitCode = await instance.exec(args);
    if (exitCode !== 0) throw new Error('영상 인코더가 종료 코드 ' + exitCode + '로 실패했어.');
    const result = await instance.readFile(outputName);
    if (typeof result === 'string') throw new Error('영상 출력이 바이너리 파일이 아니야.');
    const data = new Uint8Array(result);
    if (data.length < 12 || String.fromCharCode(...data.slice(4, 8)) !== 'ftyp') {
      throw new Error('압축 결과가 유효한 MP4 컨테이너가 아니야.');
    }
    if (onProgress) onProgress(100);
    if (/\.mp4$/i.test(file.name) && opts.resolution === 'original' && !opts.mute &&
        !outputIsSmaller(data.byteLength, file.size)) {
      return file;
    }
    return new Blob([data], { type: 'video/mp4' });
  } finally {
    instance.off('progress', progressHandler);
    try { await instance.deleteFile(inputName); } catch {}
    try { await instance.deleteFile(outputName); } catch {}
    releaseFFmpeg();
  }
}
