import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { DraftCatalog } from './api/draftCatalog'
import type { DraftContinuityRisk, DraftImpactResult, DraftMitigationPreview } from './api/draftImpact'
import type { Simulation } from './api/simulations'

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

  it('creates an inventory role with its complete holder set in one role request', async () => {
    const user = userEvent.setup()
    const requests = mockEditableClone(clonedCatalogFixture)

    renderApp()
    await user.click(await screen.findByRole('button', { name: 'Clone and customize' }))
    await user.click(await screen.findByRole('button', { name: 'Detailed inventory' }))
    await user.click(screen.getByRole('button', { name: /Roles/ }))
    await user.type(screen.getByLabelText('Role name'), 'Release Manager')
    await user.type(screen.getByLabelText('Description'), 'Approves production releases')
    await user.click(screen.getByRole('checkbox', { name: 'Priya Sharma' }))
    await user.click(screen.getByRole('button', { name: 'Add shared role & continue' }))

    expect((await screen.findAllByText(/Release Manager/)).length).toBeGreaterThan(0)
    expect(requests.roleRequests.filter((request) => request.method === 'POST')).toHaveLength(1)
    expect(requests.roleRequests.filter((request) => request.method === 'POST')[0].body.holderMemberIds).toEqual(['member-priya'])
    expect(requests.memberRoleRequests).toEqual([])
  })

  it('updates an inventory role with its complete holder set in one role request', async () => {
    const user = userEvent.setup()
    const requests = mockEditableClone(clonedCatalogFixture)

    renderApp()
    await user.click(await screen.findByRole('button', { name: 'Clone and customize' }))
    await user.click(await screen.findByRole('button', { name: 'Detailed inventory' }))
    await user.click(screen.getByRole('button', { name: /Roles/ }))
    const financeRole = screen.getByText('Finance Approver', { selector: 'strong' }).closest('article')
    expect(financeRole).not.toBeNull()
    await user.click(within(financeRole!).getByRole('button', { name: 'Edit' }))
    await user.selectOptions(screen.getByLabelText('Sensitivity'), 'HIGH')
    await user.click(screen.getByRole('button', { name: 'Save role and holders' }))

    expect(await screen.findByText(/HIGH · 1 holders/)).toBeInTheDocument()
    expect(requests.roleRequests.filter((request) => request.method === 'PUT')).toHaveLength(1)
    expect(requests.roleRequests.filter((request) => request.method === 'PUT')[0].body.holderMemberIds).toEqual(['member-priya'])
    expect(requests.memberRoleRequests).toEqual([])
  })

  it('quick-creates a map role with its complete holder set in one role request', async () => {
    const user = userEvent.setup()
    const requests = mockEditableClone(clonedCatalogFixture)

    renderApp()
    await user.click(await screen.findByRole('button', { name: 'Clone and customize' }))
    await user.click(await screen.findByRole('button', { name: 'Add Role' }))
    await user.type(screen.getByLabelText('Role name'), 'Release Manager')
    await user.click(screen.getByRole('checkbox', { name: 'Priya Sharma' }))
    await user.click(screen.getByRole('button', { name: 'Create role' }))

    expect(await screen.findByText('Role created')).toBeInTheDocument()
    expect(requests.roleRequests.filter((request) => request.method === 'POST')).toHaveLength(1)
    expect(requests.roleRequests.filter((request) => request.method === 'POST')[0].body.holderMemberIds).toEqual(['member-priya'])
    expect(requests.memberRoleRequests).toEqual([])
  })

  it('reuses a map role with its complete holder set in one role request', async () => {
    const user = userEvent.setup()
    const requests = mockEditableClone(clonedCatalogFixture)

    renderApp()
    await user.click(await screen.findByRole('button', { name: 'Clone and customize' }))
    await user.click(await screen.findByRole('button', { name: 'Add Role' }))
    await user.type(screen.getByLabelText('Role name'), 'Finance Approver')
    expect(screen.getByRole('checkbox', { name: 'Priya Sharma' })).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Assign existing role' }))

    expect(await screen.findByText('Role assigned')).toBeInTheDocument()
    expect(requests.roleRequests.filter((request) => request.method === 'PUT')).toHaveLength(1)
    expect(requests.roleRequests.filter((request) => request.method === 'PUT')[0].body.holderMemberIds).toEqual(['member-priya'])
    expect(requests.memberRoleRequests).toEqual([])
  })

  it('preselects current holders before reusing a map role', async () => {
    const user = userEvent.setup()
    mockEditableClone(clonedCatalogFixture)

    renderApp()
    await user.click(await screen.findByRole('button', { name: 'Clone and customize' }))
    await user.click(await screen.findByRole('button', { name: 'Add Role' }))
    await user.type(screen.getByLabelText('Role name'), 'Finance Approver')

    expect(screen.getByRole('checkbox', { name: 'Priya Sharma' })).toBeChecked()
  })

  it('opens impact testing after a deferred continuity projection resolves', async () => {
    const user = userEvent.setup()
    const projection = deferred<Response>()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = input.toString()
      if (url.endsWith('/api/v1/workspaces') && !init?.method) return jsonResponse(workspaceFixture)
      if (url.endsWith('/clones') && init?.method === 'POST') return jsonResponse(clonedWorkspaceFixture, 201)
      if (url.endsWith('/catalog')) return jsonResponse(clonedCatalogFixture)
      if (url.endsWith('/impact-previews/continuity') && !init?.method) return projection.promise
      return new Response(null, { status: 404 })
    })

    renderApp()
    await user.click(await screen.findByRole('button', { name: 'Clone and customize' }))
    await user.click(await screen.findByRole('button', { name: 'Test impact' }))
    expect(await screen.findByRole('heading', { name: 'Loading continuity analysis' })).toBeInTheDocument()

    projection.resolve(jsonResponse(clonedContinuityFixture))

    expect(await screen.findByRole('heading', { name: 'Test impact map' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Vendor Payment.*would block/ })).toBeInTheDocument()
  })

  it('opens impact testing after retrying a failed continuity projection', async () => {
    const user = userEvent.setup()
    let continuityAttempts = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = input.toString()
      if (url.endsWith('/api/v1/workspaces') && !init?.method) return jsonResponse(workspaceFixture)
      if (url.endsWith('/clones') && init?.method === 'POST') return jsonResponse(clonedWorkspaceFixture, 201)
      if (url.endsWith('/catalog')) return jsonResponse(clonedCatalogFixture)
      if (url.endsWith('/impact-previews/continuity') && !init?.method) {
        continuityAttempts += 1
        return continuityAttempts === 1
          ? jsonResponse({ message: 'Continuity service is unavailable' }, 503)
          : jsonResponse(clonedContinuityFixture)
      }
      return new Response(null, { status: 404 })
    })

    renderApp()
    await user.click(await screen.findByRole('button', { name: 'Clone and customize' }))
    await user.click(await screen.findByRole('button', { name: 'Test impact' }))
    expect(await screen.findByRole('heading', { name: 'Continuity analysis is unavailable' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry continuity analysis' }))

    expect(await screen.findByRole('heading', { name: 'Test impact map' })).toBeInTheDocument()
    expect(continuityAttempts).toBe(2)
  })

  it('builds a blank draft through teams, members, workflows, impact testing, and shared roles', async () => {
    const user = userEvent.setup()
    let catalog: DraftCatalog = structuredClone(blankCatalogFixture)
    let continuityRequests = 0
    const roleRequests: Array<{ method: string; body: { holderMemberIds?: string[] } }> = []
    const memberRoleRequests: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = input.toString()
      if (url.endsWith('/api/v1/workspaces') && !init?.method) return jsonResponse(workspaceFixture)
      if (url.endsWith('/api/v1/workspaces') && init?.method === 'POST') return jsonResponse(blankWorkspaceFixture, 201)
      if (url.endsWith('/catalog') && !init?.method) return jsonResponse(catalog)
      if (url.endsWith('/impact-previews/continuity') && !init?.method) {
        continuityRequests += 1
        return jsonResponse(catalog.workflows.length === 0 ? [] : customDraftContinuityFixture)
      }
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
        const input = JSON.parse(String(init.body)) as { name: string; description: string; sensitivity: DraftCatalog['roles'][number]['sensitivity']; ownerMemberId: string | null; holderMemberIds?: string[] }
        roleRequests.push({ method: 'POST', body: input })
        catalog = applyRoleHolders({ ...catalog, roles: [{ id: 'role-1', name: input.name, description: input.description, sensitivity: input.sensitivity, ownerMemberId: input.ownerMemberId, memberCount: 0 }] }, 'role-1', input.holderMemberIds)
        return jsonResponse(catalog)
      }
      if (url.endsWith('/catalog/members/member-1') && init?.method === 'PUT') {
        const input = JSON.parse(String(init.body)) as Omit<DraftCatalog['members'][number], 'id' | 'roleIds'>
        catalog = { ...catalog, members: catalog.members.map((member) => member.id === 'member-1' ? { ...member, ...input } : member) }
        return jsonResponse(catalog)
      }
      if (url.endsWith('/catalog/roles/role-1') && init?.method === 'PUT') {
        const input = JSON.parse(String(init.body)) as { name: string; description: string; sensitivity: DraftCatalog['roles'][number]['sensitivity']; ownerMemberId: string | null; holderMemberIds?: string[] }
        roleRequests.push({ method: 'PUT', body: input })
        catalog = applyRoleHolders({ ...catalog, roles: [{ ...catalog.roles[0], ...input }] }, 'role-1', input.holderMemberIds)
        return jsonResponse(catalog)
      }
      if (url.match(/\/members\/[^/]+\/roles$/) && init?.method === 'PUT') {
        const memberId = url.match(/\/members\/([^/]+)\/roles$/)![1]
        memberRoleRequests.push(memberId)
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
      if (url.endsWith('/impact-previews/mitigations') && init?.method === 'POST') return jsonResponse(customDraftMitigationPreviewFixture)
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
    expect(await screen.findByRole('button', { name: 'Add Member' })).toBeDisabled()

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

    await user.click(screen.getByRole('button', { name: 'Add Member' }))
    await user.type(screen.getByLabelText('Member name'), 'Arjun Mehta')
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
    expect(roleRequests.filter((request) => request.method === 'POST')).toHaveLength(1)
    expect(roleRequests.filter((request) => request.method === 'POST')[0].body.holderMemberIds).toEqual(['member-1'])
    expect(memberRoleRequests).toHaveLength(0)

    expect(within(screen.getByLabelText('Organization inventory')).queryByRole('button', { name: 'Delete object' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Build Workflow' }))
    expect(await screen.findByRole('heading', { name: 'Create a workflow' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Workflow name'), 'Production Deployment')
    await user.selectOptions(screen.getByLabelText('Business criticality'), 'CRITICAL')
    await user.type(screen.getByLabelText('Responsibility or step'), 'Release Manager responsibility')
    const continuityRequestsBeforeWorkflow = continuityRequests
    await user.click(screen.getByRole('button', { name: 'Create workflow' }))
    expect(await screen.findByText(/CRITICAL · 1 role responsibilities/)).toBeInTheDocument()
    expect(continuityRequests).toBeGreaterThan(continuityRequestsBeforeWorkflow)
    await user.click(screen.getByRole('button', { name: 'Organization map' }))
    expect(screen.getByLabelText('Organization inventory')).toHaveTextContent('Production Deployment')
    expect(screen.getByLabelText('Organization relationship canvas')).toBeInTheDocument()
    expect(screen.getByText('6 objects · 5 connections')).toBeInTheDocument()
    expect(screen.getByLabelText('Team Platform')).toBeInTheDocument()
    expect(screen.getByLabelText('Member Maya Singh')).toBeInTheDocument()
    expect(screen.getByLabelText('Member Arjun Mehta')).toBeInTheDocument()
    expect(screen.getByLabelText('Role Release Manager')).toBeInTheDocument()
    expect(screen.getByLabelText('Responsibility Release Manager responsibility')).toBeInTheDocument()
    expect(screen.getByLabelText('Workflow Production Deployment')).toBeInTheDocument()
    expect(screen.getByLabelText('Continuity risks found')).toHaveTextContent('critical coverage gap')

    const graphInventory = screen.getByLabelText('Organization inventory')
    await user.click(within(graphInventory).getByRole('button', { name: 'Role' }))
    await user.click(within(graphInventory).getByRole('button', { name: /Release Manager/ }))
    expect(within(graphInventory).getByRole('button', { name: 'Delete object' })).toBeInTheDocument()
    fireEvent.click(document.querySelector('.react-flow__pane')!)
    expect(within(graphInventory).queryByRole('button', { name: 'Delete object' })).not.toBeInTheDocument()

    await user.click(within(graphInventory).getByRole('button', { name: 'Workflow' }))
    await user.click(within(graphInventory).getByRole('button', { name: /Production Deployment/ }))
    await user.click(within(graphInventory).getByRole('button', { name: 'Edit workflow' }))
    expect(await screen.findByRole('heading', { name: 'Create a workflow' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Organization map' }))

    await user.click(screen.getByRole('button', { name: 'Test this risk' }))
    expect(await screen.findByRole('heading', { name: 'Test a change before it happens' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Test impact map' })).toBeInTheDocument()
    expect(await screen.findByLabelText('Complete organization impact map')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show full map' }))
    expect(screen.getByRole('button', { name: 'Focus Production Deployment' })).toBeInTheDocument()
    expect(screen.getByLabelText(/member Maya Singh/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/member Arjun Mehta/i)).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText(/team Platform/i))
    expect(screen.getByLabelText('Selected Team Platform')).toHaveTextContent('Connected workflows')
    fireEvent.click(screen.getByLabelText(/workflow Production Deployment/i))
    expect(screen.getByLabelText('Selected Workflow Production Deployment')).toHaveTextContent('highlighted graph')
    fireEvent.click(screen.getByLabelText(/responsibility Release Manager responsibility/i))
    expect(screen.getByLabelText('Selected Responsibility Release Manager responsibility')).toHaveTextContent('Eligible now')
    fireEvent.click(screen.getByLabelText(/role Release Manager/i))
    expect(screen.getByLabelText('Selected Role Release Manager')).toHaveTextContent('Workflow responsibilities')
    expect(screen.getByRole('button', { name: 'Fit selection' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(screen.queryByRole('button', { name: 'Fit selection' })).not.toBeInTheDocument()
    const mayaImpactActions = document.querySelector<HTMLButtonElement>('button[aria-label="Impact actions for Maya Singh"]')
    const arjunImpactActions = document.querySelector<HTMLButtonElement>('button[aria-label="Impact actions for Arjun Mehta"]')
    expect(mayaImpactActions).toBeInTheDocument()
    expect(arjunImpactActions).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Production Deployment.*would block/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByLabelText(/member Maya Singh/i))
    const selectedMaya = screen.getByLabelText('Selected Member Maya Singh')
    expect(selectedMaya).toHaveTextContent('Connected workflows')
    await user.click(within(selectedMaya).getByRole('button', { name: 'Test losing Release Manager' }))
    expect(await screen.findAllByText('This workflow would be blocked')).not.toHaveLength(0)
    expect(screen.getByText(/the impact engine finds 2 eligible actors/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Production Deployment.*would block/ }))
    expect(screen.getAllByText('This workflow would be blocked')).not.toHaveLength(0)
    expect(await screen.findByRole('heading', { name: 'A workflow would be blocked' })).toBeInTheDocument()
    expect(screen.getByLabelText('Complete organization impact map')).toBeInTheDocument()
    expect(screen.getByLabelText(/member Arjun Mehta.*Recommended #1/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset to baseline' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Test a safe replacement' })).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText(/member Arjun Mehta.*Recommended #1/i))
    const selectedArjun = screen.getByLabelText('Selected Member Arjun Mehta')
    await user.click(within(selectedArjun).getByRole('button', { name: 'Try as replacement for Release Manager' }))
    expect(await screen.findByLabelText('Original and mitigated outcome')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /With mitigation.*Coverage restored/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'Arjun Mehta is a recommended replacement' })).toBeInTheDocument()
    expect(screen.getByLabelText(/member Arjun Mehta.*Tried · restores coverage/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Original impact.*1 blocked/ }))
    expect(screen.getByRole('button', { name: /Original impact.*1 blocked/ })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'Organization map' }))
    const inventory = screen.getByLabelText('Organization inventory')
    await user.click(within(inventory).getByRole('button', { name: /Production Deployment/ }))
    await user.click(within(inventory).getByRole('button', { name: 'Delete object' }))
    const dialog = screen.getByRole('dialog', { name: 'Remove Production Deployment?' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete object' }))
    expect(await screen.findByText('Workflow deleted')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add Role' }))
    await user.type(screen.getByLabelText('Role name'), 'Release Manager')
    await user.click(screen.getByRole('checkbox', { name: 'Arjun Mehta' }))
    await user.click(screen.getByRole('button', { name: 'Assign existing role' }))
    expect(await screen.findByText('Role assigned')).toBeInTheDocument()
    expect(roleRequests.filter((request) => request.method === 'PUT')).toHaveLength(1)
    expect(roleRequests.filter((request) => request.method === 'PUT')[0].body.holderMemberIds).toEqual(['member-1', 'member-2'])
    expect(memberRoleRequests).toHaveLength(0)

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
    const memberRoleRequestsBeforeRoleEdit = memberRoleRequests.length
    await user.click(screen.getByRole('button', { name: 'Detailed inventory' }))
    await user.click(screen.getByRole('button', { name: /Roles/ }))
    expect(await screen.findByText(/2 holders/)).toBeInTheDocument()
    expect(screen.getByText('Maya Singh, Arjun Mehta')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.selectOptions(screen.getByLabelText('Sensitivity'), 'CRITICAL')
    await user.click(screen.getByRole('button', { name: 'Save role and holders' }))
    expect(await screen.findByText(/CRITICAL · 2 holders/)).toBeInTheDocument()
    expect(roleRequests.filter((request) => request.method === 'PUT')).toHaveLength(2)
    expect(roleRequests.at(-1)).toEqual({ method: 'PUT', body: expect.objectContaining({ holderMemberIds: ['member-1', 'member-2'] }) })
    expect(memberRoleRequests).toHaveLength(memberRoleRequestsBeforeRoleEdit)
  }, 15000)
})

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function applyRoleHolders(catalog: DraftCatalog, roleId: string, holderMemberIds?: string[]) {
  if (holderMemberIds === undefined) return catalog
  const holderIds = new Set(holderMemberIds)
  const members = catalog.members.map((member) => ({
    ...member,
    roleIds: holderIds.has(member.id)
      ? [...new Set([...member.roleIds, roleId])]
      : member.roleIds.filter((id) => id !== roleId),
  }))
  return {
    ...catalog,
    members,
    roles: catalog.roles.map((role) => ({ ...role, memberCount: members.filter((member) => member.roleIds.includes(role.id)).length })),
  }
}

type RoleMutationRequest = {
  method: 'POST' | 'PUT'
  body: {
    name: string
    description: string
    sensitivity: DraftCatalog['roles'][number]['sensitivity']
    ownerMemberId: string | null
    holderMemberIds?: string[]
  }
}

function mockEditableClone(initialCatalog: DraftCatalog) {
  let catalog = structuredClone(initialCatalog)
  const roleRequests: RoleMutationRequest[] = []
  const memberRoleRequests: string[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = input.toString()
    if (url.endsWith('/api/v1/workspaces') && !init?.method) return jsonResponse(workspaceFixture)
    if (url.endsWith('/clones') && init?.method === 'POST') return jsonResponse(clonedWorkspaceFixture, 201)
    if (url.endsWith('/catalog') && !init?.method) return jsonResponse(catalog)
    if (url.endsWith('/impact-previews/continuity') && !init?.method) return jsonResponse([])
    if (url.endsWith('/catalog/roles') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as RoleMutationRequest['body']
      roleRequests.push({ method: 'POST', body })
      catalog = applyRoleHolders({
        ...catalog,
        roles: [...catalog.roles, { id: 'role-release', name: body.name, description: body.description, sensitivity: body.sensitivity, ownerMemberId: body.ownerMemberId, memberCount: 0 }],
      }, 'role-release', body.holderMemberIds)
      return jsonResponse(catalog)
    }
    const roleMatch = url.match(/\/catalog\/roles\/([^/]+)$/)
    if (roleMatch && init?.method === 'PUT') {
      const body = JSON.parse(String(init.body)) as RoleMutationRequest['body']
      const roleId = roleMatch[1]
      roleRequests.push({ method: 'PUT', body })
      catalog = applyRoleHolders({
        ...catalog,
        roles: catalog.roles.map((role) => role.id === roleId ? {
          ...role,
          name: body.name,
          description: body.description,
          sensitivity: body.sensitivity,
          ownerMemberId: body.ownerMemberId,
        } : role),
      }, roleId, body.holderMemberIds)
      return jsonResponse(catalog)
    }
    if (url.match(/\/members\/[^/]+\/roles$/) && init?.method === 'PUT') {
      memberRoleRequests.push(url)
      return jsonResponse(catalog)
    }
    return new Response(null, { status: 404 })
  })
  return { roleRequests, memberRoleRequests }
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

const clonedContinuityFixture: DraftContinuityRisk[] = [
  {
    key: 'workflow-payment:requirement-payment:role-approver',
    workflowId: 'workflow-payment',
    workflowName: 'Vendor Payment',
    criticality: 'CRITICAL',
    requirementId: 'requirement-payment',
    requirementName: 'Approve payment',
    minimumActors: 1,
    resilienceTarget: 1,
    roleId: 'role-approver',
    roleName: 'Finance Approver',
    eligibleMembers: [{ id: 'member-priya', name: 'Priya Sharma' }],
    members: [{
      id: 'member-priya',
      name: 'Priya Sharma',
      eligible: true,
      losesCoverage: true,
      remainingEligibleActorCount: 0,
      scenarioStatus: 'BLOCKED',
    }],
  },
]

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

const customDraftImpactFixture: DraftImpactResult = {
  ...(simulationFixture.result as Simulation['result']),
  organizationId: 'workspace-1',
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
      ...(simulationFixture.result.workflowImpacts[0] as DraftImpactResult['workflowImpacts'][number]),
      workflowId: 'workflow-1',
      workflowName: 'Production Deployment',
      scenarioStatus: 'BLOCKED',
      steps: [
        {
          stepId: 'requirement-1',
          stepKey: 'release_manager_responsibility_1',
          stepName: 'Release Manager responsibility',
          minimumActors: 1,
          resilienceTarget: 1,
          baselineStatus: 'OPERATIONAL',
          scenarioStatus: 'BLOCKED',
          baselineEligibleActors: [{ id: 'member-1', name: 'Maya Singh' }],
          scenarioEligibleActors: [],
          consequence: 'Release Manager responsibility has no eligible actors.',
        },
      ],
    },
  ],
  recommendations: [
    {
      ...(simulationFixture.result.recommendations[0] as DraftImpactResult['recommendations'][number]),
      id: 'recommendation-1',
      candidate: { id: 'member-2', name: 'Arjun Mehta' },
      role: { id: 'role-1', name: 'Release Manager' },
      restoredWorkflows: [{ id: 'workflow-1', name: 'Production Deployment' }],
      restoredWorkflowSteps: [{ id: 'requirement-1', name: 'Release Manager responsibility' }],
    },
  ],
  excludedCandidateReasons: [],
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

const customDraftContinuityFixture: DraftContinuityRisk[] = [
  {
    key: 'workflow-1:requirement-1:role-1',
    workflowId: 'workflow-1',
    workflowName: 'Production Deployment',
    criticality: 'CRITICAL',
    requirementId: 'requirement-1',
    requirementName: 'Release Manager responsibility',
    minimumActors: 1,
    resilienceTarget: 1,
    roleId: 'role-1',
    roleName: 'Release Manager',
    // The supplied BLOCKED verdict is authoritative even with two baseline actors.
    eligibleMembers: [
      { id: 'member-1', name: 'Maya Singh' },
      { id: 'member-2', name: 'Arjun Mehta' },
    ],
    members: [
      {
        id: 'member-1',
        name: 'Maya Singh',
        eligible: true,
        losesCoverage: false,
        remainingEligibleActorCount: 2,
        scenarioStatus: 'BLOCKED',
      },
    ],
  },
]

const customDraftMitigationPreviewFixture: DraftMitigationPreview = {
  original: customDraftImpactFixture,
  mitigation: {
    ...customDraftImpactFixture,
    overallSeverity: 'LOW',
    executiveSummary: {
      ...customDraftImpactFixture.executiveSummary,
      workflowsBlocked: 0,
      workflowsDegraded: 0,
    },
    changeSet: {
      ...customDraftImpactFixture.changeSet,
      type: 'REVOKE_EMPLOYEE_ROLE_AND_ASSIGN_REPLACEMENT',
      replacementEmployee: { id: 'member-2', name: 'Arjun Mehta' },
    },
    technicalImpact: {
      ...customDraftImpactFixture.technicalImpact,
      assignedRoles: [{ id: 'role-1', name: 'Release Manager' }],
    },
    workflowImpacts: customDraftImpactFixture.workflowImpacts.map((workflow) => ({
      ...workflow,
      scenarioStatus: 'OPERATIONAL',
      failures: [],
      steps: workflow.steps.map((step) => ({ ...step, scenarioStatus: 'OPERATIONAL' })),
    })),
    recommendations: [],
    excludedCandidateReasons: [],
  },
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
