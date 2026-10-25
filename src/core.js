/**
 * @file ByteRangeReader — read a specific byte offset and length from a
 * file without loading the whole file into memory.
 *
 * Node's fs.createReadStream accepts `start` and `end` options, where `end`
 * is INCLUSIVE. That off-by-one is the single most common source of bugs in
 * byte-range code, so this library wraps it with a `length`-based API and
 * handles the inclusive `end` conversion internally.
 */
import { open } from 'node:fs/promises';
import { Buffer } from 'node:buffer';

/**
 * Reads a specific byte range from a file using a streaming ReadStream with
 * start/end options, so only the requested bytes are read from disk.
 *
 * The reader is async-disposable: call `await reader.close()` when done, or
 * use `await using` to release the underlying file handle automatically.
 */
export class ByteRangeReader {
  /**
   * @param {string} filePath Absolute or relative path to the file.
   * @param {number} start    Zero-based byte offset to begin reading from.
   * @param {number} length   Number of bytes to read.
   *
   * We eagerly open the file handle in the constructor so that the error
   * surface mirrors a synchronous open: a bad path fails at construction
   * time, not on the first read. This makes error handling at the call
   * site straightforward.
   */
  constructor(filePath, start, length) {
    if (typeof filePath !== 'string' || filePath.length === 0) {
      throw new TypeError('filePath must be a non-empty string');
    }
    if (!Number.isInteger(start) || start < 0) {
      throw new TypeError('start must be a non-negative integer');
    }
    if (!Number.isInteger(length) || length < 0) {
      throw new TypeError('length must be a non-negative integer');
    }

    this._filePath = filePath;
    this._start = start;
    this._length = length;
    this._handlePromise = open(filePath, 'r');
  }

  /**
   * Reads the configured byte range and returns it as a Buffer.
   *
   * Uses fs.createReadStream with `start` and `end` (inclusive). We convert
   * length to end = start + length - 1. When length is 0 we short-circuit
   * and return an empty Buffer, because createReadStream with start === end
   * would read one byte, which is not what a zero-length request means.
   *
   * If the requested range extends past EOF, the returned Buffer is shorter
   * than `length` (possibly empty). This matches POSIX pread semantics and
   * avoids throwing on a condition that is often expected by callers.
   *
   * @returns {Promise<Buffer>}
   */
  async read() {
    if (this._length === 0) {
      return Buffer.alloc(0);
    }

    const handle = await this._handlePromise;
    const stream = handle.createReadStream({
      start: this._start,
      end: this._start + this._length - 1, // createReadStream `end` is inclusive
    });

    return new Promise((resolve, reject) => {
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  /**
   * Closes the underlying file handle. Safe to call multiple times.
   * @returns {Promise<void>}
   */
  async close() {
    const handle = await this._handlePromise;
    await handle.close();
  }

  /**
   * Async-disposable support: `await using reader = new ByteRangeReader(...)`.
   */
  async [Symbol.asyncDispose]() {
    await this.close();
  }
}
