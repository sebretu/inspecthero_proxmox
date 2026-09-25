"use client";

import React, { useState } from "react";
import { Check, Copy } from "lucide-react";

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  if (!content) return null;

  // Split content by code blocks first
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2 text-[13px] leading-relaxed text-inherit break-words font-sans">
      {parts.map((part, index) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          const lines = part.slice(3, -3).trim().split("\n");
          let language = "";
          let code = "";
          if (lines.length > 0 && /^[a-zA-Z0-9_-]+$/.test(lines[0].trim())) {
            language = lines[0].trim();
            code = lines.slice(1).join("\n");
          } else {
            code = lines.join("\n");
          }

          return <CodeBlock key={index} code={code} language={language} />;
        }

        return <MarkdownSection key={index} text={part} />;
      })}
    </div>
  );
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Failed to copy code", e);
    }
  };

  return (
    <div className="relative my-2 rounded-xl overflow-hidden border border-white/10 bg-[#1e1e2e] shadow-md">
      <div className="flex items-center justify-between px-3 py-1.5 bg-black/40 text-[11px] text-gray-400 font-mono border-b border-white/5">
        <span>{language || "kod"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-2 py-0.5 rounded text-[10px]"
        >
          {copied ? (
            <>
              <Check size={12} className="text-green-400" />
              <span className="text-green-400">Skopiowano</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>Kopiuj</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-[12px] font-mono text-gray-200 leading-normal">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function MarkdownSection({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Table detection
    if (line.includes("|") && i + 1 < lines.length && lines[i + 1].includes("|") && lines[i + 1].includes("-")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].includes("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      elements.push(<TableBlock key={`table-${i}`} lines={tableLines} />);
      continue;
    }

    // Heading #, ##, ###
    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={i} className="text-sm font-bold mt-2 mb-1 text-ui-text">
          {renderInline(line.slice(4))}
        </h3>
      );
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      elements.push(
        <h2 key={i} className="text-base font-black mt-2 mb-1 text-ui-text">
          {renderInline(line.slice(3))}
        </h2>
      );
      i++;
      continue;
    }
    if (line.startsWith("# ")) {
      elements.push(
        <h1 key={i} className="text-lg font-black mt-3 mb-1 text-ui-text">
          {renderInline(line.slice(2))}
        </h1>
      );
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      elements.push(
        <blockquote key={i} className="border-l-2 border-ui-accent/50 pl-3 my-1.5 italic text-ui-muted">
          {renderInline(line.slice(2))}
        </blockquote>
      );
      i++;
      continue;
    }

    // Unordered list item
    if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
      const clean = line.trim().slice(2);
      elements.push(
        <li key={i} className="ml-4 list-disc my-0.5">
          {renderInline(clean)}
        </li>
      );
      i++;
      continue;
    }

    // Ordered list item
    const numMatch = line.trim().match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      elements.push(
        <li key={i} className="ml-4 list-decimal my-0.5" value={parseInt(numMatch[1], 10)}>
          {renderInline(numMatch[2])}
        </li>
      );
      i++;
      continue;
    }

    // Empty line / paragraph break
    if (!line.trim()) {
      elements.push(<div key={i} className="h-1" />);
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={i} className="my-0.5">
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return <>{elements}</>;
}

function TableBlock({ lines }: { lines: string[] }) {
  if (lines.length < 2) return null;

  const headerCells = lines[0]
    .split("|")
    .map((c) => c.trim())
    .filter((_, idx, arr) => idx !== 0 && idx !== arr.length - 1);

  const rowLines = lines.slice(2);

  return (
    <div className="my-2 overflow-x-auto rounded-lg border border-ui-border">
      <table className="w-full text-left border-collapse text-[12px]">
        <thead>
          <tr className="bg-ui-card/60 border-b border-ui-border">
            {headerCells.map((cell, idx) => (
              <th key={idx} className="p-2 font-bold text-ui-text">
                {renderInline(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowLines.map((row, rIdx) => {
            const cells = row
              .split("|")
              .map((c) => c.trim())
              .filter((_, idx, arr) => idx !== 0 && idx !== arr.length - 1);
            if (cells.length === 0) return null;
            return (
              <tr key={rIdx} className="border-b border-ui-border/50 last:border-0 hover:bg-ui-card/30">
                {cells.map((cell, cIdx) => (
                  <td key={cIdx} className="p-2 text-ui-text">
                    {renderInline(cell)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g);

  return tokens.map((token, idx) => {
    if (token.startsWith("`") && token.endsWith("`") && token.length >= 2) {
      return (
        <code key={idx} className="px-1.5 py-0.5 mx-0.5 rounded bg-black/20 text-ui-accent font-mono text-[11px] font-semibold border border-white/5">
          {token.slice(1, -1)}
        </code>
      );
    }

    if (token.startsWith("**") && token.endsWith("**") && token.length >= 4) {
      return (
        <strong key={idx} className="font-bold text-ui-text">
          {token.slice(2, -2)}
        </strong>
      );
    }

    if (token.startsWith("*") && token.endsWith("*") && token.length >= 2) {
      return (
        <em key={idx} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    }

    const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={idx}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-ui-accent underline hover:opacity-80 transition-opacity font-medium"
        >
          {linkMatch[1]}
        </a>
      );
    }

    return token;
  });
}
