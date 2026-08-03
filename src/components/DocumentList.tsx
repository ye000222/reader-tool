import { useReaderStore } from '../store/useReaderStore'

export function DocumentList() {
  const { documents, currentDocumentId, setCurrentDocumentId } = useReaderStore()

  return (
    <div className="card sidebar-list">
      <div className="panel-title-row">
        <h2>本地文档</h2>
        <span className="counter-badge">{documents.length}</span>
      </div>
      <div className="doc-list">
        {documents.map((document) => (
          <button
            key={document.id}
            type="button"
            className={`doc-item ${document.id === currentDocumentId ? 'active' : ''}`}
            onClick={() => setCurrentDocumentId(document.id)}
          >
            <strong>{document.title}</strong>
            <span>{document.sourceType === 'pdf' ? 'PDF' : '网页'}</span>
          </button>
        ))}
        {documents.length === 0 ? <p className="empty-state">还没有导入文档。</p> : null}
      </div>
    </div>
  )
}
