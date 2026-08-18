import { registerRootComponent } from 'expo';
import { installStartupContentGate } from './src/startupContentGate';

declare const require: (name: string) => any;

// Install only the verified cold-start content gate before App.tsx loads.
installStartupContentGate();

const App = require('./App').default;

registerRootComponent(App);
