import unittest

from app.market_data import build_quote, validate_symbol


class MarketDataTests(unittest.TestCase):
    def test_validates_and_normalizes_symbol(self):
        self.assertEqual(validate_symbol(" ubi.pa "), "UBI.PA")

    def test_rejects_invalid_symbol(self):
        with self.assertRaises(ValueError):
            validate_symbol("UBI.PA/../../etc")

    def test_builds_target_distance(self):
        quote = build_quote(
            "UBI.PA",
            25.0,
            [{"time": "2026-10-07T10:00:00+00:00", "price": 20.0}],
            "EUR",
            "Europe/Paris",
        )

        self.assertEqual(quote["currency"], "EUR")
        self.assertEqual(quote["marketTimezone"], "Europe/Paris")
        self.assertEqual(quote["targetDistance"], 5.0)
        self.assertEqual(quote["targetDistancePercent"], 25.0)


if __name__ == "__main__":
    unittest.main()