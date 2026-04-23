import { useState, useCallback, useEffect } from 'react';
import Header from '../components/Header';
import FileUploader from '../components/FileUploader';
import FileList from '../components/FileList';
import PreUploadSettings from '../components/PreUploadSettings';
import { Task, CompressTask, FileType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { compressImage, compressVideo } from '../lib/compressors';
import { storeFile, removeStoredFile, clearStorage, getStoredFile } from '../lib/storage';

function getFileType(file: File): FileType {
  const t = file.type;
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('audio/')) return 'audio';
  if (t.startsWith('image/')) return 'image';
  return 'unknown';
}

export default function CompressorPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [defaultOptions, setDefaultOptions] = useState({
    quality: 80,
    resolution: 'original',
    mute: false,
    keepMetadata: false,
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
        mode: 'compress',
        quality: defaultOptions.quality,
        settings: {
          resolution: defaultOptions.resolution as any,
          mute: defaultOptions.mute,
          keepMetadata: defaultOptions.keepMetadata,
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
    setTasks((prev) => {
      const taskToRemove = prev.find((t) => t.id === id);
      if (taskToRemove?.resultUrl) URL.revokeObjectURL(taskToRemove.resultUrl);
      return prev.filter((t) => t.id !== id);
    });
    removeStoredFile(id).catch(console.error);
  };

  const handleRunTask = async (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task || task.status === 'processing' || !task.stored || task.mode !== 'compress') return;

    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'processing', progress: 0 } : t)));

    try {
      const storedFile = await getStoredFile(id);
      if (!storedFile) throw new Error('File not found in local storage');
      const fileObj = new File([storedFile], task.file.name, { type: task.file.type });

      let resultBlob: Blob;
      if (task.type === 'image') {
        resultBlob = await compressImage(fileObj, task.quality, task.settings);
      } else if (task.type === 'video') {
        resultBlob = await compressVideo(id, fileObj, task.quality, task.settings, (progress) => {
          setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, progress } : t)));
        });
      } else {
        throw new Error('전송한 파일 타입은 아직 압축을 지원하지 않습니다 (이미지/비디오 전용)');
      }

      const url = URL.createObjectURL(resultBlob);
      const resName = `compressed_${task.file.name}`;

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
          <h1 className="text-4xl md:text-5xl font-bold mb-4 text-white tracking-tight">용량 압축</h1>
          <h2 className="text-xl text-neutral-400 font-light max-w-2xl">
            이미지와 영상 파일의 용량을 로컬에서 안전하게 줄여보세요.
          </h2>
        </div>

        {tasks.length === 0 ? (
          <>
            <PreUploadSettings 
              mode="compress" 
              settings={defaultOptions} 
              onUpdate={(u) => setDefaultOptions(prev => ({ ...prev, ...u }))} 
            />
            <FileUploader onFilesAdded={handleFilesAdded} mode="compress" />
          </>
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
