/** Web-demo plumbing for the briefing: same-origin fetch + window.speechSynthesis. */
import { fetchBriefing } from '../api';
import type { BriefingDeps } from '../content/briefing';

const READ_MS_PER_WORD = 380;

function pickVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
  const voices = synth.getVoices();
  return voices.find((v) => v.lang === 'en-AU') ?? voices.find((v) => v.lang.startsWith('en')) ?? null;
}

export const webBriefingHost: BriefingDeps = {
  fetchBriefing: (gnafId) => fetchBriefing(gnafId),
  speak(text) {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    // No speech engine: still pace the captions at reading speed.
    if (!synth) return new Promise((r) => setTimeout(r, text.split(/\s+/).length * READ_MS_PER_WORD));
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-AU';
      const voice = pickVoice(synth);
      if (voice) u.voice = voice;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      synth.speak(u);
    });
  },
  cancelSpeech() {
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
  },
};
