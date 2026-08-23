import type { BrokerId, BrokerOrderHint } from '@karma/types';

export interface InstrumentResolution {
  tradingSymbol: string;
  symbolToken: string | null;
  exchange: string;
  /** True only if resolved against a real, current instrument master — never guessed. */
  resolved: boolean;
  note?: string;
}

export interface OrderIntent {
  broker: BrokerId;
  tradingSymbol: string;
  symbolToken: string | null;
  exchange: string;
  transactionType: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT';
  productType: string | null;
  quantity: number | null;
  price: number;
}

export interface BrokerHealthStatus {
  broker: BrokerId;
  configured: boolean;
  reachable: boolean | 'unknown';
  detail: string;
}

/**
 * Any broker integration implements this. Nothing in the signal engine,
 * admin app, or client app should import Angel One specifics directly —
 * they go through this interface so a second broker could be added later
 * without touching signal/notification logic.
 */
export interface BrokerProvider {
  readonly id: BrokerId;
  resolveInstrument(exchange: string, tradingSymbol: string): Promise<InstrumentResolution>;
  buildOrderIntent(hint: BrokerOrderHint, entryPrice: number): OrderIntent;
  healthCheck(): Promise<BrokerHealthStatus>;
}
