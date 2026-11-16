import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import Header from '../components/Header';
import UpscaleStudio from '../components/upscale/UpscaleStudio';
import { DEFAULT_STUDIO_PROFILES, updateStudioProfile, isStudioProfileRunnable, canAcceptStudioFile } from '../lib/upscalers/studio';
import type { StudioMedia, StudioViewMode, StudioProfile } from '../lib/upscalers/studio';
import { Task, UpscaleTask, FileType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { upscaleImage, upscaleVideo } from '../lib/upscalers';
import { UpscaleExecutionTrace, makeUpscaleJobSnapshot } from '../lib/upscalers/executionTrace';
import { adviseImageUpscale, detectDeviceHints } from '../lib/upscalers/performance';
import { activeModel, isRunnableSelection } from '../lib/upscalers/catalog';
import { storeFile, removeStoredFile, getStoredFile } from '../lib/storage';
import { useTaskQueue } from '../lib/taskQueue';

function getFileType(file: File): FileType {
  if (canAcceptStudioFile('video', file)) return 'video';
  if (canAcceptStudioFile('image', file)) return 'image';
  return 'unknown';
}

type UpscaleSnackbar =
  | { kind: 'notice'; messages: string[] }
  | { kind: 'confirm'; messages: string[]; ids: string[] };

export default function UpscalerPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [studioMedia, setStudioMedia] = useState<StudioViewMode>('image');
  const [studioProfiles, setStudioProfiles] =
    useState<Record<StudioMedia, StudioProfile>>(DEFAULT_STUDIO_PROFILES);
  const deviceHints = useMemo(() => detectDeviceHints(), []);
  const [snackbar, setSnackbar] = useState<UpscaleSnackbar | null>(null);

  // Only informational warnings disappear automatically. A confirmation must
  // remain available until the user chooses Cancel or "그래도 실행".
  useEffect(() => {
    if (snackbar?.kind !== 'notice') return;
    const timeout = window.setTimeout(() => {
      setSnackbar(current => current === snackbar ? null : current);
    }, 5500);
    return () => window.clearTimeout(timeout);
  }, [snackbar]);

  const handleFilesAdded = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const newTasks: Task[] = fileArray.map((file) => {
      const id = uuidv4();
      const type = getFileType(file);
      const profile = type === 'video' ? studioProfiles.video : studioProfiles.image;
      return {
        id,
        file,
        type,
        mode: 'upscale',
        model: profile.model,
        upscaleTier: profile.upscaleTier,
        upscalePurpose: profile.upscalePurpose,
        videoMethod: profile.videoMethod,
        limitSeconds: profile.limitSeconds,
        status: 'storing',
        progress: 0,
        stored: false,
      } as UpscaleTask;
    });
    
    setTasks((prev) => [...prev, ...newTasks]);

    for (const task of newTasks) {
      try {
        await storeFile(task.id, task.file);
        
        let width = 0;
        let height = 0;

        if (task.type === 'image') {
          const img = new Image();
          img.src = URL.createObjectURL(task.file);
          await new Promise((resolve) => (img.onload = resolve));
          width = img.width;
          height = img.height;
          URL.revokeObjectURL(img.src);
        } else if (task.type === 'video') {
          const video = document.createElement('video');
          video.src = URL.createObjectURL(task.file);
          await new Promise((resolve) => (video.onloadedmetadata = resolve));
          width = video.videoWidth;
          height = video.videoHeight;
          URL.revokeObjectURL(video.src);
        }

        setTasks((prev) => 
          prev.map((t) => (t.id === task.id ? { ...t, status: 'idle', stored: true, width, height } : t))
        );
      } catch (err) {
        console.error('Failed to store file:', err);
        setTasks((prev) => 
          prev.map((t) => (t.id === task.id ? { ...t, status: 'error', errorMsg: 'Local storage failed' } : t))
        );
      }
    }
  }, [studioProfiles]);

  const handleStudioProfileChange = (media: StudioViewMode, updates: Partial<StudioProfile>) => {
    const targets: StudioMedia[] = media === 'mixed' ? ['image', 'video'] : [media];
    const nextProfiles = { ...studioProfiles };
    for (const target of targets) {
      // Selecting a video AI tier/model must NEVER keep running the
      // model-independent FFmpeg filter. Only an explicit filter choice can do so.
      const chosen = media === 'mixed' ? { upscaleTier: updates.upscaleTier } : updates;
      const aiSelectionChanged = chosen.model !== undefined ||
        chosen.upscaleTier !== undefined || chosen.upscalePurpose !== undefined;
      nextProfiles[target] = updateStudioProfile(nextProfiles[target], target === 'video' && aiSelectionChanged
        ? { ...chosen, videoMethod: 'ai' }
        : chosen);
    }
    setStudioProfiles(nextProfiles);

    // Changes apply only to idle uploads; queue and completed jobs are immutable.
    const affected = tasks.filter(task =>
      task.mode === 'upscale' && targets.includes(task.type as StudioMedia) && task.status === 'idle') as UpscaleTask[];
    setTasks(prev => prev.map(task => {
      if (task.mode !== 'upscale' || task.status !== 'idle' || !targets.includes(task.type as StudioMedia)) return task;
      const profile = nextProfiles[task.type as StudioMedia];
      return {
        ...task,
        model: profile.model, upscaleTier: profile.upscaleTier,
        upscalePurpose: profile.upscalePurpose,
        videoMethod: profile.videoMethod, limitSeconds: profile.limitSeconds,
      };
    }));

    const warnings = [...new Set(affected.flatMap(task => {
      const target = task.type as StudioMedia;
      const profile = nextProfiles[target];
      if (!isStudioProfileRunnable(profile, target) || (target === 'video' && profile.videoMethod === 'filter')) return [];
      return adviseImageUpscale(profile.model, task.width ?? 0, task.height ?? 0, deviceHints).warnings;
    }))];
    if (warnings.length) setSnackbar({ kind: 'notice', messages: warnings });
    else setSnackbar(current => current?.kind === 'notice' ? null : current);
  };

  const handleRemoveTask = (id: string) => {
    cancelTask(id);
    setTasks((prev) => {
      const taskToRemove = prev.find((t) => t.id === id);
      if (taskToRemove?.resultUrl) URL.revokeObjectURL(taskToRemove.resultUrl);
      return prev.filter((t) => t.id !== id);
    });
    removeStoredFile(id).catch(console.error);
  };

  const processTask = async (task: Task, onProgress: (progress: number) => void) => {
    const storedFile = await getStoredFile(task.id);
    if (!storedFile) throw new Error('File not found in local storage');
    const fileObj = new File([storedFile], task.file.name, { type: task.file.type });
    if (task.mode !== 'upscale') throw new Error('Invalid task type');
    if ((task.type === 'image' || (task.type === 'video' && task.videoMethod === 'ai')) &&
      !isRunnableSelection(task.model, task.upscaleTier ?? activeModel(task.model).tier,
        task.upscalePurpose ?? (task.type === 'video' ? '동영상' : '실사'))) {
      throw new Error('선택한 등급과 용도에 실행 가능한 모델이 없어. 복원 설정에서 모델을 다시 선택해 줘.');
    }
    const trace = new UpscaleExecutionTrace(makeUpscaleJobSnapshot(task));
    let blob: Blob;
    if (task.type === 'image') blob = await upscaleImage(fileObj, task.model, onProgress, trace);
    else if (task.type === 'video') blob = await upscaleVideo(task.id, fileObj, task.videoMethod, task.limitSeconds, onProgress, task.model, trace);
    else throw new Error('이미지 또는 동영상만 복원할 수 있습니다.');
    const evidence = await trace.finish(fileObj, blob);
    const stem = task.file.name.replace(/\.[^.]+$/, '');
    const ext = task.type === 'image' ? 'png' : 'mp4';
    return { blob, evidence, resultName: `upscaled_${stem}.${ext}` };
  };

  const { enqueue, cancelTask } =
    useTaskQueue(tasks, setTasks, processTask);

  // Warnings are advisory. Even an underpowered device may process the image if
  // the user explicitly chooses to continue. The shared queue remains in charge.
  const requestProcessing = (ids: string[]) => {
    const chosen = tasks.filter(task => ids.includes(task.id) && task.status === 'idle' && task.stored);
    if (!chosen.length) return;
    const warnings: string[] = [];
    for (const task of chosen) {
      if (task.mode !== 'upscale') continue;
      if (task.type === 'image') {
        const advice = adviseImageUpscale(task.model, task.width ?? 0, task.height ?? 0, deviceHints);
        for (const warning of advice.warnings) {
          if (!warnings.includes(warning)) warnings.push(warning);
        }
      } else if (task.type === 'video' && task.videoMethod === 'ai') {
        const advice = adviseImageUpscale(task.model, task.width ?? 0, task.height ?? 0, deviceHints);
        for (const warning of advice.warnings) if (!warnings.includes(warning)) warnings.push(warning);
        const message = '동영상 AI 복원은 영상의 모든 프레임을 순서대로 처리해서 시간이 오래 걸릴 수 있어.';
        if (!warnings.includes(message)) warnings.push(message);
      }
    }
    if (chosen.some(task => task.mode === 'upscale' &&
      (task.type === 'image' || (task.type === 'video' && task.videoMethod === 'ai')) &&
      !isRunnableSelection(task.model, task.upscaleTier ?? activeModel(task.model).tier,
        task.upscalePurpose ?? (task.type === 'video' ? '동영상' : '실사')))) {
      setSnackbar({ kind: 'notice', messages: ['선택한 등급과 용도에 실행 가능한 모델이 없어. 설정에서 다른 모델을 선택해 줘.'] });
      return;
    }
    if (warnings.length) {
      setSnackbar({ kind: 'confirm', ids: chosen.map(task => task.id), messages: warnings });
    } else {
      setSnackbar(null);
      chosen.forEach(task => enqueue(task.id));
    }
  };

  const confirmProcessing = () => {
    if (snackbar?.kind !== 'confirm') return;
    const ids = snackbar.ids;
    setSnackbar(null);
    ids.forEach(id => {
      if (tasks.some(task => task.id === id && task.status === 'idle' && task.stored)) enqueue(id);
    });
  };

  const handleRunTask = (id: string) => requestProcessing([id]);

  return (
    <div className="min-h-screen bg-[#F7F9FD] text-[#1B2741] font-sans selection:bg-[#3C7AF2]/20">
      <Header variant="upscale" />
      <UpscaleStudio
        tasks={tasks.filter((task): task is UpscaleTask => task.mode === 'upscale')}
        media={studioMedia}
        profiles={studioProfiles}
        onMediaChange={setStudioMedia}
        onProfileChange={handleStudioProfileChange}
        onFilesAdded={handleFilesAdded}
        onProcess={handleRunTask}
        onProcessAll={requestProcessing}
        onRemove={handleRemoveTask}
      />
      {snackbar && typeof document !== 'undefined' && createPortal(
        <div role="alert" aria-live="assertive"
          className={`fixed left-1/2 z-[100] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 rounded-2xl border border-[#45536F] bg-[#25324E] p-4 text-white shadow-[0_12px_30px_rgba(12,23,48,.25)] ${snackbar.kind === 'notice' ? 'top-4 sm:top-6' : 'bottom-[185px] sm:bottom-[195px]'}`}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#F3C96F]" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[#F6D98E]">
                {snackbar.kind === 'confirm' ? '복원이 느리거나 실패할 수 있어' : '복원 사양 안내'}
              </p>
              <div className="mt-1 max-h-28 space-y-1 overflow-y-auto text-xs leading-relaxed text-neutral-300">
                {snackbar.messages.map(message => <p key={message}>{message}</p>)}
              </div>
            </div>
            <button type="button" aria-label="알림 닫기" onClick={() => setSnackbar(null)}
              className="shrink-0 rounded-full p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white">
              <X size={18} />
            </button>
          </div>
          {snackbar.kind === 'confirm' && (
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setSnackbar(null)}
                className="rounded-lg bg-neutral-700 px-3 py-2 text-sm text-white hover:bg-neutral-600">
                취소
              </button>
              <button type="button" onClick={confirmProcessing}
                className="rounded-lg bg-[#276DF7] px-3 py-2 text-sm font-semibold text-white hover:bg-[#1758DA]">
                그래도 실행
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
