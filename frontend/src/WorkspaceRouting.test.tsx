import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const workspaceCode = 'NMS-0123456789ABCDEF0123456789ABCDEF'
const compactWorkspaceCode = workspaceCode.replace('-', '')

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'clipboard')
})

describe('organization routing', () => {
  it('replaces Harborline cloning with organization ID access', async () => {
    mockWorkspaceRequests()
    renderApp(['/'])

    expect(await screen.findByRole('heading', { name: 'Open your organization' })).toBeInTheDocument()
    expect(screen.getByLabelText('Organization ID')).toBeInTheDocument()
    expect(screen.queryByText('Clone Harborline')).not.toBeInTheDocument()
  })

  it('opens an existing organization from a code without its hyphen', async () => {
    const user = userEvent.setup()
    mockWorkspaceRequests()
    renderApp(['/'])

    await user.type(await screen.findByLabelText('Organization ID'), compactWorkspaceCode.toLowerCase())
    await user.click(screen.getByRole('button', { name: 'Open organization' }))

    expect(await screen.findByRole('heading', { name: 'Northstar Medical Supplies' })).toBeInTheDocument()
    expect(screen.getByText(workspaceCode)).toBeInTheDocument()
  })

  it('loads the inventory route directly', async () => {
    mockWorkspaceRequests()
    renderApp([`/organizations/${workspaceCode}/inventory`])

    expect(await screen.findByRole('heading', { name: 'Northstar Medical Supplies' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Detailed inventory' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('rejects a malformed organization ID before making a lookup request', async () => {
    const user = userEvent.setup()
    const fetchMock = mockWorkspaceRequests()
    renderApp(['/'])

    await user.type(await screen.findByLabelText('Organization ID'), 'bad-id')
    await user.click(screen.getByRole('button', { name: 'Open organization' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Paste the complete organization ID from your saved link')
    expect(fetchMock.mock.calls.some(([input]) => input.toString().includes('/by-code/'))).toBe(false)
  })

  it('keeps an unknown organization route open and offers recovery actions', async () => {
    mockWorkspaceRequests()
    renderApp(['/organizations/ABC-FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF/map'])

    expect(await screen.findByRole('heading', { name: 'Organization not found' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try another organization ID' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Return home' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create a new organization' })).toBeInTheDocument()
  })

  it('loads the impact route directly without returning to the home page', async () => {
    mockWorkspaceRequests()
    renderApp([`/organizations/${workspaceCode}/impact`])

    expect(await screen.findByRole('button', { name: 'Test impact' })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByRole('heading', { name: 'Create one workflow first' })).toBeInTheDocument()
  })

  it.each([
    `/organizations/${workspaceCode}`,
    `/organizations/${workspaceCode}/not-a-view`,
  ])('redirects %s to the organization map', async (entry) => {
    mockWorkspaceRequests()
    renderApp([entry])

    expect(await screen.findByRole('button', { name: 'Organization map' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('loads the read-only example directly', async () => {
    mockWorkspaceRequests()
    renderApp(['/example'])

    expect(await screen.findByRole('heading', { name: 'See the blast radius before access changes go live.' })).toBeInTheDocument()
  })

  it('copies the stable organization ID and canonical map link', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    mockWorkspaceRequests()
    renderApp([`/organizations/${workspaceCode}/inventory`])

    await user.click(await screen.findByRole('button', { name: 'Copy organization ID' }))
    await user.click(screen.getByRole('button', { name: 'Copy organization link' }))

    expect(writeText).toHaveBeenNthCalledWith(1, workspaceCode)
    expect(writeText).toHaveBeenNthCalledWith(
      2,
      `${window.location.origin}/organizations/${workspaceCode}/map`,
    )
    expect(screen.queryByRole('heading', { name: 'Save this organization ID' })).not.toBeInTheDocument()
  })

  it('shows recovery onboarding immediately after creating an organization', async () => {
    const user = userEvent.setup()
    mockWorkspaceRequests()
    renderApp(['/'])

    await user.type(await screen.findByLabelText('Organization name'), 'Northstar Medical Supplies')
    await user.click(screen.getByRole('button', { name: 'Start blank' }))

    expect(await screen.findByRole('heading', { name: 'Save this organization ID' })).toBeInTheDocument()
    expect(screen.getByText(/Anyone with this link or ID can edit this organization/)).toBeInTheDocument()
    expect(screen.getByText(/Do not enter confidential company or personal information/)).toBeInTheDocument()
  })
})

function renderApp(initialEntries: string[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

function mockWorkspaceRequests() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = input.toString()
    if (url.endsWith('/api/v1/dashboard')) return jsonResponse(dashboardFixture)
    if (url.endsWith('/api/v1/workspaces') && init?.method === 'POST') return jsonResponse(workspaceFixture, 201)
    if (url.endsWith(`/api/v1/workspaces/by-code/${workspaceCode}`)) return jsonResponse(workspaceFixture)
    if (url.endsWith('/catalog')) return jsonResponse(catalogFixture)
    if (url.endsWith('/impact-previews/continuity')) return jsonResponse([])
    return jsonResponse({ message: 'Organization not found' }, 404)
  })
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const workspaceFixture = {
  id: '10000000-0000-0000-0000-000000000001',
  slug: 'northstar-medical-supplies',
  name: 'Northstar Medical Supplies',
  status: 'DRAFT',
  currentVersion: 0,
  publicCode: workspaceCode,
  createdAt: '2026-08-21T12:00:00Z',
  updatedAt: '2026-08-21T12:00:00Z',
  counts: { teams: 0, members: 0, roles: 0, permissions: 0, capabilities: 0, workflows: 0 },
}

const catalogFixture = {
  workspaceId: workspaceFixture.id,
  teams: [],
  members: [],
  roles: [],
  workflows: [],
}

const dashboardFixture = {
  organization: {
    id: '00000000-0000-0000-0000-000000000001',
    slug: 'harborline-commerce',
    name: 'Harborline Commerce',
    baselineVersion: 1,
    contentHash: 'dbafb569ae3beaa13277897a7700ab32867675e31ee90cad74a9dc544d5c1fb4',
  },
  counts: {
    employees: 25,
    activeEmployees: 24,
    teams: 5,
    roles: 8,
    applications: 6,
    permissions: 23,
    capabilities: 10,
    workflows: 4,
  },
  workflows: [],
}
