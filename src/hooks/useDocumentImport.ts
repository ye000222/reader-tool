import { useCallback, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'

import { createImportTemplate, createDocumentFromWebArticle, parseImportedSnapshot } from '../lib/document'
import { importPdfFile } from '../services/pdf'
import { fetchArticleForCurrentRuntime } from '../services/webImport'
import {
  deleteDocument,
  replaceDocuments,
  saveDocument,
  saveSettings,
} from '../services/storage'
import { useReaderStore } from '../store/useReaderStore'
import { toMessage, isSettings } from '../lib/document-utils'

export function useDocumentImport(onStatus: (message: string) => void) {
  const {
    documents,
    settings,
    setDocuments,
    upsertDocument,
    setSettings,
    setBusy,
    setError,
  } = useReaderStore()

  const [webUrl, setWebUrl] = useState('')
  const webImportInFlightRef = useRef(false)

  const handlePdfImport = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
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
        onStatus(`已导入 PDF：${document.title}`)
      } catch (appError) {
        setError(toMessage(appError))
      } finally {
        event.target.value = ''
        setBusy(false)
      }
    },
    [onStatus, setBusy, setError, upsertDocument],
  )

  const handleWebImport = useCallback(
    async (isBusy: boolean) => {
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
        onStatus(
          window.desktopApi ? '正在导入网页...' : '正在导入网页，首次抓取可能需要 10 到 15 秒...',
        )
        const article = await fetchArticleForCurrentRuntime(target)
        const document = createDocumentFromWebArticle(article)
        upsertDocument(document)
        await saveDocument(document)
        onStatus(`已导入网页：${document.title}`)
      } catch (appError) {
        setError(toMessage(appError))
      } finally {
        webImportInFlightRef.current = false
        setBusy(false)
      }
    },
    [webUrl, onStatus, setBusy, setError, upsertDocument],
  )

  const handleExportData = useCallback(async () => {
    if (!settings || !window.desktopApi) {
      setError('当前环境不支持导出。')
      return
    }

    try {
      setError('')
      const payload = createImportTemplate({ documents, settings })
      const result = await window.desktopApi.exportData(payload)
      if (!result.canceled) {
        onStatus(`已导出数据到 ${result.filePath}`)
      }
    } catch (appError) {
      setError(toMessage(appError))
    }
  }, [documents, settings, onStatus, setError])

  const handleImportData = useCallback(async () => {
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
      }

      onStatus(`已导入 ${parsed.documents.length} 篇文档`)
    } catch (appError) {
      setError(toMessage(appError))
    } finally {
      setBusy(false)
    }
  }, [onStatus, setBusy, setError, setDocuments, setSettings])

  const handleDeleteCurrentDocument = useCallback(
    async (documentId: string, title: string) => {
      const confirmed = window.confirm(`确认删除《${title}》吗？`)
      if (!confirmed) {
        return
      }

      try {
        await deleteDocument(documentId)
        const nextDocuments = documents.filter((document) => document.id !== documentId)
        setDocuments(nextDocuments)
        onStatus(`已删除文档：${title}`)
      } catch (appError) {
        setError(toMessage(appError))
      }
    },
    [documents, onStatus, setDocuments, setError],
  )

  return {
    webUrl,
    setWebUrl,
    handlePdfImport,
    handleWebImport,
    handleExportData,
    handleImportData,
    handleDeleteCurrentDocument,
  }
}
