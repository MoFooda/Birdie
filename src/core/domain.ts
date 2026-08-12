/**
 * Domain / URL normalisation.
 *
 * Apollo exports are messy: bare domains, full URLs with tracking params, typos,
 * "N/A" placeholders, emails pasted into the website column. Everything downstream
 * (dedupe, status checks, competitor matching) keys off `normalized_domain`, so this
 * has to be strict and total — it never throws, it returns a reason instead.
 */

export interface NormalizedDomain {
  ok: boolean;
  /** Registrable host, lowercased, `www.` stripped. Null when the input is unusable. */
  domain: string | null;
  /** A fetchable https URL built from the normalised host. */
  url: string | null;
  reason: DomainRejectionReason | null;
}

export type DomainRejectionReason =
  | 'empty'
  | 'placeholder'
  | 'is_email'
  | 'is_social_profile'
  | 'invalid_characters'
  | 'no_tld'
  | 'invalid_tld'
  | 'ip_address'
  | 'localhost_or_private';

const PLACEHOLDERS = new Set([
  'n/a',
  'na',
  'none',
  '-',
  '--',
  'null',
  'undefined',
  'no website',
  'nowebsite',
  'not available',
  'tbd',
  '#',
]);

/**
 * Social profiles are a company presence but not a website we can audit — treating
 * them as the site would produce a bogus "live, healthy website" verdict.
 */
const SOCIAL_HOSTS = [
  'facebook.com',
  'fb.com',
  'instagram.com',
  'linkedin.com',
  'twitter.com',
  'x.com',
  'tiktok.com',
  'youtube.com',
  'wa.me',
  'api.whatsapp.com',
  'business.site',
  'sites.google.com',
  'linktr.ee',
];

const PRIVATE_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];

const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

function reject(reason: DomainRejectionReason): NormalizedDomain {
  return { ok: false, domain: null, url: null, reason };
}

export function normalizeDomain(input: string | null | undefined): NormalizedDomain {
  if (input == null) return reject('empty');

  let raw = String(input).trim();
  if (raw === '') return reject('empty');
  if (PLACEHOLDERS.has(raw.toLowerCase())) return reject('placeholder');

  // An email in the website column is a common Apollo export slip.
  if (raw.includes('@') && !raw.includes('/')) return reject('is_email');

  raw = raw.replace(/^\s*(https?|hxxps?):\/\//i, '');
  raw = raw.replace(/^\/\//, '');
  // Strip everything after the host: path, query, fragment, port, credentials.
  raw = raw.split(/[/?#]/)[0] ?? '';
  raw = raw.split('@').pop() ?? '';
  raw = raw.split(':')[0] ?? '';
  raw = raw.trim().replace(/\.+$/, '').toLowerCase();

  if (raw === '') return reject('empty');
  if (PRIVATE_HOSTS.includes(raw)) return reject('localhost_or_private');
  if (IPV4_RE.test(raw)) return reject('ip_address');

  // Unicode/IDN domains normalise to punycode so comparisons are byte-stable.
  if (!/^[\x00-\x7F]*$/.test(raw)) {
    try {
      raw = new URL(`https://${raw}`).hostname;
    } catch {
      return reject('invalid_characters');
    }
  }

  if (!HOST_RE.test(raw)) return reject('invalid_characters');

  const labels = raw.split('.');
  if (labels.length < 2) return reject('no_tld');

  const tld = labels[labels.length - 1] ?? '';
  // Digits in a TLD mean a typo ("example.1"), except in punycode labels, where the
  // encoding legitimately produces them (`.السعودية` → `xn--mgberp4a5d4ar`).
  const isPunycodeTld = tld.startsWith('xn--');
  if (tld.length < 2 || (!isPunycodeTld && /\d/.test(tld))) return reject('invalid_tld');

  const withoutWww = raw.startsWith('www.') ? raw.slice(4) : raw;
  if (withoutWww.split('.').length < 2) return reject('no_tld');

  if (SOCIAL_HOSTS.some((h) => withoutWww === h || withoutWww.endsWith(`.${h}`))) {
    return reject('is_social_profile');
  }

  return { ok: true, domain: withoutWww, url: `https://${withoutWww}`, reason: null };
}

/** True when two websites resolve to the same registrable host. */
export function sameDomain(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeDomain(a);
  const nb = normalizeDomain(b);
  return na.ok && nb.ok && na.domain === nb.domain;
}

const LEGAL_SUFFIXES = new Set([
  'llc', 'ltd', 'limited', 'inc', 'incorporated', 'co', 'company', 'corp', 'corporation',
  'gmbh', 'sarl', 'bv', 'nv', 'plc', 'sa', 'ag', 'group', 'holding', 'holdings',
  'est', 'establishment', 'trading', 'wll', 'sal', 'llp', 'lp', 'pte', 'pty',
]);

/**
 * Company-name key used for duplicate detection when domains are missing.
 *
 * Punctuation is collapsed to word boundaries *before* legal suffixes are stripped, so
 * "Acme Trading L.L.C." and "Acme" collapse to the same key. Arabic letters are kept.
 */
export function companyNameKey(name: string): string {
  const tokens = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    // Everything that is not a letter or digit becomes a separator.
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter((word) => word !== '');

  // Rejoin runs of single characters so a dotted initialism ("L.L.C.") becomes one
  // token and can be recognised as a legal suffix.
  const merged: string[] = [];
  for (const token of tokens) {
    const previous = merged[merged.length - 1];
    if (token.length === 1 && previous && previous.length <= 3 && /^\p{Letter}+$/u.test(previous)) {
      merged[merged.length - 1] = previous + token;
    } else {
      merged.push(token);
    }
  }

  return merged.filter((word) => !LEGAL_SUFFIXES.has(word)).join('');
}
