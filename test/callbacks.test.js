import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createReplyRegistry } from '../src/callbacks.js';

test('rejects workflow reply posts with a missing messageId', async () => {
  const registry = createReplyRegistry({ publicBaseUrl: 'http://127.0.0.1:9' });
  const server = http.createServer(async (request, response) => {
    await registry.handleRequest(request, response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/webhook/support-agent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ Response: 'Hello' }),
    });
    assert.equal(response.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('accepts a fixed /webhook/:workflow reply matched by messageId', async () => {
  let registry;
  const server = http.createServer(async (request, response) => {
    await registry.handleRequest(request, response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  registry = createReplyRegistry({ publicBaseUrl: `http://127.0.0.1:${port}` });
  const waiter = registry.createWaiter({
    messageId: 'discord-message-42',
    workflow: 'nft-flipping-agent',
    timeoutMs: 1_000,
  });

  try {
    assert.equal(
      waiter.replyUrl,
      `http://127.0.0.1:${port}/webhook/nft-flipping-agent`,
    );

    const response = await fetch(`http://127.0.0.1:${port}/webhook/nft-flipping-agent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messageId: 'discord-message-42', Response: 'HOLD for this cycle.' }),
    });
    assert.equal(response.status, 200);
    const result = await waiter.promise;
    assert.deepEqual(result.replies, ['HOLD for this cycle.']);
    assert.equal(registry.pendingCount, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
