import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { open, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import { tmpdir } from 'node:os';
import { ByteRangeReader } from '../src/index.js';

const TMP_DIR = join(tmpdir(), 'mini-byte-range-stream-' + process.pid);
const DATA_FILE = join(TMP_DIR, 'data.bin');

// 256 bytes: value at index i === i mod 256
const TOTAL = 256;
const DATA = Buffer.alloc(TOTAL);
for (let i = 0; i < TOTAL; i++) DATA[i] = i;

describe('ByteRangeReader', () => {
  before(async () => {
    await mkdir(TMP_DIR, { recursive: true });
    const fh = await open(DATA_FILE, 'w');
    await fh.writeFile(DATA);
    await fh.close();
  });

  after(async () => {
    await rm(TMP_DIR, { recursive: true, force: true });
  });

  it('reads a range in the middle of the file', async () => {
    const reader = new ByteRangeReader(DATA_FILE, 10, 5);
    const buf = await reader.read();
    await reader.close();
    assert.deepEqual(buf, DATA.subarray(10, 15));
  });

  it('reads a single byte', async () => {
    const reader = new ByteRangeReader(DATA_FILE, 100, 1);
    const buf = await reader.read();
    await reader.close();
    assert.deepEqual(buf, DATA.subarray(100, 101));
  });

  it('reads from the start of the file', async () => {
    const reader = new ByteRangeReader(DATA_FILE, 0, 8);
    const buf = await reader.read();
    await reader.close();
    assert.deepEqual(buf, DATA.subarray(0, 8));
  });

  it('reads to the end of the file', async () => {
    const reader = new ByteRangeReader(DATA_FILE, TOTAL - 8, 8);
    const buf = await reader.read();
    await reader.close();
    assert.deepEqual(buf, DATA.subarray(TOTAL - 8));
  });

  it('returns an empty Buffer when length is 0', async () => {
    const reader = new ByteRangeReader(DATA_FILE, 50, 0);
    const buf = await reader.read();
    await reader.close();
    assert.equal(buf.length, 0);
    assert.deepEqual(buf, Buffer.alloc(0));
  });

  it('returns fewer bytes when the range extends past EOF', async () => {
    // start near EOF, request more than remains
    const reader = new ByteRangeReader(DATA_FILE, TOTAL - 4, 100);
    const buf = await reader.read();
    await reader.close();
    assert.deepEqual(buf, DATA.subarray(TOTAL - 4));
  });

  it('returns an empty Buffer when start is at EOF and length > 0', async () => {
    const reader = new ByteRangeReader(DATA_FILE, TOTAL, 5);
    const buf = await reader.read();
    await reader.close();
    assert.equal(buf.length, 0);
  });

  it('returns the full file when start is 0 and length covers it', async () => {
    const reader = new ByteRangeReader(DATA_FILE, 0, TOTAL);
    const buf = await reader.read();
    await reader.close();
    assert.deepEqual(buf, DATA);
  });

  it('rejects when the file does not exist', async () => {
    const reader = new ByteRangeReader(
      join(TMP_DIR, 'does-not-exist.bin'),
      0,
      10,
    );
    await assert.rejects(() => reader.read());
    // close will also reject, but we ignore it
    await assert.rejects(() => reader.close()).catch(() => {});
  });

  it('throws on non-integer start', () => {
    assert.throws(
      () => new ByteRangeReader(DATA_FILE, 1.5, 10),
      /start must be a non-negative integer/,
    );
  });

  it('throws on negative length', () => {
    assert.throws(
      () => new ByteRangeReader(DATA_FILE, 0, -1),
      /length must be a non-negative integer/,
    );
  });

  it('throws on empty file path', () => {
    assert.throws(
      () => new ByteRangeReader('', 0, 10),
      /filePath must be a non-empty string/,
    );
  });
});
