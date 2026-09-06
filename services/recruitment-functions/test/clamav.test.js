'use strict';

const test = require('node:test');
const assert = require('node:assert');
const net = require('node:net');
const { createClamAvScanner, parseInstreamReply, mapVerdictToScanResult } = require('../src/lib/clamav');
const { SCAN_RESULTS } = require('../../../api/recruitment/core/constants');

// Spins up a fake clamd that consumes the INSTREAM framing and replies with a
// canned verdict, so the client can be exercised without a real daemon.
function fakeClamd(reply) {
  const server = net.createServer((socket) => {
    const buffers = [];
    socket.on('data', (chunk) => {
      buffers.push(chunk);
      const all = Buffer.concat(buffers).toString('binary');
      if (all.startsWith('zPING\0')) { socket.end('PONG\0'); return; }
      // End of INSTREAM is the zero-length terminator chunk (4 NUL bytes).
      const raw = Buffer.concat(buffers);
      if (raw.includes('zINSTREAM\0') && raw.length >= 4 && raw.readUInt32BE(raw.length - 4) === 0 && raw.length > 'zINSTREAM\0'.length + 4) {
        socket.end(reply);
      }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

test('parseInstreamReply classifies clamd verdicts', () => {
  assert.deepEqual(parseInstreamReply('stream: OK'), { verdict: 'clean' });
  assert.deepEqual(parseInstreamReply('stream: Eicar-Test-Signature FOUND'), { verdict: 'infected', signature: 'Eicar-Test-Signature' });
  assert.equal(parseInstreamReply('stream: INSTREAM size limit exceeded ERROR').verdict, 'error');
  assert.equal(parseInstreamReply('').verdict, 'error');
});

test('mapVerdictToScanResult never treats non-clean as clean', () => {
  assert.equal(mapVerdictToScanResult('clean'), SCAN_RESULTS.Clean);
  assert.equal(mapVerdictToScanResult('infected'), SCAN_RESULTS.Malicious);
  assert.equal(mapVerdictToScanResult('error'), SCAN_RESULTS.ScanFailed);
  assert.equal(mapVerdictToScanResult('anything-else'), SCAN_RESULTS.ScanFailed);
});

test('scan() returns Clean for an OK reply', async () => {
  const server = await fakeClamd('stream: OK\0');
  const { port } = server.address();
  const scanner = createClamAvScanner({ host: '127.0.0.1', port });
  const verdict = await scanner.scan(Buffer.from('harmless bytes'));
  assert.equal(verdict.verdict, 'clean');
  assert.equal(verdict.result, SCAN_RESULTS.Clean);
  server.close();
});

test('scan() returns Malicious with signature for a FOUND reply', async () => {
  const server = await fakeClamd('stream: Win.Test.EICAR_HDB-1 FOUND\0');
  const { port } = server.address();
  const scanner = createClamAvScanner({ host: '127.0.0.1', port });
  const verdict = await scanner.scan(Buffer.from('x'.repeat(100000)));
  assert.equal(verdict.verdict, 'infected');
  assert.equal(verdict.signature, 'Win.Test.EICAR_HDB-1');
  assert.equal(verdict.result, SCAN_RESULTS.Malicious);
  server.close();
});

test('scan() throws a coded error for an ERROR reply', async () => {
  const server = await fakeClamd('stream: INSTREAM size limit exceeded ERROR\0');
  const { port } = server.address();
  const scanner = createClamAvScanner({ host: '127.0.0.1', port });
  await assert.rejects(() => scanner.scan(Buffer.from('data')), (err) => err.code === 'CLAMD_SCAN_ERROR');
  server.close();
});

test('ping() resolves true against PONG', async () => {
  const server = await fakeClamd('stream: OK\0');
  const { port } = server.address();
  const scanner = createClamAvScanner({ host: '127.0.0.1', port });
  assert.equal(await scanner.ping(), true);
  server.close();
});

test('connection failure surfaces a coded error', async () => {
  // Port 1 is not listening; connect should fail fast.
  const scanner = createClamAvScanner({ host: '127.0.0.1', port: 1, timeoutMs: 2000 });
  await assert.rejects(() => scanner.scan(Buffer.from('data')), (err) => typeof err.code === 'string');
});
