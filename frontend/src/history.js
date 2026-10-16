const CREDIT_AGRICOLE_HISTORY_PREFIX = 'market-watcher:credit-agricole-history:';

export function recordCreditAgricoleSnapshot(symbol, quote, storage = window.localStorage) {
  const key = `${CREDIT_AGRICOLE_HISTORY_PREFIX}${encodeURIComponent(symbol)}`;
  const storedHistory = storage.getItem(key);
  let history = [];

  if (storedHistory !== null) {
    try {
      history = JSON.parse(storedHistory);
    } catch (error) {
      throw new Error('L’historique local de cette valeur est illisible.', { cause: error });
    }

    if (
      !Array.isArray(history)
      || history.some((point) => (
        !point
        || typeof point.time !== 'string'
        || !Number.isFinite(Date.parse(point.time))
        || typeof point.price !== 'number'
        || !Number.isFinite(point.price)
      ))
    ) {
      throw new Error('L’historique local de cette valeur est invalide.');
    }
  }

  history.push({ time: quote.fetchedAt, price: quote.currentPrice });
  history.sort((left, right) => Date.parse(left.time) - Date.parse(right.time));
  storage.setItem(key, JSON.stringify(history));
  return history;
}
