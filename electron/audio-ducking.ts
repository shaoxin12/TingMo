import { spawn, ChildProcess } from 'child_process';

// ── Inline PowerShell COM backend (IAudioEndpointVolume, no OSD) ──
const PS_SCRIPT = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
    int f(); int g(); int h(); int i();
    int SetMasterVolumeLevelScalar(float level, Guid ctx);
    int j();
    int GetMasterVolumeLevelScalar(out float level);
    int k(); int l(); int m(); int n();
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, Guid ctx);
    int GetMute(out bool mute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
    int Activate(ref Guid iid, int clsCtx, int activationParams, out IAudioEndpointVolume epv);
}
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
    int f();
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
}
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumeratorComObject { }
public static class Audio {
    static IAudioEndpointVolume Vol() {
        var enumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
        IMMDevice dev = null;
        Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out dev));
        IAudioEndpointVolume epv = null;
        var iid = typeof(IAudioEndpointVolume).GUID;
        Marshal.ThrowExceptionForHR(dev.Activate(ref iid, 23, 0, out epv));
        return epv;
    }
    public static bool Mute {
        get { bool m; Marshal.ThrowExceptionForHR(Vol().GetMute(out m)); return m; }
        set { Marshal.ThrowExceptionForHR(Vol().SetMute(value, Guid.Empty)); }
    }
}
'@
Write-Host "READY"
while ($true) {
    $cmd = [Console]::In.ReadLine()
    if ($cmd -eq $null) { break }
    try {
        if ($cmd -eq "mute") { [Audio]::Mute = $true; Write-Host "OK" }
        elseif ($cmd -eq "unmute") { [Audio]::Mute = $false; Write-Host "OK" }
        elseif ($cmd -eq "state") { if ([Audio]::Mute) { Write-Host "1" } else { Write-Host "0" } }
        else { Write-Host "ERR:unknown" }
    } catch { Write-Host ("ERR:" + $_.Exception.Message) }
}
`;

// ── Persistent PowerShell process ──────────────────────────────
let psProc: ChildProcess | null = null;
let ready = false;
let pendingResolve: ((v: string) => void) | null = null;

function getPS(): Promise<void> {
  if (ready && psProc && !psProc.killed) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    if (psProc) { try { psProc.kill(); } catch { /* ignore */ } }

    psProc = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-Command', PS_SCRIPT,
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    let lineBuf = '';
    psProc.stdout!.on('data', (data: Buffer) => {
      lineBuf += data.toString();
      const lines = lineBuf.split('\n');
      lineBuf = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (!ready && trimmed === 'READY') { ready = true; resolve(); continue; }
        if (pendingResolve) { const cb = pendingResolve; pendingResolve = null; cb(trimmed); }
      }
    });

    psProc.stderr!.on('data', (d: Buffer) => {
      console.error('[AudioDucking]', d.toString().trim());
    });

    psProc.on('exit', () => {
      psProc = null; ready = false;
      if (pendingResolve) { pendingResolve('ERR:ps exited'); pendingResolve = null; }
    });

    setTimeout(() => { if (!ready) reject(new Error('Audio PS timeout')); }, 8000);
  });
}

function sendCmd(cmd: string): Promise<string> {
  return getPS().then(() => new Promise<string>((resolve) => {
    pendingResolve = resolve;
    psProc!.stdin!.write(cmd + '\n');
  }));
}

// ── State ──────────────────────────────────────────────────────
let ducking = false;
let wasMutedBefore: boolean | null = null;

// ── Public API ──────────────────────────────────────────────────
export async function duckSystemAudio(): Promise<void> {
  if (ducking) return;
  ducking = true;
  const state = await sendCmd('state');
  wasMutedBefore = state === '1';
  if (!wasMutedBefore) await sendCmd('mute');
}

export async function unduckSystemAudio(): Promise<void> {
  if (!ducking) return;
  ducking = false;
  if (!wasMutedBefore) await sendCmd('unmute');
  wasMutedBefore = null;
}
