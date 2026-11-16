import { useEffect, useRef, useState } from 'react';
import Header from '../components/Header';
import {
  GENERATION_LEVELS, GENERATION_MODELS, DEFAULT_MODEL_BY_LEVEL,
  generationModel, defaultGenerationConfig,
} from '../lib/imageGeneration/catalog';
import type { GenerationConfig, GenerationLevel } from '../lib/imageGeneration/catalog';
import { probeImageWebGpu, runBrowserModel, browserModelReady, browserModelStatus } from '../lib/imageGeneration/browser';
import type { WebGpuSupport } from '../lib/imageGeneration/browser';
import '../styles/image-generation.css';

type Output = { id: string; url: string; filename: string; seed: number; promptId: string; metadataUrl?: string };
const LEVEL_LABEL: Record<GenerationLevel, string> = { instant: 'Instant', medium: 'Medium', high: 'High' };
const GUIDED: Array<{ key: keyof GenerationConfig; label: string; choices: string[] }> = [
  { key: 'style', label: '화풍', choices: ['실사', '애니메이션', '3D 렌더링', '일러스트', '수채화', '유화', '픽셀아트'] },
  { key: 'composition', label: '구도', choices: ['클로즈업', '상반신', '전신', '대칭 구도', '삼분할 구도'] },
  { key: 'camera', label: '카메라', choices: ['광각', '로우 앵글', '하이 앵글', '얕은 피사계 심도'] },
  { key: 'lighting', label: '조명', choices: ['확산광', '역광', '측면 조명', '부드러운 자연광'] },
  { key: 'palette', label: '색감', choices: ['차가운 색감', '따뜻한 색감', '파스텔톤', '선명한 색감'] },
  { key: 'background', label: '배경', choices: ['스튜디오', '실내', '도시', '숲', '일몰'] },
  { key: 'texture', label: '표현', choices: ['섬세한 질감', '깨끗한 선화', '부드러운 음영'] },
];
function saveBlob(blob: Blob): string {
  const href = URL.createObjectURL(blob);
  return href;
}

function nextSeed(random: boolean, seed: number, offset: number): number {
  if (!random) return Math.min(2147483647, Math.max(0, Math.trunc(seed) + offset));
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % 2147483647;
}

async function encodeOutput(blob: Blob, type: GenerationConfig['outputFormat'], quality: number): Promise<Blob> {
  if (type === 'png' && blob.type === 'image/png') return blob;
  const image = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('이미지 변환 캔버스를 만들 수 없어.');
    ctx.drawImage(image, 0, 0);
    const mime = type === 'jpeg' ? 'image/jpeg' : type === 'webp' ? 'image/webp' : 'image/png';
    const output = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(result => result ? resolve(result) : reject(new Error('결과 이미지를 저장할 수 없어.')),
        mime, quality / 100));
    if (output.type !== mime) throw new Error('브라우저가 ' + type.toUpperCase() + ' 저장을 지원하지 않아.');
    return output;
  } finally {
    image.close();
  }
}

export default function ImageGeneratorPage() {
  const [browserSupport, setBrowserSupport] = useState<WebGpuSupport | null>(null);
  const [allowModelDownload, setAllowModelDownload] = useState(false);
  const [level, setLevel] = useState<GenerationLevel>('instant');
  const [modelId, setModelId] = useState(DEFAULT_MODEL_BY_LEVEL.instant);
  const model = generationModel(modelId);
  const [config, setConfig] = useState<GenerationConfig>(() => defaultGenerationConfig(model));
  const [showSettings, setShowSettings] = useState(false);
  const [showConnection, setShowConnection] = useState(false);
  const [showMapping, setShowMapping] = useState(false);
  const [showVisual, setShowVisual] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [output, setOutput] = useState<Output[]>([]);
  const [busy, setBusy] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const urlsRef = useRef(new Set<string>());

  useEffect(() => () => {
    controllerRef.current?.abort();
    for (const url of urlsRef.current) URL.revokeObjectURL(url);
    urlsRef.current.clear();
  }, []);

  useEffect(() => {
    let alive = true;
    probeImageWebGpu().then(support => { if (alive) setBrowserSupport(support); });
    return () => { alive = false; };
  }, []);

  const browserModelAvailable = browserModelReady(modelId);
  const canGenerate = !!config.prompt.trim() && !busy && browserModelAvailable &&
    browserSupport?.available === true && allowModelDownload;

  const modelsInLevel = GENERATION_MODELS.filter(item => item.level === level);

  function registerUrl(blob: Blob): string {
    const href = saveBlob(blob);
    urlsRef.current.add(href);
    return href;
  }

  function setValue<K extends keyof GenerationConfig>(key: K, value: GenerationConfig[K]) {
    setConfig(previous => ({ ...previous, [key]: value }));
  }

  function pickLevel(next: GenerationLevel) {
    setLevel(next);
    pickModel(DEFAULT_MODEL_BY_LEVEL[next]);
  }

  function pickModel(id: string) {
    const next = generationModel(id);
    setModelId(id);
    setConfig(previous => ({
      ...previous, steps: next.steps.initial, cfg: next.cfg ?? 1,
      sampler: next.sampler ?? previous.sampler,
      width: id === 'sana-sprint-06b' ? 1024 : 512,
      height: id === 'sana-sprint-06b' ? 1024 : 512,
      batchSize: 1,
    }));
    setAllowModelDownload(false);
    setError('');
  }

  function setRatio(width: number, height: number) {
    setConfig(previous => ({ ...previous, width, height }));
  }

  async function generate() {
    if (!canGenerate || busy) return;
    const snapshot = structuredClone(config);
    const selected = model;
    const modelIdSnapshot = modelId;
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true);
    setProgress('브라우저 GPU 모델 준비 중');
    setError('');
    try {
      if (!browserModelReady(modelIdSnapshot)) {
        throw new Error('이 모델에는 브라우저 추론 엔진이 아직 연결되지 않았어.');
      }
      if (!Number.isInteger(snapshot.batchCount) || snapshot.batchCount < 1 || snapshot.batchCount > 3 ||
          snapshot.batchSize !== 1 ||
          ![snapshot.width, snapshot.height].every(n =>
            Number.isInteger(n) && n >= 256 && n <= 1024 && n % 64 === 0)) {
        throw new Error('생성 개수 1~3장, 해상도 256~1024px(64px 단위), Batch Size 1을 사용해.');
      }
      for (let index = 0; index < snapshot.batchCount; index++) {
        const seed = nextSeed(snapshot.randomSeed, snapshot.seed, index);
        const jobId = crypto.randomUUID();
        const onState = (status: string) => setProgress((index + 1) + '/' + snapshot.batchCount + ' · ' + status);
        const generatedBlob = await runBrowserModel({
          modelId: modelIdSnapshot, config: snapshot, seed, signal: controller.signal, onState,
        });
        if (controller.signal.aborted) throw new DOMException('생성이 중단됐어.', 'AbortError');
        const blob = await encodeOutput(generatedBlob, snapshot.outputFormat, snapshot.quality);
        const filename = 'localvert-' + selected.id + '-' + jobId.slice(0, 8) +
          '.' + (snapshot.outputFormat === 'jpeg' ? 'jpg' : snapshot.outputFormat);
        const metadata = snapshot.includeMetadata ? registerUrl(new Blob([JSON.stringify({
          jobId, promptId: 'browser-' + jobId, modelId: modelIdSnapshot,
          engine: 'browser-webgpu', seed, settings: snapshot,
        }, null, 2)], { type: 'application/json' })) : undefined;
        const item: Output = {
          id: jobId, filename, url: registerUrl(blob),
          promptId: 'browser-' + jobId, seed, metadataUrl: metadata,
        };
        setOutput(previous => [item, ...previous]);
      }
      setProgress('생성 완료');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '이미지 생성에 실패했어.');
      setProgress('');
    } finally {
      controllerRef.current = null;
      setBusy(false);
    }
  }

  return (
    <div className="lv-app gen-page">
      <Header />
      <main className="lv-workspace gen-workspace">
        <header className="lv-page-intro">
          <div className="lv-page-eyebrow">LOCALVERT / IMAGE GENERATION</div>
          <h1>이미지 생성</h1>
          <p>문장을 이미지로 만들고 모델과 생성 조건을 직접 조절해.</p>
        </header>

        <section className="gen-card gen-main" aria-label="이미지 생성 입력">
          <div className="gen-heading-row">
            <h2>생성 수준</h2>
            <span className="gen-muted">{model.name} · {model.params}</span>
          </div>
          <div className="gen-level-switch" role="group" aria-label="이미지 생성 수준">
            {GENERATION_LEVELS.map(item => (
              <button type="button" key={item} aria-pressed={level === item}
                onClick={() => pickLevel(item)}>{LEVEL_LABEL[item]}</button>
            ))}
          </div>
          <label className="gen-label" htmlFor="gen-model">모델</label>
          <select id="gen-model" className="gen-input" value={modelId}
            onChange={event => pickModel(event.target.value)}>
            {modelsInLevel.map(item => <option key={item.id} value={item.id}>{item.name} · {browserModelReady(item.id) ? item.use : '준비 중'}</option>)}
          </select>
          <div className="gen-model-note">
            <span>{model.use}</span>
            <a href={model.checkpointUrl} target="_blank" rel="noreferrer">모델 정보 보기</a>
          </div>

          <label className="gen-label" htmlFor="gen-prompt">Positive Prompt</label>
          <textarea id="gen-prompt" className="gen-prompt" rows={5}
            placeholder="생성하고 싶은 장면을 적어줘."
            value={config.prompt} onChange={event => setValue('prompt', event.target.value)} />
          {model.negative && (
            <>
              <label className="gen-label" htmlFor="gen-negative">Negative Prompt</label>
              <textarea id="gen-negative" className="gen-prompt" rows={2} value={config.negative}
                placeholder="피하고 싶은 요소"
                onChange={event => setValue('negative', event.target.value)} />
            </>
          )}
          <div className="gen-field-row">
            <span className="gen-label">화면 비율</span>
            <span className="gen-muted">{config.width} × {config.height}</span>
          </div>
          <div className="gen-ratio-options" role="group" aria-label="해상도 프리셋">
            {([
              ['1:1', modelId === 'sana-sprint-06b' ? 1024 : 512, modelId === 'sana-sprint-06b' ? 1024 : 512],
              ['4:3', 768, 576],
              ['16:9', 1024, 576],
              ['9:16', 576, 1024],
            ] as const).map(([label, w, h]) => (
              <button key={label} type="button" aria-pressed={config.width === w && config.height === h}
                onClick={() => setRatio(w, h)}>{label}</button>
            ))}
          </div>
          <div className="gen-dimensions">
            <label>가로(px)<input type="number" min={256} max={1024} step={64} className="gen-input"
              value={config.width} onChange={event => setValue('width', Number(event.target.value))} /></label>
            <label>세로(px)<input type="number" min={256} max={1024} step={64} className="gen-input"
              value={config.height} onChange={event => setValue('height', Number(event.target.value))} /></label>
          </div>

          <details className="gen-details" open={showVisual} onToggle={event => setShowVisual((event.currentTarget as HTMLDetailsElement).open)}>
            <summary>시각적 요소</summary>
            <div className="gen-options-grid">
              {GUIDED.map(item => (
                <label key={item.key}>{item.label}
                  <select className="gen-input" value={String(config[item.key])}
                    onChange={event => setValue(item.key, event.target.value)}>
                    <option value="">지정하지 않음</option>
                    {item.choices.map(choice => <option key={choice} value={choice}>{choice}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </details>

          <details className="gen-details" open={showSettings} onToggle={event => setShowSettings((event.currentTarget as HTMLDetailsElement).open)}>
            <summary>생성 설정</summary>
            <div className="gen-options-grid">
              <div className="gen-field">
                <label htmlFor="gen-steps">Sampling Steps</label>
                {model.steps.min === model.steps.max
                  ? <output className="gen-static-value">{model.steps.initial}</output>
                  : <input id="gen-steps" type="range" min={model.steps.min} max={model.steps.max}
                      step={1} value={config.steps}
                      onChange={event => setValue('steps', Number(event.target.value))} />}
                {model.steps.min !== model.steps.max && <output>{config.steps}</output>}
              </div>
              <label className="gen-check"><input type="checkbox" checked={config.randomSeed}
                onChange={event => setValue('randomSeed', event.target.checked)} /> Random Seed</label>
              {!config.randomSeed && (
                <label>Seed<input className="gen-input" type="number" min={0} max={2147483647}
                  value={config.seed} onChange={event => setValue('seed', Number(event.target.value))} /></label>
              )}
              <label>Batch Count<input className="gen-input" type="number" min={1} max={3}
                value={config.batchCount} onChange={event => setValue('batchCount', Number(event.target.value))} /></label>
              <label>Output Format<select className="gen-input" value={config.outputFormat}
                onChange={event => setValue('outputFormat', event.target.value as GenerationConfig['outputFormat'])}>
                  <option value="png">PNG</option><option value="webp">WebP</option><option value="jpeg">JPEG</option>
                </select></label>
              {config.outputFormat !== 'png' && <label>Quality
                <input type="range" min={40} max={100} step={1} value={config.quality}
                  onChange={event => setValue('quality', Number(event.target.value))} />
                <output>{config.quality}%</output>
              </label>}
              <label className="gen-check">
                <input type="checkbox" checked={config.includeMetadata}
                  onChange={event => setValue('includeMetadata', event.target.checked)} />
                설정 JSON 함께 저장
              </label>
            </div>
          </details>

          <div className="gen-actions">
            <button type="button" className="lv-button lv-button-primary gen-submit"
              disabled={!canGenerate}
              onClick={generate}>{busy ? '생성 중' : '이미지 생성'}</button>
            {busy && <button type="button" className="lv-button lv-button-subtle"
              onClick={() => controllerRef.current?.abort()}>생성 중단</button>}
          </div>
          {!browserModelAvailable && <p className="gen-help" role="status">
            {browserModelStatus(model.id)}
          </p>}
          {busy || progress ? <p className="gen-progress" role="status">{progress}</p> : null}
          {error && <div className="gen-error" role="alert">{error}</div>}
        </section>

        <section className="gen-card" aria-label="브라우저 생성 엔진">
          <div className="gen-heading-row">
            <h2>브라우저 WebGPU 엔진</h2>
            <span className={'gen-state ' + (browserSupport?.available ? 'gen-state-ready' : 'gen-state-idle')}>
              {browserSupport ? (browserSupport.available ? 'WebGPU 준비됨' : 'WebGPU 불가') : 'GPU 확인 중'}
            </span>
          </div>
          <p className="gen-muted gen-description">{browserSupport?.reason || '브라우저의 GPU를 확인하고 있어.'}</p>
          <p className="gen-help">
            {modelId === 'sana-sprint-06b'
              ? 'SANA-Sprint 0.6B · 브라우저 WebGPU 실험 엔진. 모델 가중치는 외부에서 내려받으며 변환 모델의 실기 호환성 검증은 아직 완료되지 않았어.'
              : modelId === 'flux2-klein-4b'
                ? 'FLUX.2 Klein 4B · 최초 다운로드 약 6.5GB. 브라우저에서 직접 연산하며 실제 가중치 기반 생성은 검증 전이야.'
                : '이 모델의 브라우저 추론 엔진은 준비되지 않았어.'}
          </p>
          <label className="gen-check">
            <input type="checkbox" checked={allowModelDownload}
              onChange={event => setAllowModelDownload(event.target.checked)} />
            대용량 모델 다운로드 및 브라우저 저장소 사용에 동의
          </label>
          <p className="gen-help">
            <a href={modelId === 'sana-sprint-06b'
              ? 'https://huggingface.co/Efficient-Large-Model/Sana_Sprint_0.6B_1024px_diffusers'
              : 'https://huggingface.co/cgb/flux2-klein-4b-onnx-webgpu'}
              target="_blank" rel="noreferrer">ONNX 모델 및 라이선스 보기</a>
          </p>
        </section>
        <section className="gen-card" aria-labelledby="gen-output-title">
          <div className="gen-heading-row">
            <h2 id="gen-output-title">생성 결과</h2>
            <span className="gen-muted">{output.length}개</span>
          </div>
          {!output.length ? <p className="gen-empty">아직 생성된 이미지가 없어.</p> : (
            <ul className="gen-gallery">
              {output.map(item => <li className="gen-result" key={item.id}>
                <img src={item.url} alt={'생성 이미지 · 시드 ' + item.seed} loading="lazy" />
                <div className="gen-result-footer">
                  <span>Seed {item.seed}</span>
                  <a className="lv-button lv-button-subtle" href={item.url} download={item.filename}>다운로드</a>
                  {item.metadataUrl && <a className="gen-meta-link" href={item.metadataUrl}
                    download={item.filename.replace(/\.[^.]+$/, '.json')}>설정 JSON</a>}
                </div>
              </li>)}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
