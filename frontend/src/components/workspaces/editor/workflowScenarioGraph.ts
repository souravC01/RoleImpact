import { MarkerType, type Edge, type Node } from '@xyflow/react'
import type { DraftCatalog } from '../../../api/draftCatalog'
import type { DraftImpactResult } from '../../../api/draftImpact'
import type { WorkflowRisk } from './workflowRisks'

type ScenarioState = 'baseline' | 'selected' | 'removed' | 'blocked' | 'degraded' | 'safe'
type ScenarioKind = 'member' | 'role' | 'responsibility' | 'workflow'
type ScenarioNodeData = {
  label: string
  subtitle: string
  kind: ScenarioKind
  state: ScenarioState
  riskKey?: string
  memberId?: string
}
export type ScenarioNode = Node<ScenarioNodeData, 'scenario'>

const stateColors: Record<ScenarioState, string> = {
  baseline: '#7f8798', selected: '#a78bfa', removed: '#fb7185', blocked: '#fb7185', degraded: '#fbbf24', safe: '#4ade80',
}

export function buildGraph(catalog: DraftCatalog, workflowId: string, risks: WorkflowRisk[], selectedRiskKey: string, selectedMemberId: string, result?: DraftImpactResult) {
  const workflow = catalog.workflows.find((candidate) => candidate.id === workflowId)
  if (!workflow) return { nodes: [] as ScenarioNode[], edges: [] as Edge[] }
  const selectedRisk = risks.find((risk) => risk.key === selectedRiskKey)
  const workflowImpact = result?.workflowImpacts.find((impact) => impact.workflowId === workflowId)
  const requirements = workflow.requirements.toSorted((left, right) => left.position - right.position)
  const requirementIndex = new Map(requirements.map((requirement, index) => [requirement.id, index]))
  const roleIds = [...new Set(requirements.flatMap((requirement) => requirement.roleIds).filter((roleId) => risks.some((risk) => risk.roleId === roleId)))]
  const roleLane = new Map<string, number>(roleIds.map((roleId) => {
    const lanes = risks.filter((risk) => risk.roleId === roleId).map((risk) => requirementIndex.get(risk.requirementId) ?? 0)
    return [roleId, lanes.reduce((sum, lane) => sum + lane, 0) / Math.max(lanes.length, 1)] as const
  }))
  const members = catalog.members
    .filter((member) => risks.some((risk) => risk.members.some((candidate) => candidate.id === member.id)))
    .map((member) => {
      const lanes = member.roleIds.filter((roleId) => roleLane.has(roleId)).map((roleId) => roleLane.get(roleId) ?? 0)
      return { member, lane: Math.max(0, Math.min(requirements.length - 1, Math.round(lanes.reduce((sum, lane) => sum + lane, 0) / Math.max(lanes.length, 1)))) }
    })
    .toSorted((left, right) => left.lane - right.lane || left.member.name.localeCompare(right.member.name))
  const nodes: ScenarioNode[] = []

  const membersByLane = new Map<number, typeof members>()
  members.forEach((member) => membersByLane.set(member.lane, [...(membersByLane.get(member.lane) ?? []), member]))
  const laneY: number[] = []
  let nextLaneY = 70
  requirements.forEach((_, index) => {
    const count = membersByLane.get(index)?.length ?? 0
    laneY.push(nextLaneY + Math.max(0, (count - 1) * 52))
    nextLaneY += Math.max(145, count * 104) + 24
  })
  members.forEach(({ member, lane }) => {
    const laneMembers = membersByLane.get(lane) ?? []
    const memberIndex = laneMembers.findIndex((candidate) => candidate.member.id === member.id)
    const memberY = laneY[lane] - ((laneMembers.length - 1) * 104) / 2 + memberIndex * 104
    nodes.push({
      id: `member:${member.id}`, type: 'scenario', position: { x: 20, y: memberY },
      data: { label: member.name, subtitle: member.status.toLowerCase(), kind: 'member', state: member.id === selectedMemberId ? 'selected' : 'baseline', memberId: member.id },
      ariaLabel: `Member ${member.name}. Select to test their role access; open the context menu to run immediately.`,
    })
  })
  roleIds.forEach((roleId) => {
    const role = catalog.roles.find((candidate) => candidate.id === roleId)
    const risk = risks.find((candidate) => candidate.roleId === roleId)
    nodes.push({
      id: `role:${roleId}`, type: 'scenario', position: { x: 285, y: interpolateLaneY(roleLane.get(roleId) ?? 0, laneY) },
      data: { label: role?.name ?? 'Role', subtitle: `${role?.memberCount ?? 0} holders`, kind: 'role', state: roleId === selectedRisk?.roleId ? 'selected' : 'baseline', riskKey: risk?.key },
      ariaLabel: `Role ${role?.name}. ${role?.memberCount ?? 0} holders.`,
    })
  })
  requirements.forEach((requirement, index) => {
    const impact = workflowImpact?.steps.find((step) => step.stepId === requirement.id)
    const risk = risks.find((candidate) => candidate.requirementId === requirement.id)
    nodes.push({
      id: `step:${requirement.id}`, type: 'scenario', position: { x: 550, y: laneY[index] },
      data: { label: requirement.name, subtitle: `minimum ${requirement.minimumActors} · healthy ${requirement.resilienceTarget}`, kind: 'responsibility', state: result ? statusState(impact?.scenarioStatus) : (risk?.key === selectedRiskKey ? 'selected' : 'baseline'), riskKey: risk?.key },
      ariaLabel: `Workflow responsibility ${requirement.name}. Minimum ${requirement.minimumActors}; healthy target ${requirement.resilienceTarget}.`,
    })
  })
  nodes.push({
    id: `workflow:${workflow.id}`, type: 'scenario', position: { x: 830, y: laneY.reduce((sum, y) => sum + y, 0) / Math.max(laneY.length, 1) },
    data: { label: workflow.name, subtitle: `${workflow.criticality.toLowerCase()} criticality`, kind: 'workflow', state: result ? statusState(workflowImpact?.scenarioStatus) : 'baseline' },
    ariaLabel: `Workflow ${workflow.name}. ${workflow.criticality} criticality.`,
  })

  const nodeStates = new Map(nodes.map((node) => [node.id, node.data.state]))
  const edges: Edge[] = []
  members.forEach(({ member }) => roleIds.filter((roleId) => member.roleIds.includes(roleId)).forEach((roleId) => {
    const removedAssignment = Boolean(result && member.id === selectedMemberId && roleId === selectedRisk?.roleId)
    edges.push(scenarioEdge(`member-role:${member.id}:${roleId}`, `member:${member.id}`, `role:${roleId}`, 'holds', nodeStates, removedAssignment ? 'removed' : undefined))
  }))
  risks.forEach((risk) => edges.push(scenarioEdge(`role-step:${risk.roleId}:${risk.requirementId}`, `role:${risk.roleId}`, `step:${risk.requirementId}`, 'can perform', nodeStates, result ? nodeStates.get(`step:${risk.requirementId}`) : undefined)))
  requirements.forEach((requirement) => edges.push(scenarioEdge(`step-workflow:${requirement.id}`, `step:${requirement.id}`, `workflow:${workflow.id}`, 'supports', nodeStates)))
  return { nodes, edges }
}

function interpolateLaneY(lane: number, laneY: number[]) {
  const lower = Math.floor(lane)
  const upper = Math.ceil(lane)
  if (lower === upper || !laneY[upper]) return laneY[lower] ?? 70
  return laneY[lower] + (laneY[upper] - laneY[lower]) * (lane - lower)
}

function statusState(status?: 'OPERATIONAL' | 'DEGRADED' | 'BLOCKED'): ScenarioState {
  if (status === 'BLOCKED') return 'blocked'
  if (status === 'DEGRADED') return 'degraded'
  return 'safe'
}

function scenarioEdge(id: string, source: string, target: string, label: string, states: Map<string, ScenarioState>, forcedState?: ScenarioState): Edge {
  const state = forcedState ?? strongestState(states.get(source) ?? 'baseline', states.get(target) ?? 'baseline')
  return { id, source, target, label, type: 'smoothstep', animated: state === 'blocked' || state === 'degraded', style: { stroke: stateColors[state], strokeWidth: state === 'baseline' ? 1.5 : 2.3, strokeDasharray: state === 'removed' ? '7 6' : undefined }, labelStyle: { fill: '#aeb5c7', fontSize: 9, fontWeight: 700 }, labelBgStyle: { fill: '#12151e', fillOpacity: 0.95 }, markerEnd: { type: MarkerType.ArrowClosed, color: stateColors[state], width: 16, height: 16 } }
}

function strongestState(left: ScenarioState, right: ScenarioState): ScenarioState {
  const order: ScenarioState[] = ['baseline', 'safe', 'selected', 'degraded', 'removed', 'blocked']
  return order.indexOf(left) > order.indexOf(right) ? left : right
}
