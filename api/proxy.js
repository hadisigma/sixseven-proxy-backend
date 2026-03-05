/**
 * SixSeven Proxy — Backend Engine v3
 * Vercel Serverless Function — by Hadi Al 67
 */

const { URL } = require('url');

function getOrigin(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host  = req.headers['x-forwarded-host'] || req.headers['host'] || '';
  return `${proto}://${host}`;
}

function endpoint(req) {
  return `${getOrigin(req)}/api/proxy`;
}

function px(url, base, ep) {
  if (!url) return url;
  url = url.trim();
  if (!url || url.startsWith('data:') || url.startsWith('javascript:')
           || url.startsWith('mailto:') || url.startsWith('tel:')
           || url.startsWith('blob:') || url.startsWith('#')) return url;
  try {
    const abs = new URL(url, base).href;
    if (abs.startsWith(ep)) return url;
    return `${ep}?url=${encodeURIComponent(abs)}`;
  } catch { return url; }
}

function rewriteAttrs(html, base, ep) {
  html = html.replace(
    /(\s(?:href|src|action|data-src|data-href|data-url|data-lazy|data-original|poster|ping|formaction)\s*=\s*)(["'])([^"']*)\2/gi,
    (_, attr, q, url) => `${attr}${q}${px(url, base, ep)}${q}`
  );
  html = html.replace(/(\ssrcset\s*=\s*)(["'])([^"']+)\2/gi, (_, attr, q, srcset) => {
    const rw = srcset.split(',').map(part => {
      const t = part.trim(), si = t.search(/\s/);
      if (si === -1) return px(t, base, ep);
      return px(t.slice(0, si), base, ep) + t.slice(si);
    }).join(', ');
    return `${attr}${q}${rw}${q}`;
  });
  html = html.replace(/(content\s*=\s*["']\d+;\s*url\s*=\s*)([^"']+)(["'])/gi,
    (_, pre, url, q) => `${pre}${px(url, base, ep)}${q}`);
  return html;
}

function rewriteCss(css, base, ep) {
  return css
    .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (_, q, u) => `url(${q}${px(u, base, ep)}${q})`)
    .replace(/@import\s+(['"])([^'"]+)\1/gi, (_, q, u) => `@import ${q}${px(u, base, ep)}${q}`);
}

function buildInjection(base, ep) {
  return `<script id="__67i">
(function(){
  var EP=` + JSON.stringify(ep) + `;
  var BASE=` + JSON.stringify(base) + `;
  function toProxy(url){
    if(!url||typeof url!=='string')return url;
    var t=url.trim();
    if(!t||t.startsWith('data:')||t.startsWith('javascript:')||t.startsWith('blob:')||t.startsWith('#')||t.startsWith(EP))return url;
    try{var abs=new URL(t,BASE).href;if(abs.startsWith(EP))return url;return EP+'?url='+encodeURIComponent(abs);}catch(e){return url;}
  }
  // Patch fetch
  if(window.fetch){var _f=window.fetch;window.fetch=function(i,o){if(typeof i==='string')i=toProxy(i);return _f.call(this,i,o);};}
  // Patch XHR
  var _xo=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){arguments[1]=toProxy(u);return _xo.apply(this,arguments);};
  // Patch window.open
  var _wo=window.open;window.open=function(u,t,f){return _wo.call(this,toProxy(u),t,f);};
  // Intercept all link clicks
  document.addEventListener('click',function(e){
    var el=e.target;while(el&&el.tagName!=='A')el=el.parentElement;
    if(!el||!el.href)return;
    var href=el.getAttribute('href');
    if(!href||href.startsWith('#')||href.startsWith('javascript:'))return;
    e.preventDefault();e.stopPropagation();
    var p=toProxy(el.href);
    document.getElementById('__67_urlinput')&&(document.getElementById('__67_urlinput').value=el.href);
    window.location.href=p;
  },true);
  // Intercept form submits
  document.addEventListener('submit',function(e){
    var f=e.target,a=f.action||BASE,p=toProxy(a);if(p!==a)f.action=p;
  },true);
  // MutationObserver for dynamic content
  new MutationObserver(function(ms){
    ms.forEach(function(m){m.addedNodes.forEach(function(n){
      if(n.nodeType!==1)return;
      ['src','href','action','poster'].forEach(function(a){
        if(n.hasAttribute&&n.hasAttribute(a)){var v=n.getAttribute(a),r=toProxy(v);if(r!==v)n.setAttribute(a,r);}
      });
      if(n.querySelectorAll)n.querySelectorAll('[src],[href],[action]').forEach(function(el){
        ['src','href','action'].forEach(function(a){if(el.hasAttribute(a)){var v=el.getAttribute(a),r=toProxy(v);if(r!==v)el.setAttribute(a,r);}});
      });
    });});
  }).observe(document.documentElement,{childList:true,subtree:true});
})();
</script>`;
}

function buildToolbar(base, ep) {
  const epJson = JSON.stringify(ep);
  return `<style id="__67css">
#__67_toolbar{position:fixed!important;top:0!important;left:0!important;right:0!important;height:42px!important;z-index:2147483647!important;background:#080d1a!important;border-bottom:1px solid rgba(0,255,231,.25)!important;display:flex!important;align-items:center!important;gap:8px!important;padding:0 12px!important;font-family:monospace!important;box-shadow:0 2px 20px rgba(0,0,0,.9)!important}
#__67_toolbar *{box-sizing:border-box!important}
.__67l{color:#00ffe7!important;font-size:13px!important;font-weight:900!important;text-decoration:none!important;flex-shrink:0!important}
#__67_urlinput{flex:1!important;height:26px!important;background:rgba(0,0,0,.6)!important;border:1px solid rgba(0,255,231,.2)!important;border-radius:5px!important;padding:0 10px!important;color:#c8dff0!important;font-size:11px!important;outline:none!important;font-family:monospace!important}
#__67_urlinput:focus{border-color:#00ffe7!important}
.__67g{height:26px!important;padding:0 14px!important;border-radius:5px!important;border:none!important;background:linear-gradient(135deg,#00ffe7,#7b2fff)!important;color:#050810!important;font-weight:bold!important;font-size:11px!important;cursor:pointer!important}
.__67d{width:6px!important;height:6px!important;border-radius:50%!important;background:#00ff64!important;flex-shrink:0!important;animation:__67bl 2s ease-in-out infinite!important}
.__67t{color:rgba(200,223,240,.35)!important;font-size:9px!important;white-space:nowrap!important}
@keyframes __67bl{0%,100%{opacity:.3}50%{opacity:1}}
html,body{margin-top:42px!important}
</style>
<div id="__67_toolbar">
  <a class="__67l" href="${ep}" target="_top">67</a>
  <input id="__67_urlinput" type="text" value="${base.replace(/"/g,'&quot;')}">
  <button class="__67g" onclick="(function(){var v=document.getElementById('__67_urlinput').value.trim();if(!v)return;if(!/^https?:\\/\\//i.test(v))v='https://'+v;window.location.href=${epJson}+'?url='+encodeURIComponent(v);})()">GO</button>
  <div class="__67d"></div>
  <span class="__67t">PROXIED · SECURE</span>
</div>`;
}

function rewriteHtml(html, base, ep) {
  html = html.replace(/<meta[^>]+(?:x-frame-options|content-security-policy)[^>]*>/gi, '');
  html = html.replace(/<base[^>]*>/gi, '');
  html = html.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_, o, css, c) => `${o}${rewriteCss(css, base, ep)}${c}`);
  html = rewriteAttrs(html, base, ep);
  const inj = buildToolbar(base, ep) + buildInjection(base, ep);
  if (/<head(\s[^>]*)?>/i.test(html)) {
    html = html.replace(/(<head(\s[^>]*)?>)/i, `$1${inj}`);
  } else if (/<body(\s[^>]*)?>/i.test(html)) {
    html = html.replace(/(<body(\s[^>]*)?>)/i, `$1${inj}`);
  } else {
    html = inj + html;
  }
  return html;
}

module.exports = async function handler(req, res) {
  const ep = endpoint(req);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const targetUrl = req.query && req.query.url;

  if (!targetUrl) {
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>SixSeven Proxy</title></head>
<body style="background:#050810;color:#00ffe7;font-family:monospace;padding:64px;text-align:center">
<div style="font-size:64px;font-weight:900;margin-bottom:16px">67</div>
<h2 style="font-size:22px;letter-spacing:.08em">SixSeven Proxy Backend</h2>
<p style="color:rgba(200,223,240,0.45);margin:16px 0;font-size:13px">Usage: /api/proxy?url=https://example.com</p>
<p style="color:#00ff64;font-size:14px">✓ Online</p>
</body></html>`);
  }

  try { new URL(targetUrl); } catch { return res.status(400).send('Invalid URL'); }

  try {
    const fetchHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'identity',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Upgrade-Insecure-Requests': '1',
    };
    if (req.headers['cookie']) fetchHeaders['Cookie'] = req.headers['cookie'];

    const resp = await fetch(targetUrl, { method: 'GET', headers: fetchHeaders, redirect: 'follow' });
    const finalUrl = resp.url || targetUrl;
    const ct = resp.headers.get('content-type') || 'application/octet-stream';

    const STRIP = new Set(['x-frame-options','content-security-policy','content-security-policy-report-only',
      'strict-transport-security','permissions-policy','cross-origin-opener-policy',
      'cross-origin-embedder-policy','cross-origin-resource-policy','transfer-encoding','content-encoding']);
    resp.headers.forEach((v, k) => { if (!STRIP.has(k.toLowerCase())) { try { res.setHeader(k, v); } catch {} } });
    res.setHeader('Content-Type', ct);
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (ct.includes('text/html')) {
      let html = await resp.text();
      html = rewriteHtml(html, finalUrl, ep);
      return res.status(resp.status).send(html);
    }
    if (ct.includes('text/css')) {
      return res.status(resp.status).send(rewriteCss(await resp.text(), finalUrl, ep));
    }
    if (ct.includes('javascript') || ct.includes('text/plain') || ct.includes('application/json')) {
      return res.status(resp.status).send(await resp.text());
    }
    return res.status(resp.status).send(Buffer.from(await resp.arrayBuffer()));

  } catch (err) {
    console.error('Proxy error:', err.message);
    res.setHeader('Content-Type', 'text/html');
    return res.status(500).send(`<html><body style="background:#050810;color:#ff2f6e;font-family:monospace;padding:48px">
<h2>⚠ Proxy Error</h2><p style="margin:16px 0;color:rgba(200,223,240,0.5)">${err.message}</p>
<p><a href="javascript:history.back()" style="color:#00ffe7">← Go Back</a></p></body></html>`);
  }
};
