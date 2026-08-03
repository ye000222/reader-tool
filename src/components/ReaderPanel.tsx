import type { RefObject } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'

import { ParagraphCard } from './ParagraphCard'
import type { ReaderDocument } from '../types'

interface ReaderPanelProps {
  currentDocument: ReaderDocument | null
  currentParagraphId: string | null
  readerScrollRef: RefObject<HTMLDivElement | null>
  setParagraphRef: (paragraphId: string) => (node: HTMLDivElement | null) => void
  onParagraphClick: (event: ReactMouseEvent<HTMLDivElement>, paragraphId: string, summaryId?: string) => void
  onParagraphMouseUp: (event: ReactMouseEvent<HTMLDivElement>, paragraphId: string) => void
  onSetSelection: (paragraphId: string, text: string) => void
  onAnnotationClick: (paragraphId: string) => void
}

export function ReaderPanel({
  currentDocument,
  currentParagraphId,
  readerScrollRef,
  setParagraphRef,
  onParagraphClick,
  onParagraphMouseUp,
  onSetSelection,
  onAnnotationClick,
}: ReaderPanelProps) {
  return (
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

      <div className="document-scroll" ref={readerScrollRef}>
        {currentDocument ? (
          currentDocument.paragraphs.map((paragraph) => {
            const annotation = currentDocument.annotations.find(
              (item) => item.paragraphId === paragraph.id,
            )

            return (
              <ParagraphCard
                key={paragraph.id}
                paragraph={paragraph}
                annotation={annotation}
                isFocused={paragraph.id === currentParagraphId}
                refSetter={setParagraphRef(paragraph.id)}
                onClick={onParagraphClick}
                onMouseUp={onParagraphMouseUp}
                onSetSelection={onSetSelection}
                onAnnotationClick={onAnnotationClick}
              />
            )
          })
        ) : (
          <div className="empty-placeholder">
            <p>先导入 PDF 或网页文章，左侧显示原文，右侧显示总结与结构。</p>
          </div>
        )}
      </div>
    </section>
  )
}
