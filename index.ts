import { registerRootComponent } from 'expo';
import { installCollectionFlatListGuard } from './src/collectionFlatListGuard';

declare const require: (name: string) => any;

// Install the narrowly-scoped collection FlatList guard before App.tsx imports
// FlatList from react-native. The guard is a passthrough for every other list.
installCollectionFlatListGuard();

const App = require('./App').default;

registerRootComponent(App);
