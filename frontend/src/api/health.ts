export type HealthStatus = {
  status: string
  service: string
  checkedAt: string
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''

export async function fetchHealth(signal?: AbortSignal): Promise<HealthStatus> {
  const response = await fetch(`${apiBaseUrl}/api/v1/health`, { signal })

  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`)
  }

  return response.json() as Promise<HealthStatus>
}
