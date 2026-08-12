import { useQuery } from '@tanstack/react-query'
import { fetchDashboard } from './api/dashboard'
import './App.css'

export default function App() {
  const dashboardQuery = useQuery({
    queryKey: ['dashboard', 'harborline-commerce'],
    queryFn: ({ signal }) => fetchDashboard(signal),
    retry: 1,
  })

  if (dashboardQuery.isPending) {
    return (
      <main className="centered-state" aria-live="polite">
        <span className="loader" aria-hidden="true" />
        <p>Loading the Harborline baseline…</p>
      </main>
    )
  }

  if (dashboardQuery.isError) {
    return (
      <main className="centered-state error-state" role="alert">
        <p className="eyebrow">Connection problem</p>
        <h1>We couldn’t load RoleImpact.</h1>
        <p>Make sure the API and PostgreSQL are running locally.</p>
        <button type="button" onClick={() => dashboardQuery.refetch()}>
          Retry
        </button>
      </main>
    )
  }

  const dashboard = dashboardQuery.data
  const stats = [
    {
      label: 'Active employees',
      value: dashboard.counts.activeEmployees,
      detail: `${dashboard.counts.employees} total`,
    },
    { label: 'Access roles', value: dashboard.counts.roles, detail: 'assigned across teams' },
    { label: 'Applications', value: dashboard.counts.applications, detail: 'in the access graph' },
    { label: 'Workflows', value: dashboard.counts.workflows, detail: 'ready to simulate' },
  ]

  return (
    <div className="dashboard-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="RoleImpact home">
          <span className="brand-mark" aria-hidden="true">R</span>
          <span>RoleImpact</span>
        </a>
        <div className="baseline-chip">
          <span className="connection-dot" aria-hidden="true" />
          {dashboard.organization.name} · Dataset v{dashboard.organization.baselineVersion}
        </div>
      </header>

      <main className="dashboard-main">
        <section className="intro" aria-labelledby="page-title">
          <div>
            <p className="eyebrow">Access change impact simulator</p>
            <h1 id="page-title">See the blast radius before access changes go live.</h1>
            <p className="lede">
              Explore the current Harborline access graph and the business workflows
              that future simulations will protect.
            </p>
          </div>
          <div className="next-step-card">
            <span>Next capability</span>
            <strong>Revoke-role simulation</strong>
            <p>The baseline is loaded and ready for the deterministic impact engine.</p>
          </div>
        </section>

        <section aria-labelledby="overview-title">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Live catalog</p>
              <h2 id="overview-title">Organization overview</h2>
            </div>
            <p>{dashboard.counts.teams} teams · {dashboard.counts.permissions} permissions · {dashboard.counts.capabilities} capabilities</p>
          </div>

          <div className="stat-grid">
            {stats.map((stat) => (
              <article className="stat-card" key={stat.label}>
                <p>{stat.label}</p>
                <strong>{stat.value}</strong>
                <span>{stat.detail}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="workflow-section" aria-labelledby="workflows-title">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Business context</p>
              <h2 id="workflows-title">Protected workflows</h2>
            </div>
            <p>Ordered by business criticality</p>
          </div>

          <div className="workflow-list">
            {dashboard.workflows.map((workflow, index) => (
              <article className="workflow-row" key={workflow.id}>
                <span className="workflow-index" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="workflow-name">
                  <h3>{workflow.name}</h3>
                  <p>Owner: {workflow.ownerName ?? 'Unassigned'}</p>
                </div>
                <span className={`criticality ${workflow.criticality.toLowerCase()}`}>
                  {workflow.criticality}
                </span>
                <p className="step-count">
                  <strong>{workflow.stepCount}</strong> {workflow.stepCount === 1 ? 'step' : 'steps'}
                </p>
              </article>
            ))}
          </div>
        </section>

        <footer className="snapshot-footer">
          <span>Immutable snapshot</span>
          <code>{dashboard.organization.contentHash.slice(0, 12)}</code>
        </footer>
      </main>
    </div>
  )
}
