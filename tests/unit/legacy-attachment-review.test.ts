import { describe, expect, it } from 'vitest'
import { legacyAttachmentReviewSchema } from '../../api/lib/legacy-agent-attachment-grants.js'

const review = {
  url: '/api/uploads/agent-attachments/legacy.txt', ownerUserId: 'owner-1',
  contentSha256: 'a'.repeat(64), evidenceRef: 'verified-upload-ticket', verification: 'operator_verified_ownership',
}
describe('legacy ownership review admission', () => {
  it('accepts a complete explicitly reviewed legacy grant', () => {
    expect(legacyAttachmentReviewSchema.parse(review)).toEqual(review)
  })
  it.each([
    { verification: 'message_reference' }, { verification: undefined }, { evidenceRef: '' },
    { contentSha256: 'unknown' }, { ownerUserId: '../owner' }, { url: '/api/uploads/agent-attachments/owner/file.txt' },
    { url: '/api/uploads/agent-attachments/../secret' }, { url: 'https://example.com/legacy.txt' },
  ])('rejects unverified/invalid input %j', patch => {
    expect(legacyAttachmentReviewSchema.safeParse({ ...review, ...patch }).success).toBe(false)
  })
})
