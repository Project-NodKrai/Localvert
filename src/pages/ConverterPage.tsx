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
    <div className="lv-app">
      <Header />
      <main className="lv-workspace">
        <header className="lv-page-intro">
          <div className="lv-page-eyebrow">LOCALVERT / CONVERT</div>
          <h1>파일 변환</h1>
          <p>이미지, 영상, 오디오, 문서의 형식을 브라우저에서 변환해.</p>
        </header>
        <FileUploader onFilesAdded={handleFilesAdded} mode="convert" />
        {hasHeicPngTask && (
          <p role="note" className="lv-inline-note">
            HEIC → PNG 변환에서는 디코딩된 크기를 추가 축소하거나 10MB로 재압축하지 않아.
            원본의 EXIF와 일부 HDR·광색역 색상 정보는 보존되지 않을 수 있어.
          </p>
        )}
        {tasks.length > 0 && (
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
        <p className="lv-workspace-note">파일 처리 작업은 이 브라우저에서 실행돼.</p>
      </main>
    </div>
  );
}
