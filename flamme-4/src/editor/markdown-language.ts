import { markdown } from '@codemirror/lang-markdown'
import { yamlFrontmatter } from '@codemirror/lang-yaml'

const md = markdown()
export const editorMarkdownLanguage = yamlFrontmatter({ content: md })
