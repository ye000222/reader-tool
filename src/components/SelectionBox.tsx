import type { SelectionAction } from '../types'

interface SelectionBoxProps {
  selectionText: string
  setSelectionText: (value: string) => void
  selectionParagraphId: string | null
  onSelectionAction: (action: SelectionAction) => void
}

export function SelectionBox({
  selectionText,
  setSelectionText,
  selectionParagraphId,
  onSelectionAction,
}: SelectionBoxProps) {
  return (
    <div className="selection-box">
      <textarea
        value={selectionText}
        onChange={(event) => setSelectionText(event.target.value)}
        placeholder="选中段落后可在这里做局部总结或局部翻译"
      />
      <div className="action-row">
        <button type="button" className="button secondary" onClick={() => onSelectionAction('summarize')}>
          局部总结
        </button>
        <button type="button" className="button secondary" onClick={() => onSelectionAction('translate')}>
          局部翻译
        </button>
      </div>
      {selectionParagraphId ? <p className="subtle">当前选区来自段落：{selectionParagraphId}</p> : null}
    </div>
  )
}
