import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { runDraftImpactPreview, type DraftImpactResult } from '../../../api/draftImpact'
import type { DraftCatalog } from '../../../api/draftCatalog'
import { findWorkflowRisks, type WorkflowRisk } from './workflowRisks'

const WorkflowScenarioCanvas = lazy(() => import('./WorkflowScenarioCanvas'))

export default function DraftImpactTesting({ workspaceId, catalog, onBackToMap }: {
  workspaceId: string
  catalog: DraftCatalog
  onBackToMap: () => void
}) {
  const testableRisks = useMemo(
    () => findWorkflowRisks(catalog).filter((risk) => risk.members.length > 0).toSorted((left, right) => riskRank(left) - riskRank(right)),
    [catalog],
  )
  const initialRisk = testableRisks[0]
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(initialRisk?.workflowId ?? '')
  const workflowRisks = testableRisks.filter((risk) => risk.workflowId === selectedWorkflowId)
  const [selectedRiskKey, setSelectedRiskKey] = useState(initialRisk?.key ?? '')
  const selectedRisk = workflowRisks.find((risk) => risk.key === selectedRiskKey) ?? workflowRisks[0]
  const [selectedMemberId, setSelectedMemberId] = useState(selectedRisk?.members[0]?.id ?? '')
  const [showOutcomeExplanation, setShowOutcomeExplanation] = useState(false)
  const selectedMember = selectedRisk?.members.find((member) => member.id === selectedMemberId) ?? selectedRisk?.members[0]
  const testableWorkflows = catalog.workflows.filter((workflow) => testableRisks.some((risk) => risk.workflowId === workflow.id))
  const mutation = useMutation({
    mutationFn: ({ memberId, roleId }: { memberId: string; roleId: string }) => runDraftImpactPreview(workspaceId, memberId, roleId),
    onSuccess: () => setShowOutcomeExplanation(true),
  })

  function chooseWorkflow(workflowId: string) {
    const firstRisk = testableRisks.find((risk) => risk.workflowId === workflowId)
    setSelectedWorkflowId(workflowId)
    setSelectedRiskKey(firstRisk?.key ?? '')
    setSelectedMemberId(firstRisk?.members[0]?.id ?? '')
    setShowOutcomeExplanation(false)
    mutation.reset()
  }

  function chooseRisk(riskKey: string) {
    const risk = workflowRisks.find((candidate) => candidate.key === riskKey)
    setSelectedRiskKey(riskKey)
    setSelectedMemberId(risk?.members[0]?.id ?? '')
    setShowOutcomeExplanation(false)
    mutation.reset()
  }

  function chooseScenario(riskKey: string, memberId: string) {
    setSelectedRiskKey(riskKey)
    setSelectedMemberId(memberId)
    setShowOutcomeExplanation(false)
    mutation.reset()
  }

  function runScenario(riskKey: string, memberId: string) {
    const risk = workflowRisks.find((candidate) => candidate.key === riskKey)
    if (!risk) return
    setSelectedRiskKey(riskKey)
    setSelectedMemberId(memberId)
    mutation.mutate({ memberId, roleId: risk.roleId })
  }

  if (catalog.workflows.length === 0) {
    return <EmptyImpact title="Create one workflow first" message="A workflow connects shared roles to a business outcome. Once that path exists, RoleImpact can visualize and test it." action="Return to organization map" onAction={onBackToMap} />
  }
  if (testableRisks.length === 0) {
    return <EmptyImpact title="No testable role assignment" message="Your workflows do not currently lead to a member through an assigned role. Return to the map and assign members to the required shared roles." action="Fix organization map" onAction={onBackToMap} warning />
  }

  return (
    <div className="impact-explorer">
      <aside className="workflow-choice-panel" aria-label="Choose a workflow">
        <div><p className="section-kicker">Step 1</p><h3>Choose a workflow</h3><p>Start with the business process you want to protect.</p></div>
        <div className="workflow-choice-list">
          {testableWorkflows.map((workflow) => {
            const risks = testableRisks.filter((risk) => risk.workflowId === workflow.id)
            const outcome = workflowOutcome(risks)
            return <button type="button" key={workflow.id} className={workflow.id === selectedWorkflowId ? 'active' : ''} aria-pressed={workflow.id === selectedWorkflowId} onClick={() => chooseWorkflow(workflow.id)}><span><strong>{workflow.name}</strong><small>{workflow.requirements.length} responsibilities</small></span><em className={outcome.tone}>{outcome.label}</em></button>
          })}
        </div>
        <button type="button" className="secondary-button" onClick={onBackToMap}>Back to organization map</button>
      </aside>

      <div className="impact-explorer-main">
        <Suspense fallback={<p className="editor-state">Drawing the current workflow…</p>}>
          <WorkflowScenarioCanvas catalog={catalog} workflowId={selectedWorkflowId} risks={workflowRisks} selectedRiskKey={selectedRisk.key} selectedMemberId={selectedMember.id} result={mutation.data} onSelect={chooseScenario} onRunScenario={runScenario} />
        </Suspense>
        {mutation.data && showOutcomeExplanation ? <OutcomeExplanation key={`${mutation.submittedAt}`} risk={selectedRisk} member={selectedMember} onDismiss={() => setShowOutcomeExplanation(false)} /> : null}

        <section className="scenario-composer" aria-labelledby="scenario-composer-title">
          <div><p className="section-kicker">Step 2</p><h3 id="scenario-composer-title">Choose what to test</h3><p>Select a responsibility and one of its role holders. You can also select nodes directly in the graph.</p></div>
          <div className="scenario-choice-group"><strong>Responsibility</strong><div className="scenario-choice-list">{workflowRisks.map((risk) => <button type="button" key={risk.key} className={risk.key === selectedRisk.key ? 'active' : ''} aria-pressed={risk.key === selectedRisk.key} onClick={() => chooseRisk(risk.key)}><span>{risk.requirementName}</span><small>{risk.roleName}</small><em className={outcomeTone(risk)}>{predictedOutcome(risk)}</em></button>)}</div></div>
          <div className="scenario-choice-group"><strong>Role holder</strong><div className="member-choice-list">{selectedRisk.members.map((member) => <button type="button" key={member.id} className={member.id === selectedMember.id ? 'active' : ''} aria-pressed={member.id === selectedMember.id} onClick={() => { setSelectedMemberId(member.id); setShowOutcomeExplanation(false); mutation.reset() }}><span>{member.name}</span><small>{member.eligible ? 'Eligible for this responsibility' : 'Not eligible under this responsibility’s conditions'}</small></button>)}</div></div>
          <div className={`continuity-signal ${coverageTone(selectedRisk, selectedMember.losesCoverage)}`}><strong>{coverageHeading(selectedRisk, selectedMember.losesCoverage)}</strong><span>{selectedRisk.eligibleMembers.length} eligible now · minimum {selectedRisk.minimumActors} · healthy target {selectedRisk.resilienceTarget}.</span></div>
          <div className="scenario-action-summary"><span>What if</span><strong>{selectedMember.name} loses {selectedRisk.roleName}?</strong><p>No organization data will be changed.</p></div>
          <div className="scenario-actions"><button type="button" disabled={mutation.isPending} onClick={() => runScenario(selectedRisk.key, selectedMember.id)}>{mutation.isPending ? 'Calculating impact…' : 'Run this what-if test'}</button>{mutation.data ? <button type="button" className="secondary-button" onClick={() => { setShowOutcomeExplanation(false); mutation.reset() }}>Reset to baseline</button> : null}</div>
          {mutation.isError ? <p className="form-error" role="alert">{mutation.error.message}</p> : null}
        </section>

        {mutation.data ? <ImpactResultSummary result={mutation.data} requirementName={selectedRisk.requirementName} /> : null}
      </div>
    </div>
  )
}

function OutcomeExplanation({ risk, member, onDismiss }: { risk: WorkflowRisk; member: WorkflowRisk['members'][number]; onDismiss: () => void }) {
  const timer = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const survivors = risk.eligibleMembers.filter((candidate) => candidate.id !== member.id || !member.losesCoverage)
  const tone = survivors.length < risk.minimumActors ? 'blocked' : survivors.length < risk.resilienceTarget ? 'degraded' : 'safe'
  const heading = tone === 'blocked' ? 'This responsibility is now blocked' : tone === 'degraded' ? 'It still works, but resilience is reduced' : 'Coverage remains healthy'
  const coverageText = survivors.length === 0
    ? `${member.name} was the only eligible holder. No one can now perform ${risk.requirementName}.`
    : `${member.name} loses ${risk.roleName}, but ${formatNames(survivors.map((survivor) => survivor.name))} ${survivors.length === 1 ? 'still provides' : 'still provide'} coverage.`

  const scheduleDismiss = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(onDismiss, 8000)
  }, [onDismiss])
  useEffect(() => {
    scheduleDismiss()
    return () => { if (timer.current) window.clearTimeout(timer.current) }
  }, [scheduleDismiss])

  return (
    <aside className={`outcome-explanation ${tone}`} role="status" aria-live="polite" onMouseEnter={() => { if (timer.current) window.clearTimeout(timer.current) }} onMouseLeave={scheduleDismiss}>
      <span className="outcome-explanation-icon" aria-hidden="true">{tone === 'blocked' ? '!' : tone === 'degraded' ? '△' : '✓'}</span>
      <div><strong>{heading}</strong><p>{coverageText}</p><small>Rule: {survivors.length} eligible after change · minimum {risk.minimumActors} to operate · {risk.resilienceTarget} for healthy coverage.</small></div>
      <button type="button" aria-label="Dismiss outcome explanation" onClick={onDismiss}>×</button>
    </aside>
  )
}

function formatNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? 'no one'
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`
}

function ImpactResultSummary({ result, requirementName }: { result: DraftImpactResult; requirementName: string }) {
  return (
    <section className="impact-preview-result" aria-live="polite">
      <div className="impact-preview-summary"><div><p className="section-kicker">Preview result · {requirementName}</p><h3>{resultHeading(result)}</h3><p>{resultExplanation(result, requirementName)}</p></div><span className={`severity-badge ${result.overallSeverity.toLowerCase()}`}>{result.overallSeverity}</span></div>
      <div className="impact-preview-counts"><article><strong>{result.executiveSummary.workflowsBlocked}</strong><span>blocked</span></article><article><strong>{result.executiveSummary.workflowsDegraded}</strong><span>degraded</span></article><article><strong>{result.executiveSummary.permissionsLost}</strong><span>permissions lost</span></article></div>
    </section>
  )
}

function EmptyImpact({ title, message, action, onAction, warning = false }: { title: string; message: string; action: string; onAction: () => void; warning?: boolean }) {
  return <section className={`impact-testing-empty ${warning ? 'warning' : ''}`}><span aria-hidden="true">{warning ? '!' : '◎'}</span><p className="section-kicker">Impact testing</p><h3>{title}</h3><p>{message}</p><button type="button" onClick={onAction}>{action}</button></section>
}

function resultHeading(result: DraftImpactResult) {
  if (result.executiveSummary.workflowsBlocked > 0) return 'A workflow would be blocked'
  if (result.executiveSummary.workflowsDegraded > 0) return 'Resilience would be reduced'
  return 'The workflow remains operational'
}

function resultExplanation(result: DraftImpactResult, requirementName: string) {
  const change = result.changeSet
  return `If ${change.employee.name} loses ${change.role.name}, RoleImpact recalculates ${requirementName}: ${result.executiveSummary.workflowsBlocked} workflow(s) are blocked and ${result.executiveSummary.workflowsDegraded} are degraded.`
}

function workflowOutcome(risks: WorkflowRisk[]) {
  const best = risks.toSorted((left, right) => riskRank(left) - riskRank(right))[0]
  return best ? { label: predictedOutcome(best), tone: outcomeTone(best) } : { label: 'not testable', tone: 'neutral' }
}

function riskRank(risk: WorkflowRisk) {
  const remaining = remainingCoverage(risk)
  if (remaining < risk.minimumActors) return 0
  if (remaining < risk.resilienceTarget) return 1
  return 2
}

function predictedOutcome(risk: WorkflowRisk) {
  const remaining = remainingCoverage(risk)
  if (remaining < risk.minimumActors) return 'would block'
  if (remaining < risk.resilienceTarget) return 'would degrade'
  return 'coverage remains safe'
}

function outcomeTone(risk: WorkflowRisk) {
  return ['danger', 'warning', 'safe'][riskRank(risk)]
}

function remainingCoverage(risk: WorkflowRisk) {
  return risk.eligibleMembers.length - (risk.members.some((member) => member.losesCoverage) ? 1 : 0)
}

function coverageHeading(risk: WorkflowRisk, losesCoverage: boolean) {
  if (!losesCoverage) return 'Other access still covers this step'
  const remaining = risk.eligibleMembers.length - 1
  if (remaining < risk.minimumActors) return 'This change would block the step'
  if (remaining < risk.resilienceTarget) return 'This change would reduce resilience'
  return 'Coverage would remain healthy'
}

function coverageTone(risk: WorkflowRisk, losesCoverage: boolean) {
  if (!losesCoverage) return 'ready'
  return risk.eligibleMembers.length - 1 < risk.resilienceTarget ? 'critical' : 'ready'
}
