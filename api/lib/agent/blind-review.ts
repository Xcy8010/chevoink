import { createHmac, randomInt } from 'node:crypto'

import { Prisma } from '@prisma/client'

import type {
  AdminAgentEvalResults,
  AdminAgentEvalSuiteRow,
  AdminCreateAgentEvalSampleRequest,
  AgentBlindReviewAssignment,
  AgentBlindReviewSubmission,
  AgentEvalCandidateOrigin,
  AgentEvalDimension,
  AgentEvalVariantResult,
} from '../../../shared/contracts/index.js'
import {
  AGENT_EVAL_DIMENSIONS,
  AGENT_EVAL_MECHANICAL_REASONS,
} from '../../../shared/contracts/index.js'
import { env } from '../../config/env.js'
import { DataAccessError, prisma } from '../prisma.js'

const CANDIDATE_ORIGINS: AgentEvalCandidateOrigin[] = ['agent2', 'agent3', 'human']
const BLIND_LABELS = ['A', 'B', 'C'] as const

function privacyHash(namespace: 'reviewer' | 'source' | 'content', value: string): string {
  if (!env.authSessionSecret) {
    throw new DataAccessError(500, 'AUTH_SESSION_SECRET_MISSING', '服务端登录配置缺失。')
  }
  return createHmac('sha256', env.authSessionSecret)
    .update(`agent-eval:${namespace}:${value}`)
    .digest('hex')
}

export function hashAgentEvalReviewer(adminId: string): string {
  return privacyHash('reviewer', adminId)
}

export function hashAgentEvalSourceReference(reference: string): string {
  return privacyHash('source', reference.trim())
}

function shuffledBlindLabels(): string[] {
  const labels = [...BLIND_LABELS]
  for (let index = labels.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1)
    ;[labels[index], labels[swapIndex]] = [labels[swapIndex], labels[index]]
  }
  return labels
}

function assertCandidateSet(input: AdminCreateAgentEvalSampleRequest): void {
  const origins = input.candidates.map((candidate) => candidate.origin)
  if (
    input.candidates.length !== CANDIDATE_ORIGINS.length ||
    CANDIDATE_ORIGINS.some((origin) => origins.filter((value) => value === origin).length !== 1)
  ) {
    throw new DataAccessError(400, 'INVALID_EVAL_CANDIDATES', '每个样本必须且只能包含 Agent 2、Agent 3、人类各一份候选文本。')
  }
  if (input.sourceClass === 'user_opt_in' && !input.consentReceiptId?.trim()) {
    throw new DataAccessError(400, 'CONSENT_RECEIPT_REQUIRED', '用户授权样本必须填写授权凭据编号。')
  }
}

type SuiteWithCounts = {
  id: string
  name: string
  datasetVersion: string
  rubricVersion: string
  status: string
  createdAt: Date
  updatedAt: Date
  _count: { samples: number }
  samples: Array<{ _count: { reviews: number } }>
}

function toSuiteRow(suite: SuiteWithCounts): AdminAgentEvalSuiteRow {
  return {
    id: suite.id,
    name: suite.name,
    datasetVersion: suite.datasetVersion,
    rubricVersion: suite.rubricVersion,
    status: suite.status as AdminAgentEvalSuiteRow['status'],
    sampleCount: suite._count.samples,
    reviewCount: suite.samples.reduce((total, sample) => total + sample._count.reviews, 0),
    completedSampleCount: suite.samples.filter((sample) => sample._count.reviews > 0).length,
    createdAt: suite.createdAt.toISOString(),
    updatedAt: suite.updatedAt.toISOString(),
  }
}

const suiteCountsInclude = {
  _count: { select: { samples: true } },
  samples: { select: { _count: { select: { reviews: true } } } },
} satisfies Prisma.AgentEvalSuiteInclude

export async function listAgentEvalSuites(): Promise<AdminAgentEvalSuiteRow[]> {
  const suites = await prisma.agentEvalSuite.findMany({
    include: suiteCountsInclude,
    orderBy: { createdAt: 'desc' },
  })
  return suites.map(toSuiteRow)
}

export async function createAgentEvalSuite(input: {
  name: string
  datasetVersion: string
  rubricVersion: string
  adminId: string
}): Promise<AdminAgentEvalSuiteRow> {
  const suite = await prisma.agentEvalSuite.create({
    data: {
      name: input.name.trim(),
      datasetVersion: input.datasetVersion.trim(),
      rubricVersion: input.rubricVersion.trim(),
      createdByAdminId: input.adminId,
    },
    include: suiteCountsInclude,
  })
  return toSuiteRow(suite)
}

export async function addAgentEvalSample(
  suiteId: string,
  input: AdminCreateAgentEvalSampleRequest,
): Promise<{ id: string; code: string }> {
  assertCandidateSet(input)
  const suite = await prisma.agentEvalSuite.findUnique({ where: { id: suiteId }, select: { status: true } })
  if (!suite) throw new DataAccessError(404, 'EVAL_SUITE_NOT_FOUND', '评测套件不存在。')
  if (suite.status !== 'draft') {
    throw new DataAccessError(409, 'EVAL_SUITE_LOCKED', '只有草稿套件可以添加样本。')
  }

  const labels = shuffledBlindLabels()
  try {
    return await prisma.agentEvalSample.create({
      data: {
        suiteId,
        code: input.code.trim(),
        title: input.title.trim(),
        genre: input.genre.trim(),
        task: input.task.trim(),
        style: input.style.trim(),
        evaluationBrief: input.evaluationBrief.trim(),
        sourceClass: input.sourceClass,
        sourceReferenceHash: hashAgentEvalSourceReference(input.sourceReference),
        consentReceiptId: input.consentReceiptId?.trim() || null,
        candidates: {
          create: input.candidates.map((candidate, index) => ({
            blindLabel: labels[index],
            origin: candidate.origin,
            content: candidate.content.trim(),
            contentHash: privacyHash('content', candidate.content.trim()),
            metadata: (candidate.metadata ?? {}) as Prisma.InputJsonValue,
          })),
        },
      },
      select: { id: true, code: true },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new DataAccessError(409, 'EVAL_SAMPLE_EXISTS', '该套件中已存在同编号样本。')
    }
    throw error
  }
}

export async function updateAgentEvalSuiteStatus(
  suiteId: string,
  status: 'active' | 'completed',
): Promise<AdminAgentEvalSuiteRow> {
  const suite = await prisma.agentEvalSuite.findUnique({
    where: { id: suiteId },
    include: suiteCountsInclude,
  })
  if (!suite) throw new DataAccessError(404, 'EVAL_SUITE_NOT_FOUND', '评测套件不存在。')
  if (status === 'active' && suite.status !== 'draft') {
    throw new DataAccessError(409, 'EVAL_SUITE_STATE_CONFLICT', '只有草稿套件可以开始盲评。')
  }
  if (status === 'active' && suite._count.samples === 0) {
    throw new DataAccessError(409, 'EVAL_SUITE_EMPTY', '至少添加一个样本后才能开始盲评。')
  }
  if (status === 'completed' && suite.status !== 'active') {
    throw new DataAccessError(409, 'EVAL_SUITE_STATE_CONFLICT', '只有进行中的套件可以结束盲评。')
  }
  const updated = await prisma.agentEvalSuite.update({
    where: { id: suiteId },
    data: { status },
    include: suiteCountsInclude,
  })
  return toSuiteRow(updated)
}

export async function getNextBlindReview(
  adminId: string,
  suiteId?: string,
): Promise<AgentBlindReviewAssignment | null> {
  const reviewerHash = hashAgentEvalReviewer(adminId)
  const sample = await prisma.agentEvalSample.findFirst({
    where: {
      suite: { status: 'active', ...(suiteId ? { id: suiteId } : {}) },
      reviews: { none: { reviewerHash } },
    },
    select: {
      id: true,
      suiteId: true,
      code: true,
      title: true,
      genre: true,
      task: true,
      style: true,
      evaluationBrief: true,
      suite: { select: { name: true } },
      candidates: { select: { blindLabel: true, content: true }, orderBy: { blindLabel: 'asc' } },
    },
    orderBy: { createdAt: 'asc' },
  })
  if (!sample) return null

  const [total, reviewed] = await Promise.all([
    prisma.agentEvalSample.count({ where: { suiteId: sample.suiteId } }),
    prisma.agentBlindReview.count({ where: { reviewerHash, sample: { suiteId: sample.suiteId } } }),
  ])
  return {
    sampleId: sample.id,
    suiteId: sample.suiteId,
    suiteName: sample.suite.name,
    sampleCode: sample.code,
    title: sample.title,
    genre: sample.genre,
    task: sample.task,
    style: sample.style,
    evaluationBrief: sample.evaluationBrief,
    progress: { reviewed, total },
    candidates: sample.candidates.map((candidate) => ({ label: candidate.blindLabel, content: candidate.content })),
  }
}

function validateSubmission(labels: string[], input: AgentBlindReviewSubmission): void {
  const validReasons = new Set<string>(AGENT_EVAL_MECHANICAL_REASONS)
  const validGuesses = new Set(['agent2', 'agent3', 'human', 'unsure'])
  if (!labels.includes(input.preferredLabel)) {
    throw new DataAccessError(400, 'INVALID_EVAL_REVIEW', '请选择有效的偏好候选。')
  }
  for (const label of labels) {
    const ratings = input.candidateRatings[label]
    if (!ratings || AGENT_EVAL_DIMENSIONS.some((dimension) => !Number.isInteger(ratings[dimension]) || ratings[dimension] < 1 || ratings[dimension] > 5)) {
      throw new DataAccessError(400, 'INVALID_EVAL_REVIEW', `候选 ${label} 的评分不完整。`)
    }
    if (!validGuesses.has(input.guessedOrigins[label])) {
      throw new DataAccessError(400, 'INVALID_EVAL_REVIEW', `候选 ${label} 的来源判断无效。`)
    }
    if (!(input.mechanicalReasons[label] ?? []).every((reason) => validReasons.has(reason))) {
      throw new DataAccessError(400, 'INVALID_EVAL_REVIEW', `候选 ${label} 的机械感原因无效。`)
    }
  }
}

export async function submitBlindReview(
  adminId: string,
  sampleId: string,
  input: AgentBlindReviewSubmission,
): Promise<{ ok: true }> {
  const sample = await prisma.agentEvalSample.findUnique({
    where: { id: sampleId },
    select: {
      suite: { select: { status: true } },
      candidates: { select: { blindLabel: true } },
    },
  })
  if (!sample) throw new DataAccessError(404, 'EVAL_SAMPLE_NOT_FOUND', '评测样本不存在。')
  if (sample.suite.status !== 'active') {
    throw new DataAccessError(409, 'EVAL_SUITE_NOT_ACTIVE', '该套件当前不可提交盲评。')
  }
  const labels = sample.candidates.map((candidate) => candidate.blindLabel)
  validateSubmission(labels, input)

  try {
    await prisma.agentBlindReview.create({
      data: {
        sampleId,
        reviewerHash: hashAgentEvalReviewer(adminId),
        candidateRatings: input.candidateRatings as Prisma.InputJsonValue,
        guessedOrigins: input.guessedOrigins as Prisma.InputJsonValue,
        mechanicalReasons: input.mechanicalReasons as Prisma.InputJsonValue,
        preferredLabel: input.preferredLabel,
        notes: input.notes?.trim() || null,
      },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new DataAccessError(409, 'EVAL_REVIEW_EXISTS', '你已经评审过该样本。')
    }
    throw error
  }
  return { ok: true }
}

type AggregateCandidate = {
  origin: string
  blindLabel: string
  sampleId: string
}

type AggregateReview = {
  sampleId: string
  reviewerHash: string
  candidateRatings: unknown
  mechanicalReasons: unknown
  preferredLabel: string
}

export function aggregateAgentEvalResults(
  candidates: AggregateCandidate[],
  reviews: AggregateReview[],
): { reviewerCount: number; variants: AgentEvalVariantResult[] } {
  const candidateBySampleLabel = new Map(candidates.map((candidate) => [`${candidate.sampleId}:${candidate.blindLabel}`, candidate]))
  const reviewerCount = new Set(reviews.map((review) => review.reviewerHash)).size

  const variants = CANDIDATE_ORIGINS.map((origin): AgentEvalVariantResult => {
    const originCandidates = candidates.filter((candidate) => candidate.origin === origin)
    const originSampleIds = new Set(originCandidates.map((candidate) => candidate.sampleId))
    const ratingSums = Object.fromEntries(AGENT_EVAL_DIMENSIONS.map((dimension) => [dimension, 0])) as Record<AgentEvalDimension, number>
    let reviewCount = 0
    let mechanicalMarks = 0
    let preferredCount = 0

    for (const review of reviews) {
      const candidate = originCandidates.find((item) => item.sampleId === review.sampleId)
      if (!candidate) continue
      const ratings = review.candidateRatings as Record<string, Record<AgentEvalDimension, number>>
      const reasons = review.mechanicalReasons as Record<string, string[]>
      const candidateRatings = ratings[candidate.blindLabel]
      if (!candidateRatings) continue
      reviewCount += 1
      for (const dimension of AGENT_EVAL_DIMENSIONS) ratingSums[dimension] += candidateRatings[dimension] ?? 0
      if ((reasons[candidate.blindLabel] ?? []).length > 0) mechanicalMarks += 1
      const preferred = candidateBySampleLabel.get(`${review.sampleId}:${review.preferredLabel}`)
      if (preferred?.origin === origin) preferredCount += 1
    }

    return {
      origin,
      sampleCount: originSampleIds.size,
      reviewCount,
      averageRatings: Object.fromEntries(
        AGENT_EVAL_DIMENSIONS.map((dimension) => [dimension, reviewCount > 0 ? Number((ratingSums[dimension] / reviewCount).toFixed(2)) : 0]),
      ),
      mechanicalMarkRate: reviewCount > 0 ? Number((mechanicalMarks / reviewCount).toFixed(4)) : 0,
      preferenceRate: reviews.length > 0 ? Number((preferredCount / reviews.length).toFixed(4)) : 0,
    }
  })
  return { reviewerCount, variants }
}

export async function getAgentEvalResults(suiteId: string): Promise<AdminAgentEvalResults> {
  const suite = await prisma.agentEvalSuite.findUnique({
    where: { id: suiteId },
    include: {
      ...suiteCountsInclude,
      samples: {
        include: {
          _count: { select: { reviews: true } },
          candidates: { select: { origin: true, blindLabel: true, sampleId: true } },
          reviews: {
            select: {
              sampleId: true,
              reviewerHash: true,
              candidateRatings: true,
              mechanicalReasons: true,
              preferredLabel: true,
            },
          },
        },
      },
    },
  })
  if (!suite) throw new DataAccessError(404, 'EVAL_SUITE_NOT_FOUND', '评测套件不存在。')
  const candidates = suite.samples.flatMap((sample) => sample.candidates)
  const reviews = suite.samples.flatMap((sample) => sample.reviews)
  const aggregate = aggregateAgentEvalResults(candidates, reviews)
  const suiteForRow: SuiteWithCounts = {
    ...suite,
    samples: suite.samples.map((sample) => ({ _count: sample._count })),
  }
  return { suite: toSuiteRow(suiteForRow), ...aggregate }
}
