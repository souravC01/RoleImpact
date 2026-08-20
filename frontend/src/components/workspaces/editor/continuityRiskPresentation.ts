import type { DraftContinuityRisk, DraftContinuityRiskMember } from '../../../api/draftImpact'

export function riskRank(risk: DraftContinuityRisk) {
  return statusRank(worstScenarioStatus(risk))
}

export function predictedOutcome(risk: DraftContinuityRisk) {
  return outcomeLabel(worstScenarioStatus(risk))
}

export function outcomeTone(risk: DraftContinuityRisk) {
  return outcomeToneForStatus(worstScenarioStatus(risk))
}

export function coverageHeading(_risk: DraftContinuityRisk, member: DraftContinuityRiskMember) {
  return member.scenarioStatus === 'BLOCKED'
    ? 'This workflow would be blocked'
    : member.scenarioStatus === 'DEGRADED'
      ? 'This workflow would lose resilience'
      : 'This workflow remains operational'
}

export function coverageTone(member: DraftContinuityRiskMember) {
  return member.scenarioStatus === 'BLOCKED' ? 'critical' : member.scenarioStatus === 'DEGRADED' ? 'warning' : 'ready'
}

export function worstScenarioStatus(risk: DraftContinuityRisk) {
  return risk.members.reduce<'OPERATIONAL' | 'DEGRADED' | 'BLOCKED'>(
    (worst, member) => statusRank(member.scenarioStatus) < statusRank(worst) ? member.scenarioStatus : worst,
    'OPERATIONAL',
  )
}

export function outcomeLabel(status: DraftContinuityRiskMember['scenarioStatus']) {
  return status === 'BLOCKED' ? 'would block' : status === 'DEGRADED' ? 'would degrade' : 'coverage remains safe'
}

export function outcomeToneForStatus(status: DraftContinuityRiskMember['scenarioStatus']) {
  return status === 'BLOCKED' ? 'danger' : status === 'DEGRADED' ? 'warning' : 'safe'
}

function statusRank(status: DraftContinuityRiskMember['scenarioStatus']) {
  return status === 'BLOCKED' ? 0 : status === 'DEGRADED' ? 1 : 2
}
