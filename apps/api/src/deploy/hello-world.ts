const API = "https://api.cloudflare.com/client/v4";

type Envelope<T> = { success: boolean; errors?: Array<{ code?: number; message?: string }>; result: T };
async function cf<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
    signal: AbortSignal.timeout(30_000),
  });
  let payload: Envelope<T>;
  try { payload = await response.json() as Envelope<T>; }
  catch { throw new Error(`Cloudflare returned HTTP ${response.status} without JSON.`); }
  if (!response.ok || !payload.success) {
    const details = payload.errors?.map(e => e.message).filter(Boolean).join("; ");
    throw new Error(details || `Cloudflare API error ${response.status}`);
  }
  return payload.result;
}

async function ensureSubdomain(accountId: string, token: string): Promise<string> {
  try {
    const current = await cf<{ subdomain?: string }>(`/accounts/${accountId}/workers/subdomain`, token);
    if (current.subdomain) return current.subdomain;
  } catch { /* Create a subdomain if this account has not configured one. */ }
  const requested = `peperouny-${accountId.slice(0, 12).toLowerCase()}`;
  const created = await cf<{ subdomain?: string }>(`/accounts/${accountId}/workers/subdomain`, token, {
    method: "PUT", body: JSON.stringify({ subdomain: requested }),
  });
  if (!created.subdomain) throw new Error("Cloudflare did not return a workers.dev subdomain.");
  return created.subdomain;
}

export type HelloWorldResult = {
  scriptName: string;
  workerUrl: string;
  health: string;
  steps: string[];
};

export async function deployHelloWorld(accountId: string, token: string): Promise<HelloWorldResult> {
  const steps: string[] = [];
  const scriptName = "peperouny-hello-world";
  const source = `export default {
  async fetch(request) {
    const url = new URL(request.url);
    return new Response(JSON.stringify({
      message: "Hello, world!",
      service: "Peperouny",
      status: "ok",
      path: url.pathname,
      timestamp: new Date().toISOString()
    }, null, 2), {
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }
};`;

  const verify = await cf<{ status: string }>("/user/tokens/verify", token);
  if (verify.status !== "active") throw new Error("Cloudflare API Token is not active.");
  steps.push("Cloudflare token verified");

  const subdomain = await ensureSubdomain(accountId, token);
  steps.push("workers.dev account subdomain ready");

  const metadata = {
    main_module: "worker.js",
    compatibility_date: "2026-11-11",
    bindings: [],
  };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }), "metadata.json");
  form.append("worker.js", new Blob([source], { type: "application/javascript+module" }), "worker.js");

  const upload = await fetch(`${API}/accounts/${accountId}/workers/scripts/${scriptName}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    signal: AbortSignal.timeout(90_000),
  });
  let uploadBody: Envelope<unknown>;
  try { uploadBody = await upload.json() as Envelope<unknown>; }
  catch { throw new Error(`Worker upload returned HTTP ${upload.status} without JSON.`); }
  if (!upload.ok || !uploadBody.success) {
    const details = uploadBody.errors?.map(e => e.message).filter(Boolean).join("; ");
    throw new Error(details || `Worker upload failed with HTTP ${upload.status}.`);
  }
  steps.push("Hello World Worker uploaded");

  const route = await cf<{ enabled: boolean }>(
    `/accounts/${accountId}/workers/scripts/${scriptName}/subdomain`, token,
    { method: "POST", body: JSON.stringify({ enabled: true }) },
  );
  if (!route.enabled) throw new Error("Cloudflare did not enable the workers.dev route.");
  steps.push("workers.dev route enabled");

  const workerUrl = `https://${scriptName}.${subdomain}.workers.dev`;
  const healthResponse = await fetch(workerUrl, { signal: AbortSignal.timeout(20_000) });
  if (!healthResponse.ok) throw new Error(`Worker deployed but health check returned HTTP ${healthResponse.status}.`);
  const health = await healthResponse.text();
  if (!health.includes("Hello, world!") || !health.includes('"status": "ok"')) {
    throw new Error("Worker responded, but the Hello World health check did not match.");
  }
  steps.push("Live Hello World response verified");

  return { scriptName, workerUrl, health, steps };
}
