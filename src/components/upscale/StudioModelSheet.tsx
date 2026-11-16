import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronRight, Layers3, SlidersHorizontal, X } from 'lucide-react';
import {
  activeModel, modelsForTierPurpose, tierPurposeLabel,
  UPSCALE_PURPOSES, UPSCALE_TIERS, TIER_LABELS,
} from '../../lib/upscalers/catalog';
import type { UpscaleModelSelection, UpscaleTier, UpscaleUse } from '../../lib/upscalers/catalog';
import { isStudioProfileRunnable, updateStudioProfile } from '../../lib/upscalers/studio';
import type { StudioMedia, StudioProfile } from '../../lib/upscalers/studio';

type Props = {
  open: boolean;
  media: StudioMedia;
  profile: StudioProfile;
  startTab: 'tier' | 'model';
  onChange: (updates: Partial<StudioProfile>) => void;
  onClose: () => void;
};

export default function StudioModelSheet({ open, media, profile, startTab, onChange, onClose }: Props) {
  const [tab, setTab] = useState<'tier' | 'model'>('tier');
  const [purposeOpen, setPurposeOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const modelListRef = useRef<HTMLDivElement>(null);
  const model = activeModel(profile.model);
  const selected = modelsForTierPurpose(profile.upscaleTier, profile.upscalePurpose)
    .find(item => item.available && item.id === model.id);
  const candidates = modelsForTierPurpose(profile.upscaleTier, profile.upscalePurpose);
  const canApply = isStudioProfileRunnable({ ...profile, videoMethod: 'ai' }, media);
  const tierPosition = UPSCALE_TIERS.indexOf(profile.upscaleTier);

  useEffect(() => {
    if (!open) return;
    setTab(startTab);
    setPurposeOpen(false);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open, startTab, onClose]);

  function changeTierPurpose(tier: UpscaleTier, purpose: UpscaleUse) {
    const next = updateStudioProfile(profile, { upscaleTier: tier, upscalePurpose: purpose });
    onChange({ upscaleTier: next.upscaleTier, upscalePurpose: next.upscalePurpose, model: next.model });
  }

  function switchTab(next: 'tier' | 'model') {
    setTab(next);
    if (next === 'model') modelListRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  return typeof document === 'undefined' ? null : createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="upscale-studio-sheet"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex items-end justify-center bg-[#1B2745]/45 backdrop-blur-[5px]"
          onClick={event => { if (event.target === event.currentTarget) onClose(); }}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="studio-sheet-heading"
            initial={{ y: '100%', opacity: 0.95 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0.95 }}
            transition={{ type: 'spring', stiffness: 360, damping: 37 }}
            className="flex max-h-[90dvh] w-full max-w-[810px] flex-col overflow-hidden rounded-t-[30px] border border-[#E0E7F3] bg-[#FCFDFF] text-[#19243D] shadow-[0_-15px_60px_rgba(21,43,89,.18)]"
          >
            <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-[#B6C0D2]" aria-hidden="true" />
            <div className="flex shrink-0 items-center justify-between gap-3 px-6 pb-4 pt-3 sm:px-9">
              <h2 id="studio-sheet-heading" className="text-xl font-bold tracking-tight">품질 수준 선택</h2>
              <button type="button" ref={closeRef} aria-label="모델 선택 닫기" onClick={onClose}
                className="rounded-full p-2 text-[#8490A7] transition-colors hover:bg-[#EDF2FC] hover:text-[#214C9B]">
                <X size={20} />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 pb-7 sm:px-9">
              <div className="grid grid-cols-2 rounded-2xl bg-[#F0F3FA] p-1" role="group" aria-label="모델 설정 구역">
                <button type="button" onClick={() => switchTab('tier')}
                  aria-pressed={tab === 'tier'}
                  className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold transition-colors ${tab === 'tier' ? 'bg-[#E1EBFF] text-[#2468F5] shadow-sm' : 'text-[#69758D] hover:text-[#245AC9]'}`}>
                  <Layers3 size={17} /> 등급 선택
                </button>
                <button type="button" onClick={() => switchTab('model')}
                  aria-pressed={tab === 'model'}
                  className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold transition-colors ${tab === 'model' ? 'bg-[#E1EBFF] text-[#2468F5] shadow-sm' : 'text-[#69758D] hover:text-[#245AC9]'}`}>
                  <SlidersHorizontal size={17} /> 모델 선택
                </button>
              </div>

              <div className="space-y-4 rounded-2xl border border-[#E5EAF4] bg-white px-5 py-5 shadow-[0_4px_18px_rgba(45,70,118,.045)]">
                <div className="flex justify-center">
                  <button type="button" onClick={() => setPurposeOpen(value => !value)}
                    title="용도 변경" aria-expanded={purposeOpen}
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-xl font-semibold hover:bg-[#F1F5FE]">
                    {tierPurposeLabel(profile.upscaleTier, profile.upscalePurpose)}
                    <ChevronRight size={18} className={`text-[#9BA5B8] transition-transform ${purposeOpen ? 'rotate-90' : ''}`} />
                  </button>
                </div>
                {purposeOpen && (
                  <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#F4F7FC] p-2">
                    {UPSCALE_PURPOSES.map(purpose => (
                      <button type="button" key={purpose} onClick={() => { changeTierPurpose(profile.upscaleTier, purpose); setPurposeOpen(false); }}
                        className={`rounded-lg px-3 py-2 text-sm ${purpose === profile.upscalePurpose ? 'bg-[#DDE9FF] text-[#2468F5]' : 'text-[#5D6B83] hover:bg-white'}`}>
                        {purpose}
                      </button>
                    ))}
                  </div>
                )}
                <label htmlFor="upscale-studio-tier" className="sr-only">AI 복원 등급</label>
                <input id="upscale-studio-tier" type="range" min={0} max={UPSCALE_TIERS.length - 1} step={1}
                  value={tierPosition} aria-valuetext={tierPurposeLabel(profile.upscaleTier, profile.upscalePurpose)}
                  onChange={event => {
                    const tier = UPSCALE_TIERS[Number(event.target.value)];
                    if (tier) changeTierPurpose(tier, profile.upscalePurpose);
                  }}
                  className="upscale-tier-range upscale-light-range w-full cursor-pointer"
                  style={{ '--upscale-progress': (tierPosition / (UPSCALE_TIERS.length - 1) * 100) + '%' } as CSSProperties}
                />
                <div className="grid grid-cols-9 gap-0.5 text-center">
                  {UPSCALE_TIERS.map(tier => (
                    <button key={tier} type="button" onClick={() => changeTierPurpose(tier, profile.upscalePurpose)}
                      aria-label={TIER_LABELS[tier]}
                      className={`rounded-lg py-1.5 text-[9px] sm:text-[11px] transition-colors ${profile.upscaleTier === tier ? 'bg-[#DFE9FF] font-bold text-[#246AF6]' : 'text-[#66718A] hover:bg-[#F2F5FB]'}`}>
                      {TIER_LABELS[tier]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-[#37445E]">용도</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {UPSCALE_PURPOSES.map(purpose => (
                    <button key={purpose} type="button" aria-pressed={profile.upscalePurpose === purpose}
                      onClick={() => changeTierPurpose(profile.upscaleTier, purpose)}
                      className={`rounded-full border px-3 py-2.5 text-sm font-medium transition-all ${profile.upscalePurpose === purpose
                        ? 'border-[#3279FB] bg-[#EDF3FF] text-[#2869EC] shadow-sm'
                        : 'border-[#E0E6F1] bg-white text-[#627088] hover:border-[#9DBDFB]'}`}>
                      {purpose}
                    </button>
                  ))}
                </div>
              </div>

              <div ref={modelListRef} className="space-y-3">
                <h3 className="text-sm font-semibold text-[#37445E]">
                  사용 모델 · {TIER_LABELS[profile.upscaleTier]} ({profile.upscalePurpose})
                </h3>
                <div className="space-y-2">
                  {candidates.length ? candidates.map(candidate => (
                    <button type="button" key={candidate.id} disabled={!candidate.available}
                      aria-pressed={candidate.available && candidate.id === selected?.id}
                      onClick={() => onChange({ model: candidate.id as UpscaleModelSelection })}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${!candidate.available
                        ? 'cursor-not-allowed border-[#E7EBF2] bg-[#F6F7FA] opacity-60'
                        : candidate.id === selected?.id ? 'border-[#BBD2FF] bg-[#EAF1FF] text-[#2159C4]'
                          : 'border-[#E5EAF2] bg-white text-[#28344B] hover:border-[#B5CEFC]'}`}>
                      <span className="flex min-w-0 items-center gap-3">
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${candidate.available && candidate.id === selected?.id ? 'border-[#246BF8] bg-[#246BF8]' : 'border-[#B6C0D1]'}`}>
                          {candidate.available && candidate.id === selected?.id && <Check size={12} className="text-white" />}
                        </span>
                        <span className="truncate text-sm font-semibold">{candidate.name}{candidate.scale ? ' ' + candidate.scale + '×' : ''}</span>
                      </span>
                      {!candidate.available && <span className="shrink-0 text-xs text-[#8B96A8]">준비 중</span>}
                    </button>
                  )) : (
                    <p className="rounded-xl border border-[#E5EAF2] bg-white p-4 text-sm text-[#75839D]">이 용도에 등록된 모델이 없어.</p>
                  )}
                </div>
                {!canApply && <p role="status" className="text-xs text-[#9A623D]">이 등급과 용도에 사용 가능한 모델이 없어.</p>}
              </div>
            </div>
            <div className="shrink-0 border-t border-[#E7ECF5] bg-white px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-9">
              <button type="button" disabled={!canApply} onClick={onClose}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#276DF7] px-5 py-3.5 text-sm font-bold text-white shadow-[0_6px_18px_rgba(39,109,247,.18)] transition-colors hover:bg-[#1559E4] disabled:cursor-not-allowed disabled:bg-[#A5B5D0]">
                <Check size={18} /> 이 모델로 적용하기
              </button>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
