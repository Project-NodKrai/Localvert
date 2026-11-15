import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight, Check, X } from 'lucide-react';
import type { UpscaleTask } from '../types';
import type { UpscaleTier, UpscaleUse, ActiveUpscaleModelId } from '../lib/upscalers/catalog';
import {
  UPSCALE_TIERS, UPSCALE_PURPOSES, modelsForTierPurpose,
  runnableModelForTierPurpose, activeModel, tierPurposeLabel,
} from '../lib/upscalers/catalog';

interface Props {
  task: UpscaleTask;
  onUpdate: (updates: Partial<UpscaleTask>) => void;
}

/** Opens the existing tier/purpose controls in a bottom sheet without a new theme. */
export default function TierPurposeSelector({ task, onUpdate }: Props) {
  const [open, setOpen] = useState(false);
  const [purposeOpen, setPurposeOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const model = activeModel(task.model);
  const tier = task.upscaleTier ?? model.tier;
  const purpose = task.upscalePurpose ?? '실사';
  const position = UPSCALE_TIERS.indexOf(tier);
  const candidates = modelsForTierPurpose(tier, purpose);
  const selected = candidates.find(entry => entry.available && entry.id === model.id);

  useEffect(() => {
    setPurposeOpen(false);
    setOpen(false);
  }, [task.id]);

  useEffect(() => {
    if (!open) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', escape);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = before;
      window.removeEventListener('keydown', escape);
      triggerRef.current?.focus();
    };
  }, [open]);

  function pick(nextTier: UpscaleTier, nextPurpose: UpscaleUse) {
    const options = modelsForTierPurpose(nextTier, nextPurpose);
    const same = options.some(entry => entry.available && entry.id === model.id);
    const fallback = runnableModelForTierPurpose(nextTier, nextPurpose);
    onUpdate({
      upscaleTier: nextTier,
      upscalePurpose: nextPurpose,
      ...(!same && fallback ? { model: fallback as ActiveUpscaleModelId } : {}),
    });
  }

  return (
    <section className="space-y-2" aria-label="AI 복원 모델 설정">
      <h3 className="text-sm font-semibold text-neutral-200">복원 모델</h3>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-4 rounded-2xl border border-neutral-700 bg-neutral-800/60 p-4 text-left transition-colors hover:border-neutral-500 focus-visible:outline-2 focus-visible:outline-blue-400"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-white">{tierPurposeLabel(tier, purpose)}</span>
          <span className="mt-1 block truncate text-xs text-neutral-400">
            {selected ? (model.name + (model.scale ? ' · ' + model.scale + '×' : '')) : '사용 가능한 모델 없음'}
          </span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-neutral-400" aria-hidden="true" />
      </button>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              key="upscale-model-bottom-sheet"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 backdrop-blur-sm"
              onMouseDown={event => {
                if (event.target === event.currentTarget) setOpen(false);
              }}
            >
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-labelledby="upscale-sheet-title"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', stiffness: 360, damping: 36 }}
                className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-neutral-700 bg-neutral-900 text-white shadow-2xl"
              >
                <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-neutral-600" aria-hidden="true" />
                <div className="flex shrink-0 items-center justify-between border-b border-neutral-800 px-5 py-4">
                  <h2 id="upscale-sheet-title" className="text-lg font-semibold">복원 모델 선택</h2>
                  <button ref={closeRef} type="button" aria-label="모델 선택 닫기"
                    onClick={() => setOpen(false)}
                    className="rounded-full p-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white">
                    <X size={20} />
                  </button>
                </div>
                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
                  <div className="space-y-4 rounded-[24px] border border-neutral-700 bg-neutral-800/70 p-5">
                    <div className="flex justify-center">
                      <button type="button"
                        aria-expanded={purposeOpen}
                        aria-controls={"upscale-purpose-options-" + task.id}
                        title="용도 변경"
                        onClick={() => setPurposeOpen(value => !value)}
                        className="flex items-center gap-1.5 rounded-xl px-3 py-2 transition-colors hover:bg-neutral-700/70 focus-visible:outline-2 focus-visible:outline-blue-400"
                      >
                        <span className="text-xl font-medium text-white">{tierPurposeLabel(tier, purpose)}</span>
                        <ChevronRight size={18} aria-hidden="true"
                          className={"text-neutral-400 transition-transform " + (purposeOpen ? 'rotate-90' : '')} />
                      </button>
                    </div>
                    {purposeOpen && (
                      <div id={"upscale-purpose-options-" + task.id} className="grid grid-cols-2 gap-2">
                        {UPSCALE_PURPOSES.map(use => (
                          <button type="button" key={use} aria-pressed={purpose === use}
                            onClick={() => { pick(tier, use); setPurposeOpen(false); }}
                            className={`rounded-xl border px-3 py-2.5 text-sm transition-colors
                              ${purpose === use ? 'border-blue-500 bg-blue-500/20 text-white' : 'border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-500'}`}
                          >{use}</button>
                        ))}
                      </div>
                    )}
                    <div className="space-y-3">
                      <label className="sr-only" htmlFor={"upscale-tier-" + task.id}>AI 복원 등급</label>
                      <input
                        id={"upscale-tier-" + task.id}
                        type="range" min={0} max={UPSCALE_TIERS.length - 1} step={1}
                        value={position}
                        aria-valuetext={tierPurposeLabel(tier, purpose)}
                        onChange={event => {
                          const next = UPSCALE_TIERS[Number(event.target.value)];
                          if (next) pick(next, purpose);
                        }}
                        className="upscale-tier-range w-full cursor-pointer"
                        style={{ '--upscale-progress': (position / (UPSCALE_TIERS.length - 1) * 100) + '%' } as CSSProperties}
                      />
                      <div className="flex justify-between text-[10px] text-neutral-400">
                        <span>Nano</span><span>Reference</span>
                      </div>
                    </div>
                    <div className="border-t border-neutral-700 pt-3 text-sm text-neutral-300">
                      {selected ? '사용 가능' : '준비 중'}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-neutral-300">모델 선택</h3>
                    {candidates.length ? candidates.map(candidate => (
                      <button type="button" key={candidate.id} disabled={!candidate.available}
                        aria-pressed={Boolean(candidate.available && candidate.id === model.id)}
                        onClick={() => onUpdate({ model: candidate.id as UpscaleTask['model'] })}
                        className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors
                          ${!candidate.available ? 'cursor-not-allowed border-neutral-800 bg-neutral-900/60 opacity-60'
                            : candidate.id === model.id ? 'border-blue-500 bg-blue-500/10' : 'border-neutral-700 bg-neutral-800/60 hover:border-neutral-500'}`}
                      >
                        <span className="text-sm font-semibold text-white">
                          {candidate.name}{candidate.scale ? ' · ' + candidate.scale + '×' : ''}
                        </span>
                        <span className="flex shrink-0 items-center gap-1 text-xs text-neutral-400">
                          {candidate.available ? (candidate.id === model.id ? <Check size={15} /> : '선택') : '준비 중'}
                        </span>
                      </button>
                    )) : (
                      <p className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 text-sm text-neutral-400">
                        이 용도에 등록된 모델이 아직 없어.
                      </p>
                    )}
                  </div>
                  {!selected && (
                    <p role="status" className="rounded-lg border border-neutral-700 bg-neutral-800/60 p-3 text-sm text-neutral-400">
                      사용 가능한 모델 없음
                    </p>
                  )}
                </div>
                <div className="shrink-0 border-t border-neutral-800 bg-neutral-900 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                  <button type="button" onClick={() => setOpen(false)}
                    className="w-full rounded-2xl bg-red-600 px-6 py-3 font-bold text-white transition-colors hover:bg-red-500">
                    완료
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </section>
  );
}
