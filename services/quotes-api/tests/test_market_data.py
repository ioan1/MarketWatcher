import io
import json
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.market_data import (
    build_quote,
    fetch_credit_agricole_market_data,
    validate_isin,
    validate_symbol,
)
from app.main import quote


class MarketDataTests(unittest.TestCase):
    def test_validates_and_normalizes_symbol(self):
        self.assertEqual(validate_symbol(" ubi.pa "), "UBI.PA")

    def test_rejects_invalid_symbol(self):
        with self.assertRaises(ValueError):
            validate_symbol("UBI.PA/../../etc")

    def test_validates_and_normalizes_isin(self):
        self.assertEqual(validate_isin(" nl00150001q9 "), "NL00150001Q9")

    def test_rejects_invalid_isin(self):
        with self.assertRaises(ValueError):
            validate_isin("NL00150001Q9/025")

    def test_builds_negative_target_distance_when_price_is_below_target(self):
        quote = build_quote(
            "UBI.PA",
            25.0,
            [{"time": "2026-10-07T10:00:00+00:00", "price": 20.0}],
            "EUR",
            "Europe/Paris",
        )

        self.assertEqual(quote["currency"], "EUR")
        self.assertEqual(quote["marketTimezone"], "Europe/Paris")
        self.assertEqual(quote["targetDistance"], -5.0)
        self.assertEqual(quote["targetDistancePercent"], -25.0)

    def test_builds_positive_target_distance_when_price_is_above_target(self):
        quote = build_quote(
            "UBI.PA",
            25.0,
            [{"time": "2026-10-07T10:00:00+00:00", "price": 30.0}],
        )

        self.assertEqual(quote["targetDistance"], 5.0)
        self.assertAlmostEqual(quote["targetDistancePercent"], 100 / 6)

    @patch("app.market_data.urlopen")
    def test_fetches_credit_agricole_price_using_bearer_token(self, mock_urlopen):
        mock_urlopen.return_value = io.BytesIO(
            json.dumps(
                {
                    "name": "STELLANTIS",
                    "current_price": {"value": 3.9845, "currency": "EUR"},
                    "quote_date": "2026-10-16T15:35:00Z",
                }
            ).encode()
        )

        history, currency, market_timezone, name = fetch_credit_agricole_market_data(
            "NL00150001Q9",
            "test-token",
        )

        request = mock_urlopen.call_args.args[0]
        self.assertEqual(
            request.full_url,
            "https://api.ca-titres.fr/bel/v1/products/NL00150001Q9/025",
        )
        self.assertEqual(request.get_header("Authorization"), "Bearer test-token")
        self.assertEqual(history[0]["price"], 3.9845)
        self.assertEqual(history[0]["time"], "2026-10-16T15:35:00+00:00")
        self.assertEqual(currency, "EUR")
        self.assertEqual(market_timezone, "Europe/Paris")
        self.assertEqual(name, "STELLANTIS")

    @patch("app.market_data.urlopen")
    def test_rejects_invalid_credit_agricole_quote_data(self, mock_urlopen):
        mock_urlopen.return_value = io.BytesIO(
            json.dumps(
                {
                    "name": "STELLANTIS",
                    "current_price": {"value": 0, "currency": "EUR"},
                    "quote_date": "2026-10-16T15:35:00Z",
                }
            ).encode()
        )

        with self.assertRaisesRegex(RuntimeError, "Réponse de cotation invalide"):
            fetch_credit_agricole_market_data("NL00150001Q9", "test-token")

    @patch("app.main.fetch_credit_agricole_market_data")
    def test_credit_agricole_endpoint_requires_bearer_token(self, fetch_market_data):
        with self.assertRaises(HTTPException) as context:
            quote(
                "NL00150001Q9",
                target=4.0,
                provider="credit-agricole",
                authorization=None,
            )

        self.assertEqual(context.exception.status_code, 401)
        fetch_market_data.assert_not_called()

    @patch(
        "app.main.fetch_credit_agricole_market_data",
        return_value=(
            [{"time": "2026-10-16T15:35:00+00:00", "price": 3.9845}],
            "EUR",
            "Europe/Paris",
            "STELLANTIS",
        ),
    )
    def test_credit_agricole_endpoint_passes_bearer_and_builds_quote(self, fetch_market_data):
        result = quote(
            "NL00150001Q9",
            target=4.0,
            provider="credit-agricole",
            authorization="Bearer test-token",
        )

        fetch_market_data.assert_called_once_with("NL00150001Q9", "test-token")
        self.assertEqual(result["currentPrice"], 3.9845)
        self.assertEqual(result["currency"], "EUR")
        self.assertEqual(result["displayName"], "STELLANTIS")
        self.assertEqual(result["provider"], "credit-agricole")


if __name__ == "__main__":
    unittest.main()