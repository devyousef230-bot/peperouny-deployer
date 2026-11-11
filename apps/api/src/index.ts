import Fastify from "fastify";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const app = Fastify({ logger: true, bodyLimit: 16 * 1024 });
const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";
const vaultPath = resolve(process.env.PEPEROUNY_VAULT_PATH ?? "data/cloudflare-token.enc");

type CloudflareEnvelope<T> = {
  success: boolean;
  errors?: Array<{ message?: string }>;
  result: T;
};
type SavedCredential = { token: string; accountId: string | null };

function encryptionKey(): Buffer {
  const secret = process.env.PEPEROUNY_MASTER_KEY;
  if (!secret || secret.length < 32) {
    throw new Error("PEPEROUNY_MASTER_KEY must be configured with at least 32 characters.");
  }
  return createHash("sha256").update(secret).digest();
}

function encrypt(value: SavedCredential): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(".");
}

function decrypt(payload: string): SavedCredential {
  const [ivPart, tagPart, dataPart] = payload.split(".");
  if (!ivPart || !tagPart || !dataPart) throw new Error("Credential vault is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivPart, "base64"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64"));
  const clear = Buffer.concat([decipher.update(Buffer.from(dataPart, "base64")), decipher.final()]);
  return JSON.parse(clear.toString("utf8")) as SavedCredential;
}

async function saveCredential(value: SavedCredential): Promise<void> {
  await mkdir(dirname(vaultPath), { recursive: true });
  const temporaryPath = `${vaultPath}.tmp`;
  await writeFile(temporaryPath, encrypt(value), { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, vaultPath);
}

async function readCredential(): Promise<SavedCredential | null> {
  try {
    return decrypt(await readFile(vaultPath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function cloudflareRequest<T>(path: string, token: string): Promise<CloudflareEnvelope<T>> {
  const response = await fetch(`${CLOUDFLARE_API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json() as CloudflareEnvelope<T>;
  if (!response.ok || !body.success) throw new Error("Cloudflare API request failed.");
  return body;
}

async function getAccounts(token: string) {
  return cloudflareRequest<Array<{ id: string; name: string }>>("/accounts?per_page=50", token);
}

app.get("/health", async () => ({ status: "ok", service: "peperouny-deployer-api" }));

// The credential is encrypted at rest and never returned to the browser.
app.get("/api/cloudflare/status", async (_request, reply) => {
  try {
    const saved = await readCredential();
    if (!saved) return { connected: false };
    const verification = await cloudflareRequest<{ status: string }>("/user/tokens/verify", saved.token);
    if (verification.result.status !== "active") return { connected: false, reason: "token_inactive" };
    const accounts = await getAccounts(saved.token);
    return {
      connected: true,
      accountId: saved.accountId,
      accounts: accounts.result.map(({ id, name }) => ({ id, name })),
    };
  } catch (error) {
    requestLog(_request, error);
    return reply.code(503).send({ connected: false, message: "Saved Cloudflare credentials could not be verified." });
  }
});

app.post<{ Body: { token?: string } }>("/api/cloudflare/connect", async (request, reply) => {
  const token = request.body?.token?.trim();
  if (!token || token.length > 512) {
    return reply.code(400).send({ success: false, message: "یک API Token معتبر وارد کنید." });
  }
  try {
    const verification = await cloudflareRequest<{ status: string }>("/user/tokens/verify", token);
    if (verification.result.status !== "active") {
      return reply.code(401).send({ success: false, message: "توکن Cloudflare فعال نیست." });
    }
    const accounts = await getAccounts(token);
    const firstAccount = accounts.result[0]?.id ?? null;
    await saveCredential({ token, accountId: firstAccount });
    return {
      success: true,
      accounts: accounts.result.map(({ id, name }) => ({ id, name })),
      accountId: firstAccount,
    };
  } catch (error) {
    requestLog(request, error);
    return reply.code(401).send({
      success: false,
      message: "اعتبارسنجی انجام نشد. توکن و دسترسی خواندن حساب‌ها را بررسی کنید.",
    });
  }
});

app.post<{ Body: { accountId?: string } }>("/api/cloudflare/account", async (request, reply) => {
  const accountId = request.body?.accountId?.trim();
  if (!accountId) return reply.code(400).send({ success: false, message: "یک حساب انتخاب کنید." });
  try {
    const saved = await readCredential();
    if (!saved) return reply.code(409).send({ success: false, message: "ابتدا Cloudflare را متصل کنید." });
    const accounts = await getAccounts(saved.token);
    if (!accounts.result.some((account) => account.id === accountId)) {
      return reply.code(403).send({ success: false, message: "این حساب با توکن فعلی در دسترس نیست." });
    }
    await saveCredential({ ...saved, accountId });
    return { success: true, accountId };
  } catch (error) {
    requestLog(request, error);
    return reply.code(503).send({ success: false, message: "ذخیره حساب انتخاب‌شده انجام نشد." });
  }
});

app.delete("/api/cloudflare/connect", async (_request, reply) => {
  try {
    await unlink(vaultPath);
    return { success: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { success: true };
    return reply.code(500).send({ success: false, message: "حذف اعتبارنامه انجام نشد." });
  }
});

function requestLog(request: { log: { warn: (data: object, message: string) => void } }, error: unknown) {
  // Do not log request bodies, authorization headers, or credential values.
  request.log.warn({ errorType: error instanceof Error ? error.name : "UnknownError" }, "Cloudflare operation failed");
}

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "0.0.0.0";
try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error({ errorType: error instanceof Error ? error.name : "UnknownError" });
  process.exit(1);
}
