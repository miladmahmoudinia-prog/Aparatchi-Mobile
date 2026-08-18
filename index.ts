import { registerRootComponent } from 'expo';
import { installCollectionFlatListGuard } from './src/collectionFlatListGuard';
import { installStartupContentGate } from './src/startupContentGate';

declare const require: (name: string) => any;

// Install the narrowly-scoped runtime guards before App.tsx imports its
// react-native list and content-service bindings.
installCollectionFlatListGuard();
installStartupContentGate();

const App = require('./App').default;

registerRootComponent(App);
