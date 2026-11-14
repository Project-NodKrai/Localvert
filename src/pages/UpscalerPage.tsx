import { useState, useCallback, useEffect } from 'react';
import Header from '../components/Header';
import FileUploader from '../components/FileUploader';
import FileList from '../components/FileList';
import { Task, UpscaleTask, FileType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { upscaleImage, upscaleVideo } from '../lib/upscalers';
import { storeFile, removeStoredFile, clearStorage, getStoredFile } from '../lib/storage';
import { useTaskQueue } from '../lib/taskQueue';

function getFileType(file: File): FileType {
  const t = file.type;
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('image/')) return 'image';
  return 'unknown';
}

export default function UpscalerPage() {
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    clearStorage().catch(console.error);
  }, []);

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
        model: 'standard',
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
    let blob: Blob;
    if (task.type === 'image') blob = await upscaleImage(fileObj, task.model, onProgress);
    else if (task.type === 'video') blob = await upscaleVideo(task.id, fileObj, task.videoMethod, task.limitSeconds, onProgress);
    else throw new Error('이미지 또는 동영상만 복원할 수 있습니다.');
    return { blob, resultName: `upscaled_${task.file.name}` };
  };

  const { enqueue: handleRunTask, enqueueAll: handleRunAll, cancelTask } =
    useTaskQueue(tasks, setTasks, processTask);

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
    </div>
  );
}
