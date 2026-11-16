import { Moon } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Header({ variant = 'default' }: { variant?: 'default' | 'upscale' }) {
  const light = variant === 'upscale';
  return (
    <header className={light
      ? 'relative z-20 w-full border-b border-[#E4E9F3] bg-white/95 text-[#18223A]'
      : 'w-full bg-neutral-900 border-b border-neutral-800'}>
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group cursor-pointer">
          <Moon className={light
            ? 'w-8 h-8 text-[#276CF5] fill-[#276CF5]/10 transition-transform group-hover:rotate-12'
            : 'w-8 h-8 text-red-500 fill-red-500/10 transition-transform group-hover:rotate-12'} />
          <div className="flex items-baseline">
            <span className={light ? 'text-2xl font-bold tracking-tight text-[#17223B]' : 'text-2xl font-bold tracking-tight text-white'}>Localvert</span>
            <span className={light
              ? 'text-xs bg-[#EAF1FF] text-[#2469ED] px-2 py-0.5 rounded-full ml-2 font-medium'
              : 'text-xs bg-red-500/20 text-red-500 px-2 py-0.5 rounded-full ml-2 font-medium'}>Free</span>
          </div>
        </Link>
        <nav className={light ? 'hidden md:flex gap-3 text-sm font-medium text-[#66718A]' : 'hidden md:flex gap-6 text-sm font-medium text-neutral-400'}>
          <Link to="/" className={light ? 'rounded-full px-3 py-2 hover:bg-[#F1F5FC] hover:text-[#1D52BE] transition-colors' : 'hover:text-white transition-colors'}>변환</Link>
          <Link to="/compress" className={light ? 'rounded-full px-3 py-2 hover:bg-[#F1F5FC] hover:text-[#1D52BE] transition-colors' : 'hover:text-white transition-colors'}>압축</Link>
          <Link to="/upscale" aria-current={light ? 'page' : undefined}
            className={light ? 'rounded-full bg-[#E8F0FF] px-4 py-2 text-[#236AF4]' : 'hover:text-white transition-colors'}>고화질 복원</Link>
          <Link to="/details" className={light ? 'rounded-full px-3 py-2 hover:bg-[#F1F5FC] hover:text-[#1D52BE] transition-colors' : 'hover:text-white transition-colors'}>기능</Link>
          <a href="#" className={light ? 'rounded-full px-3 py-2 hover:text-[#1D52BE] transition-colors' : 'hover:text-white transition-colors'}>보안</a>
        </nav>
      </div>
    </header>
  );
}
