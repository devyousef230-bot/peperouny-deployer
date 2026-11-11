import Fastify from "fastify";

const app = Fastify({ logger: true });
const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";

type CloudflareEnvelope<T> = {
  success: boolean;
  errors?: Array<{ message?: string }>;
  result: T;
};

async function cloudflareRequest<T>(path: string, token: string): Promise<CloudflareEnvelope<T>> {
  const response = await fetch(`${CLOUDFLARE_API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json() as CloudflareEnvelope<T>;
  if (!response.ok || !body.success) {
    const message = body.errors?.map((item) => item.message).filter(Boolean).join("; ");
    throw new Error(message || `Cloudflare API returned HTTP ${response.status}`);
  }
  return body;
}

app.get("/health", async () => ({
  status: "ok",
  service: "peperouny-deployer-api",
}));

app.post<{ Body: { token?: string } }>("/api/cloudflare/verify", async (request, reply) => {
  const token = request.body?.token?.trim();
  if (!token || token.length > 512) {
    return reply.code(400).send({ success: false, message: "یک API Token معتبر وارد کنید." });
  }

  try {
    const verification = await cloudflareRequest<{ id: string; status: string }>("/user/tokens/verify", token);
    if (verification.result.status !== "active") {
      return reply.code(401).send({ success: false, message: "این توکن فعال نیست." });
    }

    const accounts = await cloudflareRequest<Array<{ id: string; name: string }>>(
      "/accounts?per_page=50",
      token,
    );
    return {
      success: true,
      tokenStatus: verification.result.status,
      accounts: accounts.result.map(({ id, name }) => ({ id, name })),
    };
  } catch (error) {
    // Never return or log the submitted token.
    const message = error instanceof Error ? error.message : "Cloudflare request failed";
    request.log.warn({ err: message }, "Cloudflare verification failed");
    return reply.code(502).send({
      success: false,
      message: message.includes("Forbidden") || message.includes("403")
        ? "توکن معتبر است، اما دسترسی خواندن حساب‌ها را ندارد."
        : "اعتبارسنجی Cloudflare انجام نشد. توکن و دسترسی‌های آن را بررسی کنید.",
    });
  }
});

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "0.0.0.0";

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
