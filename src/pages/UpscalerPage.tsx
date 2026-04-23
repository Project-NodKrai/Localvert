import { useState, useCallback, useEffect } from 'react';
import Header from '../components/Header';
import FileUploader from '../components/FileUploader';
import FileList from '../components/FileList';
import PreUploadSettings from '../components/PreUploadSettings';
import { Task, UpscaleTask, FileType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { upscaleImage, upscaleVideo } from '../lib/upscalers';
import { storeFile, removeStoredFile, clearStorage, getStoredFile } from '../lib/storage';

function getFileType(file: File): FileType {
  const t = file.type;
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('image/')) return 'image';
  return 'unknown';
}

export default function UpscalerPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [defaultOptions, setDefaultOptions] = useState({
    model: 'standard',
    videoMethod: 'filter',
  });

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
        model: defaultOptions.model as any,
        videoMethod: defaultOptions.videoMethod as any,
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
    setTasks((prev) => {
      const taskToRemove = prev.find((t) => t.id === id);
      if (taskToRemove?.resultUrl) URL.revokeObjectURL(taskToRemove.resultUrl);
      return prev.filter((t) => t.id !== id);
    });
    removeStoredFile(id).catch(console.error);
  };

  const handleRunTask = async (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task || task.status === 'processing' || !task.stored || task.mode !== 'upscale') return;

    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'processing', progress: 0 } : t)));

    try {
      const storedFile = await getStoredFile(id);
      if (!storedFile) throw new Error('File not found in local storage');
      const fileObj = new File([storedFile], task.file.name, { type: task.file.type });

      let resultBlob: Blob;
      if (task.type === 'image') {
        resultBlob = await upscaleImage(fileObj, task.model, (progress) => {
          setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, progress } : t)));
        });
      } else if (task.type === 'video') {
        resultBlob = await upscaleVideo(id, fileObj, task.videoMethod, task.limitSeconds, (progress) => {
          setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, progress } : t)));
        });
      } else {
        throw new Error('전송한 파일 타입은 아직 고화질 복원을 지원하지 않습니다 (이미지/비디오 전용)');
      }

      const url = URL.createObjectURL(resultBlob);
      const resName = `upscaled_${task.file.name}`;

      setTasks((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, status: 'done', progress: 100, resultUrl: url, resultName: resName, resultSize: resultBlob.size } : t
        )
      );
    } catch (error: any) {
      console.error(error);
      setTasks((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, status: 'error', errorMsg: error.message || 'Processing failed' } : t
        )
      );
    }
  };

  const handleRunAll = () => {
    tasks.filter((t) => t.status === 'idle').forEach((t) => handleRunTask(t.id));
  };

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
          <>
            <PreUploadSettings 
              mode="upscale" 
              settings={defaultOptions} 
              onUpdate={(u) => setDefaultOptions(prev => ({ ...prev, ...u }))} 
            />
            <FileUploader onFilesAdded={handleFilesAdded} mode="upscale" />
          </>
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
