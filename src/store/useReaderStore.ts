import { create } from 'zustand'

import type {
  AppSettings,
  ReaderDocument,
  SelectionTaskResult,
  SidePanelMode,
} from '../types'

interface ReaderState {
  documents: ReaderDocument[]
  currentDocumentId: string | null
  sidePanelMode: SidePanelMode
  currentParagraphId: string | null
  currentSummaryId: string | null
  selectionResult: SelectionTaskResult | null
  settings: AppSettings | null
  isBusy: boolean
  error: string
  setDocuments: (documents: ReaderDocument[]) => void
  setCurrentDocumentId: (documentId: string | null) => void
  upsertDocument: (document: ReaderDocument) => void
  setSidePanelMode: (mode: SidePanelMode) => void
  setCurrentParagraphId: (paragraphId: string | null) => void
  setCurrentSummaryId: (summaryId: string | null) => void
  setSelectionResult: (result: SelectionTaskResult | null) => void
  setSettings: (settings: AppSettings) => void
  setBusy: (busy: boolean) => void
  setError: (error: string) => void
}

export const useReaderStore = create<ReaderState>((set) => ({
  documents: [],
  currentDocumentId: null,
  sidePanelMode: 'summary',
  currentParagraphId: null,
  currentSummaryId: null,
  selectionResult: null,
  settings: null,
  isBusy: false,
  error: '',
  setDocuments: (documents) =>
    set({
      documents,
      currentDocumentId: documents[0]?.id || null,
    }),
  setCurrentDocumentId: (currentDocumentId) => set({ currentDocumentId }),
  upsertDocument: (document) =>
    set((state) => {
      const existing = state.documents.find((item) => item.id === document.id)
      const documents = existing
        ? state.documents.map((item) => (item.id === document.id ? document : item))
        : [document, ...state.documents]

      return {
        documents,
        currentDocumentId: document.id,
      }
    }),
  setSidePanelMode: (sidePanelMode) => set({ sidePanelMode }),
  setCurrentParagraphId: (currentParagraphId) => set({ currentParagraphId }),
  setCurrentSummaryId: (currentSummaryId) => set({ currentSummaryId }),
  setSelectionResult: (selectionResult) => set({ selectionResult }),
  setSettings: (settings) => set({ settings }),
  setBusy: (isBusy) => set({ isBusy }),
  setError: (error) => set({ error }),
}))
