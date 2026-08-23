import type { BrokerOrderHint } from '@karma/types';
import { env, isAngelOneConfigured } from '../../config/env.js';
import type { BrokerHealthStatus, BrokerProvider, InstrumentResolution, OrderIntent } from './brokerProvider.js';

/**
 * Real, public, documented instrument master endpoint — not fabricated.
 * Confirmed via Angel One's own SmartAPI community forum (multiple
 * independent threads, most recent Sept 2025) at the time this was built.
 * Returns the full NSE/BSE/NFO/MCX/CDS instrument list as JSON; no API key
 * required to fetch it.
 */
const SCRIP_MASTER_URL = 'https://margincalculator.angelone.in/OpenAPI_File/files/OpenAPIScripMaster.json';

interface ScripMasterEntry {
  token: string;
  symbol: string;
  name: string;
  exch_seg: string;
  instrumenttype: string;
}

let cache: { entries: ScripMasterEntry[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 1000 * 60 * 60 * 12; // Angel One republishes this file periodically; 12h is a reasonable dev-scale TTL.

async function loadScripMaster(): Promise<ScripMasterEntry[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.entries;
  }
  const res = await fetch(SCRIP_MASTER_URL);
  if (!res.ok) {
    throw new Error(`Angel One scrip master fetch failed: HTTP ${res.status}`);
  }
  const entries = (await res.json()) as ScripMasterEntry[];
  cache = { entries, fetchedAt: Date.now() };
  return entries;
}

export class AngelOneProvider implements BrokerProvider {
  readonly id = 'ANGEL_ONE' as const;

  async resolveInstrument(exchange: string, tradingSymbol: string): Promise<InstrumentResolution> {
    try {
      const entries = await loadScripMaster();
      const match = entries.find(
        (e) => e.exch_seg.toUpperCase() === exchange.toUpperCase() && e.symbol.toUpperCase() === tradingSymbol.toUpperCase(),
      );
      if (!match) {
        return {
          tradingSymbol,
          symbolToken: null,
          exchange,
          resolved: false,
          note: 'No exact match in Angel One scrip master for this exchange + trading symbol. Verify the symbol format (e.g. options need the full expiry-strike-CE/PE suffix).',
        };
      }
      return { tradingSymbol: match.symbol, symbolToken: match.token, exchange: match.exch_seg, resolved: true };
    } catch (err) {
      return {
        tradingSymbol,
        symbolToken: null,
        exchange,
        resolved: false,
        note: `Could not reach Angel One's instrument master: ${(err as Error).message}. Falling back to unresolved — admin must supply symbolToken manually if known.`,
      };
    }
  }

  buildOrderIntent(hint: BrokerOrderHint, entryPrice: number): OrderIntent {
    return {
      broker: 'ANGEL_ONE',
      tradingSymbol: hint.tradingSymbol,
      symbolToken: hint.symbolToken,
      exchange: hint.exchange,
      transactionType: hint.side,
      orderType: hint.orderType,
      productType: hint.productType,
      quantity: hint.quantity,
      price: entryPrice,
    };
  }

  async healthCheck(): Promise<BrokerHealthStatus> {
    if (!isAngelOneConfigured) {
      return {
        broker: 'ANGEL_ONE',
        configured: false,
        reachable: 'unknown',
        detail: 'ANGEL_ONE_API_KEY / ANGEL_ONE_CLIENT_CODE / ANGEL_ONE_PUBLISHER_APP_ID not set — broker features are inactive.',
      };
    }
    try {
      const entries = await loadScripMaster();
      return {
        broker: 'ANGEL_ONE',
        configured: true,
        reachable: true,
        detail: `Config present; instrument master reachable (${entries.length} instruments cached).`,
      };
    } catch (err) {
      return {
        broker: 'ANGEL_ONE',
        configured: true,
        reachable: false,
        detail: `Config present but instrument master unreachable: ${(err as Error).message}`,
      };
    }
  }
}

export const angelOneProvider = new AngelOneProvider();

// Reference only, not wired to anything: env.ANGEL_ONE_API_KEY /
// ANGEL_ONE_PUBLISHER_APP_ID exist for a possible FUTURE delegated-trading
// integration via Angel One's real Publisher login flow
// (https://smartapi.angelone.in/publisher-login?api_key=...&redirect_url=...).
// That flow authenticates OUR app to place orders on a logged-in Angel One
// account's behalf — it is NOT the same thing as "client reviews and
// confirms the order themselves in their own Angel One app", which is what
// this product actually does (see apps/client/src/lib/angelOne.ts). It is
// deliberately not implemented here to avoid any path toward automatic
// client trade execution, which the product explicitly does not do.
void env.ANGEL_ONE_PUBLISHER_APP_ID;
