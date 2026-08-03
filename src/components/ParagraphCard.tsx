import type { MouseEvent as ReactMouseEvent } from 'react'

import type { AnnotationRecord, Paragraph } from '../types'

interface ParagraphCardProps {
  paragraph: Paragraph
  annotation: AnnotationRecord | undefined
  isFocused: boolean
  refSetter: (node: HTMLDivElement | null) => void
  onClick: (event: ReactMouseEvent<HTMLDivElement>, paragraphId: string, summaryId?: string) => void
  onMouseUp: (event: ReactMouseEvent<HTMLDivElement>, paragraphId: string) => void
  onSetSelection: (paragraphId: string, text: string) => void
  onAnnotationClick: (paragraphId: string) => void
}

export function ParagraphCard({
  paragraph,
  annotation,
  isFocused,
  refSetter,
  onClick,
  onMouseUp,
  onSetSelection,
  onAnnotationClick,
}: ParagraphCardProps) {
  const relatedSummaryId = paragraph.summaryIds[0]

  return (
    <div
      ref={refSetter}
      className={`paragraph-card ${isFocused ? 'focused' : ''} ${
        annotation ? `marked marked-${annotation.color}` : ''
      }`}
    >
      <div
        className="paragraph-main"
        onClick={(event) => onClick(event, paragraph.id, relatedSummaryId)}
        onMouseUp={(event) => onMouseUp(event, paragraph.id)}
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
          onClick={() => onSetSelection(paragraph.id, paragraph.text)}
        >
          设为选区
        </button>
        <button
          type="button"
          className="mini-button"
          onClick={() => onAnnotationClick(paragraph.id)}
        >
          {annotation ? '编辑标注' : '划重点'}
        </button>
      </div>
    </div>
  )
}
