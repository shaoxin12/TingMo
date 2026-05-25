// Provider registry — presets for all LLM and ASR cloud providers

export type LLMProviderKey = 'openai' | 'deepseek' | 'kimi' | 'minimax' | 'zhipu' | 'gemini' | 'ollama' | 'volcano';
export type ASRCloudProviderKey = 'openai' | 'volcano' | 'aliyun';

export interface LLMProviderPreset {
  key: LLMProviderKey;
  name: string;
  baseUrl: string;
  defaultModel: string;
  models: string[];
  authType: 'bearer' | 'apiKey' | 'none';
  color: string;
  initial: string;
}

export interface ASRCloudProviderPreset {
  key: ASRCloudProviderKey;
  name: string;
  endpoint: string;
  authType: 'bearer' | 'apiKey';
  color: string;
  initial: string;
}

export const LLM_PROVIDERS: LLMProviderPreset[] = [
  {
    key: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4.1-nano', 'gpt-4o', 'gpt-4.1', 'o4-mini'],
    authType: 'bearer', color: '#10A37F', initial: 'OA',
  },
  {
    key: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    authType: 'bearer', color: '#4D6BFE', initial: 'DS',
  },
  {
    key: 'kimi', name: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    authType: 'bearer', color: '#6B5CE7', initial: 'KI',
  },
  {
    key: 'minimax', name: 'MiniMax', baseUrl: 'https://api.minimax.chat/v1',
    defaultModel: 'abab6.5s-chat',
    models: ['abab6.5s-chat', 'abab7-chat-preview', 'MiniMax-Text-01'],
    authType: 'bearer', color: '#6C5DD3', initial: 'MM',
  },
  {
    key: 'zhipu', name: '智谱 AI', baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    models: ['glm-4-flash', 'glm-4-plus', 'glm-4', 'glm-4-air'],
    authType: 'bearer', color: '#3B82F6', initial: 'ZP',
  },
  {
    key: 'gemini', name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.0-flash',
    models: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'],
    authType: 'apiKey', color: '#4285F4', initial: 'GE',
  },
  {
    key: 'ollama', name: 'Ollama', baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3',
    models: ['llama3', 'llama3.1', 'mistral', 'qwen2.5', 'deepseek-r1'],
    authType: 'none', color: '#000000', initial: 'OL',
  },
  {
    key: 'volcano', name: '火山引擎', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: 'doubao-lite-32k',
    models: ['doubao-lite-32k', 'doubao-pro-32k', 'doubao-pro-128k', 'deepseek-r1-0528', 'deepseek-v3-0324'],
    authType: 'bearer', color: '#3370FF', initial: 'VH',
  },
];

export const ASR_CLOUD_PROVIDERS: ASRCloudProviderPreset[] = [
  {
    key: 'openai', name: 'OpenAI Whisper', endpoint: 'https://api.openai.com/v1',
    authType: 'bearer', color: '#10A37F', initial: 'OA',
  },
  {
    key: 'volcano', name: '火山引擎', endpoint: 'https://openspeech.bytedance.com/api/v3/auc/bigmodel',
    authType: 'apiKey', color: '#3370FF', initial: 'VH',
  },
  {
    key: 'aliyun', name: '阿里云百炼', endpoint: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
    authType: 'bearer', color: '#FF6A00', initial: 'AL',
  },
];

export function getLLMProvider(key: string): LLMProviderPreset | undefined {
  return LLM_PROVIDERS.find((p) => p.key === key);
}

export function getASRCloudProvider(key: string): ASRCloudProviderPreset | undefined {
  return ASR_CLOUD_PROVIDERS.find((p) => p.key === key);
}

export function getLLMModels(key: string): string[] {
  return getLLMProvider(key)?.models || [];
}
