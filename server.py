#!/usr/bin/env python3
"""
Simple stock price server using yfinance.
Run this locally when calculating Zakat to fetch historical stock prices.

Usage:
    pip install -r requirements.txt
    python server.py

The server runs on http://localhost:5555 and provides stock price data
to the Zakat calculator web app.
"""

import json
from datetime import datetime, timedelta
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

try:
    import yfinance as yf
except ImportError:
    print("Error: yfinance not installed. Run: pip install yfinance")
    exit(1)


class StockPriceHandler(BaseHTTPRequestHandler):
    """Handle stock price requests."""

    def _send_cors_headers(self):
        """Send CORS headers to allow browser requests."""
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _send_json_response(self, data, status=200):
        """Send JSON response."""
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        """Handle GET requests."""
        parsed_path = urlparse(self.path)

        if parsed_path.path == '/health':
            # Health check endpoint
            self._send_json_response({'status': 'ok', 'service': 'yfinance-server'})
            return

        if parsed_path.path == '/stock':
            # Stock price endpoint
            params = parse_qs(parsed_path.query)

            symbol = params.get('symbol', [None])[0]
            date_str = params.get('date', [None])[0]

            if not symbol:
                self._send_json_response({'error': 'Missing symbol parameter'}, 400)
                return

            if not date_str:
                self._send_json_response({'error': 'Missing date parameter'}, 400)
                return

            try:
                price_data = get_stock_price(symbol.upper(), date_str)
                self._send_json_response(price_data)
            except Exception as e:
                self._send_json_response({'error': str(e)}, 500)
            return

        if parsed_path.path == '/stocks':
            # Batch stock prices endpoint
            params = parse_qs(parsed_path.query)

            symbols_str = params.get('symbols', [None])[0]
            date_str = params.get('date', [None])[0]

            if not symbols_str:
                self._send_json_response({'error': 'Missing symbols parameter'}, 400)
                return

            if not date_str:
                self._send_json_response({'error': 'Missing date parameter'}, 400)
                return

            symbols = [s.strip().upper() for s in symbols_str.split(',')]

            try:
                results = {}
                for symbol in symbols:
                    results[symbol] = get_stock_price(symbol, date_str)
                self._send_json_response({'date': date_str, 'prices': results})
            except Exception as e:
                self._send_json_response({'error': str(e)}, 500)
            return

        # Unknown endpoint
        self._send_json_response({'error': 'Not found'}, 404)

    def log_message(self, format, *args):
        """Custom log format."""
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {args[0]}")


def get_stock_price(symbol: str, date_str: str) -> dict:
    """
    Get historical stock price for a specific date.

    Args:
        symbol: Stock ticker symbol (e.g., 'AAPL')
        date_str: Date in YYYY-MM-DD format

    Returns:
        Dict with price data including close price
    """
    try:
        # Parse the target date
        target_date = datetime.strptime(date_str, '%Y-%m-%d')

        # Fetch data for a range around the target date (to handle weekends/holidays)
        start_date = target_date - timedelta(days=7)
        end_date = target_date + timedelta(days=1)

        # Get stock data
        ticker = yf.Ticker(symbol)
        hist = ticker.history(start=start_date.strftime('%Y-%m-%d'),
                             end=end_date.strftime('%Y-%m-%d'))

        if hist.empty:
            return {
                'symbol': symbol,
                'error': f'No data found for {symbol}',
                'price': None
            }

        # Find the closest date on or before target
        hist.index = hist.index.tz_localize(None)  # Remove timezone
        valid_dates = hist.index[hist.index <= target_date]

        if len(valid_dates) == 0:
            # Use the first available date
            closest_date = hist.index[0]
        else:
            closest_date = valid_dates[-1]

        row = hist.loc[closest_date]

        return {
            'symbol': symbol,
            'date': closest_date.strftime('%Y-%m-%d'),
            'requested_date': date_str,
            'open': round(row['Open'], 2),
            'high': round(row['High'], 2),
            'low': round(row['Low'], 2),
            'close': round(row['Close'], 2),
            'volume': int(row['Volume']),
            'price': round(row['Close'], 2)  # Convenience field
        }

    except Exception as e:
        return {
            'symbol': symbol,
            'error': str(e),
            'price': None
        }


def main():
    """Start the server."""
    port = 5555
    server_address = ('', port)
    httpd = HTTPServer(server_address, StockPriceHandler)

    print(f"""
╔══════════════════════════════════════════════════════════════╗
║           Zakat Calculator - Stock Price Server              ║
╠══════════════════════════════════════════════════════════════╣
║  Server running at: http://localhost:{port}                    ║
║                                                              ║
║  Endpoints:                                                  ║
║    GET /health              - Health check                   ║
║    GET /stock?symbol=AAPL&date=2024-01-15                   ║
║    GET /stocks?symbols=AAPL,MSFT&date=2024-01-15            ║
║                                                              ║
║  Press Ctrl+C to stop                                        ║
╚══════════════════════════════════════════════════════════════╝
    """)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        httpd.shutdown()


if __name__ == '__main__':
    main()
