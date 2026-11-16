import { useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search, ChevronDown, ChevronRight } from 'lucide-react';
import { FORMATS, FileType } from '../types';

interface Props {
  currentFormat?: string;
  onFormatChange: (format: string) => void;
  disabled?: boolean;
  defaultCategory?: FileType;
  label?: string;
  allowedFormats?: string[];
}

const LABELS: Record<FileType, string> = {
  video: '동영상', audio: '오디오', image: '이미지',
  document: '문서', archive: '압축파일', unknown: '전체',
};
const ORDER: FileType[] = ['unknown', 'video', 'audio', 'image', 'document', 'archive'];

export function FormatSelector({
  currentFormat, onFormatChange, disabled, defaultCategory = 'video', label, allowedFormats,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<FileType>(
    defaultCategory === 'unknown' ? 'video' : defaultCategory,
  );

  const choices = useMemo(() => {
    const query = search.trim().toLowerCase();
    const allowed = allowedFormats ? new Set(allowedFormats) : null;
    const src = query || category === 'unknown'
      ? [...new Set(Object.values(FORMATS).flat())]
      : FORMATS[category] || [];
    return src.filter(format =>
      (!allowed || allowed.has(format)) && (!query || format.includes(query)));
  }, [search, category, allowedFormats]);

  function select(format: string) {
    onFormatChange(format);
    setOpen(false);
    setSearch('');
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger disabled={disabled} aria-label="출력 형식 선택"
        className="lv-format-trigger">
        {label || currentFormat?.toUpperCase() || '선택'}
        <ChevronDown size={15} aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="lv-format-popover">
        <div className="lv-format-search">
          <Search size={18} aria-hidden="true" />
          <input type="search" aria-label="형식 검색" placeholder="형식 검색"
            value={search} onChange={event => setSearch(event.target.value)} />
        </div>
        <div className="lv-format-layout">
          {!search.trim() && (
            <div className="lv-format-categories" role="group" aria-label="형식 종류">
              {ORDER.map(item => (
                <button key={item} type="button" aria-pressed={category === item}
                  className={'lv-format-category' + (category === item ? ' is-active' : '')}
                  onClick={() => setCategory(item)}>
                  {LABELS[item]}
                  {category === item && <ChevronRight size={15} aria-hidden="true" />}
                </button>
              ))}
            </div>
          )}
          <div className="lv-format-choices" role="group" aria-label="출력 형식">
            {choices.map(format => (
              <button key={format} type="button"
                aria-pressed={currentFormat === format}
                onClick={() => select(format)}
                className={'lv-format-option' + (currentFormat === format ? ' is-active' : '')}>
                {format.toUpperCase()}
              </button>
            ))}
            {!choices.length && <p className="lv-format-empty">일치하는 형식이 없어.</p>}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
