/** Visible fake cursor (screencasts don't include the OS pointer). Injected into the page's main world. */
export const CURSOR_INIT_SCRIPT = `(() => {
  if (window.__gtCursor) return; window.__gtCursor = true;
  const make = () => {
    if (document.getElementById('__gt_cursor')) return;
    const c = document.createElement('div');
    c.id = '__gt_cursor';
    c.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;' +
      'background:rgba(255,196,0,.35);border:2px solid rgba(20,24,29,.85);box-shadow:0 1px 6px rgba(0,0,0,.35);' +
      'pointer-events:none;z-index:2147483647;transition:transform .12s ease-out;transform:translate(-100px,-100px)';
    document.documentElement.appendChild(c);
    let x = -100, y = -100;
    addEventListener('mousemove', (e) => { x = e.clientX; y = e.clientY; c.style.transform = 'translate(' + x + 'px,' + y + 'px)'; }, true);
    addEventListener('mousedown', () => { c.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(.7)'; }, true);
    addEventListener('mouseup', () => { c.style.transform = 'translate(' + x + 'px,' + y + 'px)'; }, true);
  };
  if (document.documentElement) make(); else addEventListener('DOMContentLoaded', make);
  addEventListener('DOMContentLoaded', make);
})();`;
