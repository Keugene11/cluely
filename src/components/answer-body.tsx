"use client";

import ReactMarkdown from "react-markdown";

/**
 * Renders an assist answer's markdown — bold, lists, inline code, and fenced
 * code blocks — with tight, dark, overlay-friendly styling. Code blocks scroll
 * horizontally instead of forcing the panel wide.
 */
export function AnswerBody({ children }: { children: string }) {
  return (
    <div className="answer-prose text-[13px] leading-relaxed">
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          ul: ({ children }) => (
            <ul className="mb-2 ml-1 list-none space-y-1 last:mb-0">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-2 ml-4 list-decimal space-y-1 last:mb-0">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="relative pl-3.5 before:absolute before:left-0 before:text-muted before:content-['•']">
              {children}
            </li>
          ),
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          a: ({ children, href }) => (
            <a href={href} className="underline underline-offset-2">
              {children}
            </a>
          ),
          code: ({ className, children }) => {
            const isBlock = /language-/.test(className ?? "");
            if (isBlock) {
              return <code className={className}>{children}</code>;
            }
            return (
              <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-[12px]">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="mb-2 overflow-x-auto rounded-lg border border-white/10 bg-black/50 p-3 font-mono text-[12px] leading-relaxed last:mb-0">
              {children}
            </pre>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
