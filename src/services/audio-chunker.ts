// Shared audio chunking utilities for ASR providers.
// Handles WAV parsing, encoding, splitting long audio into overlapping chunks,
// and deduplicating overlapping text between adjacent chunk results.

export const CHUNK_SECS = 10;
export const OVERLAP_SECS = 1;

/** Parse WAV Buffer → Float32Array PCM samples + sample rate */
export function parseWAV(buf: Buffer): { samples: Float32Array; sampleRate: number } {
  const sampleRate = buf.readUInt32LE(24);
  const numSamples = Math.floor((buf.length - 44) / 2);
  const samples = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    samples[i] = buf.readInt16LE(44 + i * 2) / 32768;
  }
  return { samples, sampleRate };
}

/** Encode Float32Array PCM → WAV Buffer (16-bit mono) */
export function encodeWAV(samples: Float32Array, sampleRate: number): Buffer {
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7FFF, 44 + i * 2);
  }
  return buf;
}

/**
 * Split a WAV buffer into overlapping chunks.
 * Returns an array of WAV buffers, each ~chunkSecs long with overlapSecs overlap.
 * The last chunk may be shorter; chunks smaller than 0.5×chunkSecs are merged
 * into the previous chunk rather than returned separately.
 */
export function splitWavChunks(
  wavBuf: Buffer,
  chunkSecs: number = CHUNK_SECS,
  overlapSecs: number = OVERLAP_SECS,
): Buffer[] {
  const { samples, sampleRate } = parseWAV(wavBuf);
  const totalSecs = samples.length / sampleRate;

  // Short audio: single chunk
  if (totalSecs <= chunkSecs + 1) {
    return [wavBuf];
  }

  const chunkLen = chunkSecs * sampleRate;
  const overlapLen = overlapSecs * sampleRate;
  const step = chunkLen - overlapLen;
  const minChunkLen = Math.floor(chunkLen * 0.5);

  const chunks: Buffer[] = [];
  for (let start = 0; start < samples.length; start += step) {
    const end = Math.min(start + chunkLen, samples.length);
    const segment = samples.slice(start, end);

    // Merge tiny trailing chunk into previous
    if (segment.length < minChunkLen && chunks.length > 0) {
      break;
    }
    chunks.push(encodeWAV(segment, sampleRate));
    if (end >= samples.length) break;
  }

  return chunks;
}

/**
 * Deduplicate overlapping text between adjacent chunk results.
 * Finds the longest suffix of `prev` that is a prefix of `next` (min 2 chars)
 * and returns `next` with the overlap removed. Falls back to "" if `next` is
 * fully contained in `prev`.
 */
export function dedupOverlap(prev: string, next: string, maxLen?: number): string {
  const minLen = 2;
  const max = Math.min(prev.length, next.length, maxLen ?? 15);
  for (let len = max; len >= minLen; len--) {
    const suffix = prev.slice(-len);
    if (next.startsWith(suffix)) {
      if (len === next.length) return ''; // fully contained
      return next.slice(len);
    }
  }
  return next;
}

/**
 * Join chunked ASR results, deduplicating overlaps between adjacent pairs.
 */
export function joinChunkResults(results: string[]): string {
  if (results.length === 0) return '';
  let text = results[0];
  for (let i = 1; i < results.length; i++) {
    text += dedupOverlap(results[i - 1], results[i]);
  }
  return text.trim();
}
