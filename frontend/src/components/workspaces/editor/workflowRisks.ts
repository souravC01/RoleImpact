import type { DraftCatalog, DraftMember, DraftWorkflowRequirement } from '../../../api/draftCatalog'

export type WorkflowRiskMember = { id: string; name: string; eligible: boolean; losesCoverage: boolean }

export type WorkflowRisk = {
  key: string
  workflowId: string
  workflowName: string
  criticality: string
  requirementId: string
  requirementName: string
  minimumActors: number
  resilienceTarget: number
  roleId: string
  roleName: string
  members: WorkflowRiskMember[]
  eligibleMembers: WorkflowRiskMember[]
}

export function findWorkflowRisks(catalog: DraftCatalog): WorkflowRisk[] {
  const rolesById = new Map(catalog.roles.map((role) => [role.id, role]))
  return catalog.workflows.flatMap((workflow) => workflow.requirements.flatMap((requirement) =>
    requirement.roleIds.flatMap((roleId) => {
      const role = rolesById.get(roleId)
      if (!role) return []
      const eligibleMembers = catalog.members
        .filter((member) => member.roleIds.some((id) => requirement.roleIds.includes(id)) && isEligible(member, requirement, catalog))
        .map((member) => ({ id: member.id, name: member.name, eligible: true, losesCoverage: false }))
      const members = catalog.members
        .filter((member) => member.roleIds.includes(roleId))
        .map((member) => {
          const eligible = isEligible(member, requirement, catalog)
          const hasAlternativeRole = member.roleIds.some((id) => id !== roleId && requirement.roleIds.includes(id))
          return { id: member.id, name: member.name, eligible, losesCoverage: eligible && !hasAlternativeRole }
        })
      return [{
        key: `${workflow.id}:${requirement.id}:${roleId}`,
        workflowId: workflow.id,
        workflowName: workflow.name,
        criticality: workflow.criticality,
        requirementId: requirement.id,
        requirementName: requirement.name,
        minimumActors: requirement.minimumActors,
        resilienceTarget: requirement.resilienceTarget,
        roleId,
        roleName: role.name,
        members,
        eligibleMembers,
      }]
    }),
  ))
}

function isEligible(member: DraftMember, requirement: DraftWorkflowRequirement, catalog: DraftCatalog) {
  if (member.status !== 'ACTIVE') return false
  const team = catalog.teams.find((candidate) => candidate.id === member.teamId)
  if (!team) return false
  if (requirement.requiredDepartment && team.department !== requirement.requiredDepartment) return false
  if (requirement.requiredRegion && member.region !== requirement.requiredRegion) return false
  if (requirement.requiredShift && member.shift !== requirement.requiredShift) return false
  return true
}
