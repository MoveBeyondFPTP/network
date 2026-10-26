// Turns the raw text read from a business card into contact fields.
// Pure function, no browser APIs, so it can be tested on its own.

const TITLE_WORDS = [
  'ceo', 'cfo', 'coo', 'cto', 'cmo', 'cio', 'cpo', 'founder', 'co-founder', 'cofounder', 'president',
  'director', 'manager', 'partner', 'principal', 'owner', 'officer', 'vp', 'svp', 'evp', 'vice',
  'head', 'lead', 'engineer', 'designer', 'consultant', 'advisor', 'adviser', 'associate', 'analyst',
  'specialist', 'coordinator', 'agent', 'broker', 'realtor', 'attorney', 'counsel', 'lawyer',
  'architect', 'developer', 'producer', 'editor', 'chair', 'chairman', 'chairwoman', 'executive',
  'strategist', 'representative', 'rep', 'sales', 'marketing', 'account', 'recruiter', 'curator',
  'photographer', 'writer', 'artist', 'chef', 'doctor', 'dr', 'md', 'professor', 'investor',
  'treasurer', 'secretary', 'administrator', 'supervisor', 'superintendent', 'planner', 'buyer'
];

const COMPANY_WORDS = [
  'inc', 'inc.', 'llc', 'l.l.c.', 'ltd', 'ltd.', 'co.', 'corp', 'corp.', 'corporation', 'company',
  'group', 'partners', 'capital', 'studio', 'studios', 'agency', 'holdings', 'ventures', 'labs',
  'consulting', 'realty', 'bank', 'associates', 'llp', 'pllc', 'gmbh', 'plc', 'foundation',
  'industries', 'solutions', 'systems', 'technologies', 'media', 'design', 'collective', 'firm',
  'properties', 'investments', 'advisors', 'enterprises', 'international', 'global'
];

const FREE_MAIL = ['gmail', 'yahoo', 'hotmail', 'outlook', 'icloud', 'aol', 'live', 'me', 'msn', 'proton', 'protonmail'];

const ADDRESS_WORDS = /\b(st|street|ave|avenue|rd|road|blvd|boulevard|suite|ste|dr|drive|lane|ln|way|floor|fl|plaza|pkwy|parkway|court|ct|place|pl|hwy|highway|po box|p\.o\.)\b\.?/i;

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/i;
const WEB_RE = /\b((?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|co|ai|us|biz|info|me|app|dev|design|studio|agency|xyz|tech|art|edu|gov|ca|uk|au|de|fr)(?:\/[^\s]*)?)\b/i;
const PHONE_RE = /(\+?\(?\d[\d\s().\-]{7,}\d)/;

const words = (s) => s.toLowerCase().split(/[\s,]+/).filter(Boolean);
const hasWord = (line, list) => words(line).some((w) => list.includes(w.replace(/[^a-z.\-]/g, '')));

function titleCase(s) {
  return s.toLowerCase().replace(/(^|[\s'\-])([a-z])/g, (m, p, c) => p + c.toUpperCase());
}

function cleanLine(l) {
  return l
    .replace(/[|•·■►▪]+/g, ' ')
    .replace(/\s*@\s*/g, '@')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeName(line) {
  if (/\d/.test(line) || line.includes('@')) return false;
  if (hasWord(line, TITLE_WORDS) || hasWord(line, COMPANY_WORDS)) return false;
  const parts = line.split(' ').filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return false;
  return parts.every((p) => /^[A-Z][A-Za-z'’.\-]*$/.test(p) || /^[A-Z]\.?$/.test(p));
}

export function parseCard(rawText) {
  const out = { first_name: '', last_name: '', title: '', company: '', email: '', phone: '', website: '', address: '' };
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map(cleanLine)
    .filter((l) => l.length > 1 && /[A-Za-z0-9]/.test(l));
  const used = new Set();

  // Email
  lines.forEach((l, i) => {
    const m = l.match(EMAIL_RE);
    if (m && !out.email) {
      out.email = m[0].toLowerCase().replace(/[.,;]+$/, '');
      if (l.replace(m[0], '').replace(/^(e|email|e-mail)[:.]?\s*/i, '').trim().length < 3) used.add(i);
    }
  });

  // Phones — prefer mobile/direct, skip fax
  const phones = [];
  lines.forEach((l0, i) => {
    const l = l0.replace(EMAIL_RE, ' ').replace(WEB_RE, ' ').trim();
    const m = l.match(PHONE_RE);
    if (!m) return;
    const digits = m[1].replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) return;
    const label = l.slice(0, m.index).toLowerCase();
    if (/\bf(ax)?\b/.test(label)) { used.add(i); return; }
    let score = 0;
    if (/\b(m|mob|mobile|c|cell)\b/.test(label)) score = 3;
    else if (/\b(d|direct|t|tel|p|ph|phone|o|office)\b/.test(label)) score = 2;
    phones.push({ value: m[1].trim().replace(/\s+/g, ' '), score, i });
    if (l.replace(m[0], '').replace(/[a-z.:]/gi, '').trim().length < 2) used.add(i);
  });
  phones.sort((a, b) => b.score - a.score || a.i - b.i);
  if (phones[0]) out.phone = phones[0].value;

  // Website
  lines.forEach((l, i) => {
    if (out.website) return;
    const withoutEmail = out.email ? l.replace(new RegExp(out.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ') : l;
    if (withoutEmail.includes('@')) return;
    const m = withoutEmail.match(WEB_RE);
    if (m && !/^\d/.test(m[1])) {
      out.website = m[1].replace(/[.,;]+$/, '').toLowerCase();
      if (withoutEmail.replace(m[0], '').replace(/^(w|web|website)[:.]?\s*/i, '').trim().length < 3) used.add(i);
    }
  });

  // Address — a line with a street word or a ZIP, plus the next line if it looks like city/state
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    const l = lines[i];
    if ((/\d/.test(l) && ADDRESS_WORDS.test(l)) || /\b[A-Z]{2}\s+\d{5}(-\d{4})?\b/.test(l)) {
      const parts = [l];
      used.add(i);
      const next = lines[i + 1];
      if (next && !used.has(i + 1) && /\b[A-Z]{2}\s+\d{5}(-\d{4})?\b|,\s*[A-Z]{2}\b/.test(next) && !next.includes('@')) {
        parts.push(next);
        used.add(i + 1);
      }
      out.address = parts.join(', ');
      break;
    }
  }

  // Name — score candidates
  const local = out.email ? out.email.split('@')[0].replace(/[^a-z]/g, '') : '';
  let best = null;
  lines.forEach((l, i) => {
    if (used.has(i) || !looksLikeName(l)) return;
    let score = 10 - Math.min(i, 8);
    const ws = l.toLowerCase().split(' ').map((w) => w.replace(/[^a-z]/g, ''));
    if (local && ws.some((w) => w.length > 1 && local.includes(w))) score += 6;
    if (l === l.toUpperCase()) score -= 1;
    if (!best || score > best.score) best = { i, l, score };
  });
  if (best) {
    used.add(best.i);
    const name = best.l === best.l.toUpperCase() ? titleCase(best.l) : best.l;
    const parts = name.split(' ');
    out.last_name = parts.pop();
    out.first_name = parts.join(' ');
  }

  // Title
  lines.forEach((l, i) => {
    if (out.title || used.has(i) || /\d{3}/.test(l) || l.includes('@')) return;
    if (hasWord(l, TITLE_WORDS) && !hasWord(l, COMPANY_WORDS.filter((w) => w !== 'design'))) {
      out.title = l;
      used.add(i);
    }
  });
  if (!out.title && best && lines[best.i + 1] && !used.has(best.i + 1)) {
    const l = lines[best.i + 1];
    if (!/\d/.test(l) && !l.includes('@') && !hasWord(l, COMPANY_WORDS) && l.split(' ').length <= 6) {
      out.title = l;
      used.add(best.i + 1);
    }
  }

  // Company
  lines.forEach((l, i) => {
    if (out.company || used.has(i) || l.includes('@')) return;
    if (hasWord(l, COMPANY_WORDS) && !/\d{3}/.test(l)) {
      out.company = l === l.toUpperCase() && l.length > 4 ? titleCase(l) : l;
      used.add(i);
    }
  });
  if (!out.company) {
    const domain = (out.email.split('@')[1] || out.website.replace(/^https?:\/\//, '').replace(/^www\./, '')).split('/')[0];
    const stem = domain.split('.')[0];
    if (stem && !FREE_MAIL.includes(stem)) {
      // Prefer an unused line that matches the domain stem
      const idx = lines.findIndex((l, i) => !used.has(i) && l.toLowerCase().replace(/[^a-z]/g, '').includes(stem.replace(/[^a-z]/g, '')));
      if (idx >= 0 && !/\d{3}/.test(lines[idx])) { out.company = lines[idx]; used.add(idx); }
      else out.company = titleCase(stem.replace(/-/g, ' '));
    }
  }

  return out;
}
