"use client";

import {
  ArrowRight, Bot, Box, Check, ChevronRight, Code2, Download, FolderTree,
  GitBranch, Hammer, Monitor, Search, ShieldCheck, Sparkles, TerminalSquare,
} from "lucide-react";
import type { ReactNode } from "react";
import Link from "next/link";
import { changelog, release } from "./releases";

const nav = [["Product", "/#capabilities"], ["Download", "/download"], ["Changelog", "/changelog"], ["Docs", "/docs"]] as const;

export function Shell({ children }: { children: ReactNode }) {
  return <div className="site-shell">
    <header className="nav-wrap">
      <Link className="brand" href="/" aria-label="Forge home"><span className="brand-mark"><Hammer size={17} strokeWidth={2.25} /></span><span>FORGE</span></Link>
      <nav className="nav-links" aria-label="Primary navigation">{nav.map(([label, href]) => <a key={href} href={href}>{label}</a>)}</nav>
      <a className="nav-download" href="/download">Download <ArrowRight size={14} /></a>
    </header>
    {children}<Footer />
  </div>;
}

export function HomePage() {
  return <Shell><main>
    <section className="hero page-pad">
      <div className="hero-glow" /><div className="eyebrow"><span className="live-dot" /> FORGE BETA IS NOW AVAILABLE</div>
      <h1>Where ideas become<br /><span>working software.</span></h1>
      <p className="hero-copy">One focused desktop for your AI agents, code, browser, terminal, and Git. From a request to a verified result—without losing the thread.</p>
      <div className="hero-actions"><a className="button button-primary" href={release.downloads.windows.available ? release.downloads.windows.href : "/download"} download={release.downloads.windows.available}><Download size={17} /> {release.downloads.windows.available ? "Download for Windows" : "View download status"}</a><a className="button button-secondary" href="/docs">Read the docs <ArrowRight size={16} /></a></div>
      <div className="hero-meta"><span><Check size={13} /> Free beta</span><span><Check size={13} /> Windows 10+</span><span>v{release.version}</span></div>
      <WorkspaceMockup />
    </section>

    <section className="trust-strip page-pad"><p>One loop. Every tool you need.</p><div className="workflow"><span>ASK</span><i /><span>CODE</span><i /><span>RUN</span><i /><span>SEE</span><i /><span>INSPECT</span><i /><span>FIX</span><i /><span>VERIFY</span></div></section>

    <section className="section page-pad" id="capabilities"><div className="section-heading"><span className="kicker">BUILT FOR THE WHOLE LOOP</span><h2>Less context switching.<br />More finished work.</h2><p>Forge gives your agent the tools to understand a project, make precise changes, and prove that they work.</p></div>
      <div className="feature-grid">
        <Feature icon={<Bot />} number="01" title="Agent at the center" copy="Work with Grok today, with Codex and Claude support designed into the workspace." />
        <Feature icon={<Code2 />} number="02" title="Code in context" copy="A real project explorer and editor keep every change visible, reviewable, and grounded in your codebase." />
        <Feature icon={<TerminalSquare />} number="03" title="Run the work" copy="Your agent can install, build, test, and debug with an integrated terminal—under your control." />
        <Feature icon={<Monitor />} number="04" title="See the result" copy="Open local apps in the embedded browser, inspect the interface, and close the feedback loop." />
        <Feature icon={<Search />} number="05" title="Inspect precisely" copy="Read the live DOM, investigate visual issues, and target the element that actually needs attention." />
        <Feature icon={<GitBranch />} number="06" title="Ship with confidence" copy="Review diffs, track the work, and commit a verified result without leaving your workspace." />
      </div>
    </section>

    <section className="section agent-section page-pad"><div className="agent-copy"><span className="kicker">BRING YOUR AGENT</span><h2>Your model.<br />A better workshop.</h2><p>Forge is the place where agents gain hands: project access, tools, feedback, and a clear record of what happened.</p><a className="text-link" href="/docs#agents">Explore agent setup <ArrowRight size={15} /></a></div><div className="agent-list"><AgentRow name="Grok" status="Available now" icon="G" active /><AgentRow name="OpenAI Codex" status="Coming soon" icon="◎" /><AgentRow name="Claude" status="Coming soon" icon="A" /></div></section>

    <section className="section page-pad"><div className="split-panel"><div className="panel-copy"><span className="kicker">BROWSER WORKSPACE</span><h2>Build it.<br />Then look at it.</h2><p>Forge detects your local development server and opens it beside your code. Your agent can inspect what rendered—not just what compiled.</p><ul><li><Check /> Automatic localhost detection</li><li><Check /> Embedded browser tabs</li><li><Check /> DOM and UI inspection</li></ul></div><BrowserCard /></div></section>

    <section className="download-cta page-pad"><div className="cta-spark"><Sparkles /></div><span className="kicker">START FORGING</span><h2>Turn your next idea<br />into working software.</h2><p>Forge is preparing its public Windows download. macOS and Linux are next.</p><a className="button button-light" href={release.downloads.windows.available ? release.downloads.windows.href : "/download"} download={release.downloads.windows.available}><Download size={17} /> {release.downloads.windows.available ? `Download Forge v${release.version}` : "View download status"}</a></section>
  </main></Shell>;
}

export function DownloadPage() {
  return <Shell><main className="inner-page page-pad"><div className="page-intro"><span className="kicker">DOWNLOAD</span><h1>Forge for your desktop.</h1><p>Install the latest beta and bring your agent, code, browser, and tools into one focused workspace.</p></div>
    <div className="recommended-callout"><Monitor /><div><span className="kicker">RECOMMENDED FOR THIS DEVICE</span><h2 id="recommended-title">Windows</h2><p id="recommended-detail">Windows 10 or later · 64-bit</p></div><a id="recommended-link" className="button button-primary" href={release.downloads.windows.href} download><Download size={17} /> Download</a></div>
    <div className="platform-grid">{Object.entries(release.downloads).map(([key, item]) => <article className={`platform-card ${item.available ? "available" : ""}`} key={key} data-platform={key}><span className="platform-icon">{key === "windows" ? "⊞" : key === "macos" ? "●" : "◆"}</span><h2>{item.label}</h2><p>{item.detail}</p><span className="version">v{release.version} · {release.channel}</span>{item.available ? <a className="button button-secondary" href={item.href} download><Download size={16} /> {item.filename}</a> : <button className="button button-disabled" disabled>Coming soon</button>}</article>)}</div>
    <div className="download-notes"><div><ShieldCheck /><h3>Install with confidence</h3><p>Forge asks before running mutating actions and keeps the desktop runtime separated from the interface.</p></div><div><Box /><h3>What you get</h3><p>A standard Windows installer with the complete Forge desktop app. No account is required for the beta.</p></div></div>
  </main><PlatformDetector /></Shell>;
}

function PlatformDetector() {
  return <script dangerouslySetInnerHTML={{ __html: `(()=>{const u=navigator.userAgent.toLowerCase();const p=u.includes('mac')?'macos':u.includes('linux')?'linux':'windows';const data=${JSON.stringify(release.downloads)}[p];const title=document.getElementById('recommended-title');const detail=document.getElementById('recommended-detail');const link=document.getElementById('recommended-link');if(title&&detail&&link){title.textContent=data.label;detail.textContent=data.detail;if(data.available){link.setAttribute('href',data.href)}else{link.textContent='Coming soon';link.removeAttribute('href');link.classList.add('button-disabled')}}document.querySelector('[data-platform="'+p+'"]')?.classList.add('detected')})()` }} />;
}

export function ChangelogPage() {
  return <Shell><main className="inner-page page-pad"><div className="page-intro"><span className="kicker">CHANGELOG</span><h1>What we’re forging.</h1><p>New capabilities, sharper workflows, and fixes in every Forge release.</p></div><div className="changelog-list">{changelog.map((entry) => <article className="release-entry" key={entry.version}><aside><span className="release-version">v{entry.version}</span><span>{entry.channel}</span><time>{entry.date}</time></aside><div>{entry.groups.map((group) => <section key={group.title}><h2>{group.title}</h2><ul>{group.items.map((item) => <li key={item}><span>+</span>{item}</li>)}</ul></section>)}</div></article>)}</div></main></Shell>;
}

const docSections = [
  { id: "getting-started", title: "Getting started", body: "Install Forge, add your xAI API key in Settings, then open the project folder you want to work on." },
  { id: "open-project", title: "Open a project", body: "Choose Open a folder from the welcome screen. Forge keeps recent projects close and restores your workspace as you move between them." },
  { id: "agents", title: "Connect an AI agent", body: "The beta supports Grok through an xAI API key. Provider credentials stay in the desktop runtime and are never exposed to the renderer." },
  { id: "workspace", title: "Use the workspace", body: "Ask in chat, follow tool activity, review code in the editor, run commands in the terminal, and preview local apps in the embedded browser." },
  { id: "browser", title: "Browser and inspector", body: "When Forge detects a local development URL, open it in the browser pane. Use the inspector to give your agent grounded UI context." },
  { id: "troubleshooting", title: "Troubleshooting", body: "If an agent will not connect, verify the API key and model in Settings. If a project tool fails, review the activity detail and retry the operation." },
] as const;

export function DocsPage() {
  return <Shell><main className="docs-layout page-pad"><aside className="docs-nav"><span className="kicker">DOCUMENTATION</span>{docSections.map((s) => <a href={`#${s.id}`} key={s.id}>{s.title}</a>)}</aside><article className="docs-content"><div className="page-intro"><h1>Start building with Forge.</h1><p>A short guide to moving from installation to a verified change.</p></div>{docSections.map((s, i) => <section id={s.id} key={s.id}><span className="doc-number">0{i + 1}</span><h2>{s.title}</h2><p>{s.body}</p>{i === 0 ? <div className="code-block"><span>1</span> Download and install Forge<br /><span>2</span> Open Settings → add XAI_API_KEY<br /><span>3</span> Open a project folder<br /><span>4</span> Ask Forge to make a change</div> : null}</section>)}</article></main></Shell>;
}

export function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const privacy = kind === "privacy";
  const sections = privacy ? [["What Forge stores", "Forge stores your settings, recent projects, and workspace state locally on your device. API keys are handled by the desktop runtime and are not included in the website."], ["Your project data", "Forge accesses only the folders you choose. When you use an AI provider, relevant prompts and project context may be sent to that provider according to its terms and privacy policy."], ["Website data", "This initial website does not require an account and does not use advertising cookies. Basic hosting logs may be processed for security and reliability."], ["Your choices", "You can remove local Forge data by uninstalling the app and deleting its application-data folder. You can revoke provider keys from the provider dashboard at any time."]] : [["Beta software", "Forge is currently beta software. Features may change and unexpected errors may occur. Keep backups and review changes before committing them."], ["Your responsibilities", "You are responsible for the projects, commands, credentials, and third-party services you connect to Forge. Review requested permissions before allowing mutating actions."], ["Third-party services", "AI providers, repositories, and other connected tools are governed by their own terms. Forge does not control those services."], ["Availability", "The beta is provided as-is while we improve reliability and distribution. We may update, suspend, or discontinue beta functionality."]];
  return <Shell><main className="legal-page page-pad"><div className="page-intro"><span className="kicker">LEGAL</span><h1>{privacy ? "Privacy policy" : "Terms of use"}</h1><p>Last updated August 13, 2026 · Forge public beta</p></div>{sections.map(([title, body]) => <section key={title}><h2>{title}</h2><p>{body}</p></section>)}<p className="legal-note">This plain-language beta policy is an initial product notice and should be reviewed by qualified counsel before broad commercial distribution.</p></main></Shell>;
}

function Feature({ icon, number, title, copy }: { icon: ReactNode; number: string; title: string; copy: string }) { return <article className="feature-card"><div className="feature-top"><span className="feature-icon">{icon}</span><span>{number}</span></div><h3>{title}</h3><p>{copy}</p><ChevronRight className="feature-arrow" /></article>; }
function AgentRow({ name, status, icon, active = false }: { name: string; status: string; icon: string; active?: boolean }) { return <div className={`agent-row ${active ? "active" : ""}`}><span className="agent-icon">{icon}</span><strong>{name}</strong><span>{status}</span>{active ? <span className="status-dot" /> : <span className="soon">SOON</span>}</div>; }

function WorkspaceMockup() {
  return <div className="workspace-frame"><div className="window-bar"><div><span /><span /><span /></div><span>FORGE — phumi-website</span><span>● Beta</span></div><div className="workspace-body"><aside className="rail"><Hammer /><FolderTree /><Search /><GitBranch /></aside><div className="files"><small>EXPLORER</small><strong>PHUMI-WEBSITE</strong><p>⌄ app</p><p className="selected">&nbsp;&nbsp;page.tsx</p><p>&nbsp;&nbsp;layout.tsx</p><p>&nbsp;&nbsp;globals.css</p><p>› components</p><p>› public</p></div><div className="editor"><div className="tabs"><span>page.tsx</span><span>Hero.tsx</span></div><pre><i>1</i> <b>export default</b> function Home() &#123;<br/><i>2</i>&nbsp;&nbsp;<b>return</b> (<br/><i>3</i>&nbsp;&nbsp;&nbsp;&nbsp;&lt;<em>main</em> className=&quot;forge&quot;&gt;<br/><i>4</i>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&lt;<em>Hero</em><br/><i>5</i>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;title=&quot;Build what&apos;s next.&quot;<br/><i>6</i>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;status=&quot;ready&quot;<br/><i>7</i>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;/&gt;<br/><i>8</i>&nbsp;&nbsp;&nbsp;&nbsp;&lt;/<em>main</em>&gt;<br/><i>9</i>&nbsp;&nbsp;);<br/><i>10</i>&#125;</pre><div className="terminal"><small>TERMINAL</small><p><span>PS</span> npm run build</p><p className="success">✓ Compiled successfully in 1.8s</p><p><span>PS</span> _</p></div></div><aside className="chat"><small>FORGE AGENT</small><div className="user-bubble">Build a polished landing page and verify it locally.</div><div className="agent-message"><Sparkles /> I’ll inspect the project, shape the page, then run a production build.</div><div className="tool-row"><Check /> Read project files</div><div className="tool-row"><Check /> Update landing page</div><div className="tool-row live"><span /> Running build</div></aside></div></div>;
}

function BrowserCard() { return <div className="browser-card"><div className="browser-top"><span>‹</span><span>›</span><span>↻</span><div>localhost:3000</div></div><div className="browser-content"><div className="browser-nav"><span className="mini-brand"><Hammer /> FORGE</span><span>Product&nbsp;&nbsp;&nbsp; Download</span></div><div className="browser-hero"><span>ONE AI DESKTOP</span><h3>Build what&apos;s next.</h3><p>Code, run, inspect, and verify.</p><button>Download Forge</button></div><div className="inspector-tip"><Search /><span>div.browser-hero</span><b>1240 × 486</b></div></div></div>; }
function Footer() { return <footer className="footer page-pad"><div className="footer-top"><div><Link className="brand" href="/"><span className="brand-mark"><Hammer size={17} /></span><span>FORGE</span></Link><p>One AI desktop for your work.</p></div><div><strong>Product</strong><Link href="/#capabilities">Capabilities</Link><Link href="/download">Download</Link><Link href="/changelog">Changelog</Link></div><div><strong>Learn</strong><Link href="/docs">Documentation</Link><Link href="/docs#agents">Agents</Link><Link href="/docs#troubleshooting">Troubleshooting</Link></div><div><strong>Legal</strong><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div></div><div className="footer-bottom"><span>© 2026 Forge by Phumi</span><span><span className="live-dot" /> Public beta · v{release.version}</span></div></footer>; }
