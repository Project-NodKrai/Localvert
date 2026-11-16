# LocalVert browser-only image generation

LocalVert 이미지 생성기는 브라우저의 사용자 GPU(WebGPU)에서 실행하는 구조만 지원한다. 별도의 로컬 이미지 생성 서버, 실행 환경 선택기, API 워크플로 파일 입력 및 서버 주소 입력은 사용하지 않는다.

## 모델별 현재 상태 (2026-11-16)

| 모델 | 등급 | 브라우저 엔진 상태 |
|---|---|---|
| SANA-Sprint 0.6B | Instant | **Not ready** — 브라우저 전용 Sprint 0.6B 변환 가중치와 연산 그래프 미검증 |
| SANA-Sprint 1.6B | Instant | Not ready |
| Iris-3B Turbo | Instant | Not ready |
| Anima-Turbo | Medium | Not ready |
| FLUX.2 Klein 4B | Medium | 실험용 WebGPU ONNX Worker 연결됨, 실모델 실행 미검증 |
| Z-Image-Turbo | High | Not ready |
| Qwen-Image-2.1 Turbo | High | Not ready |

일곱 개 모델명과 세 단계 수준은 그대로 유지한다. 모델을 고를 수 있다는 것만으로 **실행 가능**하다는 뜻은 아니다. 미지원 모델의 생성 버튼은 비활성화한다.

### SANA-Sprint 0.6B

실제 SANA-Sprint 원본:
- https://huggingface.co/Efficient-Large-Model/Sana_Sprint_0.6B_1024px_diffusers
- 업스트림 Diffusers `SanaSprintPipeline` 구조.
- Gemma 2 2B IT 계열 텍스트 인코더와 DC-AE VAE, SANA-Sprint sCM 스케줄러를 필요로 한다.
- 일반 SANA-0.6B의 ONNX 그래프는 같은 모델이 아니므로 대체하지 않는다.
- 위 모델은 일반적인 PyTorch/BF16 가중치를 포함한다. WebGPU에서 즉시 실행할 수 있는 ONNX 그래프로 확인된 것은 아니다.

브라우저에서 실제로 0.6B Sprint를 지원하려면 ONNX/웹 GPU용 변환 및 검증, 텍스트 인코더·스케줄러·디코더 이식, 정확도 검사, 장치별 메모리 검증을 완료해야 한다. 그 전에는 생성 가능하다고 표시하지 않는다.

### FLUX.2 Klein 4B 실험 모드

현재 브라우저 전용 파이프라인은 다음으로 구성된다.

1. WebGPU 지원 및 shader-f16 확인.
2. Hugging Face에서 모델 데이터 다운로드 동의를 받은 뒤 자산 다운로드.
3. 텍스트 인코딩 → 4회 디노이징 → VAE 디코딩을 별도 Worker에서 수행.
4. 단계 종료 및 취소 시 Worker를 종료해 GPU 메모리 반환을 시도.
5. 결과를 개별 Blob URL로 식별 및 다운로드.

구현: `src/lib/imageGeneration/browser.ts`, `public/workers/flux2-stage.js`.

모델 변환 출처: https://huggingface.co/cgb/flux2-klein-4b-onnx-webgpu.

**실제 모델 가중치로 성공적인 이미지 생성은 아직 검증되지 않았다.** 테스트에서 Worker를 모의한다고 실모델이 동작한 것은 아니다.

## 검증

- `npm run lint` — TypeScript
- `npm test` — 카탈로그 및 브라우저 모델 라우팅, 이미지 생성 수학
- `npm run build` — 프로덕션 번들
- `node scripts/smoke-image-generation.mjs` — 브라우저 화면, GPU 환경 모의, 독립 작업 및 Blob 검증
- 실제 GPU 가중치 구동과 이미지 시각 검증 — 미실시

이미지 생성 서버를 호출하거나 이미지 생성용 프롬프트를 외부 API에 보내지 않도록 설계했다. 모델 데이터 및 실행 라이브러리는 외부 CDN에서 내려받는다.

## 추가 필수 작업

1. SANA-Sprint 0.6B의 **동일한 체크포인트**를 브라우저 지원 텐서 형식으로 변환하고 변환 출력을 검증한다.
2. Gemma 텍스트 인코딩, sCM 샘플링, DC-AE 디코딩을 실제 연결한다.
3. FLUX.2 Klein 및 SANA 각각 실제 프롬프트와 시드로 결과 이미지 생성 및 다운로드 확인.
4. 캐시·복구·GPU 메모리·취소·Safari 및 iOS 호환성 확인.

