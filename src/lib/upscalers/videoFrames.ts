import { activeModel, isRunnableSelection } from './catalog';
import type { UpscaleModelSelection, UpscaleTier, UpscaleUse } from './catalog';

/** Validate the chosen executable model, not the tier name or last used default. */
export function validateVideoModel(
  modelId: UpscaleModelSelection,
  tier?: UpscaleTier,
  purpose?: UpscaleUse,
): UpscaleModelSelection {
  const model = activeModel(modelId);
  if (!isRunnableSelection(modelId, tier ?? model.tier, purpose ?? '동영상')) {
    throw new Error('선택한 등급과 용도에 맞는 영상 프레임 AI 모델이 없어.');
  }
  return modelId;
}

/**
 * FFmpeg prints frame rate in its "Video:" stream metadata.
 * Never silently force 30fps: that changes the duration of 24/25/60fps sources.
 */
export function parseVideoFrameRate(lines: readonly string[]): number {
  for (const line of lines) {
    if (!line.includes('Video:')) continue;
    const match = line.match(/(?:,\s*|\s)(\d+(?:\.\d+)?)\s+fps(?:,|\s|$)/i);
    if (!match) continue;
    const fps = Number(match[1]);
    if (Number.isFinite(fps) && fps >= 1 && fps <= 240) return fps;
  }
  throw new Error('원본 동영상의 프레임 속도를 확인할 수 없어. 잘못된 속도로 저장하지 않도록 작업을 중단했어.');
}

/** Resample VFR sources to uniform frame spacing before individual image inference. */
export function videoFrameExtractArgs(
  inputName: string, outputPattern: string, frameRate: number, limitSeconds?: number,
): string[] {
  if (!Number.isFinite(frameRate) || frameRate < 1 || frameRate > 240) {
    throw new Error('원본 FPS가 올바르지 않아.');
  }
  return [
    '-hide_banner', '-y', '-i', inputName,
    ...(limitSeconds && Number.isFinite(limitSeconds) && limitSeconds > 0 ? ['-t', String(limitSeconds)] : []),
    '-vf', 'fps=' + frameRate,
    '-start_number', '1',
    '-f', 'image2', outputPattern,
  ];
}

/** FFmpeg reports the number of frames it actually encoded. */
export function parseEncodedFrameCount(lines: readonly string[]): number | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const matched = lines[i].match(/\bframe=\s*(\d+)/i);
    if (!matched) continue;
    const count = Number(matched[1]);
    if (Number.isSafeInteger(count) && count > 0) return count;
  }
  return null;
}

export function videoFrameEncodeArgs(
  framePattern: string,
  originalName: string,
  outputName: string,
  frameRate: number,
  frameCount: number,
): string[] {
  if (!Number.isFinite(frameRate) || frameRate <= 0 || !Number.isInteger(frameCount) || frameCount < 1) {
    throw new Error('영상 프레임 수 또는 FPS가 올바르지 않아.');
  }
  const duration = (frameCount / frameRate).toFixed(6);
  return [
    '-hide_banner', '-y', '-framerate', String(frameRate),
    '-i', framePattern,
    '-i', originalName,
    '-map', '0:v:0',
    '-map', '1:a:0?',
    '-c:v', 'libx264', '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k',
    '-t', duration,
    '-movflags', '+faststart',
    '-f', 'mp4', outputName,
  ];
}
