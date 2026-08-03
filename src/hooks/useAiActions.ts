import { useCallback, useMemo, useRef, useState } from 'react'

import { generateDocumentSummary, runSelectionTask, translateDocument } from '../services/ai'
import { saveDocument } from '../services/storage'
import { useReaderStore } from '../store/useReaderStore'
import { toMessage } from '../lib/document-utils'
import type { ProviderConfig, SelectionAction } from '../types'

interface SummaryProgressState {
  stage: 'chunk_summary' | 'global_summary'
  message: string
  completedChunks?: number
  totalChunks?: number
}

interface TranslationProgressState {
  completedBatches: number
  totalBatches: number
  completedParagraphs: number
  totalParagraphs: number
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function useAiActions(onStatus: (message: string) => void) {
  const {
    documents,
    currentDocumentId,
    upsertDocument,
    setBusy,
    setError,
    setSidePanelMode,
    setSelectionResult,
  } = useReaderStore()

  const currentDocument = useMemo(
    () => documents.find((document) => document.id === currentDocumentId) || null,
    [currentDocumentId, documents],
  )

  const [summaryProgress, setSummaryProgress] = useState<SummaryProgressState | null>(null)
  const [translationProgress, setTranslationProgress] = useState<TranslationProgressState | null>(
    null,
  )
  const abortRef = useRef<AbortController | null>(null)

  const validateAiAction = useCallback(
    (actionLabel: string, provider: ProviderConfig | null) => {
      if (!currentDocument) {
        setError(`请先导入并选择文档，再执行${actionLabel}。`)
        onStatus(`${actionLabel}未开始`)
        return null
      }

      if (!provider) {
        setError(`请先在左侧配置可用的 AI 提供商，再执行${actionLabel}。`)
        onStatus(`${actionLabel}未开始`)
        return null
      }

      if (!provider.baseUrl.trim() || !provider.model.trim() || !provider.apiKey.trim()) {
        setError(
          `请先填写并保存完整的 AI 配置（Base URL、模型名、API Key），再执行${actionLabel}。`,
        )
        onStatus(`${actionLabel}未开始`)
        return null
      }

      return provider
    },
    [currentDocument, onStatus, setError],
  )

  const cancelCurrentTask = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setBusy(false)
    setSummaryProgress(null)
    setTranslationProgress(null)
    onStatus('已取消当前 AI 任务')
  }, [onStatus, setBusy, setSummaryProgress, setTranslationProgress])

  const generateSummary = useCallback(
    async (provider: ProviderConfig | null) => {
      const validProvider = validateAiAction('全文总结', provider)
      if (!currentDocument || !validProvider) {
        return
      }

      const controller = new AbortController()
      abortRef.current = controller

      try {
        setBusy(true)
        setSidePanelMode('summary')
        setError('')
        setSummaryProgress({
          stage: 'chunk_summary',
          message: '正在生成全文总结和结构...',
        })
        onStatus('正在生成全文总结...')
        const updated = await generateDocumentSummary(currentDocument, validProvider, {
          signal: controller.signal,
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
        onStatus('已生成全文总结和结构')
      } catch (appError) {
        if (isAbortError(appError)) {
          onStatus('已取消全文总结')
          return
        }

        setError(toMessage(appError))
        setSummaryProgress(null)
        onStatus('全文总结失败')
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null
        }
        setBusy(false)
      }
    },
    [
      currentDocument,
      onStatus,
      setError,
      setBusy,
      setSidePanelMode,
      setSummaryProgress,
      upsertDocument,
      validateAiAction,
    ],
  )

  const translateDocumentAction = useCallback(
    async (provider: ProviderConfig | null) => {
      const validProvider = validateAiAction('全文翻译', provider)
      if (!currentDocument || !validProvider) {
        return
      }

      const controller = new AbortController()
      abortRef.current = controller

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
        onStatus('正在生成全文翻译...')
        const updated = await translateDocument(currentDocument, validProvider, {
          signal: controller.signal,
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
        onStatus('已生成全文翻译')
      } catch (appError) {
        if (isAbortError(appError)) {
          onStatus('已取消全文翻译')
          return
        }

        setError(toMessage(appError))
        setTranslationProgress(null)
        onStatus('全文翻译失败')
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null
        }
        setBusy(false)
      }
    },
    [
      currentDocument,
      onStatus,
      setError,
      setBusy,
      setSidePanelMode,
      setTranslationProgress,
      upsertDocument,
      validateAiAction,
    ],
  )

  const runSelection = useCallback(
    async (input: string, action: SelectionAction, provider: ProviderConfig | null) => {
      if (!input.trim()) {
        setError('请先选中左侧原文中的内容，或手动把文本粘贴到选区框。')
        onStatus('局部 AI 操作未开始')
        return
      }

      const validProvider = validateAiAction(
        action === 'summarize' ? '局部总结' : '局部翻译',
        provider,
      )
      if (!validProvider) {
        return
      }

      const controller = new AbortController()
      abortRef.current = controller

      try {
        setBusy(true)
        setError('')
        setSidePanelMode('selection')
        setSelectionResult({ action, input, output: '' })
        onStatus(action === 'summarize' ? '正在生成局部总结...' : '正在生成局部翻译...')
        const result = await runSelectionTask(input, action, validProvider, {
          signal: controller.signal,
          onDelta: (output) => {
            setSelectionResult({ action, input, output })
          },
        })
        setSelectionResult(result)
        onStatus(action === 'summarize' ? '已完成局部总结' : '已完成局部翻译')
      } catch (appError) {
        if (isAbortError(appError)) {
          onStatus(action === 'summarize' ? '已取消局部总结' : '已取消局部翻译')
          return
        }

        setError(toMessage(appError))
        onStatus(action === 'summarize' ? '局部总结失败' : '局部翻译失败')
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null
        }
        setBusy(false)
      }
    },
    [onStatus, setError, setBusy, setSelectionResult, setSidePanelMode, validateAiAction],
  )

  return {
    summaryProgress,
    translationProgress,
    generateSummary,
    translateDocumentAction,
    runSelection,
    cancelCurrentTask,
  }
}

// Re-export the progress-state types for components that render progress.
export type { SummaryProgressState, TranslationProgressState }
