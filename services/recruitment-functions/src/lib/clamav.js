'use strict';

// Minimal ClamAV `clamd` client (INSTREAM + PING) over TCP, plus a mapper from
// clamd's textual verdict to the recruitment core's SCAN_RESULTS taxonomy.
//
// This is the free, self-hosted replacement for Microsoft Defender for Storage
// on-upload malware scanning. It talks to a `clamd` daemon (run in the same
// container as the scan worker, so the connection never leaves localhost and no
// candidate CV is ever sent to a third party).
//
// Protocol reference (clamd): commands are prefixed with `z` and NUL-terminated.
//   zINSTREAM\0  then repeated <4-byte BE length><bytes> chunks, terminated by a
//   zero-length (0x00000000) chunk. Reply: "stream: OK\0" (clean),
//   "stream: <SIGNATURE> FOUND\0" (infected), or "... ERROR\0" (scan error).

const net = require('node:net');
const { SCAN_RESULTS } = require('../../../../api/recruitment/core/constants');

const DEFAULT_PORT = 3310;
const DEFAULT_CHUNK_BYTES = 64 * 1024;

function once(fn) {
  let called = false;
  return (...args) => { if (called) return; called = true; return fn(...args); };
}

// Runs a single clamd command over a fresh connection and resolves the raw
// textual reply (NUL/newline trimmed). Rejects on socket error or timeout.
function command({ host, port = DEFAULT_PORT, timeoutMs = 120000 }, write) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const chunks = [];
    const settleErr = once((err) => { try { socket.destroy(); } catch (_) {} reject(err); });
    const settleOk = once((value) => { try { socket.destroy(); } catch (_) {} resolve(value); });

    socket.setTimeout(timeoutMs);
    socket.on('timeout', () => settleErr(Object.assign(new Error('clamd timeout'), { code: 'CLAMD_TIMEOUT' })));
    socket.on('error', (err) => settleErr(Object.assign(err, { code: err.code || 'CLAMD_CONNECT_FAILED' })));
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.on('end', () => settleOk(Buffer.concat(chunks).toString('utf8').replace(/[\0\r\n]+$/, '')));
    socket.on('connect', () => {
      try { write(socket); } catch (err) { settleErr(err); }
    });
  });
}

function writeInstream(socket, buffer, chunkBytes) {
  socket.write('zINSTREAM\0');
  for (let offset = 0; offset < buffer.length; offset += chunkBytes) {
    const slice = buffer.subarray(offset, Math.min(offset + chunkBytes, buffer.length));
    const size = Buffer.allocUnsafe(4);
    size.writeUInt32BE(slice.length, 0);
    socket.write(size);
    socket.write(slice);
  }
  const terminator = Buffer.allocUnsafe(4);
  terminator.writeUInt32BE(0, 0);
  socket.write(terminator);
}

// Parses a clamd INSTREAM reply into a structured verdict.
//   { verdict: 'clean' }
//   { verdict: 'infected', signature }
//   { verdict: 'error', detail }
function parseInstreamReply(reply) {
  const text = String(reply || '').trim();
  if (/(^|:\s*)OK$/i.test(text)) return { verdict: 'clean' };
  const found = text.match(/:\s*(.+?)\s+FOUND$/i);
  if (found) return { verdict: 'infected', signature: found[1].trim() };
  const errored = text.match(/:\s*(.+?)\s+ERROR$/i);
  if (errored) return { verdict: 'error', detail: errored[1].trim() };
  return { verdict: 'error', detail: text || 'empty clamd reply' };
}

function mapVerdictToScanResult(verdict) {
  if (verdict === 'clean') return SCAN_RESULTS.Clean;
  if (verdict === 'infected') return SCAN_RESULTS.Malicious;
  // A scan the engine could not complete (limits exceeded, engine error) is
  // never treated as clean: it routes to ManualReview via SCAN_RESULTS.ScanFailed.
  return SCAN_RESULTS.ScanFailed;
}

function createClamAvScanner({ host, port = DEFAULT_PORT, timeoutMs = 120000, chunkBytes = DEFAULT_CHUNK_BYTES } = {}) {
  if (!host) throw new Error('clamav host is required');
  return {
    async ping() {
      const reply = await command({ host, port, timeoutMs: Math.min(timeoutMs, 10000) }, (socket) => socket.write('zPING\0'));
      return /PONG/i.test(reply);
    },

    // Scans a Buffer. Resolves a structured verdict; never throws for an
    // infected file (that is a normal, expected outcome). Throws only for
    // transport/engine failures the caller should retry.
    async scan(buffer) {
      if (!Buffer.isBuffer(buffer)) throw new Error('scan expects a Buffer');
      const reply = await command({ host, port, timeoutMs }, (socket) => writeInstream(socket, buffer, chunkBytes));
      const parsed = parseInstreamReply(reply);
      if (parsed.verdict === 'error') {
        const err = new Error(`clamd scan error: ${parsed.detail}`);
        err.code = 'CLAMD_SCAN_ERROR';
        err.detail = parsed.detail;
        throw err;
      }
      return { ...parsed, result: mapVerdictToScanResult(parsed.verdict) };
    }
  };
}

module.exports = { createClamAvScanner, parseInstreamReply, mapVerdictToScanResult, DEFAULT_PORT };
