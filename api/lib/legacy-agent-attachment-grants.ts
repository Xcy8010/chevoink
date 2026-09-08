import { createHash } from 'node:crypto'
import { open, realpath } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { MAX_AGENT_FILE_BYTES_PDF } from '../../shared/contracts/agent-attachments.js'
import { getAgentAttachmentDirectory, MANAGED_AGENT_ATTACHMENT_PREFIX, resolveManagedAttachmentPath } from './agent-attachment-storage.js'
import { DataAccessError, prisma } from './prisma.js'

export function isLegacyAttachmentUrl(url: string): boolean {
  return Boolean(resolveManagedAttachmentPath(url)) && !url.slice(MANAGED_AGENT_ATTACHMENT_PREFIX.length).includes('/')
}

export const legacyAttachmentReviewSchema = z.object({
  url: z.string().max(512).refine(isLegacyAttachmentUrl, 'Only canonical legacy URLs are eligible'),
  ownerUserId: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  evidenceRef: z.string().trim().min(1).max(512),
  // Explicit review, not inferred from user-supplied message metadata.
  verification: z.literal('operator_verified_ownership'),
}).strict()

export async function inspectLegacyAttachment(url: string): Promise<{ contentSha256: string; bytes: number }> {
  if (!isLegacyAttachmentUrl(url)) throw new DataAccessError(400, 'INVALID_LEGACY_ATTACHMENT', '不是规范的历史附件地址。')
  const root = await realpath(getAgentAttachmentDirectory())
  const file = path.join(root, path.basename(url))
  if (await realpath(file) !== file) throw new DataAccessError(403, 'FORBIDDEN', '不能核验链接或别名文件。')
  const handle = await open(file, 'r')
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || !stat.size || stat.size > MAX_AGENT_FILE_BYTES_PDF) throw new DataAccessError(413, 'ATTACHMENT_SIZE_INVALID', '附件体积无效。')
    const hash = createHash('sha256')
    const buffer = Buffer.alloc(64 * 1024)
    let bytes = 0
    while (true) {
      const result = await handle.read(buffer, 0, buffer.length, null)
      if (!result.bytesRead) break
      bytes += result.bytesRead
      if (bytes > MAX_AGENT_FILE_BYTES_PDF) throw new DataAccessError(413, 'ATTACHMENT_SIZE_INVALID', '附件体积无效。')
      hash.update(buffer.subarray(0, result.bytesRead))
    }
    if (bytes !== stat.size) throw new DataAccessError(409, 'ATTACHMENT_CHANGED', '核验期间附件已变化。')
    return { contentSha256: hash.digest('hex'), bytes }
  } finally { await handle.close() }
}

/** Operator-only maintenance path; deliberately not exposed as a user/Agent API. */
export async function applyReviewedLegacyAttachment(raw: unknown, approvedBy: string) {
  const review = legacyAttachmentReviewSchema.parse(raw)
  if (!approvedBy.trim() || approvedBy.length > 128) throw new DataAccessError(400, 'REVIEWER_REQUIRED', '需要记录核验操作人。')
  const inspected = await inspectLegacyAttachment(review.url)
  if (review.contentSha256 !== inspected.contentSha256) throw new DataAccessError(409, 'ATTACHMENT_CHANGED', '文件与核验清单不一致，不授予访问权。')
  return prisma.$transaction(async tx => {
    const exists = await tx.legacyAgentAttachmentGrant.findUnique({ where: { url: review.url } })
    if (exists) {
      if (exists.ownerUserId !== review.ownerUserId || exists.contentSha256 !== review.contentSha256 || exists.evidenceRef !== review.evidenceRef || exists.revokedAt) {
        throw new DataAccessError(409, 'ATTACHMENT_GRANT_CONFLICT', '已有核验结果不同或已撤销，禁止静默覆盖。')
      }
      return exists
    }
    const owner = await tx.user.findUnique({ where: { id: review.ownerUserId }, select: { id: true } })
    if (!owner) throw new DataAccessError(404, 'ATTACHMENT_OWNER_NOT_FOUND', '核验用户不存在。')
    return tx.legacyAgentAttachmentGrant.create({ data: {
      url: review.url, ownerUserId: review.ownerUserId, contentSha256: review.contentSha256,
      evidenceRef: review.evidenceRef, approvedBy,
    } })
  }, { isolationLevel: 'Serializable' })
}

/** A bounded, read-only page of references, NOT proof of uploader ownership. */
export async function listLegacyAttachmentReferences(after = '', take = 100) {
  const limit = Math.min(500, Math.max(1, Math.floor(take)))
  if (!Number.isFinite(limit)) throw new DataAccessError(400, 'VALIDATION_ERROR', '分页大小无效。')
  return prisma.$queryRaw<Array<{ messageId: string; userId: string; url: string }>>`
    WITH page AS (
      SELECT m.id, m.parts, r.user_id
      FROM agent_messages m JOIN agent_runs r ON r.id = m.run_id
      WHERE m.role = 'user' AND m.id > ${after}
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(m.parts) = 'array' THEN m.parts ELSE '[]'::jsonb END) p
          WHERE p->>'type' = 'attachment' AND p->>'url' ~ '^/api/uploads/agent-attachments/[A-Za-z0-9_.-]+$')
      ORDER BY m.id LIMIT ${limit}
    )
    SELECT page.id AS "messageId", page.user_id AS "userId", p->>'url' AS url
    FROM page CROSS JOIN LATERAL jsonb_array_elements(page.parts) p
    WHERE p->>'type' = 'attachment' AND p->>'url' ~ '^/api/uploads/agent-attachments/[A-Za-z0-9_.-]+$'
    ORDER BY page.id, p->>'url'
  `
}
