import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DraftCatalog } from '../../../api/draftCatalog'
import type { DraftContinuityRisk, DraftImpactResult } from '../../../api/draftImpact'
import FullOrganizationImpactCanvas from './FullOrganizationImpactCanvas'

const reactFlowProps = vi.hoisted(() => ({ current: null as null | { edges: Array<Record<string, unknown>> } }))

vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual<typeof import('@xyflow/react')>('@xyflow/react')
  return {
    ...actual,
    Background: () => null,
    Controls: () => null,
    ReactFlow: ({ edges }: { edges: Array<Record<string, unknown>> }) => {
      reactFlowProps.current = { edges }
      return <div data-testid="impact-flow" />
    },
    useReactFlow: () => ({ fitView: vi.fn() }),
  }
})

describe('FullOrganizationImpactCanvas edge presentation', () => {
  beforeEach(() => { reactFlowProps.current = null })

  it('supplies a dark background for recommendation edge labels', () => {
    render(
      <FullOrganizationImpactCanvas
        workspaceId="workspace-1"
        catalog={catalog}
        workflowId="workflow-1"
        risks={risks}
        selectedRiskKey="risk-1"
        selectedMemberId="member-maya"
        originalResult={result}
        displayedResult={result}
        isPending={false}
        onRunScenario={vi.fn()}
        onTryReplacement={vi.fn()}
        baseNodes={[]}
        baseEdges={[]}
        baseFocusIds={new Set(['role:role-1'])}
        nodeTypes={{}}
        getRelatedPathIds={() => new Set()}
      />,
    )

    expect(screen.getByTestId('impact-flow')).toBeInTheDocument()
    const candidateEdge = reactFlowProps.current?.edges.find((edge) => edge.label === 'recommended #1')
    expect(candidateEdge).toMatchObject({
      labelBgStyle: { fill: '#12151e', fillOpacity: 0.95 },
    })
  })

})

const catalog = {
  workspaceId: 'workspace-1',
  teams: [{ id: 'team-1', name: 'Platform', department: 'Engineering', memberCount: 2 }],
  members: [
    { id: 'member-maya', teamId: 'team-1', employeeNumber: null, name: 'Maya Singh', email: null, status: 'ACTIVE', region: 'NORTH_AMERICA', shift: 'DAY', roleIds: ['role-1'] },
    { id: 'member-arjun', teamId: 'team-1', employeeNumber: null, name: 'Arjun Mehta', email: null, status: 'ACTIVE', region: 'NORTH_AMERICA', shift: 'DAY', roleIds: [] },
  ],
  roles: [{ id: 'role-1', name: 'Release Manager', description: '', sensitivity: 'HIGH', ownerMemberId: null, memberCount: 1 }],
  workflows: [{ id: 'workflow-1', name: 'Production Deployment', criticality: 'CRITICAL', quickManaged: true, requirements: [{ id: 'responsibility-1', name: 'Approve release', position: 1, minimumActors: 1, resilienceTarget: 1, requiredDepartment: null, requiredRegion: null, requiredShift: null, roleIds: ['role-1'] }] }],
} satisfies DraftCatalog

const risks = [{
  key: 'risk-1', workflowId: 'workflow-1', workflowName: 'Production Deployment', criticality: 'CRITICAL', requirementId: 'responsibility-1', requirementName: 'Approve release', minimumActors: 1, resilienceTarget: 1, roleId: 'role-1', roleName: 'Release Manager', eligibleMembers: [{ id: 'member-maya', name: 'Maya Singh' }], members: [{ id: 'member-maya', name: 'Maya Singh', eligible: true, losesCoverage: true, remainingEligibleActorCount: 0, scenarioStatus: 'BLOCKED' }],
}] satisfies DraftContinuityRisk[]

const result = {
  changeSet: { type: 'REVOKE_EMPLOYEE_ROLE', employee: { id: 'member-maya', name: 'Maya Singh' }, role: { id: 'role-1', name: 'Release Manager' }, replacementEmployee: null },
  workflowImpacts: [],
  recommendations: [{ id: 'recommendation-1', rank: 1, candidate: { id: 'member-arjun', name: 'Arjun Mehta' } }],
  excludedCandidateReasons: [],
  diagnostics: { resultHash: 'result-1' },
} as unknown as DraftImpactResult
