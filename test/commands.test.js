import test from 'node:test';
import assert from 'node:assert/strict';
import { webhookCommand } from '../src/commands.js';

test('builds a valid webhook slash command', () => {
  const command = webhookCommand.toJSON();
  assert.equal(command.name, 'webhook');
  assert.deepEqual(
    command.options.map((option) => option.name),
    ['set', 'status', 'test', 'remove'],
  );
});
