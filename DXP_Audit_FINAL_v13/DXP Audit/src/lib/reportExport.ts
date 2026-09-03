import type { AuditAssessment, AuditDecision, AuditTrailEntry, RawTicket } from '../types/audit';

export type ReportExportInput = { tickets: RawTicket[]; assessments: AuditAssessment[]; decisions: Record<string, AuditDecision>; trail: AuditTrailEntry[]; reviewer?: string };

const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;

export function buildAuditReportCsv({ tickets, assessments, decisions, trail, reviewer }: ReportExportInput) {
  const assessmentByTicket = new Map(assessments.map(assessment => [assessment.ticketId, assessment]));
  const columns = ['Ticket ID', 'Ticket Type', 'Priority', 'Title', 'Created Date', 'Resolution Date', 'SLA Status', 'Approval Status', 'Resolution Quality', 'Resolution Hours', 'Compliance Score', 'Risk Level', 'Findings', 'Recommendation', 'Anomaly Detected', 'Audit Status', 'Final Decision', 'Reviewer', 'Decision Date', 'Override Rationale'];
  const rows = tickets.map(ticket => {
    const assessment = assessmentByTicket.get(ticket.ticketId); const decision = decisions[ticket.ticketId]; const review = trail.find(entry => entry.ticketId === ticket.ticketId && entry.event === 'Auditor review completed');
    return [ticket.ticketId, ticket.ticketType, ticket.priority, ticket.title, ticket.createdDate, ticket.resolutionDate, ticket.slaStatus, ticket.approvalStatus, ticket.resolutionQuality, assessment?.resolutionHours ?? '', assessment?.complianceScore ?? '', assessment?.riskLevel ?? '', assessment?.findings.join(' | ') ?? '', assessment?.recommendations.join(' | ') ?? '', assessment?.anomalyDetected ? 'Yes' : 'No', decision?.status ?? 'Pending Review', decision?.kind ?? review?.decision ?? '', decision?.kind ? reviewer ?? '' : '', decision?.decisionDate ?? review?.occurredAt ?? '', decision?.rationale ?? review?.rationale ?? ''];
  });
  return [columns, ...rows].map(row => row.map(escape).join(',')).join('\r\n');
}

export function downloadAuditReport(input: ReportExportInput) {
  const blob = new Blob([buildAuditReportCsv(input)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `AI_Audit_Report_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
}
