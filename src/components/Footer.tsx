interface FooterProps {
  statusMessage: string
  error: string
}

export function Footer({ statusMessage, error }: FooterProps) {
  return (
    <footer className="footer-bar">
      <span>{statusMessage}</span>
      <span className={error ? 'error-text' : 'subtle'}>{error || '所有数据默认保存在本地 IndexedDB'}</span>
    </footer>
  )
}
