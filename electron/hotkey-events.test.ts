import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Use createRequire for CommonJS-style module resolution which handles .ts files
const require = createRequire(import.meta.url);
const {
  VK_RMENU,
  WM_KEYDOWN,
  WM_KEYUP,
  WM_SYSKEYDOWN,
  WM_SYSKEYUP,
  getHotkeyEventAction,
} = require('./hotkey-events');

test('right alt key-down is consumed and triggers once until release', () => {
  const first = getHotkeyEventAction({
    nCode: 0,
    message: WM_SYSKEYDOWN,
    vkCode: VK_RMENU,
    targetVk: VK_RMENU,
    wasPressed: false,
  });

  assert.deepEqual(first, {
    consume: true,
    nextWasPressed: true,
    triggerPressed: true,
    triggerReleased: false,
  });

  const repeat = getHotkeyEventAction({
    nCode: 0,
    message: WM_KEYDOWN,
    vkCode: VK_RMENU,
    targetVk: VK_RMENU,
    wasPressed: true,
  });

  assert.deepEqual(repeat, {
    consume: true,
    nextWasPressed: true,
    triggerPressed: false,
    triggerReleased: false,
  });
});

test('right alt key-up is consumed and resets pressed state', () => {
  const result = getHotkeyEventAction({
    nCode: 0,
    message: WM_SYSKEYUP,
    vkCode: VK_RMENU,
    targetVk: VK_RMENU,
    wasPressed: true,
  });

  assert.deepEqual(result, {
    consume: true,
    nextWasPressed: false,
    triggerPressed: false,
    triggerReleased: true,
  });
});

test('non-right-alt and inactive hook events pass through unchanged', () => {
  assert.deepEqual(getHotkeyEventAction({
    nCode: 0,
    message: WM_KEYDOWN,
    vkCode: 0x41,
    targetVk: VK_RMENU,
    wasPressed: true,
  }), {
    consume: false,
    nextWasPressed: true,
    triggerPressed: false,
    triggerReleased: false,
  });

  assert.deepEqual(getHotkeyEventAction({
    nCode: -1,
    message: WM_SYSKEYUP,
    vkCode: VK_RMENU,
    targetVk: VK_RMENU,
    wasPressed: true,
  }), {
    consume: false,
    nextWasPressed: true,
    triggerPressed: false,
    triggerReleased: false,
  });
});
