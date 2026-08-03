export type SourceType = 'pdf' | 'web'
export type SidePanelMode = 'summary' | 'structure' | 'translation' | 'selection' | 'annotations'
export type SelectionAction = 'summarize' | 'translate'

export interface Paragraph {
  id: string
  order: number
  text: string
  page?: number
  sourceAnchor: string
  translation?: string
  summaryIds: string[]
}

export interface SummaryBlock {
  id: string
  title: string
  summary: string
  paragraphIds: string[]
  originalText: string
}

export interface StructureNode {
  id: string
  title: string
  paragraphIds: string[]
  children: StructureNode[]
}

export interface AnnotationRecord {
  id: string
  paragraphId: string
  content: string
  color: 'yellow' | 'green' | 'pink'
  createdAt: string
}

export interface ProviderConfig {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  model: string
  enabled: boolean
}

export interface ReaderDocument {
  id: string
  title: string
  sourceType: SourceType
  sourceUri: string
  createdAt: string
  updatedAt: string
  languageHint: string
  paragraphs: Paragraph[]
  summaryBlocks: SummaryBlock[]
  structure: StructureNode[]
  overview: string
  annotations: AnnotationRecord[]
}

export interface SelectionTaskResult {
  action: SelectionAction
  input: string
  output: string
}

export interface AppSettings {
  providers: ProviderConfig[]
  activeProviderId: string | null
}

export interface AppSnapshot {
  documents: ReaderDocument[]
  settings: AppSettings
}

export interface WebArticlePayload {
  url: string
  title: string
  byline: string
  excerpt: string
  textContent: string
}

export interface DesktopApi {
  fetchArticle: (url: string) => Promise<WebArticlePayload>
  exportData: (payload: unknown) => Promise<{ canceled: boolean; filePath?: string }>
  importData: () => Promise<{ canceled: boolean; filePath?: string; content?: string }>
  encryptSecret: (plain: string) => Promise<string>
  decryptSecret: (cipher: string) => Promise<string>
}

declare global {
  interface Window {
    desktopApi?: DesktopApi
  }
}
