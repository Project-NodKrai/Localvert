import { BrowserRouter, Routes, Route } from 'react-router-dom';
import DetailsPage from './pages/DetailsPage';
import ConverterPage from './pages/ConverterPage';
import CompressorPage from './pages/CompressorPage';
import UpscalerPage from './pages/UpscalerPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ConverterPage />} />
        <Route path="/compress" element={<CompressorPage />} />
        <Route path="/upscale" element={<UpscalerPage />} />
        <Route path="/details" element={<DetailsPage />} />
        <Route path="/세부페이지" element={<DetailsPage />} />
      </Routes>
    </BrowserRouter>
  );
}
