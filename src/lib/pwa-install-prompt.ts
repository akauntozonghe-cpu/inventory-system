export type NativeInstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
export type InstallState = "waiting" | "ready" | "busy" | "accepted" | "dismissed" | "failed" | "timeout" | "installed";

let pending: NativeInstallEvent | null = null;
let state: InstallState = "waiting";
let attempt = 0;
const listeners = new Set<() => void>();
function publish(next: InstallState) { state = next; for (const listener of listeners) listener(); }
export function subscribeInstall(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function getInstallState() { return state; }
export function getServerInstallState(): InstallState { return "waiting"; }
export function captureInstallPrompt(event: NativeInstallEvent) {
  event.preventDefault(); pending = event;
  if (state !== "busy") publish("ready");
}
export function markNativeInstalled() { attempt++; pending = null; publish("installed"); }

export async function requestNativeInstall() {
  if (state === "busy") return;
  const event = pending;
  if (!event) return;
  pending = null;
  const currentAttempt = ++attempt;
  publish("busy");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Call prompt in the original button event, before any await, to retain activation.
    const opened = event.prompt();
    const result = await Promise.race([
      Promise.resolve(opened).then(() => event.userChoice).then(choice => choice.outcome),
      new Promise<"timeout"> (resolve => { timer = setTimeout(() => resolve("timeout"), 15000); }),
    ]);
    if (currentAttempt === attempt) publish(result);
  } catch {
    if (currentAttempt === attempt) publish("failed");
  } finally { clearTimeout(timer); }
}
