# Zakat Calculator

A simple web application to calculate annual Zakat based on your assets.

## Features

- **Cash Holdings**: Support for multiple currencies (USD, SAR, PKR, INR, CNY, AED, QAR, BHD, OMR)
- **Precious Metals**: Gold (24K, 22K, 18K, 15K, 10K) and Silver with weight in grams
- **US Stocks**: Add any US-listed stock symbol with fractional share support
- **Historical Rates**: Fetch exchange rates and metal prices for any past date
- **Multi-Currency Output**: View Zakat due in USD, SAR, PKR, and INR

## Quick Start

1. Open `index.html` in a web browser
2. Select your Zakat calculation date
3. Click "Fetch Rates for Date" to get exchange rates and metal prices
4. Enter your assets (cash, metals, stocks)
5. Click "Calculate Zakat"

## Stock Prices

There are two ways to get stock prices:

### Option 1: Automatic Fetch (Recommended)

Run the included Python server to automatically fetch historical stock prices:

```bash
# Install dependencies (one time)
pip install -r requirements.txt

# Start the server
python server.py
```

Then in the web app:
1. Enter stock symbols and shares
2. Click "Fetch Prices" to auto-fill prices for your selected date

### Option 2: Manual Entry

If you prefer not to run the server:
1. Enter the stock symbol
2. Click "Look up" to open Yahoo Finance
3. Find the closing price for your date
4. Enter the price manually

## Data Sources

| Data | Source | API Key Required |
|------|--------|------------------|
| Exchange Rates | [Frankfurter API](https://frankfurter.app/) | No |
| Gold/Silver Prices | [FreeGoldAPI.com](https://freegoldapi.com/) | No |
| Stock Prices | [yfinance](https://github.com/ranaroussi/yfinance) (via local server) | No |

## Technical Details

- Pure HTML/CSS/JavaScript frontend - no build tools required
- Optional Python backend for stock prices (uses yfinance)
- Responsive design for mobile and desktop
- All rates shown with source links for verification

## Running Locally

```bash
# Serve the web app (optional, can also open index.html directly)
python -m http.server 8000

# In another terminal, start the stock price server (optional)
python server.py
```

Then open http://localhost:8000 in your browser.

## Files

```
zakat-calculator/
├── index.html      # Main web page
├── styles.css      # Styling
├── app.js          # Frontend logic
├── server.py       # Stock price server (optional)
└── requirements.txt # Python dependencies
```

## Zakat Rate

The standard Zakat rate is **2.5%** (1/40th) of total eligible wealth that has been held for one lunar year.

## Disclaimer

This calculator provides estimates for informational purposes. Please consult with a qualified Islamic scholar for specific rulings regarding your Zakat obligations.
