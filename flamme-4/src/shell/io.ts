/* File System Access API types */
declare function showOpenFilePicker(options?: any): Promise<FileSystemFileHandle[]>
declare function showSaveFilePicker(options?: any): Promise<FileSystemFileHandle>

export interface OpenResult {
  handle: FileSystemFileHandle
  name: string
  content: string
}

export async function openFile(): Promise<OpenResult | null> {
  if (!('showOpenFilePicker' in window)) return null

  try {
    const [handle] = await showOpenFilePicker({
      types: [{ accept: { 'text/markdown': ['.md', '.markdown'], 'text/plain': ['.txt'] } }],
    })
    const file = await handle.getFile()
    return { handle, name: file.name, content: await file.text() }
  } catch {
    return null // user cancelled
  }
}

export async function saveFile(
  handle: FileSystemFileHandle | null,
  content: string,
): Promise<FileSystemFileHandle | null> {
  if (!('showSaveFilePicker' in window)) return null

  let fileHandle = handle
  if (!fileHandle) {
    try {
      fileHandle = await showSaveFilePicker({
        suggestedName: 'untitled.md',
        types: [{ accept: { 'text/markdown': ['.md'] } }],
      })
    } catch {
      return null // user cancelled
    }
  }

  const writable = await fileHandle.createWritable()
  await writable.write(content)
  await writable.close()
  return fileHandle
}

export async function loadDefault(): Promise<string> {
  try {
    const res = await fetch('/sample.md')
    if (res.ok) return await res.text()
  } catch { /* fall through */ }
  return '# Welcome to Flamme\n\nStart writing...'
}
