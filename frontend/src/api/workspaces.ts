export type Workspace = {
  id: string
  slug: string
  name: string
  status: 'DRAFT' | 'PUBLISHED'
  currentVersion: number
  sourceTemplateOrganizationId: string | null
  createdAt: string
  updatedAt: string
  counts: {
    teams: number
    members: number
    roles: number
    permissions: number
    capabilities: number
    workflows: number
  }
}

type WorkspaceInput = {
  name: string
  slug?: string
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''

export async function fetchWorkspaces(signal?: AbortSignal): Promise<Workspace[]> {
  const response = await fetch(`${apiBaseUrl}/api/v1/workspaces`, { signal })
  return readResponse(response, 'Workspace list could not be loaded')
}

export async function createWorkspace(input: WorkspaceInput): Promise<Workspace> {
  const response = await fetch(`${apiBaseUrl}/api/v1/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return readResponse(response, 'Workspace could not be created')
}

export async function cloneWorkspace(sourceWorkspaceId: string, input: WorkspaceInput): Promise<Workspace> {
  const response = await fetch(`${apiBaseUrl}/api/v1/workspaces/${sourceWorkspaceId}/clones`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return readResponse(response, 'Workspace could not be cloned')
}

async function readResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { message?: string } | null
    throw new Error(error?.message ?? fallbackMessage)
  }
  return response.json() as Promise<T>
}
