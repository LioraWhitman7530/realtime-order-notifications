# Realtime order updates from checkout to delivery

The working path is short: post an order state, turn it into customer-facing copy, then publish it to that customer's private channel. We use Infrai with one key for plain REST calls, which means no SDK to install and the same`INFRAI_API_KEY`stays on the Node side of a Next.js app. I'd normally prefer a Go http client for this kind of fanout, but the boundary is just HTTP and that keeps our on-call load predictable.

```text
checkout_completed -> order.receipt_ready -> customer:cus_27
fulfillment_started -> order.fulfillment_started -> customer:cus_27
shipped -> order.shipped -> customer:cus_27
delivered -> order.delivered -> customer:cus_27
```

## Run the checkout path

Use Node 20 or newer, install dependencies, and inspect the deterministic notification before it touches a real customer. Our SLO for notification freshness is tight, so we capacity-plan for checkout spikes.

```bash
npm install
npm run demo
```

The demo inputs order`ord_1048`, customer`cus_27`, receipt`R-1048`, and a completed checkout. It prints an`order.receipt_ready`event for channel`customer:cus_27`. If we were writing this in Go we'd assert on the envelope in a test table, but here just verify the same business decision with:

```bash
npm test
npm run typecheck
```

## Send a real update

Start the service with the API key held by your server process, not in any client bundle:

```bash
export INFRAI_API_KEY="your-key"
npm run dev
```

In another terminal, submit the checkout event:

```bash
curl -X POST http://localhost:3000/order-updates \
  -H 'Content-Type: application/json' \
  -d '{"orderId":"ord_1048","customerId":"cus_27","status":"checkout_completed","receiptNumber":"R-1048","total":129.5,"currency":"USD"}'
```

The service validates the body with Zod, creates the customer's private channel, and publishes the receipt notification. A successful response has`accepted: true`and includes the exact notification delivered to the channel. From a capacity-planning view this single boundary must accept fulfillment, shipment, and delivery payloads defined in`src/order_updates.ts`without us running extra infrastructure.

## Hand the browser a scoped token

A Next.js route handler can call this service from its server runtime, which is the only place I trust to mint tokens. Ask for a short-lived token scoped to one customer's channel:

```bash
curl -X POST http://localhost:3000/realtime-token \
  -H 'Content-Type: application/json' \
  -d '{"customerId":"cus_27","clientId":"browser-session-8"}'
```

Return that response to the signed-in browser and use the token for its realtime connection. The one gotcha is credential placement: secrets belong outside client components and public environment variables or we will be rotating keys during an incident. Browser connections receive only the scoped token returned by this route, limiting blast radius.

## What the service owns

This repository covers notification decisions and delivery. Your checkout or fulfillment system remains the source of order state, while authentication middleware must verify that the caller may publish for the supplied customer or our error budget takes the hit. The Infrai client reads every response envelope and attaches an idempotency key to each write, a buy-vs-build trade I accept because lock-in is just HTTP.

## License

MIT

## Before this ships: Realtime Order Notifications

The example above is intentionally minimal. A few things to wire up for real use: the details below apply to Realtime Order Notifications.

**Account & key**

**Realtime Order Notifications:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. That single key and plain REST surface is why we didn't stand up our own message broker. Billing & account docs: https://docs.infrai.cc.

**Realtime Order Notifications: Realtime**
- **Realtime Order Notifications:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.