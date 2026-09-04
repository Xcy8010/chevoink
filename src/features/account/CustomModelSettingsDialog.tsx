import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, BrainCircuit, Eye, KeyRound, LoaderCircle, Pencil, Plus, Trash2, X } from 'lucide-react'
import { createPortal } from 'react-dom'

import Button from '@/components/ui/Button'
import TextInput from '@/components/ui/TextInput'
import { cn } from '@/lib/utils'
import { createCustomModel, deleteCustomModel, fetchCustomModels, updateCustomModel } from './credits-api'
import type { CustomModelView, ModelReasoningEffort } from '../../../shared/contracts'

/** 主流供应商目录：baseUrl 均为各家 OpenAI 兼容端点，apiUrl 为密钥管理页直达链接，billing 说明计费口径供作者选型 */
type ProviderOption = { id: string; label: string; baseUrl: string; apiUrl: string; billing: string; editableBaseUrl?: boolean }
const PROVIDERS: ProviderOption[] = [
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiUrl: 'https://platform.openai.com/api-keys', billing: '按量计费：预充余额或绑卡按 token 用量扣费' },
  { id: 'anthropic', label: 'Anthropic / Claude', baseUrl: 'https://api.anthropic.com/v1', apiUrl: 'https://console.anthropic.com/settings/keys', billing: '按量计费：预充 credits 按 token 用量扣费' },
  { id: 'google', label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', apiUrl: 'https://aistudio.google.com/apikey', billing: '免费额度 + 按量计费（绑卡后超出免费额部分按 token 扣费）' },
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', apiUrl: 'https://platform.deepseek.com/api_keys', billing: '按量计费：充值余额按 token 用量扣费' },
  { id: 'qwen', label: '阿里云百炼 / 通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiUrl: 'https://bailian.console.aliyun.com/?tab=model#/api-key', billing: '按量计费或 Token Plan（节省计划/资源包），新用户有免费额度' },
  { id: 'zhipu', label: '智谱 BigModel', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', apiUrl: 'https://open.bigmodel.cn/usercenter/apikeys', billing: '按量计费或模型 Token 套餐（GLM 订阅包）' },
  { id: 'moonshot', label: 'Moonshot / Kimi', baseUrl: 'https://api.moonshot.cn/v1', apiUrl: 'https://platform.moonshot.cn/console/api-keys', billing: '按量计费：充值余额按 token 用量扣费' },
  { id: 'minimax', label: 'MiniMax', baseUrl: 'https://api.minimax.chat/v1', apiUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key', billing: '按量计费或订阅计划（Token Plan）' },
  { id: 'doubao', label: '火山方舟 / 豆包', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', apiUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey', billing: '按量计费：部分模型送免费额度，开通后按 token 扣费' },
  { id: 'qianfan', label: '百度千帆', baseUrl: 'https://qianfan.baidubce.com/v2', apiUrl: 'https://console.bce.baidu.com/qianfan/ais/console/applicationConsole/application', billing: '按量计费：多数模型有免费额度，超出按 token 扣费' },
  { id: 'siliconflow', label: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', apiUrl: 'https://cloud.siliconflow.cn/account/ak', billing: '按量计费：开源模型有免费档，付费模型按 token 扣费' },
  { id: 'xai', label: 'xAI / Grok', baseUrl: 'https://api.x.ai/v1', apiUrl: 'https://console.x.ai/team/default/api-keys', billing: '按量计费：预充 credits 或绑卡按 token 扣费' },
  { id: 'mistral', label: 'Mistral AI', baseUrl: 'https://api.mistral.ai/v1', apiUrl: 'https://console.mistral.ai/api-keys/', billing: '按量计费：预充 credits 按 token 扣费' },
  { id: 'openrouter', label: 'OpenRouter（中转站）', baseUrl: 'https://openrouter.ai/api/v1', apiUrl: 'https://openrouter.ai/settings/keys', billing: '按量计费：预充 credits，聚合各家模型按模型分别定价，部分免费' },
  { id: 'bedrock', label: 'AWS Bedrock（中转站）', baseUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1', apiUrl: 'https://console.aws.amazon.com/bedrock/home?region=us-east-1#/api-keys', billing: '按量计费：走 AWS 账户按 token 扣费，地域可改', editableBaseUrl: true },
  { id: 'custom', label: '其他 OpenAI 兼容服务', baseUrl: '', apiUrl: '', billing: '视服务商而定：接入前自行确认计费方式', editableBaseUrl: true },
]

type FormState = { provider: string; displayName: string; modelName: string; baseUrl: string; apiKey: string; enabled: boolean; reasoningEfforts: ModelReasoningEffort[]; defaultReasoningEffort: ModelReasoningEffort; visionEnabled: boolean }
const EMPTY_FORM: FormState = { provider: 'deepseek', displayName: '', modelName: '', baseUrl: 'https://api.deepseek.com', apiKey: '', enabled: true, reasoningEfforts: ['low', 'high', 'max'], defaultReasoningEffort: 'high', visionEnabled: false }
const REASONING_OPTIONS: ModelReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return <label className="relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full focus-within:ring-2 focus-within:ring-[var(--focus-ring)]"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="peer sr-only" aria-label={label} /><span aria-hidden className={cn('absolute inset-[2px] rounded-full border transition-[background-color,border-color] duration-200 ease-out', checked ? 'border-[var(--text-primary)] bg-[var(--text-primary)]' : 'border-[var(--border-strong)] bg-[var(--surface-muted)]')} /><span aria-hidden className={cn('absolute left-[5px] h-4 w-4 rounded-full bg-white shadow-[0_1px_3px_rgba(15,23,42,.18)] transition-transform duration-200 ease-[cubic-bezier(.22,1,.36,1)]', checked && 'translate-x-5')} /></label>
}

export function CustomModelSettingsContent({ active = true }: { active?: boolean }) {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['credits', 'custom-models'], queryFn: fetchCustomModels, enabled: active })
  const [editing, setEditing] = useState<CustomModelView | 'new' | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [error, setError] = useState('')

  useEffect(() => { if (!active) { setEditing(null); setDeletingId(null); setError('') } }, [active])
  useEffect(() => {
    if (form.provider !== 'deepseek') return
    const supported = form.reasoningEfforts.filter((effort) => effort === 'low' || effort === 'high' || effort === 'max')
    const safe: ModelReasoningEffort[] = supported.length ? supported : ['high']
    if (safe.length === form.reasoningEfforts.length && safe.every((effort, index) => effort === form.reasoningEfforts[index])) return
    setForm((value) => ({ ...value, reasoningEfforts: safe, defaultReasoningEffort: safe.includes(value.defaultReasoningEffort) ? value.defaultReasoningEffort : safe[0] }))
  }, [form.provider, form.reasoningEfforts])

  const selectedProvider = PROVIDERS.find((provider) => provider.id === form.provider) ?? PROVIDERS[PROVIDERS.length - 1]
  const availableReasoningOptions = useMemo(() => form.provider === 'deepseek' ? REASONING_OPTIONS.filter((effort) => effort === 'low' || effort === 'high' || effort === 'max') : REASONING_OPTIONS, [form.provider])

  function beginEdit(model: CustomModelView | 'new') {
    setEditing(model); setError('')
    setForm(model === 'new' ? EMPTY_FORM : { provider: model.provider, displayName: model.displayName, modelName: model.modelName, baseUrl: model.baseUrl ?? '', apiKey: '', enabled: model.enabled, reasoningEfforts: model.reasoningEfforts, defaultReasoningEffort: model.defaultReasoningEffort, visionEnabled: model.visionEnabled })
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const baseUrl = form.provider === 'custom' || selectedProvider.editableBaseUrl ? form.baseUrl.trim() : selectedProvider.baseUrl
      if (!form.displayName.trim() || !form.modelName.trim() || !baseUrl) throw new Error('请完整填写名称、模型 ID 与服务地址。')
      if (editing === 'new' && !form.apiKey.trim()) throw new Error('新建配置必须填写 API Key。')
      const reasoningEfforts = form.reasoningEfforts.length ? form.reasoningEfforts : ['high' as const]
      const defaultReasoningEffort = reasoningEfforts.includes(form.defaultReasoningEffort) ? form.defaultReasoningEffort : reasoningEfforts[0]
      const payload = { ...form, baseUrl, reasoningEfforts, defaultReasoningEffort, apiKey: form.apiKey.trim() || undefined }
      return editing === 'new' ? createCustomModel(payload) : updateCustomModel(editing!.id, payload)
    },
    onSuccess: async () => { setEditing(null); await queryClient.invalidateQueries({ queryKey: ['credits', 'custom-models'] }) },
    onError: (reason) => setError(reason instanceof Error ? reason.message : '保存失败，请稍后重试。'),
  })
  const deleteMutation = useMutation({ mutationFn: deleteCustomModel, onSuccess: async () => { setDeletingId(null); await queryClient.invalidateQueries({ queryKey: ['credits', 'custom-models'] }) } })

  if (editing) return <div className="pb-2">
    <button type="button" onClick={() => setEditing(null)} className="mb-5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">← 返回模型列表</button>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-xs">供应商<select value={form.provider} onChange={(event) => { const provider = PROVIDERS.find((item) => item.id === event.target.value)!; const efforts: ModelReasoningEffort[] = provider.id === 'deepseek' ? ['low','high','max'] : ['high']; setForm((value) => ({ ...value, provider: provider.id, baseUrl: provider.baseUrl, reasoningEfforts: efforts, defaultReasoningEffort: 'high' })) }} className="mt-1.5 h-11 w-full rounded-[12px] border border-[var(--border-strong)] bg-[var(--surface-default)] px-3 text-sm outline-none">{PROVIDERS.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select></label>
      <label className="text-xs">显示名称<TextInput className="mt-1.5" name="custom-model-display" autoComplete="off" value={form.displayName} onChange={(event) => setForm((value) => ({ ...value, displayName: event.target.value }))} placeholder="例如：我的高速模型" /></label>
      <label className="text-xs sm:col-span-2">模型 ID<TextInput className="mt-1.5" name="custom-model-id" autoComplete="off" value={form.modelName} onChange={(event) => setForm((value) => ({ ...value, modelName: event.target.value }))} placeholder="由供应商提供的 model 名称" /></label>
      {form.provider === 'custom' || selectedProvider.editableBaseUrl ? <label className="text-xs sm:col-span-2">Base URL<TextInput className="mt-1.5" name="custom-model-endpoint" autoComplete="off" inputMode="url" data-lpignore="true" data-1p-ignore="true" value={form.baseUrl} onChange={(event) => setForm((value) => ({ ...value, baseUrl: event.target.value }))} placeholder="https://api.example.com/v1" /></label> : null}
      <label className="text-xs sm:col-span-2">API Key<TextInput className="mt-1.5" name="custom-model-secret" type="password" autoComplete="new-password" data-lpignore="true" data-1p-ignore="true" value={form.apiKey} onChange={(event) => setForm((value) => ({ ...value, apiKey: event.target.value }))} placeholder={editing === 'new' ? '填写 API Key' : '已配置；留空保持不变'} /></label>
    </div>
    {/* 供应商服务地址与计费口径：作者选型前需要知道这家怎么收钱、请求发到哪里 */}
    <div className="mt-4 space-y-1 rounded-[12px] bg-[var(--surface-muted)] px-3.5 py-3 text-xs leading-5 text-[var(--text-secondary)]">
      <p><span className="text-[var(--text-tertiary)]">服务地址：</span>{form.provider === 'custom' ? (form.baseUrl.trim() || '待填写 OpenAI 兼容地址') : selectedProvider.baseUrl}</p>
      <p><span className="text-[var(--text-tertiary)]">计费规则：</span>{selectedProvider.billing}</p>
    </div>
    <section className="mt-5 border-y border-[var(--border-subtle)] py-4"><div className="flex items-center gap-2 text-sm font-medium"><BrainCircuit className="h-4 w-4" />支持的推理强度</div><div className="mt-3 flex flex-wrap gap-2">{availableReasoningOptions.map((effort) => <button type="button" key={effort} onClick={() => setForm((value) => { const selected = value.reasoningEfforts.includes(effort); const next = selected ? value.reasoningEfforts.filter((item) => item !== effort) : [...value.reasoningEfforts, effort]; return { ...value, reasoningEfforts: next.length ? next : [value.defaultReasoningEffort] } })} className={cn('rounded-full border px-3 py-1.5 text-xs transition-colors', form.reasoningEfforts.includes(effort) ? 'border-[var(--text-primary)] bg-[var(--surface-contrast)] text-[var(--text-contrast)]' : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)]')}>{effort}</button>)}</div><label className="mt-4 block text-xs">默认强度<select className="mt-1.5 h-10 w-full rounded-[12px] border border-[var(--border-strong)] bg-[var(--surface-default)] px-3 text-sm" value={form.defaultReasoningEffort} onChange={(event) => setForm((value) => ({ ...value, defaultReasoningEffort: event.target.value as ModelReasoningEffort }))}>{form.reasoningEfforts.map((effort) => <option key={effort}>{effort}</option>)}</select></label>
      <div className="mt-4 flex items-start justify-between gap-4"><span><span className="inline-flex items-center gap-1.5 text-sm"><Eye className="h-4 w-4" />模型支持图片输入</span><span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">开启后图片直接交给该模型；关闭时使用平台视觉工具。</span></span><Toggle checked={form.visionEnabled} onChange={(visionEnabled) => setForm((value) => ({ ...value, visionEnabled }))} label="模型支持图片输入" /></div>
    </section>
    <div className="mt-4 flex items-center justify-between gap-4"><div className="flex items-center gap-3"><Toggle checked={form.enabled} onChange={(enabled) => setForm((value) => ({ ...value, enabled }))} label="启用此模型" /><span className="text-sm">启用此模型</span></div>{selectedProvider.apiUrl ? <a href={selectedProvider.apiUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">获取 API Key <ArrowUpRight className="h-3.5 w-3.5" /></a> : null}</div>
    {error ? <p className="mt-4 text-xs text-rose-600">{error}</p> : null}<div className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={() => setEditing(null)}>取消</Button><Button variant="primary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>{saveMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}保存模型</Button></div>
  </div>

  return <div><div className="mb-4 flex items-center justify-between"><div><p className="text-sm font-medium">自定义模型</p><p className="mt-1 text-xs text-[var(--text-secondary)]">API Key 使用加密存储，保存后只允许替换。</p></div><Button variant="primary" size="sm" onClick={() => beginEdit('new')}><Plus className="h-4 w-4" />添加模型</Button></div>{query.isLoading ? <div className="flex justify-center py-12"><LoaderCircle className="h-5 w-5 animate-spin" /></div> : query.data?.models.length ? <div className="divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">{query.data.models.map((model) => <div key={model.id} className="flex items-center gap-3 py-4"><KeyRound className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{model.displayName}</p><p className="mt-0.5 truncate text-xs text-[var(--text-tertiary)]">{model.modelName} · {model.defaultReasoningEffort}{model.visionEnabled ? ' · 视觉' : ''} · {model.enabled ? '已启用' : '已停用'}</p></div>{deletingId === model.id ? <div className="flex items-center gap-1"><Button size="sm" variant="ghost" onClick={() => setDeletingId(null)}>取消</Button><Button size="sm" variant="primary" className="bg-rose-700 hover:bg-rose-800" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(model.id)}>确认删除</Button></div> : <><button type="button" onClick={() => beginEdit(model)} className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] hover:bg-[var(--surface-muted)]" aria-label="编辑"><Pencil className="h-3.5 w-3.5" /></button><button type="button" onClick={() => setDeletingId(model.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--text-tertiary)] hover:bg-[var(--surface-muted)] hover:text-rose-600" aria-label="删除"><Trash2 className="h-3.5 w-3.5" /></button></>}</div>)}</div> : <div className="rounded-[14px] border border-dashed border-[var(--border-strong)] py-12 text-center text-sm text-[var(--text-tertiary)]">还没有自定义模型</div>}</div>
}

export default function CustomModelSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return createPortal(<div className="fixed inset-0 z-[145] flex items-end justify-center bg-black/30 backdrop-blur-[2px] sm:items-center sm:px-5 sm:py-8"><section role="dialog" aria-modal="true" className="flex max-h-[94dvh] w-full flex-col border border-[var(--border-strong)] bg-[var(--surface-default)] shadow-[0_24px_70px_rgba(15,23,42,0.2)] sm:max-w-2xl sm:rounded-[22px]"><header className="flex items-start justify-between gap-5 border-b border-[var(--border-subtle)] px-5 py-4 sm:px-6"><div><h2 className="text-lg font-semibold">自定义模型</h2><p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">配置 OpenAI 兼容模型和模型能力。</p></div><button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-[var(--surface-muted)]"><X className="h-4 w-4" /></button></header><div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6"><CustomModelSettingsContent active={open} /></div></section></div>, document.body)
}
