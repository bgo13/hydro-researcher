import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const SERPER_API_KEY = Deno.env.get('SERPER_API_KEY');
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID');

const WATCHLIST_QUERIES = [
  // Offtake / Bankability signals
  'hydrogen "sales and purchase agreement" OR "SPA" signed 2026',
  'hydrogen "take-or-pay" contract signed 2026',
  'hydrogen offtake agreement 15 year signed 2026',
  // EU signals — always on
  'EU hydrogen mechanism offtake collection results winners 2026',
  'EU hydrogen offtake matchmaking signed project 2026',
  'Germany H2 core network pipeline electrolyzer connected 2026',
  // Sector breakout — Data Centers (sharpened: contract/deal specific only)
  'Bloom Energy data center "supply agreement" OR "contract signed" OR "offtake" 2026',
  'Bloom Energy hyperscaler "fuel cell" deal signed Microsoft Google Amazon 2026',
  'hydrogen fuel cell data center "behind-the-meter" contract signed 2026',
  // Ports
  'hydrogen fuel cell port decarbonization Rotterdam "Long Beach" mandate 2026',
  // India Green Ammonia — SECI pipeline
  'ACME Solar green ammonia SECI offtake 2026',
  'NTPC Green Energy green ammonia offtake commissioned 2026',
  'India SECI green ammonia GAPA signed 2026',
  // China
  'China green hydrogen "five year plan" demonstration project subsidy 2026',
  // Red flags
  'hydrogen project "supply agreement withdrawn" OR "failed to sign" 2026',
  'hydrogen project "RFNBO" failed OR stalled OR delayed 2026',
  // Key companies
  'Plug Power SPA contract offtake 2026',
  'RWE Lingen hydrogen pipeline connected 2026',
  'Nel Hydrogen SPA contract 2026',
  'ITM Power contract signed 2026',
];

const EU_OFFTAKE_QUERIES = [
  'EU hydrogen mechanism offtake collection March 20 2026 results',
  'European Commission hydrogen matchmaking winners signed 2026',
  'EU hydrogen offtake collection deadline results companies selected 2026',
  'hydrogen mechanism 260 projects offtake buyer matched 2026',
  'European hydrogen bank offtake mechanism winner announcement 2026',
];

const SIGNAL_RULES = [
  {
    type: '🟢 BANKABILITY',
    category: 'Bankability',
    keywords: [
      'sales and purchase agreement',
      'SPA signed',
      'take-or-pay',
      '10-year',
      '15-year',
      '10 year',
      '15 year',
      'binding contract',
      'offtake agreement signed',
      'commissioned',
      'matched',
      'awarded',
      'selected',
      'fuel cell supply agreement',
      'fuel cell contract signed',
      'fuel cell offtake',
      'behind-the-meter contract',
      'behind-the-meter agreement',
      'behind-the-meter deal',
      'GAPA signed',
      'green ammonia purchase agreement',
    ]
  },
  {
    type: '🔵 REGIONAL TRIGGER',
    category: 'Regional Trigger',
    keywords: [
      'H2 core network',
      'offtake mechanism',
      'five year plan',
      'demonstration project',
      'port mandate',
      'Rotterdam',
      'Long Beach',
      'Lingen',
      'ACME',
      'NTPC Green',
      'hydrogen mechanism',
      'matchmaking',
      'SIGHT scheme',
      'SECI',
    ]
  },
  {
    type: '🔴 RED FLAG',
    category: 'Red Flag',
    keywords: [
      'withdrawn',
      'failed to sign',
      'RFNBO failed',
      'stalled',
      'RED III criteria',
      'project cancelled',
      'collapsed',
      'dead',
      'delay',
      'withdrawal',
    ]
  },
];

function classifySignal(title: string, snippet: string): { type: string; category: string } {
  const text = (title + ' ' + snippet).toLowerCase();
  for (const rule of SIGNAL_RULES) {
    if (rule.keywords.some(kw => text.includes(kw.toLowerCase()))) {
      return { type: rule.type, category: rule.category };
    }
  }
  return { type: '⚪ MONITOR', category: 'Monitor' };
}

async function searchNews(query: string, daysBack = 1): Promise<any[]> {
  const tbs = daysBack === 1 ? 'qdr:d' : daysBack === 7 ? 'qdr:w' : 'qdr:m';
  const res = await fetch('https://google.serper.dev/news', {
    method: 'POST',
    headers: {
      'X-API-KEY': SERPER_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ q: query, num: 5, tbs }),
  });
  const data = await res.json();
  return data.news || [];
}

async function sendTelegram(chatId: string, message: string) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  return await res.json();
}

async function sendLongMessage(chatId: string, text: string) {
  if (text.length <= 4000) {
    return await sendTelegram(chatId, text);
  }
  const parts: string[] = [];
  let current = '';
  for (const line of text.split('\n')) {
    if ((current + '\n' + line).length > 4000) {
      parts.push(current);
      current = line;
    } else {
      current += (current ? '\n' : '') + line;
    }
  }
  if (current) parts.push(current);
  let result;
  for (const part of parts) {
    result = await sendTelegram(chatId, part);
    await new Promise(r => setTimeout(r, 500));
  }
  return result;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const chatId = body.chat_id || TELEGRAM_CHAT_ID;
    const scanType = body.scan_type || 'daily';

    if (!chatId) {
      return Response.json({ error: 'No chat_id provided' }, { status: 400 });
    }

    const results: { signal: string; category: string; title: string; source: string; url: string; snippet: string }[] = [];
    const seen = new Set<string>();

    const queriesToRun = [...WATCHLIST_QUERIES];

    const isEuScan = scanType === 'eu_offtake_results';
    if (isEuScan) {
      for (const q of EU_OFFTAKE_QUERIES) {
        const articles = await searchNews(q, 3);
        for (const a of articles) {
          if (a.link && !seen.has(a.link)) {
            seen.add(a.link);
            const classified = classifySignal(a.title, a.snippet || '');
            results.push({
              signal: classified.type,
              category: classified.category,
              title: a.title,
              source: a.source || '',
              url: a.link,
              snippet: a.snippet || '',
            });
          }
        }
      }
    }

    for (const query of queriesToRun) {
      const articles = await searchNews(query, 1);
      for (const a of articles) {
        if (a.link && !seen.has(a.link)) {
          seen.add(a.link);
          const classified = classifySignal(a.title, a.snippet || '');
          results.push({
            signal: classified.type,
            category: classified.category,
            title: a.title,
            source: a.source || '',
            url: a.link,
            snippet: a.snippet || '',
          });
        }
      }
    }

    const order: Record<string, number> = { '🔴 RED FLAG': 0, '🟢 BANKABILITY': 1, '🔵 REGIONAL TRIGGER': 2, '⚪ MONITOR': 3 };
    results.sort((a, b) => (order[a.signal] ?? 4) - (order[b.signal] ?? 4));

    const today = new Date().toISOString().split('T')[0];
    const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    const bankability = results.filter(r => r.signal === '🟢 BANKABILITY');
    const regional = results.filter(r => r.signal === '🔵 REGIONAL TRIGGER');
    const redFlags = results.filter(r => r.signal === '🔴 RED FLAG');
    const monitor = results.filter(r => r.signal === '⚪ MONITOR');

    // Save non-monitor signals to database
    const signalsToSave = [...bankability, ...redFlags, ...regional];
    for (const item of signalsToSave) {
      try {
        await base44.asServiceRole.entities.HydrogenSignal.create({
          scan_date: today,
          category: item.category,
          title: item.title,
          summary: item.snippet.slice(0, 300),
          source_url: item.url,
          companies: item.source || '',
          region: '',
          contract_type: '',
        });
      } catch (_e) {
        // non-blocking — don't fail the scan if DB save fails
      }
    }

    const header = isEuScan
      ? `🇪🇺 <b>EU OFFTAKE COLLECTION — SPECIAL RESULTS SCAN</b>\n📅 ${date}\n\n`
      : `💧 <b>HYDROGEN DAILY INTELLIGENCE REPORT</b>\n📅 ${date}\n\n`;

    let report = header;
    report += `<b>Summary:</b> ${bankability.length} Bankability | ${redFlags.length} Red Flags | ${regional.length} Regional | ${monitor.length} Monitor\n`;
    report += `─────────────────────────\n\n`;

    const sections = [
      { label: '🟢 BANKABILITY SIGNALS', items: bankability },
      { label: '🔴 RED FLAGS', items: redFlags },
      { label: '🔵 REGIONAL TRIGGERS', items: regional },
      { label: '⚪ MONITOR', items: monitor.slice(0, 6) },
    ];

    for (const section of sections) {
      if (section.items.length === 0) continue;
      report += `<b>${section.label}</b>\n`;
      for (const item of section.items) {
        report += `• <a href="${item.url}">${item.title}</a>\n`;
        if (item.source) report += `  <i>${item.source}</i>\n`;
        if (item.snippet) report += `  ${item.snippet.slice(0, 150)}...\n`;
        report += '\n';
      }
    }

    if (results.length === 0) {
      report += isEuScan
        ? '⚠️ No EU Offtake Collection results published yet. Check Hydrogen Insight and EC energy portal directly.\n'
        : 'No significant hydrogen signals detected in the last 24 hours.\n';
    }

    report += `─────────────────────────\n<i>Powered by Hydro Researcher · Base44</i>`;

    const telegramResult = await sendLongMessage(chatId, report);

    return Response.json({
      ok: true,
      articles_found: results.length,
      scan_type: scanType,
      signals_saved: signalsToSave.length,
      telegram: telegramResult,
      signals: { bankability: bankability.length, red_flags: redFlags.length, regional: regional.length, monitor: monitor.length }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
