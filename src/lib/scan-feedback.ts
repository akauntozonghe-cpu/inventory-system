let context: AudioContext | undefined;
let enabled = true;
let lastCode = "", lastPlayedAt = 0;

export function scanSoundEnabled() {
  try { enabled = localStorage.getItem("barcode-sound-enabled") !== "off"; } catch { /* Use the in-memory preference. */ }
  return enabled;
}
export function setScanSoundEnabled(value: boolean) {
  enabled = value;
  try { localStorage.setItem("barcode-sound-enabled", value ? "on" : "off"); } catch { /* Reading remains available if storage is blocked. */ }
}
/** Called synchronously by the user's camera-open click, before a camera decode. */
export function primeScanAudio() {
  if (!scanSoundEnabled()) return;
  const Audio = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Audio) return;
  try {
    if (!context || context.state === "closed") context = new Audio();
    if (context.state === "suspended") void context.resume().catch(() => {});
  } catch { /* Visual feedback still works. */ }
}
export function playScanBeep(code: string) {
  const now = Date.now();
  if (!scanSoundEnabled() || !context || context.state !== "running" || (code === lastCode && now - lastPlayedAt < 900)) return;
  lastCode = code; lastPlayedAt = now;
  try {
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(1800, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.14, context.currentTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.085);
    oscillator.connect(gain).connect(context.destination);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(); oscillator.stop(context.currentTime + 0.09);
  } catch { /* Audio must never block accepting a scan. */ }
}
