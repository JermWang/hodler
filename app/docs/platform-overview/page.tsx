import fs from "fs/promises";
import path from "path";
import MarkdownRenderer from "@/app/components/MarkdownRenderer";

export const runtime = "nodejs";

export default async function PlatformOverviewPage() {
  const filePath = path.join(process.cwd(), "docs", "platform-overview.md");
  const md = await fs.readFile(filePath, "utf8");

  return (
    <main className="docPage">
      <article className="docArticle">
        <MarkdownRenderer content={md} />
      </article>
    </main>
  );
}
