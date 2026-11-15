import { useState, useCallback, useMemo } from 'react';
import Header from '../components/Header';
import FileUploader from '../components/FileUploader';
import FileList from '../components/FileList';
import { Task, UpscaleTask, FileType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { upscaleImage, upscaleVideo } from '../lib/upscalers';
import { adviseImageUpscale, detectDeviceHints } from '../lib/upscalers/performance';
import { activeModel, isRunnableSelection } from '../lib/upscalers/catalog';
import { storeFile, removeStoredFile, getStoredFile } from '../lib/storage';
import { useTaskQueue } from '../lib/taskQueue';

function getFileType(file: File): FileType {
  const t = file.type;
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('image/')) return 'image';
  return 'unknown';
}

export default function UpscalerPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const deviceHints = useMemo(() => detectDeviceHints(), []);
  const [pendingConfirmation, setPendingConfirmation] = useState<{ ids: string[]; messages: string[] } | null>(null);


  const handleFilesAdded = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const newTasks: Task[] = fileArray.map((file) => {
      const id = uuidv4();
      const type = getFileType(file);
      
      return {
        id,
        file,
        type,
        mode: 'upscale',
        model: type === 'video' ? 'quicksrnet-small-4x' : 'esrgan-slim-2x',
        upscaleTier: type === 'video' ? 'nano' : 'standard',
        upscalePurpose: type === 'video' ? '동영상' : '실사',
        videoMethod: 'filter',
        limitSeconds: 10,
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
  }, []);

  const handleTaskUpdate = (id: string, updates: Partial<UpscaleTask>) => {
    setTasks((prev) => prev.map((t) => (t.id === id && t.mode === 'upscale' ? { ...t, ...updates } : t)));
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
    let blob: Blob;
    if (task.type === 'image') blob = await upscaleImage(fileObj, task.model, onProgress);
    else if (task.type === 'video') blob = await upscaleVideo(task.id, fileObj, task.videoMethod, task.limitSeconds, onProgress, task.model);
    else throw new Error('이미지 또는 동영상만 복원할 수 있습니다.');
    const stem = task.file.name.replace(/\.[^.]+$/, '');
    const ext = task.type === 'image' ? 'png' : 'mp4';
    return { blob, resultName: `upscaled_${stem}.${ext}` };
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
      window.alert('선택한 등급과 용도에 실행 가능한 모델이 없어. 설정에서 사용 가능한 모델을 선택해 줘.');
      return;
    }
    if (warnings.length) {
      setPendingConfirmation({ ids: chosen.map(task => task.id), messages: warnings });
    } else {
      chosen.forEach(task => enqueue(task.id));
    }
  };

  const confirmProcessing = () => {
    if (!pendingConfirmation) return;
    pendingConfirmation.ids.forEach(id => enqueue(id));
    setPendingConfirmation(null);
  };

  const handleRunTask = (id: string) => requestProcessing([id]);
  const handleRunAll = () => requestProcessing(tasks.filter(task => task.status === 'idle').map(task => task.id));

  return (
    <div className="min-h-screen bg-neutral-900 text-white font-sans selection:bg-red-500/30">
      <Header />
      <main className="pt-12 pb-24 px-4 w-full max-w-5xl mx-auto flex flex-col items-center">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 text-white tracking-tight">AI 고화질 복원</h1>
          <h2 className="text-xl text-neutral-400 font-light max-w-2xl">
            저화질의 사진과 영상을 AI 딥러닝 기술로 선명하게 되살려보세요. 100% 로컬에서 작동합니다.
          </h2>
        </div>

        {tasks.length === 0 ? (
          <FileUploader onFilesAdded={handleFilesAdded} mode="upscale" />
        ) : (
          <FileList
            tasks={tasks}
            mode="upscale"
            onFormatChange={() => {}}
            onQualityChange={() => {}}
            onTaskUpdate={(id, updates) => handleTaskUpdate(id, updates as Partial<UpscaleTask>)}
            onFormatChangeAll={() => {}}
            onRemove={handleRemoveTask}
            onProcess={handleRunTask}
            onProcessAll={handleRunAll}
            onAddMore={handleFilesAdded}
          />
        )}
      </main>
      {pendingConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div role="alertdialog" aria-modal="true" aria-labelledby="upscale-warning-title"
            className="w-full max-w-lg rounded-2xl border border-amber-700/40 bg-neutral-900 p-6 shadow-2xl">
            <h2 id="upscale-warning-title" className="mb-3 text-lg font-bold text-amber-300">
              이 기기에서는 복원이 느리거나 실패할 수 있어
            </h2>
            <p className="mb-3 text-sm text-neutral-300">
              권장 사양에 못 미쳐도 직접 실행할 수 있어. 메모리 부족이나 브라우저 종료에 대비해 원본 파일은 보관해 줘.
            </p>
            <ul className="mb-5 list-disc space-y-2 pl-5 text-sm text-neutral-300">
              {pendingConfirmation.messages.map(message => <li key={message}>{message}</li>)}
            </ul>
            <div className="flex flex-wrap justify-end gap-3">
              <button type="button" onClick={() => setPendingConfirmation(null)}
                className="rounded-lg bg-neutral-700 px-4 py-2 text-white hover:bg-neutral-600">취소</button>
              <button type="button" onClick={confirmProcessing}
                className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-500">
                그래도 실행
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
