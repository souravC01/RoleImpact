import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { fetchWorkspaceByCode, normalizeWorkspaceCode } from '../../api/workspaces'
import DraftWorkspace from './DraftWorkspace'
import type { DraftEditorView } from './editor/DraftEditor'

const validViews: DraftEditorView[] = ['map', 'impact', 'inventory']

export default function OrganizationRoute() {
  const { publicCode = '', view = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const routeState = location.state as { newlyCreated?: boolean } | null
  const normalizedCode = normalizeWorkspaceCode(publicCode)
  const validView = validViews.includes(view as DraftEditorView) ? view as DraftEditorView : null
  const workspaceQuery = useQuery({
    queryKey: ['workspace', normalizedCode],
    queryFn: ({ signal }) => fetchWorkspaceByCode(normalizedCode!, signal),
    enabled: Boolean(normalizedCode),
    retry: false,
  })

  useEffect(() => {
    if (routeState?.newlyCreated) {
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.pathname, navigate, routeState?.newlyCreated])

  if (normalizedCode && !validView) {
    return <Navigate replace to={`/organizations/${normalizedCode}/map`} />
  }

  if (!normalizedCode) {
    return <OrganizationRecovery title="That organization ID is not valid." />
  }

  if (workspaceQuery.isPending) {
    return (
      <main className="centered-state" aria-live="polite">
        <span className="loader" aria-hidden="true" />
        <p>Opening your organization…</p>
      </main>
    )
  }

  if (workspaceQuery.isError) {
    return (
      <OrganizationRecovery
        title="Organization not found"
        detail={workspaceQuery.error.message}
        onRetry={() => void workspaceQuery.refetch()}
      />
    )
  }

  return (
    <DraftWorkspace
      workspace={workspaceQuery.data}
      view={validView!}
      newlyCreated={Boolean(routeState?.newlyCreated)}
      onViewChange={(nextView) => navigate(`/organizations/${workspaceQuery.data.publicCode}/${nextView}`)}
    />
  )
}

function OrganizationRecovery({ title, detail, onRetry }: {
  title: string
  detail?: string
  onRetry?: () => void
}) {
  const navigate = useNavigate()
  return (
    <main className="centered-state error-state organization-recovery-screen" role="alert">
      <p className="eyebrow">Organization access</p>
      <h1>{title}</h1>
      <p>{detail ?? 'Check the organization ID and try again.'}</p>
      <div className="recovery-actions">
        {onRetry ? <button type="button" onClick={onRetry}>Retry</button> : null}
        <button type="button" onClick={() => navigate('/')}>Try another organization ID</button>
        <button type="button" onClick={() => navigate('/')}>Return home</button>
        <button className="secondary-button" type="button" onClick={() => navigate('/')}>Create a new organization</button>
      </div>
    </main>
  )
}
