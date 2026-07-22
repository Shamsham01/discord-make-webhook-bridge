import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAutocomplete, runCommand, webhookCommand } from '../src/commands.js';

test('builds a valid webhook slash command', () => {
  const command = webhookCommand.toJSON();
  assert.equal(command.name, 'webhook');
  assert.deepEqual(
    command.options.map((option) => option.name),
    ['set', 'list', 'status', 'test', 'remove', 'default', 'router'],
  );

  const byName = Object.fromEntries(command.options.map((option) => [option.name, option]));
  for (const subcommand of ['status', 'test', 'remove', 'default', 'router', 'set']) {
    const nameOption = byName[subcommand].options.find((option) => option.name === 'name');
    assert.equal(nameOption.autocomplete, true, `${subcommand} name should use autocomplete`);
  }
});

test('builds a valid run slash command with workflow autocomplete', () => {
  const command = runCommand.toJSON();
  assert.equal(command.name, 'run');
  const workflow = command.options.find((option) => option.name === 'workflow');
  assert.equal(workflow.autocomplete, true);
});

test('autocompletes guild webhook names and router off option', async () => {
  const store = {
    get() {
      return {
        defaultWebhook: 'support-agent',
        routerWebhook: null,
        webhooks: {
          'support-agent': { name: 'support-agent', description: 'Handles support questions' },
          billing: { name: 'billing', description: 'Billing helpers', channelId: 'channel-2' },
        },
      };
    },
  };

  const responded = [];
  await handleAutocomplete({
    commandName: 'webhook',
    guildId: 'guild-1',
    channelId: 'channel-1',
    channel: { parentId: null },
    options: {
      getFocused: () => ({ name: 'name', value: '' }),
      getSubcommand: () => 'router',
    },
    respond: async (choices) => { responded.push(choices); },
  }, { store });

  assert.equal(responded.length, 1);
  assert.equal(responded[0][0].value, 'off');
  assert.ok(responded[0].some((choice) => choice.value === 'support-agent'));
  assert.ok(responded[0].some((choice) => choice.value === 'billing'));
  assert.ok(responded[0].find((choice) => choice.value === 'support-agent').name.includes('default'));
});

test('filters /run autocomplete to channel-allowed workflows', async () => {
  const store = {
    get() {
      return {
        defaultWebhook: 'general',
        routerWebhook: null,
        webhooks: {
          general: { name: 'general', description: 'Anywhere' },
          private: { name: 'private', description: 'Staff only', channelId: 'staff' },
        },
      };
    },
  };

  const responded = [];
  await handleAutocomplete({
    commandName: 'run',
    guildId: 'guild-1',
    channelId: 'public',
    channel: { parentId: null },
    options: {
      getFocused: () => ({ name: 'workflow', value: '' }),
      getSubcommand: () => null,
    },
    respond: async (choices) => { responded.push(choices); },
  }, { store });

  assert.deepEqual(responded[0].map((choice) => choice.value), ['general']);
});
