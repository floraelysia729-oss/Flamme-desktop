import { Compartment } from '@codemirror/state'

/** 运行时切换 CM6 主题 / 语法高亮 */
export const editorThemeCompartment = new Compartment()
export const highlightCompartment = new Compartment()
