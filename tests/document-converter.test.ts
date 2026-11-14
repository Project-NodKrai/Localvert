import test from 'node:test';
import assert from 'node:assert/strict';
import { File as NodeFile } from 'node:buffer';
import * as XLSX from 'xlsx';
import { convertDocument } from '../src/lib/converters/document';

function input(name: string, content: string, type: string): File {
  return new NodeFile([content], name, { type }) as unknown as File;
}
test('CSV -> XLSX writes a readable workbook', async () => {
  const result = await convertDocument(input('data.csv', 'name,count\napple,3\n', 'text/csv'), 'xlsx');
  const wb = XLSX.read(await result.blob.arrayBuffer(), { type: 'array' });
  assert.equal(wb.Sheets[wb.SheetNames[0]].A2.v, 'apple');
});
test('JSON -> CSV parses JSON records', async () => {
  const result = await convertDocument(input('data.json', '[{"name":"flower","count":5}]', 'application/json'), 'csv');
  assert.match(await result.blob.text(), /flower,5/);
});
test('CSV -> JSON uses first row as headers', async () => {
  const result = await convertDocument(input('data.csv', 'name,year\nrose,2026\n', 'text/csv'), 'json');
  const rows = JSON.parse(await result.blob.text());
  assert.equal(rows[0].name, 'rose');
});
test('TXT -> XLSX preserves lines', async () => {
  const result = await convertDocument(input('notes.txt', 'first line\nsecond line', 'text/plain'), 'xlsx');
  const wb = XLSX.read(await result.blob.arrayBuffer(), { type: 'array' });
  assert.equal(wb.Sheets.Data.A1.v, 'first line');
  assert.equal(wb.Sheets.Data.A2.v, 'second line');
});
test('CSV -> RTF writes a genuine RTF header', async () => {
  const result = await convertDocument(input('report.csv', 'a,b\n1,2', 'text/csv'), 'rtf');
  assert.match(await result.blob.text(), /^\{\\rtf1/);
});
test('same-format conversion returns original file unchanged', async () => {
  const original = input('table.csv', 'name\nflower', 'text/csv');
  const result = await convertDocument(original, 'csv');
  assert.equal(result.blob, original);
});
test('PDF/DOCX reject unsupported conversions instead of forging output', async () => {
  await assert.rejects(convertDocument(input('sample.pdf', '%PDF-1.4', 'application/pdf'), 'xlsx'), /PDF.*별도/);
  await assert.rejects(convertDocument(input('sample.csv', 'a,b\n1,2', 'text/csv'), 'docx'), /DOCX.*지원되지/);
});
test('invalid JSON fails with a descriptive error', async () => {
  await assert.rejects(convertDocument(input('broken.json', '{invalid', 'application/json'), 'xlsx'), /JSON 파일/);
});
