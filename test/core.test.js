import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeChunked } from '../src/index.js';

function str(s) {
  return new TextEncoder().encode(s);
}

function dec(u8) {
  return new TextDecoder().decode(u8);
}

test('decodes a single chunk', () => {
  const input = str('5\r\nhello\r\n0\r\n\r\n');
  assert.equal(dec(decodeChunked(input)), 'hello');
});

test('decodes multiple chunks', () => {
  const input = str('5\r\nhello\r\n5\r\nworld\r\n0\r\n\r\n');
  assert.equal(dec(decodeChunked(input)), 'helloworld');
});

test('decodes an empty body', () => {
  const input = str('0\r\n\r\n');
  assert.equal(decodeChunked(input).length, 0);
});

test('handles uppercase hex size', () => {
  const input = str('A\r\n0123456789\r\n0\r\n\r\n');
  assert.equal(dec(decodeChunked(input)), '0123456789');
});

test('handles lowercase hex size', () => {
  const input = str('a\r\n0123456789\r\n0\r\n\r\n');
  assert.equal(dec(decodeChunked(input)), '0123456789');
});

test('decodes chunks after a leading empty chunk', () => {
  // Per HTTP/1.1 §4.1 a 0-size chunk is always the terminal chunk, so an
  // empty intermediate chunk cannot appear before the terminal 0 chunk.
  // The decoder correctly treats a leading 0-size chunk as the terminal
  // chunk and stops decoding.
  const input = str('0\r\n5\r\nhello\r\n0\r\n\r\n');
  assert.equal(decodeChunked(input).length, 0);
});

test('discards chunk extensions', () => {
  const input = str('5;name=value;foo=bar\r\nhello\r\n0\r\n\r\n');
  assert.equal(dec(decodeChunked(input)), 'hello');
});

test('handles chunk extensions with only semicolon', () => {
  const input = str('5;\r\nhello\r\n0\r\n\r\n');
  assert.equal(dec(decodeChunked(input)), 'hello');
});

test('preserves binary bytes', () => {
  const data = new Uint8Array([0, 255, 128, 1, 127]);
  const chunk = new Uint8Array([...str('5\r\n'), ...data, ...str('\r\n0\r\n\r\n')]);
  const out = decodeChunked(chunk);
  assert.deepEqual(Array.from(out), Array.from(data));
});

test('throws on missing CRLF after chunk data', () => {
  assert.throws(() => decodeChunked(str('5\r\nhello0\r\n\r\n')), {
    message: /Missing CRLF after chunk data/,
  });
});

test('throws on invalid hex size', () => {
  assert.throws(() => decodeChunked(str('xyz\r\nhello\r\n0\r\n\r\n')), {
    message: /Invalid chunk size/,
  });
});

test('throws on chunk size exceeding remaining input', () => {
  assert.throws(() => decodeChunked(str('FF\r\nabc\r\n0\r\n\r\n')), {
    message: /Chunk size exceeds remaining input/,
  });
});

test('throws on empty size line', () => {
  assert.throws(() => decodeChunked(str('\r\n\r\n')), {
    message: /Empty chunk size line/,
  });
});

test('handles trailer fields after terminal chunk', () => {
  const input = str('5\r\nhello\r\n0\r\nX-Custom: foo\r\n\r\n');
  assert.equal(dec(decodeChunked(input)), 'hello');
});
