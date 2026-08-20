import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  extractReplies,
  isHostAllowed,
  splitDiscordMessage,
  validateWebhookUrl,
  postToWebhook,
  invokeMakeWebhook,
  isPlaceholderWebhookResult,
  isLikelyMakeHoldTimeout,
} from '../src/webhook.js';
import { createCallbackRegistry } from '../src/callbacks.js';

test('allows standard Make webhook hosts', () => {
  assert.equal(isHostAllowed('hook.eu1.make.com', ['*.make.com']), true);
  assert.equal(isHostAllowed('make.com', ['*.make.com']), false);
  assert.equal(isHostAllowed('evilmake.com', ['*.make.com']), false);
});

test('validates HTTPS webhook URLs', () => {
  assert.equal(
    validateWebhookUrl('https://hook.eu1.make.com/abc123', ['*.make.com']),
    'https://hook.eu1.make.com/abc123',
  );
  assert.throws(
    () => validateWebhookUrl('http://hook.eu1.make.com/abc123', ['*.make.com']),
    /HTTPS/,
  );
  assert.throws(
    () => validateWebhookUrl('https://example.com/webhook', ['*.make.com']),
    /not permitted/,
  );
});

test('extracts only explicit JSON reply fields', () => {
  assert.deepEqual(
    extractReplies('{"reply":"Hello"}', 'application/json; charset=utf-8'),
    ['Hello'],
  );
  assert.deepEqual(
    extractReplies('{"Response":"Agent summary"}', 'application/json'),
    ['Agent summary'],
  );
  assert.deepEqual(extractReplies('Accepted', 'text/plain'), []);
  assert.deepEqual(extractReplies('{"status":"ok"}', 'application/json'), []);
});

test('treats plain multi-line Make bodies as Discord replies', () => {
  const body = 'Hey Pshem!\n\n- Answer questions\n- Help with tools';
  assert.deepEqual(extractReplies(body, 'text/plain'), [body]);
  assert.deepEqual(extractReplies(body, ''), [body]);
  assert.deepEqual(extractReplies(JSON.stringify(body), 'application/json'), [body]);
});

test('chunks plain-text replies over Discord message limit', () => {
  const body = `${'A'.repeat(1_500)}\n\n${'B'.repeat(1_500)}`;
  const replies = extractReplies(body, 'text/plain');
  assert.ok(replies.length >= 2);
  assert.ok(replies.every((chunk) => chunk.length <= 2_000));
  assert.equal(replies.join('\n\n'), body);
});

test('splits long Discord replies below the limit', () => {
  const chunks = splitDiscordMessage('A'.repeat(4_500));
  assert.equal(chunks.length, 3);
  assert.ok(chunks.every((chunk) => chunk.length <= 2_000));
  assert.equal(chunks.join(''), 'A'.repeat(4_500));
});


test('posts structured payload and parses a Make-style JSON reply', async () => {
  let capturedHeaders;
  let capturedBody;

  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      capturedHeaders = request.headers;
      capturedBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ reply: 'Hello from Make' }));
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();

  try {
    const result = await postToWebhook({
      url: `http://127.0.0.1:${address.port}/hook`,
      secret: 'test-secret',
      timeoutMs: 5_000,
      payload: {
        event: 'discord.message',
        guildId: 'guild-1',
        messageId: 'message-1',
        content: 'Hello',
      },
    });

    assert.equal(result.status, 200);
    assert.deepEqual(result.replies, ['Hello from Make']);
    assert.equal(capturedHeaders['x-discord-bridge-secret'], 'test-secret');
    assert.equal(capturedHeaders['x-discord-message-id'], 'message-1');
    assert.equal(capturedBody.content, 'Hello');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('treats Accepted and empty bodies as placeholder Make responses', () => {
  assert.equal(isPlaceholderWebhookResult({ replies: [], body: 'Accepted' }), true);
  assert.equal(isPlaceholderWebhookResult({ replies: [], body: '' }), true);
  assert.equal(isPlaceholderWebhookResult({ replies: ['Hello'], body: 'Hello' }), false);
  assert.equal(isLikelyMakeHoldTimeout({ replies: [], body: 'Accepted' }, 120_000), true);
  assert.equal(isLikelyMakeHoldTimeout({ replies: [], body: 'Accepted' }, 20), false);
});

test('keeps fast Accepted responses as fire-and-forget success', async () => {
  const server = await listen((request, response) => {
    request.resume();
    request.on('end', () => {
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('Accepted');
    });
  });

  try {
    const result = await invokeMakeWebhook({
      url: server.url,
      timeoutMs: 1_000,
      holdTimeoutHintMs: 50,
      payload: { event: 'discord.workflow.run', guildId: 'g', messageId: 'm' },
    });
    assert.equal(result.status, 200);
    assert.deepEqual(result.replies, []);
  } finally {
    await server.close();
  }
});

test('does not treat a delayed Accepted webhook as a successful Agent reply', async () => {
  const server = await listen((request, response) => {
    request.resume();
    request.on('end', () => {
      setTimeout(() => {
        response.writeHead(200, { 'content-type': 'text/plain' });
        response.end('Accepted');
      }, 40);
    });
  });

  try {
    await assert.rejects(
      invokeMakeWebhook({
        url: server.url,
        timeoutMs: 1_000,
        holdTimeoutHintMs: 20,
        payload: { event: 'discord.workflow.run', guildId: 'g', messageId: 'm' },
      }),
      (error) => error.code === 'MAKE_HOLD_TIMEOUT' && /WEBHOOK_TIMEOUT_MS cannot extend/.test(error.message),
    );
  } finally {
    await server.close();
  }
});

test('waits for a Make callback after a delayed Accepted webhook response', async () => {
  let callbacks;
  const callbackServer = await listen(async (request, response) => {
    await callbacks.handleRequest(request, response);
  });
  callbacks = createCallbackRegistry({ publicBaseUrl: callbackServer.url });

  const makeServer = await listen((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      assert.equal(typeof payload.callbackUrl, 'string');
      assert.equal(typeof payload.callbackToken, 'string');
      setTimeout(() => {
        response.writeHead(200, { 'content-type': 'text/plain' });
        response.end('Accepted');
      }, 40);
      setTimeout(() => {
        fetch(payload.callbackUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-callback-token': payload.callbackToken,
          },
          body: JSON.stringify({ reply: 'Agent finished later' }),
        }).catch((error) => {
          console.error('callback post failed', error);
        });
      }, 80);
    });
  });

  try {
    const result = await invokeMakeWebhook({
      url: makeServer.url,
      timeoutMs: 1_000,
      holdTimeoutHintMs: 20,
      callbacks,
      payload: { event: 'discord.workflow.run', guildId: 'g', messageId: 'm', content: 'go' },
    });
    assert.deepEqual(result.replies, ['Agent finished later']);
  } finally {
    await makeServer.close();
    await callbackServer.close();
  }
});

test('waits for a callback after an immediate Accepted when a callback URL exists', async () => {
  let callbacks;
  const callbackServer = await listen(async (request, response) => {
    await callbacks.handleRequest(request, response);
  });
  callbacks = createCallbackRegistry({ publicBaseUrl: callbackServer.url });

  const makeServer = await listen((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('Accepted');
      setTimeout(() => {
        fetch(payload.callbackUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-callback-token': payload.callbackToken,
          },
          body: JSON.stringify({ Response: 'HOLD for this cycle.' }),
        }).catch((error) => {
          console.error('callback post failed', error);
        });
      }, 30);
    });
  });

  try {
    const result = await invokeMakeWebhook({
      url: makeServer.url,
      timeoutMs: 1_000,
      holdTimeoutHintMs: 50,
      callbacks,
      payload: { event: 'discord.workflow.run', guildId: 'g', messageId: 'm', content: 'go' },
    });
    assert.deepEqual(result.replies, ['HOLD for this cycle.']);
  } finally {
    await makeServer.close();
    await callbackServer.close();
  }
});

function listen(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}
