import { create } from 'zustand'

export interface EditorQuote {
  filePath: string
  fileName: string
  text: string
  lineFrom: number
  lineTo: number
  from: number
  to: number
}

interface EditorQuoteState {
  quote: EditorQuote | null
  setQuote: (quote: EditorQuote | null) => void
  clearQuote: (reason?: string) => void
}

function syncLearnScope(filePath: string) {
  const norm = filePath.replace(/\\/g, '/')
  void import('../chat/store').then(({ useChatStore }) => {
    const chat = useChatStore.getState()
    if (chat.mode !== 'learn') return
    if (!chat.selectedFiles.includes(norm)) {
      chat.toggleLearnFile(norm)
    }
  })
}

export const useEditorQuoteStore = create<EditorQuoteState>((set, get) => ({
  quote: null,

  setQuote: (quote) => {
    set({ quote })
    if (quote?.filePath) {
      syncLearnScope(quote.filePath)
    }
  },

  clearQuote: (reason = 'unknown') => {
    const prevQuote = get().quote
    set({ quote: null })
    void import('../editor/selectionQuote').then(
      ({ dismissEditorQuoteSelection, suppressQuoteResync }) => {
        if (reason === 'user-dismiss' || reason === 'send') {
          dismissEditorQuoteSelection()
        } else if (reason === 'new-session' || reason === 'session-change') {
          suppressQuoteResync(prevQuote)
        }
      },
    )
  },
}))
