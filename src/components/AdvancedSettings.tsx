import { motion } from 'motion/react';
import { X, Settings, Check } from 'lucide-react';
import { Task, CompressTask, UpscaleTask } from '../types';
import { adviseImageUpscale, detectDeviceHints } from '../lib/upscalers/performance';

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
  const deviceHints = isUpscale && isImage ? detectDeviceHints() : undefined;
  const imageAdvice = isUpscale && isImage && task.mode === 'upscale'
    ? adviseImageUpscale(task.model, task.width ?? 0, task.height ?? 0, deviceHints) : undefined;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="bg-neutral-900 border border-neutral-800 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-neutral-800 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/10 rounded-xl">
              <Settings className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold">{isUpscale ? 'AI 고화질 복원 설정' : '고급 압축 설정'}</h2>
              <p className="text-xs text-neutral-500 truncate max-w-[250px]">{task.file.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-neutral-800 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
          {isCompress && (
            <section className="space-y-5">
              <div className="flex gap-2 rounded-xl bg-neutral-800 p-1">
                <button type="button"
                  onClick={() => onUpdate({ settings: { ...(task as CompressTask).settings, mode: 'simple' } })}
                  className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${(task as CompressTask).settings.mode !== 'advanced' ? 'bg-red-600 text-white' : 'text-neutral-400 hover:text-white'}`}>
                  일반
                </button>
                <button type="button"
                  onClick={() => onUpdate({ settings: { ...(task as CompressTask).settings, mode: 'advanced' } })}
                  className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${(task as CompressTask).settings.mode === 'advanced' ? 'bg-red-600 text-white' : 'text-neutral-400 hover:text-white'}`}>
                  고급
                </button>
              </div>
              {(task as CompressTask).settings.mode !== 'advanced' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <label htmlFor="compression-strength" className="font-medium">압축 강도</label>
                    <span className="font-mono text-red-400">{(task as CompressTask).quality}%</span>
                  </div>
                  <input id="compression-strength" type="range" min="0" max="100" step="5"
                    value={(task as CompressTask).quality}
                    onChange={(e) => onUpdate({ quality: Number(e.target.value) })}
                    className="w-full accent-red-500" />
                  <div className="flex justify-between text-xs text-neutral-400">
                    <span>약하게 · 화질 우선</span><span>강하게 · 용량 우선</span>
                  </div>
                  <p className="text-xs text-neutral-500">일반 모드는 화질과 파일 크기를 자동으로 조정해. 원본에 따라 압축률은 달라져.</p>
                </div>
              )}
              {(task as CompressTask).settings.mode === 'advanced' && (
                <div className="space-y-4">
                  {isImage && (
                    <>
                      <label className="block space-y-2 text-sm">
                        <span>출력 형식</span>
                        <select className="w-full rounded-lg border border-neutral-700 bg-neutral-800 p-2.5"
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
                        <input type="range" min="10" max="100" step="5" className="w-full accent-red-500"
                          value={(task as CompressTask).settings.imageQuality ?? 80}
                          onChange={e => onUpdate({ settings: { ...(task as CompressTask).settings, imageQuality: Number(e.target.value) } })} />
                        <span className="block text-xs text-neutral-500">높을수록 화질 우선이야. PNG는 손실 품질 설정이 적용되지 않아.</span>
                      </label>
                      <label className="block space-y-2 text-sm">
                        <span>최대 가로·세로 크기</span>
                        <select className="w-full rounded-lg border border-neutral-700 bg-neutral-800 p-2.5"
                          value={(task as CompressTask).settings.maxWidth || 0}
                          onChange={e => onUpdate({ settings: { ...(task as CompressTask).settings, maxWidth: Number(e.target.value) || undefined } })}>
                          <option value={0}>원본 해상도 유지</option>
                          <option value={4096}>4096px</option><option value={2560}>2560px</option>
                          <option value={1920}>1920px</option><option value={1280}>1280px</option>
                          <option value={800}>800px</option>
                        </select>
                      </label>
                      <label className="flex items-center gap-3 text-sm">
                        <input type="checkbox" className="accent-red-500"
                          checked={!!(task as CompressTask).settings.keepMetadata}
                          onChange={e => onUpdate({ settings: { ...(task as CompressTask).settings, keepMetadata: e.target.checked } })} />
                        JPEG EXIF 보존 시도
                      </label>
                      <p className="text-xs text-neutral-500">EXIF 보존은 JPEG에서만 시도해. 일부 메타데이터와 광색역 정보는 유지되지 않을 수 있어.</p>
                    </>
                  )}
                  {isVideo && (
                    <>
                      <label className="block space-y-2 text-sm">
                        <span>영상 품질 (CRF): {(task as CompressTask).settings.videoCrf ?? 28}</span>
                        <input type="range" min="18" max="40" step="1" className="w-full accent-red-500"
                          value={(task as CompressTask).settings.videoCrf ?? 28}
                          onChange={e => onUpdate({ settings: { ...(task as CompressTask).settings, videoCrf: Number(e.target.value) } })} />
                        <span className="block text-xs text-neutral-500">숫자가 낮을수록 화질 우선, 높을수록 압축 우선이야.</span>
                      </label>
                      <label className="block space-y-2 text-sm">
                        <span>최대 출력 해상도</span>
                        <select className="w-full rounded-lg border border-neutral-700 bg-neutral-800 p-2.5"
                          value={(task as CompressTask).settings.resolution || 'original'}
                          onChange={e => onUpdate({ settings: { ...(task as CompressTask).settings, resolution: e.target.value as 'original' | '1080p' | '720p' | '480p' } })}>
                          <option value="original">원본 유지</option><option value="1080p">1080p 이하</option>
                          <option value="720p">720p 이하</option><option value="480p">480p 이하</option>
                        </select>
                      </label>
                      <label className="block space-y-2 text-sm">
                        <span>인코딩 속도</span>
                        <select className="w-full rounded-lg border border-neutral-700 bg-neutral-800 p-2.5"
                          value={(task as CompressTask).settings.videoPreset || 'veryfast'}
                          onChange={e => onUpdate({ settings: { ...(task as CompressTask).settings, videoPreset: e.target.value as 'ultrafast' | 'veryfast' | 'medium' } })}>
                          <option value="ultrafast">가장 빠름 · 압축 효율 낮음</option>
                          <option value="veryfast">균형 · 권장</option>
                          <option value="medium">느림 · 압축 효율 높음</option>
                        </select>
                      </label>
                      <label className="block space-y-2 text-sm">
                        <span>오디오 비트레이트</span>
                        <select className="w-full rounded-lg border border-neutral-700 bg-neutral-800 p-2.5"
                          value={(task as CompressTask).settings.audioBitrate ?? 128}
                          onChange={e => onUpdate({ settings: { ...(task as CompressTask).settings, audioBitrate: Number(e.target.value) } })}>
                          <option value={64}>64 kbps · 용량 절약</option>
                          <option value={128}>128 kbps · 권장</option>
                          <option value={192}>192 kbps · 고음질</option>
                          <option value={256}>256 kbps · 최고</option>
                        </select>
                      </label>
                      <label className="flex items-center gap-3 text-sm">
                        <input type="checkbox" className="accent-red-500"
                          checked={!!(task as CompressTask).settings.mute}
                          onChange={e => onUpdate({ settings: { ...(task as CompressTask).settings, mute: e.target.checked } })} />
                        오디오 트랙 제거
                      </label>
                      <p className="text-xs text-neutral-500">영상 결과는 호환성을 위해 H.264/AAC MP4로 출력해.</p>
                    </>
                  )}
                </div>
              )}
            </section>
          )}

          {isUpscale && (
             <>
               {isImage && (
                  <section className="space-y-3">
                    <label className="text-sm font-medium text-neutral-300">복원 모델 선택</label>
                    <div className="grid grid-cols-1 gap-2">
                       <Option 
                         selected={(task as UpscaleTask).model === 'standard'}
                         onClick={() => onUpdate({ model: 'standard' } as any)}
                         title="Standard (빠름 · ESRGAN Slim 2×)"
                         desc="경량 모델 · 권장 시스템 RAM 16GB · 12MP 이하 이미지부터 시작"
                       />
                       <Option 
                         selected={(task as UpscaleTask).model === 'ultra'}
                         onClick={() => onUpdate({ model: 'ultra' } as any)}
                         title="Ultra (고품질 · ESRGAN Medium 2×)"
                         desc="고품질 모델 · 권장 시스템 RAM 32GB · 8MP 이하 이미지부터 시작"
                       />
                    </div>
                    {imageAdvice && (
                      <div className="rounded-xl border border-neutral-700 bg-neutral-800/60 p-3 text-xs text-neutral-300 space-y-2">
                        <p>예상 출력: {imageAdvice.outputMegapixels.toFixed(1)}MP · 타일: {imageAdvice.patchSize}px</p>
                        <p>RAM 권장치는 참고용이야. 브라우저가 실제 시스템 RAM과 GPU VRAM을 정확하게 제공하지는 않아.</p>
                        {imageAdvice.warnings.map(message =>
                          <p className="text-amber-300" key={message}>{message}</p>
                        )}
                        <p className="text-neutral-400">권장 사양에 못 미쳐도 사용자가 선택하면 실행할 수 있어.</p>
                      </div>
                    )}
                  </section>
               )}
               {isVideo && (
                  <>
                    <section className="space-y-3">
                      <label className="text-sm font-medium text-neutral-300">복원 방식</label>
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
                      <label className="text-sm font-medium text-neutral-300">작업 프레임 제한</label>
                      <select 
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-sm"
                        value={(task as UpscaleTask).limitSeconds || 0}
                        onChange={(e) => onUpdate({ limitSeconds: parseInt(e.target.value) || undefined } as any)}
                      >
                         <option value={0}>전체 영상 작업</option>
                         <option value={5}>최초 5초만 테스트</option>
                         <option value={10}>최초 10초만 테스트</option>
                      </select>
                      <p className="text-[10px] text-neutral-500">AI 방식은 처리 시간이 매우 길어 초반부 테스트를 권장합니다.</p>
                    </section>
                  </>
               )}
             </>
          )}


        </div>

        <div className="p-6 bg-neutral-800/20 border-t border-neutral-800 flex justify-end">
          <button
            onClick={onClose}
            className="bg-red-600 hover:bg-red-500 text-white px-8 py-3 rounded-2xl font-bold transition-all shadow-lg active:scale-95"
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
    <div
      onClick={onClick}
      className={`p-4 rounded-2xl cursor-pointer transition-all border-2 flex items-center justify-between group ${
        selected ? 'bg-red-500/10 border-red-500 text-white' : 'bg-neutral-800/50 border-neutral-800 text-neutral-400 hover:bg-neutral-800 hover:border-neutral-700'
      }`}
    >
      <div className="flex-1">
        <div className={`text-sm font-bold mb-1 ${selected ? 'text-red-400' : ''}`}>{title}</div>
        <div className="text-xs opacity-70 leading-tight">{desc}</div>
      </div>
      {selected && (
        <div className="shrink-0 ml-4 p-1 bg-red-500 rounded-full">
          <Check className="w-3 h-3 text-white" />
        </div>
      )}
    </div>
  );
}
