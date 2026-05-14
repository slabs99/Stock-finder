module.exports = function handler(req, res) {
  res.status(200).json({
    ok: true,
    keySet: !!process.env.FMP_API_KEY,
    keyPrefix: process.env.FMP_API_KEY ? process.env.FMP_API_KEY.slice(0, 4) + '...' : null
  });
};
