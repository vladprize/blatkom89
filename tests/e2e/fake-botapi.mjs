// A stand-in for Telegram's Bot API during the end-to-end run (v0.2.18 part 3): the game server is pointed
// at it with TELEGRAM_API_BASE (local addresses only). It answers createInvoiceLink with a t.me invoice link
// and refundStarPayment with success, and tells the test the last invoice it made (GET /last-invoice).
// Usage: node tests/e2e/fake-botapi.mjs <port>
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 8111);
let last = null;
const calls = [];
createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    if (req.method === 'GET' && req.url === '/last-invoice') return res.end(JSON.stringify(last));
    if (req.method === 'GET' && req.url === '/calls') return res.end(JSON.stringify(calls));
    const m = /^\/bot[^/]+\/([A-Za-z]+)$/.exec(req.url ?? '');
    let params = {};
    try {
      params = raw ? JSON.parse(raw) : {};
    } catch {
      /* not JSON */
    }
    const method = m?.[1] ?? '';
    calls.push({ method, params });
    if (method === 'createInvoiceLink') {
      last = { payload: params.payload, amount: params.prices?.[0]?.amount, currency: params.currency, title: params.title, providerToken: params.provider_token };
      return res.end(JSON.stringify({ ok: true, result: `https://t.me/$e2e-invoice-${String(params.payload).slice(0, 8)}` }));
    }
    if (method === 'refundStarPayment') return res.end(JSON.stringify({ ok: true, result: true }));
    res.statusCode = 404;
    res.end(JSON.stringify({ ok: false, description: `Not Found: method ${method}` }));
  });
}).listen(port, '127.0.0.1', () => console.log(`[fake-botapi] on ${port}`));
