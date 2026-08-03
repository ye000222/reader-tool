import { useCallback, useState } from 'react'

import { useReaderStore } from '../store/useReaderStore'

export function useTextSelection() {
  const { setCurrentParagraphId } = useReaderStore()
  const [selectionText, setSelectionText] = useState('')
  const [selectionParagraphId, setSelectionParagraphId] = useState<string | null>(null)

  const applyParagraphSelection = useCallback(
    (paragraphId: string, text: string) => {
      setSelectionParagraphId(paragraphId)
      setSelectionText(text)
      setCurrentParagraphId(paragraphId)
    },
    [setCurrentParagraphId],
  )

  const getSelectedTextWithin = useCallback((container: HTMLElement) => {
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
  }, [])

  const handleParagraphMouseUp = useCallback(
    (container: HTMLElement, paragraphId: string) => {
      const text = getSelectedTextWithin(container)
      if (!text) {
        return
      }

      applyParagraphSelection(paragraphId, text)
    },
    [applyParagraphSelection, getSelectedTextWithin],
  )

  return {
    selectionText,
    setSelectionText,
    selectionParagraphId,
    applyParagraphSelection,
    getSelectedTextWithin,
    handleParagraphMouseUp,
  }
}
