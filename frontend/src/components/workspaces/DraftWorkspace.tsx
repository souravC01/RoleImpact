import type { Workspace } from '../../api/workspaces'

type DraftWorkspaceProps = {
  workspace: Workspace
  onBack: () => void
}

export default function DraftWorkspace({ workspace, onBack }: DraftWorkspaceProps) {
  const isEmpty = workspace.counts.members === 0
  return (
    <div className="draft-shell">
      <header className="topbar">
        <button className="brand brand-button" type="button" onClick={onBack} aria-label="Back to workspaces">
          <span className="brand-mark" aria-hidden="true">R</span>
          <span>RoleImpact</span>
        </button>
        <span className="draft-status">Draft · not yet published</span>
      </header>
      <main className="draft-main">
        <p className="eyebrow">Organization builder</p>
        <h1>{workspace.name}</h1>
        <p className="draft-lede">
          {isEmpty
            ? 'Your organization is ready. Add its first team and build outward from there.'
            : 'Your Harborline copy is ready. Every record has a fresh identity, so changes here cannot affect the example.'}
        </p>
        <div className="draft-summary" aria-label="Draft catalog summary">
          {Object.entries(workspace.counts).map(([label, value]) => (
            <article key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
            </article>
          ))}
        </div>
        <section className="builder-next-card">
          <span className="choice-number">Next</span>
          <div>
            <p className="section-kicker">Builder foundation ready</p>
            <h2>{isEmpty ? 'Add your first team' : 'Review teams and members'}</h2>
            <p>The next implementation slice adds the guided Team → Member → Role editor on top of this draft.</p>
          </div>
          <button type="button" disabled>{isEmpty ? 'Add team' : 'Open team editor'}</button>
        </section>
        <button className="text-button" type="button" onClick={onBack}>← Back to workspace choices</button>
      </main>
    </div>
  )
}
