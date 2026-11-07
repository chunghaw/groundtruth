/** Content-script host: data via the background worker, map inside an extension-page iframe. */
import type { Context3D, Context3DHost, HeadroomInsight, MapController, Overlay } from './types';
import { isContext3D } from './types';

const reducedMotion = (): boolean => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

export const extensionContext3DHost: Context3DHost = {
  async load(gnafId: string): Promise<Context3D> {
    const r = (await chrome.runtime.sendMessage({ type: 'gt:context3d', gnafId })) as { ok: boolean; data?: unknown; error?: string } | undefined;
    if (!r?.ok || !isContext3D(r.data)) throw new Error(r?.error ?? 'Extension background not responding.');
    return r.data;
  },
  mount(stage: HTMLElement, data: Context3D): Promise<MapController> {
    const src = chrome.runtime.getURL('map3d.html');
    const target = new URL(src).origin;
    const frame = document.createElement('iframe');
    frame.src = src;
    frame.title = '3D model: your home and what could legally rise next door';
    frame.setAttribute('style', 'border:0;width:100%;height:100%;display:block');
    const overlays: Partial<Record<Overlay, boolean>> = {};
    return new Promise((resolve, reject) => {
      let settled = false;
      const onMsg = (e: MessageEvent) => {
        if (e.source !== frame.contentWindow) return;
        const t = (e.data as { type?: string })?.type;
        // 'ready' fires again if the panel re-attaches the iframe (which reloads it): resend state.
        if (t === 'gt3d:ready') {
          frame.contentWindow?.postMessage({ type: 'gt3d:data', data, reducedMotion: reducedMotion() }, target);
          for (const [layer, on] of Object.entries(overlays)) frame.contentWindow?.postMessage({ type: 'gt3d:overlay', layer, on }, target);
        }
        if (t === 'gt3d:rendered' && !settled) {
          settled = true;
          const insight = (e.data as { insight?: HeadroomInsight | null }).insight ?? null;
          resolve({ ...ctl, insight });
        }
        if (t === 'gt3d:error' && !settled) { settled = true; reject(new Error((e.data as { message?: string }).message ?? 'Map failed')); }
      };
      const ctl: MapController = {
        setOverlay(layer, on) { overlays[layer] = on; frame.contentWindow?.postMessage({ type: 'gt3d:overlay', layer, on }, target); },
        resetView() { frame.contentWindow?.postMessage({ type: 'gt3d:reset' }, target); },
        destroy() { window.removeEventListener('message', onMsg); frame.remove(); },
      };
      window.addEventListener('message', onMsg);
      stage.append(frame);
    });
  },
};
