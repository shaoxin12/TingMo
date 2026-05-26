import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const sherpa = require('sherpa-onnx');

const TEST_DIR = 'D:/CodeField/TingMo/test';
const MODEL_DIR = path.join(process.env.APPDATA, 'TingMo', 'models', 'funasr');

// ── LLM refine prompt (structured mode from llm-refine.ts) ──
const REFINE_PROMPT = `你是语音识别纠错助手。将 ASR 转写中的错误修正，输出干净的文字。

# 必须做的事
1. 修正同音/近音字误识别——根据上下文推断最合理的词。读不通的地方一定是 ASR 错了，大胆修正。
2. 英文术语音译还原：Gmai/GM→Gemini, 卡布奇诺/Cappuccino, 乞丐/checkpoint→Checkpoint, 沙塔/SOTA, GPT/JPT/GTT→GPT, AI→AI
3. 数字格式：中文数字或音似的→阿拉伯数字（四点二→4.2, 三点五→3.5, 五点五→5.5）
4. 补全中英文标点，正确混用
5. 删除口语填充词（嗯、啊、呃、那个、就是、然后）

# 绝对不能做的事
- 不要添加任何原文没有的内容
- 不要删除原文有的实质信息
- 不要改写句式或重组结构
- 不要加"我整理如下"等前缀
- 不确定的地方宁可保留原文，不要编造

直接返回纠错后的文字。`;

function resampleTo16k(wavBuf) {
  const srcRate = wavBuf.readUInt32LE(24);
  if (srcRate === 16000) return wavBuf;

  const numSamples = Math.floor((wavBuf.length - 44) / 2);
  const ratio = srcRate / 16000;
  const newLen = Math.floor(numSamples / ratio);
  const result = Buffer.alloc(44 + newLen * 2);

  wavBuf.copy(result, 0, 0, 44);
  result.writeUInt32LE(16000, 24);
  result.writeUInt32LE(16000 * 2, 28);
  result.writeUInt32LE(newLen * 2, 40);
  result.writeUInt32LE(36 + newLen * 2, 4);

  for (let i = 0; i < newLen; i++) {
    const srcPos = i * ratio;
    const srcIdx = Math.floor(srcPos);
    const frac = srcPos - srcIdx;
    const a = wavBuf.readInt16LE(44 + srcIdx * 2);
    const b = srcIdx + 1 < numSamples ? wavBuf.readInt16LE(44 + (srcIdx + 1) * 2) : a;
    result.writeInt16LE(Math.round(a + (b - a) * frac), 44 + i * 2);
  }
  return result;
}

function loadLLMConfig() {
  const sp = path.join(process.env.APPDATA, 'TingMo', 'data', 'settings.json');
  if (!fs.existsSync(sp)) return null;
  const s = JSON.parse(fs.readFileSync(sp, 'utf-8'));
  if (!s.llmApiKey) return null;
  return {
    apiKey: s.llmApiKey,
    model: s.llmModel || 'deepseek-v4-flash',
    baseUrl: (s.llmBaseUrl || 'https://api.deepseek.com/v1').replace(/\/$/, ''),
  };
}

async function refineText(rawText, llm) {
  const url = `${llm.baseUrl}/chat/completions`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${llm.apiKey}` },
      body: JSON.stringify({
        model: llm.model,
        messages: [
          { role: 'system', content: REFINE_PROMPT },
          { role: 'user', content: rawText },
        ],
        max_tokens: 2048,
        temperature: 0.1,
      }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`LLM ${res.status}: ${err.slice(0, 200)}`);
    }

    const json = await res.json();
    return json.choices?.[0]?.message?.content?.trim() || rawText;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  if (!fs.existsSync(path.join(MODEL_DIR, 'model.int8.onnx'))) {
    console.error('Model not found at', MODEL_DIR);
    process.exit(1);
  }

  const llm = loadLLMConfig();
  if (!llm) {
    console.error('No LLM config — set API key in Settings first');
    process.exit(1);
  }
  console.log(`LLM: ${llm.baseUrl} / ${llm.model}`);

  const recognizer = sherpa.createOfflineRecognizer({
    modelConfig: {
      senseVoice: { model: path.join(MODEL_DIR, 'model.int8.onnx'), language: '', useInverseTextNormalization: 1 },
      tokens: path.join(MODEL_DIR, 'tokens.txt'),
    },
  });

  const entries = fs.readdirSync(TEST_DIR)
    .filter(f => /^\d+\.wav$/.test(f))
    .map(f => f.replace('.wav', ''));

  let passed = 0, failed = 0;

  for (const name of entries) {
    const wavPath = path.join(TEST_DIR, name + '.wav');
    const mdPath = path.join(TEST_DIR, name + '.md');
    if (!fs.existsSync(mdPath)) { console.log(`[${name}] SKIP — no .md`); continue; }

    const expected = fs.readFileSync(mdPath, 'utf-8').trim();
    let wavBuf = fs.readFileSync(wavPath);
    const srcRate = wavBuf.readUInt32LE(24);
    console.log(`\n[${name}] WAV ${srcRate}Hz ${(wavBuf.length/1024).toFixed(0)}KB`);

    if (srcRate !== 16000) {
      wavBuf = resampleTo16k(wavBuf);
    }

    // ── Step 1: ASR ──
    const numSamples = Math.floor((wavBuf.length - 44) / 2);
    const samples = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      samples[i] = wavBuf.readInt16LE(44 + i * 2) / 32768;
    }

    const totalSecs = numSamples / 16000;
    const t0 = performance.now();

    let rawText;
    if (totalSecs <= 14) {
      const stream = recognizer.createStream();
      stream.acceptWaveform(16000, samples);
      recognizer.decode(stream);
      rawText = recognizer.getResult(stream).text || '';
      stream.free();
    } else {
      const CHUNK = 12 * 16000, OVERLAP = 16000, STEP = CHUNK - OVERLAP;
      const count = Math.ceil((numSamples - OVERLAP) / STEP);
      const parts = [];
      for (let c = 0; c < count; c++) {
        const s = c * STEP, e = Math.min(s + CHUNK, numSamples);
        const st = recognizer.createStream();
        st.acceptWaveform(16000, samples.slice(s, e));
        recognizer.decode(st);
        parts.push(recognizer.getResult(st).text || '');
        st.free();
      }
      let deduped = parts[0];
      for (let i = 1; i < parts.length; i++) {
        let cut = 0;
        for (let len = Math.min(parts[i - 1].length, parts[i].length, 15); len >= 2; len--) {
          if (parts[i].startsWith(parts[i - 1].slice(-len))) { cut = len; break; }
        }
        deduped += cut > 0 ? parts[i].slice(cut) : parts[i];
      }
      rawText = deduped;
    }

    const asrMs = (performance.now() - t0).toFixed(0);
    console.log(`[${name}] ASR (${asrMs}ms): ${(rawText || '').slice(0, 100)}...`);

    // ── Step 2: LLM refine ──
    console.log(`[${name}] Refining with LLM...`);
    const refined = await refineText(rawText, llm);
    const totalMs = (performance.now() - t0).toFixed(0);
    console.log(`[${name}] Refined (${totalMs}ms): ${refined.slice(0, 120)}...`);

    // ── Compare ──
    const actualClean = refined.replace(/\s+/g, '');
    const expectedClean = expected.replace(/\s+/g, '');

    console.log(`[${name}] Expected: ${expectedClean.slice(0, 120)}...`);
    console.log(`[${name}] Actual:   ${actualClean.slice(0, 120)}...`);

    const sim = similarity(expectedClean, actualClean);
    const threshold = 0.70;
    if (sim >= threshold) {
      console.log(`[${name}] PASS (${(sim*100).toFixed(1)}%)`);
      passed++;
    } else {
      console.log(`[${name}] FAIL (${(sim*100).toFixed(1)}% < ${(threshold*100).toFixed(0)}%)`);
      console.log(`[${name}] Full expected: ${expectedClean}`);
      console.log(`[${name}] Full actual:   ${actualClean}`);
      failed++;
    }
  }

  recognizer.free();
  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

function similarity(a, b) {
  const m = a.length, n = b.length;
  if (m === 0 || n === 0) return 0;
  const dp = Array.from({length: m + 1}, (_, i) => [i]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j-1], dp[i][j-1], dp[i-1][j]);
  return 1 - dp[m][n] / Math.max(m, n);
}

main().catch(err => { console.error(err); process.exit(2); });
