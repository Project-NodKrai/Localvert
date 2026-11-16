import { useRef, useState } from 'react';
import type { DragEvent, ChangeEvent } from 'react';
import { Upload, FolderOpen } from 'lucide-react';
import type { AppMode } from '../types';

interface FileUploaderProps {
  onFilesAdded: (files: FileList | File[]) => void;
  mode: AppMode;
}

export default function FileUploader({ onFilesAdded, mode }: FileUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const title = mode === 'convert' ? '변환할 파일을 추가해.' : '압축할 파일을 추가해.';

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length) onFilesAdded(event.dataTransfer.files);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.length) onFilesAdded(event.target.files);
    event.target.value = '';
  };

  return (
    <section aria-label="파일 업로드" className={'lv-dropzone' + (dragging ? ' is-dragging' : '')}
      onDragOver={event => { event.preventDefault(); setDragging(true); }}
      onDragLeave={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={handleDrop}>
      <div className="lv-dropzone-icon"><Upload size={28} strokeWidth={1.8} aria-hidden="true" /></div>
      <h2 className="lv-dropzone-title">{title}</h2>
      <p className="lv-dropzone-desc">파일을 끌어다 놓거나 아래 버튼을 눌러 선택해.</p>
      <input type="file" ref={fileInputRef} className="lv-visually-hidden"
        data-testid={mode + '-file-input'} aria-label={title}
        multiple onChange={handleChange} />
      <button type="button" className="lv-button lv-button-primary" onClick={() => fileInputRef.current?.click()}>
        <FolderOpen size={18} aria-hidden="true" /> 파일 선택
      </button>
    </section>
  );
}
