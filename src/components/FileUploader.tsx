import { useRef, DragEvent, ChangeEvent } from 'react';
import { Upload } from 'lucide-react';
import { AppMode } from '../types';

interface FileUploaderProps {
  onFilesAdded: (files: FileList | File[]) => void;
  mode: AppMode;
}

export default function FileUploader({ onFilesAdded, mode }: FileUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesAdded(e.dataTransfer.files);
      e.dataTransfer.clearData();
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesAdded(e.target.files);
      // Reset input so the same file could be selected again if removed
      e.target.value = '';
    }
  };

  return (
    <div className="w-full max-w-3xl flex flex-col items-center gap-6">
      <div 
        className="w-full h-48 md:h-64 rounded-xl bg-red-600 hover:bg-red-500 shadow-2xl flex flex-col items-center justify-center cursor-pointer transition-colors border-2 border-dashed border-red-400 group"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <Upload className="w-12 h-12 text-white mb-4 group-hover:scale-110 transition-transform" />
        <span className="text-xl md:text-2xl font-bold text-white mb-2 uppercase tracking-tight">
          {mode === 'convert' ? '파일 변환하기' : '용량 압축하기'}
        </span>
        <span className="text-red-100 text-sm font-medium opacity-80">파일을 드래그하거나 클릭하여 시작하세요</span>
        
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          multiple 
          onChange={handleChange} 
        />
      </div>
      
      <p className="text-neutral-500 text-sm">
        이 서비스는 완전한 로컬(클라이언트 사이드) 환경에서 동작합니다. 파일은 서버로 전송되지 않습니다.
      </p>
    </div>
  );
}
