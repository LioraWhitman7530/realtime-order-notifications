import { z } from "zod";

export const orderUpdateSchema = z.discriminatedUnion("status", [
  z.object({
    orderId: z.string().min(1),
    customerId: z.string().min(1),
    status: z.literal("checkout_completed"),
    receiptNumber: z.string().min(1),
    total: z.number().nonnegative(),
    currency: z.string().length(3).transform((value) => value.toUpperCase())
  }),
  z.object({
    orderId: z.string().min(1),
    customerId: z.string().min(1),
    status: z.literal("fulfillment_started"),
    estimatedDelivery: z.string().date()
  }),
  z.object({
    orderId: z.string().min(1),
    customerId: z.string().min(1),
    status: z.literal("shipped"),
    carrier: z.string().min(1),
    trackingNumber: z.string().min(1)
  }),
  z.object({
    orderId: z.string().min(1),
    customerId: z.string().min(1),
    status: z.literal("delivered"),
    deliveredAt: z.string().datetime()
  })
]);

export type OrderUpdate = z.infer<typeof orderUpdateSchema>;

export type Notification = {
  channel: string;
  event: string;
  title: string;
  message: string;
  data: OrderUpdate;
};

export function notificationFor(update: OrderUpdate): Notification {
  const common = { channel: `customer:${update.customerId}`, data: update };

  switch (update.status) {
    case "checkout_completed":
      return {
        ...common,
        event: "order.receipt_ready",
        title: "Order confirmed",
        message: `Receipt ${update.receiptNumber} is ready for order ${update.orderId}.`
      };
    case "fulfillment_started":
      return {
        ...common,
        event: "order.fulfillment_started",
        title: "Your order is being prepared",
        message: `Order ${update.orderId} is due by ${update.estimatedDelivery}.`
      };
    case "shipped":
      return {
        ...common,
        event: "order.shipped",
        title: "Order shipped",
        message: `${update.carrier} is carrying order ${update.orderId}.`
      };
    case "delivered":
      return {
        ...common,
        event: "order.delivered",
        title: "Order delivered",
        message: `Order ${update.orderId} was delivered.`
      };
  }
}
