# LocalVert ONNX model asset provenance

The `.onnx` files here are generated during `npm run dev` and `npm run build`; they are not checked into Git. They are served as static same-origin files so browsers can load them without requiring CORS from Qualcomm's asset server.

- QuickSRNet Small 3×: Qualcomm AI Hub official universal float ONNX export, release v0.63.0, original model license BSD-3-Clause
- QuickSRNet Medium 3×: Qualcomm AI Hub official universal float ONNX export, release v0.63.0, original model license BSD-3-Clause
- Real-ESRGAN General x4v3: source-derived ONNX export by BrowserSnip at commit `8e7094416ad91ec7477e968d348cd78742e20dc6`, based on original xinntao Real-ESRGAN weights (BSD-3-Clause)
- Real-ESRGAN AnimeVideo v3: same source and license attribution
- Real-ESRGAN Anime 6B: same source and license attribution

Upstream sources:
- https://aihub.qualcomm.com/models/quicksrnetsmall
- https://github.com/qualcomm/ai-hub-models
- https://github.com/xinntao/Real-ESRGAN
- https://github.com/ningtoba/Browsersnip-Upscale

The original weights and source models must retain required BSD attribution in any downstream redistribution.
