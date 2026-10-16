import json
import math
import re
import threading
import time
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

SYMBOL_PATTERN = re.compile(r"^[A-Za-z0-9^=._-]{1,32}$")
ISIN_PATTERN = re.compile(r"^[A-Z]{2}[A-Z0-9]{9}[0-9]$")
CACHE_TTL_SECONDS = 30

_cache: dict[str, tuple[float, list[dict[str, float | str]], str, str | None]] = {}
_cache_lock = threading.Lock()


def validate_symbol(symbol: str) -> str:
    normalized = symbol.strip().upper()
    if not SYMBOL_PATTERN.fullmatch(normalized):
        raise ValueError("Symbole boursier invalide")
    return normalized


def validate_isin(isin: str) -> str:
    normalized = isin.strip().upper()
    if not ISIN_PATTERN.fullmatch(normalized):
        raise ValueError("Code ISIN invalide")
    return normalized


def build_quote(
    symbol: str,
    target: float,
    history: list[dict[str, float | str]],
    currency: str | None = None,
    market_timezone: str | None = None,
    provider: str = "yahoo",
    display_name: str | None = None,
) -> dict:
    current_price = float(history[-1]["price"])
    distance = current_price - target
    return {
        "symbol": symbol,
        "currency": currency or ("EUR" if symbol.endswith(".PA") else "USD"),
        "marketTimezone": market_timezone or ("Europe/Paris" if symbol.endswith(".PA") else None),
        "target": target,
        "currentPrice": current_price,
        "targetDistance": distance,
        "targetDistancePercent": distance / current_price * 100,
        "history": history,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "provider": provider,
        "displayName": display_name,
    }


def fetch_credit_agricole_market_data(
    isin: str,
    bearer_token: str,
    x_authorization_token: str,
) -> tuple[list[dict[str, float | str]], str, str, str]:
    url = f"https://api.ca-titres.fr/bel/v1/products/{isin}/025"
    request = Request(url, headers={"Authorization": f"Bearer {bearer_token}"})
    for header, value in {
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "fr-CH,fr-FR;q=0.9,fr;q=0.8,en-US;q=0.7,en;q=0.6",
        "Client-Application": "",
        "Client-Version": "web-2026.4.6",
        "Connection": "keep-alive",
        "Origin": "https://www.ca-bourse.credit-agricole.fr",
        "Referer": "https://www.ca-bourse.credit-agricole.fr/",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "cross-site",
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/150.0.0.0 Safari/537.36"
        ),
        "X-Authorization": f"Bearer {x_authorization_token}",
        "sec-ch-ua": '"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
    }.items():
        request.add_header(header, value)

    try:
        with urlopen(request, timeout=10) as response:
            product = json.loads(response.read())
    except HTTPError as error:
        raise RuntimeError(
            f"L'API Crédit Agricole a répondu avec le statut HTTP {error.code}"
        ) from error
    except (URLError, TimeoutError, OSError) as error:
        raise RuntimeError("L'API Crédit Agricole est momentanément indisponible") from error
    except json.JSONDecodeError as error:
        raise RuntimeError("Réponse JSON invalide de l'API Crédit Agricole") from error

    try:
        current_price = product["current_price"]
        price = current_price["value"]
        currency = current_price["currency"]
        quote_date = datetime.fromisoformat(product["quote_date"].replace("Z", "+00:00"))
        name = product["name"]
        if (
            isinstance(price, bool)
            or not isinstance(price, (int, float))
            or not math.isfinite(price)
            or price <= 0
            or not isinstance(currency, str)
            or not re.fullmatch(r"[A-Z]{3}", currency)
            or quote_date.tzinfo is None
            or not isinstance(name, str)
            or not name.strip()
        ):
            raise ValueError
    except (KeyError, TypeError, ValueError, AttributeError) as error:
        raise RuntimeError("Réponse de cotation invalide de l'API Crédit Agricole") from error

    return (
        [{"time": quote_date.astimezone(timezone.utc).isoformat(), "price": float(price)}],
        currency,
        "Europe/Paris",
        name.strip(),
    )


def fetch_market_data(symbol: str) -> tuple[list[dict[str, float | str]], str, str | None]:
    import yfinance as yf

    now = time.monotonic()
    with _cache_lock:
        cached = _cache.get(symbol)
        if cached and now - cached[0] < CACHE_TTL_SECONDS:
            return cached[1], cached[2], cached[3]

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
        metadata = ticker.history_metadata or {}
    except Exception:
        metadata = {}
    currency = metadata.get("currency")
    if not currency:
        try:
            currency = ticker.fast_info.get("currency")
        except Exception:
            currency = None
    currency = currency or ("EUR" if symbol.endswith(".PA") else "USD")
    market_timezone = metadata.get("exchangeTimezoneName")
    market_timezone = market_timezone or ("Europe/Paris" if symbol.endswith(".PA") else None)

    with _cache_lock:
        _cache[symbol] = (time.monotonic(), history, currency, market_timezone)
    return history, currency, market_timezone