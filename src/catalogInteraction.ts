// Coalesce background refreshes until scrolling/touch interaction is idle.
// This avoids replacing rows (and their heights) in the middle of a gesture.
let lastInteraction = 0;
let pending: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
export const markCatalogInteraction = () => { lastInteraction = Date.now(); };
export const commitCatalogWhenIdle = (commit: () => void) => {
  pending = commit;
  if (timer) clearTimeout(timer);
  const flush = () => {
    const remaining = 500 - (Date.now() - lastInteraction);
    if (remaining > 0) { timer = setTimeout(flush, remaining); return; }
    timer = null;
    const latest = pending;
    pending = null;
    latest?.();
  };
  flush();
};
