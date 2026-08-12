import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

afterEach(() => {
  vi.restoreAllMocks()
})

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  )
}

describe('App', () => {
  it('renders the seeded organization dashboard', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
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
          workflows: [
            {
              id: '50000000-0000-0000-0000-000000000002',
              name: 'Month-End Close',
              criticality: 'CRITICAL',
              stepCount: 2,
              ownerName: 'Olivia Park',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    renderApp()

    expect(await screen.findByText(/Harborline Commerce/)).toBeInTheDocument()
    expect(screen.getByText('24')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Month-End Close' })).toBeInTheDocument()
    expect(screen.getByText('Immutable snapshot')).toBeInTheDocument()
  })
})
