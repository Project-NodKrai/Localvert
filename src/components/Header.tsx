import { useLocation, Link } from 'react-router-dom';

const pages = [
  { to: '/', label: '변환' },
  { to: '/compress', label: '압축' },
  { to: '/upscale', label: '고화질 복원' },
  { to: '/generate', label: '이미지 생성' },
  { to: '/details', label: '기능 안내' },
] as const;

export default function Header({ variant: _variant = 'default' }: { variant?: 'default' | 'upscale' }) {
  const { pathname } = useLocation();
  return (
    <header className="lv-header">
      <div className="lv-header-inner">
        <Link className="lv-brand" to="/" aria-label="LocalVert 홈">
          <span className="lv-brand-symbol" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="28" height="28" fill="none">
              <path d="M7 10 16 5l9 5v12l-9 5-9-5V10Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
              <path d="m10 19 4-4 4 3 4-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
          <span className="lv-brand-word">Localvert</span>
          <span className="lv-brand-chip">Free</span>
        </Link>
        <nav className="lv-navigation" aria-label="주요 기능">
          {pages.map(({ to, label }) => {
            const active = pathname === to || (to === '/details' && pathname === '/세부페이지');
            return (
              <Link key={to} to={to} aria-current={active ? 'page' : undefined}
                className={'lv-nav-link' + (active ? ' is-active' : '')}>{label}</Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
