export function createScanGate() {
    let last = { code: "", at: -Infinity };
    let acceptedAt = -Infinity;
    return (code: string, now: number, paused: boolean) => {
        const duplicate = code === last.code && now - last.at < 1200;
        if (!code) {
            if (paused)
                last = { ...last, at: now };
            return false;
        }
        if (paused || duplicate) {
            last = { code, at: now };
            return false;
        }
        // A new label seen during the short throttle must remain eligible next frame.
        if (now - acceptedAt < 250)
            return false;
        last = { code, at: now };
        acceptedAt = now;
        return true;
    };
}
