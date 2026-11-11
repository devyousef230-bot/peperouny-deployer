const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";
const ZEUS_SOURCE_URL = "https://raw.githubusercontent.com/panel-zeus/Z-E-U-S/1f01a440608abac9650c54149b6fbd1aebf34dfb/Source.js";
const ZEUS_WORKER_PREFIX = "peperouny-zeus";

type CfEnvelope<T> = { success: boolean; errors?: Array<{ message?: string }>; result: T };
type D1Database = { uuid: string; name: string };
type WorkerSubdomain = { subdomain?: string };
type ScriptSubdomain = { enabled: boolean; previews_enabled?: boolean };

async function cfJson<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${CLOUDFLARE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json() as CfEnvelope<T>;
  if (!response.ok || !payload.success) {
    const details = payload.errors?.map((item) => item.message).filter(Boolean).join("; ");
    throw new Error(details || `Cloudflare API returned HTTP ${response.status}`);
  }
  return payload.result;
}

async function ensureZeusDatabase(accountId: string, token: string, name: string): Promise<D1Database> {
  try {
    return await cfJson<D1Database>(`/accounts/${accountId}/d1/database`, token, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  } catch {
    const existing = await cfJson<D1Database[]>(
      `/accounts/${accountId}/d1/database?per_page=100`,
      token,
    );
    const database = existing.find((item) => item.name === name);
    if (!database) throw new Error("ساخت دیتابیس D1 ناموفق بود؛ دسترسی D1 Edit را بررسی کنید.");
    return database;
  }
}

async function ensureWorkersSubdomain(accountId: string, token: string): Promise<string> {
  try {
    const existing = await cfJson<WorkerSubdomain>(`/accounts/${accountId}/workers/subdomain`, token);
    if (existing.subdomain) return existing.subdomain;
  } catch {
    // If the account has no workers.dev subdomain yet, create one below.
  }

  const requestedSubdomain = `peperouny-${accountId.slice(0, 8).toLowerCase()}`;
  const created = await cfJson<WorkerSubdomain>(`/accounts/${accountId}/workers/subdomain`, token, {
    method: "PUT",
    body: JSON.stringify({ subdomain: requestedSubdomain }),
  });
  if (!created.subdomain) throw new Error("ساخت زیردامنه workers.dev در حساب Cloudflare انجام نشد.");
  return created.subdomain;
}

async function enableWorkerSubdomain(accountId: string, token: string, scriptName: string): Promise<void> {
  const result = await cfJson<ScriptSubdomain>(
    `/accounts/${accountId}/workers/scripts/${scriptName}/subdomain`,
    token,
    { method: "POST", body: JSON.stringify({ enabled: true }) },
  );
  if (!result.enabled) throw new Error("فعال‌سازی آدرس workers.dev برای Worker ناموفق بود.");
}

async function uploadZeusWorker(
  accountId: string,
  token: string,
  scriptName: string,
  databaseId: string,
  source: string,
): Promise<void> {
  const metadata = {
    main_module: "worker.js",
    compatibility_date: "2026-11-11",
    bindings: [{ type: "d1", name: "DB", id: databaseId }],
  };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }), "metadata.json");
  form.append("worker.js", new Blob([source], { type: "application/javascript+module" }), "worker.js");

  const response = await fetch(
    `${CLOUDFLARE_API}/accounts/${accountId}/workers/scripts/${scriptName}`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: AbortSignal.timeout(120_000),
    },
  );
  const payload = await response.json() as CfEnvelope<unknown>;
  if (!response.ok || !payload.success) {
    throw new Error("آپلود Worker در Cloudflare ناموفق بود؛ دسترسی Workers Scripts Edit را بررسی کنید.");
  }
}

export type ZeusDeploymentResult = {
  project: "zeus";
  scriptName: string;
  databaseName: string;
  databaseId: string;
  workerUrl: string | null;
  steps: string[];
};

export async function deployZeus(accountId: string, token: string): Promise<ZeusDeploymentResult> {
  const steps: string[] = [];
  const scriptName = `${ZEUS_WORKER_PREFIX}-${accountId.slice(0, 6).toLowerCase()}`;
  const databaseName = `${ZEUS_WORKER_PREFIX}-db`;

  const verification = await cfJson<{ status: string }>("/user/tokens/verify", token);
  if (verification.status !== "active") throw new Error("توکن Cloudflare فعال نیست.");
  steps.push("Cloudflare token verified");

  const sourceResponse = await fetch(ZEUS_SOURCE_URL, { signal: AbortSignal.timeout(45_000) });
  if (!sourceResponse.ok) throw new Error("دریافت Source.js رسمی ZEUS ناموفق بود.");
  const source = await sourceResponse.text();
  if (!source.includes("export default") || !source.includes("env.DB")) {
    throw new Error("نسخه دریافت‌شده ZEUS ساختار Worker مورد انتظار را ندارد.");
  }
  steps.push("Official ZEUS Worker source fetched");

  const database = await ensureZeusDatabase(accountId, token, databaseName);
  steps.push("D1 database ready");

  await uploadZeusWorker(accountId, token, scriptName, database.uuid, source);
  steps.push("Worker uploaded with DB binding");

  const accountSubdomain = await ensureWorkersSubdomain(accountId, token);
  steps.push("workers.dev account subdomain ready");

  await enableWorkerSubdomain(accountId, token, scriptName);
  steps.push("Worker workers.dev route enabled");

  const workerUrl = `https://${scriptName}.${accountSubdomain}.workers.dev`;

  return {
    project: "zeus",
    scriptName,
    databaseName: database.name,
    databaseId: database.uuid,
    workerUrl,
    steps,
  };
}
