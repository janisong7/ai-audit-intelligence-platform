import * as XLSX from 'xlsx';
import type { RawTicket } from './auditEngine';

export const REQUIRED_COLUMNS = ['Ticket ID', 'Ticket Type', 'Title', 'Description', 'Created Date', 'Resolution Date', 'Approval Status', 'Resolution Quality'] as const;
export type ImportResult = { tickets: RawTicket[]; error?: string };

const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
const aliases: Record<string, string[]> = {
  'Ticket ID': ['ticketid'], 'Ticket Type': ['tickettype'], Priority: ['priority'], Title: ['title'], Description: ['description'],
  'Created Date': ['createddate', 'created', 'openeddate'], 'Resolution Date': ['resolutiondate', 'resolveddate', 'resolved', 'closeddate'],
  'SLA Status': ['slastatus', 'sla', 'slahours'], 'Approval Status': ['approvalstatus', 'approval'],
  'Resolution Notes': ['resolutionnotes', 'notes', 'resolutiondetail'], 'Resolution Quality': ['resolutionquality', 'quality'],
};
const validTypes = new Set(['incident', 'service request', 'change request']);
const asDate = (value: unknown) => {
  if (value instanceof Date) return value.toISOString();
  const text = String(value ?? '').trim(); return text && !Number.isNaN(Date.parse(text)) ? new Date(text).toISOString() : '';
};

export async function parseTicketFile(file: File): Promise<ImportResult> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!['csv', 'xlsx', 'xls'].includes(ext ?? '')) return { tickets: [], error: 'Import failed: Unsupported file type. Select a CSV, XLSX, or XLS file.' };
  try {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true }); const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return { tickets: [], error: 'Import failed: The selected file does not contain a readable worksheet.' };
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' }); const headers = matrix[0] ?? [];
    if (!headers.length) return { tickets: [], error: 'Import failed: The selected file is empty.' };
    const lookup = new Map(headers.map((header, index) => [normalize(header), index]));
    const column = (name: string) => aliases[name].map(alias => lookup.get(alias)).find((index): index is number => index !== undefined);
    const missing = REQUIRED_COLUMNS.find(name => column(name) === undefined);
    if (missing) return { tickets: [], error: `Import failed: Required field missing — ${missing}.` };
    const rows = matrix.slice(1).filter(row => row.some(cell => String(cell ?? '').trim()));
    if (!rows.length) return { tickets: [], error: 'Import failed: No ticket records found.' };
    const read = (row: unknown[], name: string) => { const index = column(name); return index === undefined ? '' : String(row[index] ?? '').trim(); };
    const tickets = rows.map((row, index) => {
      const ticketId = read(row, 'Ticket ID'); const ticketType = read(row, 'Ticket Type'); const title = read(row, 'Title'); const description = read(row, 'Description');
      const createdDate = asDate(row[column('Created Date')!]); const resolutionDate = asDate(row[column('Resolution Date')!]); const approvalStatus = read(row, 'Approval Status'); const resolutionQuality = read(row, 'Resolution Quality');
      const required = [['Ticket ID', ticketId], ['Ticket Type', ticketType], ['Title', title], ['Description', description], ['Created Date', createdDate], ['Resolution Date', resolutionDate], ['Approval Status', approvalStatus], ['Resolution Quality', resolutionQuality]] as const;
      const empty = required.find(([, value]) => !value); if (empty) throw new Error(`Import failed: Malformed row ${index + 2} — ${empty[0]} is empty.`);
      if (!validTypes.has(ticketType.toLowerCase())) throw new Error(`Import failed: Invalid row ${index + 2} — Ticket Type must be Incident, Service Request, or Change Request.`);
      return { ticketId, ticketType, priority: read(row, 'Priority') || 'Unspecified', title, description, createdDate, resolutionDate, slaStatus: read(row, 'SLA Status') || 'Not provided', approvalStatus, resolutionNotes: read(row, 'Resolution Notes') || 'Not provided', resolutionQuality };
    });
    return { tickets };
  } catch (error) { return { tickets: [], error: error instanceof Error && error.message.startsWith('Import failed:') ? error.message : 'Import failed: The file could not be parsed. Check the format and try again.' }; }
}
