const https = require('https');

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://finance.yahoo.com/',
        'Origin': 'https://finance.yahoo.com',
      }
    }, (res) => {
      // follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(get(res.headers.location));
      }
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch (e) { reject(new Error(`Parse error (${res.statusCode}): ${body.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=300');

  const { action, symbols, symbol } = req.query;

  try {
    // Single stock: price + fundamentals in one call
    if (action === 'stock' && symbol) {
      const modules = 'price,summaryDetail,financialData,defaultKeyStatistics,incomeStatementHistory';
      const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}&corsDomain=finance.yahoo.com`;
      const result = await get(url);
      if (result.data?.quoteSummary?.error) {
        return res.status(404).json({ error: result.data.quoteSummary.error.description });
      }
      const data = result.data?.quoteSummary?.result?.[0] || {};
      return res.status(200).json(data);
    }

    // Batch quotes (fallback, less reliable)
    if (action === 'quotes' && symbols) {
      const fields = 'regularMarketPrice,fiftyTwoWeekHigh,regularMarketChangePercent,trailingPE,forwardPE,marketCap,shortName';
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=${fields}&corsDomain=finance.yahoo.com`;
      const result = await get(url);
      const list = result.data?.quoteResponse?.result || [];
      const map = {};
      list.forEach(q => { map[q.symbol] = q; });
      return res.status(200).json(map);
    }

    res.status(400).json({ error: 'action must be stock or quotes' });
  } catch (e) {
    console.error('[yahoo]', action, symbol || symbols, e.message);
    res.status(502).json({ error: e.message });
  }
};
