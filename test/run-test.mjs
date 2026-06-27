// TingMo automated test — full ASR→corrector→LLM→compare pipeline
// Run: node --experimental-strip-types test/run-test.mjs
// Add test cases: drop N.wav + N.md into test/

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const sherpa = require('sherpa-onnx');

const TEST_DIR = path.resolve(import.meta.dirname);
const MODEL_DIR = path.join(process.env.APPDATA, 'TingMo', 'models', 'funasr');

// ── Import real app modules ────────────────────────────────────
import { PROMPT_STRUCTURED, buildUserPrompt, buildRefinePrompt } from '../src/services/llm-refine.ts';
import { correctText } from '../src/services/text-corrector.ts';
import { parseWAV, splitWavChunks, joinChunkResults } from '../src/services/audio-chunker.ts';

const SIM_THRESHOLD = 0.60;
const TIMEOUT_LLM = 30000;
const CHUNK_SECS = 10;
const OVERLAP_SECS = 1;

// ── Config ────────────────────────────────────────────────────

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

// ── ASR ────────────────────────────────────────────────────────

function runASR(recognizer, samples, sampleRate) {
  const totalSecs = samples.length / sampleRate;
  let text = '';

  if (totalSecs <= CHUNK_SECS + 2) {
    const stream = recognizer.createStream();
    stream.acceptWaveform(sampleRate, samples);
    recognizer.decode(stream);
    text = recognizer.getResult(stream).text || '';
    stream.free();
  } else {
    const chunkLen = CHUNK_SECS * sampleRate;
    const overlapLen = OVERLAP_SECS * sampleRate;
    const step = chunkLen - overlapLen;
    const count = Math.ceil((samples.length - overlapLen) / step);
    const parts = [];
    for (let c = 0; c < count; c++) {
      const s = c * step, e = Math.min(s + chunkLen, samples.length);
      const st = recognizer.createStream();
      st.acceptWaveform(sampleRate, samples.slice(s, e));
      recognizer.decode(st);
      parts.push(recognizer.getResult(st).text || '');
      st.free();
    }
    text = joinChunkResults(parts);
  }
  return text;
}

// ── Resample ───────────────────────────────────────────────────

function resampleTo16k(wavBuf) {
  const srcRate = wavBuf.readUInt32LE(24);
  if (srcRate === 16000) {
    const numSamples = Math.floor((wavBuf.length - 44) / 2);
    const samples = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      samples[i] = wavBuf.readInt16LE(44 + i * 2) / 32768;
    }
    return { samples, rate: 16000 };
  }

  const numSamples = Math.floor((wavBuf.length - 44) / 2);
  const ratio = srcRate / 16000;
  const newLen = Math.floor(numSamples / ratio);
  const samples = new Float32Array(newLen);

  for (let i = 0; i < newLen; i++) {
    const srcPos = i * ratio;
    const idx = Math.floor(srcPos);
    const frac = srcPos - idx;
    const a = wavBuf.readInt16LE(44 + idx * 2) / 32768;
    const b = idx + 1 < numSamples ? wavBuf.readInt16LE(44 + (idx + 1) * 2) / 32768 : a;
    samples[i] = a + (b - a) * frac;
  }
  return { samples, rate: 16000 };
}

// ── LLM Refine ─────────────────────────────────────────────────

async function refineText(rawText, llm) {
  const t0 = performance.now();
  const maxTok = rawText.length < 30 ? 256 : 1024;
  const systemPrompt = buildRefinePrompt({ polishMode: 'structured' });
  const url = llm.baseUrl + '/chat/completions';
  const ctrl = new AbortController();
  const timer = setTimeout(function() { ctrl.abort(); }, TIMEOUT_LLM);

  let fullText = '';
  let firstToken = true;
  let ttft = 0;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + llm.apiKey },
      body: JSON.stringify({
        model: llm.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: buildUserPrompt(rawText) },
        ],
        max_tokens: maxTok,
        temperature: 0.1,
        stream: true,
      }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      var errText = await res.text().catch(function() { return ''; });
      throw new Error('LLM ' + res.status + ': ' + errText.slice(0, 200));
    }

    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    var buf = '';

    while (true) {
      var readResult = await reader.read();
      if (readResult.done) break;
      buf += decoder.decode(readResult.value, { stream: true });
      var lines = buf.split('\n');
      buf = lines.pop() || '';
      for (var li = 0; li < lines.length; li++) {
        var line = lines[li];
        var trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        var data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          var json = JSON.parse(data);
          var content = json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content;
          if (content) {
            if (firstToken) {
              ttft = Math.round(performance.now() - t0);
              firstToken = false;
            }
            fullText += content;
          }
        } catch (e) { /* skip */ }
      }
    }

    var totalMs = Math.round(performance.now() - t0);
    return { text: fullText.trim() || rawText, ttft: ttft, ms: totalMs };
  } finally {
    clearTimeout(timer);
    ctrl.abort();
  }
}

// ── Similarity ──────────────────────────────────────────────────

function similarity(a, b) {
  var m = a.length, n = b.length;
  if (m === 0 || n === 0) return 0;
  var dp = [];
  for (var i = 0; i <= m; i++) { dp[i] = [i]; }
  for (var j = 0; j <= n; j++) { dp[0][j] = j; }
  for (var i = 1; i <= m; i++)
    for (var j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j-1], dp[i][j-1], dp[i-1][j]);
  return 1 - dp[m][n] / Math.max(m, n);
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(path.join(MODEL_DIR, 'model.int8.onnx'))) {
    console.error('Model not found at', MODEL_DIR);
    process.exit(1);
  }

  var llm = loadLLMConfig();
  if (!llm) {
    console.error('No LLM config — set API key in Settings first');
    process.exit(1);
  }
  console.log('LLM: ' + llm.baseUrl + ' / ' + llm.model + '\n');

  var recognizer = sherpa.createOfflineRecognizer({
    modelConfig: {
      senseVoice: { model: path.join(MODEL_DIR, 'model.int8.onnx'), language: '', useInverseTextNormalization: 1 },
      tokens: path.join(MODEL_DIR, 'tokens.txt'),
    },
  });

  var entries = fs.readdirSync(TEST_DIR)
    .filter(function(f) { return /^\d+\.wav$/.test(f); })
    .map(function(f) { return f.replace('.wav', ''); })
    .sort(function(a, b) { return parseInt(a) - parseInt(b); });

  var passed = 0;
  var failed = 0;
  var timings = [];

  // ── Phase 1: ASR all files (sequential — ONNX single thread) ─
  var asrResults = [];
  for (var ei = 0; ei < entries.length; ei++) {
    var name = entries[ei];
    var wavPath = path.join(TEST_DIR, name + '.wav');
    var wavBuf = fs.readFileSync(wavPath);

    var resampled = resampleTo16k(wavBuf);
    var totalSecs = resampled.samples.length / 16000;
    console.log('[' + name + '] WAV ' + wavBuf.readUInt32LE(24) + 'Hz ' + totalSecs.toFixed(1) + 's');

    var t0 = performance.now();
    var rawText = runASR(recognizer, resampled.samples, 16000);
    var asrMs = Math.round(performance.now() - t0);

    console.log('[' + name + '] ASR (' + asrMs + 'ms): ' + rawText.slice(0, 100) + '...');

    // Apply text-corrector
    var corr = correctText(rawText);
    var corrChanges = corr.changes.length;
    if (corrChanges > 0) {
      console.log('[' + name + '] Corrector: ' + corr.changes.map(function(c) { return c.from + '→' + c.to; }).join(', '));
    }

    asrResults.push({ name: name, rawText: rawText, corrected: corr.corrected, asrMs: asrMs, corrChanges: corrChanges });
  }

  // ── Phase 2: LLM refine (parallel) ────────────────────────────
  console.log('\n── Refining (parallel) ───────────────────────────\n');

  var refineFns = [];
  for (var ri = 0; ri < asrResults.length; ri++) {
    (function(r) {
      refineFns.push(function() {
        return refineText(r.corrected, llm).then(function(refResult) {
          return {
            name: r.name,
            asrMs: r.asrMs,
            corrChanges: r.corrChanges,
            refined: refResult.text,
            llmTTFT: refResult.ttft,
            llmMs: refResult.ms,
            totalMs: r.asrMs + refResult.ms,
          };
        });
      });
    })(asrResults[ri]);
  }

  var refineResults = await Promise.all(refineFns.map(function(fn) { return fn(); }));

  // ── Phase 3: Compare ───────────────────────────────────────────
  console.log('');
  for (var ci = 0; ci < refineResults.length; ci++) {
    var result = refineResults[ci];
    var mdPath = path.join(TEST_DIR, result.name + '.md');
    var expected = fs.readFileSync(mdPath, 'utf-8').trim();

    var actualClean = result.refined.replace(/\s+/g, '');
    var expectedClean = expected.replace(/\s+/g, '');

    console.log('[' + result.name + '] ' + '─'.repeat(40));
    console.log('  ASR:    ' + result.asrMs + 'ms');
    console.log('  Corr:   ' + result.corrChanges + ' fixes');
    console.log('  LLM TTFT: ' + result.llmTTFT + 'ms | LLM total: ' + result.llmMs + 'ms');
    console.log('  Total:  ' + result.totalMs + 'ms');
    console.log('  Expect: ' + expected.slice(0, 100));
    console.log('  Actual: ' + result.refined.slice(0, 100));

    var sim = similarity(expectedClean, actualClean);
    console.log('  Sim:    ' + (sim * 100).toFixed(1) + '%');

    timings.push({ asr: result.asrMs, corrChanges: result.corrChanges, llmTTFT: result.llmTTFT, llmTotal: result.llmMs, total: result.totalMs, sim: sim });

    if (sim >= SIM_THRESHOLD) {
      console.log('  → PASS');
      passed++;
    } else {
      console.log('  → FAIL (threshold ' + (SIM_THRESHOLD * 100).toFixed(0) + '%)');
      console.log('  Full expected: ' + expectedClean);
      console.log('  Full actual:   ' + actualClean);
      failed++;
    }
  }

  // ── Summary ────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log(passed + ' passed, ' + failed + ' failed');
  var avgAsr = timings.reduce(function(s, t) { return s + t.asr; }, 0) / timings.length;
  var avgTTFT = timings.reduce(function(s, t) { return s + t.llmTTFT; }, 0) / timings.length;
  var avgLLM = timings.reduce(function(s, t) { return s + t.llmTotal; }, 0) / timings.length;
  var avgTotal = timings.reduce(function(s, t) { return s + t.total; }, 0) / timings.length;
  var avgSim = timings.reduce(function(s, t) { return s + t.sim; }, 0) / timings.length;
  console.log('Avg ASR: ' + avgAsr.toFixed(0) + 'ms | Avg TTFT: ' + avgTTFT.toFixed(0) + 'ms | Avg LLM: ' + avgLLM.toFixed(0) + 'ms | Avg Total: ' + avgTotal.toFixed(0) + 'ms');
  console.log('Avg similarity: ' + (avgSim * 100).toFixed(1) + '%');

  recognizer.free();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(function(err) { console.error(err); process.exit(2); });
