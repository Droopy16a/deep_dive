import { RGSClient, type AuthenticateResponse, type Balance, type PlayResponse } from 'stake-engine';
import type { Book } from './books';

export interface GameSession {
  demo: boolean;
  authenticate(): Promise<AuthenticateResponse>;
  play(amount: number): Promise<PlayResponse>;
  endRound(): Promise<{ balance: Balance }>;
}

export async function createSession(url: string): Promise<GameSession> {
  const params = new URL(url).searchParams;
  if (params.has('sessionID') || params.has('rgs_url')) {
    if (!params.get('sessionID') || !params.get('rgs_url')) {
      throw new Error('The launch URL needs both sessionID and rgs_url.');
    }
    const client = RGSClient({ url });
    return { demo: false, authenticate: () => client.Authenticate(),
      play: (amount) => client.Play({ amount, mode: 'base' }), endRound: () => client.EndRound() };
  }

  const response = await fetch(`${import.meta.env.BASE_URL}demo-books.json`);
  if (!response.ok) throw new Error('Demo books missing. Run the math generator.');
  const books: Book[] = await response.json();
  let amount = 100 * 1_000_000;
  let pending: { bet: number; book: Book } | null = null;
  const balance = (): Balance => ({ amount, currency: 'USD' });
  return {
    demo: true,
    async authenticate() {
      return { balance: balance(), round: null,
        config: { minBet: 1_000_000, maxBet: 5_000_000, stepBet: 1_000_000,
          defaultBetLevel: 1_000_000, betLevels: [1_000_000, 2_000_000, 5_000_000] },
        jurisdictionFlags: { socialCasino: false, disabledFullscreen: true,
          disabledTurbo: false, disabledSuperTurbo: false, disabledAutoplay: false,
          disabledSlamstop: true, disabledSpacebar: true, disabledBuyFeature: true,
          displayNetPosition: false, displayRTP: false, displaySessionTimer: false,
          minimumRoundDuration: 0 },
      };
    },
    async play(bet) {
      if (pending || amount < bet) throw new Error('Round active or insufficient demo credits.');
      // Equal-weight local preview only. Live selection always belongs to RGS.
      const pick = crypto.getRandomValues(new Uint32Array(1))[0] % books.length;
      const book = books[pick];
      amount -= bet;
      pending = { bet, book };
      return { balance: balance(), round: { betID: book.id, active: true, mode: 'base',
        amount: bet, payout: bet * book.payoutMultiplier / 100,
        payoutMultiplier: book.payoutMultiplier / 100, state: book.events } };
    },
    async endRound() {
      if (!pending) throw new Error('No demo round is active.');
      amount += pending.bet * pending.book.payoutMultiplier / 100;
      pending = null;
      return { balance: balance() };
    },
  };
}
