import { motion } from 'motion/react';
import { Settings2, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { AppMode, FileType, FORMATS } from '../types';
import { FormatSelector } from './FormatSelector';

interface PreUploadSettingsProps {
  mode: AppMode;
  settings: any;
  onUpdate: (updates: any) => void;
}

export default function PreUploadSettings({ mode, settings, onUpdate }: PreUploadSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);

  const renderContent = () => {
    if (mode === 'convert') {
      return (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <label className="text-sm text-neutral-400 font-medium">기본 변환 포맷</label>
            <FormatSelector 
              currentFormat={settings.targetFormat} 
              onFormatChange={(f) => onUpdate({ targetFormat: f })}
              defaultCategory="video"
            />
          </div>
          <p className="text-[10px] text-neutral-500">업로드하는 모든 파일에 이 포맷이 우선적으로 적용됩니다.</p>
        </div>
      );
    }

    if (mode === 'compress') {
      return (
        <div className="space-y-6">
          <section className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-neutral-300">압축 강도 (품질)</label>
              <span className="text-sm font-mono text-red-500 font-bold">{settings.quality}%</span>
            </div>
            <input
              type="range"
              min="10"
              max="100"
              step="5"
              value={settings.quality}
              onChange={(e) => onUpdate({ quality: parseInt(e.target.value) })}
              className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-red-500"
            />
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">영상 해상도</label>
              <select
                value={settings.resolution || 'original'}
                onChange={(e) => onUpdate({ resolution: e.target.value })}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white"
              >
                <option value="original">원본 유지</option>
                <option value="1080p">1080p (FHD)</option>
                <option value="720p">720p (HD)</option>
                <option value="480p">480p (SD)</option>
              </select>
            </div>
            <div className="space-y-2 flex flex-col justify-end">
               <label className="flex items-center gap-3 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    checked={settings.mute}
                    onChange={(e) => onUpdate({ mute: e.target.checked })}
                    className="w-4 h-4 rounded border-neutral-700 bg-neutral-800 text-red-500"
                  />
                  <span className="text-xs text-neutral-300 group-hover:text-white transition-colors">기본 음소거 적용</span>
               </label>
            </div>
          </section>
        </div>
      );
    }

    if (mode === 'upscale') {
      return (
        <div className="space-y-6">
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <label className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">복원 모델</label>
              <div className="flex gap-2">
                {['standard', 'ultra'].map((m) => (
                  <button
                    key={m}
                    onClick={() => onUpdate({ model: m })}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                      settings.model === m 
                        ? 'bg-red-500 text-white shadow-lg shadow-red-900/20' 
                        : 'bg-neutral-800 text-neutral-500 hover:text-neutral-300'
                    }`}
                  >
                    {m.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <label className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">영상 처리 방식</label>
              <div className="flex gap-2">
                {['filter', 'ai'].map((v) => (
                  <button
                    key={v}
                    onClick={() => onUpdate({ videoMethod: v })}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                      settings.videoMethod === v 
                        ? 'bg-red-500 text-white shadow-lg shadow-red-900/20' 
                        : 'bg-neutral-800 text-neutral-500 hover:text-neutral-300'
                    }`}
                  >
                    {v === 'filter' ? 'FAST' : 'AI'}
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="w-full max-w-xl mb-8 relative z-10">
      <div 
        className={`bg-neutral-800/40 backdrop-blur-md border border-neutral-700/50 rounded-2xl overflow-hidden transition-all duration-300 ${isOpen ? 'shadow-2xl ring-1 ring-neutral-700' : 'hover:bg-neutral-800/60'}`}
      >
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="w-full px-6 py-4 flex items-center justify-between text-neutral-300 hover:text-white transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-neutral-700/50 rounded-lg">
              <Settings2 className="w-4 h-4" />
            </div>
            <span className="text-sm font-bold tracking-tight">업로드 전 옵션 설정</span>
          </div>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        <motion.div
          initial={false}
          animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }}
          className="overflow-hidden"
        >
          <div className="px-6 pb-6 pt-2 border-t border-neutral-700/30">
            {renderContent()}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
