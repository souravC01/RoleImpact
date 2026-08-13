import { lazy, Suspense, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { fetchDashboard } from './api/dashboard'
import { runMitigationBranch, runPrimarySimulation } from './api/simulations'
import type { Workspace } from './api/workspaces'
import WorkspaceWelcome from './components/workspaces/WorkspaceWelcome'
import DraftWorkspace from './components/workspaces/DraftWorkspace'
import './App.css'

const ImpactGraph = lazy(() => import('./components/ImpactGraph'))

type AppView = { page: 'home' } | { page: 'example' } | { page: 'draft'; workspace: Workspace }

export default function App() {
  const [view, setView] = useState<AppView>({ page: 'home' })

  if (view.page === 'home') {
    return (
      <WorkspaceWelcome
        onExploreTemplate={() => setView({ page: 'example' })}
        onOpenDraft={(workspace) => setView({ page: 'draft', workspace })}
      />
    )
  }

  if (view.page === 'draft') {
    return <DraftWorkspace workspace={view.workspace} onBack={() => setView({ page: 'home' })} />
  }

  return <HarborlineDashboard onBack={() => setView({ page: 'home' })} />
}

function HarborlineDashboard({ onBack }: { onBack: () => void }) {
  const dashboardQuery = useQuery({
    queryKey: ['dashboard', 'harborline-commerce'],
    queryFn: ({ signal }) => fetchDashboard(signal),
    retry: 1,
  })
  const simulationMutation = useMutation({ mutationFn: runPrimarySimulation })
  const mitigationMutation = useMutation({
    mutationFn: ({ simulationId, recommendationId }: { simulationId: string; recommendationId: string }) =>
      runMitigationBranch(simulationId, recommendationId),
  })

  if (dashboardQuery.isPending) {
    return (
      <main className="centered-state" aria-live="polite">
        <span className="loader" aria-hidden="true" />
        <p>Loading the Harborline baseline…</p>
      </main>
    )
  }

  if (dashboardQuery.isError) {
    return (
      <main className="centered-state error-state" role="alert">
        <p className="eyebrow">Connection problem</p>
        <h1>We couldn’t load RoleImpact.</h1>
        <p>Make sure the API and PostgreSQL are running locally.</p>
        <button type="button" onClick={() => dashboardQuery.refetch()}>
          Retry
        </button>
      </main>
    )
  }

  const dashboard = dashboardQuery.data
  const stats = [
    {
      label: 'Active employees',
      value: dashboard.counts.activeEmployees,
      detail: `${dashboard.counts.employees} total`,
    },
    { label: 'Access roles', value: dashboard.counts.roles, detail: 'assigned across teams' },
    { label: 'Applications', value: dashboard.counts.applications, detail: 'in the access graph' },
    { label: 'Workflows', value: dashboard.counts.workflows, detail: 'ready to simulate' },
  ]

  return (
    <div className="dashboard-shell">
      <header className="topbar">
        <button className="brand brand-button" type="button" onClick={onBack} aria-label="Back to workspaces">
          <span className="brand-mark" aria-hidden="true">R</span>
          <span>RoleImpact</span>
        </button>
        <div className="baseline-chip">
          <span className="connection-dot" aria-hidden="true" />
          {dashboard.organization.name} · Dataset v{dashboard.organization.baselineVersion}
        </div>
      </header>

      <main className="dashboard-main">
        <section className="intro" aria-labelledby="page-title">
          <div>
            <p className="eyebrow">Access change impact simulator</p>
            <h1 id="page-title">See the blast radius before access changes go live.</h1>
            <p className="lede">
              Test a proposed access change against Harborline’s people, permissions,
              and business workflows before anyone is affected.
            </p>
          </div>
          <div className="scenario-card">
            <span>Primary scenario</span>
            <strong>Remove Finance Approver from Priya Sharma</strong>
            <p>Check which permissions disappear and whether Harborline can still complete critical work.</p>
            <button
              type="button"
              disabled={simulationMutation.isPending}
              onClick={() => {
                mitigationMutation.reset()
                simulationMutation.mutate()
              }}
            >
              {simulationMutation.isPending
                ? 'Analyzing impact…'
                : simulationMutation.data
                  ? 'Run analysis again'
                  : 'Run impact analysis'}
            </button>
            {simulationMutation.isError && (
              <p className="inline-error" role="alert">
                The analysis could not run. Check that the local API is available and try again.
              </p>
            )}
          </div>
        </section>

        {simulationMutation.data && (
          <section className="results-section" aria-labelledby="results-title" aria-live="polite">
            <div className="verdict-card">
              <div>
                <p className="section-kicker">Simulation complete</p>
                <h2 id="results-title">
                  {sentenceCase(simulationMutation.data.result.overallSeverity)} business impact
                </h2>
                <p>
                  Removing <strong>{simulationMutation.data.result.changeSet.role.name}</strong> from{' '}
                  <strong>{simulationMutation.data.result.changeSet.employee.name}</strong> blocks a critical
                  payment path and reduces month-end resilience.
                </p>
              </div>
              <span className={`severity-badge ${simulationMutation.data.result.overallSeverity.toLowerCase()}`}>
                {simulationMutation.data.result.overallSeverity}
              </span>
            </div>

            <div className="impact-metrics" aria-label="Impact summary">
              <article>
                <span>Role removed</span>
                <strong>{simulationMutation.data.result.executiveSummary.rolesRemoved}</strong>
              </article>
              <article>
                <span>Permissions lost</span>
                <strong>{simulationMutation.data.result.executiveSummary.permissionsLost}</strong>
              </article>
              <article className="blocked-metric">
                <span>Workflows blocked</span>
                <strong>{simulationMutation.data.result.executiveSummary.workflowsBlocked}</strong>
              </article>
              <article className="degraded-metric">
                <span>Workflows degraded</span>
                <strong>{simulationMutation.data.result.executiveSummary.workflowsDegraded}</strong>
              </article>
            </div>

            <div className="result-grid">
              <div className="result-panel">
                <div className="panel-heading">
                  <div>
                    <p className="section-kicker">Business effects</p>
                    <h3>Impacted workflows</h3>
                  </div>
                  <span>Before → after</span>
                </div>
                <div className="impact-list">
                  {simulationMutation.data.result.workflowImpacts
                    .filter((workflow) => workflow.baselineStatus !== workflow.scenarioStatus)
                    .map((workflow) => (
                      <article className="impact-row" key={workflow.workflowId}>
                        <div>
                          <h4>{workflow.workflowName}</h4>
                          <p>{workflow.failures[0] ?? 'Resilience drops below the target.'}</p>
                        </div>
                        <div className="status-transition" aria-label={`${workflow.baselineStatus} to ${workflow.scenarioStatus}`}>
                          <span className="status-pill operational">{workflow.baselineStatus}</span>
                          <span aria-hidden="true">→</span>
                          <span className={`status-pill ${workflow.scenarioStatus.toLowerCase()}`}>
                            {workflow.scenarioStatus}
                          </span>
                        </div>
                      </article>
                    ))}
                </div>
              </div>

              <aside className="result-panel technical-panel" aria-labelledby="permissions-title">
                <div className="panel-heading">
                  <div>
                    <p className="section-kicker">Access effects</p>
                    <h3 id="permissions-title">Effective permissions lost</h3>
                  </div>
                </div>
                <div className="permission-list">
                  {simulationMutation.data.result.technicalImpact.lostPermissions.map((permission) => (
                    <div className="permission-chip" key={permission.id}>
                      <code>{permission.action}</code>
                      <span>{permission.application.name} · {permission.resource.name}</span>
                    </div>
                  ))}
                </div>
              </aside>
            </div>

            <div className="explanation-panel">
              <div className="panel-heading">
                <div>
                  <p className="section-kicker">Why this happens</p>
                  <h3>Traceable explanation paths</h3>
                </div>
                <code>{simulationMutation.data.result.diagnostics.resultHash.slice(0, 12)}</code>
              </div>
              <div className="path-list">
                {simulationMutation.data.result.explanationPaths.map((path) => (
                  <article className="explanation-path" key={`${path.workflowId}-${path.stepId}`}>
                    <span className={`status-pill ${path.outcome.toLowerCase()}`}>{path.outcome}</span>
                    <div className="path-nodes">
                      {path.nodes.map((node, index) => (
                        <span className="path-node" key={`${node.type}-${node.id}`}>
                          {index > 0 && <span className="path-arrow" aria-hidden="true">→</span>}
                          <span>{node.label}</span>
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <Suspense fallback={<div className="graph-loading-state">Preparing the impact graph…</div>}>
              <ImpactGraph
                original={simulationMutation.data}
                mitigation={mitigationMutation.data}
              />
            </Suspense>

            {simulationMutation.data.result.recommendations.length > 0 && (
              <div className="mitigation-panel">
                <div className="panel-heading">
                  <div>
                    <p className="section-kicker">Recommended mitigation</p>
                    <h3>Restore the workflow without reversing Priya’s change</h3>
                  </div>
                  <span>Ranked by least additional access</span>
                </div>

                <div className="recommendation-list">
                  {simulationMutation.data.result.recommendations.map((recommendation) => (
                    <article className="recommendation-card" key={recommendation.id}>
                      <div className="recommendation-rank" aria-label={`Recommendation rank ${recommendation.rank}`}>
                        {String(recommendation.rank).padStart(2, '0')}
                      </div>
                      <div className="recommendation-copy">
                        <p className="candidate-name">Assign {recommendation.role.name} to {recommendation.candidate.name}</p>
                        <p>
                          {recommendation.candidate.name} is active, already has access to{' '}
                          {joinedNames(recommendation.existingApplicationAccess)}, and can restore{' '}
                          {joinedNames(recommendation.restoredWorkflows)} without worsening another workflow.
                        </p>
                        <div className="recommendation-evidence" aria-label="Recommendation evidence">
                          {recommendation.evidence.map((evidence) => (
                            <span key={evidence}>{evidenceLabel(evidence)}</span>
                          ))}
                        </div>
                        <div className="recommendation-access">
                          <span>Additional effective access</span>
                          {recommendation.gainedPermissions.map((permission) => (
                            <code key={permission.id}>{permission.action}</code>
                          ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={mitigationMutation.isPending}
                        onClick={() => mitigationMutation.mutate({
                          simulationId: simulationMutation.data.id,
                          recommendationId: recommendation.id,
                        })}
                      >
                        {mitigationMutation.isPending
                          ? 'Testing mitigation…'
                          : mitigationMutation.data
                            ? 'Test mitigation again'
                            : `Test ${recommendation.candidate.name.split(' ')[0]}'s mitigation`}
                      </button>
                    </article>
                  ))}
                </div>

                {mitigationMutation.isError && (
                  <p className="mitigation-error" role="alert">
                    The mitigation branch could not be tested. The original simulation is unchanged.
                  </p>
                )}

                {simulationMutation.data.result.excludedCandidateReasons.length > 0 && (
                  <details className="candidate-exclusions">
                    <summary>Why other employees were not recommended</summary>
                    <div>
                      {simulationMutation.data.result.excludedCandidateReasons.map((exclusion) => (
                        <p key={exclusion.candidate.id}>
                          <strong>{exclusion.candidate.name}:</strong>{' '}
                          {exclusion.reasons.map((reason) => reason.detail).join(' ')}
                        </p>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}

            {mitigationMutation.data && (
              <div className="comparison-panel" aria-labelledby="comparison-title" aria-live="polite">
                <div className="comparison-verdict">
                  <div>
                    <p className="section-kicker">Mitigation verified</p>
                    <h3 id="comparison-title">Workflow disruption resolved</h3>
                    <p>
                      Assigning <strong>{mitigationMutation.data.result.changeSet.role.name}</strong> to{' '}
                      <strong>{mitigationMutation.data.result.changeSet.replacementEmployee?.name}</strong>{' '}
                      restores every affected workflow. The remaining Low impact reflects the additional
                      permissions granted to the replacement employee.
                    </p>
                  </div>
                  <span className={`severity-badge ${mitigationMutation.data.result.overallSeverity.toLowerCase()}`}>
                    {mitigationMutation.data.result.overallSeverity}
                  </span>
                </div>

                <div className="comparison-table" role="table" aria-label="Original and mitigated workflow comparison">
                  <div className="comparison-row comparison-header" role="row">
                    <span role="columnheader">Workflow</span>
                    <span role="columnheader">Original scenario</span>
                    <span role="columnheader">With mitigation</span>
                  </div>
                  {simulationMutation.data.result.workflowImpacts
                    .filter((workflow) => workflow.baselineStatus !== workflow.scenarioStatus)
                    .map((workflow) => {
                      const mitigated = mitigationMutation.data.result.workflowImpacts
                        .find((candidate) => candidate.workflowId === workflow.workflowId)
                      return (
                        <div className="comparison-row" role="row" key={workflow.workflowId}>
                          <strong role="cell">{workflow.workflowName}</strong>
                          <span role="cell" className={`status-pill ${workflow.scenarioStatus.toLowerCase()}`}>
                            {workflow.scenarioStatus}
                          </span>
                          <span role="cell" className={`status-pill ${mitigated?.scenarioStatus.toLowerCase()}`}>
                            {mitigated?.scenarioStatus}
                          </span>
                        </div>
                      )
                    })}
                </div>

                <div className="comparison-footer">
                  <span>Saved as a child simulation</span>
                  <code>{mitigationMutation.data.id.slice(0, 12)}</code>
                  <span>Parent</span>
                  <code>{mitigationMutation.data.parentSimulationId?.slice(0, 12)}</code>
                </div>
              </div>
            )}
          </section>
        )}

        <section aria-labelledby="overview-title">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Live catalog</p>
              <h2 id="overview-title">Organization overview</h2>
            </div>
            <p>{dashboard.counts.teams} teams · {dashboard.counts.permissions} permissions · {dashboard.counts.capabilities} capabilities</p>
          </div>

          <div className="stat-grid">
            {stats.map((stat) => (
              <article className="stat-card" key={stat.label}>
                <p>{stat.label}</p>
                <strong>{stat.value}</strong>
                <span>{stat.detail}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="workflow-section" aria-labelledby="workflows-title">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Business context</p>
              <h2 id="workflows-title">Protected workflows</h2>
            </div>
            <p>Ordered by business criticality</p>
          </div>

          <div className="workflow-list">
            {dashboard.workflows.map((workflow, index) => (
              <article className="workflow-row" key={workflow.id}>
                <span className="workflow-index" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="workflow-name">
                  <h3>{workflow.name}</h3>
                  <p>Owner: {workflow.ownerName ?? 'Unassigned'}</p>
                </div>
                <span className={`criticality ${workflow.criticality.toLowerCase()}`}>
                  {workflow.criticality}
                </span>
                <p className="step-count">
                  <strong>{workflow.stepCount}</strong> {workflow.stepCount === 1 ? 'step' : 'steps'}
                </p>
              </article>
            ))}
          </div>
        </section>

        <footer className="snapshot-footer">
          <span>Immutable snapshot</span>
          <code>{dashboard.organization.contentHash.slice(0, 12)}</code>
        </footer>
      </main>
    </div>
  )
}

function sentenceCase(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase()
}

function joinedNames(entities: Array<{ name: string }>) {
  return entities.map((entity) => entity.name).join(', ')
}

function evidenceLabel(evidence: string) {
  const labels: Record<string, string> = {
    ACTIVE_EMPLOYEE: 'Active employee',
    EXISTING_RELEVANT_APPLICATION_ACCESS: 'Existing app access',
    AFFECTED_STEP_CONSTRAINTS_SATISFIED: 'Step requirements met',
    DIFFERENT_ACTORS_SATISFIED: 'Separation of duties preserved',
    WORSENED_WORKFLOWS_RESTORED: 'Affected workflows restored',
    NO_WORKFLOW_WORSENED: 'No new workflow risk',
  }
  return labels[evidence] ?? evidence
}
