import { Children, lazy, Suspense, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
  fetchDraftCatalog,
  replaceMemberRoles,
  updateDraftMember,
  updateDraftRole,
  updateDraftTeam,
  type DraftCatalog,
  type DraftMember,
} from '../../../api/draftCatalog'
import { fetchDraftContinuityRisks } from '../../../api/draftImpact'

const OrganizationCanvas = lazy(() => import('./OrganizationCanvas'))
const DraftImpactTesting = lazy(() => import('./DraftImpactTesting'))

type EditorStage = 'teams' | 'members' | 'roles' | 'workflows'

export default function DraftEditor({ workspaceId, isTemplateClone }: { workspaceId: string; isTemplateClone: boolean }) {
  const [stage, setStage] = useState<EditorStage>('teams')
  const [view, setView] = useState<'map' | 'impact' | 'inventory'>('map')
  const editorRef = useRef<HTMLElement>(null)
  const catalogQuery = useQuery({
    queryKey: ['draft-catalog', workspaceId],
    queryFn: ({ signal }) => fetchDraftCatalog(workspaceId, signal),
  })
  const continuityQuery = useQuery({
    queryKey: ['draft-continuity', workspaceId],
    queryFn: ({ signal }) => fetchDraftContinuityRisks(workspaceId, signal),
  })

  if (catalogQuery.isPending) return <p className="editor-state">Loading the draft catalog…</p>
  if (catalogQuery.isError) {
    return (
      <div className="editor-state editor-error" role="alert">
        <p>{catalogQuery.error.message}</p>
        <button type="button" onClick={() => catalogQuery.refetch()}>Retry</button>
      </div>
    )
  }

  const catalog = catalogQuery.data
  const liveCounts = [
    { label: 'teams', value: catalog.teams.length },
    { label: 'members', value: catalog.members.length },
    { label: 'roles', value: catalog.roles.length },
    { label: 'workflows', value: catalog.workflows.length },
  ]
  const continuityRisks = continuityQuery.data ?? []
  const singlePointRisks = continuityRisks.filter((risk) => risk.members.some((member) => member.scenarioStatus === 'BLOCKED'))

  function moveToStage(nextStage: EditorStage) {
    setStage(nextStage)
    window.requestAnimationFrame(() => editorRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }))
  }

  function openInventory(nextStage?: EditorStage) {
    if (nextStage) setStage(nextStage)
    setView('inventory')
    window.requestAnimationFrame(() => editorRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <section ref={editorRef} className="draft-editor" aria-labelledby="editor-title">
      <div className="editor-heading">
        <div>
          <p className="section-kicker">{view === 'impact' ? 'Business continuity lab' : 'Visual organization builder'}</p>
          <h2 id="editor-title">{view === 'impact' ? 'Test a change before it happens' : 'Map how your organization works'}</h2>
        </div>
        <div className="editor-view-switch" aria-label="Organization builder view">
          <button type="button" className={view === 'map' ? 'active' : ''} aria-pressed={view === 'map'} onClick={() => setView('map')}>Organization map</button>
          <button type="button" className={view === 'impact' ? 'active' : ''} aria-pressed={view === 'impact'} onClick={() => setView('impact')}>Test impact</button>
          <button type="button" className={view === 'inventory' ? 'active' : ''} aria-pressed={view === 'inventory'} onClick={() => setView('inventory')}>Detailed inventory</button>
        </div>
      </div>

      <div className="draft-summary editor-summary" aria-label="Draft catalog summary">
        {liveCounts.map((count) => (
          <article key={count.label}><strong>{count.value}</strong><span>{count.label}</span></article>
        ))}
      </div>

      {view === 'map' && !continuityQuery.isFetching && !continuityQuery.isError && singlePointRisks.length > 0 ? (
        <section className="risk-callout" aria-label="Continuity risks found">
          <span aria-hidden="true">!</span>
          <div><strong>{singlePointRisks.length} critical coverage gap{singlePointRisks.length === 1 ? '' : 's'} found</strong><p>{singlePointRisks[0].eligibleMembers.map((member) => member.name).join(', ')} provide the minimum coverage for {singlePointRisks[0].requirementName} in {singlePointRisks[0].workflowName}.</p></div>
          <button type="button" onClick={() => setView('impact')}>Test this risk</button>
        </section>
      ) : null}

      {view === 'map' ? (
        <Suspense fallback={<p className="editor-state">Opening the organization map…</p>}><OrganizationCanvas workspaceId={workspaceId} catalog={catalog} initialFocus={isTemplateClone} onOpenInventory={() => openInventory()} onOpenWorkflows={() => openInventory('workflows')} onTestImpact={() => setView('impact')} /></Suspense>
      ) : view === 'impact' ? (
        <Suspense fallback={<p className="editor-state">Preparing impact testing…</p>}><DraftImpactTesting workspaceId={workspaceId} catalog={catalog} risks={continuityRisks} isContinuityLoading={continuityQuery.isFetching} continuityError={continuityQuery.error} onRetryContinuity={() => void continuityQuery.refetch()} onBackToMap={() => setView('map')} /></Suspense>
      ) : (
        <>
          <nav className="editor-stages" aria-label="Catalog builder stages">
            <StageButton number="1" label="Teams" detail={`${catalog.teams.length} created`} active={stage === 'teams'} onClick={() => moveToStage('teams')} />
            <StageButton number="2" label="Members" detail={`${catalog.members.length} added`} active={stage === 'members'} disabled={catalog.teams.length === 0} onClick={() => moveToStage('members')} />
            <StageButton number="3" label="Roles" detail={`${catalog.roles.length} defined`} active={stage === 'roles'} disabled={catalog.members.length === 0} onClick={() => moveToStage('roles')} />
            <StageButton number="4" label="Workflows" detail={`${catalog.workflows.length} ready`} active={stage === 'workflows'} disabled={catalog.roles.length === 0} onClick={() => moveToStage('workflows')} />
          </nav>

          {stage === 'teams' ? <TeamsStage workspaceId={workspaceId} catalog={catalog} onContinue={() => moveToStage('members')} /> : null}
          {stage === 'members' ? <MembersStage workspaceId={workspaceId} catalog={catalog} onContinue={() => moveToStage('roles')} /> : null}
          {stage === 'roles' ? <RolesStage workspaceId={workspaceId} catalog={catalog} onContinue={() => moveToStage('workflows')} /> : null}
          {stage === 'workflows' ? <WorkflowsStage workspaceId={workspaceId} catalog={catalog} /> : null}
        </>
      )}
    </section>
  )
}

function StageButton({ number, label, detail, active, disabled, onClick }: {
  number: string; label: string; detail: string; active: boolean; disabled?: boolean; onClick: () => void
}) {
  return (
    <button type="button" className={active ? 'active' : ''} disabled={disabled} aria-current={active ? 'step' : undefined} onClick={onClick}>
      <span>{number}</span><strong>{label}</strong><small>{detail}</small>
    </button>
  )
}

function TeamsStage({ workspaceId, catalog, onContinue }: EditorStageProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [department, setDepartment] = useState('')
  const mutation = useCatalogMutation(workspaceId, (input: { name: string; department: string }) => editingId
    ? updateDraftTeam(workspaceId, editingId, input)
    : createDraftTeam(workspaceId, input), () => {
    const wasCreatingFirst = !editingId && catalog.teams.length === 0
    setName(''); setDepartment(''); setEditingId(null)
    if (wasCreatingFirst) onContinue()
  })
  const deleteMutation = useCatalogMutation(workspaceId, (teamId: string) => deleteDraftTeam(workspaceId, teamId))

  function submit(event: FormEvent) {
    event.preventDefault()
    mutation.mutate({ name: name.trim(), department: department.trim() })
  }

  return (
    <div className="editor-layout">
      <EditorForm title={editingId ? 'Edit team' : 'Add a team'} intro="Teams anchor members to a business department." onSubmit={submit} error={mutation.error?.message}>
        <Field label="Team name" value={name} onChange={setName} placeholder="Platform Operations" />
        <Field label="Department" value={department} onChange={setDepartment} placeholder="Engineering" />
        <button type="submit" disabled={mutation.isPending || !name.trim() || !department.trim()}>{mutation.isPending ? 'Saving…' : editingId ? 'Save team' : 'Add team'}</button>
        {editingId ? <button type="button" className="secondary-button" onClick={() => { setEditingId(null); setName(''); setDepartment('') }}>Cancel</button> : null}
      </EditorForm>
      <EditorList title="Teams" empty="Add the first team to unlock members.">
        {catalog.teams.map((team) => (
          <article className="editor-item" key={team.id}>
            <div><strong>{team.name}</strong><span>{team.department} · {team.memberCount} members</span></div>
            <div className="item-actions"><button type="button" className="edit-text" onClick={() => { setEditingId(team.id); setName(team.name); setDepartment(team.department) }}>Edit</button><button type="button" className="danger-text" disabled={deleteMutation.isPending || team.memberCount > 0} title={team.memberCount > 0 ? 'Remove members first' : 'Delete team'} onClick={() => deleteMutation.mutate(team.id)}>Delete</button></div>
          </article>
        ))}
        {deleteMutation.isError ? <p className="form-error" role="alert">{deleteMutation.error.message}</p> : null}
      </EditorList>
    </div>
  )
}

function MembersStage({ workspaceId, catalog, onContinue }: EditorStageProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [teamId, setTeamId] = useState(catalog.teams[0]?.id ?? '')
  const [name, setName] = useState('')
  const [employeeNumber, setEmployeeNumber] = useState('')
  const [email, setEmail] = useState('')
  const [region, setRegion] = useState<DraftMember['region']>('NORTH_AMERICA')
  const [shift, setShift] = useState<DraftMember['shift']>('DAY')
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([])
  const mutation = useCatalogMutation(workspaceId, async (input: Parameters<typeof createDraftMember>[1]) => {
    if (editingId) {
      await updateDraftMember(workspaceId, editingId, input)
      return replaceMemberRoles(workspaceId, editingId, selectedRoleIds)
    }
    const created = await createDraftMember(workspaceId, input)
    const member = created.members.find((candidate) => !catalog.members.some((existing) => existing.id === candidate.id))
    if (!member || selectedRoleIds.length === 0) return created
    return replaceMemberRoles(workspaceId, member.id, selectedRoleIds)
  }, () => {
    const wasCreatingFirst = !editingId && catalog.members.length === 0
    setName(''); setEmployeeNumber(''); setEmail(''); setSelectedRoleIds([]); setEditingId(null)
    if (wasCreatingFirst) onContinue()
  })
  const deleteMutation = useCatalogMutation(workspaceId, (memberId: string) => deleteDraftMember(workspaceId, memberId))

  function submit(event: FormEvent) {
    event.preventDefault()
    mutation.mutate({ teamId, employeeNumber: employeeNumber.trim() || null, name: name.trim(), email: email.trim(), status: 'ACTIVE', region, shift })
  }

  return (
    <div className="editor-layout">
      <EditorForm title={editingId ? 'Edit member' : 'Add a member'} intro="Place each person in a team before assigning access roles." onSubmit={submit} error={mutation.error?.message}>
        <SelectField label="Team" value={teamId} onChange={setTeamId} options={catalog.teams.map((team) => ({ value: team.id, label: team.name }))} />
        <Field label="Full name" value={name} onChange={setName} placeholder="Maya Singh" />
        <Field label="Employee reference ID (optional)" value={employeeNumber} onChange={setEmployeeNumber} placeholder="EMP-4821" />
        <p className="generated-hint">Use this only when matching records from an HR system. RoleImpact uses its own internal identifier.</p>
        <Field label="Work email (optional)" type="email" value={email} onChange={setEmail} placeholder="maya@company.com" />
        <div className="field-row">
          <SelectField label="Region" value={region} onChange={(value) => setRegion(value as DraftMember['region'])} options={enumOptions(['NORTH_AMERICA', 'EUROPE', 'ASIA_PACIFIC'])} />
          <SelectField label="Shift" value={shift} onChange={(value) => setShift(value as DraftMember['shift'])} options={enumOptions(['DAY', 'EVENING', 'NIGHT'])} />
        </div>
        {catalog.roles.length > 0 ? (
          <fieldset className="shared-role-picker">
            <legend>Assign existing roles (optional)</legend>
            <p>Roles are shared. The same role can be assigned to any number of members.</p>
            {catalog.roles.map((role) => <label key={role.id}><input type="checkbox" checked={selectedRoleIds.includes(role.id)} onChange={(event) => setSelectedRoleIds((current) => event.target.checked ? [...current, role.id] : current.filter((id) => id !== role.id))} /><span>{role.name}</span></label>)}
          </fieldset>
        ) : null}
        <button type="submit" disabled={mutation.isPending || !teamId || !name.trim()}>{mutation.isPending ? 'Saving…' : editingId ? 'Save member' : 'Add member & continue'}</button>
        {editingId ? <button type="button" className="secondary-button" onClick={() => { setEditingId(null); setName(''); setEmployeeNumber(''); setEmail(''); setSelectedRoleIds([]) }}>Cancel</button> : null}
      </EditorForm>
      <EditorList title="Members" empty="No members have been added yet.">
        {catalog.members.map((member) => {
          const team = catalog.teams.find((candidate) => candidate.id === member.teamId)
          const details = [member.employeeNumber, team?.name, `${member.roleIds.length} shared roles`].filter(Boolean).join(' · ')
          return <article className="editor-item" key={member.id}><div><strong>{member.name}</strong><span>{details}</span></div><div className="item-actions"><button type="button" className="edit-text" onClick={() => { setEditingId(member.id); setTeamId(member.teamId); setName(member.name); setEmployeeNumber(member.employeeNumber ?? ''); setEmail(member.email ?? ''); setRegion(member.region); setShift(member.shift); setSelectedRoleIds(member.roleIds) }}>Edit</button><button type="button" className="danger-text" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(member.id)}>Delete</button></div></article>
        })}
        {deleteMutation.isError ? <p className="form-error" role="alert">{deleteMutation.error.message}</p> : null}
      </EditorList>
    </div>
  )
}

function RolesStage({ workspaceId, catalog, onContinue }: EditorStageProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sensitivity, setSensitivity] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM')
  const [ownerMemberId, setOwnerMemberId] = useState('')
  const [selectedHolderIds, setSelectedHolderIds] = useState<string[]>([])
  const existingRole = !editingId && name.trim() ? catalog.roles.find((role) => role.name.localeCompare(name.trim(), undefined, { sensitivity: 'accent' }) === 0) : undefined
  useEffect(() => {
    if (existingRole) setSelectedHolderIds(catalog.members.filter((member) => member.roleIds.includes(existingRole.id)).map((member) => member.id))
  }, [catalog.members, existingRole])
  const mutation = useCatalogMutation(workspaceId, async (input: Parameters<typeof createDraftRole>[1]) => {
    if (editingId) {
      const updated = await updateDraftRole(workspaceId, editingId, input)
      return syncRoleHolders(workspaceId, updated, editingId, selectedHolderIds)
    }
    const created = await createDraftRole(workspaceId, input)
    const role = created.roles.find((candidate) => !catalog.roles.some((existing) => existing.id === candidate.id))
    return role ? syncRoleHolders(workspaceId, created, role.id, selectedHolderIds) : created
  }, () => {
    const wasCreatingFirst = !editingId && catalog.roles.length === 0
    setName(''); setDescription(''); setOwnerMemberId(''); setSelectedHolderIds([]); setEditingId(null)
    if (wasCreatingFirst) onContinue()
  })
  const reuseMutation = useCatalogMutation(workspaceId, async () => {
    if (!existingRole) return catalog
    return syncRoleHolders(workspaceId, catalog, existingRole.id, selectedHolderIds)
  }, () => { setName(''); setDescription(''); setSelectedHolderIds([]) })
  const deleteMutation = useCatalogMutation(workspaceId, (roleId: string) => deleteDraftRole(workspaceId, roleId))

  function submit(event: FormEvent) {
    event.preventDefault()
    if (existingRole) {
      reuseMutation.mutate(undefined)
      return
    }
    mutation.mutate({ name: name.trim(), description: description.trim(), sensitivity, ownerMemberId: ownerMemberId || null })
  }

  return (
    <div className="editor-layout roles-layout">
      <EditorForm title={editingId ? 'Edit role' : 'Define a role'} intro="Roles group access responsibilities that can be assigned to members." onSubmit={submit} error={mutation.error?.message}>
        <Field label="Role name" value={name} onChange={setName} placeholder="Release Manager" />
        <label className="editor-field"><span>Description</span><textarea value={description} maxLength={2000} placeholder="Approves production releases" onChange={(event) => setDescription(event.target.value)} /></label>
        <SelectField label="Sensitivity" value={sensitivity} onChange={(value) => setSensitivity(value as typeof sensitivity)} options={enumOptions(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])} />
        <SelectField label="Role administrator (optional)" value={ownerMemberId} onChange={setOwnerMemberId} options={[{ value: '', label: 'No administrator' }, ...catalog.members.map((member) => ({ value: member.id, label: member.name }))]} />
        <p className="generated-hint">The administrator maintains the role. They are not automatically a role holder.</p>
        <MemberMultiSelect legend="Assign this role to members" members={catalog.members} selectedIds={selectedHolderIds} onChange={setSelectedHolderIds} />
        {existingRole ? <div className="reuse-existing"><strong>{existingRole.name} is already a shared role</strong><p>Update its holders below instead of creating a duplicate role.</p></div> : null}
        <button type="submit" disabled={mutation.isPending || reuseMutation.isPending || !name.trim() || (!existingRole && !description.trim())}>{mutation.isPending || reuseMutation.isPending ? 'Saving…' : existingRole ? `Update ${existingRole.name} holders` : editingId ? 'Save role and holders' : 'Add shared role & continue'}</button>
        {editingId ? <button type="button" className="secondary-button" onClick={() => { setEditingId(null); setName(''); setDescription(''); setOwnerMemberId(''); setSelectedHolderIds([]) }}>Cancel</button> : null}
      </EditorForm>
      <div className="editor-stack">
        <EditorList title="Roles" empty="Define a role before assigning it.">
          {catalog.roles.map((role) => <article className="editor-item" key={role.id}><div><strong>{role.name}</strong><span>{role.sensitivity} · {role.memberCount} holders</span><small>{catalog.members.filter((member) => member.roleIds.includes(role.id)).map((member) => member.name).join(', ') || 'No holders assigned'}</small></div><div className="item-actions"><button type="button" className="edit-text" onClick={() => { setEditingId(role.id); setName(role.name); setDescription(role.description); setSensitivity(role.sensitivity); setOwnerMemberId(role.ownerMemberId ?? ''); setSelectedHolderIds(catalog.members.filter((member) => member.roleIds.includes(role.id)).map((member) => member.id)) }}>Edit</button><button type="button" className="danger-text" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(role.id)}>Delete</button></div></article>)}
          {deleteMutation.isError ? <p className="form-error" role="alert">{deleteMutation.error.message}</p> : null}
        </EditorList>
        {catalog.roles.length > 0 ? <RoleAssignments workspaceId={workspaceId} catalog={catalog} /> : null}
      </div>
    </div>
  )
}

function WorkflowsStage({ workspaceId, catalog }: EditorProps) {
  const [targetWorkflowId, setTargetWorkflowId] = useState('new')
  const [name, setName] = useState('')
  const [requirementName, setRequirementName] = useState('')
  const [criticality, setCriticality] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('HIGH')
  const [roleId, setRoleId] = useState(catalog.roles[0]?.id ?? '')
  const [minimumActors, setMinimumActors] = useState(1)
  const [resilienceTarget, setResilienceTarget] = useState(1)
  const matchingWorkflow = targetWorkflowId === 'new' && name.trim()
    ? catalog.workflows.find((workflow) => workflow.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase())
    : undefined
  const selectedWorkflow = catalog.workflows.find((workflow) => workflow.id === targetWorkflowId)
  const mutation = useCatalogMutation(workspaceId, () => targetWorkflowId === 'new'
    ? createQuickWorkflow(workspaceId, { name: name.trim(), criticality, requirementName: requirementName.trim(), roleId, minimumActors, resilienceTarget })
    : addWorkflowRequirement(workspaceId, targetWorkflowId, { name: requirementName.trim(), roleId, minimumActors, resilienceTarget }), () => {
    setName(''); setRequirementName(''); setMinimumActors(1); setResilienceTarget(1)
  })
  const deleteMutation = useCatalogMutation(workspaceId, (workflowId: string) => deleteQuickWorkflow(workspaceId, workflowId))

  function submit(event: FormEvent) {
    event.preventDefault()
    mutation.mutate(undefined)
  }

  return (
    <div className="editor-layout">
      <EditorForm title={targetWorkflowId === 'new' ? 'Create a workflow' : `Add to ${selectedWorkflow?.name}`} intro="A workflow is shared. Add each role responsibility once, then assign those roles to as many members as needed." onSubmit={submit} error={mutation.error?.message}>
        <SelectField label="Build" value={targetWorkflowId} onChange={setTargetWorkflowId} options={[{ value: 'new', label: 'Create a new workflow' }, ...catalog.workflows.filter((workflow) => workflow.quickManaged).map((workflow) => ({ value: workflow.id, label: `Add responsibility to ${workflow.name}` }))]} />
        {targetWorkflowId === 'new' ? <Field label="Workflow name" value={name} onChange={setName} placeholder="Production Deployment" /> : null}
        {matchingWorkflow ? <div className="reuse-existing"><strong>{matchingWorkflow.name} already exists</strong><p>{matchingWorkflow.quickManaged ? 'Open it and add another role responsibility instead of duplicating the workflow.' : 'This example workflow already contains several responsibilities and is read-only in the quick editor.'}</p>{matchingWorkflow.quickManaged ? <button type="button" className="secondary-button" onClick={() => { setTargetWorkflowId(matchingWorkflow.id); setName('') }}>Add to existing workflow</button> : null}</div> : null}
        {targetWorkflowId === 'new' ? <SelectField label="Business criticality" value={criticality} onChange={(value) => setCriticality(value as typeof criticality)} options={enumOptions(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])} /> : null}
        <Field label="Responsibility or step" value={requirementName} onChange={setRequirementName} placeholder="Approve production release" />
        <SelectField label="Role that can perform it" value={roleId} onChange={setRoleId} options={catalog.roles.map((role) => ({ value: role.id, label: `${role.name} · ${role.memberCount} members` }))} />
        <div className="field-row"><NumberField label="Minimum people required" value={minimumActors} onChange={setMinimumActors} min={1} /><NumberField label="Healthy coverage target" value={resilienceTarget} onChange={setResilienceTarget} min={minimumActors} /></div>
        <p className="generated-hint">Below the minimum means blocked. Below the healthy target means degraded.</p>
        <button type="submit" disabled={mutation.isPending || !requirementName.trim() || !roleId || (targetWorkflowId === 'new' && (!name.trim() || Boolean(matchingWorkflow))) || resilienceTarget < minimumActors}>{mutation.isPending ? 'Saving…' : targetWorkflowId === 'new' ? 'Create workflow' : 'Add responsibility'}</button>
      </EditorForm>
      <EditorList title="Workflows" empty="Create one workflow to complete your first scenario graph.">
        {catalog.workflows.map((workflow) => {
          return <article className="editor-item workflow-item" key={workflow.id}><div><strong>{workflow.name}</strong><span>{workflow.criticality} · {workflow.requirements.length} role responsibilities</span><ul>{workflow.requirements.map((requirement) => <li key={requirement.id}>{requirement.name} · {requirement.roleIds.map((id) => catalog.roles.find((role) => role.id === id)?.name).filter(Boolean).join(' or ')} · minimum {requirement.minimumActors}, healthy {requirement.resilienceTarget}</li>)}</ul></div>{workflow.quickManaged ? <button type="button" className="danger-text" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(workflow.id)}>Delete</button> : null}</article>
        })}
      </EditorList>
    </div>
  )
}

function RoleAssignments({ workspaceId, catalog }: EditorProps) {
  const mutation = useCatalogMutation(workspaceId, ({ memberId, roleIds }: { memberId: string; roleIds: string[] }) => replaceMemberRoles(workspaceId, memberId, roleIds))
  return (
    <section className="assignment-panel">
      <div><p className="section-kicker">Assignments</p><h3>Connect members to roles</h3></div>
      {catalog.members.map((member) => (
        <fieldset key={member.id}>
          <legend>{member.name}</legend>
          {catalog.roles.map((role) => (
            <label key={role.id}><input type="checkbox" checked={member.roleIds.includes(role.id)} disabled={mutation.isPending} onChange={(event) => {
              const roleIds = event.target.checked ? [...member.roleIds, role.id] : member.roleIds.filter((id) => id !== role.id)
              mutation.mutate({ memberId: member.id, roleIds })
            }} /><span>{role.name}</span></label>
          ))}
        </fieldset>
      ))}
      {mutation.isError ? <p className="form-error" role="alert">{mutation.error.message}</p> : null}
    </section>
  )
}

function MemberMultiSelect({ legend, members, selectedIds, onChange }: {
  legend: string
  members: DraftCatalog['members']
  selectedIds: string[]
  onChange: (ids: string[]) => void
}) {
  return (
    <fieldset className="shared-role-picker">
      <legend>{legend}</legend>
      <p>Select every member who should hold this shared role. There is no one-person limit.</p>
      {members.map((member) => (
        <label key={member.id}><input type="checkbox" checked={selectedIds.includes(member.id)} onChange={(event) => onChange(event.target.checked ? [...selectedIds, member.id] : selectedIds.filter((id) => id !== member.id))} /><span>{member.name}</span></label>
      ))}
    </fieldset>
  )
}

async function syncRoleHolders(workspaceId: string, catalog: DraftCatalog, roleId: string, selectedHolderIds: string[]) {
  const selected = new Set(selectedHolderIds)
  let latest = catalog
  for (const member of catalog.members) {
    const currentlyAssigned = member.roleIds.includes(roleId)
    const shouldBeAssigned = selected.has(member.id)
    if (currentlyAssigned === shouldBeAssigned) continue
    const roleIds = shouldBeAssigned ? [...member.roleIds, roleId] : member.roleIds.filter((id) => id !== roleId)
    latest = await replaceMemberRoles(workspaceId, member.id, roleIds)
  }
  return latest
}

type EditorProps = { workspaceId: string; catalog: DraftCatalog }
type EditorStageProps = EditorProps & { onContinue: () => void }

function useCatalogMutation<T>(workspaceId: string, mutationFn: (input: T) => Promise<DraftCatalog>, onSuccess?: () => void) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: (catalog) => {
      queryClient.setQueryData(['draft-catalog', workspaceId], catalog)
      void queryClient.invalidateQueries({ queryKey: ['draft-continuity', workspaceId] })
      onSuccess?.()
    },
  })
}

function EditorForm({ title, intro, onSubmit, error, children }: { title: string; intro: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void; error?: string; children: ReactNode }) {
  return <form className="editor-form" onSubmit={onSubmit}><div><p className="section-kicker">Create</p><h3>{title}</h3><p>{intro}</p></div>{children}{error ? <p className="form-error" role="alert">{error}</p> : null}</form>
}

function EditorList({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  return <section className="editor-list"><div className="editor-list-heading"><h3>{title}</h3></div><div>{Children.count(children) > 0 ? children : <p className="editor-empty">{empty}</p>}</div></section>
}

function Field({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: string }) {
  return <label className="editor-field"><span>{label}</span><input type={type} value={value} maxLength={254} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <label className="editor-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
}

function NumberField({ label, value, onChange, min }: { label: string; value: number; onChange: (value: number) => void; min: number }) {
  return <label className="editor-field"><span>{label}</span><input type="number" value={value} min={min} max={99} onChange={(event) => onChange(Math.max(min, Number(event.target.value) || min))} /></label>
}

function enumOptions(values: string[]) {
  return values.map((value) => ({ value, label: formatEnum(value) }))
}

function formatEnum(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase())
}
