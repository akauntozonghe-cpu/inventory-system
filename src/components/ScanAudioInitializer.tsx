"use client";
import { useEffect } from "react";
import { primeScanAudio } from "@/lib/scan-feedback";

export default function ScanAudioInitializer() {
  useEffect(() => {
    window.addEventListener("pointerdown", primeScanAudio, true);
    window.addEventListener("keydown", primeScanAudio, true);
    return () => { window.removeEventListener("pointerdown", primeScanAudio, true); window.removeEventListener("keydown", primeScanAudio, true); };
  }, []);
  return null;
}
