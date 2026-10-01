// Diagnostic: walks Yahoo's handshake one step at a time with plain fetch
// (no yahoo-finance2) and reports the HTTP status of each step.
// Run once or twice only — looping adds to the throttling being measured.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function step(name: string, url: string, headers: Record<string, string> = {}) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: '*/*', ...headers },
      redirect: 'manual',
    });
    const text = await res.text();
    return {
      name,
      url,
      status: res.status,
      ms: Date.now() - started,
      setCookie: res.headers.get('set-cookie'),
      retryAfter: res.headers.get('retry-after'),
      body: text.slice(0, 300),
      text,
    };
  } catch (err) {
    return { name, url, status: 0, ms: Date.now() - started, error: String(err), text: '' };
  }
}

Deno.serve(async (req) => {
  let symbol = 'TEVA';
  try {
    const body = await req.json();
    if (body?.symbol) symbol = String(body.symbol).toUpperCase();
  } catch {
    // no input — use default
  }

  const results: Record<string, unknown>[] = [];
  const strip = ({ text, ...rest }: { text: string; [k: string]: unknown }) => rest;

  // Step 1: chart endpoint — no cookie or crumb needed
  const s1 = await step(
    '1_chart_no_crumb',
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=5d&interval=1d`,
  );
  let chartPrice: number | null = null;
  try {
    chartPrice = JSON.parse(s1.text)?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
  } catch { /* not JSON */ }
  results.push({ ...strip(s1), price: chartPrice });

  // Step 2: get a session cookie (fc.yahoo.com normally answers 404 but sets A3)
  const s2 = await step('2_cookie', 'https://fc.yahoo.com/');
  const cookie = (s2.setCookie ?? '')
    .split(/,(?=\s*[A-Za-z0-9_]+=)/)
    .map((c) => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
  results.push({ ...strip(s2), cookieObtained: cookie.length > 0 });

  // Step 3: exchange cookie for a crumb
  const s3 = await step(
    '3_crumb',
    'https://query1.finance.yahoo.com/v1/test/getcrumb',
    cookie ? { Cookie: cookie } : {},
  );
  const crumb = s3.status === 200 ? s3.text.trim() : '';
  results.push({ ...strip(s3), crumbObtained: crumb.length > 0 });

  // Step 4: quote with cookie + crumb (the path yahoo-finance2 uses)
  let quotePrice: number | null = null;
  if (crumb) {
    const s4 = await step(
      '4_quote_with_crumb',
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}&crumb=${encodeURIComponent(crumb)}`,
      { Cookie: cookie },
    );
    try {
      quotePrice = JSON.parse(s4.text)?.quoteResponse?.result?.[0]?.regularMarketPrice ?? null;
    } catch { /* not JSON */ }
    results.push({ ...strip(s4), price: quotePrice });
  } else {
    results.push({ name: '4_quote_with_crumb', skipped: 'no crumb from step 3' });
  }

  const st = (i: number) => (results[i] as { status?: number }).status;
  let verdict: string;
  if (st(0) === 429) {
    verdict = 'Step 1 throttled: Yahoo is blocking this IP outright — move to a keyed provider.';
  } else if (st(0) === 200 && st(2) === 429) {
    verdict = 'Chart works but crumb is refused (429): a chart-only light mode is viable (price/history, no fundamentals).';
  } else if (st(0) === 200 && crumb && quotePrice !== null) {
    verdict = 'All steps OK with prices: Yahoo works now — the problem is how the app calls it (e.g. request bursts).';
  } else {
    verdict = 'Mixed result — inspect per-step statuses and bodies.';
  }

  return Response.json({ symbol, verdict, results, ranAt: new Date().toISOString() });
});
