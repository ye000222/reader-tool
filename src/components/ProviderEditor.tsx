import { useMemo } from 'react'

import type { AppSettings, ProviderConfig } from '../types'

interface ProviderEditorProps {
  settings: AppSettings | null
  providerDraft: ProviderConfig | null
  setProviderDraft: (provider: ProviderConfig | null) => void
  onSaveProvider: () => void
  onBeginNewProvider: () => void
}

export function ProviderEditor({
  settings,
  providerDraft,
  setProviderDraft,
  onSaveProvider,
  onBeginNewProvider,
}: ProviderEditorProps) {
  const runtimeProvider = useMemo(() => {
    if (!settings) {
      return null
    }

    const active =
      settings.providers.find((provider) => provider.id === settings.activeProviderId) ||
      settings.providers[0] ||
      null

    return active
  }, [settings])

  const draftProvider = providerDraft || runtimeProvider

  return (
    <div className="card provider-card">
      <div className="panel-title-row">
        <h2>AI 提供商</h2>
        <button type="button" className="text-button" onClick={onBeginNewProvider}>
          新增
        </button>
      </div>

      <select
        value={providerDraft?.id || ''}
        onChange={(event) => {
          const next =
            settings?.providers.find((provider) => provider.id === event.target.value) || null
          setProviderDraft(next)
        }}
      >
        {(settings?.providers || []).map((provider) => (
          <option key={provider.id} value={provider.id}>
            {provider.name}
          </option>
        ))}
      </select>

      {providerDraft ? (
        <div className="provider-form">
          <input
            value={providerDraft.name}
            onChange={(event) =>
              setProviderDraft({
                ...providerDraft,
                name: event.target.value,
              })
            }
            placeholder="配置名称"
          />
          <input
            value={providerDraft.baseUrl}
            onChange={(event) =>
              setProviderDraft({
                ...providerDraft,
                baseUrl: event.target.value,
              })
            }
            placeholder="Base URL"
          />
          <input
            value={providerDraft.model}
            onChange={(event) =>
              setProviderDraft({
                ...providerDraft,
                model: event.target.value,
              })
            }
            placeholder="模型名"
          />
          <input
            value={providerDraft.apiKey}
            onChange={(event) =>
              setProviderDraft({
                ...providerDraft,
                apiKey: event.target.value,
              })
            }
            placeholder="API Key"
          />
          <p className="subtle">
            {draftProvider?.apiKey?.trim()
              ? `当前 AI：${draftProvider.name} / ${draftProvider.model}`
              : '请填写 Base URL、模型名、API Key，并点击“保存配置”。'}
          </p>
          <button type="button" className="button secondary" onClick={onSaveProvider}>
            保存配置
          </button>
        </div>
      ) : null}
    </div>
  )
}
