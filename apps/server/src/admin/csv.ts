/**
 * CSV writer with spreadsheet formula-injection protection (OWASP): string cells starting with
 * = + - @ TAB or CR are prefixed with a single quote; cells are quoted when needed. UTF-8 BOM + CRLF.
 */
export type CsvValue = string | number | boolean | null | undefined | Date;

export function csvCell(v: CsvValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",;\r\n\t]/.test(s) || s !== s.trim()) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: CsvValue[][]): string {
  const lines = [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))];
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}
