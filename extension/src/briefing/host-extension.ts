/** Content-script plumbing for the briefing: everything goes through the background service worker. */
import type { BriefingDeps } from '../content/briefing';
import { fromBase64 } from '../content/briefing';
import type { BriefingBgReply, BriefingBgRequest } from './background-handler';

const send = <T>(msg: BriefingBgRequest): Promise<T> => chrome.runtime.sendMessage(msg) as Promise<T>;

export const extensionBriefingHost: BriefingDeps = {
  async fetchBriefing(gnafId) {
    const r = await send<BriefingBgReply | undefined>({ type: 'gt:briefing', gnafId });
    if (!r || !r.ok) throw new Error(r && !r.ok ? r.error : 'Extension background not responding.');
    return { script: r.script, audio: r.audioB64 ? fromBase64(r.audioB64) : null };
  },
  async speak(text) {
    await send<unknown>({ type: 'gt:tts', text });
  },
  cancelSpeech() {
    send<unknown>({ type: 'gt:tts-stop' }).catch(() => { /* background asleep: nothing to stop */ });
  },
};
