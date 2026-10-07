export async function fetchQuote(symbol, target) {
  const params = new URLSearchParams({ target: String(target) });
  const response = await fetch(`/api/quotes/${encodeURIComponent(symbol)}?${params}`);
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.detail || 'Impossible de charger cette cotation.');
  }

  return result;
}