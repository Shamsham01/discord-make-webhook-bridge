import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createCallbackRegistry } from '../src/callbacks.js';

test('rejects callback posts with a missing or invalid token', async () => {
  let registry;
  const server = http.createServer(async (request, response) => {
    await registry.handleRequest(request, response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  registry = createCallbackRegistry({ publicBaseUrl: `http://127.0.0.1:${port}` });
  const waiter = registry.createWaiter(1_000);
  const ignoredCancel = waiter.promise.catch((error) => {
    if (error.code !== 'CALLBACK_CANCELLED') throw error;
  });

  try {
    const response = await fetch(waiter.callbackUrl, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'stolen reply',
    });
    assert.equal(response.status, 401);
    assert.equal(registry.pendingCount, 1);
  } finally {
    waiter.cancel();
    await ignoredCancel;
    await new Promise((resolve) => server.close(resolve));
  }
});

test('accepts a callback token in JSON body and extracts the reply', async () => {
  let registry;
  const server = http.createServer(async (request, response) => {
    await registry.handleRequest(request, response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  registry = createCallbackRegistry({ publicBaseUrl: `http://127.0.0.1:${port}` });
  const waiter = registry.createWaiter(1_000);

  try {
    const response = await fetch(waiter.callbackUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reply: 'From JSON token', callbackToken: waiter.token }),
    });
    assert.equal(response.status, 200);
    const result = await waiter.promise;
    assert.deepEqual(result.replies, ['From JSON token']);
    assert.equal(registry.pendingCount, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
