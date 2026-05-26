const koffi = require('koffi');

const INPUT_KEYBOARD = 1;
const KEYEVENTF_UNICODE = 0x0004;
const KEYEVENTF_KEYUP = 0x0002;

const VK_BACK = 0x08;
const KEYEVENTF_EXTENDEDKEY = 0x0001;

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
const inputBuf = Buffer.alloc(INPUT_SIZE);

function fillInputStruct(codePoint: number, flags: number): void {
  inputBuf.fill(0);
  let offset = 0;
  offset = inputBuf.writeUInt32LE(INPUT_KEYBOARD, offset);
  offset += 4;
  offset = inputBuf.writeUInt16LE(0, offset);
  offset = inputBuf.writeUInt16LE(codePoint, offset);
  offset = inputBuf.writeUInt32LE(flags, offset);
  offset = inputBuf.writeUInt32LE(0, offset);
  inputBuf.writeBigUInt64LE(0n, 24);
}

function fillVkStruct(vkCode: number, flags: number): void {
  inputBuf.fill(0);
  let offset = 0;
  offset = inputBuf.writeUInt32LE(INPUT_KEYBOARD, offset);
  offset = inputBuf.writeUInt16LE(vkCode, offset);      // wVk
  offset = inputBuf.writeUInt16LE(0, offset);            // wScan (0 for VK)
  offset = inputBuf.writeUInt32LE(flags, offset);
  offset = inputBuf.writeUInt32LE(0, offset);
  inputBuf.writeBigUInt64LE(0n, 24);
}

export async function backspaceChars(count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    fillVkStruct(VK_BACK, 0);
    SendInput(1, koffi.as(inputBuf, 'void *'), INPUT_SIZE);
    fillVkStruct(VK_BACK, KEYEVENTF_KEYUP);
    SendInput(1, koffi.as(inputBuf, 'void *'), INPUT_SIZE);
  }
}

export async function injectText(text: string): Promise<InjectResult> {
  const start = performance.now();

  for (const ch of text) {
    const codePoint = ch.codePointAt(0) ?? 0;

    fillInputStruct(codePoint, KEYEVENTF_UNICODE);
    SendInput(1, koffi.as(inputBuf, 'void *'), INPUT_SIZE);

    fillInputStruct(codePoint, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP);
    SendInput(1, koffi.as(inputBuf, 'void *'), INPUT_SIZE);
  }

  return {
    success: true,
    charCount: text.length,
    durationMs: performance.now() - start,
  };
}
