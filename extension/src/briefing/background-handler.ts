/**
 * Background side of the 30-second briefing (MV3): fetch the briefing from the proxy here (host permissions live
 * in the service worker), hand audio to the content script as base64, and speak with chrome.tts as the fallback.
 */
import { fetchBriefing } from '../api';
import { toBase64 } from '../content/briefing';

export type BriefingBgRequest =
  | { readonly type: 'gt:briefing'; readonly gnafId: string }
  | { readonly type: 'gt:tts'; readonly text: string }
  | { readonly type: 'gt:tts-stop' };

export type BriefingBgReply = { readonly ok: true; readonly script: string; readonly audioB64: string | null } | { readonly ok: false; readonly error: string };

const DONE = new Set(['end', 'interrupted', 'cancelled', 'error']);

function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!chrome.tts) { resolve(); return; }
    chrome.tts.speak(text.slice(0, 1000), {
      lang: 'en-AU', rate: 1.0, enqueue: false,
      onEvent: (e) => { if (DONE.has(e.type)) resolve(); },
    }, () => { if (chrome.runtime.lastError) resolve(); });
  });
}

chrome.runtime.onMessage.addListener((msg: BriefingBgRequest, _sender, sendResponse) => {
  if (msg?.type === 'gt:briefing' && typeof msg.gnafId === 'string') {
    fetchBriefing(msg.gnafId)
      .then((b) => sendResponse({ ok: true, script: b.script, audioB64: b.audio ? toBase64(b.audio) : null } satisfies BriefingBgReply))
      .catch((e: Error) => sendResponse({ ok: false, error: e.message } satisfies BriefingBgReply));
    return true;
  }
  if (msg?.type === 'gt:tts' && typeof msg.text === 'string') {
    speak(msg.text).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg?.type === 'gt:tts-stop') {
    chrome.tts?.stop();
    return false;
  }
  return false;
});
