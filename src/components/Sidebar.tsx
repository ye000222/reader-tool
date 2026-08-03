import { DocumentList } from './DocumentList'
import { ProviderEditor } from './ProviderEditor'
import type { AppSettings, ProviderConfig } from '../types'

interface SidebarProps {
  settings: AppSettings | null
  providerDraft: ProviderConfig | null
  setProviderDraft: (provider: ProviderConfig | null) => void
  onSaveProvider: () => void
  onBeginNewProvider: () => void
}

export function Sidebar({
  settings,
  providerDraft,
  setProviderDraft,
  onSaveProvider,
  onBeginNewProvider,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <DocumentList />
      <ProviderEditor
        settings={settings}
        providerDraft={providerDraft}
        setProviderDraft={setProviderDraft}
        onSaveProvider={onSaveProvider}
        onBeginNewProvider={onBeginNewProvider}
      />
    </aside>
  )
}
