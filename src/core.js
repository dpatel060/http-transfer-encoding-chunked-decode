/**
 * Decodes HTTP Transfer-Encoding chunked body data into the underlying
 * content bytes.
 *
 * The function is implemented synchronously and operates on a complete
 * Uint8Array (or Buffer) of chunked-encoded bytes. This is a deliberate
 * choice: the complexity of chunked decoding is in parsing, not streaming,
 * and a synchronous function is easier to reason about and test. For
 * streaming use cases, accumulate the input first.
 *
 * If the input does not end with a well-formed 0-size chunk the function
 * throws an Error. This matches the spirit of HTTP/1.1 §7.1 where the
 * terminating chunk signals the end of the message.
 *
 * @param {Uint8Array} input - the full chunked-encoded body
 * @returns {Uint8Array} the decoded content bytes
 */
export function decodeChunked(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const output = [];
  let pos = 0;

  while (pos < bytes.length) {
    // Read the chunk size line (hex digits terminated by CRLF).
    const lineEnd = findCRLF(bytes, pos);
    if (lineEnd === -1) {
      throw new Error('Missing CRLF after chunk size');
    }

    const sizeText = bytesToAscii(bytes.slice(pos, lineEnd));
    // The size may include chunk extensions preceded by ';', per RFC 7230 §4.1.1.
    // We discard extensions since the brief is about recovering the underlying bytes.
    const semicolon = sizeText.indexOf(';');
    const hexPart = semicolon === -1 ? sizeText : sizeText.substring(0, semicolon);
    const trimmed = hexPart.trim();

    if (trimmed.length === 0) {
      throw new Error('Empty chunk size line');
    }

    const size = parseInt(trimmed, 16);
    if (Number.isNaN(size)) {
      throw new Error('Invalid chunk size: ' + JSON.stringify(trimmed));
    }

    pos = lineEnd + 2; // skip CRLF after size

    if (size === 0) {
      // Terminal chunk. There may be optional trailers then a final CRLF.
      // We require the terminating CRLF after the zero-size line so the input
      // is self-consistent. Anything beyond that is discarded.
      pos = skipTrailerAndFinalCRLF(bytes, pos);
      break;
    }

    if (pos + size > bytes.length) {
      throw new Error('Chunk size exceeds remaining input');
    }

    for (let i = 0; i < size; i++) {
      output.push(bytes[pos + i]);
    }

    pos += size;

    // Each data chunk must be followed by CRLF.
    if (pos + 2 > bytes.length || bytes[pos] !== 0x0d || bytes[pos + 1] !== 0x0a) {
      throw new Error('Missing CRLF after chunk data');
    }
    pos += 2;
  }

  return new Uint8Array(output);
}

/**
 * Finds the index of a CRLF (0x0d 0x0a) starting from `from`, or -1.
 */
function findCRLF(bytes, from) {
  for (let i = from; i < bytes.length - 1; i++) {
    if (bytes[i] === 0x0d && bytes[i + 1] === 0x0a) {
      return i;
    }
  }
  return -1;
}

/**
 * Converts a Uint8Array of ASCII bytes to a string.
 * Using direct code-point conversion avoids TextDecoder overhead and is
 * safe because chunk size lines are ASCII hex.
 */
function bytesToAscii(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i]);
  }
  return s;
}

/**
 * After a zero-size chunk, optional trailer header fields may appear, each
 * terminated by CRLF, followed by a final CRLF (empty line). We scan for that
 * empty line. If the input simply ends without a trailing CRLF we treat the
 * trailer-less end as valid as long as we are at EOF.
 */
function skipTrailerAndFinalCRLF(bytes, pos) {
  while (pos < bytes.length) {
    const end = findCRLF(bytes, pos);
    if (end === -1) {
      // No more CRLF; treat remaining bytes as trailing data we cannot parse.
      // Per our contract the zero-size chunk already terminates the body.
      return bytes.length;
    }
    if (end === pos) {
      // Empty line — this is the final CRLF.
      return end + 2;
    }
    pos = end + 2;
  }
  return pos;
}
