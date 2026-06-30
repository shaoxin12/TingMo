import type { IRefinementProvider, RefineContext, RefinementResult } from './llm-refine';
import { buildRefinePrompt, buildTranslatePrompt, buildTranslateUserPrompt, buildUserPrompt } from './llm-refine';

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
    try {
      const gen = this.streamRefine(rawText, context);
      let text = '';
      for (let r = await gen.next(); !r.done; r = await gen.next()) { text += r.value; }
      return { refinedText: text || rawText, originalText: rawText, provider: `gemini/${this.config.model}`, durationMs: performance.now() - t0 };
    } catch (streamErr) {
      console.warn('[Gemini] Streaming refine failed, falling back to non-streaming:', (streamErr as Error)?.message || streamErr);
      return this.callAPI(systemPrompt, buildUserPrompt(rawText), t0);
    }
  }

  async *streamRefine(rawText: string, context?: RefineContext, signal?: AbortSignal): AsyncGenerator<string, RefinementResult, void> {
    const t0 = performance.now();
    const systemPrompt = buildRefinePrompt(context);
    const baseUrl = (this.config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
    const model = this.config.model || 'gemini-2.5-flash';
    // NOTE: Gemini API uses API key in URL query string — visible in proxy/firewall logs.
    // This is a design limitation of the Gemini v1beta REST API. Consider using a proxy
    // or the official client library for production deployments.
    const url = `${baseUrl}/models/${model}:streamGenerateContent?key=${this.config.apiKey}&alt=sse`;
    const timeout = this.config.timeoutMs || 30000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    if (signal) {
      signal.addEventListener('abort', () => controller.abort(), { once: true });
      if (signal.aborted) { controller.abort(); clearTimeout(timer); }
    }

    try {
      const body: any = {
        contents: [{ parts: [{ text: buildUserPrompt(rawText) }] }],
        generationConfig: { maxOutputTokens: rawText.length < 30 ? 256 : 1024, temperature: 0.1 },
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
          try {
            const json = JSON.parse(data);
            const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              fullText += text;
              yield text;
            }
          } catch { /* skip */ }
        }
      }

      // Process any remaining buffered SSE line
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith('data:')) {
          try {
            const json = JSON.parse(trimmed.slice(5).trim());
            const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              fullText += text;
              yield text;
            }
          } catch { /* skip */ }
        }
      }

      const refinedText = fullText.trim() || rawText;
      return {
        refinedText,
        originalText: rawText,
        provider: `gemini/${model}`,
        durationMs: performance.now() - t0,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async translate(text: string, targetLang: string, context?: RefineContext): Promise<RefinementResult> {
    const t0 = performance.now();
    const systemPrompt = buildTranslatePrompt(targetLang, context?.dictionary);
    return this.callAPI(systemPrompt, buildTranslateUserPrompt(text, targetLang), t0);
  }

  private async callAPI(systemPrompt: string, userMessage: string, t0: number): Promise<RefinementResult> {
    const baseUrl = (this.config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
    const model = this.config.model || 'gemini-2.5-flash';
    // NOTE: API key in URL query string — same limitation as streaming endpoint.
    const url = `${baseUrl}/models/${model}:generateContent?key=${this.config.apiKey}`;
    const timeout = this.config.timeoutMs || 30000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const body: any = {
        contents: [{ parts: [{ text: userMessage }] }],
        generationConfig: { maxOutputTokens: userMessage.length < 30 ? 256 : 1024, temperature: 0.1 },
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
      const refinedText = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || userMessage;

      return {
        refinedText,
        originalText: userMessage,
        provider: `gemini/${model}`,
        durationMs: performance.now() - t0,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
