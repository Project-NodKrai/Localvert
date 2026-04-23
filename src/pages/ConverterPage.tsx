import { useState, useCallback, useEffect } from 'react';
import Header from '../components/Header';
import FileUploader from '../components/FileUploader';
import FileList from '../components/FileList';
import PreUploadSettings from '../components/PreUploadSettings';
import { Task, ConvertTask, FileType, FORMATS } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { processConversion } from '../lib/converters';
import { storeFile, removeStoredFile, clearStorage, getStoredFile } from '../lib/storage';

function getFileType(file: File): FileType {
  const t = file.type;
  const name = file.name.toLowerCase();
  
  if (t.startsWith('video/') || name.endsWith('.hevc') || name.endsWith('.h265')) return 'video';
  if (t.startsWith('audio/') || name.endsWith('.alac')) return 'audio';
  if (t.startsWith('image/') || name.endsWith('.heic') || name.endsWith('.heif') || name.endsWith('.svg')) return 'image';
  
  const docExts = ['.xlsx', '.xls', '.csv', '.json', '.ods', '.html', '.txt', '.rtf', '.pdf', '.docx'];
  if (
    t.includes('spreadsheet') ||
    t.includes('excel') ||
    t === 'text/csv' ||
    t === 'application/json' ||
    docExts.some(ext => name.endsWith(ext))
  )
    return 'document';
    
  if (t === 'application/zip' || name.endsWith('.zip')) return 'archive';

  return 'unknown';
}

export default function ConverterPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [defaultOptions, setDefaultOptions] = useState({
    targetFormat: 'mp4'
  });

  useEffect(() => {
    clearStorage().catch(console.error);
  }, []);

  const handleFilesAdded = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const newTasks: Task[] = fileArray.map((file) => {
      const id = uuidv4();
      const type = getFileType(file);
      
      let possibleFormats = FORMATS[type] || [];
      if (type === 'video' || type === 'audio') {
        possibleFormats = Array.from(new Set([...FORMATS.video, ...FORMATS.audio]));
      } else if (type === 'unknown') {
        possibleFormats = FORMATS.unknown;
      }
      
      const targetFormat = possibleFormats.includes(defaultOptions.targetFormat) 
        ? defaultOptions.targetFormat 
        : (possibleFormats[0] || '');

      return {
        id,
        file,
        type,
        mode: 'convert',
        targetFormat,
        status: 'storing',
        progress: 0,
        stored: false,
      } as ConvertTask;
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

  const handleTargetFormatChange = (id: string, format: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id && t.mode === 'convert' ? { ...t, targetFormat: format } : t)));
  };

  const handleTargetFormatChangeAll = (format: string) => {
    setTasks((prev) => prev.map((t) => (t.mode === 'convert' ? { ...t, targetFormat: format } : t)));
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
    if (!task || task.status === 'processing' || !task.stored || task.mode !== 'convert') return;

    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'processing', progress: 0 } : t)));

    try {
      const storedFile = await getStoredFile(id);
      if (!storedFile) throw new Error('File not found in local storage');
      const fileObj = new File([storedFile], task.file.name, { type: task.file.type });

      const { blob, ext } = await processConversion(id, fileObj, task.type, task.targetFormat, (progress) => {
        setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, progress } : t)));
      });

      const url = URL.createObjectURL(blob);
      const resName = `${task.file.name.split('.').slice(0, -1).join('.')}.${ext}`;

      setTasks((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, status: 'done', progress: 100, resultUrl: url, resultName: resName, resultSize: blob.size } : t
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
          <h1 className="text-4xl md:text-5xl font-bold mb-4 text-white tracking-tight">파일 변환</h1>
          <h2 className="text-xl text-neutral-400 font-light max-w-2xl">
            100% 로컬 환경에서 어떤 포맷이든 자유롭게 변환하세요.
          </h2>
        </div>

        {tasks.length === 0 ? (
          <>
            <PreUploadSettings 
              mode="convert" 
              settings={defaultOptions} 
              onUpdate={(u) => setDefaultOptions(prev => ({ ...prev, ...u }))} 
            />
            <FileUploader onFilesAdded={handleFilesAdded} mode="convert" />
          </>
        ) : (
          <FileList
            tasks={tasks}
            mode="convert"
            onFormatChange={handleTargetFormatChange}
            onQualityChange={() => {}}
            onFormatChangeAll={handleTargetFormatChangeAll}
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
