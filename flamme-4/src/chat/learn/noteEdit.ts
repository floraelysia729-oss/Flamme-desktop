import type { LearnNote, LearnSectionId } from './types'

export function updateSection(
  note: LearnNote,
  id: LearnSectionId,
  content: string,
): LearnNote {
  return {
    ...note,
    sections: note.sections.map((s) => (s.id === id ? { ...s, content } : s)),
    version: note.version + 1,
    updatedAt: new Date().toISOString(),
  }
}

export function toggleSectionLock(note: LearnNote, id: LearnSectionId): LearnNote {
  return {
    ...note,
    sections: note.sections.map((s) =>
      s.id === id ? { ...s, locked: !s.locked } : s,
    ),
    version: note.version + 1,
    updatedAt: new Date().toISOString(),
  }
}

export function setRootTopic(note: LearnNote, topic: string): LearnNote {
  return {
    ...note,
    rootTopic: topic,
    version: note.version + 1,
    updatedAt: new Date().toISOString(),
  }
}
