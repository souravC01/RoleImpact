import type { Simulation } from './simulations'

export type DraftImpactResult = Simulation['result']

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''

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
