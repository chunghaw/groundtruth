/**
 * Drives the Groundtruth panel, which lives in a CLOSED shadow root that Playwright locators cannot pierce.
 * We go through CDP: find <groundtruth-panel>, push its shadow root to the frontend, then querySelector inside it.
 * Works for the extension content script (isolated world) and the web build on /demo alike.
 */
import type { CDPSession, Page } from 'playwright';

export interface Point { readonly x: number; readonly y: number }

interface DomNode {
  readonly nodeId: number;
  readonly backendNodeId: number;
  readonly nodeName: string;
  readonly children?: DomNode[];
  readonly shadowRoots?: DomNode[];
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class PanelDriver {
  private readonly page: Page;
  private readonly cdp: CDPSession;

  constructor(page: Page, cdp: CDPSession) {
    this.page = page;
    this.cdp = cdp;
  }

  static async attach(page: Page): Promise<PanelDriver> {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('DOM.enable');
    return new PanelDriver(page, cdp);
  }

  private async shadowRootId(): Promise<number | null> {
    const { root } = (await this.cdp.send('DOM.getDocument', { depth: 0 })) as { root: DomNode };
    const { nodeId: host } = (await this.cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'groundtruth-panel' })) as { nodeId: number };
    if (!host) return null;
    const { node } = (await this.cdp.send('DOM.describeNode', { nodeId: host, depth: 1, pierce: true })) as { node: DomNode };
    const sr = node.shadowRoots?.[0];
    if (!sr) return null;
    const { nodeIds } = (await this.cdp.send('DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds: [sr.backendNodeId] })) as { nodeIds: number[] };
    return nodeIds[0] || null;
  }

  /** nodeId of the first match inside the panel's shadow root, or null. */
  async query(selector: string): Promise<number | null> {
    try {
      const sr = await this.shadowRootId();
      if (!sr) return null;
      const { nodeId } = (await this.cdp.send('DOM.querySelector', { nodeId: sr, selector })) as { nodeId: number };
      return nodeId || null;
    } catch {
      return null; // DOM changed mid-query (panel re-render); caller polls again
    }
  }

  async count(selector: string): Promise<number> {
    const sr = await this.shadowRootId();
    if (!sr) return 0;
    const { nodeIds } = (await this.cdp.send('DOM.querySelectorAll', { nodeId: sr, selector })) as { nodeIds: number[] };
    return nodeIds.length;
  }

  private async call<T>(nodeId: number, fn: string): Promise<T | null> {
    try {
      const { object } = (await this.cdp.send('DOM.resolveNode', { nodeId })) as { object: { objectId: string } };
      const { result } = (await this.cdp.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: fn, returnByValue: true, awaitPromise: true })) as { result: { value: T } };
      return result.value;
    } catch {
      return null;
    }
  }

  async isVisible(nodeId: number): Promise<boolean> {
    return (await this.call<boolean>(nodeId, 'function(){const r=this.getBoundingClientRect();return r.width>0&&r.height>0;}')) === true;
  }

  /** Poll until the selector exists and is visible (optionally matching text). Deterministic: no fixed sleeps. */
  async waitFor(selector: string, timeoutMs = 15000, text?: RegExp): Promise<number> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const id = await this.query(selector);
      if (id && (await this.isVisible(id))) {
        if (!text) return id;
        const t = await this.text(id);
        if (t && text.test(t)) return id;
      }
      await sleep(200);
    }
    throw new Error(`panel selector not found within ${timeoutMs}ms: ${selector}${text ? ` ~ ${text}` : ''}`);
  }

  async text(nodeId: number): Promise<string | null> {
    return this.call<string>(nodeId, 'function(){return this.textContent;}');
  }

  /** Smooth-scroll the element into view inside the panel's scroll container. */
  async scrollTo(selector: string, block: 'start' | 'center' | 'end' = 'start', timeoutMs = 15000): Promise<void> {
    const id = await this.waitFor(selector, timeoutMs);
    await this.call(id, `function(){this.scrollIntoView({behavior:'smooth',block:'${block}'});return new Promise(r=>setTimeout(r,700));}`);
  }

  async center(selector: string, timeoutMs = 15000): Promise<Point> {
    const id = await this.waitFor(selector, timeoutMs);
    await this.call(id, "function(){this.scrollIntoView({behavior:'smooth',block:'nearest'});return new Promise(r=>setTimeout(r,450));}");
    const { quads } = (await this.cdp.send('DOM.getContentQuads', { nodeId: id })) as { quads: number[][] };
    const q = quads[0];
    if (!q) throw new Error(`panel element has no box: ${selector}`);
    return { x: (q[0] + q[2] + q[4] + q[6]) / 4, y: (q[1] + q[3] + q[5] + q[7]) / 4 };
  }

  get pageRef(): Page { return this.page; }
}
