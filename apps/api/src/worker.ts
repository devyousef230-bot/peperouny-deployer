import { deployHelloWorld } from "./deploy/hello-world.js";
import { deployZeus } from "./deploy/zeus.js";

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}
interface Env {
  PEPEROUNY_DB: D1Database;
  ASSETS: { fetch(request: Request): Promise<Response> };
  PEPEROUNY_MASTER_KEY: string;
}
type SavedCredential = { token: string; accountId: string | null };
type CfEnvelope<T> = { success: boolean; errors?: Array<{ code?: number; message?: string }>; result: T };
class CloudflareApiError extends Error {
  constructor(
    readonly upstreamStatus: number,
    readonly cloudflareErrors: Array<{ code?: number; message?: string }>
  ) {
    super("Cloudflare API request failed");
    this.name = "CloudflareApiError";
  }
}

const API = "https://api.cloudflare.com/client/v4";
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});
async function cf<T>(path: string, token: string): Promise<CfEnvelope<T>> {
  const response = await fetch(API + path, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  let body: CfEnvelope<T>;
  try {
    body = await response.json() as CfEnvelope<T>;
  } catch {
    throw new CloudflareApiError(response.status, [{ message: "Cloudflare returned a non-JSON response." }]);
  }
  if (!response.ok || !body.success) {
    throw new CloudflareApiError(response.status, body.errors ?? []);
  }
  return body;
}
async function key(env: Env): Promise<CryptoKey> {
  if (!env.PEPEROUNY_MASTER_KEY || env.PEPEROUNY_MASTER_KEY.length < 32) {
    throw new Error("PEPEROUNY_MASTER_KEY must contain at least 32 characters");
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(env.PEPEROUNY_MASTER_KEY));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function encrypt(env: Env, value: SavedCredential): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(env), new TextEncoder().encode(JSON.stringify(value)));
  const b64 = (v: Uint8Array) => btoa(String.fromCharCode(...v));
  return b64(iv) + "." + b64(new Uint8Array(cipher));
}
async function decrypt(env: Env, value: string): Promise<SavedCredential> {
  const [ivPart, dataPart] = value.split(".");
  if (!ivPart || !dataPart) throw new Error("Credential vault is invalid");
  const bytes = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(ivPart) }, await key(env), bytes(dataPart));
  return JSON.parse(new TextDecoder().decode(clear)) as SavedCredential;
}
async function readSaved(env: Env): Promise<SavedCredential | null> {
  const row = await env.PEPEROUNY_DB.prepare("SELECT value FROM credentials WHERE id = ?").bind("cloudflare").first<{ value: string }>();
  return row ? decrypt(env, row.value) : null;
}
async function save(env: Env, value: SavedCredential): Promise<void> {
  const encrypted = await encrypt(env, value);
  await env.PEPEROUNY_DB.prepare("INSERT INTO credentials (id, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
    .bind("cloudflare", encrypted, new Date().toISOString()).run();
}
async function accounts(token: string) {
  return cf<Array<{ id: string; name: string }>>("/accounts?per_page=50", token);
}
async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/health") return json({ status: "ok", service: "peperouny-deployer" });
  if (url.pathname === "/api/cloudflare/status" && request.method === "GET") {
    try {
      const saved = await readSaved(env);
      if (!saved) return json({ connected: false });
      const verify = await cf<{ status: string }>("/user/tokens/verify", saved.token);
      if (verify.result.status !== "active") return json({ connected: false });
      const list = await accounts(saved.token);
      return json({ connected: true, accountId: saved.accountId, accounts: list.result });
    } catch { return json({ connected: false, message: "Saved credentials could not be verified." }, 503); }
  }
  if (url.pathname === "/api/cloudflare/connect" && request.method === "POST") {
    let stage = "request_parse";
    try {
      const body = await request.json() as { token?: string };
      const token = body.token?.trim();
      if (!token || token.length > 512) return json({ success: false, message: "یک API Token معتبر وارد کنید." }, 400);
      stage = "token_verify";
      const verify = await cf<{ status: string }>("/user/tokens/verify", token);
      if (verify.result.status !== "active") {
        return json({ success: false, stage, message: "توکن Cloudflare فعال نیست.", diagnostic: { tokenStatus: verify.result.status } }, 401);
      }
      stage = "account_list";
      const list = await accounts(token);
      const accountId = list.result[0]?.id ?? null;
      stage = "credential_save";
      await save(env, { token, accountId });
      return json({ success: true, accounts: list.result, accountId });
    } catch (error) {
      if (error instanceof CloudflareApiError) {
        return json({
          success: false,
          stage,
          message: "Cloudflare درخواست را رد کرد.",
          diagnostic: {
            upstreamStatus: error.upstreamStatus,
            errors: error.cloudflareErrors.map(item => ({
              code: item.code,
              message: item.message
            }))
          }
        }, 502);
      }
      return json({
        success: false,
        stage: "credential_or_network",
        message: "اتصال یا ذخیره‌سازی اعتبارنامه با خطا مواجه شد.",
        diagnostic: {
          error: error instanceof Error ? error.message : "Unknown error"
        }
      }, 500);
    }
  }
  if (url.pathname === "/api/cloudflare/account" && request.method === "POST") {
    try {
      const body = await request.json() as { accountId?: string };
      const accountId = body.accountId?.trim();
      if (!accountId) return json({ success: false, message: "یک حساب انتخاب کنید." }, 400);
      const saved = await readSaved(env);
      if (!saved) return json({ success: false, message: "ابتدا Cloudflare را متصل کنید." }, 409);
      const list = await accounts(saved.token);
      if (!list.result.some(a => a.id === accountId)) return json({ success: false, message: "این حساب در دسترس نیست." }, 403);
      await save(env, { ...saved, accountId });
      return json({ success: true, accountId });
    } catch { return json({ success: false, message: "ذخیره حساب انجام نشد." }, 503); }
  }
  if (url.pathname === "/api/cloudflare/connect" && request.method === "DELETE") {
    await env.PEPEROUNY_DB.prepare("DELETE FROM credentials WHERE id = ?").bind("cloudflare").run();
    return json({ success: true });
  }
  if (url.pathname === "/api/deploy/hello-world" && request.method === "POST") {
    try {
      const saved = await readSaved(env);
      if (!saved) return json({ success: false, message: "ابتدا Cloudflare را متصل کنید." }, 409);
      if (!saved.accountId) return json({ success: false, message: "ابتدا یک حساب انتخاب کنید." }, 409);
      const deployment = await deployHelloWorld(saved.accountId, saved.token);
      return json({ success: true, deployment });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Hello World deployment failed.";
      return json({ success: false, message }, 502);
    }
  }
  if (url.pathname === "/api/deploy" && request.method === "POST") {
    try {
      const body = await request.json() as { projectId?: string };
      if (body.projectId !== "zeus") return json({ success: false, message: "Adapter این پروژه هنوز آماده نشده است." }, 409);
      const saved = await readSaved(env);
      if (!saved) return json({ success: false, message: "ابتدا Cloudflare را متصل کنید." }, 409);
      if (!saved.accountId) return json({ success: false, message: "ابتدا یک حساب انتخاب کنید." }, 409);
      const deployment = await deployZeus(saved.accountId, saved.token);
      return json({ success: true, deployment });
    } catch (error) {
      return json({ success: false, message: error instanceof Error ? error.message : "Deploy ناموفق بود." }, 502);
    }
  }
  return env.ASSETS.fetch(request);
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try { return await route(request, env); }
    catch { return json({ success: false, message: "Internal server error." }, 500); }
  },
};
