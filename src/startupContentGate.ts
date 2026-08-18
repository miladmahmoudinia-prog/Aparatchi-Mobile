declare const require: (name: string) => any;

type AnyAsyncFunction = (...args: any[]) => Promise<any>;

let installed = false;

const replaceExport = (moduleObject: any, key: string, value: AnyAsyncFunction) => {
  const descriptor = Object.getOwnPropertyDescriptor(moduleObject, key);
  try {
    Object.defineProperty(moduleObject, key, {
      configurable: descriptor?.configurable !== false,
      enumerable: descriptor?.enumerable !== false,
      value,
      writable: true,
    });
    return moduleObject[key] === value;
  } catch {
    try {
      moduleObject[key] = value;
      return moduleObject[key] === value;
    } catch {
      return false;
    }
  }
};

/**
 * Cold-start coordination for the current App.tsx flow.
 *
 * App.tsx intentionally asks for the compact bootstrap and the very large full
 * index almost at the same time. On real mobile networks that lets the full
 * index steal the first-paint bandwidth and is exactly the long loading state
 * seen in the device video. This gate preserves the existing App logic but lets
 * the compact bootstrap finish first; the full index then enriches in background.
 */
export function installStartupContentGate() {
  if (installed) return;

  const service = require('./contentService');
  const originalLoadContent: AnyAsyncFunction | undefined = service.loadContent;
  const originalLoadBootstrapContent: AnyAsyncFunction | undefined = service.loadBootstrapContent;
  if (typeof originalLoadContent !== 'function' || typeof originalLoadBootstrapContent !== 'function') {
    return;
  }

  let startupGateActive = true;
  let bootstrapSettled = false;
  let settleBootstrap!: () => void;
  const bootstrapSettledPromise = new Promise<void>((resolve) => {
    settleBootstrap = resolve;
  });

  const markBootstrapSettled = () => {
    if (bootstrapSettled) return;
    bootstrapSettled = true;
    settleBootstrap();
  };

  const loadBootstrapContent: AnyAsyncFunction = async (...args) => {
    try {
      return await originalLoadBootstrapContent(...args);
    } finally {
      // Success, null and network failure all release the full-index lane. A
      // failed bootstrap must never deadlock the existing remote fallback.
      markBootstrapSettled();
    }
  };

  const loadContent: AnyAsyncFunction = async (...args) => {
    const preferLocal = args.length === 0 ? true : args[0] !== false;

    if (!preferLocal && startupGateActive && !bootstrapSettled) {
      // Normally bootstrap settles much sooner. The timeout is only a safety
      // valve for an unexpected call order where App never asks for bootstrap.
      await Promise.race([
        bootstrapSettledPromise,
        new Promise<void>((resolve) => setTimeout(resolve, 1800)),
      ]);
    }

    if (!preferLocal && startupGateActive) startupGateActive = false;
    return originalLoadContent(...args);
  };

  const bootstrapInstalled = replaceExport(service, 'loadBootstrapContent', loadBootstrapContent);
  const contentInstalled = replaceExport(service, 'loadContent', loadContent);
  installed = bootstrapInstalled && contentInstalled;

  if (!installed) {
    // Do not block application startup if a future Metro module format makes a
    // named export immutable. The old path remains functional and visible.
    console.warn('[Aparatchi] startup content gate could not be installed.');
  }
}
