import { activeModel, isRunnableSelection, normalizeModelId } from './catalog';
import type { UpscaleTask } from '../../types';

export type UpscaleJobSnapshot = Readonly<{
  jobId: string;
  inputName: string;
  mediaType: 'image' | 'video';
  tier: string;
  purpose: string;
  requestedModelId: string;
  videoMethod: 'filter' | 'ai';
  scale: number;
  limitSeconds?: number;
}>;

export type UpscaleExecutionEvidence = Readonly<{
  jobId: string;
  requestedModelId: string;
  effectiveModelId: string | null;
  engine: string;
  resource: string | null;
  modelGraphSha256?: string;
  inferenceCalls: number;
  inferredFrames: number;
  encodedFrames: number;
  inputSha256?: string;
  outputSha256?: string;
  outputBytes: number;
  cacheHit: boolean;
}>;

/** No UI or React state is read after this snapshot is created. */
export function makeUpscaleJobSnapshot(task: UpscaleTask): UpscaleJobSnapshot {
  if (task.type !== 'image' && task.type !== 'video') throw new Error('잘못된 복원 작업 종류야.');
  const model = activeModel(task.model);
  const tier = task.upscaleTier ?? model.tier;
  const purpose = task.upscalePurpose ?? (task.type === 'image' ? '실사' : '동영상');
  if (!isRunnableSelection(task.model, tier, purpose) &&
      (task.type === 'image' || task.videoMethod === 'ai')) {
    throw new Error('선택한 모델과 등급·용도가 일치하지 않아.');
  }
  return Object.freeze({
    jobId: task.id,
    inputName: task.file.name,
    mediaType: task.type,
    tier,
    purpose,
    requestedModelId: normalizeModelId(task.model),
    videoMethod: task.videoMethod,
    scale: model.scale ?? 1,
    limitSeconds: task.limitSeconds,
  });
}

async function sha256(blob: Blob): Promise<string | undefined> {
  // Very large browser files should not be copied into a hash buffer merely
  // for diagnostic output; provenance remains available without the digest.
  if (blob.size > 128 * 1024 * 1024 || typeof crypto === 'undefined' || !crypto.subtle) return undefined;
  const buffer = await blob.arrayBuffer();
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Records the model selected by the *inference engine*, never by the UI alone.
 * If no backend actually executes it, an AI job cannot be marked successful.
 */
export class UpscaleExecutionTrace {
  readonly snapshot: UpscaleJobSnapshot;
  private effective: string | null = null;
  private engineName = '';
  private resourceName: string | null = null;
  private modelGraphHash: string | undefined;
  private calls = 0;
  private frames = 0;
  private encoded = 0;
  private cacheHit = false;

  constructor(snapshot: UpscaleJobSnapshot) { this.snapshot = snapshot; }

  recordInference(modelId: string, engine: string, resource: string, modelGraphSha256?: string) {
    if (this.snapshot.mediaType === 'video' && this.snapshot.videoMethod === 'filter') {
      throw new Error('빠른 필터 작업에서 AI 모델 추론을 기록할 수 없어.');
    }
    if (modelId !== this.snapshot.requestedModelId) {
      throw new Error('요청한 모델과 실제 실행한 모델이 다르므로 작업을 중단했어.');
    }
    if (this.effective && this.effective !== modelId) {
      throw new Error('작업 도중 다른 AI 모델이 적용됐어.');
    }
    this.effective = modelId;
    this.engineName = engine;
    this.resourceName = resource;
    this.modelGraphHash = modelGraphSha256;
    this.calls++;
  }

  recordFilter() {
    if (this.snapshot.mediaType !== 'video' || this.snapshot.videoMethod !== 'filter') {
      throw new Error('AI 모델 작업을 빠른 필터로 처리할 수 없어.');
    }
    this.engineName = 'ffmpeg-filter';
    this.resourceName = 'unsharp+scale(lanczos,1.5x)';
    this.effective = null;
  }

  recordInferredFrame() { this.frames++; }
  recordEncodedFrames(count: number) { this.encoded = count; }
  markCacheHit() { this.cacheHit = true; }

  async finish(input: Blob, output: Blob): Promise<UpscaleExecutionEvidence> {
    if (!output.size) throw new Error('출력 데이터가 비어 있어.');
    if (this.snapshot.videoMethod === 'ai' || this.snapshot.mediaType === 'image') {
      if (!this.effective || this.calls < 1) {
        throw new Error('선택한 AI 모델의 실제 추론 수행 기록이 없어.');
      }
      if (this.snapshot.mediaType === 'video' &&
          (this.frames < 1 || this.frames !== this.encoded)) {
        throw new Error('추론한 영상 프레임 수와 인코딩 프레임 수가 일치하지 않아.');
      }
    } else if (this.engineName !== 'ffmpeg-filter') {
      throw new Error('빠른 필터 처리 실행 기록이 없어.');
    }
    const [inputSha256, outputSha256] = await Promise.all([sha256(input), sha256(output)]);
    const evidence = Object.freeze({
      jobId: this.snapshot.jobId,
      requestedModelId: this.snapshot.requestedModelId,
      effectiveModelId: this.effective,
      engine: this.engineName,
      resource: this.resourceName,
      modelGraphSha256: this.modelGraphHash,
      inferenceCalls: this.calls,
      inferredFrames: this.frames,
      encodedFrames: this.encoded,
      inputSha256, outputSha256,
      outputBytes: output.size,
      cacheHit: this.cacheHit,
    });
    console.info('[LocalVert upscale execution]', evidence);
    return evidence;
  }
}
