import type { AppSettings, ReaderDocument, SidePanelMode } from '../types'

const PLACEHOLDER_OVERVIEW = '导入后尚未生成 AI 全文总结。'
const PLACEHOLDER_SUMMARY = '这里会显示 AI 生成的中文总结。当前为导入后的占位内容。'

export function hasGeneratedSummary(document: ReaderDocument) {
  const hasOverview = document.overview !== PLACEHOLDER_OVERVIEW
  const hasRealSummaryBlock = document.summaryBlocks.some(
    (block) => block.summary !== PLACEHOLDER_SUMMARY,
  )

  return hasOverview || hasRealSummaryBlock
}

export function hasGeneratedTranslation(document: ReaderDocument) {
  return document.paragraphs.some((paragraph) => Boolean(paragraph.translation?.trim()))
}

export function isSettings(value: unknown): value is AppSettings {
  if (!value || typeof value !== 'object') {
    return false
  }

  const settings = value as { providers?: unknown; activeProviderId?: unknown }
  return Array.isArray(settings.providers) && 'activeProviderId' in settings
}

export function toMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

export const tabLabelMap: Record<SidePanelMode, string> = {
  summary: '总结结果',
  structure: '结构',
  translation: '翻译结果',
  selection: '局部结果',
  annotations: '标注',
}
