import type { LocalFsAdapter } from './bridge'
import * as io from '../shell/io'

export const browserFsAdapter: LocalFsAdapter = {
  async openFile() {
    const result = await io.openFile()
    if (!result) return null
    return { name: result.name, content: result.content }
  },
  async saveFile(name, content) {
    const handle = await io.saveFile(null, content)
    return handle !== null
  },
}
