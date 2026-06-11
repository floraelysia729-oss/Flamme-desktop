/** API Key 获取说明（与 Obsidian 插件设置一致） */
export interface ApiHelpEntry {
  id: string
  label: string
  description: string
  placeholder: string
  helpUrl: string
  helpLabel: string
}

export const API_HELP_ENTRIES: ApiHelpEntry[] = [
  {
    id: 'llm',
    label: '对话模型 API Key',
    description: '仅 DeepSeek（默认 api.deepseek.com）。千问 Key 填下方「向量嵌入」，不能填这里',
    placeholder: 'DeepSeek sk-...',
    helpUrl: 'https://platform.deepseek.com/api_keys',
    helpLabel: '如何获取 DeepSeek API Key',
  },
  {
    id: 'embed',
    label: '向量嵌入 API Key',
    description: '千问 / DashScope（sk- 开头的那串通常放这里）',
    placeholder: 'sk-...',
    helpUrl: 'https://bailian.console.aliyun.com/?apiKey=1#/api-key',
    helpLabel: '如何获取 DashScope API Key',
  },
  {
    id: 'brain',
    label: 'Brain API Key（可选）',
    description: '不填则复用对话模型 Key',
    placeholder: '留空则同对话模型',
    helpUrl: 'https://platform.deepseek.com/api_keys',
    helpLabel: '如何获取 Brain API Key',
  },
  {
    id: 'mineru',
    label: 'MinerU Token',
    description: 'PDF 精准解析（完整 JWT）',
    placeholder: 'eyJ0eXBlI...',
    helpUrl: 'https://mineru.net/apiManage/docs',
    helpLabel: '如何获取 MinerU Token',
  },
]
