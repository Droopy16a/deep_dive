import { RGSClient, type AuthenticateResponse, type Balance, type PlayResponse } from 'stake-engine';
import type { Book } from './books';
import { clientLaunch, launchCurrency } from './platform';

export interface GameSession {
  demo: boolean;
  authenticate(): Promise<AuthenticateResponse>;
  play(amount: number, depth?: number): Promise<PlayResponse>;
  endRound(): Promise<{ balance: Balance }>;
}

// Integer rejection sampling avoids modulo bias. Production selection belongs to RGS.
export function pickWeightedBook(books: Book[], draw = () => crypto.getRandomValues(new Uint32Array(1))[0]): Book {
  const total = books.reduce((sum, book) => {
    if (!Number.isSafeInteger(book.selectionWeight) || book.selectionWeight <= 0) throw new Error('Invalid demo weight');
    return sum + book.selectionWeight;
  }, 0);
  if (!Number.isSafeInteger(total) || total <= 0 || total > 2 ** 32) throw new Error('Invalid demo weight total');
  const limit = Math.floor(2 ** 32 / total) * total;
  let sample: number;
  do { sample = draw(); } while (sample >= limit);
  let ticket = sample % total;
  for (const book of books) {
    if (ticket < book.selectionWeight) return book;
    ticket -= book.selectionWeight;
  }
  throw new Error('Demo selection failed');
}

export function modeForDepth(depth: number) {
  if (![100, 300, 600].includes(depth)) throw new Error('Choose 100m, 300m or 600m');
  return depth === 100 ? 'base' : `depth_${depth}`;
}

export async function createSession(url: string): Promise<GameSession> {
  const params = new URL(url).searchParams;
  if (params.has('sessionID') || params.has('rgs_url')) {
    if (!params.get('sessionID') || !params.get('rgs_url')) {
      throw new Error('The launch URL needs both sessionID and rgs_url.');
    }
    const client = RGSClient(clientLaunch(url));
    async function bounded<T>(request: Promise<T>): Promise<T> {
      let timer: ReturnType<typeof setTimeout>;
      try {
        return await Promise.race([request, new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Connection timed out')), 15000);
        })]);
      } finally { clearTimeout(timer!); }
    }
    return { demo: false, authenticate: () => bounded(client.Authenticate()),
      play: async (amount, depth = 100) => bounded(client.Play({ amount, mode: modeForDepth(depth) })), endRound: () => bounded(client.EndRound()) };
  }

  const response = await fetch(`${import.meta.env.BASE_URL}demo-books.json`);
  if (!response.ok) throw new Error('Demo books missing. Run the math generator.');
  const books: Book[] = await response.json();
  const catalogues = new Map<string, Book[]>([['base', books]]);
  let loading = false;
  let amount = 100 * 1_000_000;
  let pending: { bet: number; book: Book } | null = null;
  const social = params.get('social') === 'true' || ['XSC', 'XGC', 'XEC'].includes(params.get('currency') ?? '');
  const currency = launchCurrency(params);
  const balance = (): Balance => ({ amount, currency });
  async function playDemo(bet: number, depth = 100): Promise<PlayResponse> {
      const mode = modeForDepth(depth);
      if (!Number.isSafeInteger(bet) || ![1_000_000,2_000_000,5_000_000].includes(bet)) throw new Error('Invalid demo play amount');
      if (pending || loading || amount < bet) throw new Error('Round active or insufficient demo balance.');
      loading = true;
      try {
        if (!catalogues.has(mode)) {
          const response = await fetch(`${import.meta.env.BASE_URL}demo-books-${mode}.json`);
          if (!response.ok) throw new Error('Depth books missing. Upload the matching frontend and math.');
          catalogues.set(mode, await response.json());
        }
        const catalogue = catalogues.get(mode)!;
        const book = pickWeightedBook(catalogue);
        amount -= bet;
        pending = book.payoutMultiplier > 0 ? {bet,book} : null;
        return {balance: balance(), round: {betID: book.id, active:!!pending, mode,
          amount:bet, payout:bet * book.payoutMultiplier / 100,
          payoutMultiplier:book.payoutMultiplier / 100, state:book.events}};
      } finally { loading = false; }
    }
  return {
    demo: true,
    async authenticate() {
      return { balance: balance(), round: null,
        config: { minBet: 1_000_000, maxBet: 5_000_000, stepBet: 1_000_000,
          defaultBetLevel: 1_000_000, betLevels: [1_000_000, 2_000_000, 5_000_000] },
        jurisdictionFlags: { socialCasino: social, disabledFullscreen: true,
          disabledTurbo: false, disabledSuperTurbo: false, disabledAutoplay: false,
          disabledSlamstop: true, disabledSpacebar: false, disabledBuyFeature: true,
          displayNetPosition: false, displayRTP: false, displaySessionTimer: false,
          minimumRoundDuration: 0 },
      };
    },
    play: playDemo,
    async endRound() {
      if (!pending) throw new Error('No demo round is active.');
      amount += pending.bet * pending.book.payoutMultiplier / 100;
      pending = null;
      return { balance: balance() };
    },
  };
}
