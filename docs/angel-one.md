# Angel One integration — what's real, what isn't

## Product model (deliberately, not a limitation)

KARMA never places or auto-executes trades. The flow is:
```
Notification → Signal detail (exact trade plan shown) → client manually reviews and confirms in their own Angel One app
```
This was an explicit product decision, not something we couldn't build — see the instruction history for this project. Nothing here should be extended toward automatic execution.

## What's implemented and real

- **Instrument resolution** (`apps/api/src/modules/broker/angelOneProvider.ts`): fetches and caches Angel One's real, public `OpenAPIScripMaster.json` instrument list and resolves a trading symbol to its exchange token. This is a real, working integration — verify it yourself by hitting `GET /admin/broker/resolve-instrument?exchange=NFO&tradingSymbol=...` once the API is running.
- **Broker health check** (`GET /admin/broker/health`, surfaced on the admin System Health page): reports whether Angel One config is present and whether the instrument master is currently reachable — real data, not a stub.
- **Order intent builder** (`buildOrderIntent`): maps our stored trade plan to Angel One's exact documented order field names (`tradingsymbol`, `symboltoken`, `transactiontype`, `exchange`, `ordertype`, `producttype`, `quantity`, `price`) — this is what the client app displays so a client can enter the order manually with zero ambiguity.
- **Broker abstraction** (`brokerProvider.ts`): everything above sits behind an interface so a second broker could be added later without touching signal or notification logic.

## What's explicitly NOT implemented, and why

- **No mobile deep-link that pre-fills an order in the Angel One app.** Searched for this before building anything — there is no publicly documented mobile URL scheme for it. What Angel One documents is:
  - The **Publisher API** (`smartapi.angelone.in/publisher-login?api_key=...`) — a web-redirect login flow for *delegated automated trading*, where your registered app can place orders on a user's behalf after they log in through it. This is fundamentally different from "client reviews and confirms in their own app" and was deliberately not wired up, since building toward it risks becoming automatic execution.
  - The **Trading API**'s `placeOrder` — a programmatic order-placement call. Also not used, same reason.
- The client app deliberately has no Angel One app-opening or order deep-link. Its **Get Angel One** control opens only Angel One's verified App Store / Play Store listing and the signal detail displays the manual order fields. This avoids fabricating an undocumented behavior.

**REQUIRES REAL DEVICE TEST**: confirm that the displayed contract, side, exchange, quantity, order type, and price can be entered and reviewed correctly in the installed Angel One app. A custom scheme is not part of the product and is not a test requirement.

## Configuration

```
ANGEL_ONE_API_KEY=
ANGEL_ONE_CLIENT_CODE=
ANGEL_ONE_PUBLISHER_APP_ID=
```
None of these are required for the instrument-resolution or health-check features to work — the scrip master is public. They exist for a possible future delegated-trading integration, which is explicitly not built (see above).
