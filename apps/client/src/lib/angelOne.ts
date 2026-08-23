import { Linking, Platform } from 'react-native';
import type { BrokerOrderHint } from '../types';

/**
 * IMPORTANT — READ BEFORE CHANGING THIS FILE.
 *
 * Angel One's SmartAPI does not publicly document a mobile URL scheme for
 * deep-linking into the Angel One app with a pre-filled order (verified via
 * web search against Angel One's own SmartAPI docs and third-party guides
 * as of this build — see chat history). What IS documented:
 *
 *   - The "Publisher API" is a web redirect + login flow: a registered
 *     SmartAPI app gets a Redirect URL, the user is sent through Angel
 *     One's hosted login, and Angel One redirects back with an auth token.
 *     It is not a mobile intent scheme and requires a registered
 *     ANGEL_ONE_PUBLISHER_APP_ID (see apps/api/.env) to construct correctly.
 *   - The Trading API's placeOrder call takes exactly these fields:
 *     variety, tradingsymbol, symboltoken, transactiontype, exchange,
 *     ordertype, producttype, duration, price, quantity.
 *
 * Given that, this module does two things honestly:
 *   1. Renders the canonical order parameters so the client can place the
 *      order themselves in the Angel One app with zero ambiguity.
 *   2. Offers Angel One's verified App Store / Play Store listing. It never
 *      attempts an undocumented custom URL scheme and never claims to open
 *      or pre-fill the consumer app.
 *
 * ACTION NEEDED: confirming whether Angel One's live "AngelOne" consumer
 * app supports ANY custom URL scheme at all requires a real device with the
 * app installed — this cannot be verified from this environment. Do not
 * claim "Open in Angel One" pre-fills an order until that's been checked
 * against a real device and, ideally, confirmed with Angel One's API team.
 */

const ANGEL_ONE_ANDROID_PACKAGE = 'com.msf.angelmobile';
const ANGEL_ONE_IOS_APP_STORE_URL = 'https://apps.apple.com/in/app/angel-one/id1044994264';
const ANGEL_ONE_ANDROID_PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANGEL_ONE_ANDROID_PACKAGE}`;
const ANGEL_ONE_ANDROID_INTENT = `intent://#Intent;package=${ANGEL_ONE_ANDROID_PACKAGE};end;`;

export interface AngelOneOrderParams {
  variety: 'NORMAL' | 'AMO';
  tradingsymbol: string;
  symboltoken: string | null;
  transactiontype: 'BUY' | 'SELL';
  exchange: string;
  ordertype: 'MARKET' | 'LIMIT';
  producttype: string | null;
  duration: 'DAY' | 'IOC';
  price: number;
  quantity: number | null;
}

/** Maps our stored broker order hint to Angel One's exact documented field names. */
export function toAngelOneOrderParams(hint: BrokerOrderHint, entryPrice: number): AngelOneOrderParams {
  return {
    variety: 'NORMAL',
    tradingsymbol: hint.tradingSymbol,
    symboltoken: hint.symbolToken,
    transactiontype: hint.side,
    exchange: hint.exchange,
    ordertype: hint.orderType,
    producttype: hint.productType,
    duration: 'DAY',
    price: entryPrice,
    quantity: hint.quantity,
  };
}

/**
 * Attempts to open the Angel One app directly on Android via an intent.
 * Falls back to the verified store listing if not installed or on iOS.
 */
export async function openAngelOneApp(): Promise<string> {
  if (Platform.OS === 'android') {
    try {
      await Linking.openURL(ANGEL_ONE_ANDROID_INTENT);
      return ANGEL_ONE_ANDROID_INTENT;
    } catch (e) {
      // Fall through to store
    }
  }

  const fallbackUrl = Platform.OS === 'ios' ? ANGEL_ONE_IOS_APP_STORE_URL : ANGEL_ONE_ANDROID_PLAY_STORE_URL;
  await Linking.openURL(fallbackUrl);
  return fallbackUrl;
}

export function buildClipboardOrderString(params: AngelOneOrderParams): string {
  return `Trade: ${params.transactiontype}
Symbol: ${params.tradingsymbol}
Order: ${params.ordertype}
Exchange: ${params.exchange}
Product: ${params.producttype}
Qty: ${params.quantity ?? '—'}
Price: ${params.price}`;
}
