import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import Header from '../components/Header';
import {
  GENERATION_LEVELS, GENERATION_MODELS, DEFAULT_MODEL_BY_LEVEL,
  generationModel, defaultGenerationConfig,
} from '../lib/imageGeneration/catalog';
import type { GenerationConfig, GenerationLevel } from '../lib/imageGeneration/catalog';
import {
  parseComfyWorkflow, detectBindings, fieldExists, listFields,
  validateWorkflowModel, fetchComfyStatus, runComfyWorkflow,
} from '../lib/imageGeneration/comfy';
import type { ComfyWorkflow, WorkflowBindings, FieldRef } from '../lib/imageGeneration/comfy';
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
const BINDING_LABELS: Array<{ key: keyof WorkflowBindings; label: string }> = [
  { key: 'prompt', label: 'Positive Prompt' },
  { key: 'negative', label: 'Negative Prompt' },
  { key: 'seed', label: 'Seed' },
  { key: 'steps', label: 'Sampling Steps' },
  { key: 'cfg', label: 'Guidance Scale' },
  { key: 'width', label: 'Width' },
  { key: 'height', label: 'Height' },
  { key: 'sampler', label: 'Sampler' },
  { key: 'scheduler', label: 'Scheduler' },
  { key: 'batch', label: 'Batch Size' },
  { key: 'lora', label: 'LoRA' },
  { key: 'loraStrength', label: 'LoRA Strength' },
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
  const [level, setLevel] = useState<GenerationLevel>('instant');
  const [modelId, setModelId] = useState(DEFAULT_MODEL_BY_LEVEL.instant);
  const model = generationModel(modelId);
  const [config, setConfig] = useState<GenerationConfig>(() => defaultGenerationConfig(model));
  const [endpoint, setEndpoint] = useState('http://127.0.0.1:8188/');
  const [connection, setConnection] = useState<'idle' | 'checking' | 'ready' | 'error'>('idle');
  const [workflow, setWorkflow] = useState<ComfyWorkflow | null>(null);
  const [workflowName, setWorkflowName] = useState('');
  const [bindings, setBindings] = useState<WorkflowBindings>({});
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
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    controllerRef.current?.abort();
    for (const url of urlsRef.current) URL.revokeObjectURL(url);
    urlsRef.current.clear();
  }, []);

  const fields = workflow ? listFields(workflow) : [];
  const availableResources = workflow ? (() => {
    try { return validateWorkflowModel(workflow, model); } catch { return []; }
  })() : [];
  const modelMatched = availableResources.length > 0;
  const promptBound = !!workflow && fieldExists(workflow, bindings.prompt);
  const requiredFields = (['seed', 'steps', 'width', 'height'] as const)
    .filter(key => !fieldExists(workflow || {}, bindings[key]));

  const canGenerate = !!workflow && modelMatched && promptBound && !requiredFields.length && !!config.prompt.trim() && !busy;
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
    }));
    setError('');
  }

  function setRatio(width: number, height: number) {
    setConfig(previous => ({ ...previous, width, height }));
  }

  async function loadWorkflow(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 3 * 1024 * 1024) throw new Error('워크플로 JSON은 3MB 이하만 가져올 수 있어.');
      const value = JSON.parse(await file.text()) as unknown;
      const graph = parseComfyWorkflow(value);
      setWorkflow(graph);
      const mapped = detectBindings(graph);
      setBindings(mapped);
      setWorkflowName(file.name);
      // Keep the imported workflow's sampler/scheduler rather than silently
      // replacing model-specific defaults on the first generation.
      const samplerValue = mapped.sampler && graph[mapped.sampler.nodeId]?.inputs[mapped.sampler.field];
      const schedulerValue = mapped.scheduler && graph[mapped.scheduler.nodeId]?.inputs[mapped.scheduler.field];
      setConfig(previous => ({
        ...previous,
        sampler: typeof samplerValue === 'string' ? samplerValue : previous.sampler,
        scheduler: typeof schedulerValue === 'string' ? schedulerValue : previous.scheduler,
      }));
      setShowConnection(true);
      setError('');
    } catch (cause) {
      setWorkflow(null);
      setBindings({});
      setWorkflowName('');
      setError(cause instanceof Error ? cause.message : '워크플로를 읽지 못했어.');
    }
  }

  async function checkConnection() {
    try {
      setConnection('checking');
      setError('');
      await fetchComfyStatus(endpoint);
      setConnection('ready');
    } catch (cause) {
      setConnection('error');
      setError(cause instanceof Error ? cause.message :
        '연결할 수 없어. ComfyUI의 CORS 설정과 실행 상태를 확인해.');
    }
  }

  function changeBinding(key: keyof WorkflowBindings, value: string) {
    setBindings(current => ({
      ...current,
      [key]: value ? JSON.parse(value) as FieldRef : undefined,
    }));
  }

  async function generate() {
    if (!workflow || !canGenerate || busy) return;
    const snapshot = structuredClone(config);
    const selected = model;
    const selectedBindings = structuredClone(bindings);
    const selectedWorkflow = structuredClone(workflow);
    const endpointSnapshot = endpoint;
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true);
    setProgress('모델 워크플로 확인 중');
    setError('');
    try {
      // Fail closed if a previous selection has left a mismatched workflow.
      validateWorkflowModel(selectedWorkflow, selected);
      await fetchComfyStatus(endpointSnapshot, controller.signal);
      setConnection('ready');
      if (!Number.isInteger(snapshot.batchCount) || snapshot.batchCount < 1 || snapshot.batchCount > 3 ||
          !Number.isInteger(snapshot.batchSize) || snapshot.batchSize < 1 || snapshot.batchSize > 4 ||
          ![snapshot.width, snapshot.height].every(n => Number.isInteger(n) && n >= 256 && n <= 2048 && n % 64 === 0)) {
        throw new Error('생성 개수는 1~3회, 배치 크기는 1~4개, 해상도는 256~2048px(64px 단위)로 지정해.');
      }
      for (let index = 0; index < snapshot.batchCount; index++) {
        const seed = nextSeed(snapshot.randomSeed, snapshot.seed, index);
        const jobId = crypto.randomUUID();
        const generated = await runComfyWorkflow({
          endpoint: endpointSnapshot, workflow: selectedWorkflow,
          bindings: selectedBindings, model: selected, config: snapshot,
          seed, jobId, signal: controller.signal,
          onState: text => setProgress((index + 1) + '/' + snapshot.batchCount + ' · ' + text),
        });
        if (generated.jobId !== jobId) throw new Error('생성 결과의 작업 식별자가 일치하지 않아.');
        const items: Output[] = [];
        for (let outputIndex = 0; outputIndex < generated.images.length; outputIndex++) {
          const generatedImage = generated.images[outputIndex];
          const blob = await encodeOutput(generatedImage.blob, snapshot.outputFormat, snapshot.quality);
          const filename = 'localvert-' + selected.id + '-' + jobId.slice(0, 8) +
            '-' + (outputIndex + 1) + '.' + (snapshot.outputFormat === 'jpeg' ? 'jpg' : snapshot.outputFormat);
          const metadata = snapshot.includeMetadata ? registerUrl(new Blob([JSON.stringify({
            jobId, promptId: generated.promptId, modelId: selected.id,
            checkpoint: availableResources, seed, settings: snapshot,
          }, null, 2)], { type: 'application/json' })) : undefined;
          items.push({
            id: jobId + '-' + outputIndex,
            filename, url: registerUrl(blob),
            promptId: generated.promptId, seed,
            metadataUrl: metadata,
          });
        }
        setOutput(previous => [...items, ...previous]);
      }
      setProgress('생성 완료');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '이미지 생성에 실패했어.';
      setError(message === 'Failed to fetch'
        ? 'ComfyUI에 연결하지 못했어. 실행 상태와 --enable-cors-header 설정을 확인해.'
        : message);
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
            {modelsInLevel.map(item => <option key={item.id} value={item.id}>{item.name} · {item.use}</option>)}
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
              ['1:1', 1024, 1024], ['4:3', 1152, 864],
              ['16:9', 1344, 768], ['9:16', 768, 1344],
            ] as const).map(([label, w, h]) => (
              <button key={label} type="button" aria-pressed={config.width === w && config.height === h}
                onClick={() => setRatio(w, h)}>{label}</button>
            ))}
          </div>
          <div className="gen-dimensions">
            <label>가로(px)<input type="number" min={256} max={2048} step={64} className="gen-input"
              value={config.width} onChange={event => setValue('width', Number(event.target.value))} /></label>
            <label>세로(px)<input type="number" min={256} max={2048} step={64} className="gen-input"
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
              {model.cfg !== null && fieldExists(workflow || {}, bindings.cfg) && (
                <label>Guidance Scale<input className="gen-input" type="number" step=".5" min={0} max={20}
                  value={config.cfg} onChange={event => setValue('cfg', Number(event.target.value))} /></label>
              )}
              {fieldExists(workflow || {}, bindings.sampler) && !model.sampler && (
                <label>Sampler<select className="gen-input" value={config.sampler}
                  onChange={event => setValue('sampler', event.target.value)}>
                    {['euler', 'euler_ancestral', 'dpmpp_2m', 'dpmpp_sde'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select></label>
              )}
              {fieldExists(workflow || {}, bindings.scheduler) && (
                <label>Scheduler<select className="gen-input" value={config.scheduler}
                  onChange={event => setValue('scheduler', event.target.value)}>
                    {['normal', 'karras', 'simple', 'sgm_uniform'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select></label>
              )}
              <label className="gen-check"><input type="checkbox" checked={config.randomSeed}
                onChange={event => setValue('randomSeed', event.target.checked)} /> Random Seed</label>
              {!config.randomSeed && (
                <label>Seed<input className="gen-input" type="number" min={0} max={2147483647}
                  value={config.seed} onChange={event => setValue('seed', Number(event.target.value))} /></label>
              )}
              <label>Batch Count<input className="gen-input" type="number" min={1} max={3}
                value={config.batchCount} onChange={event => setValue('batchCount', Number(event.target.value))} /></label>
              {fieldExists(workflow || {}, bindings.batch) && (
                <label>Batch Size<input className="gen-input" type="number" min={1} max={4}
                  value={config.batchSize} onChange={event => setValue('batchSize', Number(event.target.value))} /></label>
              )}
              {fieldExists(workflow || {}, bindings.loraStrength) && (
                <label>LoRA Strength<input type="range" min={0} max={2} step={0.05}
                  value={config.loraStrength} onChange={event => setValue('loraStrength', Number(event.target.value))} />
                  <output>{config.loraStrength.toFixed(2)}</output></label>
              )}
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
              onClick={() => controllerRef.current?.abort()}>결과 받기 중단</button>}
          </div>
          {!workflow && <p className="gen-help">이미지를 생성하려면 아래에서 ComfyUI 워크플로를 연결해.</p>}
          {workflow && !modelMatched && <p className="gen-help" role="status">
            선택 모델에 해당하는 체크포인트 파일명을 워크플로에서 찾지 못했어. 해당 모델의 API 워크플로를 가져와.
          </p>}
          {workflow && !promptBound && <p className="gen-help">프롬프트 입력 노드를 연결해야 해.</p>}
          {workflow && requiredFields.length > 0 && <p className="gen-help">
            워크플로 입력 연결에서 {requiredFields.join(' · ')} 필드를 지정해야 해.
          </p>}
          {busy || progress ? <p className="gen-progress" role="status">{progress}</p> : null}
          {error && <div className="gen-error" role="alert">{error}</div>}
        </section>

        <section className="gen-card" aria-labelledby="gen-connection">
          <div className="gen-heading-row">
            <h2 id="gen-connection">로컬 생성 엔진</h2>
            <span className={'gen-state gen-state-' + connection}>
              {connection === 'ready' ? '연결됨' : connection === 'checking' ? '확인 중' :
                connection === 'error' ? '연결 실패' : '연결 전'}
            </span>
          </div>
          <p className="gen-muted gen-description">
            이 페이지는 모델을 서버에 설치하지 않아. 로컬 ComfyUI에서 모델이 설치된 API 워크플로를 연결하면 실제 이미지를 생성할 수 있어.
          </p>
          <div className="gen-connection-controls">
            <label htmlFor="gen-endpoint">ComfyUI 주소</label>
            <input id="gen-endpoint" className="gen-input" value={endpoint}
              spellCheck={false} onChange={event => {
                setEndpoint(event.target.value); setConnection('idle');
              }} />
            <button type="button" className="lv-button lv-button-subtle"
              disabled={connection === 'checking'} onClick={checkConnection}>연결 확인</button>
          </div>
          <p className="gen-help">브라우저 연결을 위해 ComfyUI 서버를 CORS 허용 옵션으로 실행해야 할 수 있어.</p>
          <input type="file" ref={fileRef} accept=".json,application/json" className="lv-visually-hidden"
            aria-label="ComfyUI API 워크플로 JSON 업로드" onChange={loadWorkflow} />
          <div className="gen-workflow-row">
            <button type="button" className="lv-button lv-button-subtle"
              onClick={() => fileRef.current?.click()}>API 워크플로 가져오기</button>
            {workflowName && <span className="gen-muted">{workflowName}</span>}
          </div>
          {workflow && (
            <>
              <p className={modelMatched ? 'gen-workflow-ok' : 'gen-help'}>
                {modelMatched ? '체크포인트 파일명 일치: ' + availableResources.join(', ') :
                  '현재 선택 모델에 일치하는 체크포인트가 없어.'}
              </p>
              <details className="gen-details" open={showMapping}
                onToggle={event => setShowMapping((event.currentTarget as HTMLDetailsElement).open)}>
                <summary>워크플로 입력 연결</summary>
                <div className="gen-options-grid">
                  {BINDING_LABELS.filter(item => item.key !== 'negative' || model.negative).map(item => (
                    <label key={item.key}>{item.label}
                      <select className="gen-input"
                        value={bindings[item.key] ? JSON.stringify(bindings[item.key]) : ''}
                        onChange={event => changeBinding(item.key, event.target.value)}>
                        <option value="">연결 없음</option>
                        {fields.filter(field =>
                          (['prompt', 'negative', 'sampler', 'scheduler', 'lora'].includes(item.key)
                            ? typeof field.value === 'string'
                            : typeof field.value === 'number')).map(field => (
                          <option key={field.ref.nodeId + ':' + field.ref.field}
                            value={JSON.stringify(field.ref)}>{field.label}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </details>
            </>
          )}
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
