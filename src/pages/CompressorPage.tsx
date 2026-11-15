import { useState, useCallback } from 'react';
import Header from '../components/Header';
import FileUploader from '../components/FileUploader';
import FileList from '../components/FileList';
import { Task, CompressTask, FileType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { compressImage, compressVideo } from '../lib/compressors';
import { storeFile, removeStoredFile, getStoredFile } from '../lib/storage';
import { useTaskQueue } from '../lib/taskQueue';

function getFileType(file: File): FileType {
  const t = file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (t.startsWith('video/') || ['mp4', 'webm', 'avi', 'mov', 'mkv', 'wmv', 'm4v', 'ogv', '3gp', 'flv'].includes(ext)) return 'video';
  if (t.startsWith('image/') || ['heic', 'heif', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'].includes(ext)) return 'image';
  return 'unknown';
}

export default function CompressorPage() {
  const [tasks, setTasks] = useState<Task[]>([]);


  const handleFilesAdded = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const newTasks: Task[] = fileArray.map((file) => {
      const id = uuidv4();
      const type = getFileType(file);
      
      return {
        id,
        file,
        type,
        mode: 'compress',
        quality: 50,
        settings: {
          mode: 'simple',
          imageFormat: 'original',
          resolution: 'original',
          mute: false,
          keepMetadata: false,
          videoPreset: 'veryfast',
          audioBitrate: 128,
        },
        status: 'storing',
        progress: 0,
        stored: false,
      } as CompressTask;
    });
    
    setTasks((prev) => [...prev, ...newTasks]);

    for (const task of newTasks) {
      try {
        await storeFile(task.id, task.file);
        setTasks((prev) => 
          prev.map((t) => (t.id === task.id ? { ...t, status: 'idle', stored: true } : t))
        );
      } catch (err) {
        console.error('Failed to store file:', err);
        setTasks((prev) => 
          prev.map((t) => (t.id === task.id ? { ...t, status: 'error', errorMsg: 'Local storage failed' } : t))
        );
      }
    }
  }, []);

  const handleTaskUpdate = (id: string, updates: Partial<CompressTask>) => {
    setTasks((prev) => prev.map((t) => (t.id === id && t.mode === 'compress' ? { ...t, ...updates } : t)));
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
    if (task.mode !== 'compress') throw new Error('Invalid task type');
    let blob: Blob;
    if (task.type === 'image') blob = await compressImage(fileObj, task.quality, task.settings);
    else if (task.type === 'video') blob = await compressVideo(task.id, fileObj, task.quality, task.settings, onProgress);
    else throw new Error('이미지 또는 동영상만 압축할 수 있습니다.');
    const sourceStem = task.file.name.replace(/\.[^.]+$/, '');
    const originalExt = task.file.name.split('.').pop()?.toLowerCase() || '';
    const outputExt = task.type === 'video'
      ? (blob === fileObj ? originalExt : 'mp4')
      : blob === fileObj ? originalExt
      : blob.type === 'image/jpeg' ? 'jpg'
      : blob.type === 'image/webp' ? 'webp'
      : blob.type === 'image/png' ? 'png'
      : originalExt;
    return { blob, resultName: `compressed_${sourceStem}.${outputExt}` };
  };

  const { enqueue: handleRunTask, enqueueAll: handleRunAll, cancelTask } =
    useTaskQueue(tasks, setTasks, processTask);

  return (
    <div className="min-h-screen bg-neutral-900 text-white font-sans selection:bg-red-500/30">
      <Header />
      <main className="pt-12 pb-24 px-4 w-full max-w-5xl mx-auto flex flex-col items-center">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 text-white tracking-tight">용량 압축</h1>
          <h2 className="text-xl text-neutral-400 font-light max-w-2xl">
            이미지와 영상 파일의 용량을 로컬에서 안전하게 줄여보세요.
          </h2>
        </div>

        {tasks.length === 0 ? (
          <FileUploader onFilesAdded={handleFilesAdded} mode="compress" />
        ) : (
          <FileList
            tasks={tasks}
            mode="compress"
            onFormatChange={() => {}}
            onQualityChange={(id, q) => handleTaskUpdate(id, { quality: q })}
            onTaskUpdate={handleTaskUpdate}
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
