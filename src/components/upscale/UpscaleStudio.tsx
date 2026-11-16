import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import {
  ChevronRight, CircleAlert, Clock3, Download, Film,
  FolderOpen, Image as ImageIcon, Play,
  Plus, Sparkles, Trash2, UploadCloud, WandSparkles,
} from 'lucide-react';
import type { UpscaleTask } from '../../types';
import type { UpscaleTier } from '../../lib/upscalers/catalog';
import StudioLevelDock from './StudioLevelDock';
import { canAcceptStudioFile } from '../../lib/upscalers/studio';
import type { StudioMedia, StudioViewMode, StudioProfile } from '../../lib/upscalers/studio';
import StudioModelSheet from './StudioModelSheet';

type Props = {
  tasks: UpscaleTask[];
  media: StudioViewMode;
  profiles: Record<StudioMedia, StudioProfile>;
  onMediaChange: (media: StudioViewMode) => void;
  onProfileChange: (media: StudioViewMode, updates: Partial<StudioProfile>) => void;
  onFilesAdded: (files: File[] | FileList) => void;
  onProcess: (id: string) => void;
  onProcessAll: (ids: string[]) => void;
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
  tasks, media, profiles, onMediaChange, onProfileChange,
  onFilesAdded, onProcess, onProcessAll, onRemove,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [detailMedia, setDetailMedia] = useState<StudioMedia>('image');
  const closeSheet = useCallback(() => setSheetOpen(false), []);
  const visibleTasks = media === 'mixed' ? tasks : tasks.filter(task => task.type === media);
  const readyIds = visibleTasks.filter(task => task.status === 'idle' && task.stored).map(task => task.id);
  const canRun = readyIds.length > 0;
  const processing = visibleTasks.some(task => task.status === 'processing' || task.status === 'queued');
  const focusedMedia: StudioMedia = media === 'video' ? 'video' : 'image';
  const focusedProfile = profiles[focusedMedia];

  function openSheet() {
    setDetailMedia(focusedMedia);
    setSheetOpen(true);
  }

  function updateTier(tier: UpscaleTier) {
    onProfileChange(media, { upscaleTier: tier });
  }

  function addFiles(files: File[] | FileList) {
    const accepted = Array.from(files).filter(file => canAcceptStudioFile(media, file));
    if (accepted.length) onFilesAdded(accepted);
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files?.length) addFiles(event.target.files);
    event.target.value = '';
  }

  function handleDragOver(event: DragEvent<HTMLElement>) { event.preventDefault(); }
  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    if (event.dataTransfer.files?.length) addFiles(event.dataTransfer.files);
  }

  const runningLabel = processing ? '복원 작업 진행 중' : '복원 시작';

  return (
    <div data-upscale-studio="true" className="min-h-[calc(100vh-4rem)] bg-[#F7F9FD] text-[#1C2A43]">
      <div className="mx-auto w-full max-w-[1100px]">

        <main className="min-w-0 px-4 pb-[205px] pt-8 sm:px-8 lg:px-12 lg:pt-10">
          <div className="mx-auto max-w-[870px] space-y-6">
            <header className="space-y-2">
              <div className="flex items-center gap-3">
                <Sparkles size={29} className="shrink-0 text-[#2E73FA]" />
                <h1 className="text-3xl font-extrabold tracking-tight text-[#14203B] sm:text-[34px]">고화질 복원</h1>
              </div>
              <p className="text-sm leading-relaxed text-[#6D7C95] sm:text-base">
                AI를 사용해 사진, 일러스트, 애니메이션, 동영상의 해상도와 디테일을 향상시켜.
              </p>
            </header>

            <div role="group" aria-label="복원 파일 종류" className="studio-media-segment">
              {(['image', 'video', 'mixed'] as const).map(kind => (
                <button key={kind} type="button" aria-pressed={media === kind}
                  onClick={() => onMediaChange(kind)}>
                  {kind === 'image' ? '이미지' : kind === 'video' ? '동영상' : '혼합'}
                </button>
              ))}
            </div>

            <section aria-label="이미지 및 동영상 업로드"
              onDragOver={handleDragOver} onDrop={handleDrop}
              className="flex min-h-[225px] flex-col items-center justify-center rounded-[22px] border-2 border-dashed border-[#AFC9F9] bg-[#FBFCFF] px-5 py-9 text-center transition-colors hover:border-[#4B8AF8] hover:bg-[#F5F9FF]">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAF1FF] text-[#3479EF]">
                <UploadCloud size={30} />
              </div>
              <p className="text-base font-bold text-[#2A3650]">
                {media === 'image' ? '이미지를 끌어다 놓거나 파일을 선택해.' : media === 'video' ? '동영상을 끌어다 놓거나 파일을 선택해.' : '이미지와 동영상을 끌어다 놓거나 파일을 선택해.'}
              </p>
              <p className="mt-2 text-xs text-[#8693A9]">
                {media === 'image' ? 'PNG, JPEG, WebP, GIF 등' : media === 'video' ? 'MP4, MOV, WebM 등' : '이미지 · 동영상'} · 브라우저에서 로컬 처리
              </p>
              <input ref={inputRef} data-testid="upscale-file-input" type="file" multiple
                accept={media === 'image' ? 'image/*,.heic,.heif' : media === 'video' ? 'video/*,.mkv,.avi,.mov' : 'image/*,video/*,.heic,.heif,.mkv,.avi,.mov'}
                onChange={handleInput} className="sr-only" aria-label="고화질 복원 파일 업로드" />
              <button type="button" onClick={() => inputRef.current?.click()}
                className="mt-5 flex items-center gap-2 rounded-xl bg-[#246CF5] px-6 py-3 text-sm font-bold text-white shadow-[0_5px_14px_rgba(36,108,245,.19)] transition-all hover:bg-[#1559E0] active:scale-[.98]">
                <FolderOpen size={18} /> 파일 선택
              </button>
            </section>

            {visibleTasks.length > 0 && (
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

            )}

            {visibleTasks.length > 0 && <button type="button" onClick={() => onProcessAll(readyIds)} disabled={!canRun || processing}
              className="flex w-full items-center justify-center gap-3 rounded-[18px] bg-[#246AF5] px-5 py-4 text-base font-bold text-white shadow-[0_9px_25px_rgba(39,106,241,.2)] transition-all hover:bg-[#135BE3] active:scale-[.99] disabled:cursor-not-allowed disabled:bg-[#AFC1DF] disabled:shadow-none">
              <WandSparkles size={21} /> {runningLabel} <ChevronRight size={20} />
            </button>}
            <p className="flex items-center justify-center gap-2 text-center text-xs text-[#95A1B2]">
              <CircleAlert size={14} /> 파일은 업로드되지 않으며 이 브라우저에서 처리돼.
            </p>
          </div>
        </main>
      </div>
      <StudioLevelDock view={media}
        tier={focusedProfile.upscaleTier}
        imageTier={profiles.image.upscaleTier}
        videoTier={profiles.video.upscaleTier}
        purpose={focusedProfile.upscalePurpose}
        onTierChange={updateTier}
        onExpand={openSheet}
      />
      <StudioModelSheet open={sheetOpen} media={detailMedia} profile={profiles[detailMedia]}
        startTab="tier" onChange={updates => onProfileChange(detailMedia, updates)}
        onClose={closeSheet} mixed={media === 'mixed'} onMediaChange={setDetailMedia} />
    </div>
  );
}
