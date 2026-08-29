export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Critical';
export type AuditStatus = 'Pending Review' | 'Reviewed' | 'Escalated';
export type AuditDecisionKind = 'Confirmed' | 'Overridden';

/** Source-system attributes only; audit outcomes are intentionally separate. */
export type RawTicket = {
  ticketId: string;
  ticketType: string;
  priority: string;
  title: string;
  description: string;
  createdDate: string;
  resolutionDate: string;
  slaStatus: string;
  approvalStatus: string;
  resolutionNotes: string;
  resolutionQuality: string;
};

/** Calculated from RawTicket by the audit engine. */
export type AuditAssessment = {
  ticketId: string;
  complianceScore: number;
  riskLevel: RiskLevel;
  findings: string[];
  recommendations: string[];
  assessmentConfidence: number;
  anomalyDetected: boolean;
  resolutionHours: number | null;
  generatedAt: string;
};

/** The auditor's decision is not part of the assessment. */
export type AuditDecision = {
  ticketId: string;
  status: AuditStatus;
  kind?: AuditDecisionKind;
  decisionDate?: string;
  rationale?: string;
  overrideReason?: string;
};

export type AuditTrailEntry = {
  ticketId: string;
  event: 'AI assessment generated' | 'Auditor review completed' | 'Governance rule updated';
  occurredAt: string;
  decision?: AuditDecisionKind;
  rationale?: string;
  overrideReason?: string;
  recommendation?: string;
  confidence?: number;
  changedBy?: string;
};
