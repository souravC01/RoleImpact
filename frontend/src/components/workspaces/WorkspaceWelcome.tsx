import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cloneWorkspace, createWorkspace, fetchWorkspaces, type Workspace } from '../../api/workspaces'

type WorkspaceWelcomeProps = {
  onExploreTemplate: () => void
  onOpenDraft: (workspace: Workspace) => void
}

export default function WorkspaceWelcome({ onExploreTemplate, onOpenDraft }: WorkspaceWelcomeProps) {
  const queryClient = useQueryClient()
  const [blankName, setBlankName] = useState('')
  const [cloneName, setCloneName] = useState('Harborline Sandbox')
  const workspacesQuery = useQuery({
    queryKey: ['workspaces'],
    queryFn: ({ signal }) => fetchWorkspaces(signal),
    retry: 1,
  })
  const harborline = workspacesQuery.data?.find((workspace) => workspace.slug === 'harborline-commerce')

  const blankMutation = useMutation({
    mutationFn: createWorkspace,
    onSuccess: (workspace) => {
      queryClient.setQueryData<Workspace[]>(['workspaces'], (current = []) => [...current, workspace])
      onOpenDraft(workspace)
    },
  })
  const cloneMutation = useMutation({
    mutationFn: ({ sourceId, name }: { sourceId: string; name: string }) => cloneWorkspace(sourceId, { name }),
    onSuccess: (workspace) => {
      queryClient.setQueryData<Workspace[]>(['workspaces'], (current = []) => [...current, workspace])
      onOpenDraft(workspace)
    },
  })

  function submitBlank(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (blankName.trim()) blankMutation.mutate({ name: blankName.trim() })
  }

  function submitClone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (harborline && cloneName.trim()) {
      cloneMutation.mutate({ sourceId: harborline.id, name: cloneName.trim() })
    }
  }

  return (
    <div className="workspace-home">
      <header className="workspace-home-header">
        <a className="brand" href="/" aria-label="RoleImpact home">
          <span className="brand-mark" aria-hidden="true">R</span>
          <span>RoleImpact</span>
        </a>
        <span className="workspace-home-status">
          <span className="connection-dot" aria-hidden="true" />
          Local workspace
        </span>
      </header>

      <main className="workspace-home-main">
        <section className="workspace-hero" aria-labelledby="workspace-title">
          <p className="eyebrow">Model your organization</p>
          <h1 id="workspace-title">Build the access graph your business actually runs on.</h1>
          <p>
            Start with a working example or build a clean model of your own people, roles,
            permissions, capabilities, and workflows.
          </p>
        </section>

        {workspacesQuery.isError ? (
          <div className="workspace-load-error" role="alert">
            <strong>Workspaces could not be loaded.</strong>
            <button type="button" onClick={() => workspacesQuery.refetch()}>Retry</button>
          </div>
        ) : (
          <section className="workspace-choice-grid" aria-label="Choose how to begin">
            <article className="workspace-choice featured-choice">
              <span className="choice-number">01</span>
              <div>
                <p className="section-kicker">Learn from the example</p>
                <h2>Explore Harborline</h2>
                <p>See Priya’s role change travel through a complete, realistic business workflow.</p>
              </div>
              <dl className="workspace-mini-stats">
                <div><dt>Members</dt><dd>{harborline?.counts.members ?? '—'}</dd></div>
                <div><dt>Roles</dt><dd>{harborline?.counts.roles ?? '—'}</dd></div>
                <div><dt>Workflows</dt><dd>{harborline?.counts.workflows ?? '—'}</dd></div>
              </dl>
              <button type="button" disabled={!harborline} onClick={onExploreTemplate}>
                Explore the example
              </button>
            </article>

            <article className="workspace-choice">
              <span className="choice-number">02</span>
              <div>
                <p className="section-kicker">Fastest way to customize</p>
                <h2>Clone Harborline</h2>
                <p>Copy the full example into an editable draft, then reshape it into your own organization.</p>
              </div>
              <form onSubmit={submitClone}>
                <label htmlFor="clone-name">Draft name</label>
                <input
                  id="clone-name"
                  value={cloneName}
                  maxLength={160}
                  onChange={(event) => setCloneName(event.target.value)}
                />
                <button type="submit" disabled={!harborline || cloneMutation.isPending || !cloneName.trim()}>
                  {cloneMutation.isPending ? 'Cloning…' : 'Clone and customize'}
                </button>
                {cloneMutation.isError ? <p className="form-error" role="alert">{cloneMutation.error.message}</p> : null}
              </form>
            </article>

            <article className="workspace-choice">
              <span className="choice-number">03</span>
              <div>
                <p className="section-kicker">Start from first principles</p>
                <h2>Create a blank organization</h2>
                <p>Begin with an empty draft and add only the teams and relationships you need.</p>
              </div>
              <form onSubmit={submitBlank}>
                <label htmlFor="blank-name">Organization name</label>
                <input
                  id="blank-name"
                  value={blankName}
                  maxLength={160}
                  placeholder="Northstar Labs"
                  onChange={(event) => setBlankName(event.target.value)}
                />
                <button type="submit" disabled={blankMutation.isPending || !blankName.trim()}>
                  {blankMutation.isPending ? 'Creating…' : 'Start blank'}
                </button>
                {blankMutation.isError ? <p className="form-error" role="alert">{blankMutation.error.message}</p> : null}
              </form>
            </article>
          </section>
        )}
      </main>
    </div>
  )
}
