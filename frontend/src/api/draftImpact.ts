import type { Simulation } from './simulations'

export type DraftImpactResult = Simulation['result'] & Pick<Simulation, 'organizationId' | 'baselineVersion'>
export type DraftMitigationPreview = {
  original: DraftImpactResult
  mitigation: DraftImpactResult
}

export type DraftContinuityEligibleMember = { id: string; name: string }
export type DraftContinuityRiskMember = DraftContinuityEligibleMember & {
  eligible: boolean
  losesCoverage: boolean
  remainingEligibleActorCount: number
  scenarioStatus: 'OPERATIONAL' | 'DEGRADED' | 'BLOCKED'
}
export type DraftContinuityRisk = {
  key: string
  workflowId: string
  workflowName: string
  criticality: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  requirementId: string
  requirementName: string
  minimumActors: number
  resilienceTarget: number
  roleId: string
  roleName: string
  eligibleMembers: DraftContinuityEligibleMember[]
  members: DraftContinuityRiskMember[]
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''

export async function fetchDraftContinuityRisks(workspaceId: string, signal?: AbortSignal): Promise<DraftContinuityRisk[]> {
  const response = await fetch(`${apiBaseUrl}/api/v1/workspaces/${workspaceId}/impact-previews/continuity`, { signal })
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { message?: string } | null
    throw new Error(error?.message ?? 'The continuity projection could not be loaded')
  }
  return response.json() as Promise<DraftContinuityRisk[]>
}

export async function runDraftImpactPreview(
  workspaceId: string,
  memberId: string,
  roleId: string,
): Promise<DraftImpactResult> {
  const response = await fetch(`${apiBaseUrl}/api/v1/workspaces/${workspaceId}/impact-previews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberId, roleId }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => null) as { message?: string } | null
    throw new Error(error?.message ?? 'The impact preview could not be generated')
  }
  return response.json() as Promise<DraftImpactResult>
}

export async function runDraftMitigationPreview(
  workspaceId: string,
  memberId: string,
  roleId: string,
  replacementMemberId: string,
): Promise<DraftMitigationPreview> {
  const response = await fetch(`${apiBaseUrl}/api/v1/workspaces/${workspaceId}/impact-previews/mitigations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberId, roleId, replacementMemberId }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => null) as { message?: string } | null
    throw new Error(error?.message ?? 'The mitigation preview could not be generated')
  }
  return response.json() as Promise<DraftMitigationPreview>
}
