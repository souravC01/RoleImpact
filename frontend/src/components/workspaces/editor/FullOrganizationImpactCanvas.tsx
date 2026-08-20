import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  useReactFlow,
  type Edge,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { DraftCatalog } from '../../../api/draftCatalog'
import type { DraftContinuityRisk, DraftImpactResult } from '../../../api/draftImpact'
import type { CanvasNode, OrganizationSimulationState } from './OrganizationCanvas'

type ImpactContextMenu = { x: number; y: number; memberId: string }
type ImpactEdgeState = 'removed' | 'blocked' | 'degraded' | 'restored' | 'candidate'

export type FullOrganizationImpactCanvasProps = {
  workspaceId: string
  catalog: DraftCatalog
  workflowId: string
  risks: DraftContinuityRisk[]
  selectedRiskKey: string
  selectedMemberId: string
  originalResult?: DraftImpactResult
  displayedResult?: DraftImpactResult
  isPending: boolean
  onRunScenario: (riskKey: string, memberId: string) => void
  onTryReplacement: (memberId: string) => void
}

export default function FullOrganizationImpactCanvas({
  catalog,
  workflowId,
  risks,
  selectedRiskKey,
  selectedMemberId,
  originalResult,
  displayedResult,
  isPending,
  onRunScenario,
  onTryReplacement,
  baseNodes,
  baseEdges,
  baseFocusIds,
  nodeTypes,
  getRelatedPathIds,
}: FullOrganizationImpactCanvasProps & {
  baseNodes: CanvasNode[]
  baseEdges: Edge[]
  baseFocusIds: Set<string>
  nodeTypes: NodeTypes
  getRelatedPathIds: (selectedNodeId: string) => Set<string>
}) {
  const { fitView } = useReactFlow<CanvasNode, Edge>()
  const [scope, setScope] = useState<'workflow' | 'full'>('workflow')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ImpactContextMenu | null>(null)
  const selectedRisk = risks.find((risk) => risk.key === selectedRiskKey) ?? risks[0]
  const selectedWorkflow = catalog.workflows.find((workflow) => workflow.id === workflowId)
  const model = useMemo(
    () => buildImpactModel(catalog, baseNodes, baseEdges, baseFocusIds, selectedRisk, selectedMemberId, originalResult, displayedResult),
    [catalog, baseNodes, baseEdges, baseFocusIds, selectedRisk, selectedMemberId, originalResult, displayedResult],
  )
  const openMemberActions = useCallback((memberId: string, event: ReactMouseEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    setContextMenu({ x: bounds.left, y: bounds.bottom + 6, memberId })
  }, [])
  const selectedPathIds = useMemo(() => selectedNodeId ? getRelatedPathIds(selectedNodeId) : null, [getRelatedPathIds, selectedNodeId])
  const visibleNodes = useMemo(() => {
    const scopedNodes = scope === 'full' ? model.nodes : compactNodes(model.nodes, model.focusIds)
    return scopedNodes.map((node) => {
      const emphasis = selectedPathIds ? selectedPathIds.has(node.id) ? 'highlighted' as const : 'dimmed' as const : node.data.emphasis
      const data = node.data.entityType === 'member'
        ? { ...node.data, emphasis, onImpactActions: (event: ReactMouseEvent<HTMLButtonElement>) => openMemberActions(node.id.slice('member:'.length), event) }
        : { ...node.data, emphasis }
      return { ...node, selected: node.id === selectedNodeId, data }
    })
  }, [model.focusIds, model.nodes, openMemberActions, scope, selectedNodeId, selectedPathIds])
  const visibleEdges = useMemo(() => {
    const scopedEdges = scope === 'full' ? model.edges : model.edges.filter((edge) => model.focusIds.has(edge.source) && model.focusIds.has(edge.target))
    return emphasizeSelectedEdges(scopedEdges, selectedPathIds)
  }, [model.edges, model.focusIds, scope, selectedPathIds])
  const selectedNode = model.nodes.find((node) => node.id === selectedNodeId)

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    window.addEventListener('click', close)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [contextMenu])

  useEffect(() => {
    setSelectedNodeId(null)
    setContextMenu(null)
    setScope('workflow')
  }, [workflowId])

  function fitSelection() {
    if (!selectedPathIds) return
    const nodes = visibleNodes.filter((node) => selectedPathIds.has(node.id))
    if (nodes.length > 0) void fitView({ nodes, duration: 350, maxZoom: 1.05, padding: 0.45 })
  }

  return (
    <section className="full-impact-map" aria-labelledby="full-impact-map-title">
      <div className="canvas-toolbar impact-map-toolbar">
        <div><h3 id="full-impact-map-title">Test impact map</h3><span>{selectedNode ? `${impactTypeLabels[selectedNode.data.entityType]} selected · connected path highlighted` : `${selectedWorkflow?.name ?? 'Selected workflow'} · select any object to trace its path`}</span></div>
        <div className="canvas-toolbar-actions">
          <button type="button" className="secondary-button" onClick={() => setScope(scope === 'workflow' ? 'full' : 'workflow')}>{scope === 'workflow' ? 'Show full map' : `Focus ${selectedWorkflow?.name ?? 'workflow'}`}</button>
          {selectedNode ? <button type="button" className="secondary-button" onClick={fitSelection}>Fit selection</button> : null}
          {selectedNode ? <button type="button" className="secondary-button" onClick={() => setSelectedNodeId(null)}>Clear selection</button> : null}
          <button type="button" className="secondary-button" onClick={() => void fitView({ duration: 350, padding: 0.25 })}>Fit graph</button>
          <details className="impact-map-legend"><summary>Legend</summary><div className="scenario-legend" aria-label="Organization impact legend"><span><i className="selected" />Selected</span><span><i className="candidate" />Candidate</span><span><i className="blocked" />Blocked</span><span><i className="degraded" />Degraded</span><span><i className="safe" />Restored</span></div></details>
        </div>
      </div>
      <div className="full-impact-map-canvas" aria-label="Complete organization impact map">
        <ReactFlow<CanvasNode, Edge>
          key={`${scope}-${workflowId}-${displayedResult?.diagnostics.resultHash ?? 'baseline'}`}
          nodes={visibleNodes}
          edges={visibleEdges}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => {
            setContextMenu(null)
            setSelectedNodeId(node.id)
          }}
          onNodeContextMenu={(event, node) => {
            if (node.data.entityType !== 'member') return
            event.preventDefault()
            setContextMenu({ x: event.clientX, y: event.clientY, memberId: node.id.slice('member:'.length) })
          }}
          onPaneClick={() => { setContextMenu(null); setSelectedNodeId(null) }}
          nodesDraggable={false}
          nodesConnectable={false}
          edgesReconnectable={false}
          zoomOnDoubleClick={false}
          fitView
          fitViewOptions={{ padding: 0.22, minZoom: 0.35, maxZoom: 0.95 }}
          minZoom={0.25}
          maxZoom={1.2}
        >
          <Background color="#323746" gap={24} size={1} />
          <Controls showInteractive={false} position="bottom-left" />
        </ReactFlow>
      </div>
      {selectedNode && selectedRisk ? <ImpactSelectionPanel node={selectedNode} catalog={catalog} risks={risks} selectedRisk={selectedRisk} originalResult={originalResult} isPending={isPending} onClose={() => setSelectedNodeId(null)} onRunScenario={onRunScenario} onTryReplacement={onTryReplacement} /> : null}
      {contextMenu && selectedRisk ? (
        <ImpactMemberMenu
          x={contextMenu.x}
          y={contextMenu.y}
          memberId={contextMenu.memberId}
          catalog={catalog}
          risks={risks}
          selectedRisk={selectedRisk}
          originalResult={originalResult}
          isPending={isPending}
          onClose={() => setContextMenu(null)}
          onRunScenario={onRunScenario}
          onTryReplacement={onTryReplacement}
        />
      ) : null}
    </section>
  )
}

function ImpactSelectionPanel({ node, catalog, risks, selectedRisk, originalResult, isPending, onClose, onRunScenario, onTryReplacement }: {
  node: CanvasNode
  catalog: DraftCatalog
  risks: DraftContinuityRisk[]
  selectedRisk: DraftContinuityRisk
  originalResult?: DraftImpactResult
  isPending: boolean
  onClose: () => void
  onRunScenario: (riskKey: string, memberId: string) => void
  onTryReplacement: (memberId: string) => void
}) {
  const entity = parseNodeId(node.id)
  const metrics: Array<{ label: string; value: string | number }> = []
  let description = node.data.detail
  let actions: ReactNode = null

  if (entity.type === 'member') {
    const member = catalog.members.find((candidate) => candidate.id === entity.id)
    const holderRisks = uniqueRisksByRole(risks.filter((risk) => risk.members.some((candidate) => candidate.id === entity.id)))
    const roleIds = new Set(member?.roleIds ?? [])
    const connectedWorkflows = catalog.workflows.filter((workflow) => workflow.requirements.some((requirement) => requirement.roleIds.some((roleId) => roleIds.has(roleId))))
    metrics.push({ label: 'Roles', value: member?.roleIds.length ?? 0 }, { label: 'Connected workflows', value: connectedWorkflows.length })
    const canTryReplacement = Boolean(originalResult && member && entity.id !== originalResult.changeSet.employee.id && !member.roleIds.includes(selectedRisk.roleId))
    actions = (
      <div className="impact-object-actions">
        {canTryReplacement ? <button type="button" disabled={isPending} onClick={() => onTryReplacement(entity.id)}>Try as replacement for {selectedRisk.roleName}</button> : null}
        {holderRisks.map((risk) => <button type="button" className="secondary-button" disabled={isPending} key={risk.key} onClick={() => onRunScenario(risk.key, entity.id)}>Test losing {risk.roleName}</button>)}
        {!canTryReplacement && holderRisks.length === 0 ? <p>This member has no testable role in the selected workflow.</p> : null}
      </div>
    )
  } else if (entity.type === 'role') {
    const role = catalog.roles.find((candidate) => candidate.id === entity.id)
    const roleRisks = risks.filter((risk) => risk.roleId === entity.id)
    const holders = catalog.members.filter((member) => member.roleIds.includes(entity.id))
    metrics.push({ label: 'Holders', value: holders.length }, { label: 'Workflow responsibilities', value: new Set(roleRisks.map((risk) => risk.requirementId)).size })
    description = role?.description || description
    const riskByMember = uniqueRiskActions(roleRisks)
    actions = <ImpactRiskActions actions={riskByMember} isPending={isPending} onRun={onRunScenario} empty="This role is not required by the selected workflow." />
  } else if (entity.type === 'responsibility') {
    const requirement = catalog.workflows.flatMap((workflow) => workflow.requirements).find((candidate) => candidate.id === entity.id)
    const requirementRisks = risks.filter((risk) => risk.requirementId === entity.id)
    const eligibleMembers = new Set(requirementRisks.flatMap((risk) => risk.eligibleMembers.map((member) => member.id)))
    metrics.push({ label: 'Eligible now', value: eligibleMembers.size }, { label: 'Minimum', value: requirement?.minimumActors ?? 0 }, { label: 'Healthy target', value: requirement?.resilienceTarget ?? 0 })
    description = requirement ? `${requirement.name} requires enough eligible role holders to keep the workflow operating.` : description
    actions = <ImpactRiskActions actions={uniqueRiskActions(requirementRisks)} isPending={isPending} onRun={onRunScenario} empty="This responsibility has no testable role holders." />
  } else if (entity.type === 'workflow') {
    const workflow = catalog.workflows.find((candidate) => candidate.id === entity.id)
    const workflowRisks = risks.filter((risk) => risk.workflowId === entity.id)
    metrics.push({ label: 'Responsibilities', value: workflow?.requirements.length ?? 0 }, { label: 'Testable role paths', value: workflowRisks.length }, { label: 'Criticality', value: workflow?.criticality.toLowerCase() ?? 'unknown' })
    description = workflowRisks.length > 0 ? 'The highlighted graph shows every team, member, role, and responsibility supporting this workflow.' : 'The highlighted graph shows this workflow’s complete dependency path. Select it from Step 1 to run its impact tests.'
    actions = <ImpactRiskActions actions={uniqueRiskActions(workflowRisks)} isPending={isPending} onRun={onRunScenario} empty="Choose this workflow from Step 1 to test its role holders." />
  } else if (entity.type === 'team') {
    const teamMembers = catalog.members.filter((member) => member.teamId === entity.id)
    const teamRoleIds = new Set(teamMembers.flatMap((member) => member.roleIds))
    const connectedWorkflows = catalog.workflows.filter((workflow) => workflow.requirements.some((requirement) => requirement.roleIds.some((roleId) => teamRoleIds.has(roleId))))
    metrics.push({ label: 'Members', value: teamMembers.length }, { label: 'Connected workflows', value: connectedWorkflows.length })
    description = `${node.data.label} contributes people to ${connectedWorkflows.length} workflow${connectedWorkflows.length === 1 ? '' : 's'} through the highlighted paths.`
    actions = <div className="impact-object-actions"><p>Select one of the highlighted members, roles, or responsibilities to inspect and test a specific change.</p></div>
  }

  return (
    <section className="impact-object-panel" aria-label={`Selected ${impactTypeLabels[node.data.entityType]} ${node.data.label}`}>
      <div className="impact-object-heading"><div><span>{impactTypeLabels[node.data.entityType]}</span><strong>{node.data.label}</strong><p>{description}</p></div>{node.data.badge ? <em className={`impact-object-state ${node.data.simulationState ?? ''}`}>{node.data.badge}</em> : null}<button type="button" aria-label="Clear selected object" onClick={onClose}>×</button></div>
      {metrics.length > 0 ? <div className="impact-object-metrics">{metrics.map((metric) => <div key={metric.label}><strong>{metric.value}</strong><span>{metric.label}</span></div>)}</div> : null}
      {actions}
    </section>
  )
}

function ImpactRiskActions({ actions, isPending, onRun, empty }: {
  actions: Array<{ risk: DraftContinuityRisk; member: DraftContinuityRisk['members'][number] }>
  isPending: boolean
  onRun: (riskKey: string, memberId: string) => void
  empty: string
}) {
  if (actions.length === 0) return <div className="impact-object-actions"><p>{empty}</p></div>
  return <div className="impact-object-actions">{actions.map(({ risk, member }) => <button type="button" className="secondary-button" disabled={isPending} key={`${risk.roleId}:${member.id}`} onClick={() => onRun(risk.key, member.id)}>Test {member.name} losing {risk.roleName}</button>)}</div>
}

function ImpactMemberMenu({ x, y, memberId, catalog, risks, selectedRisk, originalResult, isPending, onClose, onRunScenario, onTryReplacement }: {
  x: number
  y: number
  memberId: string
  catalog: DraftCatalog
  risks: DraftContinuityRisk[]
  selectedRisk: DraftContinuityRisk
  originalResult?: DraftImpactResult
  isPending: boolean
  onClose: () => void
  onRunScenario: (riskKey: string, memberId: string) => void
  onTryReplacement: (memberId: string) => void
}) {
  const member = catalog.members.find((candidate) => candidate.id === memberId)
  if (!member) return null
  const holderRisks = Array.from(new Map(
    risks
      .filter((risk) => risk.members.some((candidate) => candidate.id === memberId))
      .map((risk) => [risk.roleId, risk]),
  ).values())
  const alreadyHoldsSelectedRole = member.roleIds.includes(selectedRisk.roleId)
  const exclusion = originalResult?.excludedCandidateReasons.find((candidate) => candidate.candidate.id === memberId)
  const recommendation = originalResult?.recommendations.find((candidate) => candidate.candidate.id === memberId)
  return (
    <div className="scenario-context-menu" role="menu" aria-label={`Impact actions for ${member.name}`} style={{ left: Math.max(16, Math.min(x, window.innerWidth - 272)), top: Math.max(16, Math.min(y, window.innerHeight - 210)) }} onClick={(event) => event.stopPropagation()}>
      <strong>{member.name}</strong><span>{recommendation ? `Recommended replacement #${recommendation.rank}` : exclusion ? 'Available to test, but not recommended' : alreadyHoldsSelectedRole ? 'Current role holder' : 'Organization member'}</span>
      {holderRisks.map((risk) => <button type="button" role="menuitem" disabled={isPending} key={risk.key} onClick={() => { onClose(); onRunScenario(risk.key, memberId) }}>Test losing {risk.roleName}</button>)}
      {originalResult && !alreadyHoldsSelectedRole && memberId !== originalResult.changeSet.employee.id ? <button type="button" role="menuitem" disabled={isPending} onClick={() => { onClose(); onTryReplacement(memberId) }}>Try as replacement for {selectedRisk.roleName}</button> : null}
      {originalResult && alreadyHoldsSelectedRole && holderRisks.length === 0 ? <span>This member already holds {selectedRisk.roleName}.</span> : null}
      {exclusion ? <small>{exclusion.reasons.map((reason) => reason.detail).join(' ')}</small> : null}
    </div>
  )
}

function buildImpactModel(
  catalog: DraftCatalog,
  baseNodes: CanvasNode[],
  baseEdges: Edge[],
  baseFocusIds: Set<string>,
  selectedRisk: DraftContinuityRisk | undefined,
  selectedMemberId: string,
  originalResult?: DraftImpactResult,
  displayedResult?: DraftImpactResult,
) {
  const sourceMemberId = originalResult?.changeSet.employee.id ?? selectedMemberId
  const roleId = originalResult?.changeSet.role.id ?? selectedRisk?.roleId
  const replacementMemberId = displayedResult?.changeSet.replacementEmployee?.id
  const replacementState = replacementMemberId
    ? displayedResult?.workflowImpacts.some((workflow) => workflow.scenarioStatus === 'BLOCKED') ? 'blocked'
      : displayedResult?.workflowImpacts.some((workflow) => workflow.scenarioStatus === 'DEGRADED' && workflow.scenarioStatus !== workflow.baselineStatus) ? 'degraded'
        : 'restored'
    : undefined
  const recommendationRank = new Map(originalResult?.recommendations.map((candidate) => [candidate.candidate.id, candidate.rank]) ?? [])
  const exclusions = new Map(originalResult?.excludedCandidateReasons.map((candidate) => [candidate.candidate.id, candidate]) ?? [])
  const stepStates = new Map<string, OrganizationSimulationState>()
  const workflowStates = new Map<string, OrganizationSimulationState>()
  displayedResult?.workflowImpacts.forEach((workflow) => {
    workflow.steps.forEach((step) => stepStates.set(step.stepId, resultState(step.scenarioStatus, step.baselineStatus, Boolean(replacementMemberId))))
    workflowStates.set(workflow.workflowId, resultState(workflow.scenarioStatus, workflow.baselineStatus, Boolean(replacementMemberId)))
  })
  const affectedIds = new Set<string>()
  if (sourceMemberId) {
    affectedIds.add(nodeId('member', sourceMemberId))
    const source = catalog.members.find((member) => member.id === sourceMemberId)
    if (source) affectedIds.add(nodeId('team', source.teamId))
  }
  if (roleId) affectedIds.add(nodeId('role', roleId))
  stepStates.forEach((_, id) => affectedIds.add(nodeId('responsibility', id)))
  workflowStates.forEach((_, id) => affectedIds.add(nodeId('workflow', id)))
  recommendationRank.forEach((_, memberId) => addCandidatePath(affectedIds, catalog, memberId))
  if (replacementMemberId) addCandidatePath(affectedIds, catalog, replacementMemberId)

  const nodes = baseNodes.map((node) => {
    const entityId = node.id.slice(node.id.indexOf(':') + 1)
    let simulationState: OrganizationSimulationState | undefined
    let badge: string | undefined
    let detail = node.data.detail
    if (node.data.entityType === 'member') {
      if (entityId === replacementMemberId) {
        simulationState = replacementState; badge = replacementState === 'restored' ? 'Tried · restores coverage' : 'Tried · does not restore'; detail = 'Proposed role holder · click another member to compare'
      } else if (displayedResult && entityId === sourceMemberId) {
        simulationState = 'removed'; badge = 'Role removed'
      } else if (recommendationRank.has(entityId)) {
        simulationState = 'candidate'; badge = `Recommended #${recommendationRank.get(entityId)}`; detail = 'Click to test as replacement'
      } else if (originalResult && exclusions.has(entityId) && entityId !== sourceMemberId) {
        simulationState = 'unsafe'; badge = 'Not recommended'; detail = 'Click to test and inspect the outcome'
      } else if (originalResult && entityId !== sourceMemberId && !catalog.members.find((member) => member.id === entityId)?.roleIds.includes(roleId ?? '')) {
        simulationState = 'candidate'; badge = 'Try alternative'; detail = 'Click to test as replacement'
      } else if (originalResult && entityId === sourceMemberId) {
        simulationState = 'source'; badge = 'Selected source'
      }
    } else if (node.data.entityType === 'role' && entityId === roleId && displayedResult) {
      simulationState = replacementState ?? 'removed'; badge = replacementState === 'restored' ? 'Reassigned · restored' : replacementState ? 'Reassigned · insufficient' : 'Removed'
    } else if (node.data.entityType === 'responsibility') {
      simulationState = stepStates.get(entityId)
      if (simulationState) badge = stateBadge(simulationState)
    } else if (node.data.entityType === 'workflow') {
      simulationState = workflowStates.get(entityId)
      if (simulationState) badge = stateBadge(simulationState)
    }
    const isRelevant = affectedIds.size === 0 || affectedIds.has(node.id)
    const memberAction = node.data.entityType === 'member' ? '. Open context menu for impact actions.' : ''
    return {
      ...node,
      data: { ...node.data, detail, simulationState, badge, emphasis: displayedResult && !isRelevant ? 'dimmed' as const : undefined },
      ariaLabel: `${node.data.entityType} ${node.data.label}${badge ? `. ${badge}` : ''}${memberAction}`,
    }
  })

  const focusIds = new Set(baseFocusIds)
  recommendationRank.forEach((_, memberId) => addCandidatePath(focusIds, catalog, memberId))
  if (replacementMemberId) addCandidatePath(focusIds, catalog, replacementMemberId)
  const edges = buildImpactEdges(baseEdges, roleId, sourceMemberId, replacementMemberId, replacementState, stepStates, workflowStates, recommendationRank, affectedIds, Boolean(displayedResult))
  return { nodes, edges, focusIds }
}

function buildImpactEdges(
  baseEdges: Edge[],
  roleId: string | undefined,
  sourceMemberId: string,
  replacementMemberId: string | undefined,
  replacementState: OrganizationSimulationState | undefined,
  stepStates: Map<string, OrganizationSimulationState>,
  workflowStates: Map<string, OrganizationSimulationState>,
  recommendations: Map<string, number>,
  affectedIds: Set<string>,
  hasResult: boolean,
) {
  const edges = baseEdges.map((edge) => {
    let state: ImpactEdgeState | undefined
    if (roleId && edge.source === nodeId('member', sourceMemberId) && edge.target === nodeId('role', roleId) && hasResult) state = 'removed'
    if (edge.source.startsWith('role:') && edge.target.startsWith('responsibility:')) state = toEdgeState(stepStates.get(edge.target.slice('responsibility:'.length)))
    if (edge.source.startsWith('responsibility:') && edge.target.startsWith('workflow:')) state = toEdgeState(workflowStates.get(edge.target.slice('workflow:'.length)))
    const relevant = !hasResult || (affectedIds.has(edge.source) && affectedIds.has(edge.target))
    return styleImpactEdge(edge, state, relevant)
  })
  if (roleId) {
    recommendations.forEach((rank, memberId) => {
      if (memberId === replacementMemberId) return
      edges.push(styleImpactEdge(graphEdge(`candidate-${memberId}-${roleId}`, nodeId('member', memberId), nodeId('role', roleId), `recommended #${rank}`), 'candidate', true))
    })
    if (replacementMemberId) {
      edges.push(styleImpactEdge(graphEdge(`replacement-${replacementMemberId}-${roleId}`, nodeId('member', replacementMemberId), nodeId('role', roleId), 'proposed assignment'), toEdgeState(replacementState), true))
    }
  }
  return edges
}

function styleImpactEdge(edge: Edge, state: ImpactEdgeState | undefined, relevant: boolean): Edge {
  const color = state === 'removed' || state === 'blocked' ? '#fb7185' : state === 'degraded' ? '#fbbf24' : state === 'candidate' ? '#38bdf8' : state === 'restored' ? '#4ade80' : '#7f6ce5'
  return {
    ...edge,
    animated: state === 'restored' || state === 'candidate',
    style: { ...edge.style, stroke: color, strokeWidth: state ? 2.5 : 1.6, opacity: relevant ? 1 : 0.12, strokeDasharray: state === 'candidate' || state === 'removed' ? '6 5' : undefined },
    labelStyle: { ...edge.labelStyle, fill: state ? color : '#aeb5c7', opacity: relevant ? 1 : 0.08 },
    markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
  }
}

function emphasizeSelectedEdges(edges: Edge[], selectedPathIds: Set<string> | null) {
  if (!selectedPathIds) return edges
  return edges.map((edge) => {
    const highlighted = selectedPathIds.has(edge.source) && selectedPathIds.has(edge.target)
    return {
      ...edge,
      animated: highlighted || edge.animated,
      style: { ...edge.style, opacity: highlighted ? 1 : 0.1, strokeWidth: highlighted ? 2.6 : 1.1 },
      labelStyle: { ...edge.labelStyle, opacity: highlighted ? 1 : 0.06 },
    }
  })
}

function uniqueRisksByRole(risks: DraftContinuityRisk[]) {
  return Array.from(new Map(risks.map((risk) => [risk.roleId, risk])).values())
}

function uniqueRiskActions(risks: DraftContinuityRisk[]) {
  const actions = new Map<string, { risk: DraftContinuityRisk; member: DraftContinuityRisk['members'][number] }>()
  risks.forEach((risk) => risk.members.forEach((member) => {
    const key = `${risk.roleId}:${member.id}`
    if (!actions.has(key)) actions.set(key, { risk, member })
  }))
  return Array.from(actions.values())
}

const impactTypeLabels: Record<CanvasNode['data']['entityType'], string> = {
  team: 'Team',
  member: 'Member',
  role: 'Role',
  responsibility: 'Responsibility',
  workflow: 'Workflow',
}

function parseNodeId(value: string) {
  const [type, ...id] = value.split(':')
  return { type: type as CanvasNode['data']['entityType'], id: id.join(':') }
}

function addCandidatePath(ids: Set<string>, catalog: DraftCatalog, memberId: string) {
  ids.add(nodeId('member', memberId))
  const member = catalog.members.find((candidate) => candidate.id === memberId)
  if (member) ids.add(nodeId('team', member.teamId))
}

function resultState(scenario: DraftImpactResult['workflowImpacts'][number]['scenarioStatus'], baseline: DraftImpactResult['workflowImpacts'][number]['baselineStatus'], mitigation: boolean): OrganizationSimulationState {
  if (mitigation && scenario === baseline) return 'restored'
  if (scenario === 'BLOCKED') return 'blocked'
  if (scenario === 'DEGRADED') return 'degraded'
  return mitigation ? 'restored' : 'source'
}

function toEdgeState(state: OrganizationSimulationState | undefined): ImpactEdgeState | undefined {
  if (state === 'blocked' || state === 'degraded' || state === 'restored') return state
  return undefined
}

function stateBadge(state: OrganizationSimulationState) {
  if (state === 'blocked') return 'Blocked'
  if (state === 'degraded') return 'Degraded'
  if (state === 'restored') return 'Restored'
  return undefined
}

function nodeId(type: CanvasNode['data']['entityType'], id: string) {
  return `${type}:${id}`
}

function graphEdge(id: string, source: string, target: string, label: string): Edge {
  return { id, source, target, label, type: 'smoothstep' }
}

function compactNodes(nodes: CanvasNode[], focusIds: Set<string>) {
  const focused = nodes.filter((node) => focusIds.has(node.id))
  const minimumX = Math.min(...focused.map((node) => node.position.x), 50)
  const minimumY = Math.min(...focused.map((node) => node.position.y), 60)
  return focused.map((node) => ({ ...node, position: { x: node.position.x - minimumX + 50, y: node.position.y - minimumY + 60 } }))
}
