import { createServer, type ServerResponse } from "node:http";
import { ZodError, z } from "zod";
import { InfraiError, realtimeFromEnvironment } from "./infrai_realtime.js";
import { notificationFor, orderUpdateSchema } from "./order_updates.js";

const tokenRequestSchema = z.object({
  customerId: z.string().min(1),
  clientId: z.string().min(1)
});

function reply(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const realtime = realtimeFromEnvironment();
const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/order-updates") {
      const update = orderUpdateSchema.parse(await readJson(request));
      const notification = notificationFor(update);
      await realtime.createCustomerChannel(update.customerId);
      await realtime.publish(notification);
      reply(response, 202, { accepted: true, notification });
      return;
    }

    if (request.method === "POST" && request.url === "/realtime-token") {
      const input = tokenRequestSchema.parse(await readJson(request));
      const token = await realtime.issueBrowserToken(input.customerId, input.clientId);
      reply(response, 200, { token });
      return;
    }

    reply(response, 404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof ZodError) {
      reply(response, 400, { error: "Invalid request body", issues: error.issues });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      reply(response, status, { error: error.code, message: error.message });
      return;
    }
    reply(response, 500, { error: "Request could not be processed" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Order notification service listening on http://localhost:${port}`));
