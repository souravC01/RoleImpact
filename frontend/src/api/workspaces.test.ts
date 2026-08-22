import { describe, expect, it } from 'vitest'
import { normalizeWorkspaceCode } from './workspaces'

describe('normalizeWorkspaceCode', () => {
  it('accepts a 128-bit organization edit code with or without its separator', () => {
    const displayed = 'NMS-0123456789ABCDEF0123456789ABCDEF'

    expect(normalizeWorkspaceCode(displayed.toLowerCase())).toBe(displayed)
    expect(normalizeWorkspaceCode(displayed.replace('-', ''))).toBe(displayed)
    expect(normalizeWorkspaceCode('NMS-7K4P9D')).toBeNull()
  })
})
