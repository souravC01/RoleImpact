import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

afterEach(() => {
  vi.restoreAllMocks()
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
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
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
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    renderApp()

    expect(await screen.findByText(/Harborline Commerce/)).toBeInTheDocument()
    expect(screen.getByText('24')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { name: 'Month-End Close' })).not.toHaveLength(0)
    expect(screen.getByText('Immutable snapshot')).toBeInTheDocument()
  })

  it('runs the Priya scenario and verifies the recommended mitigation branch', async () => {
    const user = userEvent.setup()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input.toString()
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

    await user.click(await screen.findByRole('button', { name: 'Run impact analysis' }))

    expect(await screen.findByRole('heading', { name: 'Critical business impact' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { name: 'Vendor Payment' })).not.toHaveLength(0)
    expect(screen.getAllByRole('heading', { name: 'Month-End Close' })).not.toHaveLength(0)
    expect(screen.getAllByText('BLOCKED')).not.toHaveLength(0)
    expect(screen.getAllByText('DEGRADED')).not.toHaveLength(0)
    expect(screen.getAllByText('payment.approve', { selector: 'code' })).not.toHaveLength(0)
    expect(screen.getAllByText('ledger.close', { selector: 'code' })).not.toHaveLength(0)
    expect(screen.getAllByText('Priya Sharma')).not.toHaveLength(0)
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
  })
})

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
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
    recommendations: [],
    excludedCandidateReasons: [],
    diagnostics: {
      engineVersion: '1.1.0',
      resultHash: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    },
  },
}
