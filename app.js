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
    stockServerOnline: false,
    // Source tracking for transparency
    sources: {
        exchangeRates: { url: null, isFallback: false },
        metalPrices: { url: null, isFallback: false }
    }
};

// Constants
const ZAKAT_RATE = 0.025;   // 2.5%
const TROY_OUNCE_TO_GRAMS = 31.1035;
const STOCK_SERVER_URL = 'http://localhost:5555';

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

// Fetch precious metal prices from FreeGoldAPI.com (free, no API key required)
async function fetchMetalPrices(dateStr) {
    const goldApiUrl = 'https://freegoldapi.com/data/latest.csv';
    const ratioApiUrl = 'https://freegoldapi.com/data/gold_silver_ratio_enriched.csv';

    try {
        // Fetch both gold prices and gold/silver ratio in parallel
        const [goldResponse, ratioResponse] = await Promise.all([
            fetch(goldApiUrl),
            fetch(ratioApiUrl)
        ]);

        if (!goldResponse.ok || !ratioResponse.ok) {
            throw new Error('FreeGoldAPI request failed');
        }

        const goldCsv = await goldResponse.text();
        const ratioCsv = await ratioResponse.text();

        // Parse CSV data to find price for the selected date
        const goldPrice = findPriceForDate(goldCsv, dateStr);
        const ratioData = findRatioForDate(ratioCsv, dateStr);

        if (goldPrice !== null) {
            state.metalPrices.goldPerOz = goldPrice;
            state.metalPrices.gold = goldPrice / TROY_OUNCE_TO_GRAMS;

            // Calculate silver price from gold/silver ratio
            if (ratioData && ratioData.ratio) {
                state.metalPrices.silverPerOz = goldPrice / ratioData.ratio;
                state.metalPrices.silver = state.metalPrices.silverPerOz / TROY_OUNCE_TO_GRAMS;
            } else {
                // Fallback ratio if not available (historical average ~60:1)
                state.metalPrices.silverPerOz = goldPrice / 60;
                state.metalPrices.silver = state.metalPrices.silverPerOz / TROY_OUNCE_TO_GRAMS;
            }

            state.sources.metalPrices = {
                url: goldApiUrl,
                displayUrl: 'https://freegoldapi.com/',
                isFallback: false,
                dataDate: goldPrice.date || dateStr
            };

            console.log('Metal prices fetched from FreeGoldAPI:', state.metalPrices);
            return;
        }
    } catch (error) {
        console.error('FreeGoldAPI error:', error);
    }

    // Fallback: use estimated prices
    console.log('Using fallback metal prices');
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

// Parse CSV and find gold price for a specific date (or closest earlier date)
function findPriceForDate(csvText, targetDate) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return null;

    // Parse header to find column indices
    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    const dateIdx = header.findIndex(h => h === 'date');
    const priceIdx = header.findIndex(h => h === 'price');

    if (dateIdx === -1 || priceIdx === -1) return null;

    // Parse data rows and find the best match
    let bestMatch = null;
    const targetDateObj = new Date(targetDate);

    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        if (cols.length <= Math.max(dateIdx, priceIdx)) continue;

        const rowDate = cols[dateIdx].trim();
        const price = parseFloat(cols[priceIdx]);

        if (isNaN(price)) continue;

        const rowDateObj = new Date(rowDate);

        // Exact match
        if (rowDate === targetDate) {
            return price;
        }

        // Track closest earlier date
        if (rowDateObj <= targetDateObj) {
            if (!bestMatch || rowDateObj > new Date(bestMatch.date)) {
                bestMatch = { date: rowDate, price: price };
            }
        }
    }

    return bestMatch ? bestMatch.price : null;
}

// Parse CSV and find gold/silver ratio for a specific date
function findRatioForDate(csvText, targetDate) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return null;

    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    const dateIdx = header.findIndex(h => h === 'date');
    // Look for ratio column (might be named differently)
    const ratioIdx = header.findIndex(h =>
        h.includes('ratio') || h.includes('silver_oz_per_gold')
    );

    if (dateIdx === -1 || ratioIdx === -1) return null;

    let bestMatch = null;
    const targetDateObj = new Date(targetDate);

    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        if (cols.length <= Math.max(dateIdx, ratioIdx)) continue;

        const rowDate = cols[dateIdx].trim();
        const ratio = parseFloat(cols[ratioIdx]);

        if (isNaN(ratio)) continue;

        const rowDateObj = new Date(rowDate);

        if (rowDate === targetDate) {
            return { date: rowDate, ratio: ratio };
        }

        if (rowDateObj <= targetDateObj) {
            if (!bestMatch || rowDateObj > new Date(bestMatch.date)) {
                bestMatch = { date: rowDate, ratio: ratio };
            }
        }
    }

    return bestMatch;
}

// Check if stock server is running
async function checkStockServer() {
    const statusEl = document.getElementById('server-status');
    const fetchBtn = document.getElementById('fetch-all-stocks-btn');

    statusEl.textContent = 'Server: Checking...';
    statusEl.className = 'server-status checking';

    try {
        const response = await fetch(`${STOCK_SERVER_URL}/health`, {
            method: 'GET',
            signal: AbortSignal.timeout(2000) // 2 second timeout
        });

        if (response.ok) {
            const data = await response.json();
            if (data.status === 'ok') {
                state.stockServerOnline = true;
                statusEl.textContent = 'Server: Online';
                statusEl.className = 'server-status online';
                fetchBtn.disabled = false;
                return true;
            }
        }
    } catch (error) {
        // Server not available
    }

    state.stockServerOnline = false;
    statusEl.textContent = 'Server: Offline';
    statusEl.className = 'server-status offline';
    fetchBtn.disabled = true;
    return false;
}

// Fetch all stock prices from the server
async function fetchAllStockPrices() {
    if (!state.stockServerOnline) {
        alert('Stock server is not running. Please start it with: python server.py');
        return;
    }

    if (!state.calculationDate) {
        alert('Please select a calculation date first.');
        return;
    }

    // Collect all symbols from stock rows
    const symbols = [];
    document.querySelectorAll('.stock-row').forEach(row => {
        const symbol = row.querySelector('.stock-symbol').value.trim().toUpperCase();
        if (symbol) {
            symbols.push(symbol);
        }
    });

    if (symbols.length === 0) {
        alert('Please enter at least one stock symbol.');
        return;
    }

    const fetchBtn = document.getElementById('fetch-all-stocks-btn');
    const originalText = fetchBtn.textContent;
    fetchBtn.textContent = 'Fetching...';
    fetchBtn.disabled = true;

    try {
        const response = await fetch(
            `${STOCK_SERVER_URL}/stocks?symbols=${symbols.join(',')}&date=${state.calculationDate}`
        );

        if (!response.ok) {
            throw new Error('Server request failed');
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        // Update each stock row with the fetched price
        let fetchedCount = 0;
        document.querySelectorAll('.stock-row').forEach(row => {
            const symbolInput = row.querySelector('.stock-symbol');
            const priceInput = row.querySelector('.stock-price-input');
            const symbol = symbolInput.value.trim().toUpperCase();

            if (symbol && data.prices[symbol]) {
                const priceData = data.prices[symbol];
                if (priceData.price !== null) {
                    priceInput.value = priceData.price;
                    // Trigger input event to update value calculation
                    priceInput.dispatchEvent(new Event('input'));
                    fetchedCount++;
                } else if (priceData.error) {
                    console.warn(`Error fetching ${symbol}: ${priceData.error}`);
                }
            }
        });

        if (fetchedCount > 0) {
            alert(`Successfully fetched prices for ${fetchedCount} stock(s).`);
        } else {
            alert('Could not fetch any stock prices. Check the symbols and try again.');
        }

    } catch (error) {
        console.error('Error fetching stock prices:', error);
        alert(`Error fetching stock prices: ${error.message}\n\nYou can still enter prices manually.`);
    } finally {
        fetchBtn.textContent = originalText;
        fetchBtn.disabled = !state.stockServerOnline;
    }
}

// Set up stock row event listeners
function setupStockRowListeners(row) {
    const symbolInput = row.querySelector('.stock-symbol');
    const sharesInput = row.querySelector('.stock-shares');
    const priceInput = row.querySelector('.stock-price-input');
    const lookupLink = row.querySelector('.stock-lookup');
    const valueSpan = row.querySelector('.stock-value');

    // Update lookup link when symbol changes
    symbolInput.addEventListener('input', () => {
        const symbol = symbolInput.value.trim().toUpperCase();
        if (symbol) {
            // Link to Yahoo Finance historical data page
            lookupLink.href = `https://finance.yahoo.com/quote/${symbol}/history/`;
            lookupLink.textContent = 'Look up';
        } else {
            lookupLink.href = '#';
            lookupLink.textContent = 'Look up';
        }
    });

    // Update value when shares or price changes
    const updateValue = () => {
        const symbol = symbolInput.value.trim().toUpperCase();
        const shares = parseFloat(sharesInput.value) || 0;
        const price = parseFloat(priceInput.value) || 0;

        if (shares > 0 && price > 0) {
            const value = shares * price;
            valueSpan.textContent = `$${value.toFixed(2)}`;
            // Store price in state for display in rates table
            if (symbol) {
                state.stockPrices[symbol] = price;
            }
        } else {
            valueSpan.textContent = 'Value: --';
        }
        updateStocksTotal();
        updateStockPricesTable();
    };

    sharesInput.addEventListener('input', updateValue);
    priceInput.addEventListener('input', updateValue);
}

// Initialize existing stock rows and check server
document.addEventListener('DOMContentLoaded', () => {
    // Set up stock row listeners
    document.querySelectorAll('.stock-row').forEach(row => {
        setupStockRowListeners(row);
    });

    // Check if stock server is running
    checkStockServer();

    // Set up fetch all stocks button
    const fetchAllBtn = document.getElementById('fetch-all-stocks-btn');
    if (fetchAllBtn) {
        fetchAllBtn.addEventListener('click', fetchAllStockPrices);
    }

    // Periodically check server status (every 30 seconds)
    setInterval(checkStockServer, 30000);
});

// Add a new stock row
function addStockRow() {
    const newRow = document.createElement('div');
    newRow.className = 'stock-row';
    newRow.innerHTML = `
        <input type="text" class="stock-symbol" placeholder="Symbol (e.g., AAPL)" maxlength="10">
        <input type="number" class="stock-shares" step="0.0001" min="0" placeholder="Shares">
        <input type="number" class="stock-price-input" step="0.01" min="0" placeholder="Price ($)">
        <a class="btn btn-small btn-fetch stock-lookup" href="#" target="_blank" rel="noopener">Look up</a>
        <span class="stock-value">Value: --</span>
        <button class="btn btn-small btn-danger" onclick="removeStockRow(this)">×</button>
    `;
    elements.stocksContainer.appendChild(newRow);

    // Set up event listeners for the new row
    setupStockRowListeners(newRow);
}

// Remove a stock row
function removeStockRow(button) {
    const row = button.closest('.stock-row');
    const rows = elements.stocksContainer.querySelectorAll('.stock-row');

    // Keep at least one row
    if (rows.length > 1) {
        // Remove from state.stockPrices if it exists
        const symbol = row.querySelector('.stock-symbol').value.trim().toUpperCase();
        if (symbol && state.stockPrices[symbol]) {
            delete state.stockPrices[symbol];
        }
        row.remove();
        updateStocksTotal();
        updateStockPricesTable();
    } else {
        // Clear the row instead
        const symbol = row.querySelector('.stock-symbol').value.trim().toUpperCase();
        if (symbol && state.stockPrices[symbol]) {
            delete state.stockPrices[symbol];
        }
        row.querySelector('.stock-symbol').value = '';
        row.querySelector('.stock-shares').value = '';
        row.querySelector('.stock-price-input').value = '';
        row.querySelector('.stock-value').textContent = 'Value: --';
        row.querySelector('.stock-lookup').href = '#';
        updateStocksTotal();
        updateStockPricesTable();
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
        metalPricesLink.textContent = 'FreeGoldAPI.com';
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
        const shares = parseFloat(row.querySelector('.stock-shares').value) || 0;
        const price = parseFloat(row.querySelector('.stock-price-input').value) || 0;

        if (shares > 0 && price > 0) {
            totalUSD += shares * price;
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
window.removeStockRow = removeStockRow;
