import https from 'node:https';
import http from 'node:http';

function proxy(targetUrl, q) {
  return new Promise((resolve) => {
    let t;
    try { t = new URL(targetUrl); } catch (e) { return resolve({ error: 'bad url', got: String(targetUrl) }); }
    if (!/^https?:$/.test(t.protocol)) return resolve({ error: 'proto' });
    const lib = t.protocol === 'http:' ? http : https;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
      Accept: '*/*',
      'Accept-Encoding': 'identity',
      Connection: 'close'
    };
    if (q && q.h) headers.Host = String(q.h);
    if (q && q.ua) headers['User-Agent'] = String(q.ua);
    if (q && q.extra) { try { Object.assign(headers, JSON.parse(q.extra)); } catch (e) {} }
    const opts = {
      hostname: t.hostname.replace(/^\[|\]$/g, ''),
      port: t.port || (t.protocol === 'http:' ? 80 : 443),
      path: t.pathname + t.search,
      method: String((q && q.m) || 'GET').toUpperCase(),
      headers,
      timeout: 12000
    };
    if (t.protocol === 'https:') opts.servername = (q && q.sn) ? String(q.sn) : t.hostname;
    const limit = Math.min(4096, parseInt((q && q.n) || '4096', 10) || 4096);
    const started = Date.now();
    const r = lib.request(opts, (resp) => {
      const chunks = []; let n = 0;
      resp.on('data', (c) => { n += c.length; if (n <= limit) chunks.push(c); });
      resp.on('end', () => resolve({ status: resp.statusCode, statusMessage: resp.statusMessage, headers: resp.headers, len: n, ms: Date.now() - started, body: Buffer.concat(chunks).toString('utf8') }));
      resp.on('error', (e) => resolve({ error: String(e && e.message || e), code: e && e.code }));
    });
    r.on('timeout', () => r.destroy(new Error('timeout')));
    r.on('error', (e) => resolve({ error: String(e && e.message || e), code: e && e.code, ms: Date.now() - started }));
    r.end();
  });
}

export default async function handler(req, res) {
  try {
    const q = req.query || {};
    if (!q.u) { res.statusCode = 400; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ err: 'need u' })); return; }
    const out = await proxy(q.u, q);
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-proxy-egress', 'vercel-node-hello');
    res.end(JSON.stringify(out));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ fatal: String(e) }));
  }
}
