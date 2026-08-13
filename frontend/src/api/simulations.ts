export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'
export type WorkflowStatus = 'OPERATIONAL' | 'DEGRADED' | 'BLOCKED'
export type GraphState = 'UNCHANGED' | 'REMOVED' | 'ADDED' | 'DEGRADED' | 'BLOCKED' | 'RESTORED'
export type GraphNodeType = 'EMPLOYEE' | 'ROLE' | 'PERMISSION' | 'CAPABILITY' | 'WORKFLOW_STEP' | 'WORKFLOW'

type EntityRef = {
  id: string
  name: string
}

export type Simulation = {
  id: string
  parentSimulationId: string | null
  organizationId: string
  baselineVersion: number
  createdAt: string
  completedAt: string
  result: {
    schemaVersion: string
    resultStatus: 'COMPLETE' | 'INCONCLUSIVE'
    overallSeverity: Severity
    executiveSummary: {
      rolesRemoved: number
      permissionsLost: number
      workflowsBlocked: number
      workflowsDegraded: number
      messageKey: string
    }
    changeSet: {
      type: 'REVOKE_EMPLOYEE_ROLE' | 'REVOKE_EMPLOYEE_ROLE_AND_ASSIGN_REPLACEMENT'
      employee: EntityRef
      role: EntityRef
      replacementEmployee: EntityRef | null
    }
    technicalImpact: {
      affectedEmployees: EntityRef[]
      removedRoles: EntityRef[]
      lostPermissions: Array<{
        id: string
        action: string
        sensitivity: Severity
        application: EntityRef
        resource: EntityRef
      }>
      affectedApplications: EntityRef[]
      affectedResources: EntityRef[]
      assignedRoles: EntityRef[]
      gainedPermissions: Array<{
        id: string
        action: string
        sensitivity: Severity
        application: EntityRef
        resource: EntityRef
      }>
    }
    workflowImpacts: Array<{
      workflowId: string
      workflowName: string
      criticality: Exclude<Severity, 'NONE'>
      baselineStatus: WorkflowStatus
      scenarioStatus: WorkflowStatus
      failures: string[]
      steps: Array<{
        stepId: string
        stepKey: string
        stepName: string
        minimumActors: number
        resilienceTarget: number
        baselineStatus: WorkflowStatus
        scenarioStatus: WorkflowStatus
        baselineEligibleActors: EntityRef[]
        scenarioEligibleActors: EntityRef[]
        consequence: string
      }>
    }>
    explanationPaths: Array<{
      workflowId: string
      stepId: string
      outcome: WorkflowStatus
      reason: string
      nodes: Array<{
        type: 'EMPLOYEE' | 'ROLE' | 'PERMISSION' | 'CAPABILITY' | 'WORKFLOW_STEP' | 'WORKFLOW'
        id: string
        label: string
      }>
    }>
    graphDiff: {
      nodes: Array<{
        id: string
        type: GraphNodeType
        entityId: string
        label: string
        state: GraphState
        detail: string
      }>
      edges: Array<{
        id: string
        sourceNodeId: string
        targetNodeId: string
        relationship: 'ASSIGNED_ROLE' | 'GRANTS_PERMISSION' | 'ENABLES_CAPABILITY' | 'REQUIRED_BY_STEP' | 'PART_OF_WORKFLOW'
        state: GraphState
      }>
    }
    recommendations: Array<{
      id: string
      rank: number
      action: 'ASSIGN_ROLE_TO_EMPLOYEE'
      candidate: EntityRef
      role: EntityRef
      gainedPermissions: Array<{
        id: string
        action: string
        sensitivity: Severity
        application: EntityRef
        resource: EntityRef
      }>
      existingApplicationAccess: EntityRef[]
      restoredWorkflows: EntityRef[]
      restoredWorkflowSteps: EntityRef[]
      evidence: Array<
        | 'ACTIVE_EMPLOYEE'
        | 'EXISTING_RELEVANT_APPLICATION_ACCESS'
        | 'AFFECTED_STEP_CONSTRAINTS_SATISFIED'
        | 'DIFFERENT_ACTORS_SATISFIED'
        | 'WORSENED_WORKFLOWS_RESTORED'
        | 'NO_WORKFLOW_WORSENED'
      >
    }>
    excludedCandidateReasons: Array<{
      candidate: EntityRef
      reasons: Array<{
        code: string
        detail: string
      }>
    }>
    diagnostics: {
      engineVersion: string
      resultHash: string
    }
  }
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''

const primaryScenario = {
  schemaVersion: '1.0',
  organizationId: '00000000-0000-0000-0000-000000000001',
  baselineVersion: 1,
  change: {
    type: 'REVOKE_EMPLOYEE_ROLE',
    employeeId: '20000000-0000-0000-0000-000000000001',
    roleId: '30000000-0000-0000-0000-000000000002',
  },
} as const

export async function runPrimarySimulation(): Promise<Simulation> {
  const response = await fetch(`${apiBaseUrl}/api/v1/simulations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(primaryScenario),
  })

  if (!response.ok) {
    throw new Error(`Simulation request failed with status ${response.status}`)
  }

  return response.json() as Promise<Simulation>
}

export async function runMitigationBranch(
  simulationId: string,
  recommendationId: string,
): Promise<Simulation> {
  const response = await fetch(`${apiBaseUrl}/api/v1/simulations/${simulationId}/branches`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `mitigation-${simulationId}-${recommendationId}`,
    },
    body: JSON.stringify({ recommendationId }),
  })

  if (!response.ok) {
    throw new Error(`Mitigation request failed with status ${response.status}`)
  }

  return response.json() as Promise<Simulation>
}
