import { motion } from 'motion/react';
import { X, Settings, Check } from 'lucide-react';
import { Task, CompressTask, UpscaleTask } from '../types';

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
             <section className="space-y-4">
               <div className="flex justify-between items-center">
                 <label className="text-sm font-medium text-neutral-300">압축 강도 (품질)</label>
                 <span className="text-sm font-mono text-red-500 font-bold">{(task as CompressTask).quality}%</span>
               </div>
               <input
                 type="range"
                 min="10"
                 max="100"
                 step="5"
                 value={(task as CompressTask).quality}
                 onChange={(e) => onUpdate({ quality: parseInt(e.target.value) })}
                 className="w-full h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-red-500 hover:accent-red-400 transition-all"
               />
               <div className="flex justify-between text-[10px] text-neutral-600 font-mono">
                 <span>최대 압축 (저화질)</span>
                 <span>최소 압축 (고화질)</span>
               </div>
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
                         title="Standard (빠름)"
                         desc="기본 AI 모델을 사용합니다. 고해상도 작업 시 자동으로 분할(Tiling) 처리합니다."
                       />
                       <Option 
                         selected={(task as UpscaleTask).model === 'ultra'}
                         onClick={() => onUpdate({ model: 'ultra' } as any)}
                         title="Ultra (고화질, 대용량)"
                         desc="정교한 모델을 사용합니다. 물리적 GPU 한계를 넘는 크기는 조각내어 처리합니다."
                       />
                    </div>
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

          {isCompress && isVideo && (
            <>
              <section className="space-y-3">
                <label className="text-sm font-medium text-neutral-300">화면 크기 (해상도)</label>
                <select
                  value={(task as CompressTask).settings.resolution || 'original'}
                  onChange={(e) => onUpdate({ settings: { ...(task as CompressTask).settings, resolution: e.target.value as any } })}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-red-500 outline-none transition-all"
                >
                  <option value="original">원본 유지 (파일 크기 변화 없음)</option>
                  <option value="1080p">1080p (FHD) - 대화면 감상용</option>
                  <option value="720p">720p (HD) - 웹 업로드 및 공유용</option>
                  <option value="480p">480p (SD) - 용량 절약 및 모바일용</option>
                </select>
              </section>

              <section className="space-y-3">
                <label className="text-sm font-medium text-neutral-300">추가 옵션</label>
                <label className="flex items-center gap-3 p-4 bg-neutral-800/50 rounded-2xl cursor-pointer hover:bg-neutral-800 transition-colors border border-neutral-700/50">
                  <input
                    type="checkbox"
                    checked={!!(task as CompressTask).settings.mute}
                    onChange={(e) => onUpdate({ settings: { ...(task as CompressTask).settings, mute: e.target.checked } })}
                    className="w-5 h-5 rounded border-neutral-700 text-red-500 focus:ring-offset-neutral-900 focus:ring-red-500 bg-neutral-900"
                  />
                  <div>
                    <div className="text-sm font-bold">소리 제거 (음소거)</div>
                    <div className="text-xs text-neutral-500 leading-tight">영상에서 오디오를 삭제하여 용량을 추가로 확보합니다.</div>
                  </div>
                </label>
              </section>
            </>
          )}

          {isCompress && isImage && (
            <>
              <section className="space-y-3">
                <label className="text-sm font-medium text-neutral-300">최대 이미지 가로 크기 (px)</label>
                <select
                  value={(task as CompressTask).settings.maxWidth || 0}
                  onChange={(e) => onUpdate({ settings: { ...(task as CompressTask).settings, maxWidth: parseInt(e.target.value) || undefined } })}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-red-500 outline-none transition-all"
                >
                  <option value={0}>원본 크기 유지</option>
                  <option value={1920}>1920px (FHD)</option>
                  <option value={1280}>1280px (HD)</option>
                  <option value={800}>800px (웹용)</option>
                </select>
              </section>

              <section className="space-y-3">
                <label className="text-sm font-medium text-neutral-300">데이터 설정</label>
                <label className="flex items-center gap-3 p-4 bg-neutral-800/50 rounded-2xl cursor-pointer hover:bg-neutral-800 transition-colors border border-neutral-700/50">
                  <input
                    type="checkbox"
                    checked={!!(task as CompressTask).settings.keepMetadata}
                    onChange={(e) => onUpdate({ settings: { ...(task as CompressTask).settings, keepMetadata: e.target.checked } })}
                    className="w-5 h-5 rounded border-neutral-700 text-red-500 focus:ring-offset-neutral-900 focus:ring-red-500 bg-neutral-900"
                  />
                  <div>
                    <div className="text-sm font-bold">EXIF 메타데이터 유지</div>
                    <div className="text-xs text-neutral-500 leading-tight">촬영 위치, 카메라 정보 등을 삭제하지 않습니다. (삭제 시 용량이 더 줄어듭니다)</div>
                  </div>
                </label>
              </section>
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
