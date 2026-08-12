export type WorkflowCriticality = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export type Dashboard = {
  organization: {
    id: string
    slug: string
    name: string
    baselineVersion: number
    contentHash: string
  }
  counts: {
    employees: number
    activeEmployees: number
    teams: number
    roles: number
    applications: number
    permissions: number
    capabilities: number
    workflows: number
  }
  workflows: Array<{
    id: string
    name: string
    criticality: WorkflowCriticality
    stepCount: number
    ownerName: string | null
  }>
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''

export async function fetchDashboard(signal?: AbortSignal): Promise<Dashboard> {
  const response = await fetch(`${apiBaseUrl}/api/v1/dashboard`, { signal })

  if (!response.ok) {
    throw new Error(`Dashboard request failed with status ${response.status}`)
  }

  return response.json() as Promise<Dashboard>
}
