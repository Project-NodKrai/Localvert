import { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Task, AppMode, ConvertTask, CompressTask, UpscaleTask } from '../types';
import { X, Settings, Download, Plus, Play } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { FormatSelector } from './FormatSelector';
import AdvancedSettings from './AdvancedSettings';

interface FileListProps {
  tasks: Task[];
  mode: AppMode;
  onFormatChange: (id: string, format: string) => void;
  onQualityChange: (id: string, quality: number) => void;
  onTaskUpdate?: (id: string, updates: Partial<Task>) => void;
  onFormatChangeAll: (format: string) => void;
  onRemove: (id: string) => void;
  onProcess: (id: string) => void;
  onProcessAll: () => void;
  onAddMore: (files: FileList | File[]) => void;
}

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export default function FileList({ 
  tasks, 
  mode,
  onFormatChange, 
  onQualityChange,
  onTaskUpdate,
  onFormatChangeAll, 
  onRemove, 
  onProcess, 
  onProcessAll, 
  onAddMore 
}: FileListProps) {
  const [settingsTask, setSettingsTask] = useState<Task | null>(null);
  
  const allIdle = tasks.some(t => t.status === 'idle');
  const isProcessing = tasks.some(t => t.status === 'processing');

  const getModeLabel = () => {
    if (mode === 'convert') return '변환';
    if (mode === 'compress') return '압축';
    if (mode === 'upscale') return 'AI 복원';
    return '';
  };

  return (
    <div className="w-full max-w-4xl bg-neutral-800 rounded-xl shadow-xl overflow-hidden flex flex-col border border-neutral-700">
      <div className="flex-1 overflow-y-auto min-h-[300px] max-h-[60vh] p-0 m-0 relative">
        <ul className="divide-y divide-neutral-700 m-0">
          {tasks.map(task => (
            <li key={task.id} className="flex flex-col md:flex-row items-start md:items-center p-4 gap-4 hover:bg-neutral-800/80 transition-colors">
              
              <div className="flex-1 min-w-0 flex items-center gap-3 w-full md:w-auto">
                <div className="shrink-0 w-10 h-10 rounded flex items-center justify-center font-bold text-xs bg-neutral-700 text-neutral-300">
                  {task.status === 'done' 
                    ? (task.resultName?.split('.').pop() || '').toUpperCase() 
                    : (task.file.name.split('.').pop() || '').toUpperCase()}
                </div>
                <div className="flex flex-col truncate">
                  <span className="truncate text-neutral-200 font-medium">
                    {task.status === 'done' ? task.resultName : task.file.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-500 text-xs">{formatBytes(task.file.size)}</span>
                    {task.status === 'done' && task.resultSize && (
                      <>
                        <span className="text-neutral-600 text-[10px]">→</span>
                        <span className="text-green-500 text-xs font-bold">{formatBytes(task.resultSize)}</span>
                        {task.resultSize < task.file.size && (
                          <span className="bg-green-500/10 text-green-500 text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-1 border border-green-500/20">
                            {Math.round((1 - task.resultSize / task.file.size) * 100)}% save
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end shrink-0">
                
                {task.status === 'storing' && (
                  <div className="flex flex-col w-32 md:w-48 gap-1">
                    <span className="text-xs text-red-400 italic font-mono uppercase tracking-tighter text-right">Storing Local...</span>
                    <Progress value={45} className="h-1 animate-pulse bg-red-900" />
                  </div>
                )}

                {task.status === 'idle' && (
                  <div className="flex items-center gap-4">
                    {task.mode === 'convert' ? (
                      <div className="flex items-center gap-2">
                        <span className="text-neutral-500 text-sm">에</span>
                        <FormatSelector 
                          currentFormat={(task as ConvertTask).targetFormat}
                          onFormatChange={(f) => onFormatChange(task.id, f)}
                          defaultCategory={task.type}
                          disabled={task.type === 'unknown'}
                        />
                      </div>
                    ) : task.mode === 'compress' ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-tight">Compression</span>
                        <span className="text-xs text-red-500 font-mono font-bold">Q:{(task as CompressTask).quality}%</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-tight">AI Upscale</span>
                        <span className="text-xs text-red-500 font-mono font-bold">
                          {(task as UpscaleTask).type === 'image' ? (task as UpscaleTask).model.toUpperCase() : (task as UpscaleTask).videoMethod.toUpperCase()}
                        </span>
                        {(task as UpscaleTask).width && (task as UpscaleTask).width! > 4000 && (
                          <div className="group relative">
                            <span className="text-[9px] bg-yellow-500/20 text-yellow-500 px-1 rounded animate-pulse cursor-help">GPU Warn</span>
                            <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-neutral-900 border border-neutral-700 rounded-lg text-[10px] text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-2xl leading-tight">
                              출력 해상도가 16384px에 근접합니다. GPU 메모리 보호를 위해 <span className="text-yellow-500 font-bold">자동 분할 처리(Tiling)</span> 모드가 활성화됩니다.
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {(task.mode === 'compress' || task.mode === 'upscale') && (
                      <button 
                        onClick={() => setSettingsTask(task)}
                        className="text-neutral-400 hover:text-white p-2 hover:bg-neutral-700 rounded-xl transition-all"
                        title="설정"
                      >
                        <Settings className="w-5 h-5 focus:rotate-90 transition-transform duration-500" />
                      </button>
                    )}
                  </div>
                )}

                {task.status === 'processing' && (
                  <div className="flex flex-col w-32 md:w-48 gap-1">
                    <div className="flex justify-between items-center text-[10px] font-mono text-neutral-500 uppercase tracking-widest">
                       <span>{mode === 'convert' ? 'Converting' : mode === 'compress' ? 'Compressing' : 'Upscaling'}</span>
                       <span>{task.progress}%</span>
                    </div>
                    <Progress value={task.progress} className="h-1.5" />
                  </div>
                )}

                {task.status === 'error' && (
                  <span className="text-red-400 text-sm truncate max-w-[150px] font-medium" title={task.errorMsg}>
                    {task.errorMsg}
                  </span>
                )}

                {task.status === 'done' && (
                  <a 
                    href={task.resultUrl} 
                    download={task.resultName}
                    className="flex items-center gap-1 bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded text-sm font-medium transition-all shadow-md hover:shadow-green-900/40"
                  >
                    <Download className="w-4 h-4" /> 다운로드
                  </a>
                )}

                <div className="flex items-center gap-2 border-l border-neutral-700 pl-4">
                   {task.status === 'idle' && (
                     <button onClick={() => onProcess(task.id)} className="text-neutral-400 hover:text-white p-1 rounded transition-colors" title="시작">
                       <Play className="w-5 h-5 fill-current" />
                     </button>
                   )}
                   <button onClick={() => onRemove(task.id)} className="text-neutral-400 hover:text-red-400 p-1 rounded transition-colors" title="삭제">
                     <X className="w-5 h-5" />
                   </button>
                </div>

              </div>
            </li>
          ))}
        </ul>

        <AnimatePresence>
          {settingsTask && (
            <AdvancedSettings
              task={tasks.find(t => t.id === settingsTask.id)!}
              onUpdate={(updates) => onTaskUpdate?.(settingsTask.id, updates)}
              onClose={() => setSettingsTask(null)}
            />
          )}
        </AnimatePresence>
      </div>

      <div className="bg-neutral-900/80 p-4 border-t border-neutral-700 flex flex-col md:flex-row items-center justify-between gap-4 shrink-0">
        <div className="relative">
           <input 
             type="file" 
             id="add-more" 
             multiple 
             className="hidden" 
             onChange={(e) => {
               if(e.target.files?.length) onAddMore(e.target.files);
               e.target.value = '';
             }} 
           />
           <label htmlFor="add-more" className="flex items-center gap-2 bg-neutral-800/50 hover:bg-neutral-800 border border-neutral-700 px-4 py-2 rounded text-sm text-neutral-300 cursor-pointer transition-colors">
             <Plus className="w-4 h-4" /> 더 많은 파일 추가
           </label>
        </div>

        <div className="flex items-center gap-4">
           {allIdle && !isProcessing && (
             <div className="flex items-center gap-3">
                {mode === 'convert' && tasks.length > 0 && (
                  <div className="hidden sm:flex items-center gap-2 pr-4 border-r border-neutral-700">
                    <span className="text-sm text-neutral-400">모든 항목을 로 변환</span>
                    <FormatSelector 
                      label="..."
                      currentFormat={tasks.every(t => t.mode === 'convert' && t.targetFormat === (tasks[0] as ConvertTask).targetFormat) ? (tasks[0] as ConvertTask).targetFormat : undefined}
                      onFormatChange={onFormatChangeAll}
                      defaultCategory={tasks[0]?.type || 'image'}
                    />
                  </div>
                )}
               <button 
                 onClick={onProcessAll} 
                 className="bg-red-600 hover:bg-red-500 text-white px-10 py-2.5 rounded-lg text-lg font-bold transition-all shadow-lg hover:shadow-red-900/50 active:scale-95"
               >
                  전체 {getModeLabel()}
               </button>
             </div>
           )}
           {isProcessing && (
             <button 
               disabled
               className="bg-neutral-800 text-neutral-500 border border-neutral-700 px-10 py-2.5 rounded-lg text-lg font-bold cursor-not-allowed animate-pulse"
             >
                {getModeLabel()} 중...
             </button>
           )}
        </div>
      </div>
    </div>
  );
}
