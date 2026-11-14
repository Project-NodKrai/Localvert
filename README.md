# Localvert

## HEIC / HEIF → PNG image preservation

The image converter returns the PNG blob directly after HEIC/HEIF decoding.
It does **not** apply the generic converter's 4096-pixel limit or 10 MB
compression target to this PNG output. Existing PNG files selected for PNG
output also pass through without re-encoding.

**This is not an archival, metadata-lossless HEIC conversion.** The current
`heic2any` decoder uses a canvas-based pipeline and does not preserve source
EXIF metadata. HDR data, bit depth, wide-gamut ICC profiles and color
appearance may change. Keep the original HEIC for color-critical or archival
uses. Other conversions still use the existing generic image compression
path and may be resized.

### Verification

Run `npm ci && npm run lint && npm test && npm run build`.
For a real HEIC file, convert it to PNG and inspect the actual output size,
bit depth and color profile. For example, on macOS:

```sh
sips -g pixelWidth -g pixelHeight -g bitsPerSample -g space -g profile original.HEIC converted.png
```

A matching pixel size does **not** imply identical color values or metadata.
