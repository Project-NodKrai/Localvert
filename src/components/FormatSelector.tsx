import { useState, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search, ChevronDown, ChevronRight } from 'lucide-react';
import { FORMATS, FileType } from '../types';
import { cn } from '@/lib/utils';

interface FormatSelectorProps {
  currentFormat?: string;
  onFormatChange: (format: string) => void;
  disabled?: boolean;
  defaultCategory?: FileType;
  label?: string;
}

const CATEGORY_LABELS: Record<FileType, string> = {
  video: '비디오',
  audio: '오디오',
  image: '이미지',
  document: '문서',
  archive: '아카이브',
  unknown: '전체',
};

const CATEGORY_ORDER: FileType[] = ['unknown', 'video', 'audio', 'image', 'document', 'archive'];

export function FormatSelector({ currentFormat, onFormatChange, disabled, defaultCategory = 'video', label }: FormatSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  
  const [activeCategory, setActiveCategory] = useState<FileType>(search ? 'unknown' : (defaultCategory === 'unknown' ? 'video' : defaultCategory));

  const filteredFormats = useMemo(() => {
    const q = search.trim().toLowerCase();
    
    if (q) {
      const results: string[] = [];
      Object.entries(FORMATS).forEach(([cat, list]) => {
        list.forEach(f => {
          if (f.includes(q) && !results.includes(f)) {
            results.push(f);
          }
        });
      });
      return results;
    } 
    
    if (activeCategory === 'unknown') {
      // Flatten all formats for 'Universal'
      const all: string[] = [];
      Object.values(FORMATS).forEach(list => {
        list.forEach(f => {
          if (!all.includes(f)) all.push(f);
        });
      });
      return all;
    }
    
    return FORMATS[activeCategory] || [];
  }, [search, activeCategory]);

  const handleSelect = (format: string) => {
    onFormatChange(format);
    setOpen(false);
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled} 
        className="bg-[#2B2B2B] hover:bg-[#333] border border-[#444] rounded px-3 py-1.5 text-sm text-neutral-200 uppercase font-medium flex items-center justify-between min-w-[80px] outline-none focus:border-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {label || currentFormat?.toUpperCase() || '...'}
        <ChevronDown className="w-4 h-4 ml-2 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0 bg-[#222222] border-[#3e3e3e] text-neutral-200 shadow-2xl rounded-lg overflow-hidden" align="end">
        <div className="p-4 border-b border-[#3e3e3e] flex items-center gap-3">
          <Search className="w-5 h-5 text-neutral-500" />
          <input 
            type="text" 
            placeholder="검색" 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent border-none outline-none text-base w-full placeholder:text-neutral-500 text-white"
          />
        </div>
        <div className="flex h-[320px]">
          {!search.trim() && (
            <div className="w-1/3 border-r border-[#3e3e3e] py-2 overflow-y-auto">
              {CATEGORY_ORDER.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    "w-full text-left px-5 py-3 text-[14px] flex items-center justify-between transition-colors",
                    activeCategory === cat ? "text-white font-medium" : "text-neutral-400 hover:bg-[#1a1a1a]"
                  )}
                >
                  <span className={cn("border-l-2 pl-3 -ml-5", activeCategory === cat ? "border-red-500" : "border-transparent")}>{CATEGORY_LABELS[cat]}</span>
                  {activeCategory === cat && <ChevronRight className="w-4 h-4 text-white opacity-80" />}
                </button>
              ))}
            </div>
          )}
          <div className={cn("p-4 overflow-y-auto", search.trim() ? "w-full" : "w-2/3")}>
             <div className="grid grid-cols-3 gap-2">
               {filteredFormats.map(fmt => (
                 <button
                   key={fmt}
                   onClick={() => handleSelect(fmt)}
                   className={cn(
                     "px-2 py-3 rounded text-[13px] tracking-wider text-center uppercase font-medium transition-colors border border-transparent shadow-[0_2px_4px_rgba(0,0,0,0.1)]",
                     currentFormat === fmt 
                        ? "bg-[#3B3B3B] text-white border-[#555]" 
                        : "bg-[#333333] text-neutral-300 hover:bg-[#3d3d3d]"
                   )}
                 >
                   {fmt}
                 </button>
               ))}
               {filteredFormats.length === 0 && (
                 <div className="col-span-3 text-center py-10 text-neutral-500 text-sm">결과 없음</div>
               )}
             </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
