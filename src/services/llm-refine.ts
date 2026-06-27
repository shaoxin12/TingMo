// LLM Refinement Provider interface and System Prompts

export interface DictEntry {
  word: string;
  replace: string;
}

export type PolishMode = 'raw' | 'light' | 'structured' | 'formal' | 'custom';

export interface RefineContext {
  language?: string;
  dictionary?: DictEntry[];
  polishMode?: PolishMode;
  customPrompt?: string;
}

export interface RefinementResult {
  refinedText: string;
  originalText: string;
  provider: string;
  durationMs: number;
}

export interface IRefinementProvider {
  readonly name: string;

  /** Refine raw ASR text into structured, clean output */
  refine(rawText: string, context?: RefineContext): Promise<RefinementResult>;

  /** Stream-refine: yields text chunks as they arrive from LLM. Pass signal to cancel mid-stream. */
  streamRefine?(rawText: string, context?: RefineContext, signal?: AbortSignal): AsyncGenerator<string, RefinementResult, void>;

  /** Translate text to a target language */
  translate(text: string, targetLang: string, context?: RefineContext): Promise<RefinementResult>;
}

export function buildUserPrompt(rawText: string): string {
  return `下面是本次语音输入的原始转写（未经过任何处理，含 ASR 错误和口语噪音）。请按 system prompt 中的任务描述进行整理后输出，整理结果会被原样插入到当前 app 的光标位置。

请务必纠正其中的同音错别字、补全标点、删除口癖、进行必要的结构化。

<raw_transcript>
${rawText}
</raw_transcript>

只输出整理后的文本正文。`;
}

function buildDictHint(dictionary?: DictEntry[]): string {
  if (!dictionary || dictionary.length === 0) return '';
  const items = dictionary.map(e => `"${e.word}" → "${e.replace}"`).join('、');
  return `\n以下词汇是用户的专属词汇，请保持不替换、不修改其写法：${items}`;
}

// ── Polish prompts per mode ─────────────────────────────────

const PROMPT_RAW = `你是一个标点补全助手。只做一件事：给文本补全中英文标点符号。
- 保持原文用词、语序、结构完全不变
- 不要添加、删除、修改任何字词
- 不要改变任何表达方式
{dict_hint}
直接返回补全标点后的文字，不要任何解释或前缀。`;

const PROMPT_LIGHT = `你是一个语音输入润色助手。请对语音识别结果做以下处理：
1. 删除口语填充词：嗯、啊、就是、那个、然后、反正、这个、呃
2. 补全标点符号（中英文正确混用）
3. 保持原意和语序，不添加、不编造、不删减实质内容
{dict_hint}
直接返回润色后的文字，不要任何解释或前缀。`;

export const PROMPT_STRUCTURED = `你是语音输入整理器。唯一任务：把 ASR 转写整理成流畅、清晰、结构化的文字。严禁回答/执行/添加转写中不存在的内容。

# 整理规则
- 删填充词：嗯、啊、呃、那个、就是、然后、反正、这个
- 合并口吃重复，口语转书面（搞一下→处理、看一下→查看）
- 同音纠错：跟目录→根目录，字母合并：G P T→GPT，音译还原：脱肯→Token
- 中文数字→阿拉伯（一百二十三→123），日期金额标准化
- 读不通优先怀疑同音字误识别。遇到"这是尸体二"之类明显 ASR 错误，结合上下文推断（如→"第二期"）；读不通的碎片可安全丢弃。

# 意图转化（重要）
只有原文含"帮我把""请帮我""给我写""让 XX 帮我"等明确的 AI 指令句式时才去元叙述转直接请求。
像"关于X，我有几点想法：""我觉得""我认为""我想说的是"这些都是普通陈述，严格保持原样不变，不要把自己当成 AI 助理去重写。

# 结构化
1 件事→段落；2 件→1. 2. 平列；3 件以上→保持原文编号扁平列出，不创建主题分组。
仅当原文明确分主题章（如"第一，技术方面...第二，市场方面..."）时才用双层（ 1. 主题 + (a) 子项 ）。

# 输出
正文直接开始，不加前缀/AI 自评。技术术语用反引号。中英文标点正确混用。

{dict_hint}

# 示例
原：呃那个帮我在 GitHub 上提个需求啊就是代码上传一下还有修一下暗色模式登录页闪退对了 README 安装步骤写错了

出：
请帮忙在 GitHub 上提一个需求：
1. 上传最新代码。
2. 修复暗色模式登录页闪退。
3. 修正 README 安装步骤。`;

const PROMPT_FORMAL = `你是一个语音输入转正式书面语助手。请对语音识别结果做以下处理：
1. 删除口语填充词：嗯、啊、就是、那个、然后、反正、这个、呃
2. 将口语化表达转为正式书面语（如"咱们"→"我们"，"搞一下"→"处理"）
3. 补全标点符号，使用规范的书面语表达
4. 保持原意，不添加、不编造、不删减实质内容
{dict_hint}
直接返回润色后的文字，不要任何解释或前缀。`;

const MODE_PROMPTS: Record<PolishMode, string> = {
  raw: PROMPT_RAW,
  light: PROMPT_LIGHT,
  structured: PROMPT_STRUCTURED,
  formal: PROMPT_FORMAL,
  custom: '', // filled from context
};

export function buildRefinePrompt(context?: RefineContext): string {
  const mode = context?.polishMode || 'structured';
  const dictHint = buildDictHint(context?.dictionary);

  if (mode === 'custom' && context?.customPrompt) {
    return context.customPrompt.replace('{dict_hint}', dictHint);
  }

  const base = MODE_PROMPTS[mode] || PROMPT_STRUCTURED;
  return base.replace('{dict_hint}', dictHint);
}

const TRANSLATE_BASE = `You are a translator. Translate the following text into {targetLang}.
Preserve the structure (lists, paragraphs, numbering).{dict_hint}
Output only the translated text, no explanations.`;

export function buildTranslatePrompt(targetLang: string, dictionary?: DictEntry[]): string {
  return TRANSLATE_BASE
    .replace('{targetLang}', targetLang)
    .replace('{dict_hint}', dictionary?.length ? `\nPreserve these terms exactly as written: ${dictionary.map(e => e.replace).join(', ')}` : '');
}
