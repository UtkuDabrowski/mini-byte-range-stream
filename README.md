# mini-byte-range-stream

Reads a specific byte offset and length from a file using Node's `fs.createReadStream` `start` and `end` options, so only the requested bytes are read from disk.

```js
import { writeFile } from 'node:fs/promises';
import { ByteRangeReader } from 'mini-byte-range-stream';

await writeFile('/tmp/file.bin', Buffer.from([0, 1, 2, 3, 4]));

const reader = new ByteRangeReader('/tmp/file.bin', 1, 3);
const bytes = await reader.read();   // Buffer: <01 02 03>
await reader.close();                // release the file handle
```

## Why this exists

Loading a multi-gigabyte file just to inspect a few bytes is wasteful. `fs.createReadStream` already supports byte ranges, but its `end` option is inclusive — a common source of off-by-one errors. This library wraps that detail behind a `length`-based API and handles the inclusive-`end` conversion internally, so callers think in `[start, start + length)` terms.

## Edge cases

- **Zero-length reads** return an empty `Buffer` without touching the file stream. `createReadStream({ start: n, end: n })` would read one byte, which is not what a zero-length request means.
- **Ranges past EOF** return fewer bytes than requested (possibly zero), matching `pread` semantics. The library does not throw in this case — if you need strict length validation, compare `buf.length` to the requested `length` after `read()`.
- The file handle is opened eagerly in the constructor, so a bad path fails at construction or first `read()`, not silently.
