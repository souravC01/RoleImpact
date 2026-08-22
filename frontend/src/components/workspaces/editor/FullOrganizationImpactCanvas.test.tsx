import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DraftCatalog } from '../../../api/draftCatalog'
import type { DraftContinuityRisk, DraftImpactResult } from '../../../api/draftImpact'
import { OrganizationImpactCanvas } from './OrganizationCanvas'
import '../../../App.css'

describe('FullOrganizationImpactCanvas', () => {
  it('keeps a shared role available when removing one holder leaves other eligible holders', async () => {
    render(
      <OrganizationImpactCanvas
        workspaceId="workspace-1"
        catalog={safeSharedRoleCatalog}
        workflowId="workflow-1"
        risks={safeSharedRoleRisks}
        selectedRiskKey="workflow-1:requirement-1:role-1"
        selectedMemberId="member-maya"
        originalResult={safeSharedRoleResult}
        displayedResult={safeSharedRoleResult}
        isPending={false}
        onRunScenario={vi.fn()}
        onTryReplacement={vi.fn()}
      />,
    )

    expect(await screen.findByLabelText(/member Maya Singh.*Assignment removed/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/role Invoice Processor.*2 holders remain/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/role Invoice Processor.*Removed/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/responsibility Validate supplier invoice.*Still operational/i).firstElementChild).toHaveClass('simulation-operational')
    expect(screen.getByLabelText(/workflow Daily Vendor Payment Run.*Still operational/i).firstElementChild).toHaveClass('simulation-operational')
  })

  it('keeps every member of a participating team visible in workflow focus', async () => {
    render(
      <OrganizationImpactCanvas
        workspaceId="workspace-1"
        catalog={candidateCatalog}
        workflowId="workflow-1"
        risks={safeSharedRoleRisks}
        selectedRiskKey="workflow-1:requirement-1:role-1"
        selectedMemberId="member-maya"
        isPending={false}
        onRunScenario={vi.fn()}
        onTryReplacement={vi.fn()}
      />,
    )

    expect(await screen.findByLabelText(/member Arjun Mehta/i)).toBeInTheDocument()
  })

  it('renders graph controls with dark backgrounds', () => {
    const { container } = render(
      <OrganizationImpactCanvas
        workspaceId="workspace-1"
        catalog={candidateCatalog}
        workflowId="workflow-1"
        risks={safeSharedRoleRisks}
        selectedRiskKey="workflow-1:requirement-1:role-1"
        selectedMemberId="member-maya"
        originalResult={candidateResult}
        displayedResult={candidateResult}
        isPending={false}
        onRunScenario={vi.fn()}
        onTryReplacement={vi.fn()}
      />,
    )

    const controlButton = container.querySelector<HTMLElement>('.full-impact-map-canvas .react-flow__controls-button')
    expect(controlButton).not.toBeNull()
    expect(getComputedStyle(controlButton!).backgroundColor).toBe('rgb(23, 26, 36)')
  })
})

const safeSharedRoleCatalog: DraftCatalog = {
  workspaceId: 'workspace-1',
  teams: [{ id: 'team-ap', name: 'Accounts Payable', department: 'Finance', memberCount: 3 }],
  members: [
    { id: 'member-maya', teamId: 'team-ap', employeeNumber: null, name: 'Maya Singh', email: null, status: 'ACTIVE', region: 'NORTH_AMERICA', shift: 'DAY', roleIds: ['role-1'] },
    { id: 'member-neha', teamId: 'team-ap', employeeNumber: null, name: 'Neha Kapoor', email: null, status: 'ACTIVE', region: 'NORTH_AMERICA', shift: 'DAY', roleIds: ['role-1'] },
    { id: 'member-omar', teamId: 'team-ap', employeeNumber: null, name: 'Omar Haddad', email: null, status: 'ACTIVE', region: 'NORTH_AMERICA', shift: 'DAY', roleIds: ['role-1'] },
  ],
  roles: [{ id: 'role-1', name: 'Invoice Processor', description: 'Validates supplier invoices', sensitivity: 'MEDIUM', ownerMemberId: null, memberCount: 3 }],
  workflows: [{
    id: 'workflow-1',
    name: 'Daily Vendor Payment Run',
    criticality: 'CRITICAL',
    quickManaged: true,
    requirements: [{ id: 'requirement-1', name: 'Validate supplier invoice', position: 1, minimumActors: 1, resilienceTarget: 2, requiredDepartment: null, requiredRegion: null, requiredShift: null, roleIds: ['role-1'] }],
  }],
}

const safeSharedRoleRisks: DraftContinuityRisk[] = [{
  key: 'workflow-1:requirement-1:role-1',
  workflowId: 'workflow-1',
  workflowName: 'Daily Vendor Payment Run',
  criticality: 'CRITICAL',
  requirementId: 'requirement-1',
  requirementName: 'Validate supplier invoice',
  minimumActors: 1,
  resilienceTarget: 2,
  roleId: 'role-1',
  roleName: 'Invoice Processor',
  eligibleMembers: [
    { id: 'member-maya', name: 'Maya Singh' },
    { id: 'member-neha', name: 'Neha Kapoor' },
    { id: 'member-omar', name: 'Omar Haddad' },
  ],
  members: [{ id: 'member-maya', name: 'Maya Singh', eligible: true, losesCoverage: true, remainingEligibleActorCount: 2, scenarioStatus: 'OPERATIONAL' }],
}]

const safeSharedRoleResult = {
  changeSet: {
    type: 'REVOKE_EMPLOYEE_ROLE',
    employee: { id: 'member-maya', name: 'Maya Singh' },
    role: { id: 'role-1', name: 'Invoice Processor' },
    replacementEmployee: null,
  },
  workflowImpacts: [{
    workflowId: 'workflow-1',
    workflowName: 'Daily Vendor Payment Run',
    baselineStatus: 'OPERATIONAL',
    scenarioStatus: 'OPERATIONAL',
    steps: [{ stepId: 'requirement-1', baselineStatus: 'OPERATIONAL', scenarioStatus: 'OPERATIONAL' }],
  }],
  recommendations: [],
  excludedCandidateReasons: [],
  diagnostics: { resultHash: 'safe-shared-role' },
} as unknown as DraftImpactResult

const candidateCatalog: DraftCatalog = {
  ...safeSharedRoleCatalog,
  teams: [{ ...safeSharedRoleCatalog.teams[0], memberCount: 4 }],
  members: [
    ...safeSharedRoleCatalog.members,
    { id: 'member-arjun', teamId: 'team-ap', employeeNumber: null, name: 'Arjun Mehta', email: null, status: 'ACTIVE', region: 'NORTH_AMERICA', shift: 'DAY', roleIds: [] },
  ],
}

const candidateResult = {
  ...safeSharedRoleResult,
  recommendations: [{
    id: 'recommendation-1',
    rank: 1,
    candidate: { id: 'member-arjun', name: 'Arjun Mehta' },
  }],
  diagnostics: { resultHash: 'candidate-result' },
} as unknown as DraftImpactResult
