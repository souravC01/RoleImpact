import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { DraftCatalog } from './api/draftCatalog'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  )
}

describe('App', () => {
  it('renders the seeded organization dashboard', async () => {
    const user = userEvent.setup()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input.toString()
      if (url.endsWith('/api/v1/workspaces')) return jsonResponse(workspaceFixture)
      if (url.endsWith('/api/v1/dashboard')) {
        return jsonResponse({
          organization: {
            id: '00000000-0000-0000-0000-000000000001',
            slug: 'harborline-commerce',
            name: 'Harborline Commerce',
            baselineVersion: 1,
            contentHash: 'dbafb569ae3beaa13277897a7700ab32867675e31ee90cad74a9dc544d5c1fb4',
          },
          counts: {
            employees: 25,
            activeEmployees: 24,
            teams: 5,
            roles: 8,
            applications: 6,
            permissions: 23,
            capabilities: 10,
            workflows: 4,
          },
          workflows: [
            {
              id: '50000000-0000-0000-0000-000000000002',
              name: 'Month-End Close',
              criticality: 'CRITICAL',
              stepCount: 2,
              ownerName: 'Olivia Park',
            },
          ],
        })
      }
      return new Response(null, { status: 404 })
    })

    renderApp()

    expect(await screen.findByRole('heading', { name: 'Explore Harborline' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Explore the example' }))
    expect(await screen.findByText(/Harborline Commerce/)).toBeInTheDocument()
    expect(screen.getByText('24')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { name: 'Month-End Close' })).not.toHaveLength(0)
    expect(screen.getByText('Immutable snapshot')).toBeInTheDocument()
  })

  it('runs the Priya scenario and verifies the recommended mitigation branch', async () => {
    const user = userEvent.setup()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input.toString()
      if (url.endsWith('/api/v1/workspaces')) {
        return jsonResponse(workspaceFixture)
      }
      if (url.endsWith('/api/v1/dashboard')) {
        return jsonResponse(dashboardFixture)
      }
      if (url.endsWith('/api/v1/simulations')) {
        return jsonResponse(simulationFixture, 201)
      }
      if (url.endsWith('/branches')) {
        return jsonResponse(mitigationFixture, 201)
      }
      return new Response(null, { status: 404 })
    })

    renderApp()

    await user.click(await screen.findByRole('button', { name: 'Explore the example' }))
    await user.click(await screen.findByRole('button', { name: 'Run impact analysis' }))

    expect(await screen.findByRole('heading', { name: 'Critical business impact' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { name: 'Vendor Payment' })).not.toHaveLength(0)
    expect(screen.getAllByRole('heading', { name: 'Month-End Close' })).not.toHaveLength(0)
    expect(screen.getAllByText('BLOCKED')).not.toHaveLength(0)
    expect(screen.getAllByText('DEGRADED')).not.toHaveLength(0)
    expect(screen.getAllByText('payment.approve', { selector: 'code' })).not.toHaveLength(0)
    expect(screen.getAllByText('ledger.close', { selector: 'code' })).not.toHaveLength(0)
    expect(screen.getAllByText('Priya Sharma')).not.toHaveLength(0)
    expect(await screen.findByRole('heading', { name: 'Focused impact graph' })).toBeInTheDocument()
    expect(screen.getByLabelText('Graph state legend')).toHaveTextContent('Blocked')
    expect(screen.getByText('Read the relationship path as text')).toBeInTheDocument()
    expect(screen.getByRole('heading', {
      name: 'Restore the workflow without reversing Priya’s change',
    })).toBeInTheDocument()
    expect(screen.getByText('Assign Finance Approver to Bob Chen')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: "Test Bob's mitigation" }))

    expect(await screen.findByRole('heading', { name: 'Workflow disruption resolved' })).toBeInTheDocument()
    expect(screen.getByRole('table', {
      name: 'Original and mitigated workflow comparison',
    })).toHaveTextContent('Vendor Payment')
    expect(screen.getByRole('table', {
      name: 'Original and mitigated workflow comparison',
    })).toHaveTextContent('Month-End Close')
    expect(screen.getAllByText('OPERATIONAL')).not.toHaveLength(0)
    expect(screen.getByText('Saved as a child simulation')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'With mitigation' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Graph state legend')).toHaveTextContent('Restored')
  })

  it('clones the example into an isolated editable draft', async () => {
    const user = userEvent.setup()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = input.toString()
      if (url.endsWith('/api/v1/workspaces') && !init?.method) return jsonResponse(workspaceFixture)
      if (url.endsWith('/clones') && init?.method === 'POST') return jsonResponse(clonedWorkspaceFixture, 201)
      if (url.endsWith('/catalog')) return jsonResponse(clonedCatalogFixture)
      return new Response(null, { status: 404 })
    })

    renderApp()

    await user.click(await screen.findByRole('button', { name: 'Clone and customize' }))

    expect(await screen.findByRole('heading', { name: 'Harborline Sandbox' })).toBeInTheDocument()
    expect(screen.getByText('Draft · not yet published')).toBeInTheDocument()
    expect(screen.getByText(/fresh identity/)).toBeInTheDocument()
    expect(screen.getByLabelText('Draft catalog summary')).toHaveTextContent('1members')
    expect(await screen.findByRole('heading', { name: 'Map how your organization works' })).toBeInTheDocument()
    expect(await screen.findByLabelText('Organization relationship canvas')).toBeInTheDocument()
    expect(screen.getByLabelText('Organization inventory')).toHaveTextContent('Finance Approver')
    expect(screen.getByRole('button', { name: 'Show full map' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Detailed inventory' }))
    expect(screen.getByRole('button', { name: /Teams/ })).toHaveAttribute('aria-current', 'step')
  })

  it('builds a blank draft through teams, members, workflows, impact testing, and shared roles', async () => {
    const user = userEvent.setup()
    let catalog: DraftCatalog = structuredClone(blankCatalogFixture)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = input.toString()
      if (url.endsWith('/api/v1/workspaces') && !init?.method) return jsonResponse(workspaceFixture)
      if (url.endsWith('/api/v1/workspaces') && init?.method === 'POST') return jsonResponse(blankWorkspaceFixture, 201)
      if (url.endsWith('/catalog') && !init?.method) return jsonResponse(catalog)
      if (url.endsWith('/catalog/teams') && init?.method === 'POST') {
        const input = JSON.parse(String(init.body)) as { name: string; department: string }
        catalog = { ...catalog, teams: [{ id: 'team-1', name: input.name, department: input.department, memberCount: 0 }] }
        return jsonResponse(catalog)
      }
      if (url.endsWith('/catalog/members') && init?.method === 'POST') {
        const input = JSON.parse(String(init.body)) as { name: string }
        const memberNumber = catalog.members.length + 1
        const member = { id: `member-${memberNumber}`, teamId: 'team-1', employeeNumber: null, name: input.name, email: null, status: 'ACTIVE' as const, region: 'NORTH_AMERICA' as const, shift: 'DAY' as const, roleIds: [] }
        catalog = { ...catalog, teams: [{ ...catalog.teams[0], memberCount: memberNumber }], members: [...catalog.members, member] }
        return jsonResponse(catalog)
      }
      if (url.endsWith('/catalog/roles') && init?.method === 'POST') {
        const input = JSON.parse(String(init.body)) as { name: string; description: string; sensitivity: DraftCatalog['roles'][number]['sensitivity'] }
        catalog = { ...catalog, roles: [{ id: 'role-1', name: input.name, description: input.description, sensitivity: input.sensitivity, ownerMemberId: null, memberCount: 0 }] }
        return jsonResponse(catalog)
      }
      if (url.endsWith('/catalog/members/member-1') && init?.method === 'PUT') {
        const input = JSON.parse(String(init.body)) as Omit<DraftCatalog['members'][number], 'id' | 'roleIds'>
        catalog = { ...catalog, members: catalog.members.map((member) => member.id === 'member-1' ? { ...member, ...input } : member) }
        return jsonResponse(catalog)
      }
      if (url.endsWith('/catalog/roles/role-1') && init?.method === 'PUT') {
        const input = JSON.parse(String(init.body)) as { name: string; description: string; sensitivity: DraftCatalog['roles'][number]['sensitivity']; ownerMemberId: string | null }
        catalog = { ...catalog, roles: [{ ...catalog.roles[0], ...input }] }
        return jsonResponse(catalog)
      }
      if (url.match(/\/members\/[^/]+\/roles$/) && init?.method === 'PUT') {
        const memberId = url.match(/\/members\/([^/]+)\/roles$/)![1]
        const input = JSON.parse(String(init.body)) as { roleIds: string[] }
        const members = catalog.members.map((member) => member.id === memberId ? { ...member, roleIds: input.roleIds } : member)
        const roles = catalog.roles.map((role) => ({ ...role, memberCount: members.filter((member) => member.roleIds.includes(role.id)).length }))
        catalog = { ...catalog, members, roles }
        return jsonResponse(catalog)
      }
      if (url.endsWith('/catalog/workflows/quick') && init?.method === 'POST') {
        const input = JSON.parse(String(init.body)) as { name: string; criticality: DraftCatalog['workflows'][number]['criticality']; requirementName: string }
        catalog = { ...catalog, workflows: [{ id: 'workflow-1', name: input.name, criticality: input.criticality, quickManaged: true, requirements: [{ id: 'requirement-1', name: input.requirementName, position: 1, minimumActors: 1, resilienceTarget: 1, requiredDepartment: null, requiredRegion: null, requiredShift: null, roleIds: ['role-1'] }] }] }
        return jsonResponse(catalog)
      }
      if (url.endsWith('/impact-previews') && init?.method === 'POST') return jsonResponse(customDraftImpactFixture)
      if (url.endsWith('/catalog/workflows/workflow-1') && init?.method === 'DELETE') {
        catalog = { ...catalog, workflows: [] }
        return jsonResponse(catalog)
      }
      return new Response(null, { status: 404 })
    })

    renderApp()
    await user.type(await screen.findByLabelText('Organization name'), 'Atlas Systems')
    await user.click(screen.getByRole('button', { name: 'Start blank' }))
    expect(await screen.findByRole('heading', { name: 'Map how your organization works' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Member' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Add Team' }))
    await user.type(screen.getByLabelText('Team name'), 'Platform')
    await user.clear(screen.getByLabelText('Department (optional)'))
    await user.type(screen.getByLabelText('Department (optional)'), 'Engineering')
    await user.click(screen.getByRole('button', { name: 'Create team' }))
    expect(await screen.findByText('Team created')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add Member' }))
    await user.type(screen.getByLabelText('Member name'), 'Maya Singh')
    expect(screen.getByText(/Employee reference ID and work email are optional/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Create member' }))
    expect(await screen.findByText('Member created')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add Role' }))
    await user.type(screen.getByLabelText('Role name'), 'Release Manager')
    await user.selectOptions(screen.getByLabelText('Sensitivity'), 'HIGH')
    expect(screen.getByRole('checkbox', { name: 'Maya Singh' })).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Create role without holders' })).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Maya Singh' }))
    await user.click(screen.getByRole('button', { name: 'Create role' }))
    expect(await screen.findByText('Role created')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add Workflow' }))
    await user.type(screen.getByLabelText('Workflow name'), 'Production Deployment')
    await user.selectOptions(screen.getByLabelText('Business criticality'), 'CRITICAL')
    await user.click(screen.getByRole('button', { name: 'Create workflow' }))
    expect(await screen.findByText('Workflow created')).toBeInTheDocument()
    expect(screen.getByLabelText('Organization inventory')).toHaveTextContent('Production Deployment')
    expect(screen.getByLabelText('Organization relationship canvas')).toBeInTheDocument()
    expect(screen.getByText('5 objects · 4 connections')).toBeInTheDocument()
    expect(screen.getByLabelText('Team Platform')).toBeInTheDocument()
    expect(screen.getByLabelText('Member Maya Singh')).toBeInTheDocument()
    expect(screen.getByLabelText('Role Release Manager')).toBeInTheDocument()
    expect(screen.getByLabelText('Responsibility Release Manager responsibility')).toBeInTheDocument()
    expect(screen.getByLabelText('Workflow Production Deployment')).toBeInTheDocument()
    expect(screen.getByLabelText('Continuity risks found')).toHaveTextContent('critical coverage gap')

    await user.click(screen.getByRole('button', { name: 'Test this risk' }))
    expect(await screen.findByRole('heading', { name: 'Test a change before it happens' })).toBeInTheDocument()
    expect(await screen.findByLabelText('Production Deployment baseline and impact graph')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Production Deployment.*would block/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.contextMenu(screen.getByLabelText(/Member Maya Singh.*context menu/))
    expect(screen.getByRole('menu', { name: 'What-if actions for Maya Singh' })).toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: 'Test losing Release Manager' }))
    expect(await screen.findByText('This responsibility is now blocked')).toBeInTheDocument()
    expect(screen.getByText(/Maya Singh was the only eligible holder/)).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'A workflow would be blocked' })).toBeInTheDocument()
    expect(screen.getByLabelText('Production Deployment baseline and impact graph')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset to baseline' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Organization map' }))
    const inventory = screen.getByLabelText('Organization inventory')
    await user.click(within(inventory).getByRole('button', { name: /Production Deployment/ }))
    await user.click(within(inventory).getByRole('button', { name: 'Delete object' }))
    const dialog = screen.getByRole('dialog', { name: 'Remove Production Deployment?' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete object' }))
    expect(await screen.findByText('Workflow deleted')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add Member' }))
    await user.type(screen.getByLabelText('Member name'), 'Arjun Mehta')
    await user.click(screen.getByRole('button', { name: 'Create member' }))
    expect(await screen.findByText('Member created')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add Role' }))
    await user.type(screen.getByLabelText('Role name'), 'Release Manager')
    await user.click(screen.getByRole('checkbox', { name: 'Arjun Mehta' }))
    await user.click(screen.getByRole('button', { name: 'Assign existing role' }))
    expect(await screen.findByText('Role assigned')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Detailed inventory' }))
    await user.click(screen.getByRole('button', { name: /Members/ }))
    const mayaItem = screen.getByText('Maya Singh').closest('article')
    expect(mayaItem).not.toBeNull()
    await user.click(within(mayaItem!).getByRole('button', { name: 'Edit' }))
    await user.type(screen.getByLabelText('Employee reference ID (optional)'), 'ATLAS-01')
    await user.click(screen.getByRole('button', { name: 'Save member' }))
    await user.click(screen.getByRole('button', { name: 'Organization map' }))
    expect(await screen.findByLabelText('Member Maya Singh')).toHaveTextContent('ATLAS-01')
    const mayaNode = screen.getByLabelText('Member Maya Singh').closest('.react-flow__node')
    const arjunNode = screen.getByLabelText('Member Arjun Mehta').closest('.react-flow__node')
    expect(mayaNode?.getAttribute('style')).not.toEqual(arjunNode?.getAttribute('style'))
    await user.click(screen.getByRole('button', { name: 'Detailed inventory' }))
    await user.click(screen.getByRole('button', { name: /Roles/ }))
    expect(await screen.findByText(/2 holders/)).toBeInTheDocument()
    expect(screen.getByText('Maya Singh, Arjun Mehta')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.selectOptions(screen.getByLabelText('Sensitivity'), 'CRITICAL')
    await user.click(screen.getByRole('button', { name: 'Save role and holders' }))
    expect(await screen.findByText(/CRITICAL · 2 holders/)).toBeInTheDocument()
  }, 15000)
})

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const workspaceFixture = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    slug: 'harborline-commerce',
    name: 'Harborline Commerce',
    status: 'PUBLISHED',
    currentVersion: 1,
    sourceTemplateOrganizationId: null,
    createdAt: '2026-08-12T20:00:00Z',
    updatedAt: '2026-08-12T20:00:00Z',
    counts: { teams: 5, members: 25, roles: 8, permissions: 23, capabilities: 10, workflows: 4 },
  },
]

const clonedWorkspaceFixture = {
  ...workspaceFixture[0],
  id: '90000000-0000-0000-0000-000000000001',
  slug: 'harborline-sandbox',
  name: 'Harborline Sandbox',
  status: 'DRAFT',
  currentVersion: 0,
  sourceTemplateOrganizationId: workspaceFixture[0].id,
}

const blankWorkspaceFixture = {
  ...workspaceFixture[0],
  id: '90000000-0000-0000-0000-000000000002',
  slug: 'atlas-systems',
  name: 'Atlas Systems',
  status: 'DRAFT',
  currentVersion: 0,
  sourceTemplateOrganizationId: null,
  counts: { teams: 0, members: 0, roles: 0, permissions: 0, capabilities: 0, workflows: 0 },
}

const blankCatalogFixture: DraftCatalog = {
  workspaceId: blankWorkspaceFixture.id,
  teams: [],
  members: [],
  roles: [],
  workflows: [],
}

const clonedCatalogFixture: DraftCatalog = {
  workspaceId: clonedWorkspaceFixture.id,
  teams: [
    { id: 'team-finance', name: 'Finance Operations', department: 'Finance', memberCount: 5 },
  ],
  members: [
    { id: 'member-priya', teamId: 'team-finance', employeeNumber: 'HC-001', name: 'Priya Sharma', email: 'priya@harborline.test', status: 'ACTIVE', region: 'NORTH_AMERICA', shift: 'EVENING', roleIds: ['role-approver'] },
  ],
  roles: [
    { id: 'role-approver', name: 'Finance Approver', description: 'Approves payments', sensitivity: 'CRITICAL', ownerMemberId: 'member-priya', memberCount: 1 },
  ],
  workflows: [
    { id: 'workflow-payment', name: 'Vendor Payment', criticality: 'CRITICAL', quickManaged: false, requirements: [{ id: 'requirement-payment', name: 'Approve payment', position: 1, minimumActors: 1, resilienceTarget: 1, requiredDepartment: 'Finance', requiredRegion: null, requiredShift: 'EVENING', roleIds: ['role-approver'] }] },
  ],
}

const dashboardFixture = {
  organization: {
    id: '00000000-0000-0000-0000-000000000001',
    slug: 'harborline-commerce',
    name: 'Harborline Commerce',
    baselineVersion: 1,
    contentHash: 'dbafb569ae3beaa13277897a7700ab32867675e31ee90cad74a9dc544d5c1fb4',
  },
  counts: {
    employees: 25,
    activeEmployees: 24,
    teams: 5,
    roles: 8,
    applications: 6,
    permissions: 23,
    capabilities: 10,
    workflows: 4,
  },
  workflows: [
    {
      id: '50000000-0000-0000-0000-000000000004',
      name: 'Vendor Payment',
      criticality: 'CRITICAL',
      stepCount: 3,
      ownerName: 'Olivia Park',
    },
  ],
}

const simulationFixture = {
  id: 'b0000000-0000-0000-0000-000000000002',
  parentSimulationId: null,
  organizationId: dashboardFixture.organization.id,
  baselineVersion: 1,
  createdAt: '2026-08-12T20:00:00Z',
  completedAt: '2026-08-12T20:00:00Z',
  result: {
    schemaVersion: '1.0',
    resultStatus: 'COMPLETE',
    overallSeverity: 'CRITICAL',
    executiveSummary: {
      rolesRemoved: 1,
      permissionsLost: 2,
      workflowsBlocked: 1,
      workflowsDegraded: 1,
      messageKey: 'simulation.critical',
    },
    changeSet: {
      type: 'REVOKE_EMPLOYEE_ROLE',
      employee: { id: '20000000-0000-0000-0000-000000000001', name: 'Priya Sharma' },
      role: { id: '30000000-0000-0000-0000-000000000002', name: 'Finance Approver' },
      replacementEmployee: null,
    },
    technicalImpact: {
      affectedEmployees: [],
      removedRoles: [],
      lostPermissions: [
        {
          id: 'permission-ledger-close',
          action: 'ledger.close',
          sensitivity: 'CRITICAL',
          application: { id: 'ledger-pro', name: 'LedgerPro' },
          resource: { id: 'general-ledger', name: 'General Ledger' },
        },
        {
          id: 'permission-payment-approve',
          action: 'payment.approve',
          sensitivity: 'CRITICAL',
          application: { id: 'pay-flow', name: 'PayFlow' },
          resource: { id: 'vendor-payment', name: 'Vendor Payment' },
        },
      ],
      affectedApplications: [],
      affectedResources: [],
      assignedRoles: [],
      gainedPermissions: [],
    },
    workflowImpacts: [
      {
        workflowId: 'vendor-payment',
        workflowName: 'Vendor Payment',
        criticality: 'CRITICAL',
        baselineStatus: 'OPERATIONAL',
        scenarioStatus: 'BLOCKED',
        failures: ['The evening approval step has no eligible actor.'],
        steps: [],
      },
      {
        workflowId: 'month-end-close',
        workflowName: 'Month-End Close',
        criticality: 'HIGH',
        baselineStatus: 'OPERATIONAL',
        scenarioStatus: 'DEGRADED',
        failures: ['Only one eligible actor remains for the close-period step.'],
        steps: [],
      },
    ],
    explanationPaths: [
      {
        workflowId: 'vendor-payment',
        stepId: 'approve-payment',
        outcome: 'BLOCKED',
        reason: 'No eligible evening approver remains.',
        nodes: [
          { type: 'EMPLOYEE', id: 'priya', label: 'Priya Sharma' },
          { type: 'ROLE', id: 'role', label: 'Finance Approver' },
          { type: 'PERMISSION', id: 'permission', label: 'payment.approve' },
          { type: 'CAPABILITY', id: 'capability', label: 'Approve vendor payment' },
          { type: 'WORKFLOW_STEP', id: 'step', label: 'Approve high-value payment' },
          { type: 'WORKFLOW', id: 'workflow', label: 'Vendor Payment' },
        ],
      },
    ],
    graphDiff: {
      nodes: [
        {
          id: 'employee:priya',
          type: 'EMPLOYEE',
          entityId: 'priya',
          label: 'Priya Sharma',
          state: 'UNCHANGED',
          detail: 'Source employee in the simulated access change.',
        },
        {
          id: 'role:finance-approver',
          type: 'ROLE',
          entityId: 'finance-approver',
          label: 'Finance Approver',
          state: 'REMOVED',
          detail: 'Assignment removed from Priya Sharma.',
        },
        {
          id: 'permission:payment-approve',
          type: 'PERMISSION',
          entityId: 'payment-approve',
          label: 'payment.approve',
          state: 'REMOVED',
          detail: 'Effective access is lost when the role assignment is removed.',
        },
        {
          id: 'capability:approve-payment',
          type: 'CAPABILITY',
          entityId: 'approve-payment',
          label: 'Approve vendor payment',
          state: 'BLOCKED',
          detail: 'No eligible evening approver remains.',
        },
        {
          id: 'step:approve-payment',
          type: 'WORKFLOW_STEP',
          entityId: 'approve-payment-step',
          label: 'Approve high-value payment',
          state: 'BLOCKED',
          detail: 'The approval step has no eligible actor.',
        },
        {
          id: 'workflow:vendor-payment',
          type: 'WORKFLOW',
          entityId: 'vendor-payment',
          label: 'Vendor Payment',
          state: 'BLOCKED',
          detail: 'Workflow status: OPERATIONAL -> BLOCKED.',
        },
      ],
      edges: [
        {
          id: 'priya-role',
          sourceNodeId: 'employee:priya',
          targetNodeId: 'role:finance-approver',
          relationship: 'ASSIGNED_ROLE',
          state: 'REMOVED',
        },
        {
          id: 'role-permission',
          sourceNodeId: 'role:finance-approver',
          targetNodeId: 'permission:payment-approve',
          relationship: 'GRANTS_PERMISSION',
          state: 'REMOVED',
        },
        {
          id: 'permission-capability',
          sourceNodeId: 'permission:payment-approve',
          targetNodeId: 'capability:approve-payment',
          relationship: 'ENABLES_CAPABILITY',
          state: 'BLOCKED',
        },
        {
          id: 'capability-step',
          sourceNodeId: 'capability:approve-payment',
          targetNodeId: 'step:approve-payment',
          relationship: 'REQUIRED_BY_STEP',
          state: 'BLOCKED',
        },
        {
          id: 'step-workflow',
          sourceNodeId: 'step:approve-payment',
          targetNodeId: 'workflow:vendor-payment',
          relationship: 'PART_OF_WORKFLOW',
          state: 'BLOCKED',
        },
      ],
    },
    recommendations: [
      {
        id: 'c0000000-0000-0000-0000-000000000001',
        rank: 1,
        action: 'ASSIGN_ROLE_TO_EMPLOYEE',
        candidate: { id: '20000000-0000-0000-0000-000000000002', name: 'Bob Chen' },
        role: { id: '30000000-0000-0000-0000-000000000002', name: 'Finance Approver' },
        gainedPermissions: [
          {
            id: 'permission-ledger-close',
            action: 'ledger.close',
            sensitivity: 'CRITICAL',
            application: { id: 'ledger-pro', name: 'LedgerPro' },
            resource: { id: 'general-ledger', name: 'General Ledger' },
          },
          {
            id: 'permission-payment-approve',
            action: 'payment.approve',
            sensitivity: 'CRITICAL',
            application: { id: 'ledger-pro', name: 'LedgerPro' },
            resource: { id: 'vendor-payment', name: 'Payments' },
          },
        ],
        existingApplicationAccess: [{ id: 'ledger-pro', name: 'LedgerPro' }],
        restoredWorkflows: [
          { id: 'month-end-close', name: 'Month-End Close' },
          { id: 'vendor-payment', name: 'Vendor Payment' },
        ],
        restoredWorkflowSteps: [],
        evidence: [
          'ACTIVE_EMPLOYEE',
          'EXISTING_RELEVANT_APPLICATION_ACCESS',
          'AFFECTED_STEP_CONSTRAINTS_SATISFIED',
          'DIFFERENT_ACTORS_SATISFIED',
          'WORSENED_WORKFLOWS_RESTORED',
          'NO_WORKFLOW_WORSENED',
        ],
      },
    ],
    excludedCandidateReasons: [
      {
        candidate: { id: 'olivia', name: 'Olivia Park' },
        reasons: [{ code: 'CURRENT_ROLE_HOLDER', detail: 'The role is already assigned to this employee.' }],
      },
    ],
    diagnostics: {
      engineVersion: '1.0.0',
      resultHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    },
  },
}

const customDraftImpactFixture = {
  ...simulationFixture.result,
  baselineVersion: 0,
  changeSet: {
    type: 'REVOKE_EMPLOYEE_ROLE',
    employee: { id: 'member-1', name: 'Maya Singh' },
    role: { id: 'role-1', name: 'Release Manager' },
    replacementEmployee: null,
  },
  executiveSummary: {
    ...simulationFixture.result.executiveSummary,
    workflowsBlocked: 1,
    workflowsDegraded: 0,
  },
  workflowImpacts: [
    {
      ...simulationFixture.result.workflowImpacts[0],
      workflowId: 'workflow-1',
      workflowName: 'Production Deployment',
      scenarioStatus: 'BLOCKED',
    },
  ],
}

const mitigationFixture = {
  ...simulationFixture,
  id: 'b0000000-0000-0000-0000-000000000003',
  parentSimulationId: simulationFixture.id,
  result: {
    ...simulationFixture.result,
    overallSeverity: 'LOW',
    executiveSummary: {
      ...simulationFixture.result.executiveSummary,
      workflowsBlocked: 0,
      workflowsDegraded: 0,
      messageKey: 'simulation.revoke-role.low',
    },
    changeSet: {
      ...simulationFixture.result.changeSet,
      type: 'REVOKE_EMPLOYEE_ROLE_AND_ASSIGN_REPLACEMENT',
      replacementEmployee: { id: '20000000-0000-0000-0000-000000000002', name: 'Bob Chen' },
    },
    technicalImpact: {
      ...simulationFixture.result.technicalImpact,
      assignedRoles: [simulationFixture.result.changeSet.role],
      gainedPermissions: simulationFixture.result.recommendations[0].gainedPermissions,
    },
    workflowImpacts: simulationFixture.result.workflowImpacts.map((workflow) => ({
      ...workflow,
      scenarioStatus: 'OPERATIONAL',
      failures: [],
    })),
    explanationPaths: [],
    graphDiff: {
      nodes: [
        ...simulationFixture.result.graphDiff.nodes.map((node) => (
          node.type === 'EMPLOYEE'
            ? node
            : { ...node, state: 'RESTORED', detail: `${node.label} is restored by the replacement assignment.` }
        )),
        {
          id: 'employee:bob',
          type: 'EMPLOYEE',
          entityId: 'bob',
          label: 'Bob Chen',
          state: 'ADDED',
          detail: 'Replacement employee selected by the tested mitigation.',
        },
      ],
      edges: [
        simulationFixture.result.graphDiff.edges[0],
        {
          id: 'bob-role',
          sourceNodeId: 'employee:bob',
          targetNodeId: 'role:finance-approver',
          relationship: 'ASSIGNED_ROLE',
          state: 'ADDED',
        },
        ...simulationFixture.result.graphDiff.edges.slice(1).map((edge) => ({
          ...edge,
          state: 'RESTORED',
        })),
      ],
    },
    recommendations: [],
    excludedCandidateReasons: [],
    diagnostics: {
      engineVersion: '1.1.0',
      resultHash: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    },
  },
}
