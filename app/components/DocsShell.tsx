"use client";

import { useEffect, useRef, useState } from "react";

type TocItem = {
  id: string;
  text: string;
  level: number;
  number: string;
};

function getText(el: Element): string {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".docHeadingAnchor").forEach((n) => n.remove());
  return String(clone.textContent || "").trim();
}

export default function DocsShell({ children }: { children: React.ReactNode }) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;

    const headings = Array.from(root.querySelectorAll("h2[id], h3[id]"));
    let h2Index = 0;
    let h3Index = 0;

    const nextToc: TocItem[] = headings
      .map((h) => {
        const level = h.tagName === "H2" ? 2 : 3;
        if (level === 2) {
          h2Index += 1;
          h3Index = 0;
        } else {
          if (h2Index === 0) h2Index = 1;
          h3Index += 1;
        }

        const number = level === 2 ? `${h2Index}.` : `${h2Index}.${h3Index}`;

        return {
          id: String(h.getAttribute("id") || ""),
          text: getText(h),
          level,
          number,
        };
      })
      .filter((x) => x.id && x.text);

    setToc(nextToc);

    const h2s = Array.from(root.querySelectorAll("h2[id]"));
    const initial = String(window.location.hash || "").replace(/^#/, "");
    if (initial) {
      setActiveId(initial);
      return;
    }
    if (h2s.length) {
      setActiveId(String(h2s[0].getAttribute("id") || ""));
    }
  }, [children]);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;

    const headings = Array.from(root.querySelectorAll("h2[id], h3[id]"));
    if (!headings.length) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (a.boundingClientRect.top > b.boundingClientRect.top ? 1 : -1));
        if (!visible.length) return;

        const id = String((visible[0].target as HTMLElement).id || "");
        if (id) setActiveId(id);
      },
      {
        root: null,
        rootMargin: "-120px 0px -70% 0px",
        threshold: [0.1, 0.25, 0.5, 0.75],
      }
    );

    headings.forEach((h) => obs.observe(h));
    return () => obs.disconnect();
  }, [toc.length]);

  return (
    <div className="docShell">
      <div className="docShellGrid">
        <nav className="docToc" aria-label="On this page">
          <div className="docTocTitle">On this page</div>
          <div className="docTocList">
            {toc.map((t) => (
              <a
                key={t.id}
                href={`#${t.id}`}
                className={`docTocLink docTocLinkL${t.level}${activeId === t.id ? " docTocLinkActive" : ""}`}
              >
                <span className="docTocNumber" aria-hidden="true">
                  {t.number}
                </span>
                <span className="docTocLabel">{t.text}</span>
              </a>
            ))}
          </div>
        </nav>

        <div className="docContent" ref={contentRef}>
          {children}
        </div>
      </div>
    </div>
  );
}
