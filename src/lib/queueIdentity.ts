import type { Task } from '../types';
import type { UpscaleExecutionEvidence } from './upscalers/executionTrace';

export function snapshotQueueTask<T extends Task>(task: T): Readonly<T> {
  // Freeze the top-level execution fields. Each task gets a separate identity,
  // while source File objects remain immutable browser objects.
  const copy = { ...task } as T;
  return Object.freeze(copy);
}

export function assertJobResultAssociation(id: string, evidence?: UpscaleExecutionEvidence): void {
  if (evidence && evidence.jobId !== id) {
    throw new Error('완료된 처리 결과의 작업 ID가 현재 작업과 달라.');
  }
}

