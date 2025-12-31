"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type TocItem = {
  id: string;
  text: string;
  level: number;
};

function getText(el: Element): string {
  return String((el as HTMLElement).innerText || "").trim();
}

export default function DocsShell({ children }: { children: React.ReactNode }) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;

    const headings = Array.from(root.querySelectorAll("h2[id], h3[id]"));
    const nextToc: TocItem[] = headings
      .map((h) => ({
        id: String(h.getAttribute("id") || ""),
        text: getText(h),
        level: h.tagName === "H2" ? 2 : 3,
      }))
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

  const tabs = useMemo(() => toc.filter((t) => t.level === 2), [toc]);

  return (
    <div className="docShell">
      {tabs.length ? (
        <div className="docTabs" role="navigation" aria-label="Documentation tabs">
          <div className="docTabsInner">
            {tabs.map((t) => (
              <a
                key={t.id}
                href={`#${t.id}`}
                className={`docTab${activeId === t.id ? " docTabActive" : ""}`}
              >
                {t.text}
              </a>
            ))}
          </div>
        </div>
      ) : null}

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
                {t.text}
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
