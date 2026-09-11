import type { ChangeStyleLearning, StartStyleLearning, StyleLearningView, StyleLearningWorkspace } from '../../../shared/contracts/style-learning'
import { requestData } from './api'

const path = (novelId: string) => `/api/agent/novels/${encodeURIComponent(novelId)}/style-learning`
export const getStyleWorkspace = (novelId: string) => requestData<StyleLearningWorkspace>(path(novelId))
export const getStyleSamples = (novelId: string, id: string) => requestData<{ exact: boolean; files: { name: string; content: string }[] }>(`${path(novelId)}/samples/${encodeURIComponent(id)}`)
export const startStyleLearningApi = (novelId: string, input: StartStyleLearning) => requestData<StyleLearningView>(path(novelId), { method: 'POST', body: JSON.stringify(input) })
export const changeStyleLearningApi = (novelId: string, id: string, input: ChangeStyleLearning) => requestData<StyleLearningView>(`${path(novelId)}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) })
