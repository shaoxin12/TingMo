// LLM Refinement Provider interface and System Prompts

export interface DictEntry {
  word: string;
  replace: string;
}

export type PolishMode = 'light' | 'balanced' | 'deep';

export interface RefineContext {
  language?: string;
  dictionary?: DictEntry[];
  polishMode?: PolishMode;
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

export function buildUserPrompt(rawText: string, mode?: PolishMode): string {
  if (mode === 'light') {
    return `只补全标点、修正明显错字，不要改任何字词。直接输出。

<raw>
${rawText}
</raw>`;
  }
  if (mode === 'deep') {
    return `纠错、去口癖、补标点，保留所有细节，强制分行分点（2+ 件事用 1. 2. 编号，细节用 (a) (b) 缩进）。严禁概括删减。

<raw>
${rawText}
</raw>`;
  }
  return `去口癖、补标点、纠错，保留原意和语气。

<raw>
${rawText}
</raw>`;
}

function buildDictHint(dictionary?: DictEntry[]): string {
  if (!dictionary || dictionary.length === 0) return '';
  return `\n以下词汇是用户的专属词汇，请保持不替换：${dictionary.map(e => `"${e.word}"→"${e.replace}"`).join('、')}`;
}

// ── Three Polish Modes ─────────────────────────────────────

const PROMPT_LIGHT = `补全中英文标点，修正明显同音错字。保持原文用词、语序、结构完全不变。{dict_hint}
只输出修正后的文字。`;

const PROMPT_BALANCED = `清理口头禅和自我修正，补全标点，保留措辞和语气。不要添加内容。

规则：删填充词（嗯/啊/呃/那个/就是/然后/反正/这个）、合并口吃重复、同音纠错（跟目录→根目录）、字母合并（G P T→GPT）、中文数字→阿拉伯、点+字母→.扩展名（点md→.md）。

音译词纠正：cloud→claude、抗费格/康费格→config、吉特→Git、脱肯→Token、都可→Docker。

意图：几乎不转化。仅"帮我把/请帮我/给我写"→去掉前缀变任务清单。"帮我看/查/更新"→保持原样。

1 件事→段落，2 件→1. 2. 平列，3+ 件→扁平编号。技术术语用反引号。{dict_hint}
只输出整理后的文字。`;

const PROMPT_DEEP = `去口癖、纠错、补标点，调整措辞为书面表达，保留所有细节。

规则：删填充词、合并口吃、同音纠错（跟目录→根目录）、字母合并（G P T→GPT）、中文数字→阿拉伯、点+字母→.扩展名（点md→.md）。

音译词纠正：cloud→claude、抗费格→config、吉特→Git、脱肯→Token、都可→Docker。

意图：仅"帮我把/请帮我/给我写"→去掉前缀变任务清单。其他保持原样。

结构化（强制分行分点）：1 件事→段落。2+ 件事→1. 2. 3. 编号，每点独立一行。某条需展开→(a) (b) 缩进子项。

严禁概括删减，每个要点和细节都要保留。技术术语用反引号。{dict_hint}
只输出整理后的文字。`;

const MODE_PROMPTS: Record<PolishMode, string> = {
  light: PROMPT_LIGHT,
  balanced: PROMPT_BALANCED,
  deep: PROMPT_DEEP,
};

export function buildRefinePrompt(context?: RefineContext): string {
  const mode = context?.polishMode || 'balanced';
  const dictHint = buildDictHint(context?.dictionary);
  const base = MODE_PROMPTS[mode] || PROMPT_BALANCED;
  return base.replace('{dict_hint}', dictHint);
}

const LANG_NAMES: Record<string, string> = {
  en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean',
  fr: 'French', de: 'German', es: 'Spanish',
};

function toLangName(code: string): string {
  return LANG_NAMES[code] || code;
}

const TRANSLATE_BASE = `You are a translator. Translate the following text into {targetLang}.
Preserve the structure (lists, paragraphs, numbering).{dict_hint}
Output only the translated text, no explanations.`;

export function buildTranslatePrompt(targetLang: string, dictionary?: DictEntry[]): string {
  return TRANSLATE_BASE
    .replace('{targetLang}', toLangName(targetLang))
    .replace('{dict_hint}', dictionary?.length ? `\nPreserve these terms exactly as written: ${dictionary.map(e => e.replace).join(', ')}` : '');
}

export function buildTranslateUserPrompt(rawText: string, targetLang: string): string {
  return `Translate the following text into ${toLangName(targetLang)}. Output only the translated text, no explanations, no prefixes.

<text>
${rawText}
</text>`;
}
