/** Shot-list action runner. Every wait is selector-based; `pause`/`at` exist only to pace on-camera motion to the voiceover. */
import type { Page } from 'playwright';
import type { PanelDriver, Point } from './panel.ts';

export interface Action {
  readonly do: string;
  readonly at?: number;          // seconds after the beat's on-camera mark to start this action
  readonly url?: string;
  readonly selector?: string;
  readonly text?: string;
  readonly value?: string;
  readonly match?: string;       // regex the element text must match (waitPanel)
  readonly ms?: number;
  readonly timeout?: number;
  readonly optional?: boolean;   // missing element -> warning instead of failure
  readonly block?: 'start' | 'center' | 'end';
  readonly y?: number;
}

export interface RunContext {
  readonly page: Page;
  readonly panel: PanelDriver;
  readonly blockers: readonly string[];
  readonly sinceMark: () => number;
  readonly warn: (msg: string) => void;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
let cursor: Point = { x: 640, y: 360 };

async function moveTo(page: Page, p: Point): Promise<void> {
  const dist = Math.hypot(p.x - cursor.x, p.y - cursor.y);
  await page.mouse.move(p.x, p.y, { steps: Math.max(8, Math.min(40, Math.round(dist / 18))) });
  cursor = p;
}

async function pageCenter(page: Page, selector: string, timeout: number): Promise<Point> {
  const loc = page.locator(selector).first();
  await loc.waitFor({ state: 'visible', timeout });
  await loc.scrollIntoViewIfNeeded();
  const box = await loc.boundingBox();
  if (!box) throw new Error(`no box for page selector ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Refuse to interact with consent/sign-in walls: capture is read-only browsing. */
async function assertNotBlocked(ctx: RunContext): Promise<void> {
  const title = await ctx.page.title();
  if (/pardon|access denied|are you a robot|verify you are human/i.test(title)) {
    throw new Error(`site served a bot/consent wall ("${title}"). Re-run with --target demo`);
  }
  for (const sel of ctx.blockers) {
    if (await ctx.page.locator(sel).first().isVisible().catch(() => false)) {
      throw new Error(`blocking banner visible (${sel}); we never click consent. Re-run with --target demo`);
    }
  }
}

export async function runAction(ctx: RunContext, a: Action): Promise<void> {
  if (a.at !== undefined) {
    const wait = a.at - ctx.sinceMark();
    if (wait > 0) await sleep(wait * 1000);
  }
  const { page, panel } = ctx;
  const timeout = a.timeout ?? (a.optional ? 4000 : 20000);
  try {
    switch (a.do) {
      case 'goto':
        await page.goto(a.url!, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await assertNotBlocked(ctx);
        return;
      case 'waitPage':
        await page.locator(a.selector!).first().waitFor({ state: 'visible', timeout });
        return;
      case 'waitPanel':
        await panel.waitFor(a.selector!, timeout, a.match ? new RegExp(a.match, 'i') : undefined);
        return;
      case 'clickPanel':
        await moveTo(page, await panel.center(a.selector!, timeout));
        await sleep(150);
        await page.mouse.click(cursor.x, cursor.y);
        return;
      case 'hoverPanel':
        await moveTo(page, await panel.center(a.selector!, timeout));
        return;
      case 'typePanel':
        await moveTo(page, await panel.center(a.selector!, timeout));
        await page.mouse.click(cursor.x, cursor.y);
        await page.keyboard.type(a.text!, { delay: 110 });
        return;
      case 'clickPage':
        await moveTo(page, await pageCenter(page, a.selector!, timeout));
        await sleep(150);
        await page.mouse.click(cursor.x, cursor.y);
        return;
      case 'hoverPage':
        await moveTo(page, await pageCenter(page, a.selector!, timeout));
        return;
      case 'typePage':
        await moveTo(page, await pageCenter(page, a.selector!, timeout));
        await page.mouse.click(cursor.x, cursor.y);
        await page.keyboard.type(a.text!, { delay: 90 });
        return;
      case 'selectPage':
        await moveTo(page, await pageCenter(page, a.selector!, timeout));
        await page.selectOption(a.selector!, a.value!);
        return;
      case 'scrollPanelTo':
        await panel.scrollTo(a.selector!, a.block ?? 'start', timeout);
        return;
      case 'scrollPage':
        await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), a.y ?? 0);
        await sleep(700);
        return;
      case 'mouseTo':
        await moveTo(page, { x: Number(a.value?.split(',')[0] ?? 640), y: Number(a.value?.split(',')[1] ?? 360) });
        return;
      case 'pause':
        await sleep(a.ms ?? 500);
        return;
      default:
        throw new Error(`unknown action "${a.do}"`);
    }
  } catch (e) {
    if (a.optional) { ctx.warn(`optional ${a.do} ${a.selector ?? ''} skipped: ${(e as Error).message}`); return; }
    throw e;
  }
}
