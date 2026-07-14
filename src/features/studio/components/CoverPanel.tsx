import { Check, ImagePlus, LoaderCircle, Sparkles } from 'lucide-react'

import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import TextInput from '@/components/ui/TextInput'
import type { AiImageSize, CoverAsset } from '../../../../shared/contracts/index.js'

import { imageSizeLabelMap, type CoverFormState } from '../types'
import { InputLabel, SelectControl, ToolShell } from './StudioControls'

type CoverPanelProps = {
  coverForm: CoverFormState
  coverAssets: CoverAsset[]
  selectedCover: CoverAsset | null
  currentCoverId?: string | null
  coverKeywords: string[]
  coverMessage: string
  generatingPrompt: boolean
  generatingImage: boolean
  selectingCover: boolean
  formatDateTime: (value?: string | null) => string
  onChange: (next: CoverFormState) => void
  onGeneratePrompt: () => void
  onGenerateImages: () => void
  onSelectAsset: (assetId: string | null) => void
  onApplyCover: () => void
  onClose: () => void
}

export default function CoverPanel({
  coverForm,
  coverAssets,
  selectedCover,
  currentCoverId,
  coverKeywords,
  coverMessage,
  generatingPrompt,
  generatingImage,
  selectingCover,
  formatDateTime,
  onChange,
  onGeneratePrompt,
  onGenerateImages,
  onSelectAsset,
  onApplyCover,
  onClose,
}: CoverPanelProps) {
  return (
    <ToolShell
      title="AI 封面"
      description="先整理封面方向，再挑选最适合作品的候选图。"
      actions={
        <Button variant="ghost" size="sm" onClick={onClose}>
          收起
        </Button>
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain pr-1">
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <InputLabel label="封面主标题" />
              <TextInput
                value={coverForm.novelTitle}
                onChange={(event) => onChange({ ...coverForm, novelTitle: event.target.value })}
                placeholder="封面上展示的书名"
              />
            </label>
            <label className="space-y-2">
              <InputLabel label="题材" />
              <TextInput
                value={coverForm.genre}
                onChange={(event) => onChange({ ...coverForm, genre: event.target.value })}
                placeholder="例如：科幻"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <InputLabel label="主角信息" />
              <TextInput
                value={coverForm.protagonist}
                onChange={(event) => onChange({ ...coverForm, protagonist: event.target.value })}
                placeholder="例如：单人背影、舰桥、夜色"
              />
            </label>
            <label className="space-y-2">
              <InputLabel label="风格偏好" />
              <TextInput
                value={coverForm.stylePreference}
                onChange={(event) => onChange({ ...coverForm, stylePreference: event.target.value })}
                placeholder="例如：克制电影感"
              />
            </label>
          </div>

          <label className="space-y-2">
            <InputLabel label="故事提炼" />
            <textarea
              value={coverForm.summary}
              onChange={(event) => onChange({ ...coverForm, summary: event.target.value })}
              rows={4}
              className="w-full rounded-[20px] border border-[var(--border-strong)] bg-[var(--surface-default)] px-4 py-3 text-sm leading-7 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-border)] focus:ring-2 focus:ring-[var(--focus-ring)]"
              placeholder="提炼场景、冲突和人物气质。"
            />
          </label>

          <label className="space-y-2">
            <InputLabel label="封面提示词" />
            <textarea
              value={coverForm.prompt}
              onChange={(event) => onChange({ ...coverForm, prompt: event.target.value })}
              rows={4}
              className="w-full rounded-[20px] border border-[var(--border-strong)] bg-[var(--surface-default)] px-4 py-3 text-sm leading-7 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-border)] focus:ring-2 focus:ring-[var(--focus-ring)]"
              placeholder="AI 会先帮你整理，再允许你继续微调。"
            />
          </label>

          <label className="space-y-2">
            <InputLabel label="负向提示词" />
            <textarea
              value={coverForm.negativePrompt}
              onChange={(event) => onChange({ ...coverForm, negativePrompt: event.target.value })}
              rows={3}
              className="w-full rounded-[20px] border border-[var(--border-strong)] bg-[var(--surface-default)] px-4 py-3 text-sm leading-7 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-border)] focus:ring-2 focus:ring-[var(--focus-ring)]"
              placeholder="例如：杂乱、模糊、过曝"
            />
          </label>

          <div className="grid gap-4">
            <div className="space-y-2">
              <InputLabel label="封面尺寸" />
              <div className="grid grid-cols-1 gap-2">
                {(Object.keys(imageSizeLabelMap) as AiImageSize[]).map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => onChange({ ...coverForm, size })}
                    className={
                      coverForm.size === size
                        ? 'rounded-[16px] border border-[var(--border-strong)] bg-[var(--surface-default)] px-3 py-3 text-left text-sm text-[var(--text-primary)] transition-colors'
                        : 'rounded-[16px] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-3 text-left text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
                    }
                  >
                    <span className="block break-words font-medium">{imageSizeLabelMap[size]}</span>
                    <span className="mt-1 block break-all text-xs text-[var(--text-tertiary)]">{size}</span>
                  </button>
                ))}
              </div>
            </div>

            <label className="space-y-2">
              <InputLabel label="候选数量" />
              <SelectControl
                value={coverForm.count}
                onChange={(event) => onChange({ ...coverForm, count: Number(event.target.value) })}
              >
                {[1, 2, 3, 4].map((count) => (
                  <option key={count} value={count}>
                    {count} 张
                  </option>
                ))}
              </SelectControl>
            </label>
          </div>

          <div className="grid gap-2">
            <Button onClick={onGeneratePrompt} variant="secondary" disabled={generatingPrompt} className="w-full justify-center">
              {generatingPrompt ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              生成提示词
            </Button>
            <Button onClick={onGenerateImages} disabled={generatingImage} className="w-full justify-center">
              {generatingImage ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              生成封面
            </Button>
          </div>

          {coverKeywords.length ? (
            <div className="flex flex-wrap gap-2">
              {coverKeywords.map((keyword) => (
                <Tag key={keyword}>{keyword}</Tag>
              ))}
            </div>
          ) : null}
        </div>

        <div className="space-y-3 border-t border-[var(--border-subtle)] pt-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-[var(--text-primary)]">封面候选</h4>
            <p className="text-xs leading-5 text-[var(--text-secondary)]">{coverMessage}</p>
          </div>

          {selectedCover ? (
            <div className="rounded-[20px] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-4">
              <div className="space-y-3">
                <img
                  src={selectedCover.imageUrl}
                  alt="当前选中的封面候选"
                  className="aspect-[3/4] w-full rounded-[18px] border border-[var(--border-subtle)] object-cover"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Tag tone="accent">当前预览</Tag>
                  {currentCoverId === selectedCover.id ? <Tag>当前封面</Tag> : null}
                </div>
                <p className="text-sm leading-7 text-[var(--text-secondary)]">
                  {selectedCover.prompt ?? '这一张候选封面还没有额外说明。'}
                </p>
                <div className="grid gap-2">
                  <Button
                    onClick={onApplyCover}
                    disabled={selectingCover || currentCoverId === selectedCover.id}
                    className="w-full justify-center"
                  >
                    {selectingCover ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {currentCoverId === selectedCover.id ? '已设为作品封面' : '设为作品封面'}
                  </Button>
                  <Button onClick={() => onSelectAsset(null)} variant="ghost" className="w-full justify-center">
                    取消选择
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            {coverAssets.map((asset) => (
              <CoverAssetItem
                key={asset.id}
                asset={asset}
                selected={selectedCover?.id === asset.id}
                currentCoverId={currentCoverId}
                formatDateTime={formatDateTime}
                onSelect={() => onSelectAsset(asset.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </ToolShell>
  )
}

function CoverAssetItem({
  asset,
  selected,
  currentCoverId,
  formatDateTime,
  onSelect,
}: {
  asset: CoverAsset
  selected: boolean
  currentCoverId?: string | null
  formatDateTime: (value?: string | null) => string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={
        selected
          ? 'flex w-full items-center gap-3 overflow-hidden rounded-[18px] border border-[var(--border-strong)] bg-[var(--surface-default)] px-3 py-3 text-left transition-colors'
          : 'flex w-full items-center gap-3 overflow-hidden rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-3 text-left transition-colors hover:border-[var(--border-strong)]'
      }
    >
      <img
        src={asset.imageUrl}
        alt="封面候选图"
        className="aspect-[3/4] w-20 shrink-0 rounded-[14px] object-cover"
      />
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-[var(--text-primary)]">封面候选</p>
          {currentCoverId === asset.id ? <Tag tone="accent">当前封面</Tag> : null}
        </div>
        <p className="line-clamp-3 break-words text-sm leading-6 text-[var(--text-secondary)]">
          {asset.prompt ?? '点击查看这张封面的完整预览。'}
        </p>
        <span className="block text-xs text-[var(--text-tertiary)]">{formatDateTime(asset.createdAt)}</span>
      </div>
    </button>
  )
}
