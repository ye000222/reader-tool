import type { ChangeEvent } from 'react'

interface TopBarProps {
  onPdfImport: (event: ChangeEvent<HTMLInputElement>) => void
  onImportData: () => void
  onExportData: () => void
}

export function TopBar({ onPdfImport, onImportData, onExportData }: TopBarProps) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">阅读工具</p>
        <h1>双栏 AI 阅读器</h1>
        <p className="subtle">
          支持 PDF / 网页导入、全文总结、结构提取、局部总结、全文翻译、同步定位、标注和本地保存
        </p>
      </div>
      <div className="topbar-actions">
        <label className="button secondary">
          导入 PDF
          <input type="file" accept="application/pdf" hidden onChange={onPdfImport} />
        </label>
        <button type="button" className="button secondary" onClick={onImportData}>
          导入数据
        </button>
        <button type="button" className="button secondary" onClick={onExportData}>
          导出数据
        </button>
      </div>
    </header>
  )
}
