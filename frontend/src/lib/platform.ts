import type { Currency, Round } from 'stake-engine';

export const GAME_TITLE = 'Abyss Rush';
export const MICRO = 1_000_000;
const currencies = new Set('USD EUR CAD MXN JPY RUB CNY PHP INR IDR KRW BRL DKK PLN VND TRY CLP ARS PEN NGN SAR ILS AED TWD NOK KWD JOD CRC TND SGD MYR OMR QAR BHD XSC XGC XEC'.split(' '));

export function currencyCode(value: string | null): Currency {
  return (value && currencies.has(value.toUpperCase()) ? value.toUpperCase() : 'USD') as Currency;
}

export function launchCurrency(params: URLSearchParams): Currency {
  const code = currencyCode(params.get('currency'));
  return params.get('social') === 'true' && !['XSC', 'XGC', 'XEC'].includes(code) ? 'XSC' : code;
}

// Keep every significant micro-unit, including fractional JPY and sub-cent wins.
export function formatAmount(amount: number, currency: string): string {
  if (!Number.isSafeInteger(amount)) throw new Error('Invalid server amount. Reconnect to continue.');
  const code = currencyCode(currency);
  const social = ['XSC', 'XGC', 'XEC'].includes(code);
  const ordinaryDecimals = social ? 2 : new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits ?? 2;
  const fraction = Math.abs(amount % MICRO).toString().padStart(6, '0').replace(/0+$/, '');
  const decimals = Math.max(ordinaryDecimals, fraction.length);
  const number = new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(amount / MICRO);
  if (social) return `${number} ${code === 'XGC' ? 'GC' : 'SC'}`;
  const symbols: Record<string, string> = { USD: '$', EUR: '€', CAD: 'CA$', MXN: 'MX$', JPY: '¥' };
  if (symbols[code]) return `${amount < 0 ? '-' : ''}${symbols[code]}${number.replace(/^-/, '')}`;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: code, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(amount / MICRO);
}

export function rgsBase(value: string | null): URL {
  if (!value) throw new Error('The connection address is missing. Reconnect to continue.');
  let base: URL;
  try { base = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`); }
  catch { throw new Error('The connection address is invalid. Reconnect to continue.'); }
  if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new Error('The connection address is invalid. Reconnect to continue.');
  }
  base.pathname = base.pathname.replace(/\/+$/, '');
  return base;
}

export function clientLaunch(url: string): { url: string; protocol: 'http' | 'https' } {
  const launch = new URL(url), base = rgsBase(launch.searchParams.get('rgs_url'));
  launch.searchParams.set('rgs_url', `${base.host}${base.pathname === '/' ? '' : base.pathname}`);
  // Only English is shipped. The older SDK accepts desktop/mobile, so tablet uses
  // its desktop hint; our layout responds to the actual viewport in all cases.
  launch.searchParams.set('lang', 'en');
  if (launch.searchParams.get('device') === 'tablet') launch.searchParams.set('device', 'desktop');
  return { url: launch.href, protocol: base.protocol === 'http:' ? 'http' : 'https' };
}

export function sessionError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : '';
  // Never display arbitrary server messages (including non-social terminology).
  if (/ERR_IPB|insufficient/i.test(message)) return 'Your balance is too low for this play amount.';
  if (/ERR_GLE/i.test(message)) return 'Your play limit has been reached.';
  if (/ERR_ACT/i.test(message)) return 'The server is busy. Please reconnect shortly.';
  return 'Unable to connect or complete this round. Reconnect to recover any unfinished round.';
}

export type ReplayData = { round: Round; amount: number; currency: Currency; costMultiplier: number; modeLabel: string };
export async function loadReplay(url: string): Promise<ReplayData> {
  const params = new URL(url).searchParams, base = rgsBase(params.get('rgs_url'));
  const parts = ['game', 'version', 'mode', 'event'].map(key => params.get(key));
  if (parts.some(value => !value || !/^[\w.-]+$/.test(value))) throw new Error('This replay link is incomplete or invalid.');
  const modeLabels: Record<string, string> = { base: 'Easy', depth_300: 'Medium', depth_600: 'Hard' };
  const mode = parts[2]!;
  if (!modeLabels[mode]) throw new Error('This replay mode is unavailable.');
  const response = await fetch(`${base.href.replace(/\/$/, '')}/bet/replay/${parts.map(part => encodeURIComponent(part!)).join('/')}`, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Unable to load this replay. Please try again.');
  const data = await response.json();
  const parsedAmount = Number(params.get('amount') ?? MICRO);
  const amount = Number.isSafeInteger(parsedAmount) && parsedAmount > 0 ? parsedAmount : MICRO;
  if (!Number.isFinite(data.payoutMultiplier) || data.payoutMultiplier < 0 || !Number.isFinite(data.costMultiplier) || data.costMultiplier <= 0 || !Array.isArray(data.state)) {
    throw new Error('This replay contains invalid round data.');
  }
  if (!Number.isSafeInteger(Math.round(amount * data.payoutMultiplier)) || !Number.isSafeInteger(amount * data.costMultiplier)) throw new Error('This replay amount is too large.');
  return { amount, currency: launchCurrency(params), costMultiplier: data.costMultiplier, modeLabel: modeLabels[mode],
    round: { betID: 0, amount, active: false, mode, payoutMultiplier: data.payoutMultiplier, payout: Math.round(amount * data.payoutMultiplier), state: data.state } };
}

export function initialBet(config: { defaultBetLevel: number; betLevels: number[] }, round?: Round | null): number {
  const amount = round?.active ? round.amount : config.defaultBetLevel;
  if (!Number.isSafeInteger(amount) || amount! <= 0 || !config.betLevels.includes(amount!)) throw new Error('The server supplied an unavailable play amount.');
  return amount!;
}
