import { useCallback, useEffect, useMemo, useState, type DragEvent, type FormEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type XYPosition,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  addWorkflowRequirement,
  createDraftMember,
  createDraftRole,
  createDraftTeam,
  createQuickWorkflow,
  deleteDraftMember,
  deleteDraftRole,
  deleteDraftTeam,
  deleteQuickWorkflow,
  replaceMemberRoles,
  updateDraftMember,
  updateDraftRole,
  type DraftCatalog,
  type DraftMember,
} from '../../../api/draftCatalog'
import FullOrganizationImpactCanvas, { type FullOrganizationImpactCanvasProps } from './FullOrganizationImpactCanvas'

type EntityType = 'team' | 'member' | 'role' | 'workflow'
type GraphEntityType = EntityType | 'responsibility'
export type OrganizationSimulationState = 'source' | 'candidate' | 'unsafe' | 'removed' | 'blocked' | 'degraded' | 'restored'
export type CanvasNodeData = {
  label: string
  entityType: GraphEntityType
  detail: string
  emphasis?: 'highlighted' | 'dimmed'
  simulationState?: OrganizationSimulationState
  badge?: string
  onImpactActions?: (event: ReactMouseEvent<HTMLButtonElement>) => void
}
export type CanvasNode = Node<CanvasNodeData, 'organization'>
type PendingCreate = { entityType: EntityType; position?: XYPosition }
type QuickCreateOptions = {
  department: string
  sensitivity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  criticality: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
}

const nodeTypes = { organization: OrganizationNode }
const entityTypes: EntityType[] = ['team', 'member', 'role', 'workflow']
const graphEntityTypes: GraphEntityType[] = ['team', 'member', 'role', 'responsibility', 'workflow']
const typeLabels: Record<GraphEntityType, string> = {
  team: 'Team',
  member: 'Member',
  role: 'Role',
  workflow: 'Workflow',
  responsibility: 'Responsibility',
}

export default function OrganizationCanvas(props: {
  workspaceId: string
  catalog: DraftCatalog
  initialFocus: boolean
  onOpenInventory: () => void
  onOpenWorkflows: () => void
  onTestImpact: () => void
}) {
  return (
    <ReactFlowProvider>
      <OrganizationCanvasInner {...props} />
    </ReactFlowProvider>
  )
}

export function OrganizationImpactCanvas(props: FullOrganizationImpactCanvasProps) {
  const baseNodes = useMemo(() => buildNodes(props.catalog, props.workspaceId), [props.catalog, props.workspaceId])
  const baseEdges = useMemo(() => buildEdges(props.catalog), [props.catalog])
  const baseFocusIds = useMemo(() => focusedNodeIds(props.catalog, props.workflowId), [props.catalog, props.workflowId])
  const getRelatedPathIds = useCallback((selectedNodeId: string) => relatedPathIds(props.catalog, selectedNodeId), [props.catalog])
  return (
    <ReactFlowProvider>
      <FullOrganizationImpactCanvas
        {...props}
        baseNodes={baseNodes}
        baseEdges={baseEdges}
        baseFocusIds={baseFocusIds}
        nodeTypes={nodeTypes}
        getRelatedPathIds={getRelatedPathIds}
      />
    </ReactFlowProvider>
  )
}

function OrganizationCanvasInner({ workspaceId, catalog, initialFocus, onOpenInventory, onOpenWorkflows, onTestImpact }: {
  workspaceId: string
  catalog: DraftCatalog
  initialFocus: boolean
  onOpenInventory: () => void
  onOpenWorkflows: () => void
  onTestImpact: () => void
}) {
  const queryClient = useQueryClient()
  const { screenToFlowPosition, fitView } = useReactFlow<CanvasNode, Edge>()
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(buildNodes(catalog, workspaceId))
  const [layoutMode, setLayoutMode] = useState<'automatic' | 'manual'>(() => Object.keys(readPositions(workspaceId)).length > 0 ? 'manual' : 'automatic')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [pendingCreate, setPendingCreate] = useState<PendingCreate | null>(null)
  const [search, setSearch] = useState('')
  const [inventoryType, setInventoryType] = useState<GraphEntityType | 'all'>('all')
  const [notice, setNotice] = useState<string | null>(null)
  const [scope, setScope] = useState<'focus' | 'full'>(initialFocus && catalog.workflows.length > 0 ? 'focus' : 'full')
  const [focusedWorkflowId, setFocusedWorkflowId] = useState(catalog.workflows[0]?.id ?? '')
  const [pendingDelete, setPendingDelete] = useState<CanvasNode | null>(null)

  useEffect(() => {
    setNodes((currentNodes) => layoutMode === 'automatic'
      ? buildNodes(catalog, workspaceId, false)
      : mergeCatalogNodes(currentNodes, catalog, workspaceId))
    if (layoutMode === 'automatic') window.requestAnimationFrame(() => void fitView({ duration: 300, padding: 0.25 }))
  }, [catalog, fitView, layoutMode, setNodes, workspaceId])

  useEffect(() => {
    if (catalog.workflows.length === 0) {
      setFocusedWorkflowId('')
      setScope('full')
    }
    else if (!catalog.workflows.some((workflow) => workflow.id === focusedWorkflowId)) {
      setFocusedWorkflowId(catalog.workflows[0].id)
    }
  }, [catalog.workflows, focusedWorkflowId])

  useEffect(() => {
    window.requestAnimationFrame(() => void fitView({ duration: 300, padding: 0.28 }))
  }, [fitView, focusedWorkflowId, scope])

  const pathIds = useMemo(() => selectedNodeId ? relatedPathIds(catalog, selectedNodeId) : null, [catalog, selectedNodeId])
  const edges = useMemo(() => emphasizeEdges(buildEdges(catalog), pathIds), [catalog, pathIds])
  const focusIds = useMemo(() => focusedNodeIds(catalog, focusedWorkflowId), [catalog, focusedWorkflowId])
  const emphasizedNodes = useMemo(() => nodes.map((node) => ({ ...node, data: { ...node.data, emphasis: pathIds ? pathIds.has(node.id) ? 'highlighted' as const : 'dimmed' as const : undefined } })), [nodes, pathIds])
  const visibleNodes = scope === 'full' ? emphasizedNodes : compactFocusedNodes(emphasizedNodes, focusIds)
  const visibleEdges = scope === 'full' ? edges : edges.filter((edge) => focusIds.has(edge.source) && focusIds.has(edge.target))
  const selectedNode = nodes.find((node) => node.id === selectedNodeId)
  const inventoryNodes = nodes.filter((node) => {
    const matchesType = inventoryType === 'all' || node.data.entityType === inventoryType
    return matchesType && node.data.label.toLowerCase().includes(search.trim().toLowerCase())
  })

  const connectionMutation = useMutation({
    mutationFn: async (connection: Connection) => connectEntities(workspaceId, catalog, connection),
    onSuccess: (nextCatalog) => {
      queryClient.setQueryData(['draft-catalog', workspaceId], nextCatalog)
      void queryClient.invalidateQueries({ queryKey: ['draft-continuity', workspaceId] })
      setNotice('Relationship saved')
    },
    onError: (error: Error) => setNotice(error.message),
  })
  const deleteMutation = useMutation({
    mutationFn: (node: CanvasNode) => deleteEntity(workspaceId, node, catalog),
    onSuccess: (nextCatalog, node) => {
      queryClient.setQueryData(['draft-catalog', workspaceId], nextCatalog)
      void queryClient.invalidateQueries({ queryKey: ['draft-continuity', workspaceId] })
      removeSavedPosition(workspaceId, node.id)
      setSelectedNodeId(null)
      setPendingDelete(null)
      setNotice(`${typeLabels[node.data.entityType]} deleted`)
    },
    onError: (error: Error) => setNotice(error.message),
  })

  function beginCreate(entityType: EntityType, position?: XYPosition) {
    const prerequisite = prerequisiteMessage(entityType, catalog)
    if (prerequisite) {
      setNotice(prerequisite)
      return
    }
    setNotice(null)
    setPendingCreate({ entityType, position })
  }

  function dropEntity(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const entityType = event.dataTransfer.getData('application/roleimpact-node') as EntityType
    if (!entityTypes.includes(entityType)) return
    beginCreate(entityType, screenToFlowPosition({ x: event.clientX, y: event.clientY }))
  }

  function savePosition(node: CanvasNode) {
    setLayoutMode('manual')
    const positions = readPositions(workspaceId)
    positions[node.id] = node.position
    localStorage.setItem(positionKey(workspaceId), JSON.stringify(positions))
  }

  function autoArrange() {
    localStorage.removeItem(positionKey(workspaceId))
    setLayoutMode('automatic')
    setNodes(buildNodes(catalog, workspaceId, false))
    window.requestAnimationFrame(() => void fitView({ duration: 350, padding: 0.25 }))
  }

  function focusNode(nodeId: string) {
    if (!focusIds.has(nodeId)) setScope('full')
    setSelectedNodeId(nodeId)
    const target = nodes.find((node) => node.id === nodeId)
    if (target) window.requestAnimationFrame(() => void fitView({ nodes: [target], duration: 350, maxZoom: 1.05, padding: 1.5 }))
  }

  return (
    <div className="canvas-builder">
      <aside className="canvas-toolbox" aria-label="Graph object toolbox">
        <div>
          <p className="section-kicker">Objects</p>
          <h3>Drag onto canvas</h3>
          <p>Drop an object, give it a name, and connect it to the next layer.</p>
        </div>
        <div className="canvas-palette">
          {entityTypes.map((entityType) => {
            const blocked = Boolean(prerequisiteMessage(entityType, catalog))
            return (
              <button
                key={entityType}
                type="button"
                draggable={!blocked && entityType !== 'workflow'}
                disabled={blocked}
                className={`palette-object ${entityType}`}
                aria-label={entityType === 'workflow' ? 'Build Workflow' : `Add ${typeLabels[entityType]}`}
                onDragStart={(event) => {
                  event.dataTransfer.setData('application/roleimpact-node', entityType)
                  event.dataTransfer.effectAllowed = 'copy'
                }}
                onClick={() => entityType === 'workflow' ? onOpenWorkflows() : beginCreate(entityType)}
              >
                <span aria-hidden="true">{entityIcon(entityType)}</span>
                <strong>{typeLabels[entityType]}</strong>
                <small>{paletteDetail(entityType)}</small>
              </button>
            )
          })}
        </div>
        <div className="canvas-help">
          <strong>Connect in this order</strong>
            <span>Team → Member → Role → Responsibility → Workflow</span>
        </div>
      </aside>

      <section className="organization-canvas" aria-label="Organization relationship canvas">
        <div className="canvas-toolbar">
          <div><strong>Organization map</strong><span>{scope === 'focus' ? `${visibleNodes.length} of ${nodes.length} objects in focus` : `${nodes.length} objects · ${edges.length} connections`}</span></div>
          <div className="canvas-toolbar-actions">
            {catalog.workflows.length > 0 ? <label><span className="sr-only">Focused workflow</span><select value={focusedWorkflowId} onChange={(event) => { setFocusedWorkflowId(event.target.value); setScope('focus') }}>{catalog.workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}</select></label> : null}
            {catalog.workflows.length > 0 ? <button type="button" className="secondary-button" onClick={() => setScope(scope === 'focus' ? 'full' : 'focus')}>{scope === 'focus' ? 'Show full map' : 'Focus workflow'}</button> : null}
            {scope === 'full' ? <button type="button" className="secondary-button" onClick={autoArrange}>Re-arrange graph</button> : null}
            <button type="button" className="secondary-button" onClick={() => void fitView({ duration: 350, padding: 0.25 })}>Fit graph</button>
          </div>
        </div>
        <div
          className="canvas-dropzone"
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }}
          onDrop={dropEntity}
        >
          <ReactFlow<CanvasNode, Edge>
            nodes={visibleNodes}
            edges={visibleEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            nodesDraggable={scope === 'full'}
            onNodeDragStop={(_, node) => { if (scope === 'full') savePosition(node) }}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            onConnect={(connection) => connectionMutation.mutate(connection)}
            isValidConnection={(connection) => isValidConnection(connection, catalog)}
            fitView
            fitViewOptions={{ padding: 0.28, minZoom: 0.55, maxZoom: 1 }}
            minZoom={0.35}
            maxZoom={1.4}
            deleteKeyCode={null}
          >
            <Background color="#333849" gap={24} size={1} />
            <Controls showInteractive={false} position="bottom-left" />
          </ReactFlow>
          {nodes.length === 0 ? (
            <div className="canvas-empty">
              <span aria-hidden="true">＋</span>
              <strong>Start with a team</strong>
              <p>Drag a Team here or select it from the object tray.</p>
              <button type="button" onClick={() => beginCreate('team')}>Create first team</button>
            </div>
          ) : null}
        </div>
        {notice ? <div className="canvas-notice" role="status">{notice}<button type="button" aria-label="Dismiss message" onClick={() => setNotice(null)}>×</button></div> : null}
      </section>

      <aside className="canvas-inventory" aria-label="Organization inventory">
        <div className="inventory-heading">
          <div><p className="section-kicker">Inventory</p><h3>What you have</h3></div>
          <button type="button" className="edit-text" onClick={onOpenInventory}>Edit details</button>
        </div>
        <label className="inventory-search"><span className="sr-only">Search inventory</span><input value={search} placeholder="Search objects" onChange={(event) => setSearch(event.target.value)} /></label>
        <div className="inventory-filters" aria-label="Inventory filters">
          {(['all', ...graphEntityTypes] as const).map((entityType) => (
            <button key={entityType} type="button" className={inventoryType === entityType ? 'active' : ''} onClick={() => setInventoryType(entityType)}>{entityType === 'all' ? 'All' : typeLabels[entityType]}</button>
          ))}
        </div>
        <div className="inventory-list">
          {inventoryNodes.map((node) => (
            <button key={node.id} type="button" className={selectedNodeId === node.id ? 'active' : ''} onClick={() => focusNode(node.id)}>
              <span className={`inventory-icon ${node.data.entityType}`} aria-hidden="true">{entityIcon(node.data.entityType)}</span>
              <span><strong>{node.data.label}</strong><small>{node.data.detail}</small></span>
            </button>
          ))}
          {inventoryNodes.length === 0 ? <p>No matching objects.</p> : null}
        </div>
        {selectedNode ? (
          <div className="inventory-selection">
            <span>{typeLabels[selectedNode.data.entityType]}</span>
            <strong>{selectedNode.data.label}</strong>
            <p>{selectedNode.data.detail}</p>
            <div className="inventory-selection-actions">
              {(selectedNode.data.entityType === 'member' || selectedNode.data.entityType === 'role') ? <button type="button" className="edit-text" onClick={onTestImpact}>Test impact</button> : null}
              {selectedNode.data.entityType === 'workflow' ? <button type="button" className="edit-text" onClick={onOpenWorkflows}>Edit workflow</button> : null}
              {selectedNode.data.entityType !== 'responsibility' ? <button type="button" className="danger-text" onClick={() => { deleteMutation.reset(); setPendingDelete(selectedNode) }}>Delete object</button> : null}
            </div>
          </div>
        ) : null}
      </aside>

      {pendingCreate ? (
        <QuickCreate
          workspaceId={workspaceId}
          catalog={catalog}
          pending={pendingCreate}
          onCancel={() => setPendingCreate(null)}
          onCreated={(nextCatalog, createdId, successMessage) => {
            if (layoutMode === 'manual') {
              const positions = readPositions(workspaceId)
              positions[createdId] = nextOpenPosition(pendingCreate.entityType, nodes, pendingCreate.position)
              localStorage.setItem(positionKey(workspaceId), JSON.stringify(positions))
            }
            queryClient.setQueryData(['draft-catalog', workspaceId], nextCatalog)
            void queryClient.invalidateQueries({ queryKey: ['draft-continuity', workspaceId] })
            setSelectedNodeId(null)
            setPendingCreate(null)
            setNotice(successMessage ?? `${typeLabels[pendingCreate.entityType]} created`)
          }}
        />
      ) : null}
      {pendingDelete ? (
        <DeleteConfirmation
          node={pendingDelete}
          catalog={catalog}
          isPending={deleteMutation.isPending}
          error={deleteMutation.error?.message}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => deleteMutation.mutate(pendingDelete)}
        />
      ) : null}
    </div>
  )
}

function QuickCreate({ workspaceId, catalog, pending, onCancel, onCreated }: {
  workspaceId: string
  catalog: DraftCatalog
  pending: PendingCreate
  onCancel: () => void
  onCreated: (catalog: DraftCatalog, nodeId: string, successMessage?: string) => void
}) {
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState(defaultParentId(pending.entityType, catalog))
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [memberSearch, setMemberSearch] = useState('')
  const [department, setDepartment] = useState('General')
  const [sensitivity, setSensitivity] = useState<QuickCreateOptions['sensitivity']>('MEDIUM')
  const [criticality, setCriticality] = useState<QuickCreateOptions['criticality']>('HIGH')
  const mutation = useMutation({
    mutationFn: async () => createEntity(workspaceId, pending.entityType, name.trim(), parentId, catalog, selectedMemberIds, { department, sensitivity, criticality }),
    onSuccess: ({ catalog: nextCatalog, nodeId }) => {
      const reused = findExistingEntity(pending.entityType, name, catalog)
      const successMessage = reused ? pending.entityType === 'role' ? 'Role assigned' : 'Workflow updated' : undefined
      onCreated(nextCatalog, nodeId, successMessage)
    },
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    mutation.mutate()
  }

  const relationshipOptions = parentOptions(pending.entityType, catalog)
  const existingEntity = findExistingEntity(pending.entityType, name, catalog)
  useEffect(() => {
    if (pending.entityType !== 'role' || !existingEntity || !('memberCount' in existingEntity)) return
    setSelectedMemberIds(catalog.members.filter((member) => member.roleIds.includes(existingEntity.id)).map((member) => member.id))
  }, [catalog.members, existingEntity, pending.entityType])
  const roleAlreadyRequired = pending.entityType === 'workflow' && existingEntity && 'requirements' in existingEntity
    ? existingEntity.requirements.some((requirement) => requirement.roleIds.includes(parentId))
    : false
  const cannotReuse = pending.entityType === 'workflow' && existingEntity && (!('quickManaged' in existingEntity && existingEntity.quickManaged) || roleAlreadyRequired)
  const visibleMembers = catalog.members.filter((member) => member.name.toLowerCase().includes(memberSearch.trim().toLowerCase()))
  return (
    <div className="quick-create-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
      <form className="quick-create-card" aria-label={`Create ${typeLabels[pending.entityType]}`} onSubmit={submit}>
        <div className="quick-create-heading">
          <div className="quick-create-icon" aria-hidden="true">{entityIcon(pending.entityType)}</div>
          <div><p className="section-kicker">New {typeLabels[pending.entityType]}</p><h3>Name this object</h3><p>You can add optional details later from the inventory.</p></div>
        </div>
        <div className="quick-create-body">
          <label className="editor-field"><span>{typeLabels[pending.entityType]} name</span><input autoFocus value={name} maxLength={160} placeholder={namePlaceholder(pending.entityType)} onChange={(event) => setName(event.target.value)} /></label>
          {pending.entityType === 'team' ? <label className="editor-field"><span>Department (optional)</span><input value={department} maxLength={120} placeholder="General" onChange={(event) => setDepartment(event.target.value)} /></label> : null}
          {pending.entityType === 'role' && !existingEntity ? <label className="editor-field"><span>Sensitivity</span><select value={sensitivity} onChange={(event) => setSensitivity(event.target.value as QuickCreateOptions['sensitivity'])}>{enumChoices(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])}</select></label> : null}
          {pending.entityType === 'workflow' && !existingEntity ? <label className="editor-field"><span>Business criticality</span><select value={criticality} onChange={(event) => setCriticality(event.target.value as QuickCreateOptions['criticality'])}>{enumChoices(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])}</select></label> : null}
          {pending.entityType === 'role' ? (
            <fieldset className="shared-role-picker">
              <legend>Assign to members</legend>
              <div className="role-picker-summary"><span>Optional — choose one or more holders.</span><strong>{selectedMemberIds.length} selected</strong></div>
              <label className="editor-field role-member-search"><span className="sr-only">Search members</span><input value={memberSearch} placeholder="Search members" onChange={(event) => setMemberSearch(event.target.value)} /></label>
              <div className="quick-role-member-list">
                {visibleMembers.map((member) => <label key={member.id}><input type="checkbox" checked={selectedMemberIds.includes(member.id)} onChange={(event) => setSelectedMemberIds((current) => event.target.checked ? [...current, member.id] : current.filter((id) => id !== member.id))} /><span>{member.name}</span></label>)}
                {visibleMembers.length === 0 ? <p>No members match that search.</p> : null}
              </div>
            </fieldset>
          ) : relationshipOptions.length > 0 ? (
            <label className="editor-field"><span>{relationshipLabel(pending.entityType)}</span><select value={parentId} onChange={(event) => setParentId(event.target.value)}>{relationshipOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          ) : null}
          {pending.entityType === 'member' ? <p className="generated-hint">Employee reference ID and work email are optional details you can add later.</p> : null}
          {existingEntity ? <div className="reuse-existing"><strong>{existingEntity.name} already exists</strong><p>{pending.entityType === 'role' ? 'Role names are shared. This will assign the existing role to every selected member.' : roleAlreadyRequired ? 'This role already supports the workflow. Assign the role to another member to add coverage.' : cannotReuse ? 'This example workflow is read-only in the quick builder.' : 'This will add the selected role as another responsibility in the existing workflow.'}</p></div> : null}
          {mutation.isError ? <p className="form-error" role="alert">{mutation.error.message}</p> : null}
        </div>
        <div className="quick-create-actions"><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button><button type="submit" disabled={!name.trim() || mutation.isPending || Boolean(cannotReuse)}>{mutation.isPending ? 'Saving…' : existingEntity ? pending.entityType === 'role' ? 'Assign existing role' : 'Add to existing workflow' : pending.entityType === 'role' && selectedMemberIds.length === 0 ? 'Create role without holders' : `Create ${typeLabels[pending.entityType].toLowerCase()}`}</button></div>
      </form>
    </div>
  )
}

function DeleteConfirmation({ node, catalog, isPending, error, onCancel, onConfirm }: {
  node: CanvasNode
  catalog: DraftCatalog
  isPending: boolean
  error?: string
  onCancel: () => void
  onConfirm: () => void
}) {
  const impact = deletionImpact(node, catalog)
  return (
    <div className="quick-create-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
      <section className="quick-create-card delete-confirmation" role="dialog" aria-modal="true" aria-labelledby="delete-object-title">
        <div className="quick-create-icon danger" aria-hidden="true">×</div>
        <div><p className="section-kicker">Delete {typeLabels[node.data.entityType]}</p><h3 id="delete-object-title">Remove {node.data.label}?</h3><p>{impact.message}</p></div>
        {impact.dependencies.length > 0 ? <ul>{impact.dependencies.map((dependency) => <li key={dependency}>{dependency}</li>)}</ul> : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="quick-create-actions"><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button><button type="button" className="delete-button" disabled={impact.blocked || isPending} onClick={onConfirm}>{isPending ? 'Deleting…' : impact.blocked ? 'Resolve dependencies first' : 'Delete object'}</button></div>
      </section>
    </div>
  )
}

function OrganizationNode({ data, selected }: NodeProps<CanvasNode>) {
  return (
    <div className={`organization-node ${data.entityType} ${selected ? 'selected' : ''} ${data.emphasis ?? ''} ${data.simulationState ? `simulation-${data.simulationState}` : ''} ${data.onImpactActions ? 'has-impact-actions' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <span className="organization-node-icon" aria-hidden="true">{entityIcon(data.entityType)}</span>
      <span><small>{typeLabels[data.entityType]}</small><strong>{data.label}</strong><em>{data.detail}</em></span>
      {data.badge ? <b className="organization-node-badge">{data.badge}</b> : null}
      {data.onImpactActions ? <button type="button" className="organization-node-impact-actions nodrag nopan" aria-label={`Impact actions for ${data.label}`} title="Impact actions" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); data.onImpactActions?.(event) }}>•••</button> : null}
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

function buildNodes(catalog: DraftCatalog, workspaceId: string, useSavedPositions = true): CanvasNode[] {
  const automatic = automaticPositions(catalog)
  const saved = useSavedPositions ? readPositions(workspaceId) : {}
  const items: Array<{ id: string; label: string; detail: string; entityType: GraphEntityType }> = [
    ...catalog.teams.map((team) => ({ id: nodeId('team', team.id), label: team.name, detail: team.department || 'General', entityType: 'team' as const })),
    ...catalog.members.map((member) => ({
      id: nodeId('member', member.id),
      label: member.name,
      detail: [catalog.teams.find((team) => team.id === member.teamId)?.name ?? 'No primary team', member.employeeNumber].filter(Boolean).join(' · '),
      entityType: 'member' as const,
    })),
    ...catalog.roles.map((role) => ({ id: nodeId('role', role.id), label: role.name, detail: `${role.sensitivity.toLowerCase()} sensitivity`, entityType: 'role' as const })),
    ...catalog.workflows.flatMap((workflow) => workflow.requirements.map((requirement) => ({
      id: nodeId('responsibility', requirement.id),
      label: requirement.name,
      detail: `minimum ${requirement.minimumActors} · resilience ${requirement.resilienceTarget}`,
      entityType: 'responsibility' as const,
    }))),
    ...catalog.workflows.map((workflow) => ({ id: nodeId('workflow', workflow.id), label: workflow.name, detail: `${workflow.criticality.toLowerCase()} criticality`, entityType: 'workflow' as const })),
  ]
  return items.map((item) => ({
    id: item.id,
    type: 'organization' as const,
    position: saved[item.id] ?? automatic[item.id] ?? { x: 50, y: 60 },
    data: { label: item.label, entityType: item.entityType, detail: item.detail },
    ariaLabel: `${typeLabels[item.entityType]} ${item.label}`,
  }))
}

function compactFocusedNodes(nodes: CanvasNode[], focusIds: Set<string>) {
  const focused = nodes.filter((node) => focusIds.has(node.id))
  const minimumX = Math.min(...focused.map((node) => node.position.x), 50)
  const minimumY = Math.min(...focused.map((node) => node.position.y), 60)
  return focused.map((node) => ({ ...node, position: { x: node.position.x - minimumX + 50, y: node.position.y - minimumY + 60 } }))
}

function mergeCatalogNodes(current: CanvasNode[], catalog: DraftCatalog, workspaceId: string) {
  const rebuilt = buildNodes(catalog, workspaceId)
  const currentPositions = new Map(current.map((node) => [node.id, node.position]))
  return rebuilt.map((node) => ({ ...node, position: currentPositions.get(node.id) ?? node.position }))
}

function buildEdges(catalog: DraftCatalog): Edge[] {
  const edges: Edge[] = []
  catalog.members.forEach((member) => {
    edges.push(graphEdge(`team-member-${member.id}`, nodeId('team', member.teamId), nodeId('member', member.id), 'contains'))
    member.roleIds.forEach((roleId) => edges.push(graphEdge(`member-role-${member.id}-${roleId}`, nodeId('member', member.id), nodeId('role', roleId), 'assigned')))
  })
  catalog.workflows.forEach((workflow) => {
    workflow.requirements.forEach((requirement) => requirement.roleIds.forEach((roleId) => {
      edges.push(graphEdge(`role-responsibility-${requirement.id}-${roleId}`, nodeId('role', roleId), nodeId('responsibility', requirement.id), 'can perform'))
    }))
    workflow.requirements.forEach((requirement) => edges.push(graphEdge(`responsibility-workflow-${workflow.id}-${requirement.id}`, nodeId('responsibility', requirement.id), nodeId('workflow', workflow.id), 'supports')))
  })
  return edges
}

function automaticPositions(catalog: DraftCatalog): Record<string, XYPosition> {
  const positions: Record<string, XYPosition> = {}
  const responsibilities = catalog.workflows.flatMap((workflow, workflowIndex) => workflow.requirements
    .slice()
    .sort((left, right) => left.position - right.position)
    .map((requirement) => ({ workflow, workflowIndex, requirement })))
  const responsibilityRank = new Map(responsibilities.map((item, index) => [item.requirement.id, index]))
  const roleRank = (roleId: string) => {
    const matches = responsibilities.filter((item) => item.requirement.roleIds.includes(roleId)).map((item) => responsibilityRank.get(item.requirement.id) ?? Number.MAX_SAFE_INTEGER)
    return matches.length > 0 ? Math.min(...matches) : Number.MAX_SAFE_INTEGER
  }
  const orderedRoles = catalog.roles.slice().sort((left, right) => roleRank(left.id) - roleRank(right.id) || left.name.localeCompare(right.name))
  const roleOrder = new Map(orderedRoles.map((role, index) => [role.id, index]))
  const primaryRole = (member: DraftMember) => member.roleIds.slice().sort((left, right) => (roleOrder.get(left) ?? Number.MAX_SAFE_INTEGER) - (roleOrder.get(right) ?? Number.MAX_SAFE_INTEGER))[0]
  const placedMembers = new Set<string>()
  const roleY = new Map<string, number>()
  let cursorY = 60

  orderedRoles.forEach((role) => {
    const members = catalog.members.filter((member) => primaryRole(member) === role.id)
    const rowCount = Math.max(1, members.length)
    members.forEach((member, index) => {
      positions[nodeId('member', member.id)] = { x: 350, y: cursorY + index * 115 }
      placedMembers.add(member.id)
    })
    const centerY = cursorY + ((rowCount - 1) * 115) / 2
    positions[nodeId('role', role.id)] = { x: 650, y: centerY }
    roleY.set(role.id, centerY)
    cursorY += rowCount * 115 + 45
  })

  catalog.members.filter((member) => !placedMembers.has(member.id)).forEach((member) => {
    positions[nodeId('member', member.id)] = { x: 350, y: cursorY }
    cursorY += 115
  })

  let responsibilityFloor = 60
  responsibilities.forEach(({ requirement }) => {
    const linkedY = requirement.roleIds.map((roleId) => roleY.get(roleId)).filter((value): value is number => value !== undefined)
    const desiredY = linkedY.length > 0 ? linkedY.reduce((sum, value) => sum + value, 0) / linkedY.length : responsibilityFloor
    const y = Math.max(desiredY, responsibilityFloor)
    positions[nodeId('responsibility', requirement.id)] = { x: 950, y }
    responsibilityFloor = y + 115
  })

  let workflowFloor = 60
  catalog.workflows.forEach((workflow) => {
    const linkedY = workflow.requirements.map((requirement) => positions[nodeId('responsibility', requirement.id)]?.y).filter((value): value is number => value !== undefined)
    const desiredY = linkedY.length > 0 ? linkedY.reduce((sum, value) => sum + value, 0) / linkedY.length : workflowFloor
    const y = Math.max(desiredY, workflowFloor)
    positions[nodeId('workflow', workflow.id)] = { x: 1250, y }
    workflowFloor = y + 135
  })

  const desiredTeams = catalog.teams.map((team) => {
    const linkedY = catalog.members.filter((member) => member.teamId === team.id).map((member) => positions[nodeId('member', member.id)]?.y).filter((value): value is number => value !== undefined)
    return { team, desiredY: linkedY.length > 0 ? linkedY.reduce((sum, value) => sum + value, 0) / linkedY.length : cursorY }
  }).sort((left, right) => left.desiredY - right.desiredY)
  let teamFloor = 60
  desiredTeams.forEach(({ team, desiredY }) => {
    const y = Math.max(desiredY, teamFloor)
    positions[nodeId('team', team.id)] = { x: 50, y }
    teamFloor = y + 115
  })
  return positions
}

function graphEdge(id: string, source: string, target: string, label: string): Edge {
  return {
    id, source, target, label, type: 'smoothstep',
    style: { stroke: '#7f6ce5', strokeWidth: 1.8 },
    labelStyle: { fill: '#aeb5c7', fontSize: 9, fontWeight: 700 },
    labelBgStyle: { fill: '#12151e', fillOpacity: 0.95 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#7f6ce5', width: 16, height: 16 },
  }
}

function emphasizeEdges(edges: Edge[], pathIds: Set<string> | null) {
  if (!pathIds) return edges
  return edges.map((edge) => {
    const highlighted = pathIds.has(edge.source) && pathIds.has(edge.target)
    return {
      ...edge,
      animated: highlighted,
      style: { ...edge.style, opacity: highlighted ? 1 : 0.12, strokeWidth: highlighted ? 2.4 : 1.2 },
      labelStyle: { ...edge.labelStyle, opacity: highlighted ? 1 : 0.08 },
    }
  })
}

function relatedPathIds(catalog: DraftCatalog, selectedNodeId: string) {
  const selected = parseNodeId(selectedNodeId)
  const ids = new Set<string>([selectedNodeId])
  const addRolePath = (roleId: string) => {
    ids.add(nodeId('role', roleId))
    catalog.members.filter((member) => member.roleIds.includes(roleId)).forEach((member) => {
      ids.add(nodeId('member', member.id))
      ids.add(nodeId('team', member.teamId))
    })
    catalog.workflows.forEach((workflow) => workflow.requirements.filter((requirement) => requirement.roleIds.includes(roleId)).forEach((requirement) => {
      ids.add(nodeId('responsibility', requirement.id))
      ids.add(nodeId('workflow', workflow.id))
    }))
  }
  if (selected.type === 'member') {
    const member = catalog.members.find((candidate) => candidate.id === selected.id)
    if (member) {
      ids.add(nodeId('team', member.teamId))
      member.roleIds.forEach(addRolePath)
    }
  } else if (selected.type === 'role') {
    addRolePath(selected.id)
  } else if (selected.type === 'responsibility') {
    catalog.workflows.forEach((workflow) => workflow.requirements.filter((requirement) => requirement.id === selected.id).forEach((requirement) => {
      ids.add(nodeId('workflow', workflow.id))
      requirement.roleIds.forEach(addRolePath)
    }))
  } else if (selected.type === 'workflow') {
    const workflow = catalog.workflows.find((candidate) => candidate.id === selected.id)
    workflow?.requirements.forEach((requirement) => {
      ids.add(nodeId('responsibility', requirement.id))
      requirement.roleIds.forEach(addRolePath)
    })
  } else if (selected.type === 'team') {
    catalog.members.filter((member) => member.teamId === selected.id).forEach((member) => {
      ids.add(nodeId('member', member.id))
      member.roleIds.forEach(addRolePath)
    })
  }
  return ids
}

async function deleteEntity(workspaceId: string, node: CanvasNode, catalog: DraftCatalog) {
  const entity = parseNodeId(node.id)
  if (entity.type === 'responsibility') throw new Error('Responsibilities are edited as part of their workflow.')
  const impact = deletionImpact(node, catalog)
  if (impact.blocked) throw new Error(impact.message)
  if (entity.type === 'team') return deleteDraftTeam(workspaceId, entity.id)
  if (entity.type === 'member') return deleteDraftMember(workspaceId, entity.id)
  if (entity.type === 'role') return deleteDraftRole(workspaceId, entity.id)
  return deleteQuickWorkflow(workspaceId, entity.id)
}

function deletionImpact(node: CanvasNode, catalog: DraftCatalog) {
  const entity = parseNodeId(node.id)
  if (entity.type === 'responsibility') return { blocked: true, message: 'Responsibilities are edited as part of their workflow.', dependencies: [] as string[] }
  if (entity.type === 'team') {
    const members = catalog.members.filter((member) => member.teamId === entity.id)
    return {
      blocked: members.length > 0,
      message: members.length > 0 ? 'This team still contains members. Move or delete them before deleting the team.' : 'The team will be removed from the organization map.',
      dependencies: members.map((member) => `Member: ${member.name}`),
    }
  }
  if (entity.type === 'member') {
    const member = catalog.members.find((candidate) => candidate.id === entity.id)
    const roles = catalog.roles.filter((role) => member?.roleIds.includes(role.id))
    return { blocked: false, message: 'The member and all of their role assignments will be removed from the baseline.', dependencies: roles.map((role) => `Role assignment: ${role.name}`) }
  }
  if (entity.type === 'role') {
    const workflows = catalog.workflows.filter((workflow) => workflow.requirements.some((requirement) => requirement.roleIds.includes(entity.id)))
    return {
      blocked: workflows.length > 0,
      message: workflows.length > 0 ? 'This role enables business workflows. Delete those workflows first so the baseline cannot become incomplete.' : 'The role and its member assignments will be removed.',
      dependencies: workflows.map((workflow) => `Workflow: ${workflow.name}`),
    }
  }
  return { blocked: false, message: 'The workflow and its generated dependency chain will be removed from the baseline.', dependencies: [] as string[] }
}

function focusedNodeIds(catalog: DraftCatalog, workflowId: string) {
  const ids = new Set<string>()
  const workflow = catalog.workflows.find((candidate) => candidate.id === workflowId)
  if (!workflow) return ids
  ids.add(nodeId('workflow', workflow.id))
  workflow.requirements.forEach((requirement) => ids.add(nodeId('responsibility', requirement.id)))
  const roleIds = new Set(workflow.requirements.flatMap((requirement) => requirement.roleIds))
  roleIds.forEach((roleId) => ids.add(nodeId('role', roleId)))
  catalog.members.filter((member) => member.roleIds.some((roleId) => roleIds.has(roleId))).forEach((member) => {
    ids.add(nodeId('member', member.id))
    ids.add(nodeId('team', member.teamId))
  })
  return ids
}

async function createEntity(workspaceId: string, entityType: EntityType, name: string, parentId: string, catalog: DraftCatalog, selectedMemberIds: string[] = [], options: QuickCreateOptions = { department: 'General', sensitivity: 'MEDIUM', criticality: 'HIGH' }) {
  if (entityType === 'team') {
    const next = await createDraftTeam(workspaceId, { name, department: options.department.trim() || 'General' })
    return { catalog: next, nodeId: nodeId('team', findCreatedId(catalog.teams, next.teams)) }
  }
  if (entityType === 'member') {
    const next = await createDraftMember(workspaceId, { teamId: parentId, employeeNumber: null, name, email: '', status: 'ACTIVE', region: 'NORTH_AMERICA', shift: 'DAY' })
    return { catalog: next, nodeId: nodeId('member', findCreatedId(catalog.members, next.members)) }
  }
  if (entityType === 'role') {
    const existingRole = catalog.roles.find((role) => normalizedName(role.name) === normalizedName(name))
    if (existingRole) {
      const next = await updateDraftRole(workspaceId, existingRole.id, {
        name: existingRole.name,
        description: existingRole.description,
        sensitivity: existingRole.sensitivity,
        ownerMemberId: existingRole.ownerMemberId,
        holderMemberIds: selectedMemberIds,
      })
      return { catalog: next, nodeId: nodeId('role', existingRole.id) }
    }
    const created = await createDraftRole(workspaceId, { name, description: `${name} responsibilities`, sensitivity: options.sensitivity, ownerMemberId: null, holderMemberIds: selectedMemberIds })
    const roleId = findCreatedId(catalog.roles, created.roles)
    return { catalog: created, nodeId: nodeId('role', roleId) }
  }
  const existingWorkflow = catalog.workflows.find((workflow) => normalizedName(workflow.name) === normalizedName(name))
  const role = catalog.roles.find((candidate) => candidate.id === parentId)
  const requirementName = `${role?.name ?? 'Required role'} responsibility`
  if (existingWorkflow) {
    if (!existingWorkflow.quickManaged) throw new Error('This example workflow is read-only in the quick builder')
    const next = await addWorkflowRequirement(workspaceId, existingWorkflow.id, { name: requirementName, roleId: parentId, minimumActors: 1, resilienceTarget: 1 })
    return { catalog: next, nodeId: nodeId('workflow', existingWorkflow.id) }
  }
  const next = await createQuickWorkflow(workspaceId, { name, criticality: options.criticality, requirementName, roleId: parentId, minimumActors: 1, resilienceTarget: 1 })
  return { catalog: next, nodeId: nodeId('workflow', findCreatedId(catalog.workflows, next.workflows)) }
}

function findExistingEntity(entityType: EntityType, name: string, catalog: DraftCatalog) {
  if (!name.trim()) return undefined
  if (entityType === 'role') return catalog.roles.find((role) => normalizedName(role.name) === normalizedName(name))
  if (entityType === 'workflow') return catalog.workflows.find((workflow) => normalizedName(workflow.name) === normalizedName(name))
  return undefined
}

function normalizedName(value: string) { return value.trim().toLocaleLowerCase() }

function enumChoices(values: string[]) {
  return values.map((value) => <option key={value} value={value}>{value[0] + value.slice(1).toLowerCase()}</option>)
}

function nextOpenPosition(entityType: EntityType, nodes: CanvasNode[], requested?: XYPosition): XYPosition {
  const nodeWidth = 220
  const nodeHeight = 105
  const isOpen = (position: XYPosition) => nodes.every((node) => Math.abs(node.position.x - position.x) >= nodeWidth || Math.abs(node.position.y - position.y) >= nodeHeight)
  if (requested) {
    const snapped = { x: Math.round(requested.x / 25) * 25, y: Math.round(requested.y / 25) * 25 }
    for (let offset = 0; offset < 30; offset++) {
      const position = { x: snapped.x + Math.floor(offset / 6) * 250, y: snapped.y + (offset % 6) * 125 }
      if (isOpen(position)) return position
    }
  }
  const typeNodes = nodes.filter((node) => node.data.entityType === entityType)
  const baseX = typeNodes.length > 0 ? Math.min(...typeNodes.map((node) => node.position.x)) : 50 + entityTypes.indexOf(entityType) * 320
  for (let slot = 0; slot < 60; slot++) {
    const position = { x: baseX + Math.floor(slot / 6) * 250, y: 60 + (slot % 6) * 125 }
    if (isOpen(position)) return position
  }
  return { x: baseX, y: 60 + typeNodes.length * 125 }
}

async function connectEntities(workspaceId: string, catalog: DraftCatalog, connection: Connection) {
  const source = parseNodeId(connection.source)
  const target = parseNodeId(connection.target)
  if (source.type === 'team' && target.type === 'member') {
    const member = catalog.members.find((candidate) => candidate.id === target.id)
    if (!member) throw new Error('Member not found')
    return updateDraftMember(workspaceId, member.id, memberInput(member, source.id))
  }
  if (source.type === 'member' && target.type === 'role') {
    const member = catalog.members.find((candidate) => candidate.id === source.id)
    if (!member) throw new Error('Member not found')
    return replaceMemberRoles(workspaceId, member.id, [...new Set([...member.roleIds, target.id])])
  }
  throw new Error('Connect Team → Member or Member → Role. Choose a role when creating a workflow.')
}

function memberInput(member: DraftMember, teamId: string) {
  return { teamId, employeeNumber: member.employeeNumber, name: member.name, email: member.email ?? '', status: member.status, region: member.region, shift: member.shift }
}

function isValidConnection(connection: Pick<Connection, 'source' | 'target'>, catalog: DraftCatalog) {
  const source = parseNodeId(connection.source)
  const target = parseNodeId(connection.target)
  if (source.type === 'team' && target.type === 'member') return true
  if (source.type === 'member' && target.type === 'role') {
    const member = catalog.members.find((candidate) => candidate.id === source.id)
    return !member?.roleIds.includes(target.id)
  }
  return false
}

function parentOptions(entityType: EntityType, catalog: DraftCatalog) {
  if (entityType === 'member') return catalog.teams.map((team) => ({ value: team.id, label: team.name }))
  if (entityType === 'role') return catalog.members.map((member) => ({ value: member.id, label: member.name }))
  if (entityType === 'workflow') return catalog.roles.map((role) => ({ value: role.id, label: role.name }))
  return []
}

function defaultParentId(entityType: EntityType, catalog: DraftCatalog) {
  return parentOptions(entityType, catalog)[0]?.value ?? ''
}

function prerequisiteMessage(entityType: EntityType, catalog: DraftCatalog) {
  if (entityType === 'member' && catalog.teams.length === 0) return 'Create a team before adding a member.'
  if (entityType === 'role' && catalog.members.length === 0) return 'Create a member before adding a role.'
  if (entityType === 'workflow' && catalog.roles.length === 0) return 'Create a role before adding a workflow.'
  return null
}

function relationshipLabel(entityType: EntityType) {
  return { team: '', member: 'Place in team', role: 'Assign to member', workflow: 'Required role' }[entityType]
}

function paletteDetail(entityType: EntityType) {
  return { team: 'Business group', member: 'Person or position', role: 'Access responsibility', workflow: 'Business process' }[entityType]
}

function namePlaceholder(entityType: EntityType) {
  return { team: 'Platform Operations', member: 'Maya Singh', role: 'Release Manager', workflow: 'Production Deployment' }[entityType]
}

function entityIcon(entityType: GraphEntityType) {
  return { team: 'T', member: 'M', role: 'R', responsibility: '✓', workflow: 'W' }[entityType]
}

function nodeId(type: GraphEntityType, id: string) { return `${type}:${id}` }
function parseNodeId(value: string | null) {
  const [type, ...id] = (value ?? '').split(':')
  return { type: type as GraphEntityType, id: id.join(':') }
}
function findCreatedId<T extends { id: string }>(before: T[], after: T[]) {
  const existing = new Set(before.map((item) => item.id))
  const created = after.find((item) => !existing.has(item.id))
  if (!created) throw new Error('Created object was not returned by the server')
  return created.id
}
function positionKey(workspaceId: string) { return `roleimpact:canvas:${workspaceId}` }
function readPositions(workspaceId: string): Record<string, XYPosition> {
  try { return JSON.parse(localStorage.getItem(positionKey(workspaceId)) ?? '{}') as Record<string, XYPosition> } catch { return {} }
}
function removeSavedPosition(workspaceId: string, id: string) {
  const positions = readPositions(workspaceId)
  delete positions[id]
  localStorage.setItem(positionKey(workspaceId), JSON.stringify(positions))
}
