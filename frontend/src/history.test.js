import assert from 'node:assert/strict';
import test from 'node:test';
import { recordCreditAgricoleSnapshot } from './history.js';

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('records each Crédit Agricole snapshot and returns the accumulated history', () => {
  const storage = createStorage();
  const first = recordCreditAgricoleSnapshot(
    'NL00150001Q9',
    { fetchedAt: '2026-10-16T15:35:00+00:00', currentPrice: 3.9845 },
    storage,
  );
  const second = recordCreditAgricoleSnapshot(
    'NL00150001Q9',
    { fetchedAt: '2026-10-16T15:35:30+00:00', currentPrice: 4.01 },
    storage,
  );

  assert.deepEqual(first, [{ time: '2026-10-16T15:35:00+00:00', price: 3.9845 }]);
  assert.deepEqual(second, [
    { time: '2026-10-16T15:35:00+00:00', price: 3.9845 },
    { time: '2026-10-16T15:35:30+00:00', price: 4.01 },
  ]);
});

test('reports malformed locally stored history', () => {
  const storage = createStorage();
  storage.setItem('market-watcher:credit-agricole-history:NL00150001Q9', '{');

  assert.throws(
    () => recordCreditAgricoleSnapshot(
      'NL00150001Q9',
      { fetchedAt: '2026-10-16T15:35:00+00:00', currentPrice: 3.9845 },
      storage,
    ),
    /historique local.*illisible/i,
  );
});

test('propagates storage failures instead of pretending the snapshot was saved', () => {
  const storage = {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  };

  assert.throws(
    () => recordCreditAgricoleSnapshot(
      'NL00150001Q9',
      { fetchedAt: '2026-10-16T15:35:00+00:00', currentPrice: 3.9845 },
      storage,
    ),
    /QuotaExceededError/,
  );
});
