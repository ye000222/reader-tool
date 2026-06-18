import { createId, refreshDocumentTimestamp } from '../lib/document'
import type {
  ProviderConfig,
  ReaderDocument,
  SelectionAction,
  SelectionTaskResult,
  StructureNode,
  SummaryBlock,
} from '../types'

interface ChatMessage {
  role: 'system' | 'user'
  content: string
}

interface OpenAICompatibleResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

interface TranslateDocumentOptions {
  onProgress?: (progress: {
    completedBatches: number
    totalBatches: number
    completedParagraphs: number
    totalParagraphs: number
  }) => void
  batchSize?: number
  concurrency?: number
}

interface GenerateDocumentSummaryOptions {
  onProgress?: (progress: {
    stage: 'chunk_summary' | 'global_summary'
    message: string
    completedChunks?: number
    totalChunks?: number
  }) => void
  chunkSize?: number
  concurrency?: number
}

interface TranslationPayloadItem {
  id: string
  text: string
  translation?: string
}

export async function generateDocumentSummary(
  document: ReaderDocument,
  provider: ProviderConfig,
  options: GenerateDocumentSummaryOptions = {},
) {
  const chunkSize = Math.max(1, options.chunkSize ?? 6)
  const chunks = chunkArray(document.paragraphs, chunkSize)

  if (chunks.length === 0) {
    return refreshDocumentTimestamp(document)
  }

  const totalChunks = chunks.length
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 3, totalChunks))
  const chunkDrafts: Array<{ title?: string; summary?: string } | null> = Array.from({ length: totalChunks }, () => null)

  let nextChunkIndex = 0
  let completedChunks = 0

  options.onProgress?.({
    stage: 'chunk_summary',
    message: `正在生成分块总结（0/${totalChunks} 块）...`,
    completedChunks: 0,
    totalChunks,
  })

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (nextChunkIndex < totalChunks) {
        const chunkIndex = nextChunkIndex
        nextChunkIndex += 1

        if (chunkIndex >= totalChunks) {
          return
        }

        const chunk = chunks[chunkIndex]
        const response = await requestJson<{
          title?: string
          summary?: string
        }>(provider, [
          {
            role: 'system',
            content:
              '你是一个阅读助手。无论原文是什么语言，总结都必须使用中文。请只总结当前分块内容，返回严格 JSON，不要使用 Markdown 代码块。',
          },
          {
            role: 'user',
            content: JSON.stringify({
              task: '生成分块总结',
              requirement: [
                '返回对象包含 title 和 summary',
                'title 用中文概括该分块主题，长度控制在 8 到 20 个字',
                'summary 用中文总结该分块关键信息，长度控制在 2 到 5 句',
                '不要输出 Markdown，不要额外解释',
              ],
              documentTitle: document.title,
              chunkIndex,
              totalChunks,
              paragraphs: chunk.map((paragraph, index) => ({
                index,
                paragraphId: paragraph.id,
                text: paragraph.text,
              })),
            }),
          },
        ])

        chunkDrafts[chunkIndex] = response
        completedChunks += 1
        options.onProgress?.({
          stage: 'chunk_summary',
          message: `正在生成分块总结（${completedChunks}/${totalChunks} 块）...`,
          completedChunks,
          totalChunks,
        })
      }
    }),
  )

  const summaryBlocks = chunks.map<SummaryBlock>((chunk, index) => {
    const draft = chunkDrafts[index]
    const originalText = chunk.map((paragraph) => paragraph.text).join('\n\n')

    return {
      id: createId('summary'),
      title: normalizeSummaryText(draft?.title) || `片段 ${index + 1}`,
      summary:
        normalizeSummaryText(draft?.summary) ||
        `${truncateText(originalText, 96)}${originalText.length > 96 ? '...' : ''}`,
      paragraphIds: chunk.map((paragraph) => paragraph.id),
      originalText,
    }
  })

  options.onProgress?.({
    stage: 'global_summary',
    message: '正在汇总全文概览和结构...',
  })

  const response = await requestJson<{
    overview?: string
    structure?: Array<{
      title?: string
      summaryBlockIds?: string[]
      blockIndexes?: number[]
      children?: Array<{
        title?: string
        summaryBlockIds?: string[]
        blockIndexes?: number[]
        children?: unknown[]
      }>
    }>
  }>(provider, [
    {
      role: 'system',
      content:
        '你是一个阅读助手。无论原文是什么语言，总结都必须使用中文。你会收到已经生成好的分块总结，请基于这些分块结果生成全文概览和结构，返回严格 JSON，不要使用 Markdown 代码块。',
    },
    {
      role: 'user',
      content: JSON.stringify({
        task: '基于分块总结生成全文概览和结构',
        requirement: [
          'overview 用中文概括全文主旨和关键结论',
          'structure 是数组，每项包含 title、summaryBlockIds、children',
          'summaryBlockIds 优先原样使用输入中的 id；如果 id 不方便，也可以使用 blockIndexes',
          'children 仍然使用相同结构，层级不超过 2 层',
          '不要遗漏重要分块，不要重复引用同一个分块',
        ],
        documentTitle: document.title,
        summaryBlocks: summaryBlocks.map((block, index) => ({
          index,
          id: block.id,
          title: block.title,
          summary: block.summary,
          paragraphIds: block.paragraphIds,
        })),
      }),
    },
  ])

  const structure = resolveStructureNodes(response.structure, summaryBlocks)
  const fallbackStructure = buildFallbackStructure(summaryBlocks)

  const paragraphRelationMap = new Map<string, string[]>()
  summaryBlocks.forEach((block) => {
    block.paragraphIds.forEach((paragraphId) => {
      paragraphRelationMap.set(paragraphId, [...(paragraphRelationMap.get(paragraphId) || []), block.id])
    })
  })

  return refreshDocumentTimestamp({
    ...document,
    overview: normalizeSummaryText(response.overview) || document.overview,
    summaryBlocks,
    structure: structure.length > 0 ? structure : fallbackStructure,
    paragraphs: document.paragraphs.map((paragraph) => ({
      ...paragraph,
      summaryIds: paragraphRelationMap.get(paragraph.id) || [],
    })),
  })
}

export async function runSelectionTask(
  input: string,
  action: SelectionAction,
  provider: ProviderConfig,
): Promise<SelectionTaskResult> {
  const instruction =
    action === 'summarize'
      ? '请用中文总结这段内容，输出 3 到 5 句，不要遗漏关键信息。'
      : '请把这段内容翻译成中文，并在必要时保留专有名词原文。'

  const response = await requestText(provider, [
    {
      role: 'system',
      content: '你是一个阅读助手。无论输入是什么语言，输出都必须使用中文。',
    },
    {
      role: 'user',
      content: `${instruction}\n\n原文：\n${input}`,
    },
  ])

  return {
    action,
    input,
    output: response,
  }
}

export async function translateDocument(
  document: ReaderDocument,
  provider: ProviderConfig,
  options: TranslateDocumentOptions = {},
) {
  const payload = document.paragraphs.map((paragraph) => ({
    id: paragraph.id,
    text: paragraph.text,
    translation: paragraph.translation,
  }))
  const batchSize = Math.max(1, options.batchSize ?? 12)
  const batches = chunkArray(payload, batchSize)
  const totalParagraphs = payload.length
  const totalBatches = batches.length
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 3, totalBatches || 1))
  const translationMap = new Map<string, string>()

  if (totalBatches === 0) {
    return refreshDocumentTimestamp(document)
  }

  let nextBatchIndex = 0
  let completedBatches = 0
  let completedParagraphs = 0

  options.onProgress?.({
    completedBatches,
    totalBatches,
    completedParagraphs,
    totalParagraphs,
  })

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (nextBatchIndex < totalBatches) {
        const batchIndex = nextBatchIndex
        nextBatchIndex += 1

        if (batchIndex >= totalBatches) {
          return
        }

        const batch = batches[batchIndex]
        const response = await requestJson<{
          items?: Array<{
            id?: string
            paragraphId?: string
            translation?: string
            output?: string
            text?: string
          }>
        }>(provider, [
          {
            role: 'system',
            content:
              '你是一个阅读助手。请把输入文本逐段翻译成中文，返回严格 JSON，不要使用 Markdown 代码块。',
          },
          {
            role: 'user',
            content: JSON.stringify({
              task: '全文翻译',
              requirement: [
                'items 是数组，每项包含 id 和 translation',
                'id 必须原样使用输入中的 id，不要改写，不要省略',
                'items 顺序必须与输入 paragraphs 保持一致',
                'translation 必须是中文',
              ],
              paragraphs: batch.map(({ id, text }) => ({ id, text })),
            }),
          },
        ])

        const batchTranslationMap = resolveTranslationMap(batch, response.items || [])
        batchTranslationMap.forEach((translation, paragraphId) => {
          translationMap.set(paragraphId, translation)
        })

        completedBatches += 1
        completedParagraphs += batch.length
        options.onProgress?.({
          completedBatches,
          totalBatches,
          completedParagraphs,
          totalParagraphs,
        })
      }
    }),
  )

  return refreshDocumentTimestamp({
    ...document,
    paragraphs: document.paragraphs.map((paragraph) => ({
      ...paragraph,
      translation: translationMap.get(paragraph.id) || paragraph.translation || '',
    })),
  })
}

async function requestJson<T>(provider: ProviderConfig, messages: ChatMessage[]) {
  const content = await requestText(provider, messages)
  const normalized = stripCodeFence(content)

  try {
    return JSON.parse(normalized) as T
  } catch (error) {
    throw new Error(`AI 返回的 JSON 无法解析：${String(error)}`, {
      cause: error,
    })
  }
}

async function requestText(provider: ProviderConfig, messages: ChatMessage[]) {
  if (!provider.apiKey.trim()) {
    throw new Error('请先在右侧设置中填写可用的 API Key。')
  }

  const url = `${provider.baseUrl.replace(/\/$/, '')}/chat/completions`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      temperature: 0.2,
      messages,
    }),
  })

  if (!response.ok) {
    throw new Error(`AI 请求失败：${response.status} ${response.statusText}`)
  }

  const payload = (await response.json()) as OpenAICompatibleResponse
  const content = payload.choices?.[0]?.message?.content?.trim()

  if (!content) {
    throw new Error('AI 未返回有效内容。')
  }

  return content
}

function stripCodeFence(content: string) {
  return content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '')
}

function resolveTranslationMap(
  paragraphs: TranslationPayloadItem[],
  items: Array<{
    id?: string
    paragraphId?: string
    translation?: string
    output?: string
    text?: string
  }>,
) {
  const paragraphIds = new Set(paragraphs.map((paragraph) => paragraph.id))
  const translationMap = new Map<string, string>()
  const fallbackTranslations: string[] = []

  items.forEach((item) => {
    const translation = extractTranslationText(item)
    if (!translation) {
      return
    }

    const paragraphId = [item.id, item.paragraphId].find(
      (value): value is string => typeof value === 'string' && paragraphIds.has(value),
    )

    if (paragraphId) {
      translationMap.set(paragraphId, translation)
      return
    }

    fallbackTranslations.push(translation)
  })

  if (fallbackTranslations.length > 0) {
    const untranslatedParagraphs = paragraphs.filter((paragraph) => !translationMap.has(paragraph.id))

    untranslatedParagraphs.forEach((paragraph, index) => {
      const translation = fallbackTranslations[index]
      if (translation) {
        translationMap.set(paragraph.id, translation)
      }
    })
  }

  if (translationMap.size === 0 && items.length > 0) {
    throw new Error('AI 已返回结果，但没有匹配到可用的全文翻译。请检查模型输出格式。')
  }

  return translationMap
}

function chunkArray<T>(items: T[], size: number) {
  const result: T[][] = []

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size))
  }

  return result
}

function extractTranslationText(item: {
  translation?: string
  output?: string
  text?: string
}) {
  const value = [item.translation, item.output, item.text].find(
    (candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0,
  )

  return value?.trim() || ''
}

export function createProviderConfig(): ProviderConfig {
  return {
    id: createId('provider'),
    name: '新的 OpenAI 兼容接口',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    enabled: true,
  }
}

function normalizeSummaryText(value?: string) {
  return typeof value === 'string' ? value.trim() : ''
}

function truncateText(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength) : value
}

function buildFallbackStructure(summaryBlocks: SummaryBlock[]): StructureNode[] {
  return summaryBlocks.map((block, index) => ({
    id: createId('section'),
    title: block.title || `章节 ${index + 1}`,
    paragraphIds: block.paragraphIds,
    children: [],
  }))
}

function resolveStructureNodes(
  input: Array<{
    title?: string
    summaryBlockIds?: string[]
    blockIndexes?: number[]
    children?: Array<{
      title?: string
      summaryBlockIds?: string[]
      blockIndexes?: number[]
      children?: unknown[]
    }>
  }> | undefined,
  summaryBlocks: SummaryBlock[],
): StructureNode[] {
  if (!Array.isArray(input) || input.length === 0) {
    return []
  }

  const blockMap = new Map(summaryBlocks.map((block) => [block.id, block]))

  return input
    .map((item, index) => resolveStructureNode(item, index, summaryBlocks, blockMap))
    .filter((node): node is StructureNode => Boolean(node))
}

function resolveStructureNode(
  input: {
    title?: string
    summaryBlockIds?: string[]
    blockIndexes?: number[]
    children?: Array<{
      title?: string
      summaryBlockIds?: string[]
      blockIndexes?: number[]
      children?: unknown[]
    }>
  },
  index: number,
  summaryBlocks: SummaryBlock[],
  blockMap: Map<string, SummaryBlock>,
): StructureNode | null {
  const directParagraphIds = resolveStructureParagraphIds(input, summaryBlocks, blockMap)
  const children = Array.isArray(input.children)
    ? input.children
        .map((child, childIndex) =>
          resolveStructureNode(
            {
              title: typeof child?.title === 'string' ? child.title : undefined,
              summaryBlockIds: Array.isArray(child?.summaryBlockIds) ? child.summaryBlockIds : undefined,
              blockIndexes: Array.isArray(child?.blockIndexes) ? child.blockIndexes : undefined,
              children: Array.isArray(child?.children) ? (child.children as never[]) : undefined,
            },
            childIndex,
            summaryBlocks,
            blockMap,
          ),
        )
        .filter((node): node is StructureNode => Boolean(node))
    : []

  const paragraphIds = uniqueStrings([
    ...directParagraphIds,
    ...children.flatMap((child) => child.paragraphIds),
  ])

  if (paragraphIds.length === 0) {
    return null
  }

  return {
    id: createId('section'),
    title: normalizeSummaryText(input.title) || `章节 ${index + 1}`,
    paragraphIds,
    children,
  }
}

function resolveStructureParagraphIds(
  input: {
    summaryBlockIds?: string[]
    blockIndexes?: number[]
  },
  summaryBlocks: SummaryBlock[],
  blockMap: Map<string, SummaryBlock>,
) {
  const paragraphIdsFromIds = Array.isArray(input.summaryBlockIds)
    ? input.summaryBlockIds.flatMap((blockId) => blockMap.get(blockId)?.paragraphIds || [])
    : []

  if (paragraphIdsFromIds.length > 0) {
    return uniqueStrings(paragraphIdsFromIds)
  }

  const paragraphIdsFromIndexes = Array.isArray(input.blockIndexes)
    ? input.blockIndexes.flatMap((blockIndex) => summaryBlocks[blockIndex]?.paragraphIds || [])
    : []

  return uniqueStrings(paragraphIdsFromIndexes)
}

function uniqueStrings(items: string[]) {
  return Array.from(new Set(items))
}
