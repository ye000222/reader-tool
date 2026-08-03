import { openDB } from 'idb'

import type { AppSettings, ProviderConfig, ReaderDocument } from '../types'

const DB_NAME = 'reader-tool-db'
const DB_VERSION = 1
const DOCUMENT_STORE = 'documents'
const SETTINGS_STORE = 'settings'
const SETTINGS_KEY = 'app-settings'

const defaultSettings: AppSettings = {
  providers: [
    {
      id: 'default-provider',
      name: '默认 OpenAI 兼容接口',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-4o-mini',
      enabled: true,
    },
  ],
  activeProviderId: 'default-provider',
}

const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(database) {
    if (!database.objectStoreNames.contains(DOCUMENT_STORE)) {
      database.createObjectStore(DOCUMENT_STORE, { keyPath: 'id' })
    }

    if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
      database.createObjectStore(SETTINGS_STORE)
    }
  },
})

export async function getDocuments() {
  const database = await dbPromise
  return database.getAll(DOCUMENT_STORE) as Promise<ReaderDocument[]>
}

export async function saveDocument(document: ReaderDocument) {
  const database = await dbPromise
  await database.put(DOCUMENT_STORE, document)
}

export async function saveDocuments(documents: ReaderDocument[]) {
  const database = await dbPromise
  const tx = database.transaction(DOCUMENT_STORE, 'readwrite')

  await Promise.all(documents.map((document) => tx.store.put(document)))
  await tx.done
}

export async function replaceDocuments(documents: ReaderDocument[]) {
  const database = await dbPromise
  const tx = database.transaction(DOCUMENT_STORE, 'readwrite')

  await tx.store.clear()
  await Promise.all(documents.map((document) => tx.store.put(document)))
  await tx.done
}

export async function deleteDocument(documentId: string) {
  const database = await dbPromise
  await database.delete(DOCUMENT_STORE, documentId)
}

const CIPHER_PREFIX = 'enc:'

async function encryptApiKeys(providers: ProviderConfig[]) {
  const api = window.desktopApi
  if (!api) {
    return providers
  }

  return Promise.all(
    providers.map(async (provider) => {
      if (!provider.apiKey || provider.apiKey.startsWith(CIPHER_PREFIX)) {
        return provider
      }

      const encrypted = await api.encryptSecret(provider.apiKey)
      return { ...provider, apiKey: encrypted }
    }),
  )
}

async function decryptApiKeys(providers: ProviderConfig[]) {
  const api = window.desktopApi
  if (!api) {
    return providers
  }

  return Promise.all(
    providers.map(async (provider) => {
      if (!provider.apiKey.startsWith(CIPHER_PREFIX)) {
        return provider
      }

      const decrypted = await api.decryptSecret(provider.apiKey)
      return { ...provider, apiKey: decrypted }
    }),
  )
}

function hasPlaintextApiKeys(providers: ProviderConfig[]) {
  return providers.some(
    (provider) => provider.apiKey && !provider.apiKey.startsWith(CIPHER_PREFIX),
  )
}

export async function loadSettings() {
  const database = await dbPromise
  const stored = (await database.get(SETTINGS_STORE, SETTINGS_KEY)) as AppSettings | undefined
  const settings = stored || defaultSettings

  const decryptedProviders = await decryptApiKeys(settings.providers)
  const result = { ...settings, providers: decryptedProviders }

  // Migrate historical plaintext apiKeys to encrypted form on first load.
  if (window.desktopApi && hasPlaintextApiKeys(settings.providers)) {
    await saveSettings(result)
  }

  return result
}

export async function saveSettings(settings: AppSettings) {
  const database = await dbPromise
  const encryptedProviders = await encryptApiKeys(settings.providers)
  await database.put(SETTINGS_STORE, { ...settings, providers: encryptedProviders }, SETTINGS_KEY)
}
