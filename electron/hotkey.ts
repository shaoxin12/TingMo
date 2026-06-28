const koffi = require('koffi');

import {
  VK_RMENU,
  VK_ESCAPE,
  KEY_DOWN_MESSAGES,
  KEY_UP_MESSAGES,
  getHotkeyEventAction,
} from './hotkey-events';

const user32 = koffi.load('user32.dll');
const kernel32 = koffi.load('kernel32.dll');

const WH_KEYBOARD_LL = 13;
const HC_ACTION = 0;
const LLKHF_INJECTED = 0x10;

const KBDLLHOOKSTRUCT = koffi.struct('KBDLLHOOKSTRUCT', {
  vkCode: 'uint32',
  scanCode: 'uint32',
  flags: 'uint32',
  time: 'uint32',
  dwExtraInfo: 'uintptr',
});

const LowLevelKeyboardProc = koffi.proto(
  'intptr __stdcall LowLevelKeyboardProc(int nCode, uintptr wParam, void *lParam)',
);

const SetWindowsHookExW = user32.func(
  'SetWindowsHookExW',
  'void *',
  ['int', 'LowLevelKeyboardProc *', 'void *', 'uint32'],
);
const CallNextHookEx = user32.func(
  'CallNextHookEx',
  'intptr',
  ['void *', 'int', 'uintptr', 'void *'],
);
const UnhookWindowsHookEx = user32.func('UnhookWindowsHookEx', 'bool', ['void *']);
const GetAsyncKeyState = user32.func('GetAsyncKeyState', 'int16', ['int32']);
const GetModuleHandleW = kernel32.func('GetModuleHandleW', 'void *', ['str16']);

// ── Synthetic key-up injection to prevent stuck-key ──────────
// keybd_event is simpler than SendInput (no struct layout issues) and
// still marks events as LLKHF_INJECTED so our hook passes them through.
const KEYEVENTF_KEYUP = 0x0002;
const keybd_event = user32.func('keybd_event', 'void', ['uint8', 'uint8', 'uint32', 'uintptr']);

function injectKeyUp(): void {
  keybd_event(currentVk, 0, KEYEVENTF_KEYUP, 0);
}

let pressCallback: (() => void) | null = null;
let releaseCallback: (() => void) | null = null;
let escCallback: (() => void) | null = null;
let hookHandle: unknown = null;
let hookProc: unknown = null;
let wasPressed = false;
let wasEscPressed = false;
let hookPaused = false;

export function setHookPaused(paused: boolean): void {
  hookPaused = paused;
}

export function setHotkeyCallback(cb: () => void): void {
  pressCallback = cb;
}

export function setHotkeyReleaseCallback(cb: () => void): void {
  releaseCallback = cb;
}

let currentVk: number = VK_RMENU;

export function setEscCallback(cb: () => void): void {
  escCallback = cb;
}

export function startHotkey(vkCode?: number): void {
  if (vkCode !== undefined) currentVk = vkCode;
  if (hookHandle) {
    stopHotkey();
  }

  hookProc = koffi.register((nCode: number, wParam: number, lParam: unknown) => {
    try {
      // When paused (settings page recording a new hotkey), pass all events through
      if (hookPaused) {
        return CallNextHookEx(hookHandle, nCode, wParam, lParam);
      }

      const event = nCode === HC_ACTION
        ? koffi.decode(lParam, KBDLLHOOKSTRUCT)
        : null;

      // Pass through injected events — these are our synthetic key-ups
      if (event && (event.flags & LLKHF_INJECTED)) {
        return CallNextHookEx(hookHandle, nCode, wParam, lParam);
      }

      // Hotkey matching
      const action = getHotkeyEventAction({
        nCode,
        message: Number(wParam),
        vkCode: event?.vkCode ?? 0,
        targetVk: currentVk,
        wasPressed,
      });

      wasPressed = action.nextWasPressed;
      if (action.triggerPressed) {
        pressCallback?.();
        // Inject synthetic key-up so Windows doesn't think the hotkey is stuck.
        // The injected event has LLKHF_INJECTED set → our hook passes it through.
        injectKeyUp();
      }
      if (action.triggerReleased) releaseCallback?.();

      if (action.consume) {
        return 1;
      }

      // Esc key handling — detect but don't consume
      if (nCode === HC_ACTION && event?.vkCode === VK_ESCAPE) {
        const msg = Number(wParam);
        if (KEY_DOWN_MESSAGES.has(msg)) {
          if (!wasEscPressed) {
            wasEscPressed = true;
            escCallback?.();
          }
        } else if (KEY_UP_MESSAGES.has(msg)) {
          wasEscPressed = false;
        }
      }
    } catch (err) {
      console.error('[Hotkey] Keyboard hook error:', err);
    }

    return CallNextHookEx(hookHandle, nCode, wParam, lParam);
  }, koffi.pointer(LowLevelKeyboardProc));

  const moduleHandle = GetModuleHandleW(null);
  hookHandle = SetWindowsHookExW(WH_KEYBOARD_LL, hookProc, moduleHandle, 0);

  if (!hookHandle) {
    koffi.unregister(hookProc);
    hookProc = null;
    throw new Error('Failed to install keyboard hook');
  }
}

export function stopHotkey(): void {
  if (hookHandle) {
    UnhookWindowsHookEx(hookHandle);
    hookHandle = null;
  }

  if (hookProc) {
    koffi.unregister(hookProc);
    hookProc = null;
  }

  wasPressed = false;
  wasEscPressed = false;
}

export async function waitForHotkeyRelease(timeoutMs = 150): Promise<void> {
  const startedAt = Date.now();

  while ((GetAsyncKeyState(currentVk) & 0x8000) !== 0) {
    if (Date.now() - startedAt >= timeoutMs) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 8));
  }
}
