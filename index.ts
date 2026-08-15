import { registerRootComponent } from 'expo';
import { createElement, useEffect, useState } from 'react';
import { InteractionManager } from 'react-native';

import App from './App';

// Android can occasionally keep a freshly-updated subtree on the previous
// frame until another UI event (most visibly a scroll) happens. This affects
// both Home's first virtualized rows and DetailModal after async hydration.
// Keep the recovery bounded: one next-frame commit plus two short follow-ups,
// coalesced across InteractionManager callbacks. App is never remounted.
let requestDeferredFrameCommit: (() => void) | null = null;
let pendingFrame: number | null = null;
let recoveryTimers: Array<ReturnType<typeof setTimeout>> = [];
const runAfterInteractions = InteractionManager.runAfterInteractions.bind(InteractionManager);

const cancelRecoveryTimers = () => {
  recoveryTimers.forEach((timer) => clearTimeout(timer));
  recoveryTimers = [];
};

const requestRootFrameCommit = () => {
  if (pendingFrame !== null) return;
  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = null;
    requestDeferredFrameCommit?.();
  });
};

const schedulePaintRecoveryBurst = () => {
  requestRootFrameCommit();
  cancelRecoveryTimers();

  // 120 ms covers the first virtualized Home batch. 1100 ms also covers the
  // bounded detail-shard retry path without keeping a periodic render loop.
  recoveryTimers = [120, 1100].map((delay) =>
    setTimeout(() => {
      requestRootFrameCommit();
    }, delay),
  );
};

try {
  (InteractionManager as any).runAfterInteractions = (task?: any) => {
    if (typeof task === 'function') {
      return runAfterInteractions(() => {
        try {
          return task();
        } finally {
          schedulePaintRecoveryBurst();
        }
      });
    }

    if (task && typeof task.gen === 'function') {
      const originalGen = task.gen.bind(task);
      return runAfterInteractions({
        ...task,
        gen: () => {
          const result = originalGen();
          Promise.resolve(result).then(schedulePaintRecoveryBurst, schedulePaintRecoveryBurst);
          return result;
        },
      });
    }

    return runAfterInteractions(task);
  };
} catch {
  // Keep startup safe on runtimes that expose InteractionManager as immutable.
  // The original scheduling path remains intact in that case.
}

function AparatchiRoot() {
  const [, commitDeferredFrame] = useState(0);

  useEffect(() => {
    requestDeferredFrameCommit = () => commitDeferredFrame((value) => value + 1);

    // Catalog data is already available from the bundled/local payload on cold
    // start. Commit it independently from the slower IMDb/remote refresh so
    // the Home rows never need that later state change (or a scroll) to paint.
    schedulePaintRecoveryBurst();

    return () => {
      requestDeferredFrameCommit = null;
      cancelRecoveryTimers();
      if (pendingFrame !== null) {
        cancelAnimationFrame(pendingFrame);
        pendingFrame = null;
      }
    };
  }, []);

  return createElement(App);
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately.
registerRootComponent(AparatchiRoot);
