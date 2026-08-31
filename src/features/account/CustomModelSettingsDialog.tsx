import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, BrainCircuit, Eye, KeyRound, LoaderCircle, Pencil, Plus, Trash2, X } from 'lucide-react'
import { createPortal } from 'react-dom'

import Button from '@/components/ui/Button'
import TextInput from '@/components/ui/TextInput'
import { createCustomModel, deleteCustomModel, fetchCustomModels, updateCustomModel } from './credits-api'
import type { CustomModelView, ModelReasoningEffort } from '../../../shared/contracts'

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiUrl: 'https://platform.openai.com/api-keys' },
  { id: 'anthropic', label: 'Anthropic（兼容网关）', baseUrl: '', apiUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'google', label: 'Google Gemini（兼容网关）', baseUrl: '', apiUrl: 'https://aistudio.google.com/app/apikey' },
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', apiUrl: 'https://platform.deepseek.com/api_keys' },
  { id: 'qwen', label: '阿里云百炼 / 通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiUrl: 'https://bailian.console.aliyun.com/' },
  { id: 'zhipu', label: '智谱 BigModel', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', apiUrl: 'https://open.bigmodel.cn/usercenter/apikeys' },
  { id: 'moonshot', label: 'Moonshot / Kimi', baseUrl: 'https://api.moonshot.cn/v1', apiUrl: 'https://platform.moonshot.cn/console/api-keys' },
  { id: 'minimax', label: 'MiniMax', baseUrl: 'https://api.minimax.chat/v1', apiUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key' },
  { id: 'siliconflow', label: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', apiUrl: 'https://cloud.siliconflow.cn/account/ak' },
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', apiUrl: 'https://openrouter.ai/settings/keys' },
  { id: 'custom', label: '其他 OpenAI 兼容服务', baseUrl: '', apiUrl: '' },
] as const

type Props = { open: boolean; onClose: () => void }
type FormState = { provider: string; displayName: string; modelName: string; baseUrl: string; apiKey: string; enabled: boolean; reasoningEfforts: ModelReasoningEffort[]; defaultReasoningEffort: ModelReasoningEffort; visionEnabled: boolean }
const EMPTY_FORM: FormState = { provider: 'deepseek', displayName: '', modelName: '', baseUrl: 'https://api.deepseek.com', apiKey: '', enabled: true, reasoningEfforts: ['low', 'high', 'max'], defaultReasoningEffort: 'high', visionEnabled: false }
const REASONING_OPTIONS: ModelReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

export default function CustomModelSettingsDialog({ open, onClose }: Props) {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['credits', 'custom-models'], queryFn: fetchCustomModels, enabled: open })
  const [editing, setEditing] = useState<CustomModelView | 'new' | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setEditing(null); setDeletingId(null); setError('')
  }, [open])

  useEffect(() => {
    if (form.provider.trim().toLowerCase() !== 'deepseek') return
    const supported: ModelReasoningEffort[] = form.reasoningEfforts.filter((effort) => effort === 'low' || effort === 'high' || effort === 'max')
    const reasoningEfforts: ModelReasoningEffort[] = supported.length > 0 ? supported : ['high']
    if (reasoningEfforts.length === form.reasoningEfforts.length && reasoningEfforts.every((effort, index) => effort === form.reasoningEfforts[index])) return
    setForm((value) => ({ ...value, reasoningEfforts, defaultReasoningEffort: reasoningEfforts.includes(value.defaultReasoningEffort) ? value.defaultReasoningEffort : reasoningEfforts[0] }))
  }, [form.provider, form.reasoningEfforts])

  function beginEdit(model: CustomModelView | 'new') {
    setEditing(model)
    setError('')
    setForm(model === 'new' ? EMPTY_FORM : { provider: model.provider, displayName: model.displayName, modelName: model.modelName, baseUrl: model.baseUrl ?? '', apiKey: '', enabled: model.enabled, reasoningEfforts: model.reasoningEfforts, defaultReasoningEffort: model.defaultReasoningEffort, visionEnabled: model.visionEnabled })
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.displayName.trim() || !form.modelName.trim() || !form.baseUrl.trim()) throw new Error('请完整填写名称、模型 ID 与 Base URL。')
      if (editing === 'new' && !form.apiKey.trim()) throw new Error('新建配置必须填写 API Key。')
      const reasoningEfforts = form.reasoningEfforts.length > 0 ? form.reasoningEfforts : ['high' as const]
      const defaultReasoningEffort = reasoningEfforts.includes(form.defaultReasoningEffort)
        ? form.defaultReasoningEffort
        : reasoningEfforts[0]
      const payload = { ...form, reasoningEfforts, defaultReasoningEffort, apiKey: form.apiKey.trim() || undefined }
      return editing === 'new' ? createCustomModel(payload) : updateCustomModel(editing!.id, payload)
    },
    onSuccess: async () => { setEditing(null); await queryClient.invalidateQueries({ queryKey: ['credits', 'custom-models'] }) },
    onError: (reason) => setError(reason instanceof Error ? reason.message : '保存失败，请稍后重试。'),
  })
  const deleteMutation = useMutation({ mutationFn: deleteCustomModel, onSuccess: async () => { setDeletingId(null); await queryClient.invalidateQueries({ queryKey: ['credits', 'custom-models'] }) } })

  if (!open) return null
  const selectedProvider = PROVIDERS.find((provider) => provider.id === form.provider)
  const availableReasoningOptions = form.provider.trim().toLowerCase() === 'deepseek' ? REASONING_OPTIONS.filter((effort) => effort === 'low' || effort === 'high' || effort === 'max') : REASONING_OPTIONS
  return createPortal(<div className="fixed inset-0 z-[145] flex items-end justify-center bg-black/30 backdrop-blur-[2px] sm:items-center sm:px-5 sm:py-8"><section role="dialog" aria-modal="true" className="flex max-h-[94dvh] w-full flex-col border border-[var(--border-strong)] bg-[var(--surface-default)] shadow-[0_24px_70px_rgba(15,23,42,0.2)] sm:max-w-2xl sm:rounded-[22px]"><header className="flex items-start justify-between gap-5 border-b border-[var(--border-subtle)] px-5 py-4 sm:px-6"><div><h2 className="text-lg font-semibold">自定义模型</h2><p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">使用你自己的 API Key；密钥加密保存且只允许替换。仅支持 OpenAI 兼容的 Chat Completions 接口。</p></div><button type="button" onClick={onClose} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-[var(--surface-muted)]"><X className="h-4 w-4" /></button></header><div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{editing ? <div><button type="button" onClick={() => setEditing(null)} className="mb-4 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">← 返回模型列表</button><div className="grid gap-4 sm:grid-cols-2"><label className="text-xs">供应商<select value={form.provider} onChange={(event) => { const provider = PROVIDERS.find((item) => item.id === event.target.value); const efforts: ModelReasoningEffort[] = event.target.value === 'deepseek' ? ['low', 'high', 'max'] : ['high']; setForm((value) => ({ ...value, provider: event.target.value, baseUrl: provider?.baseUrl || value.baseUrl, reasoningEfforts: efforts, defaultReasoningEffort: 'high' })) }} className="mt-1.5 h-11 w-full rounded-full border border-[var(--border-strong)] bg-[var(--surface-default)] px-4 text-sm outline-none">{PROVIDERS.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select></label><label className="text-xs">显示名称<TextInput className="mt-1.5" value={form.displayName} onChange={(event) => setForm((value) => ({ ...value, displayName: event.target.value }))} placeholder="例如：我的高速模型" /></label><label className="text-xs sm:col-span-2">模型 ID<TextInput className="mt-1.5" value={form.modelName} onChange={(event) => setForm((value) => ({ ...value, modelName: event.target.value }))} placeholder="由供应商提供的 model 名称" /></label><label className="text-xs sm:col-span-2">Base URL<TextInput className="mt-1.5" value={form.baseUrl} onChange={(event) => setForm((value) => ({ ...value, baseUrl: event.target.value }))} placeholder="https://api.example.com/v1" /></label><label className="text-xs sm:col-span-2">API Key<TextInput className="mt-1.5" type="password" value={form.apiKey} onChange={(event) => setForm((value) => ({ ...value, apiKey: event.target.value }))} placeholder={editing === 'new' ? '填写 API Key' : '已配置；留空保持不变，输入新值即替换'} /></label></div><div className="mt-5 border-y border-[var(--border-subtle)] py-4"><div className="flex items-center gap-2 text-sm font-medium"><BrainCircuit className="h-4 w-4" />支持的推理强度</div><div className="mt-3 flex flex-wrap gap-2">{availableReasoningOptions.map((effort) => <label key={effort} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] px-2.5 py-1.5 text-xs"><input type="checkbox" checked={form.reasoningEfforts.includes(effort)} onChange={(event) => setForm((value) => { const next = event.target.checked ? [...value.reasoningEfforts, effort] : value.reasoningEfforts.filter((item) => item !== effort); return { ...value, reasoningEfforts: next.length ? next : [value.defaultReasoningEffort] } })} />{effort}</label>)}</div><label className="mt-4 block text-xs">默认强度<select className="mt-1.5 h-10 w-full rounded-full border border-[var(--border-strong)] bg-[var(--surface-default)] px-4 text-sm" value={form.defaultReasoningEffort} onChange={(event) => setForm((value) => ({ ...value, defaultReasoningEffort: event.target.value as ModelReasoningEffort }))}>{form.reasoningEfforts.map((effort) => <option key={effort} value={effort}>{effort}</option>)}</select></label><label className="mt-4 flex items-start gap-2 text-sm"><input className="mt-0.5" type="checkbox" checked={form.visionEnabled} onChange={(event) => setForm((value) => ({ ...value, visionEnabled: event.target.checked }))} /><span><span className="inline-flex items-center gap-1.5"><Eye className="h-4 w-4" />模型支持图片输入</span><span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">仅在供应商明确支持 OpenAI 兼容 image_url 时开启；否则图片会交给平台查图工具。</span></span></label></div><div className="mt-4 flex items-center justify-between gap-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm((value) => ({ ...value, enabled: event.target.checked }))} />启用此模型</label>{selectedProvider?.apiUrl ? <a href={selectedProvider.apiUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">获取 API Key <ArrowUpRight className="h-3.5 w-3.5" /></a> : null}</div>{error ? <p className="mt-4 text-xs text-rose-600">{error}</p> : null}<div className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={() => setEditing(null)}>取消</Button><Button variant="primary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>{saveMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}保存模型</Button></div></div> : <div><div className="mb-4 flex items-center justify-between"><p className="text-sm text-[var(--text-secondary)]">最多保存 10 个配置</p><Button variant="primary" size="sm" onClick={() => beginEdit('new')}><Plus className="h-4 w-4" />添加模型</Button></div>{query.isLoading ? <div className="flex justify-center py-12"><LoaderCircle className="h-5 w-5 animate-spin" /></div> : query.data?.models.length ? <div className="divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">{query.data.models.map((model) => <div key={model.id} className="flex items-center gap-3 py-4"><span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border-subtle)]"><KeyRound className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{model.displayName}</p><p className="mt-0.5 truncate text-xs text-[var(--text-tertiary)]">{model.modelName} · {model.defaultReasoningEffort}{model.visionEnabled ? ' · 视觉' : ''} · {model.enabled ? '已启用' : '已停用'}</p></div>{deletingId === model.id ? <div className="flex items-center gap-1"><Button size="sm" variant="ghost" onClick={() => setDeletingId(null)}>取消</Button><Button size="sm" variant="primary" className="bg-rose-700 hover:bg-rose-800" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(model.id)}>确认删除</Button></div> : <><button type="button" onClick={() => beginEdit(model)} className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-[var(--surface-muted)]" aria-label="编辑"><Pencil className="h-3.5 w-3.5" /></button><button type="button" onClick={() => setDeletingId(model.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-muted)] hover:text-rose-600" aria-label="删除"><Trash2 className="h-3.5 w-3.5" /></button></>}</div>)}</div> : <div className="border-y border-[var(--border-subtle)] py-12 text-center text-sm text-[var(--text-tertiary)]">还没有自定义模型</div>}</div>}</div></section></div>, document.body)
}
