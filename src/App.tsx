import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, MouseEvent as ReactMouseEvent } from 'react'
import './App.css'
import { createImportTemplate, createDocumentFromWebArticle, parseImportedSnapshot } from './lib/document'
import { createProviderConfig, generateDocumentSummary, runSelectionTask, translateDocument } from './services/ai'
import { importPdfFile } from './services/pdf'
import {
  deleteDocument,
  getDocuments,
  loadSettings,
  replaceDocuments,
  saveDocument,
  saveSettings,
} from './services/storage'
import { useReaderStore } from './store/useReaderStore'
import type {
  AnnotationRecord,
  AppSettings,
  ProviderConfig,
  ReaderDocument,
  SelectionAction,
  SelectionTaskResult,
  SidePanelMode,
  WebArticlePayload,
} from './types'

interface TranslationProgressState {
  completedBatches: number
  totalBatches: number
  completedParagraphs: number
  totalParagraphs: number
}

interface SummaryProgressState {
  stage: 'chunk_summary' | 'global_summary'
  message: string
  completedChunks?: number
  totalChunks?: number
}

async function fetchArticleForCurrentRuntime(target: string): Promise<WebArticlePayload> {
  if (window.desktopApi) {
    return window.desktopApi.fetchArticle(target)
  }

  const response = await fetch('/api/article/fetch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url: target }),
  })

  if (!response.ok) {
    let message = `网页导入失败：${response.status}`

    try {
      const payload = (await response.json()) as { error?: string }
      if (payload.error) {
        message = payload.error
      }
    } catch {
      if (response.status === 404) {
        message = '当前网页模式未启用导入服务。请使用 start-web.bat 启动，或改用桌面版。'
      }
    }

    throw new Error(message)
  }

  return (await response.json()) as WebArticlePayload
}

function App() {
  const {
    documents,
    currentDocumentId,
    sidePanelMode,
    currentParagraphId,
    currentSummaryId,
    selectionResult,
    settings,
    isBusy,
    error,
    setDocuments,
    setCurrentDocumentId,
    upsertDocument,
    setSidePanelMode,
    setCurrentParagraphId,
    setCurrentSummaryId,
    setSelectionResult,
    setSettings,
    setBusy,
    setError,
  } = useReaderStore()

  const [webUrl, setWebUrl] = useState('')
  const [selectionText, setSelectionText] = useState('')
  const [selectionParagraphId, setSelectionParagraphId] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState('准备就绪')
  const [providerDraft, setProviderDraft] = useState<ProviderConfig | null>(null)
  const [summaryProgress, setSummaryProgress] = useState<SummaryProgressState | null>(null)
  const [translationProgress, setTranslationProgress] = useState<TranslationProgressState | null>(null)

  const readerScrollRef = useRef<HTMLDivElement | null>(null)
  const paragraphRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const webImportInFlightRef = useRef(false)

  const currentDocument = useMemo(
    () => documents.find((document) => document.id === currentDocumentId) || null,
    [currentDocumentId, documents],
  )

  const activeProvider = useMemo(() => {
    if (!settings) {
      return null
    }

    return (
      settings.providers.find((provider) => provider.id === settings.activeProviderId) ||
      settings.providers[0] ||
      null
    )
  }, [settings])

  const runtimeProvider = useMemo(() => {
    if (providerDraft) {
      return providerDraft
    }

    return activeProvider
  }, [activeProvider, providerDraft])

  useEffect(() => {
    void (async () => {
      try {
        setBusy(true)
        const [savedDocuments, savedSettings] = await Promise.all([getDocuments(), loadSettings()])
        setDocuments(savedDocuments)
        setSettings(savedSettings)
        setProviderDraft(
          savedSettings.providers.find((provider) => provider.id === savedSettings.activeProviderId) ||
            savedSettings.providers[0] ||
            null,
        )
        setStatusMessage(`已加载 ${savedDocuments.length} 篇本地文档`)
      } catch (appError) {
        setError(toMessage(appError))
      } finally {
        setBusy(false)
      }
    })()
  }, [setBusy, setDocuments, setError, setSettings])

  function scrollParagraphIntoReader(
    paragraphId: string,
    behavior: ScrollBehavior = 'auto',
  ) {
    const container = readerScrollRef.current
    const paragraphNode = paragraphRefs.current[paragraphId]

    if (!container || !paragraphNode) {
      return
    }

    const anchorTop = container.clientHeight * 0.6
    const nextTop = paragraphNode.offsetTop - anchorTop

    container.scrollTo({
      top: Math.max(0, nextTop),
      behavior,
    })
  }

  useEffect(() => {
    if (currentParagraphId) {
      scrollParagraphIntoReader(currentParagraphId)
    }
  }, [currentParagraphId])

  async function handlePdfImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    try {
      setBusy(true)
      setError('')
      const document = await importPdfFile(file)
      upsertDocument(document)
      await saveDocument(document)
      setStatusMessage(`已导入 PDF：${document.title}`)
    } catch (appError) {
      setError(toMessage(appError))
    } finally {
      event.target.value = ''
      setBusy(false)
    }
  }

  async function handleWebImport() {
    const target = webUrl.trim()

    if (isBusy || webImportInFlightRef.current) {
      return
    }

    if (!target) {
      setError('请输入网页地址。')
      return
    }

    try {
      webImportInFlightRef.current = true
      setBusy(true)
      setError('')
      setStatusMessage(
        window.desktopApi ? '正在导入网页...' : '正在导入网页，首次抓取可能需要 10 到 15 秒...',
      )
      const article = await fetchArticleForCurrentRuntime(target)
      const document = createDocumentFromWebArticle(article)
      upsertDocument(document)
      await saveDocument(document)
      setStatusMessage(`已导入网页：${document.title}`)
    } catch (appError) {
      setError(toMessage(appError))
    } finally {
      webImportInFlightRef.current = false
      setBusy(false)
    }
  }

  async function handleGenerateSummary() {
    const provider = validateAiAction('全文总结')
    if (!currentDocument || !provider) {
      return
    }

    try {
      setBusy(true)
      setSidePanelMode('summary')
      setError('')
      setSummaryProgress({
        stage: 'chunk_summary',
        message: '正在生成全文总结和结构...',
      })
      setStatusMessage('正在生成全文总结...')
      const updated = await generateDocumentSummary(currentDocument, provider, {
        onProgress: ({ stage, message, completedChunks, totalChunks }) => {
          setSummaryProgress({
            stage,
            message,
            completedChunks,
            totalChunks,
          })
        },
      })
      upsertDocument(updated)
      await saveDocument(updated)
      setSummaryProgress(null)
      setStatusMessage('已生成全文总结和结构')
    } catch (appError) {
      setError(toMessage(appError))
      setSummaryProgress(null)
      setStatusMessage('全文总结失败')
    } finally {
      setBusy(false)
    }
  }

  async function handleTranslateDocument() {
    const provider = validateAiAction('全文翻译')
    if (!currentDocument || !provider) {
      return
    }

    try {
      setBusy(true)
      setSidePanelMode('translation')
      setError('')
      setTranslationProgress({
        completedBatches: 0,
        totalBatches: 0,
        completedParagraphs: 0,
        totalParagraphs: currentDocument.paragraphs.length,
      })
      setStatusMessage('正在生成全文翻译...')
      const updated = await translateDocument(currentDocument, provider, {
        onProgress: ({ completedBatches, totalBatches, completedParagraphs, totalParagraphs }) => {
          setTranslationProgress({
            completedBatches,
            totalBatches,
            completedParagraphs,
            totalParagraphs,
          })
        },
      })
      upsertDocument(updated)
      await saveDocument(updated)
      setTranslationProgress(null)
      setStatusMessage('已生成全文翻译')
    } catch (appError) {
      setError(toMessage(appError))
      setTranslationProgress(null)
      setStatusMessage('全文翻译失败')
    } finally {
      setBusy(false)
    }
  }

  async function handleSelectionAction(action: SelectionAction) {
    if (!selectionText.trim()) {
      setError('请先选中左侧原文中的内容，或手动把文本粘贴到选区框。')
      setStatusMessage('局部 AI 操作未开始')
      return
    }

    const provider = validateAiAction(action === 'summarize' ? '局部总结' : '局部翻译')
    if (!provider) {
      return
    }

    try {
      setBusy(true)
      setError('')
      setStatusMessage(action === 'summarize' ? '正在生成局部总结...' : '正在生成局部翻译...')
      const result = await runSelectionTask(selectionText, action, provider)
      setSelectionResult(result)
      setSidePanelMode('selection')
      setStatusMessage(action === 'summarize' ? '已完成局部总结' : '已完成局部翻译')
    } catch (appError) {
      setError(toMessage(appError))
      setStatusMessage(action === 'summarize' ? '局部总结失败' : '局部翻译失败')
    } finally {
      setBusy(false)
    }
  }

  async function handleExportData() {
    if (!settings || !window.desktopApi) {
      setError('当前环境不支持导出。')
      return
    }

    try {
      setError('')
      const payload = createImportTemplate({ documents, settings })
      const result = await window.desktopApi.exportData(payload)
      if (!result.canceled) {
        setStatusMessage(`已导出数据到 ${result.filePath}`)
      }
    } catch (appError) {
      setError(toMessage(appError))
    }
  }

  async function handleImportData() {
    if (!window.desktopApi) {
      setError('当前环境不支持导入。')
      return
    }

    try {
      setBusy(true)
      setError('')
      const result = await window.desktopApi.importData()
      if (result.canceled || !result.content) {
        return
      }

      const parsed = parseImportedSnapshot(result.content)
      await replaceDocuments(parsed.documents)
      setDocuments(parsed.documents)

      const importedSettings = parsed.settings
      if (importedSettings && isSettings(importedSettings)) {
        await saveSettings(importedSettings)
        setSettings(importedSettings)
        setProviderDraft(
          importedSettings.providers.find((provider) => provider.id === importedSettings.activeProviderId) ||
            importedSettings.providers[0] ||
            null,
        )
      }

      setStatusMessage(`已导入 ${parsed.documents.length} 篇文档`)
    } catch (appError) {
      setError(toMessage(appError))
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteCurrentDocument() {
    if (!currentDocument) {
      return
    }

    const confirmed = window.confirm(`确认删除《${currentDocument.title}》吗？`)
    if (!confirmed) {
      return
    }

    try {
      await deleteDocument(currentDocument.id)
      const nextDocuments = documents.filter((document) => document.id !== currentDocument.id)
      setDocuments(nextDocuments)
      setStatusMessage(`已删除文档：${currentDocument.title}`)
    } catch (appError) {
      setError(toMessage(appError))
    }
  }

  function applyParagraphSelection(paragraphId: string, text: string) {
    setSelectionParagraphId(paragraphId)
    setSelectionText(text)
    setCurrentParagraphId(paragraphId)
    setStatusMessage('已更新局部选区')
  }

  function getSelectedTextWithin(container: HTMLElement) {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      return ''
    }

    const text = selection.toString().trim()
    if (!text) {
      return ''
    }

    const range = selection.getRangeAt(0)
    return container.contains(range.commonAncestorContainer) ? text : ''
  }

  function handleParagraphMouseUp(event: ReactMouseEvent<HTMLDivElement>, paragraphId: string) {
    const text = getSelectedTextWithin(event.currentTarget)
    if (!text) {
      return
    }

    applyParagraphSelection(paragraphId, text)
  }

  function focusParagraph(paragraphId: string, summaryId?: string) {
    setCurrentParagraphId(paragraphId)
    if (summaryId) {
      setCurrentSummaryId(summaryId)
    }
    scrollParagraphIntoReader(paragraphId)
  }

  function handleParagraphClick(
    event: ReactMouseEvent<HTMLDivElement>,
    paragraphId: string,
    summaryId?: string,
  ) {
    if (getSelectedTextWithin(event.currentTarget)) {
      return
    }

    setCurrentParagraphId(paragraphId)
    if (summaryId) {
      setCurrentSummaryId(summaryId)
    }
  }

  function handleSummaryClick(summaryId: string, paragraphId?: string) {
    setCurrentSummaryId(summaryId)
    if (paragraphId) {
      setCurrentParagraphId(paragraphId)
      scrollParagraphIntoReader(paragraphId)
    }
  }

  function handleSelectionFromParagraph(paragraphId: string, text: string) {
    applyParagraphSelection(paragraphId, text)
  }

  async function handleAddAnnotation(paragraphId: string) {
    if (!currentDocument) {
      return
    }

    const content = window.prompt('输入标注内容')
    if (!content?.trim()) {
      return
    }

    const color = (window.prompt('输入颜色：yellow / green / pink', 'yellow') || 'yellow') as
      | 'yellow'
      | 'green'
      | 'pink'
    const annotation: AnnotationRecord = {
      id: crypto.randomUUID(),
      paragraphId,
      content: content.trim(),
      color: color === 'green' || color === 'pink' ? color : 'yellow',
      createdAt: new Date().toISOString(),
    }

    const updated = {
      ...currentDocument,
      updatedAt: new Date().toISOString(),
      annotations: [annotation, ...currentDocument.annotations],
    }

    upsertDocument(updated)
    await saveDocument(updated)
    setSidePanelMode('annotations')
    setStatusMessage('已添加标注')
  }

  async function handleSaveProvider() {
    if (!settings || !providerDraft) {
      return
    }

    const existing = settings.providers.some((provider) => provider.id === providerDraft.id)
    const providers = existing
      ? settings.providers.map((provider) => (provider.id === providerDraft.id ? providerDraft : provider))
      : [providerDraft, ...settings.providers]

    const nextSettings = {
      ...settings,
      providers,
      activeProviderId: providerDraft.id,
    }

    await saveSettings(nextSettings)
    setSettings(nextSettings)
    setError('')
    setStatusMessage(`已保存 AI 配置：${providerDraft.name}`)
  }

  function beginNewProvider() {
    setProviderDraft(createProviderConfig())
  }

  function validateAiAction(actionLabel: string) {
    if (!currentDocument) {
      setError(`请先导入并选择文档，再执行${actionLabel}。`)
      setStatusMessage(`${actionLabel}未开始`)
      return null
    }

    if (!runtimeProvider) {
      setError(`请先在左侧配置可用的 AI 提供商，再执行${actionLabel}。`)
      setStatusMessage(`${actionLabel}未开始`)
      return null
    }

    if (!runtimeProvider.baseUrl.trim() || !runtimeProvider.model.trim() || !runtimeProvider.apiKey.trim()) {
      setError(`请先填写并保存完整的 AI 配置（Base URL、模型名、API Key），再执行${actionLabel}。`)
      setStatusMessage(`${actionLabel}未开始`)
      return null
    }

    return runtimeProvider
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">阅读工具</p>
          <h1>双栏 AI 阅读器</h1>
          <p className="subtle">
            支持 PDF / 网页导入、全文总结、结构提取、局部总结、全文翻译、同步定位、标注和本地保存
          </p>
        </div>
        <div className="topbar-actions">
          <label className="button secondary">
            导入 PDF
            <input type="file" accept="application/pdf" hidden onChange={handlePdfImport} />
          </label>
          <button type="button" className="button secondary" onClick={handleImportData}>
            导入数据
          </button>
          <button type="button" className="button secondary" onClick={handleExportData}>
            导出数据
          </button>
        </div>
      </header>

      <section className="control-grid">
        <div className="card">
          <h2>网页导入</h2>
          <div className="input-row">
            <input
              value={webUrl}
              onChange={(event) => setWebUrl(event.target.value)}
              placeholder="输入网页地址，例如 https://example.com/article"
            />
            <button type="button" className="button" onClick={handleWebImport} disabled={isBusy}>
              {isBusy ? '导入中...' : '导入网页'}
            </button>
          </div>
        </div>

        <div className="card compact">
          <h2>AI 操作</h2>
          <div className="action-row">
            <button type="button" className="button" onClick={handleGenerateSummary} disabled={isBusy}>
              全文总结
            </button>
            <button type="button" className="button" onClick={handleTranslateDocument} disabled={isBusy}>
              全文翻译
            </button>
          </div>
        </div>

        <div className="card compact">
          <h2>文档管理</h2>
          <div className="action-row">
            <button type="button" className="button secondary" onClick={handleDeleteCurrentDocument}>
              删除当前文档
            </button>
            <button type="button" className="button secondary" onClick={() => setSidePanelMode('annotations')}>
              查看标注
            </button>
          </div>
        </div>
      </section>

      <section className="workspace">
        <aside className="sidebar">
          <div className="card sidebar-list">
            <div className="panel-title-row">
              <h2>本地文档</h2>
              <span className="counter-badge">{documents.length}</span>
            </div>
            <div className="doc-list">
              {documents.map((document) => (
                <button
                  key={document.id}
                  type="button"
                  className={`doc-item ${document.id === currentDocumentId ? 'active' : ''}`}
                  onClick={() => setCurrentDocumentId(document.id)}
                >
                  <strong>{document.title}</strong>
                  <span>{document.sourceType === 'pdf' ? 'PDF' : '网页'}</span>
                </button>
              ))}
              {documents.length === 0 ? <p className="empty-state">还没有导入文档。</p> : null}
            </div>
          </div>

          <div className="card provider-card">
            <div className="panel-title-row">
              <h2>AI 提供商</h2>
              <button type="button" className="text-button" onClick={beginNewProvider}>
                新增
              </button>
            </div>

            <select
              value={providerDraft?.id || ''}
              onChange={(event) => {
                const next = settings?.providers.find((provider) => provider.id === event.target.value) || null
                setProviderDraft(next)
              }}
            >
              {(settings?.providers || []).map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>

            {providerDraft ? (
              <div className="provider-form">
                <input
                  value={providerDraft.name}
                  onChange={(event) =>
                    setProviderDraft({
                      ...providerDraft,
                      name: event.target.value,
                    })
                  }
                  placeholder="配置名称"
                />
                <input
                  value={providerDraft.baseUrl}
                  onChange={(event) =>
                    setProviderDraft({
                      ...providerDraft,
                      baseUrl: event.target.value,
                    })
                  }
                  placeholder="Base URL"
                />
                <input
                  value={providerDraft.model}
                  onChange={(event) =>
                    setProviderDraft({
                      ...providerDraft,
                      model: event.target.value,
                    })
                  }
                  placeholder="模型名"
                />
                <input
                  value={providerDraft.apiKey}
                  onChange={(event) =>
                    setProviderDraft({
                      ...providerDraft,
                      apiKey: event.target.value,
                    })
                  }
                  placeholder="API Key"
                />
                <p className="subtle">
                  {runtimeProvider?.apiKey?.trim()
                    ? `当前 AI：${runtimeProvider.name} / ${runtimeProvider.model}`
                    : '请填写 Base URL、模型名、API Key，并点击“保存配置”。'}
                </p>
                <button type="button" className="button secondary" onClick={handleSaveProvider}>
                  保存配置
                </button>
              </div>
            ) : null}
          </div>
        </aside>

        <main className="reader-grid">
          <section className="reader-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">原文</p>
                <h2>{currentDocument?.title || '未选择文档'}</h2>
              </div>
              <span className="subtle">
                {currentDocument
                  ? `${currentDocument.paragraphs.length} 段 · ${currentDocument.sourceType === 'pdf' ? 'PDF' : '网页'}`
                  : '导入后开始阅读'}
              </span>
            </div>

            <div
              className="document-scroll"
              ref={readerScrollRef}
            >
              {currentDocument ? (
                currentDocument.paragraphs.map((paragraph) => {
                  const relatedSummaryId = paragraph.summaryIds[0]
                  const annotation = currentDocument.annotations.find(
                    (item) => item.paragraphId === paragraph.id,
                  )

                  return (
                    <div
                      key={paragraph.id}
                      ref={(node) => {
                        paragraphRefs.current[paragraph.id] = node
                      }}
                      className={`paragraph-card ${paragraph.id === currentParagraphId ? 'focused' : ''} ${
                        annotation ? `marked marked-${annotation.color}` : ''
                      }`}
                    >
                      <div
                        className="paragraph-main"
                        onClick={(event) => handleParagraphClick(event, paragraph.id, relatedSummaryId)}
                        onMouseUp={(event) => handleParagraphMouseUp(event, paragraph.id)}
                      >
                        <span className="paragraph-meta">
                          {paragraph.page ? `第 ${paragraph.page} 页` : '正文段落'}
                        </span>
                        <p>{paragraph.text}</p>
                      </div>
                      <div className="paragraph-actions">
                        <button
                          type="button"
                          className="mini-button"
                          onClick={() => handleSelectionFromParagraph(paragraph.id, paragraph.text)}
                        >
                          设为选区
                        </button>
                        <button
                          type="button"
                          className="mini-button"
                          onClick={() => handleAddAnnotation(paragraph.id)}
                        >
                          划重点
                        </button>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="empty-placeholder">
                  <p>先导入 PDF 或网页文章，左侧显示原文，右侧显示总结与结构。</p>
                </div>
              )}
            </div>
          </section>

          <section className="summary-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">右侧面板</p>
                <h2>总结 / 结构 / 翻译 / 标注</h2>
              </div>
            </div>

            <div className="tab-row">
              {(['summary', 'structure', 'translation', 'selection', 'annotations'] as SidePanelMode[]).map(
                (mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`tab ${sidePanelMode === mode ? 'active' : ''}`}
                    onClick={() => setSidePanelMode(mode)}
                  >
                    {tabLabelMap[mode]}
                  </button>
                ),
              )}
            </div>

            <div className="selection-box">
              <textarea
                value={selectionText}
                onChange={(event) => setSelectionText(event.target.value)}
                placeholder="选中段落后可在这里做局部总结或局部翻译"
              />
              <div className="action-row">
                <button type="button" className="button secondary" onClick={() => handleSelectionAction('summarize')}>
                  局部总结
                </button>
                <button type="button" className="button secondary" onClick={() => handleSelectionAction('translate')}>
                  局部翻译
                </button>
              </div>
              {selectionParagraphId ? <p className="subtle">当前选区来自段落：{selectionParagraphId}</p> : null}
            </div>

            <div className="document-scroll">
              {renderSidePanel({
                mode: sidePanelMode,
                currentDocument,
                selectionResult,
                summaryProgress,
                translationProgress,
                currentParagraphId,
                currentSummaryId,
                isBusy,
                onSummaryClick: handleSummaryClick,
                onParagraphClick: focusParagraph,
                onGenerateSummary: handleGenerateSummary,
                onTranslateDocument: handleTranslateDocument,
              })}
            </div>
          </section>
        </main>
      </section>

      <footer className="footer-bar">
        <span>{statusMessage}</span>
        <span className={error ? 'error-text' : 'subtle'}>{error || '所有数据默认保存在本地 IndexedDB'}</span>
      </footer>
    </div>
  )
}

function renderSidePanel({
  mode,
  currentDocument,
  selectionResult,
  summaryProgress,
  translationProgress,
  currentParagraphId,
  currentSummaryId,
  isBusy,
  onSummaryClick,
  onParagraphClick,
  onGenerateSummary,
  onTranslateDocument,
}: {
  mode: SidePanelMode
  currentDocument: ReaderDocument | null
  selectionResult: SelectionTaskResult | null
  summaryProgress: SummaryProgressState | null
  translationProgress: TranslationProgressState | null
  currentParagraphId: string | null
  currentSummaryId: string | null
  isBusy: boolean
  onSummaryClick: (summaryId: string, paragraphId?: string) => void
  onParagraphClick: (paragraphId: string, summaryId?: string) => void
  onGenerateSummary: () => Promise<void>
  onTranslateDocument: () => Promise<void>
}) {
  if (!currentDocument) {
    return <div className="empty-placeholder">右侧结果将在导入文档后显示。</div>
  }

  if (mode === 'summary') {
    const summaryGenerated = hasGeneratedSummary(currentDocument)

    if (!summaryGenerated && !summaryProgress) {
      return (
        <div className="result-card empty-result-card">
          <span className="tag">全文总结结果</span>
          <p>当前还没有生成全文总结。右侧页签只负责切换视图，不会自动调用 AI。</p>
          <div className="action-row">
            <button type="button" className="button" onClick={() => void onGenerateSummary()} disabled={isBusy}>
              {isBusy ? '生成中...' : '立即生成全文总结'}
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="stack">
        {summaryProgress ? (
          <div className="result-card summary-progress-card">
            <div className="panel-title-row">
              <strong>正在生成全文总结</strong>
              <span className="tag">
                {summaryProgress.stage === 'chunk_summary'
                  ? `${summaryProgress.completedChunks ?? 0}/${summaryProgress.totalChunks ?? '?'} 块`
                  : '汇总中'}
              </span>
            </div>
            <p>{summaryProgress.message}</p>
            <div className="progress-track" aria-hidden="true">
              <div className="progress-fill indeterminate" />
            </div>
          </div>
        ) : null}
        <div className="result-card">
          <span className="tag">全文概览</span>
          <p>{currentDocument.overview}</p>
        </div>
        {currentDocument.summaryBlocks.map((block) => (
          <button
            key={block.id}
            type="button"
            className={`result-card interactive ${block.id === currentSummaryId ? 'focused' : ''}`}
            onClick={() => onSummaryClick(block.id, block.paragraphIds[0])}
          >
            <div className="panel-title-row">
              <strong>{block.title}</strong>
              <span className="tag">{block.paragraphIds.length} 段</span>
            </div>
            <p>{block.summary}</p>
            <div className="quoted-source">
              <strong>对应原文</strong>
              <p>{block.originalText}</p>
            </div>
          </button>
        ))}
      </div>
    )
  }

  if (mode === 'structure') {
    return (
      <div className="stack">
        {currentDocument.structure.map((node) => (
          <div key={node.id} className="result-card">
            <div className="panel-title-row">
              <strong>{node.title}</strong>
              <span className="tag">{node.paragraphIds.length} 段</span>
            </div>
            <div className="chip-row">
              {node.paragraphIds.map((paragraphId) => (
                <button
                  key={paragraphId}
                  type="button"
                  className={`chip ${paragraphId === currentParagraphId ? 'active' : ''}`}
                  onClick={() => onParagraphClick(paragraphId)}
                >
                  {paragraphId.slice(0, 8)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (mode === 'translation') {
    const translationGenerated = hasGeneratedTranslation(currentDocument)
    const progressPercent =
      translationProgress && translationProgress.totalParagraphs > 0
        ? Math.round((translationProgress.completedParagraphs / translationProgress.totalParagraphs) * 100)
        : 0

    if (!translationGenerated && !translationProgress) {
      return (
        <div className="result-card empty-result-card">
          <span className="tag">全文翻译结果</span>
          <p>当前还没有生成全文翻译。右侧页签只负责切换视图，不会自动调用 AI。</p>
          <div className="action-row">
            <button
              type="button"
              className="button"
              onClick={() => void onTranslateDocument()}
              disabled={isBusy}
            >
              {isBusy ? '生成中...' : '立即生成全文翻译'}
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="stack">
        {translationProgress ? (
          <div className="result-card translation-progress-card">
            <div className="panel-title-row">
              <strong>正在生成全文翻译</strong>
              <span className="tag">{progressPercent}%</span>
            </div>
            <p>
              已完成 {translationProgress.completedBatches}/{translationProgress.totalBatches || '?'} 批，
              {translationProgress.completedParagraphs}/{translationProgress.totalParagraphs} 段
            </p>
            <div className="progress-track" aria-hidden="true">
              <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        ) : null}
        {currentDocument.paragraphs.map((paragraph) => (
          <div key={paragraph.id} className="result-card">
            <strong>原文</strong>
            <p>{paragraph.text}</p>
            <strong>中文翻译</strong>
            <p>{paragraph.translation || '尚未生成全文翻译。'}</p>
          </div>
        ))}
      </div>
    )
  }

  if (mode === 'selection') {
    return selectionResult ? (
      <div className="result-card">
        <span className="tag">{selectionResult.action === 'summarize' ? '局部总结' : '局部翻译'}</span>
        <strong>原文</strong>
        <p>{selectionResult.input}</p>
        <strong>结果</strong>
        <p>{selectionResult.output}</p>
      </div>
    ) : (
      <div className="empty-placeholder">先在左侧选取段落或粘贴文本，再执行局部总结或局部翻译。</div>
    )
  }

  return currentDocument.annotations.length > 0 ? (
    <div className="stack">
      {currentDocument.annotations.map((annotation) => (
        <button
          key={annotation.id}
          type="button"
          className={`result-card interactive marked marked-${annotation.color}`}
          onClick={() => onParagraphClick(annotation.paragraphId)}
        >
          <div className="panel-title-row">
            <strong>{annotation.content}</strong>
            <span className="tag">{new Date(annotation.createdAt).toLocaleString()}</span>
          </div>
          <p>对应段落：{annotation.paragraphId}</p>
        </button>
      ))}
    </div>
  ) : (
    <div className="empty-placeholder">当前文档还没有标注。</div>
  )
}

function toMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

function hasGeneratedSummary(document: ReaderDocument) {
  const hasOverview = document.overview !== '导入后尚未生成 AI 全文总结。'
  const hasRealSummaryBlock = document.summaryBlocks.some(
    (block) => block.summary !== '这里会显示 AI 生成的中文总结。当前为导入后的占位内容。',
  )

  return hasOverview || hasRealSummaryBlock
}

function hasGeneratedTranslation(document: ReaderDocument) {
  return document.paragraphs.some((paragraph) => Boolean(paragraph.translation?.trim()))
}

function isSettings(value: unknown): value is AppSettings {
  if (!value || typeof value !== 'object') {
    return false
  }

  const settings = value as { providers?: unknown; activeProviderId?: unknown }
  return Array.isArray(settings.providers) && 'activeProviderId' in settings
}

const tabLabelMap: Record<SidePanelMode, string> = {
  summary: '总结结果',
  structure: '结构',
  translation: '翻译结果',
  selection: '局部结果',
  annotations: '标注',
}

export default App
