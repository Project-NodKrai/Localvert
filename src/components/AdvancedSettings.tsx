import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { X, Settings, Check } from 'lucide-react';
import { Task, CompressTask, UpscaleTask } from '../types';
import TierPurposeSelector from './TierPurposeSelector';

interface AdvancedSettingsProps {
  task: Task;
  onUpdate: (updates: Partial<Task>) => void;
  onClose: () => void;
}

export default function AdvancedSettings({ task, onUpdate, onClose }: AdvancedSettingsProps) {
  const isVideo = task.type === 'video';
  const isImage = task.type === 'image';
  const isUpscale = task.mode === 'upscale';
  const isCompress = task.mode === 'compress';
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => { window.removeEventListener('keydown', handler); previousFocus?.focus(); };
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="lv-settings-overlay"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        role="dialog" aria-modal="true" aria-labelledby="lv-settings-title"
        className="lv-settings-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="lv-settings-head">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-[#EAF1FF] p-2">
              <Settings className="w-5 h-5 text-[#236BF0]" />
            </div>
            <div>
              <h2 id="lv-settings-title" className="text-xl font-bold">{isUpscale ? 'AI 고화질 복원 설정' : '고급 압축 설정'}</h2>
              <p className="text-xs text-[#64758D] truncate max-w-[250px]">{task.file.name}</p>
            </div>
          </div>
          <button type="button" ref={closeRef} aria-label="설정 닫기" onClick={onClose} className="lv-settings-cancel">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="lv-settings-body space-y-7">
          {isCompress && (
            <section className="space-y-5">
              <div className="lv-settings-tabbar" role="group" aria-label="압축 설정 모드">
                <button type="button"
                  aria-pressed={(task as CompressTask).settings.mode !== 'advanced'}
                  onClick={() => onUpdate({ settings: { ...(task as CompressTask).settings, mode: 'simple' } })}
                  className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${(task as CompressTask).settings.mode !== 'advanced' ? 'bg-[#286DF5] text-white' : 'text-[#586A84] hover:text-[#1B54BE]'}`}>
                  일반
                </button>
                <button type="button"
                  aria-pressed={(task as CompressTask).settings.mode === 'advanced'}
                  onClick={() => onUpdate({ settings: { ...(task as CompressTask).settings, mode: 'advanced' } })}
                  className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${(task as CompressTask).settings.mode === 'advanced' ? 'bg-[#286DF5] text-white' : 'text-[#586A84] hover:text-[#1B54BE]'}`}>
                  고급
                </button>
              </div>
              {(task as CompressTask).settings.mode !== 'advanced' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <label htmlFor="compression-strength" className="font-medium">압축 강도</label>
                    <span className="font-mono text-[#1E5CCB]">{(task as CompressTask).quality}%</span>
                  </div>
                  <input id="compression-strength" type="range" min="0" max="100" step="5"
                    value={(task as CompressTask).quality}
                    onChange={(e) => onUpdate({ quality: Number(e.target.value) })}
                    className="w-full accent-[#286DF5]" />
                  <div className="flex justify-between text-xs text-[#586A84]">
                    <span>약하게 · 화질 우선</span><span>강하게 · 용량 우선</span>
                  </div>
                  <p className="text-xs text-[#64758D]">일반 모드는 화질과 파일 크기를 자동으로 조정해. 원본에 따라 압축률은 달라져.</p>
                </div>
              )}
              {(task as CompressTask).settings.mode === 'advanced' && (
                <div className="space-y-4">
                  {isImage && (
                    <>
                      <label className="block space-y-2 text-sm">
                        <span>출력 형식</span>
                        <select className="w-full rounded-lg border border-[#D7E1EF] bg-[#F2F6FC] p-2.5"
                          value={(task as CompressTask).settings.imageFormat || 'original'}
                          onChange={e => onUpdate({ settings: { ...(task as CompressTask).settings, imageFormat: e.target.value as 'original' | 'jpeg' | 'webp' | 'png' } })}>
                          <option value="original">원본 형식 유지 (지원 형식 외 WebP)</option>
                          <option value="jpeg">JPEG · 사진용</option>
                          <option value="webp">WebP · 웹용</option>
                          <option value="png">PNG · 무손실 픽셀 저장</option>
                        </select>
                      </label>
                      <label className="block space-y-2 text-sm">
                        <span>이미지 인코딩 품질: {(task as CompressTask).settings.imageQuality ?? 80}%</span>
                        <input type="range" min="10" max="100" step="5" className="w-full accent-[#286DF5]"
                          value={(task as CompressTask).settings.imageQuality ?? 80}
                          onChange={e => onUpdate({ settings: { ...(task as CompressTask).settings, imageQuality: Number(e.target.value) } })} />
                        <span className="block text-xs text-[#64758D]">높을수록 화질 우선이야. PNG는 손실 품질 설정이 적용되지 않아.</span>
                      </label>
                      <label className="block space-y-2 text-sm">
                        <span>최대 가로·세로 크기</span>
                        <select className="w-full rounded-lg border border-[#D7E1EF] bg-[#F2F6FC] p-2.5"
                          value={(task as CompressTask).settings.maxWidth || 0}
                          onChange={e => onUpdate({ settings: { ...(task as CompressTask).settings, maxWidth: Number(e.target.value) || undefined } })}>
                          <option value={0}>원본 해상도 유지</option>
                          <option value={4096}>4096px</option><option value={2560}>2560px</option>
                          <option value={1920}>1920px</option><option value={1280}>1280px</option>
                          <option value={800}>800px</option>
                        </select>
                      </label>
                      <label className="flex items-center gap-3 text-sm">
                        <input type="checkbox" className="accent-[#286DF5]"
                          checked={!!(task as CompressTask).settings.keepMetadata}
                          onChange={e => onUpdate({ settings: { ...(task as CompressTask).settings, keepMetadata: e.target.checked } })} />
                        JPEG EXIF 보존 시도
                      </label>
                      <p className="text-xs text-[#64758D]">EXIF 보존은 JPEG에서만 시도해. 일부 메타데이터와 광색역 정보는 유지되지 않을 수 있어.</p>
                    </>
                  )}
                  {isVideo && (
                    <>
                      <label className="block space-y-2 text-sm">
                        <span>영상 품질 (CRF): {(task as CompressTask).settings.videoCrf ?? 28}</span>
                        <input type="range" min="18" max="40" step="1" className="w-full accent-[#286DF5]"
                          value={(task as CompressTask).settings.videoCrf ?? 28}
                          onChange={e => onUpdate({ settings: { ...(task as CompressTask).settings, videoCrf: Number(e.target.value) } })} />
                        <span className="block text-xs text-[#64758D]">숫자가 낮을수록 화질 우선, 높을수록 압축 우선이야.</span>
                      </label>
                      <label className="block space-y-2 text-sm">
                        <span>최대 출력 해상도</span>
                        <select className="w-full rounded-lg border border-[#D7E1EF] bg-[#F2F6FC] p-2.5"
                          value={(task as CompressTask).settings.resolution || 'original'}
                          onChange={e => onUpdate({ settings: { ...(task as CompressTask).settings, resolution: e.target.value as 'original' | '1080p' | '720p' | '480p' } })}>
                          <option value="original">원본 유지</option><option value="1080p">1080p 이하</option>
                          <option value="720p">720p 이하</option><option value="480p">480p 이하</option>
                        </select>
                      </label>
                      <label className="block space-y-2 text-sm">
                        <span>인코딩 속도</span>
                        <select className="w-full rounded-lg border border-[#D7E1EF] bg-[#F2F6FC] p-2.5"
                          value={(task as CompressTask).settings.videoPreset || 'veryfast'}
                          onChange={e => onUpdate({ settings: { ...(task as CompressTask).settings, videoPreset: e.target.value as 'ultrafast' | 'veryfast' | 'medium' } })}>
                          <option value="ultrafast">가장 빠름 · 압축 효율 낮음</option>
                          <option value="veryfast">균형 · 권장</option>
                          <option value="medium">느림 · 압축 효율 높음</option>
                        </select>
                      </label>
                      <label className="block space-y-2 text-sm">
                        <span>오디오 비트레이트</span>
                        <select className="w-full rounded-lg border border-[#D7E1EF] bg-[#F2F6FC] p-2.5"
                          value={(task as CompressTask).settings.audioBitrate ?? 128}
                          onChange={e => onUpdate({ settings: { ...(task as CompressTask).settings, audioBitrate: Number(e.target.value) } })}>
                          <option value={64}>64 kbps · 용량 절약</option>
                          <option value={128}>128 kbps · 권장</option>
                          <option value={192}>192 kbps · 고음질</option>
                          <option value={256}>256 kbps · 최고</option>
                        </select>
                      </label>
                      <label className="flex items-center gap-3 text-sm">
                        <input type="checkbox" className="accent-[#286DF5]"
                          checked={!!(task as CompressTask).settings.mute}
                          onChange={e => onUpdate({ settings: { ...(task as CompressTask).settings, mute: e.target.checked } })} />
                        오디오 트랙 제거
                      </label>
                      <p className="text-xs text-[#64758D]">영상 결과는 호환성을 위해 H.264/AAC MP4로 출력해.</p>
                    </>
                  )}
                </div>
              )}
            </section>
          )}

          {isUpscale && (
             <>
               {(isImage || (isVideo && task.mode === 'upscale' && task.videoMethod === 'ai')) && task.mode === 'upscale' && (
                 <TierPurposeSelector task={task} onUpdate={onUpdate} />
               )}
               {isVideo && (
                  <>
                    <section className="space-y-3">
                      <label className="text-sm font-medium text-[#425473]">복원 방식</label>
                      <div className="grid grid-cols-1 gap-2">
                         <Option 
                           selected={(task as UpscaleTask).videoMethod === 'filter'}
                           onClick={() => onUpdate({ videoMethod: 'filter' } as any)}
                           title="빠른 필터 방식 (Fast)"
                           desc="수학적 계산으로 화면을 선명하게 개선합니다."
                         />
                         <Option 
                           selected={(task as UpscaleTask).videoMethod === 'ai'}
                           onClick={() => onUpdate({ videoMethod: 'ai' } as any)}
                           title="AI 프레임 방식 (Deep Learning)"
                           desc="모든 프레임을 AI가 분석하여 복구합니다. (매우 느림)"
                         />
                      </div>
                    </section>
                    <section className="space-y-3">
                      <label className="text-sm font-medium text-[#425473]">작업 프레임 제한</label>
                      <select 
                        className="w-full bg-[#F2F6FC] border border-[#D7E1EF] rounded-xl px-4 py-3 text-sm"
                        value={(task as UpscaleTask).limitSeconds || 0}
                        onChange={(e) => onUpdate({ limitSeconds: parseInt(e.target.value) || undefined } as any)}
                      >
                         <option value={0}>전체 영상 작업</option>
                         <option value={5}>최초 5초만 테스트</option>
                         <option value={10}>최초 10초만 테스트</option>
                      </select>
                      <p className="text-[10px] text-[#64758D]">AI 방식은 처리 시간이 매우 길어 초반부 테스트를 권장합니다.</p>
                    </section>
                  </>
               )}
             </>
          )}


        </div>

        <div className="lv-settings-footer">
          <button
            onClick={onClose}
            className="lv-button lv-button-primary"
          >
            적용완료
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Option({ selected, onClick, title, desc }: { selected: boolean, onClick: () => void, title: string, desc: string }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} className="lv-settings-option">
      <span className="flex-1 text-left">
        <span className="block text-sm font-bold mb-1">{title}</span>
        <span className="block text-xs leading-relaxed">{desc}</span>
      </span>
      {selected && (
        <span className="shrink-0 ml-4 rounded-full bg-[#286DF5] p-1.5 text-white">
          <Check size={13} aria-hidden="true" />
        </span>
      )}
    </button>
  );
}
