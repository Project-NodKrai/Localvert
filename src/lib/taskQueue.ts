import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Task } from '../types';
import type { UpscaleExecutionEvidence } from './upscalers/executionTrace';
import { snapshotQueueTask, assertJobResultAssociation } from './queueIdentity';
import { removeStoredFile } from './storage';

interface ProcessResult {
  blob: Blob;
  resultName: string;
  evidence?: UpscaleExecutionEvidence;
}

type TaskProcessor<T extends Task> = (task: T, onProgress: (progress: number) => void) => Promise<ProcessResult>;


/**
 * Browsers expose only approximate device information. Use conservative limits
 * for large/decoded files rather than treating CPU threads as RAM capacity.
 */
export function getQueueConcurrency(tasks: Task[]): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  const memory = typeof navigator !== 'undefined'
    ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory
    : undefined;

  let limit = 1;
  if (cores >= 12 && memory !== undefined && memory >= 8) limit = 10;
  else if (cores >= 8 && memory !== undefined && memory >= 8) limit = 5;
  else if (cores >= 6 && (memory === undefined || memory >= 4)) limit = 3;
  else if (cores >= 4 && (memory === undefined || memory >= 4)) limit = 2;

  // Safari and some other browsers do not report deviceMemory.
  if (memory === undefined) limit = Math.min(limit, 3);
  if (memory !== undefined && memory <= 2) limit = 1;

  // FFmpeg uses one shared WASM instance; TensorFlow upscaling is GPU-intensive.
  if (tasks.some((t) => t.mode === 'upscale' ||
    t.type === 'video' || t.type === 'audio' || t.type === 'unknown')) {
    return 1;
  }

  // HEIC decoding expands compressed images to large pixel buffers.
  if (tasks.some((t) => /\.(heic|heif)$/i.test(t.file.name))) {
    limit = Math.min(limit, 2);
  }

  if (tasks.some((t) => t.file.size >= 12 * 1024 * 1024 || t.type === 'archive')) {
    limit = Math.min(limit, 2);
  }

  return Math.max(1, limit);
}

/**
 * A single FIFO queue is shared by individual starts and 'process all'.
 * Removed tasks are never started, and their eventual results are discarded.
 * Running conversions cannot be interrupted until the underlying library returns.
 */
export function useTaskQueue<T extends Task>(
  tasks: T[],
  setTasks: Dispatch<SetStateAction<T[]>>,
  processor: TaskProcessor<T>
) {
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  const processorRef = useRef(processor);
  processorRef.current = processor;

  const pendingRef = useRef<string[]>([]);
  const runningRef = useRef<Set<string>>(new Set());
  const immutableJobsRef = useRef<Map<string, T>>(new Map());
  const cancelledRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  const pumpRef = useRef<() => void>(() => {});

  const updateTask = useCallback((id: string, updates: Partial<T>) => {
    tasksRef.current = tasksRef.current.map((t) => t.id === id ? { ...t, ...updates } : t);
    if (mountedRef.current) {
      setTasks((prev) => prev.map((t) => t.id === id ? { ...t, ...updates } : t));
    }
  }, [setTasks]);

  const pump = useCallback(() => {
    if (!mountedRef.current) return;

    const included = new Set([...pendingRef.current, ...runningRef.current]);
    const activeTasks = tasksRef.current.filter((t) => included.has(t.id));
    const concurrency = getQueueConcurrency(activeTasks);

    while (runningRef.current.size < concurrency && pendingRef.current.length) {
      const id = pendingRef.current.shift()!;
      // Processing always receives the settings captured by enqueueMany,
      // even if a React state update races with the queue's asynchronous pump.
      const task = immutableJobsRef.current.get(id);
      if (!task || !task.stored || cancelledRef.current.has(id)) {
        immutableJobsRef.current.delete(id);
        continue;
      }

      runningRef.current.add(id);
      updateTask(id, { status: 'processing', progress: 0, errorMsg: undefined } as Partial<T>);

      const progress = (value: number) => {
        if (!mountedRef.current || cancelledRef.current.has(id)) return;
        const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
        updateTask(id, { progress: safeValue } as Partial<T>);
      };

      void (async () => {
        try {
          const result = await processorRef.current(task, progress);
          if (!mountedRef.current || cancelledRef.current.has(id)) return;

          if (task.mode === 'upscale' && !result.evidence) {
            throw new Error('AI 복원 결과의 모델 실행 기록을 확인할 수 없어.');
          }
          assertJobResultAssociation(id, result.evidence);
          if (result.evidence && result.evidence.outputBytes !== result.blob.size) {
            throw new Error('완료된 작업의 출력 크기와 다운로드 Blob이 일치하지 않아.');
          }
          const url = URL.createObjectURL(result.blob);
          if (!mountedRef.current || cancelledRef.current.has(id)) {
            URL.revokeObjectURL(url);
            return;
          }

          updateTask(id, {
            status: 'done',
            progress: 100,
            stored: false,
            resultUrl: url,
            resultBlob: result.blob,
            resultEvidence: result.evidence,
            resultName: result.resultName,
            resultSize: result.blob.size,
          } as Partial<T>);

          // Do not keep another large input copy in IndexedDB after success.
          void removeStoredFile(id).catch(console.error);
        } catch (error) {
          console.error(error);
          if (mountedRef.current && !cancelledRef.current.has(id)) {
            updateTask(id, {
              status: 'error',
              errorMsg: error instanceof Error ? error.message : 'Processing failed',
            } as Partial<T>);
          }
        } finally {
          runningRef.current.delete(id);
          immutableJobsRef.current.delete(id);
          pumpRef.current();
        }
      })();
    }
  }, [updateTask]);

  pumpRef.current = pump;

  const enqueueJobs = useCallback((requested: readonly T[]) => {
    if (!mountedRef.current) return;

    const accepted: string[] = [];
    const pendingIds = new Set(pendingRef.current);
    for (const submitted of requested) {
      const current = tasksRef.current.find((t) => t.id === submitted.id);
      // Match both task identity and original File object. The supplied
      // settings can be an earlier confirmed snapshot, but must never be
      // paired with a different upload that happens to share an ID.
      if (current?.status === 'idle' && current.stored &&
          current.file === submitted.file && current.mode === submitted.mode &&
          !runningRef.current.has(current.id) && !pendingIds.has(current.id) &&
          !cancelledRef.current.has(current.id)) {
        accepted.push(current.id);
        pendingIds.add(current.id);
        immutableJobsRef.current.set(current.id, snapshotQueueTask(submitted) as T);
      }
    }
    if (!accepted.length) return;

    const acceptedIds = new Set(accepted);
    tasksRef.current = tasksRef.current.map((task) =>
      acceptedIds.has(task.id) ? ({ ...task, status: 'queued' } as T) : task
    );
    setTasks((prev) => prev.map((task) =>
      acceptedIds.has(task.id) ? ({ ...task, status: 'queued' } as T) : task
    ));

    pendingRef.current.push(...accepted);
    pumpRef.current();
  }, [setTasks]);

  const enqueueMany = useCallback((ids: string[]) => {
    const selected = ids.map(id => tasksRef.current.find(task => task.id === id))
      .filter((task): task is T => task !== undefined);
    enqueueJobs(selected);
  }, [enqueueJobs]);

  // Used after a warning confirmation: the selection is pinned at the first
  // Start click, not silently looked up again when the confirmation is accepted.
  const enqueueSnapshots = useCallback((snapshots: readonly T[]) => {
    enqueueJobs(snapshots);
  }, [enqueueJobs]);

  const updateUnqueuedTasks = useCallback((updater: (current: T[]) => T[]) => {
    // Updating the ref synchronously prevents a model-change + Start click
    // from reading the previous render's draft in the same browser tick.
    tasksRef.current = updater(tasksRef.current);
    setTasks(prev => updater(prev));
  }, [setTasks]);

  const getCurrentTasks = useCallback((): readonly T[] => tasksRef.current, []);

  const enqueue = useCallback((id: string) => enqueueMany([id]), [enqueueMany]);
  const enqueueAll = useCallback(() => {
    enqueueMany(tasksRef.current.filter((t) => t.status === 'idle' && t.stored).map((t) => t.id));
  }, [enqueueMany]);

  const cancelTask = useCallback((id: string) => {
    cancelledRef.current.add(id);
    pendingRef.current = pendingRef.current.filter((pendingId) => pendingId !== id);
    immutableJobsRef.current.delete(id);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      pendingRef.current = [];
      immutableJobsRef.current.clear();
      for (const id of runningRef.current) cancelledRef.current.add(id);
    };
  }, []);

  return { enqueue, enqueueAll, enqueueSnapshots, cancelTask, updateUnqueuedTasks, getCurrentTasks };
}
