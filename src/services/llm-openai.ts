import type { IRefinementProvider, RefineContext, RefinementResult, DictEntry } from './llm-refine';
import { buildRefinePrompt, buildTranslatePrompt, buildUserPrompt } from './llm-refine';

export interface OpenAIConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export class OpenAIProvider implements IRefinementProvider {
  readonly name = 'OpenAI';

  constructor(private config: OpenAIConfig) {}

  async refine(rawText: string, context?: RefineContext): Promise<RefinementResult> {
    const t0 = performance.now();
    const systemPrompt = buildRefinePrompt(context);
    return this.callAPI(systemPrompt, rawText, t0);
  }

  async translate(text: string, targetLang: string, context?: RefineContext): Promise<RefinementResult> {
    const t0 = performance.now();
    const systemPrompt = buildTranslatePrompt(targetLang, context?.dictionary);
    return this.callAPI(systemPrompt, text, t0);
  }

  private async callAPI(systemPrompt: string, userText: string, t0: number): Promise<RefinementResult> {
    const baseUrl = (this.config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    const url = `${baseUrl}/chat/completions`;
    const timeout = this.config.timeoutMs || 8000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: buildUserPrompt(userText) },
          ],
          max_tokens: 2048,
          temperature: 0.1,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`API ${res.status}: ${errText.slice(0, 200)}`);
      }

      const json: any = await res.json();
      const refinedText = json.choices?.[0]?.message?.content?.trim() || userText;

      return {
        refinedText,
        originalText: userText,
        provider: `openai/${this.config.model}`,
        durationMs: performance.now() - t0,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
