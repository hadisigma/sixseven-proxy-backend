/**
 * SixSeven Proxy — Backend Engine
 * Vercel Serverless Function
 * by Hadi Al 67
 *
 * Fetches any URL server-side, strips X-Frame-Options / CSP,
 * rewrites all links to route through this proxy, and returns
 * the full page ready to render in an iframe.
 */

const { URL } = require('url');

// ── Detect our own public URL so we can rewrite links back through us ──
function getProxyBase(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

function getProxyEndpoint(req) {
  return `${getProxyBase(req)}/api/proxy`;
}

// ── Convert any URL to an absolute proxied URL ──
function proxyUrl(url, base, endpoint) {
  if (!url || !url.trim()) return url;
  try {
    const abs = new URL(url.trim(), base).href;
    if (
      abs.startsWith('data:') ||
      abs.startsWith('javascript:') ||
      abs.startsWith('mailto:') ||
      abs.startsWith('tel:') ||
      abs.startsWith('#')
    ) return url;
    return `${endpoint}?url=${encodeURIComponent(abs)}`;
  } catch {
    return url;
  }
}

// ── Rewrite all URLs inside HTML ──
function rewriteHtml(html, baseUrl, endpoint) {
  const px = (u) => proxyUrl(u, baseUrl, endpoint);

  // href / src / action / data-src / poster / srcset
  html = html.replace(
    /(\s(?:href|src|action|data-src|data-lazy-src|data-original|poster|data-bg)=["'])([^"'#][^"']*)(['"])/gi,
    (_, pre, url, post) => `${pre}${px(url)}${post}`
  );

  // srcset="url 1x, url 2x"
  html = html.replace(
    /(\ssrcset=["'])([^"']+)(["'])/gi,
    (_, pre, srcset, post) => {
      const rewritten = srcset.split(',').map(part => {
        const trimmed = part.trim();
        const spaceIdx = trimmed.search(/\s/);
        if (spaceIdx === -1) return px(trimmed);
        const u = trimmed.slice(0, spaceIdx);
        const descriptor = trimmed.slice(spaceIdx);
        return px(u) + descriptor;
      }).join(', ');
      return `${pre}${rewritten}${post}`;
    }
  );

  // CSS url() inside style attributes and <style> blocks
  html = html.replace(/url\(\s*["']?([^"')]+)["']?\s*\)/gi, (_, u) => `url(${px(u)})`);

  // <meta http-equiv="refresh" content="0; url=...">
  html = html.replace(
    /(content=["']\d+;\s*url=)([^"']+)(["'])/gi,
    (_, pre, url, post) => `${pre}${px(url)}${post}`
  );

  // Remove X-Frame-Options and CSP meta tags
  html = html.replace(/<meta[^>]+(?:x-frame-options|content-security-policy)[^>]*>/gi, '');

  // Remove <base> tag (we handle base ourselves)
  html = html.replace(/<base[^>]*>/gi, '');

  // Inject our intercept script + toolbar
  const toolbar = `
<style>
  #__67proxy-bar {
    position: fixed; top: 0; left: 0; right: 0; height: 44px;
    background: #080d1a; border-bottom: 1px solid rgba(0,255,231,0.2);
    display: flex; align-items: center; gap: 10px; padding: 0 14px;
    z-index: 2147483647; font-family: monospace; font-size: 12px;
    box-shadow: 0 2px 20px rgba(0,0,0,0.8);
  }
  #__67proxy-bar a { color: #00ffe7; text-decoration: none; font-weight: bold; letter-spacing:0.05em; }
  #__67proxy-bar a:hover { text-shadow: 0 0 8px #00ffe7; }
  #__67proxy-urlbar {
    flex: 1; height: 28px; background: rgba(0,0,0,0.5);
    border: 1px solid rgba(0,255,231,0.2); border-radius: 6px;
    padding: 0 10px; color: #c8dff0; font-family: monospace; font-size: 11px; outline: none;
  }
  #__67proxy-urlbar:focus { border-color: #00ffe7; }
  #__67proxy-gobtn {
    height: 28px; padding: 0 16px; border-radius: 6px; border: none;
    background: linear-gradient(135deg, #00ffe7, #7b2fff);
    color: #050810; font-family: monospace; font-weight: bold; font-size: 11px; cursor: pointer;
  }
  #__67proxy-dot { width: 7px; height: 7px; border-radius: 50%; background: #00ff64; flex-shrink:0; animation: __67blink 2s ease-in-out infinite; }
  @keyframes __67blink { 0%,100%{opacity:.4} 50%{opacity:1} }
  body { margin-top: 44px !important; }
</style>
<div id="__67proxy-bar">
  <a href="${getProxyBase({headers:{}})}">67</a>
  <input id="__67proxy-urlbar" type="text" value="${baseUrl}" onkeydown="if(event.key==='Enter'){window.top.location.href='${endpoint}?url='+encodeURIComponent(this.value)}" />
  <button id="__67proxy-gobtn" onclick="window.top.location.href='${endpoint}?url='+encodeURIComponent(document.getElementById('__67proxy-urlbar').value)">GO</button>
  <div id="__67proxy-dot"></div>
  <span style="color:rgba(200,223,240,0.4);font-size:10px">PROXIED</span>
</div>
<script>
(function(){
  // Intercept fetch() to route through proxy
  var _endpoint = ${JSON.stringify(endpoint)};
  var _base = ${JSON.stringify(baseUrl)};
  function pxUrl(url) {
    try {
      var abs = new URL(url, _base).href;
      if(abs.startsWith('data:')||abs.startsWith('javascript:')) return url;
      if(abs.startsWith(_endpoint)) return url;
      return _endpoint + '?url=' + encodeURIComponent(abs);
    } catch(e){ return url; }
  }
  // Patch fetch
  if(window.fetch){
    var _f = window.fetch;
    window.fetch = function(u, o){
      if(typeof u === 'string') u = pxUrl(u);
      return _f.call(this, u, o);
    };
  }
  // Patch XHR
  var _xopen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(m,u){
    if(typeof u === 'string') u = pxUrl(u);
    return _xopen.apply(this, arguments);
  };
})();
</script>`;

  if (html.includes('<head>')) {
    html = html.replace('<head>', '<head>' + toolbar);
  } else if (html.includes('<body')) {
    html = html.replace(/(<body[^>]*>)/, '$1' + toolbar);
  } else {
    html = toolbar + html;
  }

  return html;
}

// ── Rewrite CSS file URLs ──
function rewriteCss(css, baseUrl, endpoint) {
  return css.replace(/url\(\s*["']?([^"')]+)["']?\s*\)/gi, (_, u) => {
    return `url(${proxyUrl(u, baseUrl, endpoint)})`;
  });
}

// ── Main handler ──
module.exports = async function handler(req, res) {
  // CORS — allow the frontend GitHub Pages site to call this
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const endpoint = getProxyEndpoint(req);
  let targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).send(`
      <html><body style="background:#050810;color:#00ffe7;font-family:monospace;padding:48px;text-align:center">
        <h1 style="font-size:48px;margin-bottom:16px">67</h1>
        <h2>SixSeven Proxy Backend</h2>
        <p style="color:rgba(200,223,240,0.5);margin-top:12px">Usage: /api/proxy?url=https://example.com</p>
        <p style="color:#00ff64;margin-top:8px">✓ Online</p>
      </body></html>
    `);
  }

  // Validate URL
  let parsedTarget;
  try {
    parsedTarget = new URL(targetUrl);
  } catch {
    return res.status(400).send('Invalid URL');
  }

  try {
    const fetchHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'identity', // Don't gzip — we need to rewrite text
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Dest': 'document',
      'Upgrade-Insecure-Requests': '1',
    };

    // Forward cookies if any were passed along
    if (req.headers.cookie) fetchHeaders['Cookie'] = req.headers.cookie;

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: fetchHeaders,
      redirect: 'follow',
    });

    // Use the final URL after redirects as the base for rewriting
    const finalUrl = response.url || targetUrl;
    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    // ── Set response headers ──
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Forward useful headers but BLOCK the ones that would prevent embedding
    const BLOCKED_HEADERS = new Set([
      'x-frame-options',
      'content-security-policy',
      'content-security-policy-report-only',
      'x-content-type-options',
      'strict-transport-security',
      'permissions-policy',
      'cross-origin-opener-policy',
      'cross-origin-embedder-policy',
      'cross-origin-resource-policy',
      'transfer-encoding',
      'content-encoding',
    ]);

    // Forward set-cookie
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) res.setHeader('Set-Cookie', setCookie);

    const statusCode = response.status;

    // ── Handle by content type ──
    if (contentType.includes('text/html')) {
      let html = await response.text();
      html = rewriteHtml(html, finalUrl, endpoint);
      return res.status(statusCode).send(html);
    }

    if (contentType.includes('text/css')) {
      let css = await response.text();
      css = rewriteCss(css, finalUrl, endpoint);
      return res.status(statusCode).send(css);
    }

    if (contentType.includes('text/') || contentType.includes('application/json') || contentType.includes('application/javascript')) {
      const text = await response.text();
      return res.status(statusCode).send(text);
    }

    // Binary: images, fonts, videos, etc — pipe through directly
    const buffer = await response.arrayBuffer();
    return res.status(statusCode).send(Buffer.from(buffer));

  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).send(`
      <html><body style="background:#050810;color:#ff2f6e;font-family:monospace;padding:48px">
        <h2>⚠ Proxy Error</h2>
        <p style="margin-top:16px;color:rgba(200,223,240,0.6)">${err.message}</p>
        <p style="margin-top:24px">
          <a href="javascript:history.back()" style="color:#00ffe7">← Go Back</a>
        </p>
      </body></html>
    `);
  }
};
