"use client";

import {
  ArrowRight, Bot, Box, Check, ChevronRight, Code2, Download, FolderTree, GitBranch,
  Hammer, Languages, Monitor, Moon, Search, ShieldCheck, Sparkles, Sun, TerminalSquare,
} from "lucide-react";
import type { ReactNode } from "react";
import Link from "next/link";
import { changelog, release } from "./releases";
import { usePreferences } from "./preferences";

const nav = [["nav.product", "Product", "/#capabilities"], ["nav.download", "Download", "/download"], ["nav.changelog", "Changelog", "/changelog"], ["nav.docs", "Docs", "/docs"]] as const;

export function Shell({ children }: { children: ReactNode }) {
  const { language, theme, t, toggleLanguage, toggleTheme } = usePreferences();
  return <div className="site-shell">
    <header className="nav-wrap">
      <Link className="brand" href="/" aria-label="Forge home"><span className="brand-mark"><Hammer size={17} strokeWidth={2.25} /></span><span>FORGE</span></Link>
      <nav className="nav-links" aria-label="Primary navigation">{nav.map(([key, label, href]) => <a key={href} href={href}>{t(key, label)}</a>)}</nav>
      <div className="nav-actions">
        <button className="preference-button language-toggle" type="button" onClick={toggleLanguage} aria-label={t("nav.language", "Khmer language")}><Languages size={16} /><span>{language === "en" ? "ខ្មែរ" : "EN"}</span></button>
        <button className="preference-button theme-toggle" type="button" onClick={toggleTheme} aria-label={t(theme === "dark" ? "nav.theme.light" : "nav.theme.dark", theme === "dark" ? "Use light mode" : "Use dark mode")}>{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}</button>
        <a className="nav-download" href="/download">{t("nav.download", "Download")} <ArrowRight size={14} /></a>
      </div>
    </header>
    {children}<Footer />
  </div>;
}

export function HomePage() {
  const { t } = usePreferences();
  return <Shell><main>
    <section className="hero page-pad">
      <div className="hero-glow" /><div className="eyebrow"><span className="live-dot" /> {t("home.badge", "FORGE BETA IS NOW AVAILABLE")}</div>
      <h1>{t("home.title.1", "Where ideas become")}<br /><span>{t("home.title.2", "working software.")}</span></h1>
      <p className="hero-copy">{t("home.lead", "One focused desktop for your AI agents, code, browser, terminal, and Git. From a request to a verified result—without losing the thread.")}</p>
      <div className="hero-actions"><a className="button button-primary" href={release.downloads.windows.available ? release.downloads.windows.href : "/download"} download={release.downloads.windows.available}><Download size={17} /> {release.downloads.windows.available ? t("home.downloadWindows", "Download for Windows") : t("home.downloadStatus", "View download status")}</a><a className="button button-secondary" href="/docs">{t("home.readDocs", "Read the docs")} <ArrowRight size={16} /></a></div>
      <div className="hero-meta"><span><Check size={13} /> {t("home.freeBeta", "Free beta")}</span><span><Check size={13} /> {t("home.windows", "Windows 10+")}</span><span>v{release.version}</span></div>
      <WorkspaceMockup />
    </section>
    <section className="trust-strip page-pad"><p>{t("home.loop", "One loop. Every tool you need.")}</p><div className="workflow"><span>{t("home.ask", "ASK")}</span><i /><span>{t("home.code", "CODE")}</span><i /><span>{t("home.run", "RUN")}</span><i /><span>{t("home.see", "SEE")}</span><i /><span>{t("home.inspect", "INSPECT")}</span><i /><span>{t("home.fix", "FIX")}</span><i /><span>{t("home.verify", "VERIFY")}</span></div></section>
    <section className="section page-pad" id="capabilities"><div className="section-heading"><span className="kicker">{t("cap.kicker", "BUILT FOR THE WHOLE LOOP")}</span><h2>{t("cap.title.1", "Less context switching.")}<br />{t("cap.title.2", "More finished work.")}</h2><p>{t("cap.lead", "Forge gives your agent the tools to understand a project, make precise changes, and prove that they work.")}</p></div>
      <div className="feature-grid">
        <Feature icon={<Bot />} number="01" title={t("cap.1.title", "Agent at the center")} copy={t("cap.1.copy", "Work with Grok today, with Codex and Claude support designed into the workspace.")} />
        <Feature icon={<Code2 />} number="02" title={t("cap.2.title", "Code in context")} copy={t("cap.2.copy", "A real project explorer and editor keep every change visible, reviewable, and grounded in your codebase.")} />
        <Feature icon={<TerminalSquare />} number="03" title={t("cap.3.title", "Run the work")} copy={t("cap.3.copy", "Your agent can install, build, test, and debug with an integrated terminal—under your control.")} />
        <Feature icon={<Monitor />} number="04" title={t("cap.4.title", "See the result")} copy={t("cap.4.copy", "Open local apps in the embedded browser, inspect the interface, and close the feedback loop.")} />
        <Feature icon={<Search />} number="05" title={t("cap.5.title", "Inspect precisely")} copy={t("cap.5.copy", "Read the live DOM, investigate visual issues, and target the element that actually needs attention.")} />
        <Feature icon={<GitBranch />} number="06" title={t("cap.6.title", "Ship with confidence")} copy={t("cap.6.copy", "Review diffs, track the work, and commit a verified result without leaving your workspace.")} />
      </div>
    </section>
    <section className="section agent-section page-pad"><div className="agent-copy"><span className="kicker">{t("agent.kicker", "BRING YOUR AGENT")}</span><h2>{t("agent.title.1", "Your model.")}<br />{t("agent.title.2", "A better workshop.")}</h2><p>{t("agent.lead", "Forge is the place where agents gain hands: project access, tools, feedback, and a clear record of what happened.")}</p><a className="text-link" href="/docs#agents">{t("agent.setup", "Explore agent setup")} <ArrowRight size={15} /></a></div><div className="agent-list"><AgentRow name="Grok" status={t("agent.available", "Available now")} icon="G" active /><AgentRow name="OpenAI Codex" status={t("agent.soon", "Coming soon")} icon="◎" /><AgentRow name="Claude" status={t("agent.soon", "Coming soon")} icon="A" /></div></section>
    <section className="section page-pad"><div className="split-panel"><div className="panel-copy"><span className="kicker">{t("browser.kicker", "BROWSER WORKSPACE")}</span><h2>{t("browser.title.1", "Build it.")}<br />{t("browser.title.2", "Then look at it.")}</h2><p>{t("browser.lead", "Forge detects your local development server and opens it beside your code. Your agent can inspect what rendered—not just what compiled.")}</p><ul><li><Check /> {t("browser.1", "Automatic localhost detection")}</li><li><Check /> {t("browser.2", "Embedded browser tabs")}</li><li><Check /> {t("browser.3", "DOM and UI inspection")}</li></ul></div><BrowserCard /></div></section>
    <section className="download-cta page-pad"><div className="cta-spark"><Sparkles /></div><span className="kicker">{t("cta.kicker", "START FORGING")}</span><h2>{t("cta.title.1", "Turn your next idea")}<br />{t("cta.title.2", "into working software.")}</h2><p>{t("cta.lead", "Forge Beta for Windows is ready to download. macOS and Linux are next.")}</p><a className="button button-light" href={release.downloads.windows.available ? release.downloads.windows.href : "/download"} download={release.downloads.windows.available}><Download size={17} /> {release.downloads.windows.available ? `${t("cta.download", "Download Forge")} v${release.version}` : t("home.downloadStatus", "View download status")}</a></section>
  </main></Shell>;
}

export function DownloadPage() {
  const { t } = usePreferences();
  return <Shell><main className="inner-page page-pad"><div className="page-intro"><span className="kicker">{t("download.kicker", "DOWNLOAD")}</span><h1>{t("download.title", "Forge for your desktop.")}</h1><p>{t("download.lead", "Install the latest beta and bring your agent, code, browser, and tools into one focused workspace.")}</p></div>
    <div className="recommended-callout"><Monitor /><div><span className="kicker">{t("download.recommended", "RECOMMENDED FOR THIS DEVICE")}</span><h2 id="recommended-title">Windows</h2><p id="recommended-detail">Windows 10 or later · 64-bit</p></div><a id="recommended-link" className="button button-primary" href={release.downloads.windows.href} download><Download size={17} /> {t("download.button", "Download")}</a></div>
    <div className="platform-grid">{Object.entries(release.downloads).map(([key, item]) => <article className={`platform-card ${item.available ? "available" : ""}`} key={key} data-platform={key}><span className="platform-icon">{key === "windows" ? "⊞" : key === "macos" ? "●" : "◆"}</span><h2>{item.label}</h2><p>{item.detail}</p><span className="version">v{release.version} · {release.channel}</span>{item.available ? <a className="button button-secondary" href={item.href} download><Download size={16} /> {item.filename}</a> : <button className="button button-disabled" disabled>{t("download.soon", "Coming soon")}</button>}</article>)}</div>
    <div className="download-notes"><div><ShieldCheck /><h3>{t("download.confidence", "Install with confidence")}</h3><p>{t("download.confidenceCopy", "Forge asks before running mutating actions and keeps the desktop runtime separated from the interface.")}</p></div><div><Box /><h3>{t("download.get", "What you get")}</h3><p>{t("download.getCopy", "A standard Windows installer with the complete Forge desktop app. No account is required for the beta.")}</p></div></div>
  </main><PlatformDetector /></Shell>;
}

function PlatformDetector() {
  return <script dangerouslySetInnerHTML={{ __html: `(()=>{const u=navigator.userAgent.toLowerCase();const p=u.includes('mac')?'macos':u.includes('linux')?'linux':'windows';const data=${JSON.stringify(release.downloads)}[p];const title=document.getElementById('recommended-title');const detail=document.getElementById('recommended-detail');const link=document.getElementById('recommended-link');if(title&&detail&&link){title.textContent=data.label;detail.textContent=data.detail;if(data.available){link.setAttribute('href',data.href)}else{link.textContent=document.documentElement.lang==='km'?'មកដល់ឆាប់ៗ':'Coming soon';link.removeAttribute('href');link.classList.add('button-disabled')}}document.querySelector('[data-platform="'+p+'"]')?.classList.add('detected')})()` }} />;
}

const khmerChanges = [
  { version: "0.3.0", date: "13 សីហា 2026", channel: "Beta", groups: [{ title: "ថ្មី", items: ["Database workspace សម្រាប់ SQLite, PostgreSQL និង MySQL", "SSH profiles និង remote terminals ក្នុងកម្មវិធី", "Light និង dark themes ដែលរក្សាទុកការកំណត់"] }, { title: "បានកែលម្អ", items: ["Browser sessions និង inspector context", "តំណ និង file references ក្នុងចម្លើយរបស់ agent", "Terminal tabs និង tool activity feedback"] }, { title: "បានកែបញ្ហា", items: ["រក្សា browser preview ពេលប្តូរ workspace tabs", "ពណ៌ theme ស្របគ្នានៅ editor, terminal និង status"] }] },
  { version: "0.2.0", date: "13 សីហា 2026", channel: "Beta", groups: [{ title: "ថ្មី", items: ["Browser workspace ដែលរួមបញ្ចូល", "DOM inspector ក្នុងកម្មវិធី", "កម្មវិធីដំឡើង Windows"] }, { title: "បានកែលម្អ", items: ["ប្តូរគម្រោងលឿនជាងមុន", "Tool activity timeline កាន់តែច្បាស់", "ការអនុញ្ញាត command មានសុវត្ថិភាពជាងមុន"] }, { title: "បានកែបញ្ហា", items: ["Terminal reconnect បន្ទាប់ពីប្តូរគម្រោង", "ទំហំ browser preview"] }] },
  { version: "0.1.0", date: "5 សីហា 2026", channel: "Beta", groups: [{ title: "ថ្មី", items: ["Forge public beta ដំបូង", "Coding agent ដំណើរការដោយ Grok", "Editor, terminal, Git និង project explorer"] }] },
];

export function ChangelogPage() {
  const { language, t } = usePreferences();
  const entries = language === "km" ? khmerChanges : changelog;
  return <Shell><main className="inner-page page-pad"><div className="page-intro"><span className="kicker">{t("changelog.kicker", "CHANGELOG")}</span><h1>{t("changelog.title", "What we’re forging.")}</h1><p>{t("changelog.lead", "New capabilities, sharper workflows, and fixes in every Forge release.")}</p></div><div className="changelog-list">{entries.map((entry) => <article className="release-entry" key={entry.version}><aside><span className="release-version">v{entry.version}</span><span>{entry.channel}</span><time>{entry.date}</time></aside><div>{entry.groups.map((group) => <section key={group.title}><h2>{group.title}</h2><ul>{group.items.map((item) => <li key={item}><span>+</span>{item}</li>)}</ul></section>)}</div></article>)}</div></main></Shell>;
}

const docs = [
  ["getting-started", "docs.1.title", "Getting started", "docs.1.body", "Install Forge, add your xAI API key in Settings, then open the project folder you want to work on."],
  ["open-project", "docs.2.title", "Open a project", "docs.2.body", "Choose Open a folder from the welcome screen. Forge keeps recent projects close and restores your workspace as you move between them."],
  ["agents", "docs.3.title", "Connect an AI agent", "docs.3.body", "The beta supports Grok through an xAI API key. Provider credentials stay in the desktop runtime and are never exposed to the renderer."],
  ["workspace", "docs.4.title", "Use the workspace", "docs.4.body", "Ask in chat, follow tool activity, review code in the editor, run commands in the terminal, and preview local apps in the embedded browser."],
  ["browser", "docs.5.title", "Browser and inspector", "docs.5.body", "When Forge detects a local development URL, open it in the browser pane. Use the inspector to give your agent grounded UI context."],
  ["troubleshooting", "docs.6.title", "Troubleshooting", "docs.6.body", "If an agent will not connect, verify the API key and model in Settings. If a project tool fails, review the activity detail and retry the operation."],
] as const;

export function DocsPage() {
  const { language, t } = usePreferences();
  return <Shell><main className="docs-layout page-pad"><aside className="docs-nav"><span className="kicker">{t("docs.kicker", "DOCUMENTATION")}</span>{docs.map((s) => <a href={`#${s[0]}`} key={s[0]}>{t(s[1], s[2])}</a>)}</aside><article className="docs-content"><div className="page-intro"><h1>{t("docs.title", "Start building with Forge.")}</h1><p>{t("docs.lead", "A short guide to moving from installation to a verified change.")}</p></div>{docs.map((s, i) => <section id={s[0]} key={s[0]}><span className="doc-number">0{i + 1}</span><h2>{t(s[1], s[2])}</h2><p>{t(s[3], s[4])}</p>{i === 0 ? <div className="code-block">{language === "km" ? <><span>1</span> ទាញយក និងដំឡើង Forge<br /><span>2</span> បើក Settings → បន្ថែម XAI_API_KEY<br /><span>3</span> បើកថតគម្រោង<br /><span>4</span> ស្នើ Forge ឱ្យកែប្រែ</> : <><span>1</span> Download and install Forge<br /><span>2</span> Open Settings → add XAI_API_KEY<br /><span>3</span> Open a project folder<br /><span>4</span> Ask Forge to make a change</>}</div> : null}</section>)}</article></main></Shell>;
}

export function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const { t } = usePreferences();
  const privacy = kind === "privacy";
  const sections = privacy ? [["legal.store.title", "What Forge stores", "legal.store.body", "Forge stores your settings, recent projects, and workspace state locally on your device. API keys are handled by the desktop runtime and are not included in the website."], ["legal.project.title", "Your project data", "legal.project.body", "Forge accesses only the folders you choose. When you use an AI provider, relevant prompts and project context may be sent to that provider according to its terms and privacy policy."], ["legal.website.title", "Website data", "legal.website.body", "This website does not require an account and does not use advertising cookies. Basic hosting logs may be processed for security and reliability."], ["legal.choices.title", "Your choices", "legal.choices.body", "You can remove local Forge data by uninstalling the app and deleting its application-data folder. You can revoke provider keys from the provider dashboard at any time."]] : [["legal.beta.title", "Beta software", "legal.beta.body", "Forge is currently beta software. Features may change and unexpected errors may occur. Keep backups and review changes before committing them."], ["legal.responsibility.title", "Your responsibilities", "legal.responsibility.body", "You are responsible for the projects, commands, credentials, and third-party services you connect to Forge. Review requested permissions before allowing mutating actions."], ["legal.third.title", "Third-party services", "legal.third.body", "AI providers, repositories, and other connected tools are governed by their own terms. Forge does not control those services."], ["legal.availability.title", "Availability", "legal.availability.body", "The beta is provided as-is while we improve reliability and distribution. We may update, suspend, or discontinue beta functionality."]];
  return <Shell><main className="legal-page page-pad"><div className="page-intro"><span className="kicker">{t("legal.kicker", "LEGAL")}</span><h1>{privacy ? t("legal.privacy", "Privacy policy") : t("legal.terms", "Terms of use")}</h1><p>{t("legal.updated", "Last updated August 13, 2026 · Forge public beta")}</p></div>{sections.map(([titleKey, title, bodyKey, body]) => <section key={titleKey}><h2>{t(titleKey, title)}</h2><p>{t(bodyKey, body)}</p></section>)}<p className="legal-note">{t("legal.note", "This plain-language beta policy is an initial product notice and should be reviewed by qualified counsel before broad commercial distribution.")}</p></main></Shell>;
}

function Feature({ icon, number, title, copy }: { icon: ReactNode; number: string; title: string; copy: string }) { return <article className="feature-card"><div className="feature-top"><span className="feature-icon">{icon}</span><span>{number}</span></div><h3>{title}</h3><p>{copy}</p><ChevronRight className="feature-arrow" /></article>; }
function AgentRow({ name, status, icon, active = false }: { name: string; status: string; icon: string; active?: boolean }) { return <div className={`agent-row ${active ? "active" : ""}`}><span className="agent-icon">{icon}</span><strong>{name}</strong><span>{status}</span>{active ? <span className="status-dot" /> : <span className="soon">SOON</span>}</div>; }

function WorkspaceMockup() {
  return <div className="workspace-frame"><div className="window-bar"><div><span /><span /><span /></div><span>FORGE — phumi-website</span><span>● Beta</span></div><div className="workspace-body"><aside className="rail"><Hammer /><FolderTree /><Search /><GitBranch /></aside><div className="files"><small>EXPLORER</small><strong>PHUMI-WEBSITE</strong><p>⌄ app</p><p className="selected">&nbsp;&nbsp;page.tsx</p><p>&nbsp;&nbsp;layout.tsx</p><p>&nbsp;&nbsp;globals.css</p><p>› components</p><p>› public</p></div><div className="editor"><div className="tabs"><span>page.tsx</span><span>Hero.tsx</span></div><pre><i>1</i> <b>export default</b> function Home() &#123;<br/><i>2</i>&nbsp;&nbsp;<b>return</b> (<br/><i>3</i>&nbsp;&nbsp;&nbsp;&nbsp;&lt;<em>main</em> className=&quot;forge&quot;&gt;<br/><i>4</i>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&lt;<em>Hero</em><br/><i>5</i>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;title=&quot;Build what&apos;s next.&quot;<br/><i>6</i>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;status=&quot;ready&quot;<br/><i>7</i>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;/&gt;<br/><i>8</i>&nbsp;&nbsp;&nbsp;&nbsp;&lt;/<em>main</em>&gt;<br/><i>9</i>&nbsp;&nbsp;);<br/><i>10</i>&#125;</pre><div className="terminal"><small>TERMINAL</small><p><span>PS</span> npm run build</p><p className="success">✓ Compiled successfully in 1.8s</p><p><span>PS</span> _</p></div></div><aside className="chat"><small>FORGE AGENT</small><div className="user-bubble">Build a polished landing page and verify it locally.</div><div className="agent-message"><Sparkles /> I&apos;ll inspect the project, shape the page, then run a production build.</div><div className="tool-row"><Check /> Read project files</div><div className="tool-row"><Check /> Update landing page</div><div className="tool-row live"><span /> Running build</div></aside></div></div>;
}

function BrowserCard() { return <div className="browser-card"><div className="browser-top"><span>‹</span><span>›</span><span>↻</span><div>localhost:3000</div></div><div className="browser-content"><div className="browser-nav"><span className="mini-brand"><Hammer /> FORGE</span><span>Product&nbsp;&nbsp;&nbsp; Download</span></div><div className="browser-hero"><span>ONE AI DESKTOP</span><h3>Build what&apos;s next.</h3><p>Code, run, inspect, and verify.</p><button>Download Forge</button></div><div className="inspector-tip"><Search /><span>div.browser-hero</span><b>1240 × 486</b></div></div></div>; }

function Footer() {
  const { t } = usePreferences();
  return <footer className="footer page-pad"><div className="footer-top"><div><Link className="brand" href="/"><span className="brand-mark"><Hammer size={17} /></span><span>FORGE</span></Link><p>{t("footer.tagline", "One AI desktop for your work.")}</p></div><div><strong>{t("footer.product", "Product")}</strong><Link href="/#capabilities">{t("footer.capabilities", "Capabilities")}</Link><Link href="/download">{t("nav.download", "Download")}</Link><Link href="/changelog">{t("nav.changelog", "Changelog")}</Link></div><div><strong>{t("footer.learn", "Learn")}</strong><Link href="/docs">{t("footer.documentation", "Documentation")}</Link><Link href="/docs#agents">{t("footer.agents", "Agents")}</Link><Link href="/docs#troubleshooting">{t("footer.troubleshooting", "Troubleshooting")}</Link></div><div><strong>{t("footer.legal", "Legal")}</strong><Link href="/privacy">{t("footer.privacy", "Privacy")}</Link><Link href="/terms">{t("footer.terms", "Terms")}</Link></div></div><div className="footer-bottom"><span>© 2026 Forge by Phumi</span><span><span className="live-dot" /> {t("footer.beta", "Public beta")} · v{release.version}</span></div></footer>;
}
