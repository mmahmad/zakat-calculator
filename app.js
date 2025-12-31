// Zakat Calculator - Main Application

// Global state
const state = {
    calculationDate: null,
    exchangeRates: {},      // Rates to USD
    metalPrices: {          // Price per gram in USD
        gold: null,
        silver: null
    },
    stockPrices: {},        // Symbol -> price
    ratesFetched: false,
    // Source tracking for transparency
    sources: {
        exchangeRates: { url: null, isFallback: false },
        metalPrices: { url: null, isFallback: false }
    }
};

// Constants
const ZAKAT_RATE = 0.025;   // 2.5%
const TROY_OUNCE_TO_GRAMS = 31.1035;

// Currency codes we support
const CURRENCIES = ['USD', 'SAR', 'PKR', 'INR', 'CNY', 'AED', 'QAR', 'BHD', 'OMR'];

// Gold purity mappings
const GOLD_PURITIES = {
    '24k': 1.0,
    '22k': 22/24,
    '18k': 18/24,
    '15k': 15/24,
    '10k': 10/24
};

// DOM Elements
const elements = {
    calculationDate: document.getElementById('calculation-date'),
    fetchRatesBtn: document.getElementById('fetch-rates-btn'),
    ratesStatus: document.getElementById('rates-status'),
    addStockBtn: document.getElementById('add-stock-btn'),
    stocksContainer: document.getElementById('stocks-container'),
    calculateBtn: document.getElementById('calculate-btn'),
    results: document.getElementById('results'),
    cashTotal: document.getElementById('cash-total'),
    metalsTotal: document.getElementById('metals-total'),
    stocksTotal: document.getElementById('stocks-total')
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    elements.calculationDate.value = today;
    elements.calculationDate.max = today;

    // Event listeners
    elements.fetchRatesBtn.addEventListener('click', fetchAllRates);
    elements.addStockBtn.addEventListener('click', addStockRow);
    elements.calculateBtn.addEventListener('click', calculateZakat);

    // Add input listeners for live totals
    document.querySelectorAll('#cash-inputs input').forEach(input => {
        input.addEventListener('input', updateCashTotal);
    });
    document.querySelectorAll('#gold-inputs input, #silver-inputs input').forEach(input => {
        input.addEventListener('input', updateMetalsTotal);
    });
});

// Status display helper
function setStatus(message, type = '') {
    elements.ratesStatus.textContent = message;
    elements.ratesStatus.className = 'status ' + type;
}

// Fetch all rates for the selected date
async function fetchAllRates() {
    const dateStr = elements.calculationDate.value;
    if (!dateStr) {
        setStatus('Please select a date first', 'error');
        return;
    }

    state.calculationDate = dateStr;
    state.ratesFetched = false;
    elements.fetchRatesBtn.disabled = true;
    setStatus('Fetching exchange rates and metal prices...', 'loading');

    try {
        // Fetch currency rates and metal prices in parallel
        await Promise.all([
            fetchExchangeRates(dateStr),
            fetchMetalPrices(dateStr)
        ]);

        state.ratesFetched = true;
        setStatus(`Rates fetched for ${dateStr}`, 'success');
        updateAllDisplays();
    } catch (error) {
        console.error('Error fetching rates:', error);
        setStatus('Error fetching rates. Some data may be unavailable.', 'error');
    } finally {
        elements.fetchRatesBtn.disabled = false;
    }
}

// Fetch exchange rates using Frankfurter API (free, no key required)
async function fetchExchangeRates(dateStr) {
    const currencies = CURRENCIES.filter(c => c !== 'USD').join(',');
    const apiUrl = `https://api.frankfurter.app/${dateStr}?from=USD&to=${currencies}`;

    try {
        // Frankfurter API - free historical exchange rates
        const response = await fetch(apiUrl);

        if (!response.ok) {
            throw new Error('Exchange rate API error');
        }

        const data = await response.json();

        // Store rates (how many units of currency per 1 USD)
        state.exchangeRates = { USD: 1, ...data.rates };
        state.sources.exchangeRates = {
            url: apiUrl,
            displayUrl: `https://www.frankfurter.app/${dateStr}?from=USD`,
            isFallback: false
        };

        console.log('Exchange rates fetched:', state.exchangeRates);
    } catch (error) {
        console.error('Error fetching exchange rates:', error);
        // Fallback to approximate rates if API fails
        state.exchangeRates = {
            USD: 1,
            SAR: 3.75,
            PKR: 280,
            INR: 83,
            CNY: 7.2,
            AED: 3.67,
            QAR: 3.64,
            BHD: 0.376,
            OMR: 0.385
        };
        state.sources.exchangeRates = {
            url: null,
            displayUrl: null,
            isFallback: true
        };
        console.log('Using fallback exchange rates');
    }
}

// Fetch precious metal prices
async function fetchMetalPrices(dateStr) {
    const apiUrl = 'https://api.metals.live/v1/spot';

    try {
        // Try metals.live API first (free, no key)
        const response = await fetch(apiUrl);

        if (response.ok) {
            const data = await response.json();
            // metals.live returns prices per troy ounce
            const goldData = data.find(m => m.metal === 'gold');
            const silverData = data.find(m => m.metal === 'silver');

            if (goldData && silverData) {
                // Convert from per troy ounce to per gram
                state.metalPrices.gold = goldData.price / TROY_OUNCE_TO_GRAMS;
                state.metalPrices.silver = silverData.price / TROY_OUNCE_TO_GRAMS;
                state.metalPrices.goldPerOz = goldData.price;
                state.metalPrices.silverPerOz = silverData.price;
                state.sources.metalPrices = {
                    url: apiUrl,
                    displayUrl: 'https://metals.live/',
                    isFallback: false
                };
                console.log('Metal prices fetched from metals.live:', state.metalPrices);
                return;
            }
        }
    } catch (error) {
        console.error('metals.live API error:', error);
    }

    // Fallback: use estimated prices
    console.log('Using fallback metal prices');
    // Gold: ~$2000/oz = ~$64.30/gram
    // Silver: ~$25/oz = ~$0.80/gram
    state.metalPrices.gold = 64.30;
    state.metalPrices.silver = 0.80;
    state.metalPrices.goldPerOz = 2000;
    state.metalPrices.silverPerOz = 25;
    state.sources.metalPrices = {
        url: null,
        displayUrl: null,
        isFallback: true
    };
}

// Fetch stock price for a specific symbol
async function fetchStockPrice(button) {
    const row = button.closest('.stock-row');
    const symbolInput = row.querySelector('.stock-symbol');
    const priceSpan = row.querySelector('.stock-price');
    const valueSpan = row.querySelector('.stock-value');
    const sharesInput = row.querySelector('.stock-shares');

    const symbol = symbolInput.value.trim().toUpperCase();
    if (!symbol) {
        priceSpan.textContent = 'Enter symbol';
        return;
    }

    button.disabled = true;
    priceSpan.textContent = 'Loading...';

    try {
        const price = await getStockPrice(symbol, state.calculationDate);
        if (price !== null) {
            state.stockPrices[symbol] = price;
            priceSpan.textContent = `$${price.toFixed(2)}`;

            // Update value if shares entered
            const shares = parseFloat(sharesInput.value) || 0;
            if (shares > 0) {
                valueSpan.textContent = `$${(shares * price).toFixed(2)}`;
            }

            updateStocksTotal();
            updateStockPricesTable(); // Update the rates display table
        } else {
            priceSpan.textContent = 'Not found';
        }
    } catch (error) {
        console.error('Error fetching stock price:', error);
        priceSpan.textContent = 'Error';
    } finally {
        button.disabled = false;
    }
}

// Get stock price using Yahoo Finance
async function getStockPrice(symbol, dateStr) {
    try {
        // Yahoo Finance API via a query
        // Using the chart endpoint which is more reliable
        const endDate = new Date(dateStr);
        endDate.setDate(endDate.getDate() + 1);
        const startDate = new Date(dateStr);
        startDate.setDate(startDate.getDate() - 5); // Go back a few days to ensure we get data

        const period1 = Math.floor(startDate.getTime() / 1000);
        const period2 = Math.floor(endDate.getTime() / 1000);

        // Using a CORS proxy for Yahoo Finance
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d`;

        // Try direct fetch first (may work depending on browser/CORS)
        const response = await fetch(url);

        if (response.ok) {
            const data = await response.json();
            const result = data.chart.result?.[0];
            if (result && result.indicators?.quote?.[0]?.close) {
                const closes = result.indicators.quote[0].close.filter(c => c !== null);
                if (closes.length > 0) {
                    return closes[closes.length - 1]; // Last closing price
                }
            }
        }
    } catch (error) {
        console.error('Yahoo Finance error:', error);
    }

    // Fallback: prompt user for manual entry
    const manualPrice = prompt(`Could not fetch price for ${symbol}. Enter the closing price manually (in USD):`);
    if (manualPrice && !isNaN(parseFloat(manualPrice))) {
        return parseFloat(manualPrice);
    }

    return null;
}

// Add a new stock row
function addStockRow() {
    const newRow = document.createElement('div');
    newRow.className = 'stock-row';
    newRow.innerHTML = `
        <input type="text" class="stock-symbol" placeholder="Symbol (e.g., AAPL)" maxlength="10">
        <input type="number" class="stock-shares" step="0.0001" min="0" placeholder="Shares">
        <span class="stock-price">Price: --</span>
        <span class="stock-value">Value: --</span>
        <button class="btn btn-small btn-fetch" onclick="fetchStockPrice(this)">Fetch</button>
        <button class="btn btn-small btn-danger" onclick="removeStockRow(this)">×</button>
    `;
    elements.stocksContainer.appendChild(newRow);

    // Add input listener for live updates
    newRow.querySelector('.stock-shares').addEventListener('input', () => {
        updateStockRowValue(newRow);
        updateStocksTotal();
    });
}

// Remove a stock row
function removeStockRow(button) {
    const row = button.closest('.stock-row');
    const rows = elements.stocksContainer.querySelectorAll('.stock-row');

    // Keep at least one row
    if (rows.length > 1) {
        row.remove();
        updateStocksTotal();
    } else {
        // Clear the row instead
        row.querySelector('.stock-symbol').value = '';
        row.querySelector('.stock-shares').value = '';
        row.querySelector('.stock-price').textContent = 'Price: --';
        row.querySelector('.stock-value').textContent = 'Value: --';
        updateStocksTotal();
    }
}

// Update stock row value display
function updateStockRowValue(row) {
    const symbol = row.querySelector('.stock-symbol').value.trim().toUpperCase();
    const shares = parseFloat(row.querySelector('.stock-shares').value) || 0;
    const valueSpan = row.querySelector('.stock-value');

    if (state.stockPrices[symbol] && shares > 0) {
        const value = shares * state.stockPrices[symbol];
        valueSpan.textContent = `$${value.toFixed(2)}`;
    } else {
        valueSpan.textContent = 'Value: --';
    }
}

// Update all rate displays
function updateAllDisplays() {
    // Update currency rate displays in input section
    CURRENCIES.forEach(currency => {
        const rateSpan = document.querySelector(`[data-rate-for="${currency}"]`);
        if (rateSpan && state.exchangeRates[currency]) {
            if (currency === 'USD') {
                rateSpan.textContent = 'Base currency';
            } else {
                rateSpan.textContent = `1 USD = ${state.exchangeRates[currency].toFixed(4)} ${currency}`;
            }
        }
    });

    // Update metal price displays in input section
    if (state.metalPrices.gold) {
        const goldPrice = state.metalPrices.gold;
        document.querySelector('[data-rate-for="gold-24k"]').textContent =
            `$${goldPrice.toFixed(2)}/g`;
        document.querySelector('[data-rate-for="gold-22k"]').textContent =
            `$${(goldPrice * GOLD_PURITIES['22k']).toFixed(2)}/g`;
        document.querySelector('[data-rate-for="gold-18k"]').textContent =
            `$${(goldPrice * GOLD_PURITIES['18k']).toFixed(2)}/g`;
        document.querySelector('[data-rate-for="gold-15k"]').textContent =
            `$${(goldPrice * GOLD_PURITIES['15k']).toFixed(2)}/g`;
        document.querySelector('[data-rate-for="gold-10k"]').textContent =
            `$${(goldPrice * GOLD_PURITIES['10k']).toFixed(2)}/g`;
    }

    if (state.metalPrices.silver) {
        document.querySelector('[data-rate-for="silver"]').textContent =
            `$${state.metalPrices.silver.toFixed(2)}/g`;
    }

    // Update the fetched rates display section
    updateRatesDisplaySection();

    updateCashTotal();
    updateMetalsTotal();
    updateStocksTotal();
}

// Update the rates display section with source links
function updateRatesDisplaySection() {
    const section = document.getElementById('fetched-rates-section');
    section.style.display = 'block';

    // Update date display
    document.getElementById('rates-date').textContent = state.calculationDate;

    // Update exchange rates table
    const exchangeRatesLink = document.getElementById('exchange-rates-link');
    const exchangeRatesTable = document.getElementById('exchange-rates-table').querySelector('tbody');

    if (state.sources.exchangeRates.isFallback) {
        exchangeRatesLink.textContent = 'Fallback rates (API unavailable)';
        exchangeRatesLink.removeAttribute('href');
        exchangeRatesLink.style.color = '#856404';
    } else {
        exchangeRatesLink.textContent = 'Frankfurter API';
        exchangeRatesLink.href = state.sources.exchangeRates.displayUrl;
        exchangeRatesLink.style.color = '';
    }

    // Populate exchange rates table
    exchangeRatesTable.innerHTML = '';
    CURRENCIES.forEach(currency => {
        if (state.exchangeRates[currency]) {
            const row = document.createElement('tr');
            const rateValue = currency === 'USD' ? '1.0000 (base)' : state.exchangeRates[currency].toFixed(4);
            const fallbackBadge = state.sources.exchangeRates.isFallback ? '<span class="fallback-warning">fallback</span>' : '';
            row.innerHTML = `<td>${currency}</td><td>${rateValue} ${fallbackBadge}</td>`;
            exchangeRatesTable.appendChild(row);
        }
    });

    // Update metal prices table
    const metalPricesLink = document.getElementById('metal-prices-link');
    const metalPricesTable = document.getElementById('metal-prices-table').querySelector('tbody');

    if (state.sources.metalPrices.isFallback) {
        metalPricesLink.textContent = 'Fallback prices (API unavailable)';
        metalPricesLink.removeAttribute('href');
        metalPricesLink.style.color = '#856404';
    } else {
        metalPricesLink.textContent = 'Metals.live';
        metalPricesLink.href = state.sources.metalPrices.displayUrl;
        metalPricesLink.style.color = '';
    }

    // Populate metal prices table
    metalPricesTable.innerHTML = '';
    const fallbackBadge = state.sources.metalPrices.isFallback ? '<span class="fallback-warning">fallback</span>' : '';

    if (state.metalPrices.gold) {
        const goldRow = document.createElement('tr');
        goldRow.innerHTML = `<td>Gold (per oz / per gram)</td><td>$${state.metalPrices.goldPerOz.toFixed(2)}/oz = $${state.metalPrices.gold.toFixed(2)}/g ${fallbackBadge}</td>`;
        metalPricesTable.appendChild(goldRow);
    }
    if (state.metalPrices.silver) {
        const silverRow = document.createElement('tr');
        silverRow.innerHTML = `<td>Silver (per oz / per gram)</td><td>$${state.metalPrices.silverPerOz.toFixed(2)}/oz = $${state.metalPrices.silver.toFixed(2)}/g ${fallbackBadge}</td>`;
        metalPricesTable.appendChild(silverRow);
    }

    // Update stock prices table
    updateStockPricesTable();
}

// Update the stock prices display table
function updateStockPricesTable() {
    const stockPricesTable = document.getElementById('stock-prices-table').querySelector('tbody');
    const symbols = Object.keys(state.stockPrices);

    if (symbols.length === 0) {
        stockPricesTable.innerHTML = '<tr><td colspan="3" class="empty-message">No stocks fetched yet</td></tr>';
        return;
    }

    stockPricesTable.innerHTML = '';
    symbols.forEach(symbol => {
        const price = state.stockPrices[symbol];
        const yahooUrl = `https://finance.yahoo.com/quote/${symbol}`;
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${symbol}</strong></td>
            <td>$${price.toFixed(2)}</td>
            <td><a href="${yahooUrl}" target="_blank" rel="noopener">Yahoo Finance</a></td>
        `;
        stockPricesTable.appendChild(row);
    });
}

// Calculate cash total in USD
function updateCashTotal() {
    let totalUSD = 0;
    document.querySelectorAll('#cash-inputs input').forEach(input => {
        const currency = input.dataset.currency;
        const amount = parseFloat(input.value) || 0;

        if (amount > 0 && state.exchangeRates[currency]) {
            // Convert to USD: amount / rate (since rate is units per USD)
            totalUSD += amount / state.exchangeRates[currency];
        }
    });

    elements.cashTotal.textContent = `$${totalUSD.toFixed(2)}`;
    return totalUSD;
}

// Calculate metals total in USD
function updateMetalsTotal() {
    let totalUSD = 0;

    // Gold
    document.querySelectorAll('#gold-inputs input').forEach(input => {
        const grams = parseFloat(input.value) || 0;
        const purity = parseFloat(input.dataset.purity) || 1.0;

        if (grams > 0 && state.metalPrices.gold) {
            totalUSD += grams * purity * state.metalPrices.gold;
        }
    });

    // Silver
    document.querySelectorAll('#silver-inputs input').forEach(input => {
        const grams = parseFloat(input.value) || 0;
        const purity = parseFloat(input.dataset.purity) || 1.0;

        if (grams > 0 && state.metalPrices.silver) {
            totalUSD += grams * purity * state.metalPrices.silver;
        }
    });

    elements.metalsTotal.textContent = `$${totalUSD.toFixed(2)}`;
    return totalUSD;
}

// Calculate stocks total in USD
function updateStocksTotal() {
    let totalUSD = 0;

    document.querySelectorAll('.stock-row').forEach(row => {
        const symbol = row.querySelector('.stock-symbol').value.trim().toUpperCase();
        const shares = parseFloat(row.querySelector('.stock-shares').value) || 0;

        if (shares > 0 && state.stockPrices[symbol]) {
            totalUSD += shares * state.stockPrices[symbol];
        }
    });

    elements.stocksTotal.textContent = `$${totalUSD.toFixed(2)}`;
    return totalUSD;
}

// Main Zakat calculation
function calculateZakat() {
    if (!state.ratesFetched) {
        alert('Please fetch rates for the calculation date first.');
        return;
    }

    // Calculate totals
    const cashTotal = updateCashTotal();
    const metalsTotal = updateMetalsTotal();
    const stocksTotal = updateStocksTotal();
    const totalWealth = cashTotal + metalsTotal + stocksTotal;

    // Calculate Zakat (2.5%)
    const zakatUSD = totalWealth * ZAKAT_RATE;

    // Display breakdown
    document.getElementById('result-cash').textContent = `$${cashTotal.toFixed(2)}`;
    document.getElementById('result-metals').textContent = `$${metalsTotal.toFixed(2)}`;
    document.getElementById('result-stocks').textContent = `$${stocksTotal.toFixed(2)}`;
    document.getElementById('result-total').textContent = `$${totalWealth.toFixed(2)}`;

    // Display Zakat in multiple currencies
    document.getElementById('zakat-usd').textContent = `$${zakatUSD.toFixed(2)}`;

    if (state.exchangeRates.SAR) {
        document.getElementById('zakat-sar').textContent =
            `${(zakatUSD * state.exchangeRates.SAR).toFixed(2)} SAR`;
    }
    if (state.exchangeRates.PKR) {
        document.getElementById('zakat-pkr').textContent =
            `${(zakatUSD * state.exchangeRates.PKR).toFixed(2)} PKR`;
    }
    if (state.exchangeRates.INR) {
        document.getElementById('zakat-inr').textContent =
            `${(zakatUSD * state.exchangeRates.INR).toFixed(2)} INR`;
    }

    // Show results
    elements.results.style.display = 'block';
    elements.results.scrollIntoView({ behavior: 'smooth' });
}

// Make functions available globally for onclick handlers
window.fetchStockPrice = fetchStockPrice;
window.removeStockRow = removeStockRow;
