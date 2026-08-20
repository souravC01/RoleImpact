import { lazy, Suspense, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  runDraftImpactPreview,
  runDraftMitigationPreview,
  type DraftContinuityRisk,
  type DraftImpactResult,
} from '../../../api/draftImpact'
import type { DraftCatalog } from '../../../api/draftCatalog'
import { coverageHeading, coverageTone, outcomeTone, predictedOutcome, riskRank } from './continuityRiskPresentation'

const FullOrganizationImpactCanvas = lazy(() => import('./OrganizationCanvas').then((module) => ({ default: module.OrganizationImpactCanvas })))

export default function DraftImpactTesting({ workspaceId, catalog, risks, isContinuityLoading, continuityError, onRetryContinuity, onBackToMap }: {
  workspaceId: string
  catalog: DraftCatalog
  risks: DraftContinuityRisk[]
  isContinuityLoading: boolean
  continuityError: Error | null
  onRetryContinuity: () => void
  onBackToMap: () => void
}) {
  const testableRisks = useMemo(
    () => risks.filter((risk) => risk.members.length > 0).toSorted((left, right) => riskRank(left) - riskRank(right)),
    [risks],
  )
  const initialRisk = testableRisks[0]
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(initialRisk?.workflowId ?? '')
  const workflowRisks = testableRisks.filter((risk) => risk.workflowId === selectedWorkflowId)
  const [selectedRiskKey, setSelectedRiskKey] = useState(initialRisk?.key ?? '')
  const selectedRisk = workflowRisks.find((risk) => risk.key === selectedRiskKey) ?? workflowRisks[0]
  const [selectedMemberId, setSelectedMemberId] = useState(selectedRisk?.members[0]?.id ?? '')
  const [showOutcomeExplanation, setShowOutcomeExplanation] = useState(false)
  const [comparisonView, setComparisonView] = useState<'original' | 'mitigation'>('original')
  const selectedMember = selectedRisk?.members.find((member) => member.id === selectedMemberId) ?? selectedRisk?.members[0]
  const testableWorkflows = Array.from(new Map(testableRisks.map((risk) => [risk.workflowId, {
    id: risk.workflowId,
    name: risk.workflowName,
    responsibilityCount: new Set(testableRisks.filter((candidate) => candidate.workflowId === risk.workflowId).map((candidate) => candidate.requirementId)).size,
  }])).values())
  const mitigationMutation = useMutation({
    mutationFn: ({ memberId, roleId, replacementMemberId }: { memberId: string; roleId: string; replacementMemberId: string }) =>
      runDraftMitigationPreview(workspaceId, memberId, roleId, replacementMemberId),
    onSuccess: () => {
      setShowOutcomeExplanation(false)
      setComparisonView('mitigation')
    },
  })
  const mutation = useMutation({
    mutationFn: ({ memberId, roleId }: { memberId: string; roleId: string }) => runDraftImpactPreview(workspaceId, memberId, roleId),
    onSuccess: () => {
      mitigationMutation.reset()
      setComparisonView('original')
      setShowOutcomeExplanation(true)
    },
  })
  const originalResult = mitigationMutation.data?.original ?? mutation.data
  const displayedResult = comparisonView === 'mitigation' ? mitigationMutation.data?.mitigation : originalResult

  function resetResults() {
    setShowOutcomeExplanation(false)
    setComparisonView('original')
    mutation.reset()
    mitigationMutation.reset()
  }

  function chooseWorkflow(workflowId: string) {
    if (workflowId === selectedWorkflowId) return
    const firstRisk = testableRisks.find((risk) => risk.workflowId === workflowId)
    setSelectedWorkflowId(workflowId)
    setSelectedRiskKey(firstRisk?.key ?? '')
    setSelectedMemberId(firstRisk?.members[0]?.id ?? '')
    resetResults()
  }

  function chooseRisk(riskKey: string) {
    if (riskKey === selectedRiskKey) return
    const risk = workflowRisks.find((candidate) => candidate.key === riskKey)
    setSelectedRiskKey(riskKey)
    setSelectedMemberId(risk?.members[0]?.id ?? '')
    resetResults()
  }

  function runScenario(riskKey: string, memberId: string) {
    const risk = workflowRisks.find((candidate) => candidate.key === riskKey)
    if (!risk) return
    setSelectedRiskKey(riskKey)
    setSelectedMemberId(memberId)
    mitigationMutation.reset()
    setComparisonView('original')
    mutation.mutate({ memberId, roleId: risk.roleId })
  }

  function tryReplacement(replacementMemberId: string) {
    if (!originalResult || !selectedRisk || mitigationMutation.isPending) return
    mitigationMutation.mutate({ memberId: originalResult.changeSet.employee.id, roleId: selectedRisk.roleId, replacementMemberId })
  }

  if (catalog.workflows.length === 0) {
    return <EmptyImpact title="Create one workflow first" message="A workflow connects shared roles to a business outcome. Once that path exists, RoleImpact can visualize and test it." action="Return to organization map" onAction={onBackToMap} />
  }
  if (isContinuityLoading) {
    return <EmptyImpact title="Loading continuity analysis" message="RoleImpact is getting the current workflow verdicts from the impact engine." action="Return to organization map" onAction={onBackToMap} />
  }
  if (continuityError) {
    return <section className="impact-testing-empty warning" role="alert"><span aria-hidden="true">!</span><p className="section-kicker">Impact testing</p><h3>Continuity analysis is unavailable</h3><p>{continuityError.message}</p><button type="button" onClick={onRetryContinuity}>Retry continuity analysis</button><button type="button" className="secondary-button" onClick={onBackToMap}>Return to organization map</button></section>
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
            return <button type="button" key={workflow.id} className={workflow.id === selectedWorkflowId ? 'active' : ''} aria-pressed={workflow.id === selectedWorkflowId} onClick={() => chooseWorkflow(workflow.id)}><span><strong>{workflow.name}</strong><small>{workflow.responsibilityCount} responsibilities</small></span><em className={outcome.tone}>{outcome.label}</em></button>
          })}
        </div>
        <button type="button" className="secondary-button" onClick={onBackToMap}>Back to organization map</button>
      </aside>

      <div className="impact-explorer-main">
        {mitigationMutation.data ? (
          <ScenarioComparisonSwitch
            original={mitigationMutation.data.original}
            mitigation={mitigationMutation.data.mitigation}
            view={comparisonView}
            onChange={setComparisonView}
          />
        ) : null}
        <Suspense fallback={<p className="editor-state">Drawing the complete organization…</p>}>
          <FullOrganizationImpactCanvas
            workspaceId={workspaceId}
            catalog={catalog}
            workflowId={selectedWorkflowId}
            risks={workflowRisks}
            selectedRiskKey={selectedRisk.key}
            selectedMemberId={selectedMember.id}
            originalResult={originalResult}
            displayedResult={displayedResult}
            isPending={mutation.isPending || mitigationMutation.isPending}
            onRunScenario={runScenario}
            onTryReplacement={tryReplacement}
          />
        </Suspense>
        {originalResult && showOutcomeExplanation ? <OutcomeExplanation key={`${mutation.submittedAt}`} risk={selectedRisk} member={selectedMember} onDismiss={() => setShowOutcomeExplanation(false)} /> : null}

        <section className="scenario-composer" aria-labelledby="scenario-composer-title">
          <div><p className="section-kicker">Step 2</p><h3 id="scenario-composer-title">Choose what to test</h3><p>Use these controls as a precise alternative to selecting people directly on the full organization map.</p></div>
          <div className="scenario-choice-group"><strong>Responsibility</strong><div className="scenario-choice-list">{workflowRisks.map((risk) => <button type="button" key={risk.key} className={risk.key === selectedRisk.key ? 'active' : ''} aria-pressed={risk.key === selectedRisk.key} onClick={() => chooseRisk(risk.key)}><span>{risk.requirementName}</span><small>{risk.roleName}</small><em className={outcomeTone(risk)}>{predictedOutcome(risk)}</em></button>)}</div></div>
          <div className="scenario-choice-group"><strong>Role holder</strong><div className="member-choice-list">{selectedRisk.members.map((member) => <button type="button" key={member.id} className={member.id === selectedMember.id ? 'active' : ''} aria-pressed={member.id === selectedMember.id} onClick={() => { if (member.id === selectedMemberId) return; setSelectedMemberId(member.id); resetResults() }}><span>{member.name}</span><small>{member.eligible ? 'Eligible for this responsibility' : 'Not eligible under this responsibility’s conditions'}</small></button>)}</div></div>
          <div className={`continuity-signal ${coverageTone(selectedMember)}`}><strong>{coverageHeading(selectedRisk, selectedMember)}</strong><span>{selectedRisk.eligibleMembers.length} eligible now · {selectedMember.remainingEligibleActorCount} eligible after this change · minimum {selectedRisk.minimumActors} · healthy target {selectedRisk.resilienceTarget}.</span></div>
          <div className="scenario-action-summary"><span>What if</span><strong>{selectedMember.name} loses {selectedRisk.roleName}?</strong><p>No organization data will be changed.</p></div>
          <div className="scenario-actions"><button type="button" disabled={mutation.isPending || mitigationMutation.isPending} onClick={() => runScenario(selectedRisk.key, selectedMember.id)}>{mutation.isPending ? 'Calculating impact…' : 'Run this what-if test'}</button>{originalResult ? <button type="button" className="secondary-button" onClick={resetResults}>Reset to baseline</button> : null}</div>
          {mutation.isError ? <p className="form-error" role="alert">{mutation.error.message}</p> : null}
        </section>

        {displayedResult ? <ImpactResultSummary result={displayedResult} requirementName={selectedRisk.requirementName} /> : null}
        {mitigationMutation.data ? <ReplacementAssessment original={mitigationMutation.data.original} mitigation={mitigationMutation.data.mitigation} /> : null}
        {originalResult ? (
          <DraftMitigationPanel
            result={originalResult}
            mitigation={mitigationMutation.data?.mitigation}
            isPending={mitigationMutation.isPending}
            error={mitigationMutation.error}
            onTest={tryReplacement}
          />
        ) : null}
      </div>
    </div>
  )
}

function ScenarioComparisonSwitch({ original, mitigation, view, onChange }: {
  original: DraftImpactResult
  mitigation: DraftImpactResult
  view: 'original' | 'mitigation'
  onChange: (view: 'original' | 'mitigation') => void
}) {
  const replacement = mitigation.changeSet.replacementEmployee?.name ?? 'the recommended replacement'
  return (
    <section className="draft-comparison-switch" aria-label="Original and mitigated outcome">
      <div><p className="section-kicker">Mitigation verified</p><strong>Compare the disruption with {replacement} covering the role</strong><span>The organization baseline has not been changed.</span></div>
      <div className="draft-comparison-options">
        <button type="button" className={view === 'original' ? 'active' : ''} aria-pressed={view === 'original'} onClick={() => onChange('original')}><span>Original impact</span><strong>{outcomeCount(original)}</strong></button>
        <button type="button" className={view === 'mitigation' ? 'active' : ''} aria-pressed={view === 'mitigation'} onClick={() => onChange('mitigation')}><span>With mitigation</span><strong>{outcomeCount(mitigation)}</strong></button>
      </div>
    </section>
  )
}

function ReplacementAssessment({ original, mitigation }: { original: DraftImpactResult; mitigation: DraftImpactResult }) {
  const replacement = mitigation.changeSet.replacementEmployee
  if (!replacement) return null
  const recommendation = original.recommendations.find((candidate) => candidate.candidate.id === replacement.id)
  const exclusion = original.excludedCandidateReasons.find((candidate) => candidate.candidate.id === replacement.id)
  const restored = mitigation.executiveSummary.workflowsBlocked === 0 && mitigation.workflowImpacts.every((workflow) => workflow.scenarioStatus === workflow.baselineStatus)
  return (
    <section className={`replacement-assessment ${exclusion || !restored ? 'warning' : 'safe'}`} aria-live="polite">
      <div><p className="section-kicker">Selected replacement</p><h3>{recommendation ? `${replacement.name} is a recommended replacement` : exclusion ? `${replacement.name} was not recommended` : `${replacement.name} is a safe alternative`}</h3><p>{exclusion ? exclusion.reasons.map((reason) => reason.detail).join(' ') : restored ? `The proposed assignment restores the affected workflows to their baseline state without changing the organization.` : `The proposed assignment was evaluated, but it does not fully restore the affected workflows.`}</p></div>
      <span>{restored ? 'Coverage restored' : outcomeCount(mitigation)}</span>
    </section>
  )
}

function DraftMitigationPanel({ result, mitigation, isPending, error, onTest }: {
  result: DraftImpactResult
  mitigation?: DraftImpactResult
  isPending: boolean
  error: Error | null
  onTest: (replacementMemberId: string) => void
}) {
  const disruptionCount = result.executiveSummary.workflowsBlocked + result.executiveSummary.workflowsDegraded
  if (result.recommendations.length === 0) {
    return (
      <section className={`draft-mitigation-panel ${disruptionCount > 0 ? 'no-safe-option' : 'not-needed'}`}>
        <div><p className="section-kicker">Next decision</p><h3>{disruptionCount > 0 ? 'No safe automatic replacement was found' : 'No mitigation is needed'}</h3><p>{disruptionCount > 0 ? 'RoleImpact evaluated the active members in this draft but none can restore coverage without failing an eligibility or safety rule.' : 'The tested change does not reduce workflow coverage below its configured target.'}</p></div>
        {result.excludedCandidateReasons.length > 0 ? <CandidateExclusions result={result} /> : null}
      </section>
    )
  }

  return (
    <section className="draft-mitigation-panel" aria-labelledby="draft-mitigation-title">
      <div className="draft-mitigation-heading"><div><p className="section-kicker">Step 3</p><h3 id="draft-mitigation-title">Test a safe replacement</h3><p>These options come from the same deterministic eligibility and workflow rules used by the impact test.</p></div><span>{result.recommendations.length} safe option{result.recommendations.length === 1 ? '' : 's'}</span></div>
      <div className="draft-recommendation-list">
        {result.recommendations.map((recommendation) => {
          const tested = mitigation?.changeSet.replacementEmployee?.id === recommendation.candidate.id
          return (
            <article className={`draft-recommendation-card ${tested ? 'tested' : ''}`} key={recommendation.id}>
              <span className="draft-recommendation-rank">{String(recommendation.rank).padStart(2, '0')}</span>
              <div><strong>Assign {recommendation.role.name} to {recommendation.candidate.name}</strong><p>This restores {formatEntityNames(recommendation.restoredWorkflowSteps)} with {recommendation.gainedPermissions.length} additional effective permission{recommendation.gainedPermissions.length === 1 ? '' : 's'}.</p><div className="draft-recommendation-evidence">{recommendation.evidence.map((evidence) => <span key={evidence}>{evidenceLabel(evidence)}</span>)}</div></div>
              <button type="button" disabled={isPending} onClick={() => onTest(recommendation.candidate.id)}>{isPending ? 'Testing mitigation…' : tested ? 'Test mitigation again' : 'Test this mitigation'}</button>
            </article>
          )
        })}
      </div>
      {error ? <p className="form-error" role="alert">{error.message}</p> : null}
      {result.excludedCandidateReasons.length > 0 ? <CandidateExclusions result={result} /> : null}
    </section>
  )
}

function CandidateExclusions({ result }: { result: DraftImpactResult }) {
  return (
    <details className="draft-candidate-exclusions"><summary>Why other members were not recommended</summary><div>{result.excludedCandidateReasons.map((exclusion) => <p key={exclusion.candidate.id}><strong>{exclusion.candidate.name}:</strong> {exclusion.reasons.map((reason) => reason.detail).join(' ')}</p>)}</div></details>
  )
}

function OutcomeExplanation({ risk, member, onDismiss }: { risk: DraftContinuityRisk; member: DraftContinuityRisk['members'][number]; onDismiss: () => void }) {
  const tone = member.scenarioStatus === 'BLOCKED' ? 'blocked' : member.scenarioStatus === 'DEGRADED' ? 'degraded' : 'safe'
  const heading = member.scenarioStatus === 'BLOCKED' ? 'This workflow would be blocked' : member.scenarioStatus === 'DEGRADED' ? 'It still works, but resilience is reduced' : 'The workflow remains operational'
  const coverageText = member.remainingEligibleActorCount === 0
    ? `After ${member.name} loses ${risk.roleName}, the impact engine finds no eligible actor for ${risk.requirementName}.`
    : `After ${member.name} loses ${risk.roleName}, the impact engine finds ${member.remainingEligibleActorCount} eligible actor${member.remainingEligibleActorCount === 1 ? '' : 's'} for ${risk.requirementName}.`

  return (
    <aside className={`outcome-explanation ${tone}`} role="status" aria-live="polite">
      <span className="outcome-explanation-icon" aria-hidden="true">{tone === 'blocked' ? '!' : tone === 'degraded' ? '△' : '✓'}</span>
      <div><strong>{heading}</strong><p>{coverageText}</p><small>Engine verdict: {member.scenarioStatus} · {member.remainingEligibleActorCount} eligible after change · minimum {risk.minimumActors} to operate · {risk.resilienceTarget} for healthy coverage.</small></div>
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

function outcomeCount(result: DraftImpactResult) {
  const blocked = result.executiveSummary.workflowsBlocked
  const degraded = result.executiveSummary.workflowsDegraded
  if (blocked > 0) return `${blocked} blocked`
  if (degraded > 0) return `${degraded} degraded`
  return 'Coverage restored'
}

function formatEntityNames(entities: Array<{ name: string }>) {
  if (entities.length === 0) return 'the affected workflow'
  return formatNames(entities.map((entity) => entity.name))
}

function evidenceLabel(evidence: DraftImpactResult['recommendations'][number]['evidence'][number]) {
  return {
    ACTIVE_EMPLOYEE: 'Active member',
    EXISTING_RELEVANT_APPLICATION_ACCESS: 'Relevant access exists',
    AFFECTED_STEP_CONSTRAINTS_SATISFIED: 'Step rules satisfied',
    DIFFERENT_ACTORS_SATISFIED: 'Separation maintained',
    WORSENED_WORKFLOWS_RESTORED: 'Coverage restored',
    NO_WORKFLOW_WORSENED: 'No new disruption',
  }[evidence]
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

function workflowOutcome(risks: DraftContinuityRisk[]) {
  const best = risks.toSorted((left, right) => riskRank(left) - riskRank(right))[0]
  return best ? { label: predictedOutcome(best), tone: outcomeTone(best) } : { label: 'not testable', tone: 'neutral' }
}
