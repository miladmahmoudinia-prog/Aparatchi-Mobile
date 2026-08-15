import { registerRootComponent } from 'expo';
import { createElement, useEffect, useState } from 'react';
import { InteractionManager } from 'react-native';

import App from './App';

// Android can occasionally keep a freshly-revealed Modal subtree on the
// previous frame until the user scrolls it. DetailModal intentionally defers
// its heavier body with InteractionManager, so request one extra root render
// on the next frame after those deferred callbacks finish. This preserves the
// existing lazy-detail/performance path while making the committed detail
// state visible without requiring a scroll gesture.
let requestDeferredFrameCommit: (() => void) | null = null;
const runAfterInteractions = InteractionManager.runAfterInteractions.bind(InteractionManager);

(InteractionManager as any).runAfterInteractions = (task?: any) => {
  if (typeof task !== 'function') return runAfterInteractions(task);
  return runAfterInteractions(() => {
    const result = task();
    requestAnimationFrame(() => requestDeferredFrameCommit?.());
    return result;
  });
};

function AparatchiRoot() {
  const [, commitDeferredFrame] = useState(0);

  useEffect(() => {
    requestDeferredFrameCommit = () => commitDeferredFrame((value) => value + 1);
    return () => {
      requestDeferredFrameCommit = null;
    };
  }, []);

  return createElement(App);
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately.
registerRootComponent(AparatchiRoot);
