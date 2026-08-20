export type DraftTeam = {
  id: string
  name: string
  department: string
  memberCount: number
}

export type DraftMember = {
  id: string
  teamId: string
  employeeNumber: string | null
  name: string
  email: string | null
  status: 'ACTIVE' | 'INACTIVE'
  region: 'NORTH_AMERICA' | 'EUROPE' | 'ASIA_PACIFIC'
  shift: 'DAY' | 'EVENING' | 'NIGHT'
  roleIds: string[]
}

export type DraftRole = {
  id: string
  name: string
  description: string
  sensitivity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  ownerMemberId: string | null
  memberCount: number
}

export type DraftWorkflow = {
  id: string
  name: string
  criticality: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  requirements: DraftWorkflowRequirement[]
  quickManaged: boolean
}

export type DraftWorkflowRequirement = {
  id: string
  name: string
  position: number
  minimumActors: number
  resilienceTarget: number
  requiredDepartment: string | null
  requiredRegion: DraftMember['region'] | null
  requiredShift: DraftMember['shift'] | null
  roleIds: string[]
}

export type DraftCatalog = {
  workspaceId: string
  teams: DraftTeam[]
  members: DraftMember[]
  roles: DraftRole[]
  workflows: DraftWorkflow[]
}

export type TeamInput = { name: string; department: string }
export type MemberInput = Omit<DraftMember, 'id' | 'roleIds'>
export type RoleInput = Omit<DraftRole, 'id' | 'memberCount'> & { holderMemberIds?: string[] }
export type WorkflowRequirementInput = {
  name: string
  roleId: string
  minimumActors: number
  resilienceTarget: number
}
export type QuickWorkflowInput = Pick<DraftWorkflow, 'name' | 'criticality'> & {
  requirementName: string
  roleId: string
  minimumActors: number
  resilienceTarget: number
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''

export function fetchDraftCatalog(workspaceId: string, signal?: AbortSignal) {
  return request<DraftCatalog>(`/api/v1/workspaces/${workspaceId}/catalog`, { signal })
}

export function createDraftTeam(workspaceId: string, input: TeamInput) {
  return mutateCatalog(workspaceId, '/teams', 'POST', input)
}

export function updateDraftTeam(workspaceId: string, teamId: string, input: TeamInput) {
  return mutateCatalog(workspaceId, `/teams/${teamId}`, 'PUT', input)
}

export function deleteDraftTeam(workspaceId: string, teamId: string) {
  return mutateCatalog(workspaceId, `/teams/${teamId}`, 'DELETE')
}

export function createDraftMember(workspaceId: string, input: MemberInput) {
  return mutateCatalog(workspaceId, '/members', 'POST', input)
}

export function updateDraftMember(workspaceId: string, memberId: string, input: MemberInput) {
  return mutateCatalog(workspaceId, `/members/${memberId}`, 'PUT', input)
}

export function deleteDraftMember(workspaceId: string, memberId: string) {
  return mutateCatalog(workspaceId, `/members/${memberId}`, 'DELETE')
}

export function createDraftRole(workspaceId: string, input: RoleInput) {
  return mutateCatalog(workspaceId, '/roles', 'POST', input)
}

export function updateDraftRole(workspaceId: string, roleId: string, input: RoleInput) {
  return mutateCatalog(workspaceId, `/roles/${roleId}`, 'PUT', input)
}

export function deleteDraftRole(workspaceId: string, roleId: string) {
  return mutateCatalog(workspaceId, `/roles/${roleId}`, 'DELETE')
}

export function replaceMemberRoles(workspaceId: string, memberId: string, roleIds: string[]) {
  return mutateCatalog(workspaceId, `/members/${memberId}/roles`, 'PUT', { roleIds })
}

export function createQuickWorkflow(workspaceId: string, input: QuickWorkflowInput) {
  return mutateCatalog(workspaceId, '/workflows/quick', 'POST', {
    name: input.name,
    criticality: input.criticality,
    requirementName: input.requirementName,
    roleId: input.roleId,
    minimumActors: input.minimumActors,
    resilienceTarget: input.resilienceTarget,
  })
}

export function addWorkflowRequirement(workspaceId: string, workflowId: string, input: WorkflowRequirementInput) {
  return mutateCatalog(workspaceId, `/workflows/${workflowId}/requirements`, 'POST', input)
}

export function deleteQuickWorkflow(workspaceId: string, workflowId: string) {
  return mutateCatalog(workspaceId, `/workflows/${workflowId}`, 'DELETE')
}

function mutateCatalog(workspaceId: string, path: string, method: string, body?: unknown) {
  return request<DraftCatalog>(`/api/v1/workspaces/${workspaceId}/catalog${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, init)
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { message?: string } | null
    throw new Error(error?.message ?? 'The draft could not be updated')
  }
  return response.json() as Promise<T>
}
