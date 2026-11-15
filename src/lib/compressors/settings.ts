export type CompressionMode = 'simple' | 'advanced';
export type ImageOutput = 'original' | 'jpeg' | 'webp' | 'png';
export type VideoResolution = 'original' | '1080p' | '720p' | '480p';
export type VideoPreset = 'ultrafast' | 'veryfast' | 'medium';
export type CompressionSettings = {
  mode?: CompressionMode;
  maxWidth?: number;
  keepMetadata?: boolean;
  imageFormat?: ImageOutput;
  imageQuality?: number;
  resolution?: VideoResolution;
  mute?: boolean;
  videoCrf?: number;
  videoPreset?: VideoPreset;
  audioBitrate?: number;
};

export function clamp(value: number, low: number, high: number): number {
  return Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : low;
}

/** All ordinary UI sliders use compression STRENGTH: 0=light, 100=strong. */
export function imageOptions(strength: number, settings: CompressionSettings, originalBytes: number, extension: string) {
  const s = clamp(strength, 0, 100);
  const advanced = settings.mode === 'advanced';
  const requested = advanced ? settings.imageFormat || 'original' : 'original';
  let format: 'jpeg' | 'webp' | 'png';
  if (requested !== 'original') format = requested;
  else if (['jpg', 'jpeg'].includes(extension)) format = 'jpeg';
  else if (extension === 'webp') format = 'webp';
  else if (extension === 'png') format = 'png';
  else format = 'webp'; // unsupported formats: encode to a working, smaller output
  const imageQuality = advanced && settings.imageQuality !== undefined
    ? clamp(settings.imageQuality, 10, 100) / 100
    : clamp(0.96 - s * 0.0075, 0.2, 0.96);
  const maxWidthOrHeight = advanced
    ? settings.maxWidth || undefined
    : s <= 25 ? undefined : s <= 50 ? 3840 : s <= 75 ? 2560 : 1920;
  return {
    fileType: format === 'jpeg' ? 'image/jpeg' : 'image/' + format,
    ext: format === 'jpeg' ? 'jpg' : format,
    initialQuality: imageQuality,
    maxWidthOrHeight,
    maxSizeMB: Math.max(0.05, originalBytes / (1024 * 1024) * (1 - s * 0.007)),
    preserveExif: advanced && !!settings.keepMetadata && format === 'jpeg',
    useWebWorker: true,
    alwaysKeepResolution: !maxWidthOrHeight,
  };
}

export function videoOptions(strength: number, settings: CompressionSettings) {
  const s = clamp(strength, 0, 100);
  const advanced = settings.mode === 'advanced';
  const crf = advanced && settings.videoCrf !== undefined
    ? Math.round(clamp(settings.videoCrf, 18, 40))
    : Math.round(19 + s * 0.18);
  const preset: VideoPreset = advanced ? settings.videoPreset || 'veryfast' : 'veryfast';
  const resolution: VideoResolution = advanced ? settings.resolution || 'original' : 'original';
  const bitrate = advanced ? Math.round(clamp(settings.audioBitrate ?? 128, 64, 256)) : 128;
  return { crf, preset, resolution, mute: advanced && !!settings.mute, audioBitrate: bitrate };
}

export function scaleFilter(resolution: VideoResolution): string | null {
  const height = resolution === '1080p' ? 1080 : resolution === '720p' ? 720 : resolution === '480p' ? 480 : null;
  if (!height) return null;
  // Keep orientation and aspect ratio, never upscale; H.264 requires even dimensions.
  return "scale=w='min(iw,1920)':h='min(ih," + height + ")':force_original_aspect_ratio=decrease:force_divisible_by=2";
}

export function outputIsSmaller(candidateBytes: number, originalBytes: number): boolean {
  return candidateBytes > 0 && candidateBytes < originalBytes;
}
