export type Workspace = {
  id: string
  slug: string
  name: string
  status: 'DRAFT' | 'PUBLISHED'
  currentVersion: number
  publicCode: string
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

export function normalizeWorkspaceCode(rawCode: string): string | null {
  const candidate = rawCode.trim().toUpperCase()
  if (/^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{6}$/.test(candidate)) return candidate
  if (!/^[A-HJ-NP-Z2-9]{9}$/.test(candidate)) return null
  return `${candidate.slice(0, 3)}-${candidate.slice(3)}`
}

export async function fetchWorkspaceByCode(rawCode: string, signal?: AbortSignal): Promise<Workspace> {
  const code = normalizeWorkspaceCode(rawCode)
  if (!code) throw new Error('Enter an organization ID such as NMS-7K4P9D')
  const response = await fetch(`${apiBaseUrl}/api/v1/workspaces/by-code/${code}`, { signal })
  return readResponse(response, 'Organization not found')
}

export async function createWorkspace(input: WorkspaceInput): Promise<Workspace> {
  const response = await fetch(`${apiBaseUrl}/api/v1/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return readResponse(response, 'Organization could not be created')
}

async function readResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { message?: string } | null
    throw new Error(error?.message ?? fallbackMessage)
  }
  return response.json() as Promise<T>
}
