import type { BgRequest, LookupResult } from './api-types';
import { getFacts, lookup } from './lookup';
import './context3d/background-handler';
import './briefing/background-handler';

chrome.runtime.onMessage.addListener((msg: BgRequest, _sender, sendResponse) => {
  if (msg?.type === 'gt:lookup') {
    lookup(msg.key, msg.req).then(sendResponse);
    return true;
  }
  if (msg?.type === 'gt:facts') {
    getFacts(msg.gnafId)
      .then((facts) => sendResponse({ ok: true, facts }))
      .catch((e: Error) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  return false;
});

export type { LookupResult };
