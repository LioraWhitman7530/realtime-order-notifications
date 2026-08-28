import { notificationFor, orderUpdateSchema } from "./order_updates.js";

const update = orderUpdateSchema.parse({
  orderId: "ord_1048",
  customerId: "cus_27",
  status: "checkout_completed",
  receiptNumber: "R-1048",
  total: 129.5,
  currency: "usd"
});

console.log(JSON.stringify(notificationFor(update), null, 2));
