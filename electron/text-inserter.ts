const koffi = require('koffi');

const INPUT_KEYBOARD = 1;
const KEYEVENTF_UNICODE = 0x0004;
const KEYEVENTF_KEYUP = 0x0002;

const VK_RETURN = 0x0D;
const VK_SHIFT = 0x10;

const user32 = koffi.load('user32.dll');

const SendInput = user32.func(
  'SendInput',
  'uint32',
  ['uint32', 'void *', 'int32'],
);

export interface InjectResult {
  success: boolean;
  charCount: number;
  durationMs: number;
}

const INPUT_SIZE = 40;

function writeInput(buf: Buffer, base: number, vk: number, scan: number, flags: number): void {
  buf.writeUInt32LE(INPUT_KEYBOARD, base);      // type
  // offset 4-7: implicit padding
  buf.writeUInt16LE(vk, base + 8);              // wVk
  buf.writeUInt16LE(scan, base + 10);           // wScan
  buf.writeUInt32LE(flags, base + 12);          // dwFlags
  buf.writeUInt32LE(0, base + 16);              // time (0 = system default)
  // offset 20-23: implicit padding
  buf.writeBigUInt64LE(0n, base + 24);          // dwExtraInfo
}

// Fast one-shot injection: builds all INPUT structs in a single buffer,
// sends them in ONE SendInput call. Handles \n as Enter key.
export async function injectText(text: string): Promise<InjectResult> {
  const start = performance.now();

  // Count inputs needed: \n uses 4 (Shift+Enter combo), regular chars use 2 (unicode down+up),
  // surrogate pairs (non-BMP) use 4 (two down+up pairs)
  let inputCount = 0;
  for (const ch of text) {
    if (ch === '\n') {
      inputCount += 4;
    } else {
      const cp = ch.codePointAt(0) ?? 0;
      inputCount += (cp > 0xFFFF) ? 4 : 2;
    }
  }

  if (inputCount === 0) {
    return { success: true, charCount: 0, durationMs: 0 };
  }

  const buf = Buffer.alloc(inputCount * INPUT_SIZE);
  let idx = 0;

  for (const ch of text) {
    if (ch === '\n') {
      // Shift+Enter — universal "newline without send" in chat apps
      writeInput(buf, (idx++) * INPUT_SIZE, VK_SHIFT, 0, 0);
      writeInput(buf, (idx++) * INPUT_SIZE, VK_RETURN, 0, 0);
      writeInput(buf, (idx++) * INPUT_SIZE, VK_RETURN, 0, KEYEVENTF_KEYUP);
      writeInput(buf, (idx++) * INPUT_SIZE, VK_SHIFT, 0, KEYEVENTF_KEYUP);
    } else {
      const cp = ch.codePointAt(0) ?? 0;
      if (cp > 0xFFFF) {
        // Non-BMP character (emoji, etc.) — needs surrogate pair
        // KEYEVENTF_UNICODE expects UTF-16 code units in wScan
        const high = 0xD800 + ((cp - 0x10000) >> 10);
        const low = 0xDC00 + ((cp - 0x10000) & 0x3FF);
        writeInput(buf, (idx++) * INPUT_SIZE, 0, high, KEYEVENTF_UNICODE);
        writeInput(buf, (idx++) * INPUT_SIZE, 0, high, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP);
        writeInput(buf, (idx++) * INPUT_SIZE, 0, low, KEYEVENTF_UNICODE);
        writeInput(buf, (idx++) * INPUT_SIZE, 0, low, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP);
      } else {
        writeInput(buf, (idx++) * INPUT_SIZE, 0, cp, KEYEVENTF_UNICODE);
        writeInput(buf, (idx++) * INPUT_SIZE, 0, cp, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP);
      }
    }
  }

  const injected = SendInput(idx, koffi.as(buf, 'void *'), INPUT_SIZE);
  if (injected !== idx) {
    console.warn('[TextInserter] injectText: injected', injected, 'of', idx, 'events');
  }

  return {
    success: injected === idx,
    charCount: text.length,
    durationMs: performance.now() - start,
  };
}
