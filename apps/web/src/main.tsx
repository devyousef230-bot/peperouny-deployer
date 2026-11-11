import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

type Account = { id: string; name: string };
type ConnectionState = { connected: boolean; accountId?: string | null; accounts?: Account[] };
const projects = [
  { id: "zeus", name: "ZEUS", detail: "Telegram panel deployment", target: "Adapter in progress" },
  { id: "nexus", name: "NEXUS", detail: "Cloudflare Worker core", target: "Adapter in progress" },
  { id: "nova", name: "NOVA PROXY", detail: "Worker · KV · D1", target: "Workers only" },
];

function App() {
  const [token, setToken] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(true);
  const [status, setStatus] = useState("");
  const [selectedProject, setSelectedProject] = useState("zeus");
  const [deployBusy, setDeployBusy] = useState(false);
  const [deployOutput, setDeployOutput] = useState("");

  useEffect(() => {
    fetch("/api/cloudflare/status")
      .then(async (response) => {
        if (!response.ok) throw new Error("status");
        return response.json() as Promise<ConnectionState>;
      })
      .then((data) => {
        setConnected(data.connected);
        setAccounts(data.accounts ?? []);
        setSelectedAccount(data.accountId ?? "");
        if (data.connected) setStatus("اتصال Cloudflare ذخیره شده و آماده استفاده است.");
      })
      .catch(() => setStatus("وضعیت اتصال قابل دریافت نیست. سرور Deployer را بررسی کنید."))
      .finally(() => setBusy(false));
  }, []);

  async function connect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/cloudflare/connect", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await response.json() as { success: boolean; message?: string; accounts?: Account[]; accountId?: string };
      if (!response.ok || !data.success) throw new Error(data.message || "اتصال برقرار نشد.");
      setAccounts(data.accounts ?? []);
      setSelectedAccount(data.accountId ?? "");
      setConnected(true);
      setToken("");
      setStatus("توکن بررسی و به‌صورت رمزنگاری‌شده ذخیره شد.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "اتصال انجام نشد.");
    } finally { setBusy(false); }
  }

  async function chooseAccount(accountId: string) {
    setSelectedAccount(accountId);
    try {
      const response = await fetch("/api/cloudflare/account", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      if (!response.ok) throw new Error("ذخیره حساب انجام نشد.");
      setStatus("حساب انتخاب‌شده ذخیره شد و برای دفعات بعد باقی می‌ماند.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "خطا در ذخیره حساب."); }
  }

  async function deploySelected() {
    if (!connected || !selectedAccount) {
      setStatus("ابتدا Cloudflare را متصل و حساب را انتخاب کنید.");
      return;
    }
    if (selectedProject !== "zeus") {
      setStatus("Adapter این پروژه هنوز آماده نشده است.");
      return;
    }
    if (!window.confirm("ZEUS روی حساب Cloudflare انتخاب‌شده Deploy شود؟")) return;
    setDeployBusy(true);
    setDeployOutput("");
    setStatus("در حال ساخت منابع و انتشار ZEUS...");
    try {
      const response = await fetch("/api/deploy", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: selectedProject }),
      });
      const data = await response.json() as {
        success: boolean; message?: string;
        deployment?: { scriptName: string; databaseName: string; workerUrl: string | null; steps: string[] };
      };
      if (!response.ok || !data.success || !data.deployment) throw new Error(data.message || "Deploy ناموفق بود.");
      const result = data.deployment;
      setDeployOutput([
        ...result.steps.map((step) => "✓ " + step),
        "Worker: " + result.scriptName,
        "D1: " + result.databaseName,
        result.workerUrl ? "URL: " + result.workerUrl : "workers.dev برای این حساب هنوز فعال نیست.",
      ].join("\\n"));
      setStatus("فرایند Deploy ZEUS با موفقیت به پایان رسید.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "خطا در Deploy.");
    } finally { setDeployBusy(false); }
  }

  async function disconnect() {
    if (!window.confirm("توکن ذخیره‌شده از این سرور حذف شود؟")) return;
    const response = await fetch("/api/cloudflare/connect", { method: "DELETE" });
    if (response.ok) {
      setConnected(false); setAccounts([]); setSelectedAccount(""); setStatus("توکن ذخیره‌شده حذف شد.");
    } else setStatus("حذف توکن انجام نشد.");
  }

  return <main className="shell">
    <header><div className="mark">P</div><strong>PEPEROUNY <span>DEPLOYER</span></strong><small><i /> DEPLOY CONTROL</small></header>
    <section className="hero">
      <p className="eyebrow">YOUR CLOUDFLARE DEPLOYMENT CONTROL CENTER</p>
      <h1>Pick a project.<br /><span>We deploy it.</span></h1>
      <p className="intro">One Cloudflare connection. Choose a project and let Peperouny handle its deployment.</p>
    </section>
    <section className="panel connection">
      <div className="panel-head"><div><p className="eyebrow">CLOUDFLARE CREDENTIAL</p><h2>{connected ? "Cloudflare connected" : "Connect once"}</h2></div><small>{busy ? "CHECKING..." : connected ? "SAVED" : "NOT CONNECTED"}</small></div>
      {connected ? <>
        <p className="connected-copy">توکن شما روی سرور رمزنگاری‌شده ذخیره شده؛ برای Deployهای بعدی نیازی به واردکردن دوباره آن نیست.</p>
        <label className="field-label" htmlFor="cf-account">Cloudflare account</label>
        <select id="cf-account" value={selectedAccount} onChange={(event) => chooseAccount(event.target.value)}>
          <option value="">Choose an account</option>
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
        </select>
        <button className="secondary-button" type="button" onClick={disconnect}>Remove saved token</button>
      </> : <form onSubmit={connect}>
        <label className="field-label" htmlFor="cf-token">Cloudflare API Token</label>
        <div className="token-row">
          <input id="cf-token" type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Paste token once" required />
          <button type="submit" disabled={busy || !token.trim()}>{busy ? "Checking..." : "Connect Cloudflare"}</button>
        </div>
        <p className="hint">توکن فقط به API خود Deployer ارسال و رمزنگاری‌شده ذخیره می‌شود؛ در مرورگر یا GitHub نگهداری نمی‌شود.</p>
      </form>}
      {status && <p className="status" role="status">{status}</p>}
    </section>
    <section className="panel">
      <div className="panel-head"><div><p className="eyebrow">DEPLOYMENT CATALOG</p><h2>Choose what to deploy</h2></div><small>03 PROJECTS</small></div>
      <div className="project-grid">
        {projects.map((project) => <button type="button" className={selectedProject === project.id ? "project-card selected" : "project-card"} key={project.id} onClick={() => setSelectedProject(project.id)}>
          <span className="project-mark">{project.name[0]}</span><b>{project.name}</b><p>{project.detail}</p><small>{project.target}</small>
        </button>)}
      </div>
      <div className="deploy-actions">
        <button type="button" className="deploy-button" onClick={deploySelected} disabled={!connected || deployBusy || selectedProject !== "zeus"}>
          {deployBusy ? "Deploying ZEUS..." : selectedProject === "zeus" ? "Deploy ZEUS" : "Adapter coming soon"}
        </button>
      </div>
      {deployOutput && <pre className="deploy-output">{deployOutput}</pre>}
      <p className="note">در این مرحله Adapter اولیه ZEUS فعال است. Nexus و Nova بعد از تکمیل Adapter مستقل خودشان فعال می‌شوند.</p>
    </section>
    <footer>PEPEROUNY DEPLOYER <span>·</span> SELF-HOSTED CONTROL PLANE</footer>
  </main>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
