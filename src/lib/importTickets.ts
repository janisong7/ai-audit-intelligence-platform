import * as XLSX from 'xlsx';
import type { RawTicket } from './auditEngine';

export const REQUIRED_COLUMNS = [
  'Ticket ID', 'Ticket Type', 'Priority', 'Title', 'Description', 'Created Date',
  'Resolution Date', 'SLA Status', 'Approval Status', 'Resolution Notes', 'Resolution Quality',
] as const;

export type ImportResult = { tickets: RawTicket[]; error?: string };

const value = (row: Record<string, unknown>, column: string) => String(row[column] ?? '').trim();

export async function parseTicketFile(file: File): Promise<ImportResult> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!['csv', 'xlsx', 'xls'].includes(ext ?? '')) return { tickets: [], error: 'Import failed: Unsupported file type. Select a CSV, XLSX, or XLS file.' };
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return { tickets: [], error: 'Import failed: The selected file does not contain a readable worksheet.' };
    const headerRows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, blankrows: false });
    const columns = (headerRows[0] ?? []).map(column => String(column).trim());
    if (!columns.length) return { tickets: [], error: 'Import failed: The selected file is empty.' };
    const missing = REQUIRED_COLUMNS.find(column => !columns.includes(column));
    if (missing) return { tickets: [], error: `Import failed: Required field missing — ${missing}.` };
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
    if (!rows.length) return { tickets: [], error: 'Import failed: No ticket records found.' };
    const tickets = rows.map((row, index) => {
      const missingValue = REQUIRED_COLUMNS.find(column => !value(row, column));
      if (missingValue) throw new Error(`Import failed: Malformed row ${index + 2} — ${missingValue} is empty.`);
      const createdDate = value(row, 'Created Date'); const resolutionDate = value(row, 'Resolution Date');
      if (Number.isNaN(Date.parse(createdDate)) || Number.isNaN(Date.parse(resolutionDate))) throw new Error(`Import failed: Malformed row ${index + 2} — dates must be valid.`);
      return { ticketId: value(row, 'Ticket ID'), ticketType: value(row, 'Ticket Type'), priority: value(row, 'Priority'), title: value(row, 'Title'), description: value(row, 'Description'), createdDate, resolutionDate, slaStatus: value(row, 'SLA Status'), approvalStatus: value(row, 'Approval Status'), resolutionNotes: value(row, 'Resolution Notes'), resolutionQuality: value(row, 'Resolution Quality') };
    });
    if (!tickets.length) return { tickets: [], error: 'Import failed: No valid ticket records found.' };
    return { tickets };
  } catch (error) {
    return { tickets: [], error: error instanceof Error && error.message.startsWith('Import failed:') ? error.message : 'Import failed: The file could not be parsed. Check the format and try again.' };
  }
}
