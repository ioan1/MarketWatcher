from fastapi import FastAPI, HTTPException, Query

from app.market_data import build_quote, fetch_market_data, validate_symbol

app = FastAPI(title="Market Watcher API", version="1.0.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/quotes/{symbol}")
def quote(symbol: str, target: float = Query(gt=0, allow_inf_nan=False)) -> dict:
    try:
        normalized_symbol = validate_symbol(symbol)
        history, currency, market_timezone = fetch_market_data(normalized_symbol)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    return build_quote(normalized_symbol, target, history, currency, market_timezone)