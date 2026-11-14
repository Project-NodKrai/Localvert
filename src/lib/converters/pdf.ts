import * as XLSX from 'xlsx';

const encoder = new TextEncoder();
type JpegPage = { bytes: Uint8Array; width: number; height: number };

/**
 * Embed rendered JPEG pages in a real, self-contained PDF 1.4 file.
 * Text is rendered on canvas first, so non-Latin glyphs render correctly,
 * though resulting PDF text is rasterized rather than searchable/selectable.
 */
export function buildPdfFromJpegPages(pages: JpegPage[]): Blob {
  if (!pages.length) throw new Error('PDF에 넣을 페이지가 없어.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  const offsets: number[] = [0];
  const add = (part: string | Uint8Array) => {
    const data = typeof part === 'string' ? encoder.encode(part) : part;
    chunks.push(data);
    length += data.byteLength;
  };
  const beginObject = (id: number) => {
    offsets[id] = length;
    add(String(id) + ' 0 obj\n');
  };
  const endObject = () => add('\nendobj\n');

  add('%PDF-1.4\n%\xC2\xA5\xC2\xB1\xC3\xAB\n');
  beginObject(1);
  add('<< /Type /Catalog /Pages 2 0 R >>');
  endObject();
  beginObject(2);
  add('<< /Type /Pages /Count ' + pages.length + ' /Kids [' +
    pages.map((_, i) => (3 + i * 3) + ' 0 R').join(' ') + '] >>');
  endObject();

  pages.forEach((page, i) => {
    if (page.bytes.byteLength < 4 || page.bytes[0] !== 0xff || page.bytes[1] !== 0xd8) {
      throw new Error('PDF 페이지 이미지가 JPEG 형식이 아니야.');
    }
    const pageId = 3 + i * 3;
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    beginObject(pageId);
    add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ' +
      '/Resources << /XObject << /Im0 ' + imageId + ' 0 R >> >> /Contents ' +
      contentId + ' 0 R >>');
    endObject();

    const stream = 'q\n595 0 0 842 0 0 cm\n/Im0 Do\nQ\n';
    beginObject(contentId);
    add('<< /Length ' + encoder.encode(stream).length + ' >>\nstream\n' + stream + 'endstream');
    endObject();

    beginObject(imageId);
    add('<< /Type /XObject /Subtype /Image /Width ' + page.width +
      ' /Height ' + page.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 ' +
      '/Filter /DCTDecode /Length ' + page.bytes.length + ' >>\nstream\n');
    add(page.bytes);
    add('\nendstream');
    endObject();
  });

  const xref = length;
  add('xref\n0 ' + offsets.length + '\n0000000000 65535 f \n');
  for (let i = 1; i < offsets.length; i++) {
    add(String(offsets[i]).padStart(10, '0') + ' 00000 n \n');
  }
  add('trailer\n<< /Size ' + offsets.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
  return new Blob(chunks, { type: 'application/pdf' });
}

async function jpegFromCanvas(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const image = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!image || image.type !== 'image/jpeg') {
    throw new Error('PDF 페이지를 위한 JPEG 인코더를 사용할 수 없어.');
  }
  return new Uint8Array(await image.arrayBuffer());
}

export async function renderSpreadsheetPdf(workbook: XLSX.WorkBook): Promise<Blob> {
  if (typeof document === 'undefined') throw new Error('PDF 페이지를 렌더링하려면 브라우저 Canvas가 필요해.');
  const pages: JpegPage[] = [];
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error('PDF로 변환할 데이터 시트가 없어.');

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
  const perPage = 43;
  const allRows = rows.length ? rows : [['']];
  const totalPages = Math.ceil(allRows.length / perPage);
  if (totalPages > 500) throw new Error('500페이지를 초과하는 표는 브라우저에서 변환하기 어려워. 파일을 나눠 줘.');

  for (let i = 0; i < totalPages; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = 1190;
    canvas.height = 1684;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('PDF Canvas 생성에 실패했어.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#222';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(sheetName || 'Table', 48, 62);
    ctx.font = '20px sans-serif';
    const visible = allRows.slice(i * perPage, (i + 1) * perPage);
    const cols = Math.max(1, Math.min(8, ...visible.map(row => row.length)));
    const width = (canvas.width - 96) / cols;
    visible.forEach((row, rowIndex) => {
      const top = 100 + rowIndex * 35;
      if (rowIndex % 2 === 0) {
        ctx.fillStyle = '#f5f5f5';
        ctx.fillRect(44, top - 23, canvas.width - 88, 33);
      }
      ctx.fillStyle = '#222';
      for (let col = 0; col < cols; col++) {
        const value = row[col] == null ? '' : String(row[col]);
        let short = value.replace(/\r?\n/g, ' ');
        while (short.length > 2 && ctx.measureText(short).width > width - 14) {
          short = short.slice(0, -2) + '…';
        }
        ctx.fillText(short, 52 + col * width, top, width - 12);
      }
    });
    ctx.font = '16px sans-serif';
    ctx.fillText('Page ' + (i + 1) + ' / ' + totalPages, 48, canvas.height - 32);
    pages.push({ bytes: await jpegFromCanvas(canvas), width: canvas.width, height: canvas.height });
  }
  return buildPdfFromJpegPages(pages);
}
