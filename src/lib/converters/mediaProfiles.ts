/**
 * FFmpeg output profiles. The extension determines the actual container and
 * encoder; a failed encoder must not silently yield a mislabeled file.
 */
export type MediaInputKind = 'audio' | 'video' | 'image';
export const AUDIO_OUTPUT_FORMATS = [
  'mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a', 'wma', 'opus', 'aiff', 'mka',
] as const;
export const VIDEO_OUTPUT_FORMATS = [
  'mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'm4v', 'ogv', '3gp', 'hevc',
] as const;
export const MEDIA_IMAGE_OUTPUT_FORMATS = ['gif', 'jpg', 'jpeg', 'png', 'webp'] as const;
export const UNSUPPORTED_MEDIA_OUTPUT_FORMATS = {
  amr: '이 FFmpeg WASM 엔진에는 AMR-NB 오디오 인코더가 포함되어 있지 않아.',
  alac: 'ALAC는 오디오 코덱으로, .alac 전용 파일 컨테이너가 아니야. 무손실 ALAC 파일은 .m4a로 저장해야 해.',
} as const;

const audioSet = new Set<string>(AUDIO_OUTPUT_FORMATS);
const videoSet = new Set<string>(VIDEO_OUTPUT_FORMATS);
const imageSet = new Set<string>(MEDIA_IMAGE_OUTPUT_FORMATS);

export function isMediaTarget(format: string): boolean {
  return audioSet.has(format) || videoSet.has(format) || imageSet.has(format);
}

export function buildMediaOutputArgs(format: string, kind: MediaInputKind): string[] {
  const target = format.toLowerCase();
  if (target in UNSUPPORTED_MEDIA_OUTPUT_FORMATS) {
    throw new Error(UNSUPPORTED_MEDIA_OUTPUT_FORMATS[target as keyof typeof UNSUPPORTED_MEDIA_OUTPUT_FORMATS]);
  }
  if (kind === 'image' && audioSet.has(target)) {
    throw new Error('이미지에 오디오 트랙이 없어 음성 포맷으로 변환할 수 없어.');
  }
  if (kind === 'audio' && !audioSet.has(target)) {
    throw new Error('오디오만 있는 파일은 영상이나 이미지 포맷으로 변환할 수 없어.');
  }
  if (audioSet.has(target)) {
    switch (target) {
      case 'mp3': return ['-vn', '-c:a', 'libmp3lame', '-q:a', '3', '-f', 'mp3'];
      case 'wav': return ['-vn', '-c:a', 'pcm_s16le', '-f', 'wav'];
      case 'ogg': return ['-vn', '-c:a', 'libvorbis', '-q:a', '5', '-f', 'ogg'];
      case 'aac': return ['-vn', '-c:a', 'aac', '-b:a', '192k', '-f', 'adts'];
      case 'flac': return ['-vn', '-c:a', 'flac', '-f', 'flac'];
      case 'm4a': return ['-vn', '-c:a', 'aac', '-b:a', '192k', '-f', 'ipod'];
      case 'wma': return ['-vn', '-c:a', 'wmav2', '-b:a', '192k', '-f', 'asf'];
      case 'opus': return ['-vn', '-c:a', 'libopus', '-b:a', '128k', '-f', 'opus'];
      case 'aiff': return ['-vn', '-c:a', 'pcm_s16be', '-f', 'aiff'];
      case 'mka': return ['-vn', '-c:a', 'flac', '-f', 'matroska'];
    }
  }
  if (imageSet.has(target)) {
    if (target === 'gif') return ['-an', '-vf', 'fps=10,scale=320:-1:flags=lanczos', '-c:v', 'gif', '-f', 'gif'];
    if (target === 'png') return ['-an', '-frames:v', '1', '-c:v', 'png', '-f', 'image2'];
    if (target === 'webp') return ['-an', '-frames:v', '1', '-c:v', 'libwebp', '-q:v', '88', '-f', 'image2'];
    return ['-an', '-frames:v', '1', '-c:v', 'mjpeg', '-q:v', '2', '-f', 'image2'];
  }
  switch (target) {
    case 'mp4': return ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-f', 'mp4', '-movflags', '+faststart'];
    case 'webm': return ['-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '4', '-b:v', '1M', '-c:a', 'libvorbis', '-f', 'webm'];
    case 'avi': return ['-c:v', 'mpeg4', '-q:v', '5', '-c:a', 'libmp3lame', '-f', 'avi'];
    case 'mov': return ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-f', 'mov'];
    case 'mkv': return ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-f', 'matroska'];
    case 'flv': return ['-c:v', 'flv', '-q:v', '5', '-c:a', 'libmp3lame', '-f', 'flv'];
    case 'wmv': return ['-c:v', 'wmv2', '-b:v', '1200k', '-c:a', 'wmav2', '-f', 'asf'];
    case 'm4v': return ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-f', 'ipod'];
    case 'ogv': return ['-c:v', 'libtheora', '-q:v', '5', '-c:a', 'libvorbis', '-f', 'ogg'];
    case '3gp': return ['-c:v', 'mpeg4', '-b:v', '400k', '-c:a', 'aac', '-f', '3gp'];
    case 'hevc': return ['-an', '-c:v', 'libx265', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p10le', '-f', 'hevc'];
    default: throw new Error('변환 엔진에서 지원하지 않는 출력 형식: ' + format);
  }
}

const starts = (bytes: Uint8Array, codes: number[], offset = 0): boolean =>
  codes.every((n, i) => bytes[offset + i] === n);
const ascii = (bytes: Uint8Array, text: string, offset = 0): boolean =>
  [...text].every((s, i) => bytes[offset + i] === s.charCodeAt(0));

/** Validate the container signature before letting the UI report success. */
export function matchesMediaSignature(data: Uint8Array, format: string): boolean {
  if (data.length < 12) return false;
  switch (format) {
    case 'mp4': case 'mov': case 'm4v': case 'm4a':
      return ascii(data, 'ftyp', 4);
    case '3gp':
      return ascii(data, 'ftyp', 4) && (
        ascii(data, '3gp', 8) || ascii(data, '3g2', 8));
    case 'webm': case 'mkv': case 'mka':
      return starts(data, [0x1a, 0x45, 0xdf, 0xa3]);
    case 'avi': return ascii(data, 'RIFF') && ascii(data, 'AVI ', 8);
    case 'wav': return ascii(data, 'RIFF') && ascii(data, 'WAVE', 8);
    case 'webp': return ascii(data, 'RIFF') && ascii(data, 'WEBP', 8);
    case 'flv': return ascii(data, 'FLV');
    case 'wmv': case 'wma':
      return starts(data, [0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11]);
    case 'ogv': case 'ogg': case 'opus': return ascii(data, 'OggS');
    case 'flac': return ascii(data, 'fLaC');
    case 'aiff': return ascii(data, 'FORM') && (ascii(data, 'AIFF', 8) || ascii(data, 'AIFC', 8));
    case 'gif': return ascii(data, 'GIF8');
    case 'png': return starts(data, [137, 80, 78, 71, 13, 10, 26, 10]);
    case 'jpg': case 'jpeg': return starts(data, [0xff, 0xd8]);
    case 'mp3': return ascii(data, 'ID3') || (data[0] === 0xff && (data[1] & 0xe0) === 0xe0);
    case 'aac': return data[0] === 0xff && (data[1] & 0xf6) === 0xf0;
    case 'hevc':
      return starts(data, [0, 0, 0, 1]) || starts(data, [0, 0, 1]);
    default: return false;
  }
}

export const MEDIA_MIME: Record<string, string> = {
  mp4: 'video/mp4', webm: 'video/webm', avi: 'video/x-msvideo',
  mov: 'video/quicktime', mkv: 'video/x-matroska', flv: 'video/x-flv',
  wmv: 'video/x-ms-wmv', m4v: 'video/x-m4v', ogv: 'video/ogg',
  '3gp': 'video/3gpp', hevc: 'video/h265', gif: 'image/gif',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
  aac: 'audio/aac', flac: 'audio/flac', m4a: 'audio/mp4',
  wma: 'audio/x-ms-wma', opus: 'audio/opus', aiff: 'audio/aiff',
  mka: 'audio/x-matroska', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png', webp: 'image/webp',
};
