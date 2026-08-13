import { useEffect, useMemo, useState } from 'react'
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { GraphNodeType, GraphState, Simulation } from '../api/simulations'

type ImpactGraphProps = {
  original: Simulation
  mitigation?: Simulation
}

type ImpactNodeData = {
  label: string
  nodeType: GraphNodeType
  state: GraphState
  detail: string
}

type ImpactFlowNode = Node<ImpactNodeData, 'impact'>

const nodeTypes = { impact: ImpactNode }
const emptyGraphDiff: Simulation['result']['graphDiff'] = { nodes: [], edges: [] }

const nodeTypeOrder: GraphNodeType[] = [
  'EMPLOYEE',
  'ROLE',
  'PERMISSION',
  'CAPABILITY',
  'WORKFLOW_STEP',
  'WORKFLOW',
]

const stateColors: Record<GraphState, string> = {
  UNCHANGED: '#7f8798',
  REMOVED: '#fb7185',
  ADDED: '#4ade80',
  DEGRADED: '#fbbf24',
  BLOCKED: '#fb7185',
  RESTORED: '#4ade80',
}

export default function ImpactGraph({ original, mitigation }: ImpactGraphProps) {
  const [view, setView] = useState<'impact' | 'mitigation'>('impact')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const mitigationId = mitigation?.id

  useEffect(() => {
    if (mitigationId) {
      setView('mitigation')
    }
  }, [mitigationId])

  const activeSimulation = view === 'mitigation' && mitigation ? mitigation : original
  const graph = activeSimulation.result.graphDiff ?? emptyGraphDiff
  const preferredNode = graph.nodes.find((node) => node.type === 'WORKFLOW') ?? graph.nodes[0]
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId) ?? preferredNode
  const { nodes, edges } = useMemo(
    () => buildFlowElements(graph, selectedNode?.id ?? null),
    [graph, selectedNode?.id],
  )
  const nodeById = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node])),
    [graph.nodes],
  )

  return (
    <section className="graph-panel" aria-labelledby="impact-graph-title">
      <div className="graph-heading">
        <div>
          <p className="section-kicker">Visual blast radius</p>
          <h3 id="impact-graph-title">Focused impact graph</h3>
          <p>
            Follow the changed assignment through permissions and capabilities to the business workflows it affects.
          </p>
        </div>
        {mitigation && (
          <div className="graph-view-toggle" aria-label="Graph scenario view">
            <button
              type="button"
              className={view === 'impact' ? 'active' : ''}
              aria-pressed={view === 'impact'}
              onClick={() => setView('impact')}
            >
              Original impact
            </button>
            <button
              type="button"
              className={view === 'mitigation' ? 'active' : ''}
              aria-pressed={view === 'mitigation'}
              onClick={() => setView('mitigation')}
            >
              With mitigation
            </button>
          </div>
        )}
      </div>

      <div className="graph-legend" aria-label="Graph state legend">
        {(['UNCHANGED', 'REMOVED', 'DEGRADED', 'BLOCKED', 'ADDED', 'RESTORED'] as GraphState[]).map((state) => (
          <span key={state}>
            <i className={`graph-state-dot ${state.toLowerCase()}`} aria-hidden="true" />
            {stateLabel(state)}
          </span>
        ))}
      </div>

      {nodes.length > 0 ? (
        <div className="graph-workspace">
          <div className="impact-graph-canvas" aria-label={`${view === 'impact' ? 'Original impact' : 'Mitigated'} relationship graph`}>
            <ReactFlow<ImpactFlowNode, Edge>
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodeClick={(_, node) => setSelectedNodeId(node.id)}
              nodesDraggable={false}
              nodesConnectable={false}
              edgesReconnectable={false}
              zoomOnDoubleClick={false}
              fitView
              fitViewOptions={{ padding: 0.18, minZoom: 0.45, maxZoom: 0.92 }}
              minZoom={0.35}
              maxZoom={1.2}
            >
              <Background color="#323746" gap={24} size={1} />
              <Controls showInteractive={false} position="bottom-left" />
            </ReactFlow>
          </div>

          <aside className="graph-node-details" aria-live="polite">
            <p className="section-kicker">Selected node</p>
            {selectedNode ? (
              <>
                <span className={`node-detail-state ${selectedNode.state.toLowerCase()}`}>
                  {stateLabel(selectedNode.state)}
                </span>
                <h4>{selectedNode.label}</h4>
                <p className="node-detail-type">{nodeTypeLabel(selectedNode.type)}</p>
                <p>{selectedNode.detail}</p>
              </>
            ) : (
              <p>Select a node to inspect why it appears in this path.</p>
            )}
          </aside>
        </div>
      ) : (
        <div className="graph-empty-state">
          <strong>No affected relationship path was produced.</strong>
          <p>The written impact result remains available above.</p>
        </div>
      )}

      {graph.edges.length > 0 && (
        <details className="graph-text-alternative">
          <summary>Read the relationship path as text</summary>
          <ol>
            {graph.edges.map((edge) => {
              const source = nodeById.get(edge.sourceNodeId)
              const target = nodeById.get(edge.targetNodeId)
              return (
                <li key={edge.id}>
                  <span>{source?.label}</span>
                  <strong>{relationshipLabel(edge.relationship)}</strong>
                  <span>{target?.label}</span>
                  <em className={edge.state.toLowerCase()}>{stateLabel(edge.state)}</em>
                </li>
              )
            })}
          </ol>
        </details>
      )}
    </section>
  )
}

function ImpactNode({ data, selected }: NodeProps<ImpactFlowNode>) {
  return (
    <div className={`impact-graph-node ${data.state.toLowerCase()} ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <span className="impact-node-type">{nodeTypeLabel(data.nodeType)}</span>
      <strong>{data.label}</strong>
      <span className="impact-node-state">{stateLabel(data.state)}</span>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  )
}

function buildFlowElements(
  graph: Simulation['result']['graphDiff'],
  selectedNodeId: string | null,
) {
  const groupedNodes = new Map<GraphNodeType, Simulation['result']['graphDiff']['nodes']>()
  nodeTypeOrder.forEach((type) => groupedNodes.set(type, []))
  graph.nodes.forEach((node) => groupedNodes.get(node.type)?.push(node))

  const nodes: ImpactFlowNode[] = []
  nodeTypeOrder.forEach((type, columnIndex) => {
    const group = groupedNodes.get(type) ?? []
    group.sort((left, right) => left.label.localeCompare(right.label))
    const groupHeight = Math.max(0, (group.length - 1) * 142)
    group.forEach((node, rowIndex) => {
      nodes.push({
        id: node.id,
        type: 'impact',
        position: {
          x: columnIndex * 242,
          y: 220 - groupHeight / 2 + rowIndex * 142,
        },
        data: {
          label: node.label,
          nodeType: node.type,
          state: node.state,
          detail: node.detail,
        },
        selected: node.id === selectedNodeId,
        focusable: true,
        ariaLabel: `${nodeTypeLabel(node.type)} ${node.label}. ${stateLabel(node.state)}. ${node.detail}`,
      })
    })
  })

  const edges: Edge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    type: 'smoothstep',
    label: relationshipLabel(edge.relationship),
    focusable: true,
    animated: edge.state === 'ADDED' || edge.state === 'RESTORED',
    style: {
      stroke: stateColors[edge.state],
      strokeWidth: edge.state === 'UNCHANGED' ? 1.5 : 2.4,
      strokeDasharray: edge.state === 'REMOVED' ? '7 6' : undefined,
    },
    labelStyle: {
      fill: '#aeb5c7',
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: '0.03em',
    },
    labelBgStyle: { fill: '#161925', fillOpacity: 0.95 },
    labelBgPadding: [5, 3],
    labelBgBorderRadius: 5,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: stateColors[edge.state],
      width: 16,
      height: 16,
    },
  }))

  return { nodes, edges }
}

function stateLabel(state: GraphState) {
  return {
    UNCHANGED: 'Unchanged',
    REMOVED: 'Removed',
    ADDED: 'Added',
    DEGRADED: 'Degraded',
    BLOCKED: 'Blocked',
    RESTORED: 'Restored',
  }[state]
}

function nodeTypeLabel(type: GraphNodeType) {
  return {
    EMPLOYEE: 'Employee',
    ROLE: 'Role',
    PERMISSION: 'Permission',
    CAPABILITY: 'Capability',
    WORKFLOW_STEP: 'Workflow step',
    WORKFLOW: 'Workflow',
  }[type]
}

function relationshipLabel(relationship: string) {
  return {
    ASSIGNED_ROLE: 'assigned role',
    GRANTS_PERMISSION: 'grants',
    ENABLES_CAPABILITY: 'enables',
    REQUIRED_BY_STEP: 'required by',
    PART_OF_WORKFLOW: 'part of',
  }[relationship] ?? relationship.toLowerCase().replaceAll('_', ' ')
}
