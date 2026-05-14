const https = require('https');

// Module-level crumb cache — persists across warm invocations
let _crumb = null;
let _cookies = null;
let _crumbTs = 0;

function req(url, headers) {
  return new Promise((resolve, reject) => {
    const r = https.get(url, { headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(req(res.headers.location, headers));
      }
      const setCookies = res.headers['set-cookie'] || [];
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body, setCookies, headers: res.headers }));
    });
    r.on('error', reject);
    r.setTimeout(12000, () => { r.destroy(); reject(new Error('Timeout')); });
  });
}

function parseCookies(cookieHeaders) {
  return cookieHeaders.map(c => c.split(';')[0]).join('; ');
}

const BASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function getCrumb() {
  if (_crumb && Date.now() - _crumbTs < 3600000) return { crumb: _crumb, cookies: _cookies };

  console.log('[yahoo] fetching new crumb...');

  // Step 1: hit Yahoo Finance homepage to get session cookies
  const homeRes = await req('https://finance.yahoo.com/', {
    ...BASE_HEADERS,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  });
  const cookies = parseCookies(homeRes.setCookies);

  // Step 2: fetch crumb using those cookies
  const crumbRes = await req('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    ...BASE_HEADERS,
    'Accept': 'application/json, text/plain, */*',
    'Cookie': cookies,
    'Referer': 'https://finance.yahoo.com/',
  });

  const crumb = crumbRes.body.trim();
  if (!crumb || crumb.startsWith('<') || crumb.length > 20) {
    throw new Error('Failed to get crumb — got: ' + crumb.slice(0, 80));
  }

  _crumb = crumb;
  _cookies = cookies;
  _crumbTs = Date.now();
  console.log('[yahoo] crumb acquired:', crumb.slice(0, 6) + '...');
  return { crumb, cookies };
}

async function quoteSummary(symbol, modules) {
  const { crumb, cookies } = await getCrumb();
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}&crumb=${encodeURIComponent(crumb)}&corsDomain=finance.yahoo.com`;
  const result = await req(url, {
    ...BASE_HEADERS,
    'Accept': 'application/json',
    'Cookie': cookies,
    'Referer': `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/`,
  });
  return JSON.parse(result.body);
}

module.exports = async function handler(reqObj, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { action, symbol } = reqObj.query;

  try {
    if (action === 'stock' && symbol) {
      const modules = 'price,summaryDetail,financialData,defaultKeyStatistics,incomeStatementHistory';
      let data;
      try {
        data = await quoteSummary(symbol, modules);
      } catch (e) {
        // Crumb may have expired — invalidate and retry once
        _crumb = null;
        console.log('[yahoo] retrying after crumb invalidation...');
        data = await quoteSummary(symbol, modules);
      }

      if (data?.quoteSummary?.error) {
        const msg = data.quoteSummary.error.description || JSON.stringify(data.quoteSummary.error);
        console.error('[yahoo] quoteSummary error for', symbol, msg);
        return res.status(404).json({ error: msg });
      }

      const result = data?.quoteSummary?.result?.[0];
      if (!result) return res.status(404).json({ error: 'No data returned for ' + symbol });

      res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=300');
      return res.status(200).json(result);
    }

    res.status(400).json({ error: 'action must be "stock"' });
  } catch (e) {
    console.error('[yahoo]', action, symbol, e.message);
    res.status(502).json({ error: e.message });
  }
};
