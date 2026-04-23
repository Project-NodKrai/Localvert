import * as XLSX from 'xlsx';

export async function convertDocument(file: File, targetFormat: string): Promise<{ blob: Blob; ext: string }> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });

  if (targetFormat === 'csv') {
    const csvStr = XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]]);
    return {
      blob: new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvStr], { type: 'text/csv;charset=utf-8;' }),
      ext: 'csv',
    };
  } else if (targetFormat === 'json') {
    const jsonStr = JSON.stringify(XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]));
    return { blob: new Blob([jsonStr], { type: 'application/json' }), ext: 'json' };
  } else {
    const formatMap: Record<string, { type: string; bookType: XLSX.BookType }> = {
      'xlsx': { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bookType: 'xlsx' },
      'ods': { type: 'application/vnd.oasis.opendocument.spreadsheet', bookType: 'ods' },
      'html': { type: 'text/html', bookType: 'html' },
      'txt': { type: 'text/plain', bookType: 'txt' },
      'rtf': { type: 'application/rtf', bookType: 'rtf' },
    };

    const target = formatMap[targetFormat];
    if (target) {
      const buf = XLSX.write(workbook, { type: 'array', bookType: target.bookType });
      return {
        blob: new Blob([buf], { type: target.type }),
        ext: targetFormat,
      };
    }
  }
  throw new Error(`Unsupported document format: ${targetFormat}`);
}
