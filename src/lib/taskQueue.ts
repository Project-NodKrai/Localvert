import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Task } from '../types';
import type { UpscaleExecutionEvidence } from './upscalers/executionTrace';
import { removeStoredFile } from './storage';

interface ProcessResult {
  blob: Blob;
  resultName: string;
  evidence?: UpscaleExecutionEvidence;
}

type TaskProcessor<T extends Task> = (task: T, onProgress: (progress: number) => void) => Promise<ProcessResult>;

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

          assertJobResultAssociation(id, result.evidence);
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

  const enqueueMany = useCallback((ids: string[]) => {
    if (!mountedRef.current) return;

    const accepted: string[] = [];
    const pendingIds = new Set(pendingRef.current);
    for (const id of ids) {
      const task = tasksRef.current.find((t) => t.id === id);
      if (task?.status === 'idle' && task.stored &&
          !runningRef.current.has(id) && !pendingIds.has(id) &&
          !cancelledRef.current.has(id)) {
        accepted.push(id);
        pendingIds.add(id);
        // Freeze job-level selections at registration, not at GPU initialization.
        immutableJobsRef.current.set(id, snapshotQueueTask(task) as T);
      }
    }
    if (!accepted.length) return;

    const acceptedIds = new Set(accepted);
    tasksRef.current = tasksRef.current.map((t) =>
      acceptedIds.has(t.id) ? ({ ...t, status: 'queued' } as T) : t
    );
    setTasks((prev) => prev.map((t) =>
      acceptedIds.has(t.id) ? ({ ...t, status: 'queued' } as T) : t
    ));

    pendingRef.current.push(...accepted);
    pumpRef.current();
  }, [setTasks]);

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

  return { enqueue, enqueueAll, cancelTask };
}
