import assert from "node:assert/strict";
import test from "node:test";
import { notificationFor, orderUpdateSchema } from "../src/order_updates.js";

test("checkout completion becomes a private receipt notification", () => {
  const update = orderUpdateSchema.parse({
    orderId: "ord_1048",
    customerId: "cus_27",
    status: "checkout_completed",
    receiptNumber: "R-1048",
    total: 129.5,
    currency: "usd"
  });

  assert.deepEqual(notificationFor(update), {
    channel: "customer:cus_27",
    event: "order.receipt_ready",
    title: "Order confirmed",
    message: "Receipt R-1048 is ready for order ord_1048.",
    data: { ...update, currency: "USD" }
  });
});
