import { useState, useCallback } from 'react';
import Header from '../components/Header';
import FileUploader from '../components/FileUploader';
import FileList from '../components/FileList';
import { Task, ConvertTask, FileType, FORMATS } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { processConversion } from '../lib/converters';
import { storeFile, removeStoredFile, getStoredFile } from '../lib/storage';
import { useTaskQueue } from '../lib/taskQueue';

function getFileType(file: File): FileType {
  const t = file.type;
  const name = file.name.toLowerCase();
  
  const extension = name.split('.').pop() || '';
  if (t.startsWith('video/') || ['mp4','webm','avi','mov','mkv','flv','wmv','m4v','ogv','3gp','hevc','h265'].includes(extension)) return 'video';
  if (t.startsWith('audio/') || ['mp3','wav','ogg','aac','flac','m4a','wma','opus','amr','alac','aiff','mka'].includes(extension)) return 'audio';
  if (t.startsWith('image/') || ['png','jpg','jpeg','webp','gif','bmp','tiff','tif','ico','avif','heic','heif','svg'].includes(extension)) return 'image';
  
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
  const hasHeicPngTask = tasks.some(
    (task) => task.mode === 'convert' && /\.(heic|heif)$/i.test(task.file.name) && task.targetFormat === 'png'
  );


  const handleFilesAdded = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const newTasks: Task[] = fileArray.map((file) => {
      const id = uuidv4();
      const type = getFileType(file);
      
      let possibleFormats = FORMATS[type] || [];
      if (type === 'unknown') {
        possibleFormats = FORMATS.unknown;
      }
      
      return {
        id,
        file,
        type,
        mode: 'convert',
        targetFormat: possibleFormats[0] || '',
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
    setTasks((prev) => prev.map((t) => (t.id === id && t.mode === 'convert' && FORMATS[t.type]?.includes(format) ? { ...t, targetFormat: format } : t)));
  };

  const handleTargetFormatChangeAll = (format: string) => {
    setTasks((prev) => prev.map((t) => (t.mode === 'convert' && FORMATS[t.type]?.includes(format) ? { ...t, targetFormat: format } : t)));
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
    if (task.mode !== 'convert') throw new Error('Invalid task type');
    const { blob, ext } = await processConversion(task.id, fileObj, task.type, task.targetFormat, onProgress);
    return {
      blob,
      resultName: `${task.file.name.split('.').slice(0, -1).join('.') || task.file.name}.${ext}`
    };
  };

  const { enqueue: handleRunTask, enqueueAll: handleRunAll, cancelTask } =
    useTaskQueue(tasks, setTasks, processTask);

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

        {hasHeicPngTask && (
          <p role="note" className="w-full max-w-4xl mb-5 rounded-lg border border-neutral-700 bg-neutral-800/50 px-4 py-3 text-sm text-neutral-300">
            HEIC → PNG는 디코딩된 해상도를 추가 축소하거나 10MB로 재압축하지 않습니다.
            단, 원본 EXIF 메타데이터는 보존되지 않으며 HDR·광색역 색상 정보도 온전히 유지되지 않을 수 있습니다.
          </p>
        )}

        {tasks.length === 0 ? (
          <FileUploader onFilesAdded={handleFilesAdded} mode="convert" />
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
