import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import DetailsPage from './pages/DetailsPage';
import ConverterPage from './pages/ConverterPage';
import CompressorPage from './pages/CompressorPage';
import UpscalerPage from './pages/UpscalerPage';
import ImageGeneratorPage from './pages/ImageGeneratorPage';
import { clearStorage } from './lib/storage';

/**
 * A route change must not unmount an in-flight conversion.
 * All three workspaces live for the lifetime of this browser document, even
 * while hidden. This retains task queues, progress, completed URLs and settings.
 */
function PersistentWorkspaces() {
  const { pathname } = useLocation();
  const isDetails = pathname === '/details' || pathname === '/세부페이지';

  return (
    <>
      <div hidden={pathname !== '/'}><ConverterPage /></div>
      <div hidden={pathname !== '/compress'}><CompressorPage /></div>
      <div hidden={pathname !== '/upscale'}><UpscalerPage /></div>
      <div hidden={pathname !== '/generate'}><ImageGeneratorPage /></div>
      {isDetails && <DetailsPage />}
      {!['/', '/compress', '/upscale', '/generate', '/details', '/세부페이지'].includes(pathname) && (
        <Routes>
          <Route path="*" element={<DetailsPage />} />
        </Routes>
      )}
    </>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Only once, before ANY workspace can store a new file. Previously, every
    // page mount wiped the same IndexedDB store and deleted other jobs' inputs.
    let mounted = true;
    clearStorage()
      .catch((error) => console.warn('Unable to clear stale conversion inputs:', error))
      .finally(() => { if (mounted) setReady(true); });
    return () => { mounted = false; };
  }, []);

  return (
    <BrowserRouter>
      {ready
        ? <PersistentWorkspaces />
        : <div role="status" className="p-8 text-neutral-300">로컬 작업 공간 초기화 중...</div>}
    </BrowserRouter>
  );
}
