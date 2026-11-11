import React from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const projects = [
  { id: "ZEUS", detail: "Telegram panel deployment", target: "Adapter planned" },
  { id: "NEXUS", detail: "Cloudflare Worker core", target: "Adapter planned" },
  { id: "NOVA PROXY", detail: "Worker · KV · D1", target: "Adapter planned" },
];

function App() {
  return <main className="shell">
    <header><div className="mark">P</div><strong>PEPEROUNY <span>DEPLOYER</span></strong><small><i /> SYSTEM ONLINE</small></header>
    <section className="hero">
      <p className="eyebrow">CLOUDFLARE DEPLOYMENT CONTROL CENTER</p>
      <h1>Deploy without<br /><span>the busywork.</span></h1>
      <p className="intro">One control panel for deploying and managing your Cloudflare projects.</p>
    </section>
    <section className="panel">
      <div className="panel-head"><div><p className="eyebrow">YOUR WORKSPACE</p><h2>Project adapters</h2></div><small>03 PROJECTS</small></div>
      {projects.map(project => <article className="project" key={project.id}>
        <div className="project-mark">{project.id[0]}</div><div className="project-info"><b>{project.id}</b><p>{project.detail}</p></div><label>{project.target}</label>
      </article>)}
      <p className="note">Cloudflare connection and deployment actions are the next implementation step.</p>
    </section>
    <footer>PEPEROUNY DEPLOYER <span>·</span> EARLY DEVELOPMENT</footer>
  </main>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
