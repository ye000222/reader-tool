import { SelectionBox } from './SelectionBox'
import { SidePanelContent } from './SidePanelContent'
import { useReaderStore } from '../store/useReaderStore'
import { tabLabelMap } from '../lib/document-utils'
import type {
  ReaderDocument,
  SelectionAction,
  SelectionTaskResult,
  SidePanelMode,
} from '../types'
import type { SummaryProgressState, TranslationProgressState } from '../hooks/useAiActions'

interface SummaryPanelProps {
  currentDocument: ReaderDocument | null
  selectionText: string
  setSelectionText: (value: string) => void
  selectionParagraphId: string | null
  onSelectionAction: (action: SelectionAction) => void
  summaryProgress: SummaryProgressState | null
  translationProgress: TranslationProgressState | null
  selectionResult: SelectionTaskResult | null
  isBusy: boolean
  onSummaryClick: (summaryId: string, paragraphId?: string) => void
  onParagraphClick: (paragraphId: string, summaryId?: string) => void
  onGenerateSummary: () => void
  onTranslateDocument: () => void
}

export function SummaryPanel({
  currentDocument,
  selectionText,
  setSelectionText,
  selectionParagraphId,
  onSelectionAction,
  summaryProgress,
  translationProgress,
  selectionResult,
  isBusy,
  onSummaryClick,
  onParagraphClick,
  onGenerateSummary,
  onTranslateDocument,
}: SummaryPanelProps) {
  const { sidePanelMode, setSidePanelMode, currentParagraphId, currentSummaryId } = useReaderStore()

  return (
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

      <SelectionBox
        selectionText={selectionText}
        setSelectionText={setSelectionText}
        selectionParagraphId={selectionParagraphId}
        onSelectionAction={onSelectionAction}
      />

      <div className="document-scroll">
        <SidePanelContent
          mode={sidePanelMode}
          currentDocument={currentDocument}
          selectionResult={selectionResult}
          summaryProgress={summaryProgress}
          translationProgress={translationProgress}
          currentParagraphId={currentParagraphId}
          currentSummaryId={currentSummaryId}
          isBusy={isBusy}
          onSummaryClick={onSummaryClick}
          onParagraphClick={onParagraphClick}
          onGenerateSummary={onGenerateSummary}
          onTranslateDocument={onTranslateDocument}
        />
      </div>
    </section>
  )
}
