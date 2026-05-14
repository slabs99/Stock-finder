export default async function handler(req, res) {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ 'Error Message': 'FMP_API_KEY environment variable is not set in Vercel.' });
  }

  const { path, ...params } = req.query;
  if (!path) {
    return res.status(400).json({ 'Error Message': 'Missing path parameter.' });
  }

  const qs = new URLSearchParams({ ...params, apikey: apiKey }).toString();
  const url = `https://financialmodelingprep.com/api/v3/${path}?${qs}`;

  try {
    const upstream = await fetch(url);
    const data = await upstream.json();
    res.setHeader('Cache-Control', 's-maxage=1200, stale-while-revalidate=600');
    res.status(upstream.status).json(data);
  } catch (e) {
    res.status(502).json({ 'Error Message': e.message });
  }
}
