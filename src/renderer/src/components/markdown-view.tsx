import { useState } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export function MarkdownView({
  markdown,
  className,
  compact = false,
}: {
  markdown: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("forge-md", compact && "forge-md-compact", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={components}>
        {stabilizeMarkdown(autolinkMarkdown(markdown))}
      </ReactMarkdown>
    </div>
  );
}

const components: Components = {
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="forge-md-link"
        title={href}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (href) void window.forge.openLink(href);
        }}
      >
        {children}
      </a>
    );
  },
  img({ src, alt }) {
    if (!src) return null;
    return <img src={src} alt={alt ?? ""} loading="lazy" />;
  },
  code({ className, children, ...props }) {
    const text = String(children).replace(/\n$/, "");
    const inline = !className && !text.includes("\n");
    if (inline) {
      return (
        <code className="forge-md-inline" {...props}>
          {text}
        </code>
      );
    }
    const lang = /language-([\w-]+)/.exec(className ?? "")?.[1];
    return <CodeBlock lang={lang} text={text} className={className} />;
  },
  pre({ children }) {
    return <>{children}</>;
  },
  table({ children }) {
    return (
      <div className="forge-md-table">
        <table>{children}</table>
      </div>
    );
  },
};

function CodeBlock({ lang, text, className }: { lang?: string; text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="forge-md-code">
      <div className="forge-md-code-bar">
        <span className="forge-md-code-lang">{lang || "code"}</span>
        <button
          type="button"
          className="forge-md-copy"
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1200);
            });
          }}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>
        <code className={className}>{text}</code>
      </pre>
    </div>
  );
}

function stabilizeMarkdown(text: string): string {
  const fences = text.match(/```/g)?.length ?? 0;
  return fences % 2 === 1 ? `${text}\n\`\`\`` : text;
}

function autolinkMarkdown(text: string): string {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts
    .map((part) => {
      if (part.startsWith("```")) return part;
      return part.replace(/(^|[\s<(])((?:https?:\/\/)[^\s<>)"']+)/g, (full, prefix: string, url: string) => {
        if (full.includes("](")) return full;
        return `${prefix}[${url}](${url})`;
      });
    })
    .join("");
}
