import { Moon } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Header() {
  return (
    <header className="w-full bg-neutral-900 border-b border-neutral-800">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group cursor-pointer">
           <Moon className="w-8 h-8 text-red-500 fill-red-500/10 transition-transform group-hover:rotate-12" />
           <div className="flex items-baseline">
             <span className="text-2xl font-bold tracking-tight text-white">Localvert</span>
             <span className="text-xs bg-red-500/20 text-red-500 px-2 py-0.5 rounded-full ml-2 font-medium">Free</span>
           </div>
        </Link>
        <nav className="hidden md:flex gap-6 text-sm font-medium text-neutral-400">
          <Link to="/" className="hover:text-white transition-colors">변환</Link>
          <Link to="/compress" className="hover:text-white transition-colors">압축</Link>
          <Link to="/upscale" className="hover:text-white transition-colors">고화질 복원</Link>
          <Link to="/details" className="hover:text-white transition-colors">기능</Link>
          <a href="#" className="hover:text-white transition-colors">보안</a>
        </nav>
      </div>
    </header>
  );
}
