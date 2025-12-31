import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";

export default async function PlatformOverviewPage() {
  const filePath = path.join(process.cwd(), "docs", "platform-overview.md");
  const md = await fs.readFile(filePath, "utf8");

  return (
    <main className="docPage">
      <div className="docPageInner">
        <h1 className="docPageTitle">Platform Overview</h1>
        <pre className="docPageBody">{md}</pre>
      </div>
    </main>
  );
}
