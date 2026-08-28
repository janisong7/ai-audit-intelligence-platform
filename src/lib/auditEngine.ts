import type { RawTicket, RiskLevel } from '../types/audit';

export type { RawTicket, RiskLevel } from '../types/audit';

export type AssessmentResult = {
  complianceScore: number;
  riskLevel: RiskLevel;
  findings: string[];
  recommendations: string[];
  confidence: number;
  anomalyDetected: boolean;
  resolutionHours: number | null;
};

export type GovernanceRules = { slaPenalty: number; approvalPenalty: number; documentationPenalty: number; mediumThreshold: number; highThreshold: number };
export const defaultGovernanceRules: GovernanceRules = { slaPenalty: 15, approvalPenalty: 20, documentationPenalty: 15, mediumThreshold: 70, highThreshold: 40 };

const complete = (value: string) => value.trim().length >= 20 && !/incomplete|n\/a|none/i.test(value);
const hoursBetween = (start: string, end: string) => {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Number.isFinite(ms) && ms >= 0 ? ms / 3_600_000 : null;
};

export function assessTicket(ticket: RawTicket, averageHours = 0, standardDeviation = 0, rules: GovernanceRules = defaultGovernanceRules): AssessmentResult {
  let score = 100;
  const findings: string[] = [];
  const recommendations: string[] = [];
  const breached = /breach/i.test(ticket.slaStatus);
  const missingApproval = /missing/i.test(ticket.approvalStatus);
  const documentationIncomplete = !complete(ticket.resolutionNotes);
  const quality = ticket.resolutionQuality.trim().toLowerCase();

  if (breached) { score -= rules.slaPenalty; findings.push('SLA breach detected.'); recommendations.push('Review escalation and response procedures.'); }
  if (missingApproval) { score -= rules.approvalPenalty; findings.push('Required approval evidence missing.'); recommendations.push('Verify approval workflow compliance.'); }
  if (documentationIncomplete) { score -= rules.documentationPenalty; findings.push('Resolution documentation incomplete.'); recommendations.push('Improve resolution documentation requirements.'); }
  if (quality === 'poor') { score -= 10; findings.push('Resolution quality requires review.'); }
  if (quality === 'fair') { score -= 5; findings.push('Resolution quality could be improved.'); }
  const resolutionHours = hoursBetween(ticket.createdDate, ticket.resolutionDate);
  const anomalyDetected = resolutionHours !== null && standardDeviation > 0 && resolutionHours > averageHours + standardDeviation;
  if (anomalyDetected) findings.push('Prototype anomaly rule: resolution time is significantly higher than the imported dataset average.');
  if (findings.length > 1) recommendations.push('Prioritise this ticket for auditor review.');
  if (!findings.length) findings.push('No material control exceptions found.');
  score = Math.max(0, Math.min(100, score));
  const riskLevel: RiskLevel = score >= 90 ? 'Low' : score >= rules.mediumThreshold ? 'Medium' : score >= rules.highThreshold ? 'High' : 'Critical';
  return { complianceScore: score, riskLevel, findings, recommendations: [...new Set(recommendations)], confidence: Math.min(96, 68 + findings.length * 8), anomalyDetected, resolutionHours };
}
