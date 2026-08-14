import { useEffect, useMemo, useState } from 'react'
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { DraftCatalog } from '../../../api/draftCatalog'
import type { DraftImpactResult } from '../../../api/draftImpact'
import type { WorkflowRisk } from './workflowRisks'
import { buildGraph, type ScenarioNode } from './workflowScenarioGraph'

const nodeTypes = { scenario: ScenarioGraphNode }

export default function WorkflowScenarioCanvas({ catalog, workflowId, risks, selectedRiskKey, selectedMemberId, result, onSelect, onRunScenario }: {
  catalog: DraftCatalog
  workflowId: string
  risks: WorkflowRisk[]
  selectedRiskKey: string
  selectedMemberId: string
  result?: DraftImpactResult
  onSelect: (riskKey: string, memberId: string) => void
  onRunScenario: (riskKey: string, memberId: string) => void
}) {
  const workflow = catalog.workflows.find((candidate) => candidate.id === workflowId)
  const { nodes, edges } = useMemo(
    () => buildGraph(catalog, workflowId, risks, selectedRiskKey, selectedMemberId, result),
    [catalog, workflowId, risks, selectedRiskKey, selectedMemberId, result],
  )
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; memberId: string } | null>(null)
  const selectedRisk = risks.find((risk) => risk.key === selectedRiskKey)
  const selectedMember = selectedRisk?.members.find((member) => member.id === selectedMemberId)

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

  function selectNode(node: ScenarioNode) {
    if (node.data.memberId) {
      const matchingRisk = risks.find((risk) => risk.key === selectedRiskKey && risk.members.some((member) => member.id === node.data.memberId))
        ?? risks.find((risk) => risk.members.some((member) => member.id === node.data.memberId))
      if (matchingRisk) onSelect(matchingRisk.key, node.data.memberId)
      return
    }
    if (node.data.riskKey) {
      const risk = risks.find((candidate) => candidate.key === node.data.riskKey)
      if (risk?.members[0]) onSelect(risk.key, risk.members[0].id)
    }
  }

  return (
    <section className="workflow-scenario-graph" aria-labelledby="workflow-scenario-title">
      <div className="scenario-graph-heading">
        <div><p className="section-kicker">{result ? 'Tested scenario' : 'Current baseline'}</p><h3 id="workflow-scenario-title">{workflow?.name}</h3></div>
        <div className="scenario-legend" aria-label="Scenario graph legend">
          <span><i className="selected" />Selected</span><span><i className="safe" />Covered</span><span><i className="degraded" />Degraded</span><span><i className="blocked" />Blocked or removed</span>
        </div>
      </div>
      <p className="scenario-graph-help">Select a node to prepare a test, or right-click a member to run one immediately.</p>
      {selectedRisk && selectedMember ? <div className="scenario-graph-quick-action"><span>{selectedMember.name} → {selectedRisk.roleName}</span><button type="button" onClick={() => onRunScenario(selectedRisk.key, selectedMember.id)}>Run selected what-if</button></div> : null}
      <div className="workflow-scenario-canvas" aria-label={`${workflow?.name ?? 'Workflow'} baseline and impact graph`}>
        <ReactFlow<ScenarioNode, Edge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => { setContextMenu(null); selectNode(node) }}
          onNodeContextMenu={(event, node) => {
            if (!node.data.memberId) return
            event.preventDefault()
            setContextMenu({ x: event.clientX, y: event.clientY, memberId: node.data.memberId })
          }}
          nodesDraggable={false}
          nodesConnectable={false}
          edgesReconnectable={false}
          zoomOnDoubleClick={false}
          fitView
          fitViewOptions={{ padding: 0.2, minZoom: 0.5, maxZoom: 0.95 }}
          minZoom={0.4}
          maxZoom={1.2}
        >
          <Background color="#323746" gap={24} size={1} />
          <Controls showInteractive={false} position="bottom-left" />
        </ReactFlow>
      </div>
      {contextMenu ? <ScenarioContextMenu x={contextMenu.x} y={contextMenu.y} memberId={contextMenu.memberId} risks={risks} onRun={(riskKey, memberId) => { setContextMenu(null); onRunScenario(riskKey, memberId) }} /> : null}
    </section>
  )
}

function ScenarioContextMenu({ x, y, memberId, risks, onRun }: {
  x: number
  y: number
  memberId: string
  risks: WorkflowRisk[]
  onRun: (riskKey: string, memberId: string) => void
}) {
  const member = risks.flatMap((risk) => risk.members).find((candidate) => candidate.id === memberId)
  const uniqueRisks = [...new Map(risks.filter((risk) => risk.members.some((candidate) => candidate.id === memberId)).map((risk) => [risk.roleId, risk])).values()]
  if (!member || uniqueRisks.length === 0) return null
  return (
    <div className="scenario-context-menu" role="menu" aria-label={`What-if actions for ${member.name}`} style={{ left: Math.max(16, Math.min(x, window.innerWidth - 272)), top: Math.max(16, Math.min(y, window.innerHeight - 180)) }} onClick={(event) => event.stopPropagation()}>
      <strong>{member.name}</strong><span>Run a scenario</span>
      {uniqueRisks.map((risk) => <button type="button" role="menuitem" key={risk.roleId} onClick={() => onRun(risk.key, memberId)}>Test losing {risk.roleName}</button>)}
    </div>
  )
}

function ScenarioGraphNode({ data, selected }: NodeProps<ScenarioNode>) {
  return (
    <div className={`scenario-graph-node ${data.kind} ${data.state} ${selected ? 'active' : ''}`}>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <small>{data.kind}</small><strong>{data.label}</strong><span>{data.subtitle}</span>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  )
}
