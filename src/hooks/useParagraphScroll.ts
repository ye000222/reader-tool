import { useCallback, useEffect, useRef } from 'react'

import { useReaderStore } from '../store/useReaderStore'

export function useParagraphScroll() {
  const readerScrollRef = useRef<HTMLDivElement | null>(null)
  const paragraphRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const { currentParagraphId, setCurrentParagraphId, setCurrentSummaryId } = useReaderStore()

  const scrollParagraphIntoReader = useCallback(
    (paragraphId: string, behavior: ScrollBehavior = 'auto') => {
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
    },
    [],
  )

  useEffect(() => {
    if (currentParagraphId) {
      scrollParagraphIntoReader(currentParagraphId)
    }
  }, [currentParagraphId, scrollParagraphIntoReader])

  const focusParagraph = useCallback(
    (paragraphId: string, summaryId?: string) => {
      setCurrentParagraphId(paragraphId)
      if (summaryId) {
        setCurrentSummaryId(summaryId)
      }
      scrollParagraphIntoReader(paragraphId)
    },
    [scrollParagraphIntoReader, setCurrentParagraphId, setCurrentSummaryId],
  )

  const handleParagraphClick = useCallback(
    (paragraphId: string, hasSelection: boolean, summaryId?: string) => {
      if (hasSelection) {
        return
      }

      setCurrentParagraphId(paragraphId)
      if (summaryId) {
        setCurrentSummaryId(summaryId)
      }
    },
    [setCurrentParagraphId, setCurrentSummaryId],
  )

  const handleSummaryClick = useCallback(
    (summaryId: string, paragraphId?: string) => {
      setCurrentSummaryId(summaryId)
      if (paragraphId) {
        setCurrentParagraphId(paragraphId)
        scrollParagraphIntoReader(paragraphId)
      }
    },
    [scrollParagraphIntoReader, setCurrentParagraphId, setCurrentSummaryId],
  )

  return {
    readerScrollRef,
    paragraphRefs,
    focusParagraph,
    handleParagraphClick,
    handleSummaryClick,
  }
}
