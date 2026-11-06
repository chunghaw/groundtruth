/**
 * "▶ 30-sec briefing": fetch a spoken script from the proxy, play the ElevenLabs audio if there is any,
 * otherwise speak it sentence by sentence with the host's speech engine. Captions follow along.
 * The host supplies the plumbing (extension: background fetch + chrome.tts; web demo: fetch + speechSynthesis).
 */
import { h } from './dom';

export interface BriefingDeps {
  readonly fetchBriefing: (gnafId: string) => Promise<{ readonly script: string; readonly audio: ArrayBuffer | null }>;
  /** Speak one sentence; resolve when it has finished (or was cancelled). */
  readonly speak: (sentence: string) => Promise<void>;
  readonly cancelSpeech: () => void;
}

type Phase = 'idle' | 'loading' | 'playing';

export function splitSentences(script: string): string[] {
  return (script.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? []).map((s) => s.trim()).filter(Boolean);
}

/** Which sentence is playing at progress `frac` (0-1), weighting sentences by length. */
export function sentenceAtFraction(sentences: readonly string[], frac: number): number {
  const total = sentences.reduce((n, s) => n + s.length, 0);
  if (!total) return 0;
  let acc = 0;
  for (let i = 0; i < sentences.length; i++) {
    acc += sentences[i].length;
    if (frac * total < acc) return i;
  }
  return sentences.length - 1;
}

export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

const IDLE_LABEL = '▶ 30-sec briefing';

export class BriefingControl {
  private phase: Phase = 'idle';
  private run = 0;
  private gnafId: string | null = null;
  private audio: HTMLAudioElement | null = null;
  private audioUrl: string | null = null;
  private readonly btn: HTMLButtonElement;
  private readonly cap: HTMLElement;

  constructor(private readonly deps: BriefingDeps) {
    this.btn = h('button', { class: 'brief-btn', type: 'button', onClick: () => this.toggle() }, IDLE_LABEL) as HTMLButtonElement;
    this.cap = h('div', { class: 'brief-cap', role: 'region', 'aria-label': 'Briefing captions' });
    this.cap.hidden = true;
    this.paint();
  }

  /** The header button for this home. A different home stops any briefing in progress. */
  button(gnafId: string): HTMLButtonElement {
    if (this.gnafId !== null && this.gnafId !== gnafId) this.stop();
    this.gnafId = gnafId;
    return this.btn;
  }

  captions(): HTMLElement { return this.cap; }

  /** Stop only if something is playing or showing (cheap to call on every render). */
  release(): void {
    if (this.phase !== 'idle' || !this.cap.hidden) this.stop();
  }

  stop(): void {
    this.run++;
    this.deps.cancelSpeech();
    this.releaseAudio();
    this.phase = 'idle';
    this.cap.hidden = true;
    this.cap.replaceChildren();
    this.paint();
  }

  private toggle(): void {
    if (this.phase === 'idle') void this.play();
    else this.stop();
  }

  private paint(): void {
    this.btn.textContent = this.phase === 'idle' ? IDLE_LABEL : this.phase === 'loading' ? '… Preparing' : '■ Stop';
    this.btn.setAttribute('aria-label', this.phase === 'idle' ? 'Play a 30-second spoken briefing' : 'Stop the briefing');
    this.btn.setAttribute('aria-pressed', String(this.phase !== 'idle'));
  }

  private showCaptions(sentences: readonly string[], now: number): void {
    this.cap.hidden = false;
    this.cap.replaceChildren(...sentences.map((s, i) => h('span', { class: i === now ? 'now' : i < now ? 'done' : '' }, s)));
  }

  private async play(): Promise<void> {
    const gnafId = this.gnafId;
    if (!gnafId) return;
    const run = ++this.run;
    this.phase = 'loading';
    this.paint();
    let briefing: { script: string; audio: ArrayBuffer | null };
    try {
      briefing = await this.deps.fetchBriefing(gnafId);
    } catch {
      if (run !== this.run) return;
      this.phase = 'idle';
      this.paint();
      this.cap.hidden = false;
      this.cap.replaceChildren(h('span', { class: 'err-line' }, 'Briefing unavailable right now. Try again shortly.'));
      return;
    }
    if (run !== this.run) return;
    const sentences = splitSentences(briefing.script);
    this.phase = 'playing';
    this.paint();
    this.showCaptions(sentences, 0);
    let played = false;
    if (briefing.audio) {
      try { await this.playAudio(briefing.audio, sentences, run); played = true; } catch { /* fall back to speech */ }
    }
    if (!played) await this.speakAll(sentences, run);
    if (run === this.run) this.stop();
  }

  private async speakAll(sentences: readonly string[], run: number): Promise<void> {
    for (let i = 0; i < sentences.length; i++) {
      if (run !== this.run) return;
      this.showCaptions(sentences, i);
      try { await this.deps.speak(sentences[i]); } catch { return; }
    }
  }

  /** <audio> from a blob URL; captions follow currentTime. Rejects if the page blocks playback. */
  private playAudio(bytes: ArrayBuffer, sentences: readonly string[], run: number): Promise<void> {
    this.releaseAudio();
    this.audioUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
    const audio = new Audio(this.audioUrl);
    this.audio = audio;
    return new Promise<void>((resolve, reject) => {
      audio.addEventListener('timeupdate', () => {
        if (run === this.run && audio.duration > 0) this.showCaptions(sentences, sentenceAtFraction(sentences, audio.currentTime / audio.duration));
      });
      audio.addEventListener('ended', () => resolve());
      audio.addEventListener('pause', () => { if (run !== this.run) resolve(); });
      audio.addEventListener('error', () => reject(new Error('audio error')));
      audio.play().catch(reject);
    });
  }

  private releaseAudio(): void {
    if (this.audio) { this.audio.pause(); this.audio = null; }
    if (this.audioUrl) { URL.revokeObjectURL(this.audioUrl); this.audioUrl = null; }
  }
}

export const BRIEFING_CSS = /* css */ `
.brief-btn { background: #f5f1e6; color: var(--ink); border: 0; border-radius: 999px; padding: 6px 10px; cursor: pointer; font: 700 11px/1 var(--mono); letter-spacing: .04em; white-space: nowrap; transition: background var(--dur) var(--ease), transform var(--dur) var(--ease); }
.brief-btn:hover { background: #fff; }
.brief-btn:active { transform: translateY(1px); }
.brief-btn[aria-pressed="true"] { background: var(--bad); color: #fff; }
.brief-cap { position: sticky; top: 52px; z-index: 1; background: var(--ink); color: #c9d3df; border-radius: 10px; padding: 10px 12px; font: 13px/1.5 var(--sans); box-shadow: 0 8px 20px -10px rgba(14,23,38,.6); }
.brief-cap span + span::before { content: " "; }
.brief-cap .now { color: #fff; font-weight: 600; }
.brief-cap .done { color: #8193a8; }
.brief-cap .err-line { color: #ffb4b8; }
@media (prefers-reduced-motion: reduce) { .brief-btn { transition: none; } }
`;
