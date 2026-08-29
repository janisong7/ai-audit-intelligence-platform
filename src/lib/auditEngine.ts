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

export type GovernanceRules = {
  slaPenalty: number;
  approvalPenalty: number;
  documentationPenalty: number;
  poorQualityPenalty: number;
  fairQualityPenalty: number;
  documentationMinLength: number;
  lowThreshold: number;
  mediumThreshold: number;
  highThreshold: number;
};
export const defaultGovernanceRules: GovernanceRules = {
  slaPenalty: 15,
  approvalPenalty: 20,
  documentationPenalty: 15,
  poorQualityPenalty: 10,
  fairQualityPenalty: 5,
  documentationMinLength: 20,
  lowThreshold: 90,
  mediumThreshold: 70,
  highThreshold: 40,
};

/**
 * Illustrative reviewer profiles used only by the Auditor Consistency Intelligence panel.
 * These are simulated stand-ins for "a stricter reviewer" and "a more lenient reviewer" —
 * NOT real historical auditor data. They exist to show, on the current dataset, which audit
 * criteria are objective (agreement stays near 100% regardless of reviewer temperament) versus
 * which criteria depend on qualitative judgement calls (agreement drops noticeably).
 */
export const reviewerProfiles: Record<'Strict Reviewer' | 'Lenient Reviewer', GovernanceRules> = {
  'Strict Reviewer': { slaPenalty: 15, approvalPenalty: 20, documentationPenalty: 15, poorQualityPenalty: 10, fairQualityPenalty: 5, documentationMinLength: 30, lowThreshold: 90, mediumThreshold: 70, highThreshold: 40 },
  'Lenient Reviewer': { slaPenalty: 15, approvalPenalty: 20, documentationPenalty: 15, poorQualityPenalty: 10, fairQualityPenalty: 5, documentationMinLength: 8, lowThreshold: 90, mediumThreshold: 70, highThreshold: 40 },
};

const complete = (value: string, minLength: number) => {
  const note = value.trim();
  if (!note) return false;
  if (/^(n\/?a|none|incomplete|unknown|no details|not provided|pending)\.?$/i.test(note)) return false;
  return note.length >= minLength;
};
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
  const documentationIncomplete = !complete(ticket.resolutionNotes, rules.documentationMinLength);
  const quality = ticket.resolutionQuality.trim().toLowerCase();

  if (breached) { score -= rules.slaPenalty; findings.push('SLA breach detected.'); recommendations.push('Review escalation and response procedures.'); }
  if (missingApproval) { score -= rules.approvalPenalty; findings.push('Required approval evidence missing.'); recommendations.push('Verify approval workflow compliance.'); }
  if (documentationIncomplete) { score -= rules.documentationPenalty; findings.push('Resolution documentation incomplete.'); recommendations.push('Improve resolution documentation requirements.'); }
  if (quality === 'poor') { score -= rules.poorQualityPenalty; findings.push('Resolution quality requires review.'); }
  if (quality === 'fair') { score -= rules.fairQualityPenalty; findings.push('Resolution quality could be improved.'); }
  const resolutionHours = hoursBetween(ticket.createdDate, ticket.resolutionDate);
  const anomalyDetected = resolutionHours !== null && standardDeviation > 0 && resolutionHours > averageHours + standardDeviation;
  if (anomalyDetected) findings.push('Prototype anomaly rule: resolution time is significantly higher than the imported dataset average.');
  if (findings.length > 1) recommendations.push('Prioritise this ticket for auditor review.');
  if (!findings.length) findings.push('No material control exceptions found.');
  score = Math.max(0, Math.min(100, score));
  const riskLevel: RiskLevel = score >= rules.lowThreshold ? 'Low' : score >= rules.mediumThreshold ? 'Medium' : score >= rules.highThreshold ? 'High' : 'Critical';
  return { complianceScore: score, riskLevel, findings, recommendations: [...new Set(recommendations)], confidence: Math.min(96, 68 + findings.length * 8), anomalyDetected, resolutionHours };
}

export type CriterionAgreement = { criterion: string; agreementPercent: number; agreeCount: number; disagreeCount: number; interpretation: 'Structured-field check — reads directly from ticket data' | 'Judgement-based — depends on reviewer interpretation' };
export type ConsistencyReport = { criteria: CriterionAgreement[]; riskLevelAgreementPercent: number; ticketCount: number; headline: string };

/**
 * Auditor Consistency Intelligence: runs the SAME ticket set through two illustrative reviewer
 * profiles (Strict / Lenient) and measures, per audit criterion, how often the two profiles reach
 * the same conclusion. Criteria read directly from ticket fields (SLA status, approval status,
 * resolution quality label) are expected to agree almost always. Documentation completeness is the
 * one criterion in this prototype that depends on a qualitative length/adequacy judgement — so it is
 * expected to show the most disagreement. This is a simulated comparison, not real historical auditor
 * data, and is presented as such in the UI.
 */
export function compareReviewerProfiles(tickets: RawTicket[], averageHours: number, standardDeviation: number, profileA: GovernanceRules, profileB: GovernanceRules): ConsistencyReport {
  const checks: { criterion: string; interpretation: CriterionAgreement['interpretation']; test: (t: RawTicket, rules: GovernanceRules) => boolean }[] = [
    { criterion: 'SLA Compliance', interpretation: 'Structured-field check — reads directly from ticket data', test: t => /breach/i.test(t.slaStatus) },
    { criterion: 'Approval Verification', interpretation: 'Structured-field check — reads directly from ticket data', test: t => /missing/i.test(t.approvalStatus) },
    { criterion: 'Resolution Quality', interpretation: 'Structured-field check — reads directly from ticket data', test: t => t.resolutionQuality.trim().toLowerCase() !== 'good' },
    { criterion: 'Documentation Completeness', interpretation: 'Judgement-based — depends on reviewer interpretation', test: (t, rules) => !complete(t.resolutionNotes, rules.documentationMinLength) },
  ];
  const criteria = checks.map(({ criterion, interpretation, test }) => {
    let agree = 0;
    for (const ticket of tickets) if (test(ticket, profileA) === test(ticket, profileB)) agree += 1;
    const disagree = tickets.length - agree;
    return { criterion, agreementPercent: tickets.length ? Math.round((agree / tickets.length) * 100) : 100, agreeCount: agree, disagreeCount: disagree, interpretation };
  });
  let riskAgree = 0;
  for (const ticket of tickets) {
    const a = assessTicket(ticket, averageHours, standardDeviation, profileA).riskLevel;
    const b = assessTicket(ticket, averageHours, standardDeviation, profileB).riskLevel;
    if (a === b) riskAgree += 1;
  }
  const riskLevelAgreementPercent = tickets.length ? Math.round((riskAgree / tickets.length) * 100) : 100;
  const lowest = criteria.reduce((min, c) => c.agreementPercent < min.agreementPercent ? c : min, criteria[0]);
  const headline = tickets.length ? `${lowest.criterion} is the highest-disagreement audit criterion (${lowest.agreementPercent}% agreement between the two reviewer profiles). Objective criteria that read directly from ticket data stay close to full agreement — the gap concentrates in criteria that rely on qualitative judgement, suggesting the underlying guideline needs clearer wording rather than a stricter AI rule.` : 'Import a dataset to run the consistency comparison.';
  return { criteria, riskLevelAgreementPercent, ticketCount: tickets.length, headline };
}
