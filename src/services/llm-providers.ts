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
  defaultModel: string;
  models: string[];
  color: string;
  initial: string;
}

export const LLM_PROVIDERS: LLMProviderPreset[] = [
  {
    key: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4.1-nano', 'gpt-4.1-mini', 'o4-mini', 'o3-mini', 'gpt-5.1', 'gpt-5.2'],
    authType: 'bearer', color: '#10A37F', initial: 'OA',
  },
  {
    key: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-v4-flash',
    models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    authType: 'bearer', color: '#4D6BFE', initial: 'DS',
  },
  {
    key: 'kimi', name: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k', 'kimi-k2-instruct', 'kimi-k2.5', 'kimi-k2.6'],
    authType: 'bearer', color: '#6B5CE7', initial: 'KI',
  },
  {
    key: 'minimax', name: 'MiniMax', baseUrl: 'https://api.minimax.chat/v1',
    defaultModel: 'MiniMax-M2.5',
    models: ['MiniMax-M2.5', 'MiniMax-M2.7', 'MiniMax-M3', 'MiniMax-M2.1', 'MiniMax-M2', 'MiniMax-Text-01'],
    authType: 'bearer', color: '#6C5DD3', initial: 'MM',
  },
  {
    key: 'zhipu', name: '智谱 AI', baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    models: ['glm-4-flash', 'GLM-4.7-Flash', 'GLM-4.7', 'GLM-5', 'GLM-5.1', 'GLM-5.2'],
    authType: 'bearer', color: '#3B82F6', initial: 'ZP',
  },
  {
    key: 'gemini', name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.1-pro-preview'],
    authType: 'apiKey', color: '#4285F4', initial: 'GE',
  },
  {
    key: 'ollama', name: 'Ollama', baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.2',
    models: ['llama3.2', 'llama3.3', 'qwen3', 'qwen2.5', 'mistral', 'phi4', 'gemma3', 'deepseek-r1'],
    authType: 'none', color: '#000000', initial: 'OL',
  },
  {
    key: 'volcano', name: '火山引擎', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: 'doubao-seed-2.1-turbo',
    models: ['doubao-seed-2.1-turbo', 'doubao-seed-2.1-pro', 'doubao-seed-2.0-lite', 'doubao-seed-2.0-pro', 'doubao-seed-2.0-code', 'doubao-seed-2.0-mini', 'doubao-seed-1.6-flash', 'deepseek-v4-flash', 'deepseek-r1-0528'],
    authType: 'bearer', color: '#3370FF', initial: 'VH',
  },
];

export const ASR_CLOUD_PROVIDERS: ASRCloudProviderPreset[] = [
  {
    key: 'openai', name: 'OpenAI Whisper', endpoint: 'https://api.openai.com/v1',
    defaultModel: 'whisper-1',
    models: ['whisper-1', 'whisper-large-v3', 'whisper-large-v3-turbo'],
    authType: 'bearer', color: '#10A37F', initial: 'OA',
  },
  {
    key: 'volcano', name: '火山引擎', endpoint: 'https://openspeech.bytedance.com/api/v3/sauc/bigmodel',
    defaultModel: 'doubao-seed-asr-2.0',
    models: ['doubao-seed-asr-2.0', 'bigmodel'],
    authType: 'apiKey', color: '#3370FF', initial: 'VH',
  },
  {
    key: 'aliyun', name: '阿里云百炼', endpoint: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
    defaultModel: 'fun-asr-realtime',
    models: ['fun-asr-realtime', 'qwen3-asr-flash-realtime', 'qwen3.5-omni-plus-realtime', 'fun-asr-flash'],
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

export function getASRModels(key: string): string[] {
  return getASRCloudProvider(key)?.models || [];
}

const MODEL_LABELS: Record<string, string> = {
  // ASR
  'whisper-1': 'Whisper v1',
  'whisper-large-v3': 'Whisper Large v3',
  'whisper-large-v3-turbo': 'Whisper Large v3 Turbo',
  'bigmodel': '豆包流式语音识别 1.0',
  'doubao-seed-asr-2.0': '豆包流式语音识别 2.0',
  'fun-asr-realtime': 'Fun-ASR 实时',
  'qwen3-asr-flash-realtime': 'Qwen3-ASR-Flash 实时',
  'qwen3.5-omni-plus-realtime': 'Qwen3.5-Omni-Plus 实时',
  'fun-asr-flash': 'Fun-ASR Flash（非实时）',
  // LLM — OpenAI
  'gpt-4o-mini': 'GPT-4o mini',
  'gpt-4.1-nano': 'GPT-4.1 Nano',
  'gpt-4.1-mini': 'GPT-4.1 Mini',
  'o4-mini': 'o4-mini',
  'o3-mini': 'o3-mini',
  'gpt-5.1': 'GPT-5.1',
  'gpt-5.2': 'GPT-5.2',
  // LLM — DeepSeek
  'deepseek-v4-flash': 'DeepSeek V4 Flash',
  'deepseek-v4-pro': 'DeepSeek V4 Pro',
  // LLM — Kimi
  'moonshot-v1-8k': 'Moonshot v1 8K',
  'moonshot-v1-32k': 'Moonshot v1 32K',
  'moonshot-v1-128k': 'Moonshot v1 128K',
  'kimi-k2-instruct': 'Kimi K2 Instruct',
  'kimi-k2.5': 'Kimi K2.5',
  'kimi-k2.6': 'Kimi K2.6',
  // LLM — MiniMax
  'MiniMax-M2.5': 'MiniMax M2.5',
  'MiniMax-M2.7': 'MiniMax M2.7',
  'MiniMax-M3': 'MiniMax M3',
  'MiniMax-M2.1': 'MiniMax M2.1',
  'MiniMax-M2': 'MiniMax M2',
  'MiniMax-Text-01': 'MiniMax Text-01',
  // LLM — 智谱 AI
  'glm-4-flash': 'GLM-4 Flash（免费）',
  'GLM-4.7-Flash': 'GLM-4.7 Flash（免费）',
  'GLM-4.7': 'GLM-4.7',
  'GLM-5': 'GLM-5',
  'GLM-5.1': 'GLM-5.1',
  'GLM-5.2': 'GLM-5.2',
  // LLM — Gemini
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
  'gemini-3.5-flash': 'Gemini 3.5 Flash',
  'gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite',
  'gemini-3.1-pro-preview': 'Gemini 3.1 Pro Preview',
  // LLM — Ollama
  'llama3': 'Llama 3',
  'llama3.1': 'Llama 3.1',
  'llama3.2': 'Llama 3.2',
  'llama3.3': 'Llama 3.3',
  'qwen3': 'Qwen 3',
  'phi4': 'Phi-4',
  'gemma3': 'Gemma 3',
  // LLM — 火山引擎
  'doubao-seed-2.1-turbo': '豆包 Seed 2.1 Turbo',
  'doubao-seed-2.1-pro': '豆包 Seed 2.1 Pro',
  'doubao-seed-2.0-lite': '豆包 Seed 2.0 Lite',
  'doubao-seed-2.0-pro': '豆包 Seed 2.0 Pro',
  'doubao-seed-2.0-code': '豆包 Seed 2.0 Code',
  'doubao-seed-2.0-mini': '豆包 Seed 2.0 Mini',
  'doubao-seed-1.6-flash': '豆包 Seed 1.6 Flash',
  'deepseek-r1-0528': 'DeepSeek R1 (0528)',
};

export function getModelLabel(model: string): string {
  return MODEL_LABELS[model] || model;
}
