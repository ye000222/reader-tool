import { useEffect, useState } from 'react'

import type { AnnotationRecord } from '../types'

export type AnnotationColor = 'yellow' | 'green' | 'pink'

const ANNOTATION_COLORS: Array<{ value: AnnotationColor; label: string }> = [
  { value: 'yellow', label: '黄色' },
  { value: 'green', label: '绿色' },
  { value: 'pink', label: '粉色' },
]

interface AnnotationDialogProps {
  annotation: AnnotationRecord | null
  onClose: () => void
  onSave: (content: string, color: AnnotationColor) => void
  onDelete?: (annotationId: string) => void
}

export function AnnotationDialog({
  annotation,
  onClose,
  onSave,
  onDelete,
}: AnnotationDialogProps) {
  const [content, setContent] = useState(annotation?.content || '')
  const [color, setColor] = useState<AnnotationColor>(annotation?.color || 'yellow')
  const isEditing = Boolean(annotation)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleSave = () => {
    if (!content.trim()) {
      return
    }

    onSave(content.trim(), color)
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={isEditing ? '编辑标注' : '添加标注'}
        onClick={(event) => event.stopPropagation()}
      >
        <h2>{isEditing ? '编辑标注' : '添加标注'}</h2>
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="输入标注内容"
          autoFocus
        />
        <div className="color-swatches" aria-label="标注颜色">
          {ANNOTATION_COLORS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`color-swatch ${option.value} ${color === option.value ? 'selected' : ''}`}
              aria-label={option.label}
              aria-pressed={color === option.value}
              onClick={() => setColor(option.value)}
            />
          ))}
        </div>
        <div className="modal-actions">
          {isEditing && annotation && onDelete ? (
            <button
              type="button"
              className="button danger"
              onClick={() => onDelete(annotation.id)}
            >
              删除
            </button>
          ) : (
            <span />
          )}
          <div className="action-row">
            <button type="button" className="button secondary" onClick={onClose}>
              取消
            </button>
            <button
              type="button"
              className="button"
              onClick={handleSave}
              disabled={!content.trim()}
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
