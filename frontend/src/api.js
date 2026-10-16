export async function fetchQuote(symbol, target, provider = 'yahoo', bearerToken = '') {
  const params = new URLSearchParams({ target: String(target), provider });
  const headers = provider === 'credit-agricole'
    ? { Authorization: `Bearer ${bearerToken}` }
    : undefined;
  const response = await fetch(`/api/quotes/${encodeURIComponent(symbol)}?${params}`, { headers });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.detail || 'Impossible de charger cette cotation.');
  }

  return result;
}