import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePublicBaseUrl } from '../src/env.js';

test('normalizePublicBaseUrl strips an accidental /webhook/workflow suffix', () => {
  assert.equal(
    normalizePublicBaseUrl('http://bot-service-eu-central-04.cybrancee.com:5028/webhook/nft-flipping-agent'),
    'http://bot-service-eu-central-04.cybrancee.com:5028',
  );
  assert.equal(
    normalizePublicBaseUrl('http://65.21.61.192:50192/webhook/nft-mint/'),
    'http://65.21.61.192:50192',
  );
  assert.equal(
    normalizePublicBaseUrl('http://bot-service-eu-central-04.cybrancee.com:5028'),
    'http://bot-service-eu-central-04.cybrancee.com:5028',
  );
});
