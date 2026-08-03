import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import './App.css'
import { createProviderConfig } from './services/ai'
import { getDocuments, loadSettings, saveDocument, saveSettings } from './services/storage'
import { toMessage } from './lib/document-utils'
import { useReaderStore } from './store/useReaderStore'
import { useAiActions } from './hooks/useAiActions'
import { useDocumentImport } from './hooks/useDocumentImport'
import { useParagraphScroll } from './hooks/useParagraphScroll'
import { useTextSelection } from './hooks/useTextSelection'
import { ControlGrid } from './components/ControlGrid'
import { Footer } from './components/Footer'
import { ReaderPanel } from './components/ReaderPanel'
import { Sidebar } from './components/Sidebar'
import { SummaryPanel } from './components/SummaryPanel'
import { TopBar } from './components/TopBar'
import type { AnnotationRecord, ProviderConfig } from './types'

function App() {
  const {
    documents,
    currentDocumentId,
    currentParagraphId,
    settings,
    selectionResult,
    isBusy,
    error,
    setDocuments,
    setSettings,
    setBusy,
    setError,
    setSidePanelMode,
  } = useReaderStore()

  const [statusMessage, setStatusMessage] = useState('准备就绪')
  const [providerDraft, setProviderDraft] = useState<ProviderConfig | null>(null)

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

  const {
    summaryProgress,
    translationProgress,
    generateSummary,
    translateDocumentAction,
    runSelection,
  } = useAiActions(setStatusMessage)

  const {
    webUrl,
    setWebUrl,
    handlePdfImport,
    handleWebImport,
    handleExportData,
    handleImportData,
    handleDeleteCurrentDocument,
  } = useDocumentImport(setStatusMessage)

  const {
    readerScrollRef,
    paragraphRefs,
    focusParagraph,
    handleParagraphClick,
    handleSummaryClick,
  } = useParagraphScroll()

  const {
    selectionText,
    setSelectionText,
    selectionParagraphId,
    applyParagraphSelection,
    getSelectedTextWithin,
    handleParagraphMouseUp,
  } = useTextSelection()

  const setParagraphRef = (paragraphId: string) => (node: HTMLDivElement | null) => {
    paragraphRefs.current[paragraphId] = node
  }

  const onParagraphClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>, paragraphId: string, summaryId?: string) => {
      const hasSelection = Boolean(getSelectedTextWithin(event.currentTarget))
      handleParagraphClick(paragraphId, hasSelection, summaryId)
    },
    [getSelectedTextWithin, handleParagraphClick],
  )

  const onParagraphMouseUp = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>, paragraphId: string) => {
      handleParagraphMouseUp(event.currentTarget, paragraphId)
    },
    [handleParagraphMouseUp],
  )

  const onSelectionAction = useCallback(
    (action: 'summarize' | 'translate') => {
      void runSelection(selectionText, action, runtimeProvider)
    },
    [runSelection, runtimeProvider, selectionText],
  )

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

    useReaderStore.getState().upsertDocument(updated)
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

  return (
    <div className="app-shell">
      <TopBar
        onPdfImport={handlePdfImport}
        onImportData={handleImportData}
        onExportData={handleExportData}
      />

      <ControlGrid
        webUrl={webUrl}
        setWebUrl={setWebUrl}
        onWebImport={handleWebImport}
        onGenerateSummary={() => void generateSummary(runtimeProvider)}
        onTranslateDocument={() => void translateDocumentAction(runtimeProvider)}
        onDeleteCurrent={() => {
          if (currentDocument) {
            void handleDeleteCurrentDocument(currentDocument.id, currentDocument.title)
          }
        }}
        onViewAnnotations={() => setSidePanelMode('annotations')}
        isBusy={isBusy}
      />

      <section className="workspace">
        <Sidebar
          settings={settings}
          providerDraft={providerDraft}
          setProviderDraft={setProviderDraft}
          onSaveProvider={handleSaveProvider}
          onBeginNewProvider={beginNewProvider}
        />

        <main className="reader-grid">
          <ReaderPanel
            currentDocument={currentDocument}
            currentParagraphId={currentParagraphId}
            readerScrollRef={readerScrollRef}
            setParagraphRef={setParagraphRef}
            onParagraphClick={onParagraphClick}
            onParagraphMouseUp={onParagraphMouseUp}
            onSetSelection={applyParagraphSelection}
            onAddAnnotation={handleAddAnnotation}
          />

          <SummaryPanel
            currentDocument={currentDocument}
            selectionText={selectionText}
            setSelectionText={setSelectionText}
            selectionParagraphId={selectionParagraphId}
            onSelectionAction={onSelectionAction}
            summaryProgress={summaryProgress}
            translationProgress={translationProgress}
            selectionResult={selectionResult}
            isBusy={isBusy}
            onSummaryClick={handleSummaryClick}
            onParagraphClick={focusParagraph}
            onGenerateSummary={() => void generateSummary(runtimeProvider)}
            onTranslateDocument={() => void translateDocumentAction(runtimeProvider)}
          />
        </main>
      </section>

      <Footer statusMessage={statusMessage} error={error} />
    </div>
  )
}

export default App
