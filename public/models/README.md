# LocalVert ONNX model asset provenance

The `.onnx` files here are generated during `npm run dev` and `npm run build`; they are not checked into Git. They are served as static same-origin files so browsers can load them without requiring CORS from Qualcomm's asset server.

- QuickSRNet Small 4×: Qualcomm AI Hub official universal float ONNX export, release v0.63.0, original model license BSD-3-Clause
- QuickSRNet Medium 4×: Qualcomm AI Hub official universal float ONNX export, release v0.63.0, original model license BSD-3-Clause
- Real-ESRGAN General x4v3: source-derived ONNX export by BrowserSnip at commit `8e7094416ad91ec7477e968d348cd78742e20dc6`, based on original xinntao Real-ESRGAN weights (BSD-3-Clause)
- Real-ESRGAN AnimeVideo v3: same source and license attribution
- Real-ESRGAN Anime 6B: same source and license attribution

Upstream sources:
- https://aihub.qualcomm.com/models/quicksrnetsmall
- https://github.com/qualcomm/ai-hub-models
- https://github.com/xinntao/Real-ESRGAN
- https://github.com/ningtoba/Browsersnip-Upscale

The original weights and source models must retain required BSD attribution in any downstream redistribution.

## Additional ONNX models
- Real-ESRGAN x4plus (4×), Hugging Face SceneWorks ONNX export, original BSD-3-Clause, Xintao Wang
- Real-ESRGAN Anime 4B32F (4×), Hugging Face deepghs ONNX export, original BSD-3-Clause
- Swin2SR Lightweight (2×), Classical (4×), RealWorld (4×), Compressed (4×), Xenova ONNX exports; original Swin2SR source Apache-2.0 (Marcos V. Conde et al.)
- Real-CUGAN HFA2k (2×), nesaorg ONNX conversion of Philip Hofmann's weights (CC BY 4.0); attribution required

Original weights and redistributions must retain the relevant attribution and license terms.

## Qualcomm 4× and RealPLKSR
- XLSR 4× and QuickSRNet Large 4×: Qualcomm AI Hub official float ONNX exports, v0.63.0 (BSD-3-Clause)
- RealPLKSR 2× and 4×: official darktable-org static ONNX conversion of Dongheon Lee et al. weights; model weights MIT. Original PLKSR source: https://github.com/dslisleedh/PLKSR
- The x2 input is fixed at 512×512, and x4 at 256×256; LocalVert uses padded tiles.

## SPAN 2× browser models

- NomosUni SPAN x2 (photo/video): Philip Hofmann, ONNX export by kortique / Photoview-AI, CC BY 4.0. Source: https://huggingface.co/kortique/photoview-ai-models (permissive/nomosuni_span_x2.onnx)
- ModernSpanimation V1 SPAN x2 (animation): TNTwise, ONNX export by kortique / Photoview-AI, MIT. Source: https://huggingface.co/kortique/photoview-ai-models (permissive/2x_ModernSpanimationV1.onnx)

Keep their corresponding original attribution and license notices when distributing these assets.
