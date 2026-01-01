#!/usr/bin/env python3
"""
Zakat Calculator - Unified API Server

Provides all financial data from a single endpoint:
- Exchange rates
- Precious metal prices
- Stock prices

Usage:
    pip install -r requirements.txt
    python server.py

The server runs on http://localhost:5555
"""

import json
import urllib.request
import urllib.error
from datetime import datetime, timedelta
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

try:
    import yfinance as yf
except ImportError:
    print("Error: yfinance not installed. Run: pip install yfinance")
    exit(1)

# Constants
PORT = 5555
TROY_OUNCE_TO_GRAMS = 31.1035

# Supported currencies
CURRENCIES = ['USD', 'SAR', 'PKR', 'INR', 'CNY', 'AED', 'QAR', 'BHD', 'OMR']

# Fallback rates (approximate, used when API unavailable)
FALLBACK_USD_RATES = {
    'USD': 1, 'SAR': 3.75, 'PKR': 278, 'INR': 83,
    'CNY': 7.24, 'AED': 3.67, 'QAR': 3.64, 'BHD': 0.376, 'OMR': 0.385
}

# Fallback metal prices (approximate USD per gram)
FALLBACK_METAL_PRICES = {
    'gold': {'perGram': 64.30, 'perOz': 2000},
    'silver': {'perGram': 0.80, 'perOz': 25}
}


def fetch_exchange_rates(date_str: str, base_currency: str = 'USD') -> dict:
    """
    Fetch exchange rates from Frankfurter API.
    Returns rates as units of each currency per 1 unit of base currency.
    """
    # Currencies supported by Frankfurter (ECB data)
    frankfurter_supported = {'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'INR', 'AUD', 'CAD', 'CHF'}

    try:
        # Fetch rates with USD as base (universally supported)
        currencies_to_fetch = [c for c in CURRENCIES if c != 'USD' and c in frankfurter_supported]

        if currencies_to_fetch:
            url = f"https://api.frankfurter.app/{date_str}?from=USD&to={','.join(currencies_to_fetch)}"

            with urllib.request.urlopen(url, timeout=10) as response:
                data = json.loads(response.read().decode())
                api_rates = {'USD': 1.0, **data.get('rates', {})}
        else:
            api_rates = {'USD': 1.0}

        # Build complete USD-based rates (API + fallbacks for unsupported currencies)
        usd_based_rates = {}
        for currency in CURRENCIES:
            if currency in api_rates:
                usd_based_rates[currency] = api_rates[currency]
            else:
                usd_based_rates[currency] = FALLBACK_USD_RATES.get(currency, 1)

        # Convert to selected base currency
        base_to_usd = usd_based_rates.get(base_currency, 1)
        rates = {currency: rate / base_to_usd for currency, rate in usd_based_rates.items()}

        return {'rates': rates, 'source': 'frankfurter', 'fallback': False}

    except Exception as e:
        print(f"Exchange rate API error: {e}")
        # Full fallback
        base_to_usd = FALLBACK_USD_RATES.get(base_currency, 1)
        rates = {c: r / base_to_usd for c, r in FALLBACK_USD_RATES.items()}
        return {'rates': rates, 'source': 'fallback', 'fallback': True}


def fetch_metal_prices(date_str: str, base_currency: str = 'USD', exchange_rates: dict = None) -> dict:
    """
    Fetch gold and silver prices from FreeGoldAPI.
    Returns prices in the specified base currency.
    """
    gold_url = 'https://freegoldapi.com/data/latest.csv'
    ratio_url = 'https://freegoldapi.com/data/gold_silver_ratio_enriched.csv'

    try:
        # Fetch gold prices
        with urllib.request.urlopen(gold_url, timeout=10) as response:
            gold_csv = response.read().decode()

        # Fetch gold/silver ratio
        with urllib.request.urlopen(ratio_url, timeout=10) as response:
            ratio_csv = response.read().decode()

        # Parse gold price for date
        gold_price_oz = parse_csv_price(gold_csv, date_str)
        ratio = parse_csv_ratio(ratio_csv, date_str) or 60  # Default ratio if not found

        if gold_price_oz:
            silver_price_oz = gold_price_oz / ratio

            # Prices in USD
            prices_usd = {
                'gold': {'perOz': gold_price_oz, 'perGram': gold_price_oz / TROY_OUNCE_TO_GRAMS},
                'silver': {'perOz': silver_price_oz, 'perGram': silver_price_oz / TROY_OUNCE_TO_GRAMS}
            }

            # Convert to base currency if needed
            if base_currency != 'USD' and exchange_rates:
                usd_rate = exchange_rates.get('USD', 1)
                multiplier = 1 / usd_rate  # Convert USD to base
                prices = {
                    'gold': {
                        'perOz': prices_usd['gold']['perOz'] * multiplier,
                        'perGram': prices_usd['gold']['perGram'] * multiplier
                    },
                    'silver': {
                        'perOz': prices_usd['silver']['perOz'] * multiplier,
                        'perGram': prices_usd['silver']['perGram'] * multiplier
                    }
                }
            else:
                prices = prices_usd

            return {'prices': prices, 'source': 'freegoldapi', 'fallback': False}

    except Exception as e:
        print(f"Metal prices API error: {e}")

    # Fallback
    prices = FALLBACK_METAL_PRICES.copy()
    if base_currency != 'USD' and exchange_rates:
        usd_rate = exchange_rates.get('USD', 1)
        multiplier = 1 / usd_rate
        prices = {
            'gold': {k: v * multiplier for k, v in FALLBACK_METAL_PRICES['gold'].items()},
            'silver': {k: v * multiplier for k, v in FALLBACK_METAL_PRICES['silver'].items()}
        }

    return {'prices': prices, 'source': 'fallback', 'fallback': True}


def parse_csv_price(csv_text: str, target_date: str) -> float:
    """Parse gold price CSV and find price for target date."""
    lines = csv_text.strip().split('\n')
    if len(lines) < 2:
        return None

    header = [h.strip().lower() for h in lines[0].split(',')]
    date_idx = next((i for i, h in enumerate(header) if h == 'date'), None)
    price_idx = next((i for i, h in enumerate(header) if h == 'price'), None)

    if date_idx is None or price_idx is None:
        return None

    target = datetime.strptime(target_date, '%Y-%m-%d')
    best_match = None

    for line in lines[1:]:
        cols = line.split(',')
        if len(cols) <= max(date_idx, price_idx):
            continue

        row_date = cols[date_idx].strip()
        try:
            price = float(cols[price_idx])
            row_dt = datetime.strptime(row_date, '%Y-%m-%d')

            if row_date == target_date:
                return price

            if row_dt <= target:
                if not best_match or row_dt > best_match[0]:
                    best_match = (row_dt, price)
        except (ValueError, IndexError):
            continue

    return best_match[1] if best_match else None


def parse_csv_ratio(csv_text: str, target_date: str) -> float:
    """Parse gold/silver ratio CSV."""
    lines = csv_text.strip().split('\n')
    if len(lines) < 2:
        return None

    header = [h.strip().lower() for h in lines[0].split(',')]
    date_idx = next((i for i, h in enumerate(header) if h == 'date'), None)
    ratio_idx = next((i for i, h in enumerate(header) if 'ratio' in h or 'silver_oz' in h), None)

    if date_idx is None or ratio_idx is None:
        return None

    target = datetime.strptime(target_date, '%Y-%m-%d')
    best_match = None

    for line in lines[1:]:
        cols = line.split(',')
        if len(cols) <= max(date_idx, ratio_idx):
            continue

        row_date = cols[date_idx].strip()
        try:
            ratio = float(cols[ratio_idx])
            row_dt = datetime.strptime(row_date, '%Y-%m-%d')

            if row_date == target_date:
                return ratio

            if row_dt <= target:
                if not best_match or row_dt > best_match[0]:
                    best_match = (row_dt, ratio)
        except (ValueError, IndexError):
            continue

    return best_match[1] if best_match else None


def fetch_stock_prices(symbols: list, date_str: str) -> dict:
    """Fetch stock prices using yfinance."""
    if not symbols:
        return {}

    results = {}
    target_date = datetime.strptime(date_str, '%Y-%m-%d')
    start_date = target_date - timedelta(days=7)
    end_date = target_date + timedelta(days=1)

    for symbol in symbols:
        try:
            ticker = yf.Ticker(symbol)
            hist = ticker.history(
                start=start_date.strftime('%Y-%m-%d'),
                end=end_date.strftime('%Y-%m-%d')
            )

            if hist.empty:
                results[symbol] = {'price': None, 'error': 'No data found'}
                continue

            # Find closest date on or before target
            hist.index = hist.index.tz_localize(None)
            valid_dates = hist.index[hist.index <= target_date]

            if len(valid_dates) == 0:
                closest_date = hist.index[0]
            else:
                closest_date = valid_dates[-1]

            row = hist.loc[closest_date]
            results[symbol] = {
                'price': round(row['Close'], 2),
                'date': closest_date.strftime('%Y-%m-%d')
            }

        except Exception as e:
            results[symbol] = {'price': None, 'error': str(e)}

    return results


class ZakatAPIHandler(BaseHTTPRequestHandler):
    """Handle API requests."""

    def _send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)

        # Health check
        if parsed.path == '/health':
            self._send_json({'status': 'ok', 'service': 'zakat-api'})
            return

        # Unified rates endpoint
        if parsed.path == '/api/rates':
            date_str = params.get('date', [None])[0]
            base = params.get('base', ['USD'])[0].upper()
            stocks_str = params.get('stocks', [''])[0]

            if not date_str:
                self._send_json({'error': 'Missing date parameter'}, 400)
                return

            # Validate date format
            try:
                datetime.strptime(date_str, '%Y-%m-%d')
            except ValueError:
                self._send_json({'error': 'Invalid date format. Use YYYY-MM-DD'}, 400)
                return

            # Fetch all data
            print(f"Fetching rates for {date_str} (base: {base})")

            exchange_result = fetch_exchange_rates(date_str, base)
            metal_result = fetch_metal_prices(date_str, base, exchange_result['rates'])

            # Parse stock symbols
            stocks = [s.strip().upper() for s in stocks_str.split(',') if s.strip()]
            stock_prices = fetch_stock_prices(stocks, date_str) if stocks else {}

            response = {
                'date': date_str,
                'baseCurrency': base,
                'exchangeRates': exchange_result['rates'],
                'metalPrices': metal_result['prices'],
                'stockPrices': stock_prices,
                'sources': {
                    'exchangeRates': exchange_result['source'],
                    'metalPrices': metal_result['source']
                },
                'fallback': {
                    'exchangeRates': exchange_result['fallback'],
                    'metalPrices': metal_result['fallback']
                }
            }

            self._send_json(response)
            return

        self._send_json({'error': 'Not found'}, 404)

    def log_message(self, format, *args):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {args[0]}")


def main():
    server = HTTPServer(('', PORT), ZakatAPIHandler)
    print(f"""
╔══════════════════════════════════════════════════════════════╗
║            Zakat Calculator - Unified API Server             ║
╠══════════════════════════════════════════════════════════════╣
║  Server running at: http://localhost:{PORT}                    ║
║                                                              ║
║  Endpoint:                                                   ║
║    GET /api/rates?date=2024-01-15&base=USD&stocks=AAPL,MSFT  ║
║                                                              ║
║  Returns: exchange rates, metal prices, stock prices         ║
║                                                              ║
║  Press Ctrl+C to stop                                        ║
╚══════════════════════════════════════════════════════════════╝
    """)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        server.shutdown()


if __name__ == '__main__':
    main()
