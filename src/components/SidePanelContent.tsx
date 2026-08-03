import { hasGeneratedSummary, hasGeneratedTranslation } from '../lib/document-utils'
import type {
  ReaderDocument,
  SelectionTaskResult,
  SidePanelMode,
} from '../types'
import type { SummaryProgressState, TranslationProgressState } from '../hooks/useAiActions'

interface SidePanelContentProps {
  mode: SidePanelMode
  currentDocument: ReaderDocument | null
  selectionResult: SelectionTaskResult | null
  summaryProgress: SummaryProgressState | null
  translationProgress: TranslationProgressState | null
  currentParagraphId: string | null
  currentSummaryId: string | null
  isBusy: boolean
  onSummaryClick: (summaryId: string, paragraphId?: string) => void
  onParagraphClick: (paragraphId: string, summaryId?: string) => void
  onGenerateSummary: () => void
  onTranslateDocument: () => void
  onCancel: () => void
  onAnnotationEdit: (paragraphId: string) => void
}

export function SidePanelContent({
  mode,
  currentDocument,
  selectionResult,
  summaryProgress,
  translationProgress,
  currentParagraphId,
  currentSummaryId,
  isBusy,
  onSummaryClick,
  onParagraphClick,
  onGenerateSummary,
  onTranslateDocument,
  onCancel,
  onAnnotationEdit,
}: SidePanelContentProps) {
  if (!currentDocument) {
    return <div className="empty-placeholder">右侧结果将在导入文档后显示。</div>
  }

  if (mode === 'summary') {
    const summaryGenerated = hasGeneratedSummary(currentDocument)

    if (!summaryGenerated && !summaryProgress) {
      return (
        <div className="result-card empty-result-card">
          <span className="tag">全文总结结果</span>
          <p>当前还没有生成全文总结。右侧页签只负责切换视图，不会自动调用 AI。</p>
          <div className="action-row">
            <button type="button" className="button" onClick={() => void onGenerateSummary()} disabled={isBusy}>
              {isBusy ? '生成中...' : '立即生成全文总结'}
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="stack">
        {summaryProgress ? (
          <div className="result-card summary-progress-card">
            <div className="panel-title-row">
              <strong>正在生成全文总结</strong>
              <span className="tag">
                {summaryProgress.stage === 'chunk_summary'
                  ? `${summaryProgress.completedChunks ?? 0}/${summaryProgress.totalChunks ?? '?'} 块`
                  : '汇总中'}
              </span>
            </div>
            <p>{summaryProgress.message}</p>
            <div className="progress-track" aria-hidden="true">
              <div className="progress-fill indeterminate" />
            </div>
            <div className="action-row">
              <button type="button" className="button danger" onClick={onCancel}>
                取消
              </button>
            </div>
          </div>
        ) : null}
        <div className="result-card">
          <span className="tag">全文概览</span>
          <p>{currentDocument.overview}</p>
        </div>
        {currentDocument.summaryBlocks.map((block) => (
          <button
            key={block.id}
            type="button"
            className={`result-card interactive ${block.id === currentSummaryId ? 'focused' : ''}`}
            onClick={() => onSummaryClick(block.id, block.paragraphIds[0])}
          >
            <div className="panel-title-row">
              <strong>{block.title}</strong>
              <span className="tag">{block.paragraphIds.length} 段</span>
            </div>
            <p>{block.summary}</p>
            <div className="quoted-source">
              <strong>对应原文</strong>
              <p>{block.originalText}</p>
            </div>
          </button>
        ))}
      </div>
    )
  }

  if (mode === 'structure') {
    return (
      <div className="stack">
        {currentDocument.structure.map((node) => (
          <div key={node.id} className="result-card">
            <div className="panel-title-row">
              <strong>{node.title}</strong>
              <span className="tag">{node.paragraphIds.length} 段</span>
            </div>
            <div className="chip-row">
              {node.paragraphIds.map((paragraphId) => (
                <button
                  key={paragraphId}
                  type="button"
                  className={`chip ${paragraphId === currentParagraphId ? 'active' : ''}`}
                  onClick={() => onParagraphClick(paragraphId)}
                >
                  {paragraphId.slice(0, 8)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (mode === 'translation') {
    const translationGenerated = hasGeneratedTranslation(currentDocument)
    const progressPercent =
      translationProgress && translationProgress.totalParagraphs > 0
        ? Math.round((translationProgress.completedParagraphs / translationProgress.totalParagraphs) * 100)
        : 0

    if (!translationGenerated && !translationProgress) {
      return (
        <div className="result-card empty-result-card">
          <span className="tag">全文翻译结果</span>
          <p>当前还没有生成全文翻译。右侧页签只负责切换视图，不会自动调用 AI。</p>
          <div className="action-row">
            <button
              type="button"
              className="button"
              onClick={() => void onTranslateDocument()}
              disabled={isBusy}
            >
              {isBusy ? '生成中...' : '立即生成全文翻译'}
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="stack">
        {translationProgress ? (
          <div className="result-card translation-progress-card">
            <div className="panel-title-row">
              <strong>正在生成全文翻译</strong>
              <span className="tag">{progressPercent}%</span>
            </div>
            <p>
              已完成 {translationProgress.completedBatches}/{translationProgress.totalBatches || '?'} 批，
              {translationProgress.completedParagraphs}/{translationProgress.totalParagraphs} 段
            </p>
            <div className="progress-track" aria-hidden="true">
              <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="action-row">
              <button type="button" className="button danger" onClick={onCancel}>
                取消
              </button>
            </div>
          </div>
        ) : null}
        {currentDocument.paragraphs.map((paragraph) => (
          <div key={paragraph.id} className="result-card">
            <strong>原文</strong>
            <p>{paragraph.text}</p>
            <strong>中文翻译</strong>
            <p>{paragraph.translation || '尚未生成全文翻译。'}</p>
          </div>
        ))}
      </div>
    )
  }

  if (mode === 'selection') {
    return selectionResult ? (
      <div className="result-card">
        <span className="tag">{selectionResult.action === 'summarize' ? '局部总结' : '局部翻译'}</span>
        <strong>原文</strong>
        <p>{selectionResult.input}</p>
        <strong>结果</strong>
        <p>{selectionResult.output}</p>
      </div>
    ) : (
      <div className="empty-placeholder">先在左侧选取段落或粘贴文本，再执行局部总结或局部翻译。</div>
    )
  }

  return currentDocument.annotations.length > 0 ? (
    <div className="stack">
      {currentDocument.annotations.map((annotation) => (
        <div
          key={annotation.id}
          className={`result-card interactive marked marked-${annotation.color}`}
          onClick={() => onParagraphClick(annotation.paragraphId)}
        >
          <div className="panel-title-row">
            <strong>{annotation.content}</strong>
            <span className="tag">{new Date(annotation.createdAt).toLocaleString()}</span>
          </div>
          <p>对应段落：{annotation.paragraphId}</p>
          <div className="action-row">
            <button
              type="button"
              className="mini-button"
              onClick={(event) => {
                event.stopPropagation()
                onAnnotationEdit(annotation.paragraphId)
              }}
            >
              编辑
            </button>
          </div>
        </div>
      ))}
    </div>
  ) : (
    <div className="empty-placeholder">当前文档还没有标注。</div>
  )
}
