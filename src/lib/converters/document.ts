import * as XLSX from 'xlsx';

const OUTPUT_FORMATS: Record<string, { type: string; bookType: XLSX.BookType }> = {
  xlsx: { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bookType: 'xlsx' },
  xls: { type: 'application/vnd.ms-excel', bookType: 'biff8' },
  ods: { type: 'application/vnd.oasis.opendocument.spreadsheet', bookType: 'ods' },
  html: { type: 'text/html;charset=utf-8', bookType: 'html' },
  txt: { type: 'text/plain;charset=utf-8', bookType: 'txt' },
};
const INPUT_FORMATS = new Set(['xlsx', 'xls', 'ods', 'csv', 'json', 'html', 'txt', 'rtf']);
const OUTPUT_EXTENSIONS = new Set([...Object.keys(OUTPUT_FORMATS), 'csv', 'json', 'rtf']);

function getExtension(file: File): string {
  const name = file.name.toLowerCase();
  if (name.includes('.')) return name.split('.').pop() || '';
  if (file.type === 'application/json') return 'json';
  if (file.type === 'text/csv') return 'csv';
  if (file.type === 'text/plain') return 'txt';
  return '';
}

function toCell(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return JSON.stringify(value);
}

function jsonWorkbook(value: unknown): XLSX.WorkBook {
  const objects: Record<string, unknown>[] = Array.isArray(value)
    ? value.map(item => item && typeof item === 'object' && !Array.isArray(item)
        ? item as Record<string, unknown> : { value: item })
    : [value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown> : { value }];
  const rows = objects.map(row => Object.fromEntries(Object.entries(row).map(([key, entry]) => [key, toCell(entry)])));
  const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ value: null }]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Data');
  return workbook;
}

// RTF is formatted text, not a workbook. This extracts basic text only.
function extractRtfText(rtf: string): string {
  return rtf
    .replace(/\\u(-?\d+)\??/g, (_, n: string) => String.fromCharCode((Number(n) + 65536) % 65536))
    .replace(/\\'([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\par\b|\\line\b/g, '\n')
    .replace(/\\tab\b/g, '\t')
    .replace(/\\[a-zA-Z]+-?\d* ?/g, '')
    .replace(/\\([{}\\])/g, '$1')
    .replace(/[{}]/g, '');
}

function textWorkbook(content: string): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  const lines = content.split(/\r\n|\r|\n/);
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(lines.map(line => [line])), 'Text');
  return workbook;
}

async function readWorkbook(file: File, extension: string): Promise<XLSX.WorkBook> {
  if (extension === 'json') {
    try { return jsonWorkbook(JSON.parse(await file.text())); }
    catch (error) {
      if (error instanceof SyntaxError) throw new Error('JSON 파일 형식이 올바르지 않습니다.');
      throw error;
    }
  }
  if (extension === 'txt') return textWorkbook(await file.text());
  if (extension === 'rtf') return textWorkbook(extractRtfText(await file.text()));

  try { return XLSX.read(await file.arrayBuffer(), { type: 'array', raw: true, cellDates: true }); }
  catch { throw new Error(extension.toUpperCase() + ' 파일을 표 데이터로 읽을 수 없습니다. 파일 형식을 확인해 주세요.'); }
}

function escapeRtf(text: string): string {
  return text.replace(/[\\{}]/g, '\\$&').replace(/[^\x20-\x7e]/g, ch => {
    const code = ch.charCodeAt(0);
    return '\\u' + (code > 32767 ? code - 65536 : code) + '?';
  });
}

function writeRtf(sheet: XLSX.WorkSheet): string {
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1, defval: '' });
  const body = rows.map(row => row.map(cell => escapeRtf(String(cell ?? ''))).join('\\tab ')).join('\\par\n');
  return '{\\rtf1\\ansi\\uc1\n' + body + '\\par\n}';
}

export async function convertDocument(file: File, targetFormat: string): Promise<{ blob: Blob; ext: string }> {
  const extension = getExtension(file);
  const target = targetFormat.toLowerCase();

  // PDF and DOCX layout documents cannot be processed by SheetJS.
  if (!INPUT_FORMATS.has(extension)) {
    throw new Error((extension ? extension.toUpperCase() : '알 수 없는 형식') + ' 입력은 표 데이터 변환기로 처리할 수 없습니다. PDF/DOCX는 별도 변환 엔진이 필요합니다.');
  }
  if (!OUTPUT_EXTENSIONS.has(target)) {
    throw new Error(target.toUpperCase() + ' 출력은 현재 문서 변환 엔진에서 지원되지 않습니다.');
  }
  if (extension === target) return { blob: file, ext: target };

  const workbook = await readWorkbook(file, extension);
  const firstName = workbook.SheetNames[0];
  if (!firstName || !workbook.Sheets[firstName]) throw new Error('변환할 시트가 없습니다.');
  const sheet = workbook.Sheets[firstName];

  if (target === 'csv') {
    const csv = XLSX.utils.sheet_to_csv(sheet);
    return { blob: new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), csv], { type: 'text/csv;charset=utf-8' }), ext: 'csv' };
  }
  if (target === 'json') {
    return { blob: new Blob([JSON.stringify(XLSX.utils.sheet_to_json(sheet, { defval: null }))], { type: 'application/json' }), ext: 'json' };
  }
  if (target === 'rtf') {
    return { blob: new Blob([writeRtf(sheet)], { type: 'application/rtf' }), ext: 'rtf' };
  }
  const format = OUTPUT_FORMATS[target];
  const encoded = XLSX.write(workbook, { type: 'array', bookType: format.bookType });
  return { blob: new Blob([encoded], { type: format.type }), ext: target };
}
