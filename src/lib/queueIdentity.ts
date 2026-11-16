import type { Task } from '../types';
import type { UpscaleExecutionEvidence } from './upscalers/executionTrace';
import { normalizeModelId } from './upscalers/catalog';

export function snapshotQueueTask<T extends Task>(task: T): Readonly<T> {
  // Freeze the top-level execution fields. Each task gets a separate identity,
  // while source File objects remain immutable browser objects.
  const copy = { ...task } as T;
  return Object.freeze(copy);
}

/**
 * Cross-check the result against the *queued job*, not the mutable React UI.
 * Verifying just jobId (or Blob size) cannot detect a result tagged with the
 * wrong model or an AI request silently executed by the FFmpeg filter.
 */
export function assertJobResultAssociation(
  id: string,
  evidence?: UpscaleExecutionEvidence,
  queuedTask?: Task,
): void {
  if (!evidence) return;
  if (evidence.jobId !== id) {
    throw new Error('완료된 처리 결과의 작업 ID가 현재 작업과 달라.');
  }
  if (!queuedTask || queuedTask.mode !== 'upscale') return;
  const modelId = normalizeModelId(queuedTask.model);
  if (evidence.requestedModelId !== modelId) {
    throw new Error('완료된 결과의 요청 모델이 큐에 등록된 모델과 달라.');
  }
  if (queuedTask.type === 'video' && queuedTask.videoMethod === 'filter') {
    if (evidence.engine !== 'ffmpeg-filter' || evidence.effectiveModelId !== null ||
        evidence.inferenceCalls !== 0) {
      throw new Error('빠른 필터 작업에 AI 복원 결과가 잘못 연결됐어.');
    }
    return;
  }
  if (evidence.effectiveModelId !== modelId || evidence.inferenceCalls < 1 ||
      evidence.engine === 'ffmpeg-filter' || !evidence.resource) {
    throw new Error('AI 복원 결과의 실제 모델이 큐에 등록된 모델과 달라.');
  }
}

