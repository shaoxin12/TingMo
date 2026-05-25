// Provider registry — presets for all LLM and ASR cloud providers

export type LLMProviderKey = 'openai' | 'deepseek' | 'kimi' | 'minimax' | 'zhipu' | 'gemini' | 'ollama' | 'volcano';
export type ASRCloudProviderKey = 'openai' | 'volcano' | 'aliyun';

export interface ModelOption {
  value: string;
  label: string;
}

export interface LLMProviderPreset {
  key: LLMProviderKey;
  name: string;
  baseUrl: string;
  defaultModel: string;
  models: ModelOption[];
  authType: 'bearer' | 'apiKey' | 'none';
  color: string;
  initial: string;
}

export interface ASRCloudProviderPreset {
  key: ASRCloudProviderKey;
  name: string;
  endpoint: string;
  authType: 'bearer' | 'apiKey';
  defaultModel: string;
  models: ModelOption[];
  color: string;
  initial: string;
}

export const LLM_PROVIDERS: LLMProviderPreset[] = [
  {
    key: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: [
      { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
      { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'gpt-4.1', label: 'GPT-4.1' },
      { value: 'o4-mini', label: 'o4-mini' },
    ],
    authType: 'bearer', color: '#10A37F', initial: 'OA',
  },
  {
    key: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    models: [
      { value: 'deepseek-chat', label: 'DeepSeek V3' },
      { value: 'deepseek-reasoner', label: 'DeepSeek R1' },
    ],
    authType: 'bearer', color: '#4D6BFE', initial: 'DS',
  },
  {
    key: 'kimi', name: 'Kimi (月之暗面)', baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    models: [
      { value: 'moonshot-v1-8k', label: 'Moonshot v1 8K' },
      { value: 'moonshot-v1-32k', label: 'Moonshot v1 32K' },
      { value: 'moonshot-v1-128k', label: 'Moonshot v1 128K' },
    ],
    authType: 'bearer', color: '#6B5CE7', initial: 'KI',
  },
  {
    key: 'minimax', name: 'MiniMax', baseUrl: 'https://api.minimax.chat/v1',
    defaultModel: 'abab6.5s-chat',
    models: [
      { value: 'abab6.5s-chat', label: 'ABAB 6.5s' },
      { value: 'abab7-chat-preview', label: 'ABAB 7 (Preview)' },
      { value: 'MiniMax-Text-01', label: 'MiniMax Text 01' },
    ],
    authType: 'bearer', color: '#6C5DD3', initial: 'MM',
  },
  {
    key: 'zhipu', name: '智谱 AI', baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    models: [
      { value: 'glm-4-flash', label: 'GLM-4 Flash (免费)' },
      { value: 'glm-4-plus', label: 'GLM-4 Plus' },
      { value: 'glm-4-air', label: 'GLM-4 Air' },
      { value: 'glm-4', label: 'GLM-4' },
    ],
    authType: 'bearer', color: '#3B82F6', initial: 'ZP',
  },
  {
    key: 'gemini', name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.0-flash',
    models: [
      { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    ],
    authType: 'apiKey', color: '#4285F4', initial: 'GE',
  },
  {
    key: 'ollama', name: 'Ollama', baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3',
    models: [
      { value: 'llama3', label: 'Llama 3' },
      { value: 'llama3.1', label: 'Llama 3.1' },
      { value: 'mistral', label: 'Mistral' },
      { value: 'qwen2.5', label: 'Qwen 2.5' },
      { value: 'deepseek-r1', label: 'DeepSeek R1' },
    ],
    authType: 'none', color: '#000000', initial: 'OL',
  },
  {
    key: 'volcano', name: '火山引擎', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: 'doubao-lite-32k',
    models: [
      { value: 'doubao-lite-32k', label: '豆包 Lite 32K' },
      { value: 'doubao-pro-32k', label: '豆包 Pro 32K' },
      { value: 'doubao-pro-128k', label: '豆包 Pro 128K' },
      { value: 'deepseek-r1-0528', label: 'DeepSeek R1' },
      { value: 'deepseek-v3-0324', label: 'DeepSeek V3' },
    ],
    authType: 'bearer', color: '#3370FF', initial: 'VH',
  },
];

export const ASR_CLOUD_PROVIDERS: ASRCloudProviderPreset[] = [
  {
    key: 'openai', name: 'OpenAI Whisper', endpoint: 'https://api.openai.com/v1',
    defaultModel: 'whisper-1',
    models: [
      { value: 'whisper-1', label: 'Whisper v1' },
    ],
    authType: 'bearer', color: '#10A37F', initial: 'OA',
  },
  {
    key: 'volcano', name: '火山引擎', endpoint: 'https://openspeech.bytedance.com/api/v3/auc/bigmodel',
    defaultModel: 'bigmodel',
    models: [
      { value: 'bigmodel', label: '豆包流式语音识别 2.0 小时版' },
    ],
    authType: 'apiKey', color: '#3370FF', initial: 'VH',
  },
  {
    key: 'aliyun', name: '阿里云百炼', endpoint: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
    defaultModel: 'fun-asr-realtime',
    models: [
      { value: 'fun-asr-realtime', label: 'Fun-ASR' },
      { value: 'qwen3-asr-flash-realtime', label: 'Qwen3-ASR-Flash' },
    ],
    authType: 'bearer', color: '#FF6A00', initial: 'AL',
  },
];

export function getLLMProvider(key: string): LLMProviderPreset | undefined {
  return LLM_PROVIDERS.find((p) => p.key === key);
}

export function getASRCloudProvider(key: string): ASRCloudProviderPreset | undefined {
  return ASR_CLOUD_PROVIDERS.find((p) => p.key === key);
}

export function getLLMModels(key: string): ModelOption[] {
  return getLLMProvider(key)?.models || [];
}

export function getASRModels(key: string): ModelOption[] {
  return getASRCloudProvider(key)?.models || [];
}
