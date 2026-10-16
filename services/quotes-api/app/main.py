from typing import Literal

from fastapi import FastAPI, Header, HTTPException, Query

from app.market_data import (
    build_quote,
    fetch_credit_agricole_market_data,
    fetch_market_data,
    validate_isin,
    validate_symbol,
)

app = FastAPI(title="Market Watcher API", version="1.0.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/quotes/{symbol}")
def quote(
    symbol: str,
    target: float = Query(gt=0, allow_inf_nan=False),
    provider: Literal["yahoo", "credit-agricole"] = "yahoo",
    authorization: str | None = Header(default=None),
) -> dict:
    try:
        if provider == "credit-agricole":
            isin = validate_isin(symbol)
            scheme, _, bearer_token = (authorization or "").partition(" ")
            if scheme.lower() != "bearer" or not bearer_token.strip():
                raise HTTPException(
                    status_code=401,
                    detail="Un token Bearer Crédit Agricole est requis",
                )
            normalized_symbol = isin
            history, currency, market_timezone, display_name = (
                fetch_credit_agricole_market_data(isin, bearer_token.strip())
            )
        else:
            normalized_symbol = validate_symbol(symbol)
            history, currency, market_timezone = fetch_market_data(normalized_symbol)
            display_name = None
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    return build_quote(
        normalized_symbol,
        target,
        history,
        currency,
        market_timezone,
        provider,
        display_name,
    )