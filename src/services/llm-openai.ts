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
    let text = '';
    try {
      const gen = this.streamRefine(rawText, context);
      for (let r = await gen.next(); !r.done; r = await gen.next()) {
        text += r.value;
      }
      return { refinedText: text || rawText, originalText: rawText, provider: `openai/${this.config.model}`, durationMs: performance.now() - t0 };
    } catch {
      return this.callAPI(systemPrompt, rawText, t0);
    }
  }

  async *streamRefine(rawText: string, context?: RefineContext, signal?: AbortSignal): AsyncGenerator<string, RefinementResult, void> {
    const t0 = performance.now();
    const systemPrompt = buildRefinePrompt(context);
    const baseUrl = (this.config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    const url = `${baseUrl}/chat/completions`;
    const timeout = this.config.timeoutMs || 30000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    if (signal) {
      if (signal.aborted) { controller.abort(); clearTimeout(timer); }
      else signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

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
            { role: 'user', content: buildUserPrompt(rawText) },
          ],
          max_tokens: rawText.length < 30 ? 256 : 1024,
          temperature: 0.1,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`API ${res.status}: ${errText.slice(0, 200)}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') continue;
          try {
            const json = JSON.parse(data);
            const content = json.choices?.[0]?.delta?.content;
            if (content) {
              fullText += content;
              yield content;
            }
          } catch { /* skip unparseable chunks */ }
        }
      }

      const refinedText = fullText.trim() || rawText;
      return {
        refinedText,
        originalText: rawText,
        provider: `openai/${this.config.model}`,
        durationMs: performance.now() - t0,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async translate(text: string, targetLang: string, context?: RefineContext): Promise<RefinementResult> {
    const t0 = performance.now();
    const systemPrompt = buildTranslatePrompt(targetLang, context?.dictionary);
    return this.callAPI(systemPrompt, text, t0);
  }

  private async callAPI(systemPrompt: string, userText: string, t0: number): Promise<RefinementResult> {
    const baseUrl = (this.config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    const url = `${baseUrl}/chat/completions`;
    const timeout = this.config.timeoutMs || 30000;

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
          max_tokens: userText.length < 30 ? 256 : 1024,
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
