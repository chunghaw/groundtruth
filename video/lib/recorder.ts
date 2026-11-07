/**
 * Sharp per-beat recording via CDP Page.screencast (JPEG frames + timestamps -> ffconcat).
 * Playwright's recordVideo is VP8 at ~1 Mbit/s, which blurs the panel's small text; this keeps it crisp.
 * Frames arrive only when pixels change, so each frame's duration comes from the next frame's timestamp.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { CDPSession, Page } from 'playwright';

interface Frame { readonly file: string; readonly t: number }

export class BeatRecorder {
  private readonly dir: string;
  private readonly cdp: CDPSession;
  private frames: Frame[] = [];
  private markT = 0;
  private n = 0;

  private constructor(cdp: CDPSession, dir: string) {
    this.cdp = cdp;
    this.dir = dir;
  }

  static async start(page: Page, dir: string, size: { width: number; height: number }): Promise<BeatRecorder> {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(join(dir, 'frames'), { recursive: true });
    const cdp = await page.context().newCDPSession(page);
    const rec = new BeatRecorder(cdp, dir);
    cdp.on('Page.screencastFrame', (ev: { data: string; sessionId: number; metadata: { timestamp?: number } }) => {
      const file = join(rec.dir, 'frames', `${String(rec.n++).padStart(6, '0')}.jpg`);
      writeFileSync(file, Buffer.from(ev.data, 'base64'));
      rec.frames = [...rec.frames, { file, t: ev.metadata.timestamp ?? Date.now() / 1000 }];
      cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => { /* page closing */ });
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: size.width, maxHeight: size.height, everyNthFrame: 1 });
    rec.markT = Date.now() / 1000;
    return rec;
  }

  /** On-camera time starts here (setup actions before this are cut). */
  mark(): void { this.markT = Date.now() / 1000; }

  sinceMark(): number { return Date.now() / 1000 - this.markT; }

  /** Stop and write frames.ffconcat. Returns the recorded on-camera seconds. */
  async stop(): Promise<{ concat: string; seconds: number; frames: number }> {
    const endT = Date.now() / 1000;
    await this.cdp.send('Page.stopScreencast').catch(() => { /* already gone */ });
    await this.cdp.detach().catch(() => { /* ignore */ });
    const all = [...this.frames].sort((a, b) => a.t - b.t);
    if (!all.length) throw new Error(`no frames captured in ${this.dir} (window hidden or page blank?)`);
    // Last frame at/before the mark is the opening frame; then everything after it.
    const firstIdx = Math.max(0, all.findLastIndex((f) => f.t <= this.markT));
    const used = all.slice(firstIdx);
    const lines = ['ffconcat version 1.0'];
    used.forEach((f, i) => {
      const start = Math.max(f.t, this.markT);
      const next = i + 1 < used.length ? used[i + 1].t : endT;
      const dur = Math.max(0.001, next - start);
      lines.push(`file '${relative(this.dir, f.file)}'`, `duration ${dur.toFixed(4)}`);
    });
    lines.push(`file '${relative(this.dir, used[used.length - 1].file)}'`);
    const concat = join(this.dir, 'frames.ffconcat');
    writeFileSync(concat, lines.join('\n') + '\n');
    return { concat, seconds: endT - this.markT, frames: used.length };
  }
}
