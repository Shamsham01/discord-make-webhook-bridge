import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  extractReplies,
  isHostAllowed,
  splitDiscordMessage,
  validateWebhookUrl,
  postToWebhook,
} from '../src/webhook.js';

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
  assert.deepEqual(extractReplies('Accepted', 'text/plain'), []);
  assert.deepEqual(extractReplies('{"status":"ok"}', 'application/json'), []);
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
