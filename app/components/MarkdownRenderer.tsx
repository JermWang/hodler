"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Props = {
  content: string;
};

function flattenText(children: unknown): string {
  if (children == null) return "";
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(flattenText).join("");
  if (typeof children === "object") {
    const anyChild = children as { props?: { children?: unknown } };
    if (anyChild.props && "children" in anyChild.props) {
      return flattenText(anyChild.props.children);
    }
  }
  return "";
}

function slugify(raw: string): string {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  return s || "section";
}

function isExternalHref(href: string | undefined): boolean {
  if (!href) return false;
  return /^https?:\/\//i.test(href);
}

export default function MarkdownRenderer({ content }: Props) {
  const slugCounts = new Map<string, number>();

  function headingIdFromChildren(children: unknown): { id: string; text: string } {
    const text = flattenText(children).trim();
    const base = slugify(text);
    const next = (slugCounts.get(base) ?? 0) + 1;
    slugCounts.set(base, next);
    const id = next === 1 ? base : `${base}-${next}`;
    return { id, text };
  }

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => {
          const { id, text } = headingIdFromChildren(children);
          return (
            <h1 className="docH1" id={id}>
              <a className="docHeadingAnchor" href={`#${id}`} aria-label={`Link to ${text}`}>
                #
              </a>
              {children}
            </h1>
          );
        },
        h2: ({ children }) => {
          const { id, text } = headingIdFromChildren(children);
          return (
            <h2 className="docH2" id={id}>
              <a className="docHeadingAnchor" href={`#${id}`} aria-label={`Link to ${text}`}>
                #
              </a>
              {children}
            </h2>
          );
        },
        h3: ({ children }) => {
          const { id, text } = headingIdFromChildren(children);
          return (
            <h3 className="docH3" id={id}>
              <a className="docHeadingAnchor" href={`#${id}`} aria-label={`Link to ${text}`}>
                #
              </a>
              {children}
            </h3>
          );
        },
        h4: ({ children }) => {
          const { id, text } = headingIdFromChildren(children);
          return (
            <h4 className="docH4" id={id}>
              <a className="docHeadingAnchor" href={`#${id}`} aria-label={`Link to ${text}`}>
                #
              </a>
              {children}
            </h4>
          );
        },
        p: ({ children }) => <p className="docP">{children}</p>,
        ul: ({ children }) => <ul className="docUl">{children}</ul>,
        ol: ({ children }) => <ol className="docOl">{children}</ol>,
        li: ({ children }) => <li className="docLi">{children}</li>,
        a: ({ href, children }) => {
          const isExternal = isExternalHref(href);
          return (
            <a
              href={href}
              className="docA"
              target={isExternal ? "_blank" : undefined}
              rel={isExternal ? "noreferrer noopener" : undefined}
            >
              {children}
            </a>
          );
        },
        strong: ({ children }) => <strong className="docStrong">{children}</strong>,
        em: ({ children }) => <em className="docEm">{children}</em>,
        hr: () => <hr className="docHr" />,
        table: ({ children }) => (
          <div className="docTableWrap">
            <table className="docTable">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="docThead">{children}</thead>,
        tbody: ({ children }) => <tbody className="docTbody">{children}</tbody>,
        tr: ({ children }) => <tr className="docTr">{children}</tr>,
        th: ({ children }) => <th className="docTh">{children}</th>,
        td: ({ children }) => <td className="docTd">{children}</td>,
        blockquote: ({ children }) => <blockquote className="docBlockquote">{children}</blockquote>,
        code: ({ children, className }) => {
          const isInline = !className;
          if (isInline) {
            return <code className="docCodeInline">{children}</code>;
          }
          return <code className="docCodeBlock">{children}</code>;
        },
        pre: ({ children }) => <pre className="docPre">{children}</pre>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
