import { markdown } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { yamlFrontmatter } from '@codemirror/lang-yaml'

const md = markdown({ codeLanguages: languages })
export const editorMarkdownLanguage = yamlFrontmatter({ content: md })
