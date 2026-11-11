import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

type Account = { id: string; name: string };

const projects = [
  { id: "ZEUS", detail: "Telegram panel deployment", target: "Adapter planned" },
  { id: "NEXUS", detail: "Cloudflare Worker core", target: "Adapter planned" },
  { id: "NOVA PROXY", detail: "Worker · KV · D1", target: "Adapter planned" },
];

function App() {
  const [token, setToken] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);

  async function verifyToken(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    setConnected(false);
    setAccounts([]);
    setSelectedAccount("");
    try {
      const response = await fetch("/api/cloudflare/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await response.json() as {
        success: boolean; message?: string; accounts?: Account[];
      };
      if (!response.ok || !data.success) throw new Error(data.message || "اتصال برقرار نشد.");
      setAccounts(data.accounts ?? []);
      setConnected(true);
      setStatus(data.accounts?.length ? "توکن معتبر است و حساب‌ها دریافت شدند." : "توکن معتبر است؛ حسابی برای این توکن پیدا نشد.");
      setToken("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "خطای ناشناخته در اتصال.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="shell">
    <header><div className="mark">P</div><strong>PEPEROUNY <span>DEPLOYER</span></strong><small><i /> SYSTEM ONLINE</small></header>
    <section className="hero">
      <p className="eyebrow">CLOUDFLARE DEPLOYMENT CONTROL CENTER</p>
      <h1>Deploy without<br /><span>the busywork.</span></h1>
      <p className="intro">One control panel for deploying and managing your Cloudflare projects.</p>
    </section>
    <section className="panel connection">
      <div className="panel-head"><div><p className="eyebrow">CLOUDFLARE ACCOUNT</p><h2>Connect your account</h2></div><small>{connected ? "CONNECTED" : "NOT CONNECTED"}</small></div>
      <form onSubmit={verifyToken}>
        <label className="field-label" htmlFor="cf-token">API Token</label>
        <div className="token-row">
          <input id="cf-token" type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Paste your Cloudflare API Token" required />
          <button type="submit" disabled={busy || !token.trim()}>{busy ? "Checking..." : "Verify token"}</button>
        </div>
      </form>
      <p className="hint">Token is sent to the backend for verification and is not saved by this dashboard. Use a token with permission to read account details.</p>
      {status && <p className={connected ? "status success" : "status error"} role="status">{status}</p>}
      {accounts.length > 0 && <div className="account-picker">
        <label className="field-label" htmlFor="cf-account">Select account</label>
        <select id="cf-account" value={selectedAccount} onChange={(event) => setSelectedAccount(event.target.value)}>
          <option value="">Choose a Cloudflare account</option>
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.id}</option>)}
        </select>
        {selectedAccount && <p className="hint">Account selected. Deployment actions will be enabled in the next step.</p>}
      </div>}
    </section>
    <section className="panel">
      <div className="panel-head"><div><p className="eyebrow">YOUR WORKSPACE</p><h2>Project adapters</h2></div><small>03 PROJECTS</small></div>
      {projects.map(project => <article className="project" key={project.id}>
        <div className="project-mark">{project.id[0]}</div><div className="project-info"><b>{project.id}</b><p>{project.detail}</p></div><label>{project.target}</label>
      </article>)}
      <p className="note">Project-specific deployment adapters are the next implementation step.</p>
    </section>
    <footer>PEPEROUNY DEPLOYER <span>·</span> EARLY DEVELOPMENT</footer>
  </main>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
