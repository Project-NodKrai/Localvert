import { useRef } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import { TIER_LABELS, UPSCALE_TIERS } from '../../lib/upscalers/catalog';
import type { UpscaleTier } from '../../lib/upscalers/catalog';
import type { StudioViewMode } from '../../lib/upscalers/studio';

interface Props {
  view: StudioViewMode;
  tier: UpscaleTier;
  imageTier: UpscaleTier;
  videoTier: UpscaleTier;
  purpose: string;
  onTierChange: (tier: UpscaleTier) => void;
  onExpand: () => void;
}

export default function StudioLevelDock({
  view, tier, imageTier, videoTier, purpose, onTierChange, onExpand,
}: Props) {
  const startY = useRef<number | null>(null);
  const position = UPSCALE_TIERS.indexOf(tier);
  const label = view === 'mixed'
    ? imageTier === videoTier
      ? TIER_LABELS[tier] + ' (혼합)'
      : TIER_LABELS[imageTier] + ' · ' + TIER_LABELS[videoTier] + ' (혼합)'
    : TIER_LABELS[tier] + ' (' + purpose + ')';

  function pointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    startY.current = event.clientY;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Pointer capture may be unavailable. */ }
  }

  function pointerUp(event: PointerEvent<HTMLButtonElement>) {
    if (startY.current === null) return;
    const travelled = startY.current - event.clientY;
    startY.current = null;
    if (travelled > 34) onExpand();
  }

  return (
    <section className="studio-level-dock" aria-label="모델 수준">
      <div className="studio-level-dock-inner">
        <button
          className="studio-level-grab"
          type="button"
          aria-label="모델 상세 설정 펼치기"
          onClick={onExpand}
          onPointerDown={pointerDown}
          onPointerUp={pointerUp}
          onPointerCancel={() => { startY.current = null; }}
        >
          <span className="studio-level-grab-mark" aria-hidden="true" />
        </button>
        <div className="studio-level-head">
          <span className="studio-level-heading">모델 수준</span>
          <button type="button" aria-label="모델 상세 설정" aria-haspopup="dialog"
            className="studio-level-expand" onClick={onExpand}>
            <span className="studio-level-value">{label}</span>
            <span className="studio-level-chevron" aria-hidden="true">›</span>
          </button>
        </div>
        <div className="studio-level-rail">
          <label htmlFor="upscale-dock-tier" className="studio-visually-hidden">AI 복원 등급</label>
          <input id="upscale-dock-tier" type="range" min={0} max={UPSCALE_TIERS.length - 1}
            step={1} value={position} aria-valuetext={label}
            onChange={event => {
              const selected = UPSCALE_TIERS[Number(event.target.value)];
              if (selected) onTierChange(selected);
            }}
            style={{ '--dock-progress': position / (UPSCALE_TIERS.length - 1) * 100 + '%' } as CSSProperties}
          />
          <div className="studio-level-endpoints"><span>Nano</span><span>Reference</span></div>
        </div>
      </div>
    </section>
  );
}
