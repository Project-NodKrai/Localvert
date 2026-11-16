import { useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Download, Plus, Play, Settings, X } from 'lucide-react';
import { Task, AppMode, ConvertTask, CompressTask, UpscaleTask, FORMATS } from '../types';
import { FormatSelector } from './FormatSelector';
import AdvancedSettings from './AdvancedSettings';
import { modelDisplayName } from '../lib/upscalers/catalog';

interface Props {
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

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const unit = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), unit.length - 1);
  return (bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1) + ' ' + unit[i];
}

export default function FileList({
  tasks, mode, onFormatChange, onQualityChange, onTaskUpdate,
  onFormatChangeAll, onRemove, onProcess, onProcessAll, onAddMore,
}: Props) {
  const [settingsTaskId, setSettingsTaskId] = useState<string | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const settingsTask = tasks.find(task => task.id === settingsTaskId);
  const allIdle = tasks.some(task => task.status === 'idle' && task.stored);
  const processing = tasks.some(task => task.status === 'processing' || task.status === 'queued');
  const modeLabel = mode === 'convert' ? '변환' : mode === 'compress' ? '압축' : '복원';
  const compatible = tasks.reduce<string[]>((formats, task, index) =>
    index === 0 ? [...(FORMATS[task.type] || [])] :
      formats.filter(format => FORMATS[task.type]?.includes(format)), []);
  const addMoreId = 'lv-add-more-' + mode;

  return (
    <section aria-label={modeLabel + ' 작업 목록'} className="lv-filelist">
      <div className="lv-filelist-head">
        <div>
          <h2 className="lv-filelist-title">작업 목록 <span>{tasks.length}</span></h2>
          <p>각 파일의 옵션과 진행 상태를 확인할 수 있어.</p>
        </div>
        <button type="button" onClick={() => addInputRef.current?.click()}
          className="lv-button lv-button-subtle lv-add-label">
          <Plus size={17} aria-hidden="true" /> 파일 추가
        </button>
        <input ref={addInputRef} id={addMoreId} type="file" multiple className="lv-visually-hidden"
          onChange={event => { if (event.target.files?.length) onAddMore(event.target.files); event.target.value = ''; }} />
      </div>
      <ul className="lv-task-list">
        {tasks.map(task => (
          <li className="lv-task-row" key={task.id}>
            <span className="lv-filetype" aria-hidden="true">
              {(task.status === 'done' ? task.resultName : task.file.name)?.split('.').pop()?.slice(0, 5).toUpperCase()}
            </span>
            <div className="lv-task-identity">
              <p className="lv-task-name" title={task.file.name}>{task.status === 'done' ? task.resultName : task.file.name}</p>
              <p className="lv-task-meta">
                {formatBytes(task.file.size)}
                {task.status === 'done' && task.resultSize != null && <> → {formatBytes(task.resultSize)}
                  {task.resultSize < task.file.size && <> · {Math.round((1 - task.resultSize / task.file.size) * 100)}% 절약</>}
                </>}
              </p>
              {task.status === 'error' && <p className="lv-task-error" role="alert">{task.errorMsg || '처리하지 못했어.'}</p>}
              {task.status === 'processing' && (
                <div className="lv-task-progress-group">
                  <div className="lv-task-progress-meta"><span>처리 중</span><span>{task.progress}%</span></div>
                  <progress aria-label={task.file.name + ' 진행률'} className="lv-progress" value={task.progress} max={100} />
                </div>
              )}
            </div>
            <div className="lv-task-options">
              {task.status === 'idle' && task.mode === 'convert' && (
                <FormatSelector currentFormat={(task as ConvertTask).targetFormat}
                  onFormatChange={format => onFormatChange(task.id, format)}
                  defaultCategory={task.type} allowedFormats={FORMATS[task.type] || []}
                  disabled={task.type === 'unknown'} />
              )}
              {task.status === 'idle' && task.mode === 'compress' && (
                (task as CompressTask).settings.mode === 'advanced' ?
                  <span className="lv-task-hint">고급 압축</span> :
                  <label className="lv-quality">
                    <span>강도 {((task as CompressTask).quality)}%</span>
                    <input type="range" min={0} max={100} step={5}
                      aria-label={task.file.name + ' 압축 강도'}
                      value={(task as CompressTask).quality}
                      onChange={event => onQualityChange(task.id, Number(event.target.value))} />
                  </label>
              )}
              {task.status === 'idle' && task.mode === 'upscale' && (
                <span className="lv-task-hint">
                  {task.type === 'video' && (task as UpscaleTask).videoMethod === 'filter'
                    ? '빠른 필터' : modelDisplayName((task as UpscaleTask).model)}
                </span>
              )}
              {(task.status === 'queued' || task.status === 'storing') &&
                <span className="lv-task-state">{task.status === 'queued' ? '대기 중' : '파일 준비 중'}</span>}
              {task.status === 'done' && task.resultUrl && (
                <a className="lv-button lv-button-success" href={task.resultUrl} download={task.resultName}>
                  <Download size={16} aria-hidden="true" /> 다운로드
                </a>
              )}
              {task.status === 'idle' && (task.mode === 'compress' || task.mode === 'upscale') &&
                <button type="button" className="lv-icon-button" onClick={() => setSettingsTaskId(task.id)}
                  aria-label={task.file.name + ' 설정'} title="설정">
                  <Settings size={19} aria-hidden="true" />
                </button>}
              {task.status === 'idle' && (
                <button type="button" className="lv-icon-button lv-icon-primary" onClick={() => onProcess(task.id)}
                  aria-label={task.file.name + ' ' + modeLabel + ' 시작'} title="시작">
                  <Play size={18} aria-hidden="true" />
                </button>
              )}
              <button type="button" className="lv-icon-button lv-icon-remove"
                onClick={() => onRemove(task.id)} aria-label={task.file.name + ' 삭제'} title="삭제">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="lv-filelist-actions">
        {mode === 'convert' && allIdle && compatible.length > 0 &&
          <div className="lv-bulk-format">
            <span>모든 항목의 형식</span>
            <FormatSelector currentFormat={tasks.every(task => task.mode === 'convert' &&
              task.targetFormat === (tasks[0] as ConvertTask).targetFormat)
              ? (tasks[0] as ConvertTask).targetFormat : undefined}
              onFormatChange={onFormatChangeAll} defaultCategory={tasks[0]?.type ?? 'image'}
              allowedFormats={compatible} />
          </div>}
        {processing
          ? <span role="status" className="lv-processing-status">{modeLabel} 진행 중 · {tasks.filter(t => t.status === 'done').length}/{tasks.length}</span>
          : <button type="button" className="lv-button lv-button-primary" disabled={!allIdle} onClick={onProcessAll}>
              전체 {modeLabel}
            </button>}
      </div>
      <AnimatePresence>
        {settingsTask && (
          <AdvancedSettings task={settingsTask}
            onUpdate={updates => onTaskUpdate?.(settingsTask.id, updates)}
            onClose={() => setSettingsTaskId(null)} />
        )}
      </AnimatePresence>
    </section>
  );
}
