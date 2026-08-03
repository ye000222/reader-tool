interface ControlGridProps {
  webUrl: string
  setWebUrl: (value: string) => void
  onWebImport: (isBusy: boolean) => void
  onGenerateSummary: () => void
  onTranslateDocument: () => void
  onDeleteCurrent: () => void
  onViewAnnotations: () => void
  isBusy: boolean
}

export function ControlGrid({
  webUrl,
  setWebUrl,
  onWebImport,
  onGenerateSummary,
  onTranslateDocument,
  onDeleteCurrent,
  onViewAnnotations,
  isBusy,
}: ControlGridProps) {
  return (
    <section className="control-grid">
      <div className="card">
        <h2>网页导入</h2>
        <div className="input-row">
          <input
            value={webUrl}
            onChange={(event) => setWebUrl(event.target.value)}
            placeholder="输入网页地址，例如 https://example.com/article"
          />
          <button type="button" className="button" onClick={() => onWebImport(isBusy)} disabled={isBusy}>
            {isBusy ? '导入中...' : '导入网页'}
          </button>
        </div>
      </div>

      <div className="card compact">
        <h2>AI 操作</h2>
        <div className="action-row">
          <button type="button" className="button" onClick={onGenerateSummary} disabled={isBusy}>
            全文总结
          </button>
          <button type="button" className="button" onClick={onTranslateDocument} disabled={isBusy}>
            全文翻译
          </button>
        </div>
      </div>

      <div className="card compact">
        <h2>文档管理</h2>
        <div className="action-row">
          <button type="button" className="button secondary" onClick={onDeleteCurrent}>
            删除当前文档
          </button>
          <button type="button" className="button secondary" onClick={onViewAnnotations}>
            查看标注
          </button>
        </div>
      </div>
    </section>
  )
}
