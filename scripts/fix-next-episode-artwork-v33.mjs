import fs from 'node:fs';

const path = 'App.tsx';
let src = fs.readFileSync(path, 'utf8');

const oldText = `              <CatalogArtwork
                primary={exactEpisodeArtworkFor(nextEpisodeGroup, item)}
                style={styles.nextEpisodeArtwork}
                contentFit="cover"
                imageKind="backdrop"
              />`;

const newText = `              <CatalogArtwork
                primary={exactEpisodeArtworkFor(nextEpisodeGroup, item)}
                fallback={item.backdropFallback || item.backdrop || item.posterFallback || item.poster}
                localFallback={localArtworkForItem(item)}
                style={styles.nextEpisodeArtwork}
                contentFit="cover"
                imageKind="backdrop"
              />`;

const count = src.split(oldText).length - 1;
if (count !== 1) throw new Error(`next episode artwork card: expected exactly one match, got ${count}`);
src = src.replace(oldText, newText);
fs.writeFileSync(path, src);
console.log('next episode artwork fallback applied');
