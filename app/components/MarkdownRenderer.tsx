"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Props = {
  content: string;
};

export default function MarkdownRenderer({ content }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="docH1">{children}</h1>,
        h2: ({ children }) => <h2 className="docH2">{children}</h2>,
        h3: ({ children }) => <h3 className="docH3">{children}</h3>,
        h4: ({ children }) => <h4 className="docH4">{children}</h4>,
        p: ({ children }) => <p className="docP">{children}</p>,
        ul: ({ children }) => <ul className="docUl">{children}</ul>,
        ol: ({ children }) => <ol className="docOl">{children}</ol>,
        li: ({ children }) => <li className="docLi">{children}</li>,
        a: ({ href, children }) => (
          <a href={href} className="docA" target="_blank" rel="noreferrer noopener">
            {children}
          </a>
        ),
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
