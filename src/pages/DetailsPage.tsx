import { Link } from 'react-router-dom';
import { ArrowRight, FileType2, FolderArchive, Image as ImageIcon, ShieldCheck } from 'lucide-react';
import Header from '../components/Header';

const features = [
  {
    to: '/',
    icon: FileType2,
    title: '파일 변환',
    description: '이미지, 동영상, 오디오, 문서 등 파일 종류에 맞는 출력 형식을 선택해 변환해.',
    action: '변환 화면 열기',
  },
  {
    to: '/compress',
    icon: FolderArchive,
    title: '용량 압축',
    description: '이미지와 동영상의 압축 강도, 형식, 해상도와 오디오 옵션을 조정해.',
    action: '압축 화면 열기',
  },
  {
    to: '/upscale',
    icon: ImageIcon,
    title: '고화질 복원',
    description: '실사, 일러스트, 애니메이션 및 동영상에 맞는 AI 모델과 복원 등급을 선택해.',
    action: '복원 화면 열기',
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
              const Icon = feature.icon;
              return (
                <article key={feature.to} className="lv-feature-card">
                  <div className="lv-feature-icon"><Icon size={24} strokeWidth={1.8} aria-hidden="true" /></div>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                  <Link className="lv-feature-link" to={feature.to}>
                    {feature.action} <ArrowRight size={17} aria-hidden="true" />
                  </Link>
                </article>
              );
            })}
          </div>
        </section>
        <section id="privacy" aria-labelledby="lv-privacy-title" className="lv-privacy-panel">
          <div className="lv-feature-icon"><ShieldCheck size={24} aria-hidden="true" /></div>
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
