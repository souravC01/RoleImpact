import { describe, expect, it } from 'vitest'
import type { DraftContinuityRisk } from '../../../api/draftImpact'
import { coverageHeading, coverageTone, outcomeTone, predictedOutcome, riskRank } from './continuityRiskPresentation'

const serverBlockedRisk: DraftContinuityRisk = {
  key: 'workflow-release:step-approve:role-release',
  workflowId: 'workflow-release',
  workflowName: 'Release workflow',
  criticality: 'HIGH',
  requirementId: 'step-approve',
  requirementName: 'Approve release',
  minimumActors: 1,
  resilienceTarget: 2,
  roleId: 'role-release',
  roleName: 'Release Manager',
  // These deliberately look safe by catalog demographics; the engine verdict wins.
  eligibleMembers: [
    { id: 'member-a', name: 'Alex Holder' },
    { id: 'member-b', name: 'Blair Backup' },
  ],
  members: [
    {
      id: 'member-a',
      name: 'Alex Holder',
      eligible: true,
      losesCoverage: false,
      remainingEligibleActorCount: 2,
      scenarioStatus: 'BLOCKED',
    },
  ],
}

describe('continuity risk presentation', () => {
  it('ranks and labels a supplied BLOCKED verdict without recalculating catalog coverage', () => {
    const member = serverBlockedRisk.members[0]

    expect(riskRank(serverBlockedRisk)).toBe(0)
    expect(predictedOutcome(serverBlockedRisk)).toBe('would block')
    expect(outcomeTone(serverBlockedRisk)).toBe('danger')
    expect(coverageHeading(serverBlockedRisk, member)).toBe('This workflow would be blocked')
    expect(coverageTone(member)).toBe('critical')
  })
})
