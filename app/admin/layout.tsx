import { notFound } from "next/navigation";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  void children;
  notFound();
}
