import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { ChevronRight, Check } from 'lucide-react';
import type { UpscaleTask } from '../types';
import type { UpscaleTier, UpscaleUse, ActiveUpscaleModelId } from '../lib/upscalers/catalog';
import type { UpscaleAdvice } from '../lib/upscalers/performance';
import {
  UPSCALE_TIERS, UPSCALE_PURPOSES, modelsForTierPurpose,
  runnableModelForTierPurpose, activeModel, tierPurposeLabel,
} from '../lib/upscalers/catalog';

interface Props {
  task: UpscaleTask;
  onUpdate: (updates: Partial<UpscaleTask>) => void;
  imageAdvice?: UpscaleAdvice;
}

export default function TierPurposeSelector({ task, onUpdate, imageAdvice }: Props) {
  const [purposeOpen, setPurposeOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const model = activeModel(task.model);
  const tier = task.upscaleTier ?? model.tier;
  const purpose = task.upscalePurpose ?? '실사';
  const position = UPSCALE_TIERS.indexOf(tier);
  const candidates = modelsForTierPurpose(tier, purpose);
  const selected = candidates.find(entry => entry.available && entry.id === model.id);

  useEffect(() => { setPurposeOpen(false); setDetailsOpen(false); }, [task.id]);

  function pick(nextTier: UpscaleTier, nextPurpose: UpscaleUse) {
    const choices = modelsForTierPurpose(nextTier, nextPurpose);
    const existing = choices.some(entry => entry.available && entry.id === model.id);
    const fallback = runnableModelForTierPurpose(nextTier, nextPurpose);
    // Never substitute a model from a different tier or use an unimplemented ID.
    onUpdate({
      upscaleTier: nextTier,
      upscalePurpose: nextPurpose,
      ...(!existing && fallback ? { model: fallback as ActiveUpscaleModelId } : {}),
    });
  }

  return (
    <section className="space-y-4" aria-label="AI 복원 등급 및 용도">
      <div>
        <h3 className="text-sm font-semibold text-neutral-200">복원 모델</h3>
        <p className="mt-1 text-xs text-neutral-500">9단계 등급은 처리 부담 기준이야. 화질 순위를 보장하지 않아.</p>
      </div>
      <div className="space-y-4 rounded-[24px] border border-neutral-700 bg-neutral-800/70 p-5">
        <div className="flex justify-center">
          <button type="button" aria-expanded={purposeOpen}
            aria-controls={"purpose-options-" + task.id}
            title="용도 변경" onClick={() => setPurposeOpen(value => !value)}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 hover:bg-neutral-700/70 focus-visible:outline-2 focus-visible:outline-blue-400">
            <span className="text-xl font-medium text-white">{tierPurposeLabel(tier, purpose)}</span>
            <ChevronRight aria-hidden="true" size={18}
              className={"text-neutral-400 transition-transform " + (purposeOpen ? 'rotate-90' : '')} />
          </button>
        </div>
        {purposeOpen && (
          <div id={"purpose-options-" + task.id} className="grid grid-cols-2 gap-2">
            {UPSCALE_PURPOSES.map(use => (
              <button key={use} type="button" aria-pressed={purpose === use}
                onClick={() => { pick(tier, use); setPurposeOpen(false); }}
                className={`rounded-xl border px-3 py-2.5 text-sm transition-colors
                  ${purpose === use ? 'border-blue-500 bg-blue-500/20 text-white' : 'border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-500'}`}>
                {use}
              </button>
            ))}
          </div>
        )}
        <div className="space-y-3">
          <label htmlFor={"upscale-tier-" + task.id} className="sr-only">AI 복원 등급</label>
          <input id={"upscale-tier-" + task.id} type="range" min={0}
            max={UPSCALE_TIERS.length - 1} step={1} value={position}
            aria-valuetext={tierPurposeLabel(tier, purpose)}
            onChange={event => {
              const nextTier = UPSCALE_TIERS[Number(event.target.value)];
              if (nextTier) pick(nextTier, purpose);
            }}
            className="upscale-tier-range w-full cursor-pointer"
            style={{ '--upscale-progress': (position / (UPSCALE_TIERS.length - 1) * 100) + '%' } as CSSProperties}
          />
          <div className="flex justify-between text-[10px] text-neutral-400">
            <span>Nano</span><span>Reference</span>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-neutral-700 pt-3">
          <span className="text-sm text-neutral-300">{selected ? '사용 가능' : '준비 중'}</span>
          <button type="button" aria-expanded={detailsOpen}
            className="text-xs text-neutral-400 underline underline-offset-4 hover:text-white"
            onClick={() => setDetailsOpen(value => !value)}>모델 정보</button>
        </div>
        {detailsOpen && <p className="text-xs text-neutral-400">선택한 등급과 용도에 해당하는 모델만 보여 줘. 설치되지 않은 모델은 실행되지 않아.</p>}
      </div>
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-neutral-300">모델 선택</h4>
        {candidates.length ? candidates.map(candidate => (
          <button type="button" key={candidate.id} disabled={!candidate.available}
            aria-pressed={Boolean(candidate.available && candidate.id === model.id)}
            onClick={() => onUpdate({ model: candidate.id as UpscaleTask['model'] })}
            className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors
              ${!candidate.available ? 'cursor-not-allowed border-neutral-800 bg-neutral-900/60 opacity-60'
                : candidate.id === model.id ? 'border-blue-500 bg-blue-500/10' : 'border-neutral-700 bg-neutral-800/60 hover:border-neutral-500'}`}>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">{candidate.name}{candidate.scale ? ' · ' + candidate.scale + '×' : ''}</p>
              <p className="text-xs text-neutral-400">{candidate.note}</p>
            </div>
            <span className="flex shrink-0 items-center gap-1 text-xs text-neutral-400">
              {candidate.available ? (candidate.id === model.id ? <Check size={15} /> : '선택') : '준비 중'}
            </span>
          </button>
        )) : <p className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 text-sm text-neutral-400">이 용도에 등록된 모델이 아직 없어.</p>}
      </div>
      {!selected && <p role="status" className="rounded-lg border border-amber-800/60 bg-amber-900/20 p-3 text-xs text-amber-300">
        이 등급과 용도에는 실행할 수 있는 모델이 아직 없어. 다른 등급이나 용도를 선택해 줘.
      </p>}
      {selected && imageAdvice && <div className="space-y-2 rounded-xl border border-neutral-700 bg-neutral-800/60 p-3 text-xs text-neutral-300">
        <p>예상 출력: {imageAdvice.outputMegapixels.toFixed(1)}MP · 추론 타일: {imageAdvice.patchSize}px</p>
        <p>기기 사양이 부족해도 경고 확인 후 실행할 수 있어.</p>
        {imageAdvice.warnings.map(message => <p className="text-amber-300" key={message}>{message}</p>)}
      </div>}
    </section>
  );
}
