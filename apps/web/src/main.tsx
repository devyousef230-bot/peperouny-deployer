import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

type Account = { id: string; name: string };
type ConnectionState = { connected: boolean; accountId?: string | null; accounts?: Account[] };
const CLOUDFLARE_TOKEN_URL = "https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22workers_scripts%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_settings%22%2C%22type%22%3A%22read%22%7D%5D&accountId=%2A&name=Peperouny%20Hello%20World";

function App() {
  const [token, setToken] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(true);
  const [deployBusy, setDeployBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [deployOutput, setDeployOutput] = useState("");

  useEffect(() => {
    fetch("/api/cloudflare/status")
      .then(async response => {
        if (!response.ok) throw new Error("status");
        return response.json() as Promise<ConnectionState>;
      })
      .then(data => {
        setConnected(data.connected);
        setAccounts(data.accounts ?? []);
        setSelectedAccount(data.accountId ?? "");
        if (data.connected) setStatus("اتصال Cloudflare ذخیره شده و آماده است.");
      })
      .catch(() => setStatus("وضعیت اتصال قابل دریافت نیست. سرور را بررسی کنید."))
      .finally(() => setBusy(false));
  }, []);

  async function connect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/cloudflare/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await response.json() as {
        success: boolean; message?: string; accounts?: Account[]; accountId?: string;
      };
      if (!response.ok || !data.success) throw new Error(data.message || "اتصال برقرار نشد.");
      setAccounts(data.accounts ?? []);
      setSelectedAccount(data.accountId ?? "");
      setConnected(true);
      setToken("");
      setStatus("توکن بررسی و به‌صورت رمزنگاری‌شده ذخیره شد.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "اتصال انجام نشد.");
    } finally {
      setBusy(false);
    }
  }

  async function chooseAccount(accountId: string) {
    setSelectedAccount(accountId);
    try {
      const response = await fetch("/api/cloudflare/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      const data = await response.json() as { success: boolean; message?: string };
      if (!response.ok || !data.success) throw new Error(data.message || "ذخیره حساب انجام نشد.");
      setStatus("حساب انتخاب‌شده ذخیره شد.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "خطا در ذخیره حساب.");
    }
  }

  async function createHelloWorld() {
    if (!connected || !selectedAccount) {
      setStatus("ابتدا Cloudflare را متصل و حساب را انتخاب کنید.");
      return;
    }
    if (!window.confirm("یک Worker ساده با پاسخ Hello, world! در حساب انتخاب‌شده ساخته شود؟")) return;
    setDeployBusy(true);
    setDeployOutput("");
    setStatus("در حال ساخت و انتشار Hello World Worker...");
    try {
      const response = await fetch("/api/deploy/hello-world", { method: "POST" });
      const data = await response.json() as {
        success: boolean; message?: string;
        deployment?: { scriptName: string; workerUrl: string; steps: string[]; health: string };
      };
      if (!response.ok || !data.success || !data.deployment) {
        throw new Error(data.message || "ساخت Worker ناموفق بود.");
      }
      const result = data.deployment;
      setDeployOutput([
        ...result.steps.map(step => "✓ " + step),
        "Worker: " + result.scriptName,
        "URL: " + result.workerUrl,
        "",
        "Live response:",
        result.health,
      ].join("\n"));
      setStatus("Hello World Worker ساخته شد و پاسخ زنده آن بررسی شد.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "خطا در ساخت Worker.");
    } finally {
      setDeployBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("توکن ذخیره‌شده از این سرور حذف شود؟")) return;
    const response = await fetch("/api/cloudflare/connect", { method: "DELETE" });
    if (response.ok) {
      setConnected(false);
      setAccounts([]);
      setSelectedAccount("");
      setStatus("توکن ذخیره‌شده حذف شد.");
    } else {
      setStatus("حذف توکن انجام نشد.");
    }
  }

  return <main className="shell">
    <header><div className="mark">P</div><strong>PEPEROUNY <span>DEPLOYER</span></strong><small><i /> WORKER STARTER</small></header>
    <section className="hero">
      <p className="eyebrow">YOUR CLOUDFLARE WORKER STARTER</p>
      <h1>Start simple.<br /><span>Deploy one Worker.</span></h1>
      <p className="intro">Connect Cloudflare once, then create a working Hello World Worker with one click.</p>
    </section>
    <section className="panel connection">
      <div className="panel-head"><div><p className="eyebrow">CLOUDFLARE CREDENTIAL</p><h2>{connected ? "Cloudflare connected" : "Connect Cloudflare"}</h2></div><small>{busy ? "CHECKING..." : connected ? "SAVED" : "NOT CONNECTED"}</small></div>
      {connected ? <>
        <p className="connected-copy">توکن روی سرور رمزنگاری‌شده ذخیره شده و برای اجرای بعدی لازم نیست دوباره وارد شود.</p>
        <label className="field-label" htmlFor="cf-account">Cloudflare account</label>
        <select id="cf-account" value={selectedAccount} onChange={event => chooseAccount(event.target.value)}>
          <option value="">Choose an account</option>
          {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
        </select>
        <button className="secondary-button" type="button" onClick={disconnect}>Remove saved token</button>
      </> : <form onSubmit={connect}>
        <a className="token-link" href={CLOUDFLARE_TOKEN_URL} target="_blank" rel="noreferrer">ساخت API Token با دسترسی‌های لازم در Cloudflare ↗</a>
        <label className="field-label" htmlFor="cf-token">Cloudflare API Token</label>
        <div className="token-row">
          <input id="cf-token" type="password" autoComplete="off" value={token} onChange={event => setToken(event.target.value)} placeholder="Paste token once" required />
          <button type="submit" disabled={busy || !token.trim()}>{busy ? "Checking..." : "Connect Cloudflare"}</button>
        </div>
        <p className="hint">توکن فقط به API خود Deployer ارسال می‌شود و در GitHub قرار نمی‌گیرد.</p>
      </form>}
      {status && <p className="status" role="status">{status}</p>}
    </section>
    <section className="panel">
      <div className="panel-head"><div><p className="eyebrow">FIRST DEPLOYMENT</p><h2>Hello World Worker</h2></div><small>ONE CLICK</small></div>
      <p className="connected-copy">یک Cloudflare Worker ساده ساخته می‌شود که پاسخ JSON شامل پیام Hello, world! برمی‌گرداند. سپس Peperouny آدرس عمومی آن را باز می‌کند و پاسخ واقعی را تست می‌کند.</p>
      <div className="deploy-actions">
        <button type="button" className="deploy-button" onClick={createHelloWorld} disabled={!connected || !selectedAccount || deployBusy}>
          {deployBusy ? "Creating Worker..." : "Create Hello World Worker"}
        </button>
      </div>
      {deployOutput && <pre className="deploy-output">{deployOutput}</pre>}
      <p className="note">این مرحله فقط یک Worker آزمایشی و بی‌خطر می‌سازد؛ پروژه‌های دیگر تا زمان بررسی مستقل فعال نمی‌شوند.</p>
    </section>
    <footer>PEPEROUNY DEPLOYER <span>·</span> CLOUDFLARE WORKER STARTER</footer>
  </main>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
