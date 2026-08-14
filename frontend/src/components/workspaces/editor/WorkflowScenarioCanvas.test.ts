import { describe, expect, it } from 'vitest'
import type { DraftCatalog } from '../../../api/draftCatalog'
import { buildGraph } from './workflowScenarioGraph'
import { findWorkflowRisks } from './workflowRisks'

describe('workflow scenario layout', () => {
  it('keeps each role and member in the lane of the workflow step they support', () => {
    const risks = findWorkflowRisks(layoutCatalog).toReversed()
    const bankRisk = risks.find((risk) => risk.roleId === 'role-bank')!
    const graph = buildGraph(layoutCatalog, 'workflow-payment', risks, bankRisk.key, 'member-daniel')
    const y = (nodeId: string) => graph.nodes.find((node) => node.id === nodeId)!.position.y

    expect(y('role:role-invoice')).toBe(y('step:step-validate'))
    expect(y('role:role-approver')).toBe(y('step:step-approve'))
    expect(y('role:role-bank')).toBe(y('step:step-release'))
    expect(y('member:member-daniel')).toBe(y('step:step-release'))
    expect(y('step:step-validate')).toBeLessThan(y('step:step-approve'))
    expect(y('step:step-approve')).toBeLessThan(y('step:step-release'))
  })
})

const layoutCatalog: DraftCatalog = {
  workspaceId: 'workspace-1',
  teams: [{ id: 'team-finance', name: 'Finance', department: 'Finance', memberCount: 3 }],
  members: [
    { id: 'member-maya', teamId: 'team-finance', employeeNumber: null, name: 'Maya', email: null, status: 'ACTIVE', region: 'NORTH_AMERICA', shift: 'DAY', roleIds: ['role-invoice'] },
    { id: 'member-priya', teamId: 'team-finance', employeeNumber: null, name: 'Priya', email: null, status: 'ACTIVE', region: 'NORTH_AMERICA', shift: 'DAY', roleIds: ['role-approver'] },
    { id: 'member-daniel', teamId: 'team-finance', employeeNumber: null, name: 'Daniel', email: null, status: 'ACTIVE', region: 'NORTH_AMERICA', shift: 'DAY', roleIds: ['role-bank'] },
  ],
  roles: [
    { id: 'role-bank', name: 'Bank Releaser', description: 'Releases payments', sensitivity: 'CRITICAL', ownerMemberId: null, memberCount: 1 },
    { id: 'role-approver', name: 'Payment Approver', description: 'Approves payments', sensitivity: 'HIGH', ownerMemberId: null, memberCount: 1 },
    { id: 'role-invoice', name: 'Invoice Processor', description: 'Validates invoices', sensitivity: 'MEDIUM', ownerMemberId: null, memberCount: 1 },
  ],
  workflows: [{
    id: 'workflow-payment', name: 'Vendor Payment Run', criticality: 'CRITICAL', quickManaged: true,
    requirements: [
      { id: 'step-validate', name: 'Validate invoice', position: 1, minimumActors: 1, resilienceTarget: 1, requiredDepartment: null, requiredRegion: null, requiredShift: null, roleIds: ['role-invoice'] },
      { id: 'step-approve', name: 'Approve payment', position: 2, minimumActors: 1, resilienceTarget: 1, requiredDepartment: null, requiredRegion: null, requiredShift: null, roleIds: ['role-approver'] },
      { id: 'step-release', name: 'Release payment', position: 3, minimumActors: 1, resilienceTarget: 1, requiredDepartment: null, requiredRegion: null, requiredShift: null, roleIds: ['role-bank'] },
    ],
  }],
}
