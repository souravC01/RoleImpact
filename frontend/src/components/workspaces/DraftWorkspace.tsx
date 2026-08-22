import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Workspace } from '../../api/workspaces'
import DraftEditor, { type DraftEditorView } from './editor/DraftEditor'

type DraftWorkspaceProps = {
  workspace: Workspace
  view: DraftEditorView
  newlyCreated?: boolean
  onViewChange: (view: DraftEditorView) => void
}

export default function DraftWorkspace({ workspace, view, newlyCreated = false, onViewChange }: DraftWorkspaceProps) {
  const navigate = useNavigate()
  const [showOnboarding, setShowOnboarding] = useState(newlyCreated)
  const [copyMessage, setCopyMessage] = useState<string | null>(null)
  const isEmpty = workspace.counts.members === 0
  const isImpactView = view === 'impact'

  async function copyValue(value: string, message: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopyMessage(message)
    } catch {
      setCopyMessage('Copy failed. Select the organization ID and copy it manually.')
    }
  }

  const organizationLink = `${window.location.origin}/organizations/${workspace.publicCode}/map`

  return (
    <div className="draft-shell">
      <header className="topbar draft-topbar">
        <button className="brand brand-button" type="button" onClick={() => navigate('/')} aria-label="Back to workspaces">
          <span className="brand-mark" aria-hidden="true">R</span>
          <span>RoleImpact</span>
        </button>
        <div className="organization-recovery" aria-label="Organization recovery">
          <span className="draft-status">Editable organization</span>
          <code>{workspace.publicCode}</code>
          <button type="button" onClick={() => void copyValue(workspace.publicCode, 'Organization ID copied.')}>Copy organization ID</button>
          <button type="button" onClick={() => void copyValue(organizationLink, 'Organization link copied.')}>Copy organization link</button>
        </div>
      </header>
      <main className={`draft-main ${isImpactView ? 'impact-main' : ''}`}>
        {copyMessage ? <p className="copy-feedback" role="status">{copyMessage}</p> : null}
        {showOnboarding && !isImpactView ? (
          <section className="organization-onboarding" aria-labelledby="save-organization-title">
            <div>
              <p className="section-kicker">Keep access to your work</p>
              <h2 id="save-organization-title">Save this organization ID</h2>
              <p>
                Bookmark this page or copy the organization ID. Anyone with this link or ID can edit this
                organization. Do not enter confidential company or personal information.
              </p>
            </div>
            <div className="organization-onboarding-actions">
              <button type="button" onClick={() => void copyValue(organizationLink, 'Organization link copied.')}>Copy organization link</button>
              <button className="secondary-button" type="button" onClick={() => setShowOnboarding(false)}>Got it</button>
            </div>
          </section>
        ) : null}
        {!isImpactView ? (
          <>
            <p className="eyebrow">Organization builder</p>
            <h1>{workspace.name}</h1>
            <p className="draft-lede">
              {isEmpty
                ? 'Your organization is ready. Add its first team and build outward from there.'
                : 'Edit the model, test access changes, and return later using the organization ID or link.'}
            </p>
          </>
        ) : null}
        <DraftEditor workspaceId={workspace.id} view={view} onViewChange={onViewChange} />
        <button className="text-button" type="button" onClick={() => navigate('/')}>← Back to workspace choices</button>
      </main>
    </div>
  )
}
