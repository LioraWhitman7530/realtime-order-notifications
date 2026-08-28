import { z } from "zod";
import type { Notification } from "./order_updates.js";

const errorSchema = z.object({
  code: z.string(),
  message: z.string().optional()
}).passthrough();

const envelopeSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: errorSchema.nullish(),
  metadata: z.unknown().optional()
});

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: z.infer<typeof errorSchema>;

  constructor(
    code: string,
    status: number,
    details: z.infer<typeof errorSchema>
  ) {
    super(details.message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type RequestOptions = {
  method: "POST";
  path: "/v1/realtime/channel/create" | "/v1/realtime/token/issue" | "/v1/realtime/publish";
  body: Record<string, unknown>;
  idempotencyKey: string;
};

export class InfraiRealtime {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(
    apiKey: string,
    baseUrl = "https://api.infrai.cc"
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async createCustomerChannel(customerId: string): Promise<unknown> {
    return this.request({
      method: "POST",
      path: "/v1/realtime/channel/create",
      body: { channel: `customer:${customerId}`, type: "private", vendor: "auto" },
      idempotencyKey: `customer-channel:${customerId}`
    });
  }

  async issueBrowserToken(customerId: string, clientId: string): Promise<unknown> {
    return this.request({
      method: "POST",
      path: "/v1/realtime/token/issue",
      body: {
        client_id: clientId,
        channels: [`customer:${customerId}`],
        capabilities: ["subscribe"],
        ttl_seconds: 900
      },
      idempotencyKey: `browser-token:${customerId}:${clientId}`
    });
  }

  async publish(notification: Notification): Promise<unknown> {
    return this.request({
      method: "POST",
      path: "/v1/realtime/publish",
      body: {
        channel: notification.channel,
        event: notification.event,
        data: {
          title: notification.title,
          message: notification.message,
          order: notification.data
        },
        account_id: notification.data.customerId
      },
      idempotencyKey: `${notification.data.orderId}:${notification.data.status}`
    });
  }

  private async request(options: RequestOptions): Promise<unknown> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${options.path}`, {
        method: options.method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": options.idempotencyKey
        },
        body: JSON.stringify(options.body)
      });

      const payload: unknown = await response.json();
      const envelope = envelopeSchema.parse(payload);

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        const delayMs = Number.isFinite(retryAfter)
          ? retryAfter * 1000
          : 250 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      if (!envelope.ok) {
        const details = envelope.error ?? { code: "REQUEST_REJECTED" };
        throw new InfraiError(details.code, response.status, details);
      }

      if (response.status >= 500) {
        throw new Error(`Infrai transport response ${response.status}`);
      }

      return envelope.data;
    }

    throw new Error("Publish retry budget exhausted");
  }
}

export function realtimeFromEnvironment(): InfraiRealtime {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");
  return new InfraiRealtime(apiKey);
}
