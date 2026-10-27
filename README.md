# http-transfer-encoding-chunked-decode

Decodes HTTP Transfer-Encoding chunked body data into the underlying content bytes.

```js
import { decodeChunked } from 'http-transfer-encoding-chunked-decode';

const input = new TextEncoder().encode('5\r\nhello\r\n5\r\nworld\r\n0\r\n\r\n');
const output = decodeChunked(input);
// output is a Uint8Array containing the bytes for "helloworld"
console.log(new TextDecoder().decode(output)); // "helloworld"
```

## Why

Chunked transfer encoding wraps content in a sequence of length-prefixed chunks. When you have captured a raw HTTP body and need the original bytes — for logging, proxying, or testing — you need to strip the framing. This library does exactly that and nothing else.

The trade-off: `decodeChunked` is synchronous and expects the full chunked body as a single `Uint8Array`. It does not stream. Streaming chunked decoders exist; they add complexity that is unnecessary when you already have the complete buffer in memory.

## Edge cases

- Chunk extensions (the part after `;` on a size line) are discarded, not parsed. They are metadata, not content.
- Trailer fields after the terminal `0` chunk are skipped.
- The input must end with a well-formed `0\r\n\r\n` sequence (with optional trailers before the final blank line). If it does not, `decodeChunked` throws an `Error` describing the problem rather than returning a silently truncated result.
- Hex sizes may be uppercase or lowercase; both are accepted.

The single exported name is `decodeChunked`. It takes a `Uint8Array` and returns a `Uint8Array`.
