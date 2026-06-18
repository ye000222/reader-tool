import type {
  AppSettings,
  Paragraph,
  ReaderDocument,
  SourceType,
  StructureNode,
  SummaryBlock,
  WebArticlePayload,
} from '../types'

export function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

export function normalizeText(input: string) {
  return input.replace(/\r/g, '').replace(/\t/g, ' ').replace(/\u00a0/g, ' ').trim()
}

export function splitIntoParagraphs(text: string, page?: number) {
  const cleaned = normalizeText(text)
  const blocks = cleaned
    .split(/\n{2,}/)
    .map((block) => block.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  const paragraphs = blocks.length > 0 ? blocks : splitLongPlainText(cleaned)

  return paragraphs.map<Paragraph>((paragraph, index) => ({
    id: createId('para'),
    order: index,
    text: paragraph,
    page,
    sourceAnchor: page ? `page-${page}-p-${index + 1}` : `p-${index + 1}`,
    translation: '',
    summaryIds: [],
  }))
}

function splitLongPlainText(text: string) {
  return text
    .split(/(?<=[。！？.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function createDocumentFromWebArticle(article: WebArticlePayload): ReaderDocument {
  const now = new Date().toISOString()
  const paragraphs = splitIntoParagraphs(article.textContent)
  const summaryBlocks = buildPlaceholderSummary(paragraphs)

  return {
    id: createId('doc'),
    title: article.title || article.url,
    sourceType: 'web',
    sourceUri: article.url,
    createdAt: now,
    updatedAt: now,
    languageHint: detectLanguage(article.textContent),
    paragraphs: linkParagraphs(paragraphs, summaryBlocks),
    summaryBlocks,
    structure: buildPlaceholderStructure(paragraphs),
    overview: article.excerpt || '导入后尚未生成 AI 全文总结。',
    annotations: [],
  }
}

export function createDocumentFromPdf(title: string, sourceUri: string, pages: Paragraph[][]): ReaderDocument {
  const now = new Date().toISOString()
  const flattened = pages.flatMap((pageParagraphs, pageIndex) =>
    pageParagraphs.map((paragraph, index) => ({
      ...paragraph,
      order: flattenedOrder(pageIndex, index, pages),
    })),
  )
  const summaryBlocks = buildPlaceholderSummary(flattened)

  return {
    id: createId('doc'),
    title,
    sourceType: 'pdf',
    sourceUri,
    createdAt: now,
    updatedAt: now,
    languageHint: detectLanguage(flattened.map((item) => item.text).join('\n')),
    paragraphs: linkParagraphs(flattened, summaryBlocks),
    summaryBlocks,
    structure: buildPlaceholderStructure(flattened),
    overview: '导入后尚未生成 AI 全文总结。',
    annotations: [],
  }
}

function flattenedOrder(pageIndex: number, index: number, pages: Paragraph[][]) {
  const previousCount = pages
    .slice(0, pageIndex)
    .reduce((sum, paragraphList) => sum + paragraphList.length, 0)

  return previousCount + index
}

function buildPlaceholderSummary(paragraphs: Paragraph[]): SummaryBlock[] {
  return chunkParagraphs(paragraphs, 3).map((group, index) => ({
    id: createId('summary'),
    title: `片段 ${index + 1}`,
    summary: '这里会显示 AI 生成的中文总结。当前为导入后的占位内容。',
    paragraphIds: group.map((paragraph) => paragraph.id),
    originalText: group.map((paragraph) => paragraph.text).join('\n\n'),
  }))
}

function buildPlaceholderStructure(paragraphs: Paragraph[]): StructureNode[] {
  return chunkParagraphs(paragraphs, 4).map((group, index) => ({
    id: createId('section'),
    title: `章节 ${index + 1}`,
    paragraphIds: group.map((paragraph) => paragraph.id),
    children: [],
  }))
}

function chunkParagraphs(paragraphs: Paragraph[], size: number) {
  const result: Paragraph[][] = []

  for (let index = 0; index < paragraphs.length; index += size) {
    result.push(paragraphs.slice(index, index + size))
  }

  return result
}

function linkParagraphs(paragraphs: Paragraph[], summaryBlocks: SummaryBlock[]) {
  const relationMap = new Map<string, string[]>()

  summaryBlocks.forEach((block) => {
    block.paragraphIds.forEach((paragraphId) => {
      relationMap.set(paragraphId, [...(relationMap.get(paragraphId) || []), block.id])
    })
  })

  return paragraphs.map((paragraph) => ({
    ...paragraph,
    summaryIds: relationMap.get(paragraph.id) || [],
  }))
}

function detectLanguage(text: string) {
  const chineseCount = (text.match(/[\u4e00-\u9fff]/g) || []).length
  const latinCount = (text.match(/[A-Za-z]/g) || []).length

  if (chineseCount > latinCount) {
    return 'zh'
  }

  return 'unknown'
}

export function refreshDocumentTimestamp(document: ReaderDocument) {
  return {
    ...document,
    updatedAt: new Date().toISOString(),
  }
}

export function createImportTemplate(snapshot: {
  documents: ReaderDocument[]
  settings: AppSettings
}) {
  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    ...snapshot,
  }
}

export function parseImportedSnapshot(raw: string) {
  const parsed = JSON.parse(raw) as { documents?: ReaderDocument[]; settings?: unknown }

  return {
    documents: Array.isArray(parsed.documents) ? parsed.documents : [],
    settings: parsed.settings,
  }
}

export function createDocumentFromSelection(sourceType: SourceType) {
  return `当前文档来源：${sourceType === 'pdf' ? 'PDF' : '网页'}`
}
