import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  getAgentAttachmentDirectory,
  isManagedAttachmentOwnedBy,
  resolveManagedAttachmentPath,
} from '../../api/lib/agent-attachment-storage.js'

describe('Agent attachment path isolation', () => {
  it('resolves current user-scoped and legacy attachment URLs inside the managed root', () => {
    expect(resolveManagedAttachmentPath('/api/uploads/agent-attachments/user-1/file.webp')).toBe(
      path.join(getAgentAttachmentDirectory(), 'user-1', 'file.webp'),
    )
    expect(resolveManagedAttachmentPath('/api/uploads/agent-attachments/legacy.webp')).toBe(
      path.join(getAgentAttachmentDirectory(), 'legacy.webp'),
    )
  })

  it('rejects traversal and nested unowned paths', () => {
    expect(resolveManagedAttachmentPath('/api/uploads/agent-attachments/../secret.txt')).toBeNull()
    expect(resolveManagedAttachmentPath('/api/uploads/agent-attachments/user/a/b.txt')).toBeNull()
    expect(resolveManagedAttachmentPath('/other/user/a.txt')).toBeNull()
  })

  it('enforces the owner segment while preserving legacy URLs', () => {
    expect(isManagedAttachmentOwnedBy('/api/uploads/agent-attachments/user-1/file.webp', 'user-1')).toBe(true)
    expect(isManagedAttachmentOwnedBy('/api/uploads/agent-attachments/user-2/file.webp', 'user-1')).toBe(false)
    expect(isManagedAttachmentOwnedBy('/api/uploads/agent-attachments/legacy.webp', 'user-1')).toBe(true)
  })
})
