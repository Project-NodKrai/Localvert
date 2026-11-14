import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPdfFromJpegPages } from '../src/lib/converters/pdf';

test('PDF builder generates a real PDF with page, image stream and xref', async () => {
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xff, 0xd9]);
  const pdf = buildPdfFromJpegPages([{ bytes: jpg, width: 2, height: 2 }]);
  const text = await pdf.text();
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.match(text, /\/Type \/Page\b/);
  assert.match(text, /\/Filter \/DCTDecode/);
  assert.match(text, /xref/);
  assert.match(text, /startxref/);
  assert.ok(text.trimEnd().endsWith('%%EOF'));
});

test('PDF builder validates source JPEG bytes', () => {
  assert.throws(() => buildPdfFromJpegPages([]), /페이지/);
  assert.throws(() => buildPdfFromJpegPages([{ bytes: new Uint8Array([1, 2, 3, 4]), width: 1, height: 1 }]), /JPEG/);
});
