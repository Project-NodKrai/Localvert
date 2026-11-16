import { Link } from 'react-router-dom';
import Header from '../components/Header';

const features = [
  {
    to: '/',
    icon: 'convert',
    title: '파일 변환',
    description: '이미지, 동영상, 오디오, 문서 등 파일 종류에 맞는 출력 형식을 선택해 변환해.',
    action: '변환 화면 열기',
  },
  {
    to: '/compress',
    icon: 'compress',
    title: '용량 압축',
    description: '이미지와 동영상의 압축 강도, 형식, 해상도와 오디오 옵션을 조정해.',
    action: '압축 화면 열기',
  },
  {
    to: '/upscale',
    icon: 'upscale',
    title: '고화질 복원',
    description: '실사, 일러스트, 애니메이션 및 동영상에 맞는 AI 모델과 복원 등급을 선택해.',
    action: '복원 화면 열기',
  },
  {
    to: '/generate',
    icon: 'generate',
    title: '이미지 생성',
    description: '텍스트 프롬프트와 생성 설정을 조정하고 로컬 ComfyUI에서 이미지를 생성해.',
    action: '생성 화면 열기',
  },
] as const;

export default function DetailsPage() {
  return (
    <div className="lv-app">
      <Header />
      <main className="lv-workspace lv-details-workspace">
        <header className="lv-page-intro">
          <div className="lv-page-eyebrow">LOCALVERT / DETAILS</div>
          <h1>기능 안내</h1>
          <p>파일 종류와 목적에 맞는 작업을 선택해.</p>
        </header>
        <section aria-labelledby="lv-features-title">
          <h2 id="lv-features-title" className="lv-section-title">파일 작업</h2>
          <div className="lv-feature-grid">
            {features.map(feature => {
              return (
                <article key={feature.to} className="lv-feature-card">
                  <div className="lv-feature-icon"><FeatureGlyph type={feature.icon} /></div>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                  <Link className="lv-feature-link" to={feature.to}>
                    {feature.action} <span aria-hidden="true">→</span>
                  </Link>
                </article>
              );
            })}
          </div>
        </section>
        <section id="privacy" aria-labelledby="lv-privacy-title" className="lv-privacy-panel">
          <div className="lv-feature-icon"><FeatureGlyph type="privacy" /></div>
          <div>
            <h2 id="lv-privacy-title">브라우저에서 파일 처리</h2>
            <p>
              선택한 파일은 브라우저 안에서 변환·압축·복원돼. 처리에 필요한 엔진이나 AI 모델 파일은
              처음 실행할 때 다운로드될 수 있어. 작업 중 파일을 임시로 보관하기 위해 브라우저 저장소를 사용하며,
              결과물은 직접 다운로드할 수 있어.
            </p>
          </div>
        </section>
      </main>
      <footer className="lv-footer">© 2026 Localvert · 브라우저 기반 파일 도구</footer>
    </div>
  );
}


type Glyph = 'convert' | 'compress' | 'upscale' | 'generate' | 'privacy';

/** Product-specific 24px geometry; no new icon library or theme preset. */
function FeatureGlyph({ type }: { type: Glyph }) {
  const props = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.85,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" {...props}>
      {type === 'convert' && <>
        <path d="M5 3.5h9l4 4v5M14 3.5v4h4M5 3.5V20h8" />
        <path d="M12 14h9m-3-3 3 3-3 3" />
      </>}
      {type === 'compress' && <>
        <rect x="4" y="3.5" width="16" height="17" rx="3" />
        <path d="M9 7.5h6M7.5 12h9M10 16.5h4" />
        <path d="m8 10 2 2-2 2m8-4-2 2 2 2" />
      </>}
      {type === 'upscale' && <>
        <rect x="3" y="6" width="15" height="14" rx="2" />
        <circle cx="8" cy="10" r="1.5" />
        <path d="m4.5 18 4.5-4 3 2 3-3 2 2.5M20 2v7m-3.5-3.5h7" />
      </>}
      {type === 'generate' && <>
        <path d="m12 2 2.2 6.1L20.5 10l-6.3 1.9L12 18l-2.2-6.1L3.5 10l6.3-1.9L12 2Z" />
        <path d="m19 16 1 2.5 2.5 1L20 20.5 19 23l-1-2.5-2.5-1 2.5-1L19 16Z" />
      </>}
      {type === 'privacy' && <>
        <path d="M12 2.5 20 6v6.5c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6l8-3.5Z" />
        <path d="m8.5 12.5 2.4 2.3 4.7-5" />
      </>}
    </svg>
  );
}
