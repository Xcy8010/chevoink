import { requestJson } from '@/app/api-client'
import type {
  CreditAccountSummary,
  CreditUsagePayload,
  CustomModelsPayload,
  ReferralPayload,
  SaveCustomModelRequest,
} from '../../../shared/contracts'

export function fetchCreditSummary(): Promise<CreditAccountSummary> {
  return requestJson<CreditAccountSummary>('/api/credits/summary')
}

export function fetchCreditUsage(): Promise<CreditUsagePayload> {
  return requestJson<CreditUsagePayload>('/api/credits/usage?take=150')
}

export function fetchReferral(): Promise<ReferralPayload> {
  return requestJson<ReferralPayload>('/api/credits/referral')
}

export function fetchCustomModels(): Promise<CustomModelsPayload> {
  return requestJson<CustomModelsPayload>('/api/credits/models')
}

export function createCustomModel(input: SaveCustomModelRequest): Promise<{ id: string }> {
  return requestJson('/api/credits/models', { method: 'POST', body: JSON.stringify(input) })
}

export function updateCustomModel(modelId: string, input: Partial<SaveCustomModelRequest>): Promise<{ ok: true }> {
  return requestJson(`/api/credits/models/${modelId}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function deleteCustomModel(modelId: string): Promise<{ ok: true }> {
  return requestJson(`/api/credits/models/${modelId}`, { method: 'DELETE' })
}
