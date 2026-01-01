// Zakat Calculator - Simplified Frontend
// All data fetching is done through the unified backend API

const API_URL = 'http://localhost:5555';

// State
const state = {
    calculationDate: null,
    baseCurrency: 'USD',
    exchangeRates: {},
    metalPrices: { gold: null, silver: null },
    stockPrices: {},
    ratesFetched: false,
    fallback: { exchangeRates: false, metalPrices: false }
};

// Constants
const ZAKAT_RATE = 0.025;
const CURRENCIES = ['USD', 'SAR', 'PKR', 'INR', 'CNY', 'AED', 'QAR', 'BHD', 'OMR'];
const GOLD_PURITIES = { '24k': 1.0, '22k': 22/24, '18k': 18/24, '15k': 15/24, '10k': 10/24 };

// DOM Elements
const elements = {
    calculationDate: document.getElementById('calculation-date'),
    baseCurrency: document.getElementById('base-currency'),
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

    // Live total updates
    document.querySelectorAll('#cash-inputs input').forEach(input => {
        input.addEventListener('input', updateCashTotal);
    });
    document.querySelectorAll('#gold-inputs input, #silver-inputs input').forEach(input => {
        input.addEventListener('input', updateMetalsTotal);
    });

    // Set up existing stock rows
    document.querySelectorAll('.stock-row').forEach(setupStockRowListeners);

    // Check server status
    checkServer();
});

// Status display
function setStatus(message, type = '') {
    elements.ratesStatus.textContent = message;
    elements.ratesStatus.className = 'status ' + type;
}

// Check if server is running
async function checkServer() {
    const statusEl = document.getElementById('server-status');
    try {
        const response = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(2000) });
        if (response.ok) {
            statusEl.textContent = 'Server: Online';
            statusEl.className = 'server-status online';
            return true;
        }
    } catch (e) {}
    statusEl.textContent = 'Server: Offline';
    statusEl.className = 'server-status offline';
    return false;
}

// Fetch all rates from unified backend
async function fetchAllRates() {
    const dateStr = elements.calculationDate.value;
    if (!dateStr) {
        setStatus('Please select a date first', 'error');
        return;
    }

    state.calculationDate = dateStr;
    state.baseCurrency = elements.baseCurrency.value;
    state.ratesFetched = false;
    elements.fetchRatesBtn.disabled = true;
    setStatus('Fetching rates from server...', 'loading');

    // Collect stock symbols
    const stocks = [];
    document.querySelectorAll('.stock-row').forEach(row => {
        const symbol = row.querySelector('.stock-symbol').value.trim().toUpperCase();
        if (symbol) stocks.push(symbol);
    });

    try {
        const url = `${API_URL}/api/rates?date=${dateStr}&base=${state.baseCurrency}&stocks=${stocks.join(',')}`;
        const response = await fetch(url);

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Server error');
        }

        const data = await response.json();

        // Update state from response
        state.exchangeRates = data.exchangeRates;
        state.metalPrices = {
            gold: data.metalPrices.gold.perGram,
            silver: data.metalPrices.silver.perGram,
            goldPerOz: data.metalPrices.gold.perOz,
            silverPerOz: data.metalPrices.silver.perOz
        };
        state.fallback = data.fallback;

        // Update stock prices in UI
        if (data.stockPrices) {
            Object.entries(data.stockPrices).forEach(([symbol, priceData]) => {
                if (priceData.price !== null) {
                    state.stockPrices[symbol] = priceData.price;
                    // Update the input field
                    document.querySelectorAll('.stock-row').forEach(row => {
                        const symbolInput = row.querySelector('.stock-symbol');
                        if (symbolInput.value.trim().toUpperCase() === symbol) {
                            row.querySelector('.stock-price-input').value = priceData.price;
                            updateStockRowValue(row);
                        }
                    });
                }
            });
        }

        state.ratesFetched = true;
        setStatus(`Rates fetched for ${dateStr} (Base: ${state.baseCurrency})`, 'success');
        updateAllDisplays();

    } catch (error) {
        console.error('Fetch error:', error);
        setStatus(`Error: ${error.message}. Is the server running?`, 'error');
    } finally {
        elements.fetchRatesBtn.disabled = false;
    }
}

// Update all displays
function updateAllDisplays() {
    const base = state.baseCurrency;
    const symbol = getCurrencySymbol(base);

    // Update rate displays in input section
    CURRENCIES.forEach(currency => {
        const rateSpan = document.querySelector(`[data-rate-for="${currency}"]`);
        if (rateSpan && state.exchangeRates[currency] !== undefined) {
            if (currency === base) {
                rateSpan.textContent = 'Base currency';
            } else {
                rateSpan.textContent = `1 ${base} = ${state.exchangeRates[currency].toFixed(4)} ${currency}`;
            }
        }
    });

    // Update metal price displays
    if (state.metalPrices.gold) {
        const goldPrice = state.metalPrices.gold;
        document.querySelector('[data-rate-for="gold-24k"]').textContent = `${symbol}${goldPrice.toFixed(2)}/g`;
        document.querySelector('[data-rate-for="gold-22k"]').textContent = `${symbol}${(goldPrice * GOLD_PURITIES['22k']).toFixed(2)}/g`;
        document.querySelector('[data-rate-for="gold-18k"]').textContent = `${symbol}${(goldPrice * GOLD_PURITIES['18k']).toFixed(2)}/g`;
        document.querySelector('[data-rate-for="gold-15k"]').textContent = `${symbol}${(goldPrice * GOLD_PURITIES['15k']).toFixed(2)}/g`;
        document.querySelector('[data-rate-for="gold-10k"]').textContent = `${symbol}${(goldPrice * GOLD_PURITIES['10k']).toFixed(2)}/g`;
    }
    if (state.metalPrices.silver) {
        document.querySelector('[data-rate-for="silver"]').textContent = `${symbol}${state.metalPrices.silver.toFixed(2)}/g`;
    }

    // Update rates display section
    updateRatesDisplaySection();

    // Update totals
    updateCashTotal();
    updateMetalsTotal();
    updateStocksTotal();
}

// Update the fetched rates display section
function updateRatesDisplaySection() {
    const section = document.getElementById('fetched-rates-section');
    section.style.display = 'block';
    const base = state.baseCurrency;
    const symbol = getCurrencySymbol(base);

    document.getElementById('rates-date').textContent = state.calculationDate;
    document.getElementById('base-currency-label').textContent = base;

    // Exchange rates table
    const exchangeTable = document.getElementById('exchange-rates-table').querySelector('tbody');
    const exchangeLink = document.getElementById('exchange-rates-link');

    exchangeLink.textContent = state.fallback.exchangeRates ? 'Fallback rates' : 'Frankfurter API';
    exchangeLink.style.color = state.fallback.exchangeRates ? '#856404' : '';

    exchangeTable.innerHTML = '';
    CURRENCIES.forEach(currency => {
        if (state.exchangeRates[currency] !== undefined) {
            const row = document.createElement('tr');
            const rate = currency === base ? '1.0000 (base)' : state.exchangeRates[currency].toFixed(4);
            row.innerHTML = `<td>${currency}</td><td>${rate}</td>`;
            exchangeTable.appendChild(row);
        }
    });

    // Metal prices table
    const metalTable = document.getElementById('metal-prices-table').querySelector('tbody');
    const metalLink = document.getElementById('metal-prices-link');

    metalLink.textContent = state.fallback.metalPrices ? 'Fallback prices' : 'FreeGoldAPI.com';
    metalLink.style.color = state.fallback.metalPrices ? '#856404' : '';

    metalTable.innerHTML = '';
    if (state.metalPrices.gold) {
        const goldRow = document.createElement('tr');
        goldRow.innerHTML = `<td>Gold</td><td>${symbol}${state.metalPrices.goldPerOz.toFixed(2)}/oz = ${symbol}${state.metalPrices.gold.toFixed(2)}/g</td>`;
        metalTable.appendChild(goldRow);
    }
    if (state.metalPrices.silver) {
        const silverRow = document.createElement('tr');
        silverRow.innerHTML = `<td>Silver</td><td>${symbol}${state.metalPrices.silverPerOz.toFixed(2)}/oz = ${symbol}${state.metalPrices.silver.toFixed(2)}/g</td>`;
        metalTable.appendChild(silverRow);
    }

    // Stock prices table
    updateStockPricesTable();
}

// Update stock prices table
function updateStockPricesTable() {
    const table = document.getElementById('stock-prices-table').querySelector('tbody');
    const symbols = Object.keys(state.stockPrices);

    if (symbols.length === 0) {
        table.innerHTML = '<tr><td colspan="3" class="empty-message">No stocks fetched yet</td></tr>';
        return;
    }

    table.innerHTML = '';
    symbols.forEach(symbol => {
        const price = state.stockPrices[symbol];
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${symbol}</strong></td>
            <td>$${price.toFixed(2)}</td>
            <td><a href="https://finance.yahoo.com/quote/${symbol}" target="_blank">Yahoo Finance</a></td>
        `;
        table.appendChild(row);
    });
}

// Stock row management
function setupStockRowListeners(row) {
    const symbolInput = row.querySelector('.stock-symbol');
    const sharesInput = row.querySelector('.stock-shares');
    const priceInput = row.querySelector('.stock-price-input');
    const lookupLink = row.querySelector('.stock-lookup');

    symbolInput.addEventListener('input', () => {
        const symbol = symbolInput.value.trim().toUpperCase();
        lookupLink.href = symbol ? `https://finance.yahoo.com/quote/${symbol}/history/` : '#';
    });

    sharesInput.addEventListener('input', () => updateStockRowValue(row));
    priceInput.addEventListener('input', () => updateStockRowValue(row));
}

function updateStockRowValue(row) {
    const symbol = row.querySelector('.stock-symbol').value.trim().toUpperCase();
    const shares = parseFloat(row.querySelector('.stock-shares').value) || 0;
    const price = parseFloat(row.querySelector('.stock-price-input').value) || 0;
    const valueSpan = row.querySelector('.stock-value');

    if (shares > 0 && price > 0) {
        valueSpan.textContent = `$${(shares * price).toFixed(2)}`;
        if (symbol) state.stockPrices[symbol] = price;
    } else {
        valueSpan.textContent = 'Value: --';
    }
    updateStocksTotal();
    updateStockPricesTable();
}

function addStockRow() {
    const row = document.createElement('div');
    row.className = 'stock-row';
    row.innerHTML = `
        <input type="text" class="stock-symbol" placeholder="Symbol (e.g., AAPL)" maxlength="10">
        <input type="number" class="stock-shares" step="0.0001" min="0" placeholder="Shares">
        <input type="number" class="stock-price-input" step="0.01" min="0" placeholder="Price ($)">
        <a class="btn btn-small btn-secondary stock-lookup" href="#" target="_blank">Look up</a>
        <span class="stock-value">Value: --</span>
        <button class="btn btn-small btn-danger" onclick="removeStockRow(this)">×</button>
    `;
    elements.stocksContainer.appendChild(row);
    setupStockRowListeners(row);
}

function removeStockRow(button) {
    const row = button.closest('.stock-row');
    const rows = elements.stocksContainer.querySelectorAll('.stock-row');
    const symbol = row.querySelector('.stock-symbol').value.trim().toUpperCase();

    if (symbol) delete state.stockPrices[symbol];

    if (rows.length > 1) {
        row.remove();
    } else {
        row.querySelector('.stock-symbol').value = '';
        row.querySelector('.stock-shares').value = '';
        row.querySelector('.stock-price-input').value = '';
        row.querySelector('.stock-value').textContent = 'Value: --';
        row.querySelector('.stock-lookup').href = '#';
    }
    updateStocksTotal();
    updateStockPricesTable();
}

// Currency symbol helper
function getCurrencySymbol(currency) {
    const symbols = { USD: '$', SAR: 'SAR ', PKR: 'Rs', INR: '₹', CNY: '¥', AED: 'AED ', QAR: 'QAR ', BHD: 'BHD ', OMR: 'OMR ' };
    return symbols[currency] || currency + ' ';
}

// Calculate totals
function updateCashTotal() {
    let total = 0;
    const base = state.baseCurrency;
    const symbol = getCurrencySymbol(base);

    document.querySelectorAll('#cash-inputs input').forEach(input => {
        const currency = input.dataset.currency;
        const amount = parseFloat(input.value) || 0;
        if (amount > 0 && state.exchangeRates[currency]) {
            total += amount / state.exchangeRates[currency];
        }
    });

    elements.cashTotal.textContent = `${symbol}${total.toFixed(2)}`;
    return total;
}

function updateMetalsTotal() {
    let total = 0;
    const base = state.baseCurrency;
    const symbol = getCurrencySymbol(base);

    document.querySelectorAll('#gold-inputs input').forEach(input => {
        const grams = parseFloat(input.value) || 0;
        const purity = parseFloat(input.dataset.purity) || 1.0;
        if (grams > 0 && state.metalPrices.gold) {
            total += grams * purity * state.metalPrices.gold;
        }
    });

    document.querySelectorAll('#silver-inputs input').forEach(input => {
        const grams = parseFloat(input.value) || 0;
        if (grams > 0 && state.metalPrices.silver) {
            total += grams * state.metalPrices.silver;
        }
    });

    elements.metalsTotal.textContent = `${symbol}${total.toFixed(2)}`;
    return total;
}

function updateStocksTotal() {
    let totalUSD = 0;
    const base = state.baseCurrency;
    const symbol = getCurrencySymbol(base);

    document.querySelectorAll('.stock-row').forEach(row => {
        const shares = parseFloat(row.querySelector('.stock-shares').value) || 0;
        const price = parseFloat(row.querySelector('.stock-price-input').value) || 0;
        if (shares > 0 && price > 0) totalUSD += shares * price;
    });

    // Convert USD to base currency
    let total = totalUSD;
    if (base !== 'USD' && state.exchangeRates['USD']) {
        total = totalUSD / state.exchangeRates['USD'];
    }

    elements.stocksTotal.textContent = `${symbol}${total.toFixed(2)}`;
    return total;
}

// Main Zakat calculation
function calculateZakat() {
    if (!state.ratesFetched) {
        alert('Please fetch rates first.');
        return;
    }

    const base = state.baseCurrency;
    const symbol = getCurrencySymbol(base);

    const cashTotal = updateCashTotal();
    const metalsTotal = updateMetalsTotal();
    const stocksTotal = updateStocksTotal();
    const totalWealth = cashTotal + metalsTotal + stocksTotal;
    const zakatDue = totalWealth * ZAKAT_RATE;

    // Display results
    document.getElementById('result-cash').textContent = `${symbol}${cashTotal.toFixed(2)}`;
    document.getElementById('result-metals').textContent = `${symbol}${metalsTotal.toFixed(2)}`;
    document.getElementById('result-stocks').textContent = `${symbol}${stocksTotal.toFixed(2)}`;
    document.getElementById('result-total').textContent = `${symbol}${totalWealth.toFixed(2)}`;
    document.getElementById('result-base-currency').textContent = base;

    // Zakat in multiple currencies
    document.getElementById('zakat-usd').textContent = `${symbol}${zakatDue.toFixed(2)}`;
    document.querySelector('#zakat-usd').previousElementSibling.textContent = base;

    if (state.exchangeRates.SAR) {
        document.getElementById('zakat-sar').textContent = `${(zakatDue * state.exchangeRates.SAR).toFixed(2)} SAR`;
    }
    if (state.exchangeRates.PKR) {
        document.getElementById('zakat-pkr').textContent = `${(zakatDue * state.exchangeRates.PKR).toFixed(2)} PKR`;
    }
    if (state.exchangeRates.INR) {
        document.getElementById('zakat-inr').textContent = `${(zakatDue * state.exchangeRates.INR).toFixed(2)} INR`;
    }

    elements.results.style.display = 'block';
    elements.results.scrollIntoView({ behavior: 'smooth' });
}

// Global function for onclick handlers
window.removeStockRow = removeStockRow;
