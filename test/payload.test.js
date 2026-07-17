import test from 'node:test';
import assert from 'node:assert/strict';
import { stripBotMention } from '../src/payload.js';

test('removes normal and nickname bot mentions', () => {
  assert.equal(stripBotMention('<@123> hello bot', '123'), 'hello bot');
  assert.equal(stripBotMention('hello <@!123>', '123'), 'hello');
  assert.equal(stripBotMention('<@123> ask <@123> again', '123'), 'ask  again');
});
