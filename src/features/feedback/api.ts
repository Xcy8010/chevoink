import { requestJson } from '@/app/api-client'
import type { CreateFeedbackRequest, CreateFeedbackResponsePayload } from '../../../shared/contracts'

/** 提交问题反馈 / 功能建议 */
export async function submitFeedback(body: CreateFeedbackRequest): Promise<CreateFeedbackResponsePayload> {
  return requestJson<CreateFeedbackResponsePayload>('/api/feedback', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
