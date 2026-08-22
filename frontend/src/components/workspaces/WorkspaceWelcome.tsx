import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { fetchDashboard } from '../../api/dashboard'
import {
  createWorkspace,
  fetchWorkspaceByCode,
  normalizeWorkspaceCode,
} from '../../api/workspaces'

export default function WorkspaceWelcome() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [organizationCode, setOrganizationCode] = useState('')
  const [blankName, setBlankName] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const dashboardQuery = useQuery({
    queryKey: ['dashboard', 'harborline-commerce'],
    queryFn: ({ signal }) => fetchDashboard(signal),
    retry: 1,
  })
  const openMutation = useMutation({
    mutationFn: (code: string) => fetchWorkspaceByCode(code),
    onSuccess: (workspace) => {
      queryClient.setQueryData(['workspace', workspace.publicCode], workspace)
      navigate(`/organizations/${workspace.publicCode}/map`)
    },
  })
  const blankMutation = useMutation({
    mutationFn: createWorkspace,
    onSuccess: (workspace) => {
      queryClient.setQueryData(['workspace', workspace.publicCode], workspace)
      navigate(`/organizations/${workspace.publicCode}/map`, { state: { newlyCreated: true } })
    },
  })

  function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCodeError(null)
    const normalizedCode = normalizeWorkspaceCode(organizationCode)
    if (!normalizedCode) {
      setCodeError('Paste the complete organization ID from your saved link')
      return
    }
    openMutation.mutate(normalizedCode)
  }

  function submitBlank(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (blankName.trim()) blankMutation.mutate({ name: blankName.trim() })
  }

  const counts = dashboardQuery.data?.counts

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
            Start with a working example, reopen an existing organization, or build a clean model
            of your own people, roles, responsibilities, and workflows.
          </p>
        </section>

        <section className="workspace-choice-grid" aria-label="Choose how to begin">
          <article className="workspace-choice featured-choice">
            <span className="choice-number">01</span>
            <div>
              <p className="section-kicker">Learn from the example</p>
              <h2>Explore Harborline</h2>
              <p>See Priya’s role change travel through a complete, realistic business workflow.</p>
            </div>
            <dl className="workspace-mini-stats">
              <div><dt>Members</dt><dd>{counts?.employees ?? '—'}</dd></div>
              <div><dt>Roles</dt><dd>{counts?.roles ?? '—'}</dd></div>
              <div><dt>Workflows</dt><dd>{counts?.workflows ?? '—'}</dd></div>
            </dl>
            <button type="button" onClick={() => navigate('/example')}>
              Explore the example
            </button>
            {dashboardQuery.isError ? (
              <p className="form-error" role="status">Example statistics are temporarily unavailable.</p>
            ) : null}
          </article>

          <article className="workspace-choice">
            <span className="choice-number">02</span>
            <div>
              <p className="section-kicker">Continue where you left off</p>
              <h2>Open your organization</h2>
              <p>Enter the editable organization ID you saved when the workspace was created.</p>
            </div>
            <form onSubmit={submitCode}>
              <label htmlFor="organization-code">Organization ID</label>
              <input
                id="organization-code"
                value={organizationCode}
                maxLength={36}
                autoCapitalize="characters"
                placeholder="NMS-0123456789ABCDEF0123456789ABCDEF"
                onChange={(event) => {
                  setOrganizationCode(event.target.value)
                  setCodeError(null)
                  openMutation.reset()
                }}
              />
              <button type="submit" disabled={openMutation.isPending || !organizationCode.trim()}>
                {openMutation.isPending ? 'Opening…' : 'Open organization'}
              </button>
              {codeError ? <p className="form-error" role="alert">{codeError}</p> : null}
              {openMutation.isError ? (
                <p className="form-error" role="alert">{openMutation.error.message}</p>
              ) : null}
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
              {blankMutation.isError ? (
                <p className="form-error" role="alert">{blankMutation.error.message}</p>
              ) : null}
            </form>
          </article>
        </section>
      </main>
    </div>
  )
}
