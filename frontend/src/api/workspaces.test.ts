import { describe, expect, it } from 'vitest'
import { normalizeWorkspaceCode } from './workspaces'

describe('normalizeWorkspaceCode', () => {
  it('accepts a 16-character organization edit code with or without its separator', () => {
    const displayed = 'NMS-7K4P9D8XM2QR6WBC'

    expect(normalizeWorkspaceCode(displayed.toLowerCase())).toBe(displayed)
    expect(normalizeWorkspaceCode(displayed.replace('-', ''))).toBe(displayed)
    expect(normalizeWorkspaceCode('NMS-7K4P9D')).toBeNull()
  })

  it('keeps existing 32-character organization IDs valid', () => {
    const existing = 'NMS-0123456789ABCDEF0123456789ABCDEF'

    expect(normalizeWorkspaceCode(existing)).toBe(existing)
  })
})
