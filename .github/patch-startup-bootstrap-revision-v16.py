from pathlib import Path

path = Path('App.tsx')
text = path.read_text(encoding='utf-8')
old = "          contentRevisionRef.current = loadedContentRevision(visibleFallback);"
new = "          contentRevisionRef.current = `startup-bootstrap:${loadedContentRevision(visibleFallback)}`;"
count = text.count(old)
if count != 1:
    raise SystemExit(f'startup bootstrap revision anchor mismatch: {count}')
text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
