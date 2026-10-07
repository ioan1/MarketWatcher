import re
import threading
import time
from datetime import datetime, timedelta, timezone

SYMBOL_PATTERN = re.compile(r"^[A-Za-z0-9^=._-]{1,32}$")
CACHE_TTL_SECONDS = 30

_cache: dict[str, tuple[float, list[dict[str, float | str]], str]] = {}
_cache_lock = threading.Lock()


def validate_symbol(symbol: str) -> str:
    normalized = symbol.strip().upper()
    if not SYMBOL_PATTERN.fullmatch(normalized):
        raise ValueError("Symbole boursier invalide")
    return normalized


def build_quote(
    symbol: str,
    target: float,
    history: list[dict[str, float | str]],
    currency: str | None = None,
) -> dict:
    current_price = float(history[-1]["price"])
    distance = target - current_price
    return {
        "symbol": symbol,
        "currency": currency or ("EUR" if symbol.endswith(".PA") else "USD"),
        "target": target,
        "currentPrice": current_price,
        "targetDistance": distance,
        "targetDistancePercent": distance / current_price * 100,
        "history": history,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
    }


def fetch_market_data(symbol: str) -> tuple[list[dict[str, float | str]], str]:
    import yfinance as yf

    now = time.monotonic()
    with _cache_lock:
        cached = _cache.get(symbol)
        if cached and now - cached[0] < CACHE_TTL_SECONDS:
            return cached[1], cached[2]

    try:
        ticker = yf.Ticker(symbol)
        candles = ticker.history(
            period="1d",
            interval="1m",
            prepost=True,
            auto_adjust=False,
            timeout=10,
        )
    except Exception as error:
        raise RuntimeError("Yahoo Finance est momentanément indisponible") from error

    if candles.empty:
        raise RuntimeError("Aucune cotation disponible pour ce symbole")

    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    history: list[dict[str, float | str]] = []
    for timestamp, row in candles.iterrows():
        price = row.get("Close")
        if price is None or price != price:
            continue
        point_time = timestamp.to_pydatetime()
        if point_time.tzinfo is None:
            point_time = point_time.replace(tzinfo=timezone.utc)
        point_time = point_time.astimezone(timezone.utc)
        if point_time >= cutoff:
            history.append({"time": point_time.isoformat(), "price": float(price)})

    if not history:
        raise RuntimeError("Aucune cotation disponible sur les dernières 24 heures")

    try:
        currency = ticker.history_metadata.get("currency")
    except Exception:
        currency = None
    if not currency:
        try:
            currency = ticker.fast_info.get("currency")
        except Exception:
            currency = None
    currency = currency or ("EUR" if symbol.endswith(".PA") else "USD")

    with _cache_lock:
        _cache[symbol] = (time.monotonic(), history, currency)
    return history, currency