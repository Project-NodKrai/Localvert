import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2, ChevronRight, CircleAlert, Clock3, Download, Film,
  FolderOpen, Home, Image as ImageIcon, Layers3, LockKeyhole, Play,
  Plus, Settings2, Sparkles, Trash2, UploadCloud, WandSparkles,
} from 'lucide-react';
import type { UpscaleTask } from '../../types';
import { activeModel, isRunnableSelection, tierPurposeLabel } from '../../lib/upscalers/catalog';
import type { StudioMedia, StudioProfile } from '../../lib/upscalers/studio';
import StudioModelSheet from './StudioModelSheet';

type Props = {
  tasks: UpscaleTask[];
  media: StudioMedia;
  profile: StudioProfile;
  onMediaChange: (media: StudioMedia) => void;
  onProfileChange: (updates: Partial<StudioProfile>) => void;
  onFilesAdded: (files: File[] | FileList) => void;
  onProcess: (id: string) => void;
  onProcessAll: () => void;
  onRemove: (id: string) => void;
};

function readableSize(bytes: number) {
  if (!bytes) return '0 B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function PreviewImage({ task }: { task: UpscaleTask }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (task.type !== 'image') return;
    const objectUrl = URL.createObjectURL(task.file);
    setUrl(objectUrl);
    return () => { URL.revokeObjectURL(objectUrl); setUrl(null); };
  }, [task.file, task.type]);
  return task.type === 'image' && url
    ? <img className="h-12 w-12 shrink-0 rounded-xl border border-[#E5EAF4] object-cover" src={url} alt="" />
    : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#EAF0FC] text-[#5B81CF]">
        {task.type === 'video' ? <Film size={22} /> : <ImageIcon size={22} />}
      </div>;
}

export default function UpscaleStudio({
  tasks, media, profile, onMediaChange, onProfileChange,
  onFilesAdded, onProcess, onProcessAll, onRemove,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState<'tier' | 'model'>('tier');
  const closeSheet = useCallback(() => setSheetOpen(false), []);
  const currentModel = activeModel(profile.model);
  const usable = isRunnableSelection(profile.model, profile.upscaleTier, profile.upscalePurpose);
  const visibleTasks = tasks;
  const canRun = tasks.some(task => task.status === 'idle' && task.stored);
  const processing = tasks.some(task => task.status === 'processing' || task.status === 'queued');

  function openSheet(tab: 'tier' | 'model') {
    setSheetTab(tab);
    setSheetOpen(true);
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files?.length) onFilesAdded(event.target.files);
    event.target.value = '';
  }

  function handleDragOver(event: DragEvent<HTMLElement>) { event.preventDefault(); }
  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    if (event.dataTransfer.files?.length) onFilesAdded(event.dataTransfer.files);
  }

  const runningLabel = processing ? '복원 작업 진행 중' : '복원 시작';
  const modelSummary = usable ? currentModel.name + ' ' + currentModel.scale + '×' : '사용 가능한 모델 없음';

  return (
    <div data-upscale-studio="true" className="min-h-[calc(100vh-4rem)] bg-[#F7F9FD] text-[#1C2A43]">
      <div className="mx-auto flex w-full max-w-[1440px]">
        <aside className="sticky top-0 hidden h-[calc(100vh-4rem)] w-[218px] shrink-0 flex-col justify-between border-r border-[#E5EAF2] bg-[#FCFDFF] px-4 pb-6 pt-7 lg:flex">
          <nav aria-label="고화질 복원 내비게이션" className="space-y-2 text-sm font-semibold">
            <Link to="/" className="flex items-center gap-3 rounded-xl px-4 py-3 text-[#5B6780] transition-colors hover:bg-[#EDF3FE]">
              <Home size={18} /> 홈
            </Link>
            <button type="button" onClick={() => onMediaChange('image')}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors ${media === 'image' ? 'bg-[#E9F0FF] text-[#246AF5]' : 'text-[#66738C] hover:bg-[#F0F4FC]'}`}>
              <ImageIcon size={19} /> 이미지 복원
            </button>
            <button type="button" onClick={() => onMediaChange('video')}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors ${media === 'video' ? 'bg-[#E9F0FF] text-[#246AF5]' : 'text-[#66738C] hover:bg-[#F0F4FC]'}`}>
              <Film size={19} /> 동영상 복원
            </button>
            <Link to="/compress" className="flex items-center gap-3 rounded-xl px-4 py-3 text-[#66738C] transition-colors hover:bg-[#F0F4FC]">
              <Layers3 size={18} /> 압축
            </Link>
            <Link to="/details" className="flex items-center gap-3 rounded-xl px-4 py-3 text-[#66738C] transition-colors hover:bg-[#F0F4FC]">
              <Settings2 size={18} /> 기능
            </Link>
          </nav>
          <div className="rounded-2xl border border-[#E1E7F2] bg-white p-4 shadow-[0_3px_15px_rgba(35,57,98,.04)]">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#35445F]">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> 로컬 처리
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-[#8190A6]">
              <LockKeyhole size={14} /> 파일이 서버에 업로드되지 않아
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 pb-20 pt-8 sm:px-8 lg:px-12 lg:pt-10">
          <div className="mx-auto max-w-[870px] space-y-7">
            <header className="space-y-2">
              <div className="flex items-center gap-3">
                <Sparkles size={29} className="shrink-0 text-[#2E73FA]" />
                <h1 className="text-3xl font-extrabold tracking-tight text-[#14203B] sm:text-[34px]">고화질 복원</h1>
              </div>
              <p className="text-sm leading-relaxed text-[#6D7C95] sm:text-base">
                AI를 사용해 사진, 일러스트, 애니메이션, 동영상의 해상도와 디테일을 향상시켜.
              </p>
            </header>

            <div role="group" aria-label="복원 파일 종류" className="inline-flex rounded-2xl border border-[#E1E7F2] bg-white p-1 shadow-[0_2px_10px_rgba(45,65,105,.04)]">
              <button type="button" aria-pressed={media === 'image'} onClick={() => onMediaChange('image')}
                className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors ${media === 'image' ? 'bg-[#E9F0FF] text-[#246CF5]' : 'text-[#64728B] hover:bg-[#F4F7FB]'}`}>
                <ImageIcon size={17} /> 이미지
              </button>
              <button type="button" aria-pressed={media === 'video'} onClick={() => onMediaChange('video')}
                className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors ${media === 'video' ? 'bg-[#E9F0FF] text-[#246CF5]' : 'text-[#64728B] hover:bg-[#F4F7FB]'}`}>
                <Film size={17} /> 동영상
              </button>
            </div>

            <section aria-labelledby="upscale-enhancement-title" className="rounded-[22px] border border-[#E4EAF4] bg-white p-5 shadow-[0_6px_24px_rgba(40,63,111,.045)] sm:p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <h2 id="upscale-enhancement-title" className="text-lg font-bold text-[#1F2B43]">향상 설정</h2>
                <div className="flex items-center gap-2 rounded-full bg-[#F1F8F5] px-3 py-1.5 text-xs font-semibold text-[#40795C]">
                  <span className="h-2 w-2 rounded-full bg-[#32B779]" /> 로컬 실행
                </div>
              </div>
              <div className="space-y-3">
                <button type="button" onClick={() => openSheet('tier')}
                  aria-label="품질 수준 선택"
                  className="flex w-full items-center gap-4 rounded-2xl border border-[#E4E9F3] bg-[#FDFEFF] p-4 text-left transition-all hover:border-[#ABC9FF] hover:bg-[#F6F9FF] focus-visible:outline-2 focus-visible:outline-[#4989FD]">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#E9F0FF] text-[#2B6EF3]">
                    <Layers3 size={21} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-[#28364E]">품질 수준</span>
                    <span className="mt-1 block text-xs text-[#8996A9]">등급과 용도를 선택해.</span>
                  </span>
                  <span className="max-w-[45%] truncate text-right text-sm font-semibold text-[#273651]">{tierPurposeLabel(profile.upscaleTier, profile.upscalePurpose)}</span>
                  <ChevronRight className="shrink-0 text-[#91A0B7]" size={18} />
                </button>
                <button type="button" onClick={() => openSheet('model')}
                  aria-label="세부 모델 선택"
                  className="flex w-full items-center gap-4 rounded-2xl border border-[#E4E9F3] bg-[#FDFEFF] p-4 text-left transition-all hover:border-[#ABC9FF] hover:bg-[#F6F9FF] focus-visible:outline-2 focus-visible:outline-[#4989FD]">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F0F2F8] text-[#63728E]">
                    <Settings2 size={21} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-[#28364E]">세부 모델</span>
                    <span className="mt-1 block text-xs text-[#8996A9]">선택한 등급의 모델을 지정해.</span>
                  </span>
                  <span className="max-w-[42%] truncate text-right text-sm font-semibold text-[#344360]">{modelSummary}</span>
                  <ChevronRight className="shrink-0 text-[#91A0B7]" size={18} />
                </button>
                {media === 'video' && (
                  <>
                    <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#F3F6FB] p-1" role="group" aria-label="영상 복원 방식">
                      <button type="button" onClick={() => onProfileChange({ videoMethod: 'filter' })}
                        aria-pressed={profile.videoMethod === 'filter'}
                        className={`rounded-lg px-3 py-2.5 text-xs font-semibold transition-colors ${profile.videoMethod === 'filter' ? 'bg-white text-[#2869EA] shadow-sm' : 'text-[#71809A]'}`}>
                        빠른 필터
                      </button>
                      <button type="button" onClick={() => onProfileChange({ videoMethod: 'ai' })}
                        aria-pressed={profile.videoMethod === 'ai'}
                        className={`rounded-lg px-3 py-2.5 text-xs font-semibold transition-colors ${profile.videoMethod === 'ai' ? 'bg-white text-[#2869EA] shadow-sm' : 'text-[#71809A]'}`}>
                        AI 프레임 복원
                      </button>
                    </div>
                    <label className="flex items-center justify-between gap-3 rounded-xl px-2 py-1 text-xs text-[#697891]">
                      작업 범위
                      <select aria-label="동영상 작업 범위"
                        value={profile.limitSeconds ?? 0}
                        onChange={event => onProfileChange({ limitSeconds: Number(event.target.value) || undefined })}
                        className="rounded-lg border border-[#DCE4F2] bg-white px-3 py-2 text-xs text-[#384761]">
                        <option value={0}>전체 영상</option>
                        <option value={5}>처음 5초</option>
                        <option value={10}>처음 10초</option>
                      </select>
                    </label>
                  </>
                )}
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-[#EDF3FF] px-4 py-3 text-xs text-[#3766C0]">
                <CheckCircle2 size={16} className="shrink-0" />
                현재 설정: {tierPurposeLabel(profile.upscaleTier, profile.upscalePurpose)} · {modelSummary}
              </div>
            </section>

            <section aria-label="이미지 및 동영상 업로드"
              onDragOver={handleDragOver} onDrop={handleDrop}
              className="flex min-h-[225px] flex-col items-center justify-center rounded-[22px] border-2 border-dashed border-[#AFC9F9] bg-[#FBFCFF] px-5 py-9 text-center transition-colors hover:border-[#4B8AF8] hover:bg-[#F5F9FF]">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAF1FF] text-[#3479EF]">
                <UploadCloud size={30} />
              </div>
              <p className="text-base font-bold text-[#2A3650]">
                {media === 'image' ? '이미지를 끌어다 놓거나 파일을 선택해.' : '동영상을 끌어다 놓거나 파일을 선택해.'}
              </p>
              <p className="mt-2 text-xs text-[#8693A9]">
                {media === 'image' ? 'PNG, JPEG, WebP, GIF 등' : 'MP4, MOV, WebM 등'} · 브라우저에서 로컬 처리
              </p>
              <input ref={inputRef} data-testid="upscale-file-input" type="file" multiple
                accept={media === 'image' ? 'image/*,.heic,.heif' : 'video/*,.mkv,.avi,.mov'}
                onChange={handleInput} className="sr-only" aria-label="고화질 복원 파일 업로드" />
              <button type="button" onClick={() => inputRef.current?.click()}
                className="mt-5 flex items-center gap-2 rounded-xl bg-[#246CF5] px-6 py-3 text-sm font-bold text-white shadow-[0_5px_14px_rgba(36,108,245,.19)] transition-all hover:bg-[#1559E0] active:scale-[.98]">
                <FolderOpen size={18} /> 파일 선택
              </button>
            </section>

            <section aria-labelledby="studio-files-heading" className="rounded-[22px] border border-[#E4EAF4] bg-white p-5 shadow-[0_5px_20px_rgba(30,53,97,.04)] sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 id="studio-files-heading" className="text-base font-bold text-[#24324A]">
                  최근 작업 {visibleTasks.length ? <span className="text-[#286CF3]">{visibleTasks.length}</span> : null}
                </h2>
                {visibleTasks.length > 0 && (
                  <button type="button" onClick={() => inputRef.current?.click()}
                    className="flex items-center gap-1 text-xs font-semibold text-[#2B6EEA] hover:text-[#134FBC]">
                    <Plus size={15} /> 파일 추가
                  </button>
                )}
              </div>
              {visibleTasks.length === 0 ? (
                <div className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl bg-[#F8FAFE] text-sm text-[#93A0B4]">
                  <Clock3 size={23} /> 아직 작업한 파일이 없어.
                </div>
              ) : (
                <ul className="space-y-2">
                  {visibleTasks.map(task => (
                    <li key={task.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[#E9EDF5] bg-[#FCFDFF] p-3">
                      <PreviewImage task={task} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[#2A354D]">{task.file.name}</p>
                        <p className="mt-1 text-xs text-[#8B98AB]">
                          {readableSize(task.file.size)}{task.width && task.height ? ' · ' + task.width + '×' + task.height : ''}
                        </p>
                        {task.status === 'processing' && (
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E8EFFB]">
                            <div className="h-full rounded-full bg-[#2B72F8] transition-[width]" style={{ width: task.progress + '%' }} />
                          </div>
                        )}
                        {task.status === 'error' && <p className="mt-1 text-xs text-[#C35656]" title={task.errorMsg}>{task.errorMsg}</p>}
                      </div>
                      <span className="shrink-0 text-xs font-medium text-[#6F7D93]">
                        {task.status === 'idle' ? '준비 완료' : task.status === 'queued' ? '대기 중' :
                          task.status === 'processing' ? task.progress + '%' : task.status === 'done' ? '완료' :
                            task.status === 'error' ? '오류' : '파일 준비 중'}
                      </span>
                      {task.status === 'idle' && (
                        <button type="button" title="시작" aria-label={task.file.name + ' 복원 시작'}
                          onClick={() => onProcess(task.id)}
                          className="rounded-lg bg-[#ECF3FF] p-2 text-[#286CF2] hover:bg-[#DCEAFF]">
                          <Play size={17} />
                        </button>
                      )}
                      {task.status === 'done' && task.resultUrl && (
                        <a href={task.resultUrl} download={task.resultName}
                          className="flex items-center gap-1 rounded-lg bg-[#E6F8EF] px-3 py-2 text-xs font-bold text-[#20865A]">
                          <Download size={15} /> 다운로드
                        </a>
                      )}
                      <button type="button" title="삭제" aria-label={task.file.name + ' 삭제'} onClick={() => onRemove(task.id)}
                        className="rounded-lg p-2 text-[#9CA8B8] hover:bg-[#FFF0F0] hover:text-[#D34B4B]">
                        <Trash2 size={17} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <button type="button" onClick={onProcessAll} disabled={!canRun || processing}
              className="flex w-full items-center justify-center gap-3 rounded-[18px] bg-[#246AF5] px-5 py-4 text-base font-bold text-white shadow-[0_9px_25px_rgba(39,106,241,.2)] transition-all hover:bg-[#135BE3] active:scale-[.99] disabled:cursor-not-allowed disabled:bg-[#AFC1DF] disabled:shadow-none">
              <WandSparkles size={21} /> {runningLabel} <ChevronRight size={20} />
            </button>
            <p className="flex items-center justify-center gap-2 text-center text-xs text-[#95A1B2]">
              <CircleAlert size={14} /> 파일은 업로드되지 않으며 이 브라우저에서 처리돼.
            </p>
          </div>
        </main>
      </div>
      <StudioModelSheet open={sheetOpen} media={media} profile={profile}
        startTab={sheetTab} onChange={onProfileChange} onClose={closeSheet} />
    </div>
  );
}
