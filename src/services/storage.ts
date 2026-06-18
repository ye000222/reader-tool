import { openDB } from 'idb'

import type { AppSettings, ReaderDocument } from '../types'

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

export async function loadSettings() {
  const database = await dbPromise
  const settings = (await database.get(SETTINGS_STORE, SETTINGS_KEY)) as AppSettings | undefined
  return settings || defaultSettings
}

export async function saveSettings(settings: AppSettings) {
  const database = await dbPromise
  await database.put(SETTINGS_STORE, settings, SETTINGS_KEY)
}
