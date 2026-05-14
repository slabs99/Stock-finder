const https = require('https');

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch (e) { reject(new Error('Parse error: ' + body.slice(0, 300))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=300');

  const { action, symbols, symbol } = req.query;

  try {
    if (action === 'quotes' && symbols) {
      const fields = 'regularMarketPrice,fiftyTwoWeekHigh,regularMarketChangePercent,trailingPE,forwardPE,marketCap,shortName,longName';
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=${fields}`;
      const result = await get(url);
      const list = result.data?.quoteResponse?.result || [];
      const map = {};
      list.forEach(q => { map[q.symbol] = q; });
      return res.status(200).json(map);
    }

    if (action === 'fundamentals' && symbol) {
      const modules = 'financialData,defaultKeyStatistics,incomeStatementHistory';
      const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}`;
      const result = await get(url);
      const data = result.data?.quoteSummary?.result?.[0] || {};
      return res.status(200).json(data);
    }

    res.status(400).json({ error: 'action must be quotes or fundamentals' });
  } catch (e) {
    console.error('[yahoo]', action, symbol || symbols, e.message);
    res.status(502).json({ error: e.message });
  }
};
