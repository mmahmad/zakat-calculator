# Zakat Calculator

A simple, dependency-free web application to calculate annual Zakat based on your assets.

## Features

- **Cash Holdings**: Support for multiple currencies (USD, SAR, PKR, INR, CNY, AED, QAR, BHD, OMR)
- **Precious Metals**: Gold (24K, 22K, 18K, 15K, 10K) and Silver with weight in grams
- **US Stocks**: Add any US-listed stock symbol with fractional share support
- **Historical Rates**: Fetch exchange rates and prices for any past date
- **Multi-Currency Output**: View Zakat due in USD, SAR, PKR, and INR

## Usage

1. Open `index.html` in a web browser
2. Select the calculation date
3. Click "Fetch Rates for Date" to get current exchange rates and metal prices
4. Enter your asset quantities:
   - Cash amounts in each currency
   - Gold and silver weights in grams
   - Stock symbols and share counts (click "Fetch" for each stock)
5. Click "Calculate Zakat" to see your Zakat obligation (2.5% of total wealth)

## APIs Used

- **Exchange Rates**: [Frankfurter API](https://www.frankfurter.app/) (free, no API key)
- **Metal Prices**: [Metals.live API](https://metals.live/) (free, no API key)
- **Stock Prices**: Yahoo Finance (may require manual entry due to CORS)

## Technical Details

- Pure HTML/CSS/JavaScript - no build tools or frameworks required
- No dependencies or npm packages
- Works offline after initial rate fetch (with cached data)
- Responsive design for mobile and desktop

## Running Locally

Simply open `index.html` in any modern web browser, or serve with any static file server:

```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx serve .
```

Then open http://localhost:8000 in your browser.

## Zakat Rate

The standard Zakat rate is **2.5%** (1/40th) of total eligible wealth that has been held for one lunar year.

## Disclaimer

This calculator provides estimates for informational purposes. Please consult with a qualified Islamic scholar for specific rulings regarding your Zakat obligations.
