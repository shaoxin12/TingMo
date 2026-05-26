import type { IRefinementProvider, RefineContext, RefinementResult } from './llm-refine';
import { buildRefinePrompt, buildTranslatePrompt, buildUserPrompt } from './llm-refine';

export interface GeminiConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export class GeminiProvider implements IRefinementProvider {
  readonly name = 'Gemini';

  constructor(private config: GeminiConfig) {}

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
    const baseUrl = (this.config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
    const model = this.config.model || 'gemini-2.0-flash';
    const url = `${baseUrl}/models/${model}:generateContent?key=${this.config.apiKey}`;
    const timeout = this.config.timeoutMs || 8000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const body: any = {
        contents: [{ parts: [{ text: buildUserPrompt(userText) }] }],
        generationConfig: { maxOutputTokens: 2048, temperature: 0.1 },
      };

      if (systemPrompt) {
        body.systemInstruction = { parts: [{ text: systemPrompt }] };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Gemini API ${res.status}: ${errText.slice(0, 200)}`);
      }

      const json: any = await res.json();
      const refinedText = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || userText;

      return {
        refinedText,
        originalText: userText,
        provider: `gemini/${model}`,
        durationMs: performance.now() - t0,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
