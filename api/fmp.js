const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    console.error('[fmp] FMP_API_KEY is not set');
    return res.status(500).json({ 'Error Message': 'FMP_API_KEY environment variable is not set.' });
  }

  const { path, ...params } = req.query;
  if (!path) {
    return res.status(400).json({ 'Error Message': 'Missing path parameter.' });
  }

  const qs = new URLSearchParams({ ...params, apikey: apiKey }).toString();
  const url = `https://financialmodelingprep.com/api/v3/${path}?${qs}`;
  console.log('[fmp] fetching:', `https://financialmodelingprep.com/api/v3/${path}?${new URLSearchParams(params).toString()}`);

  try {
    const data = await new Promise((resolve, reject) => {
      https.get(url, (upstream) => {
        let body = '';
        upstream.on('data', chunk => { body += chunk; });
        upstream.on('end', () => {
          try { resolve({ status: upstream.statusCode, json: JSON.parse(body) }); }
          catch (e) { reject(new Error('Invalid JSON: ' + body.slice(0, 300))); }
        });
      }).on('error', reject);
    });

    console.log('[fmp] response status:', data.status);
    res.setHeader('Cache-Control', 's-maxage=1200, stale-while-revalidate=600');
    res.status(data.status).json(data.json);
  } catch (e) {
    console.error('[fmp] error:', e.message);
    res.status(502).json({ 'Error Message': e.message });
  }
};
