import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { MyMarketDashboard } from "@/components/market/MyMarketDashboard";

export const metadata: Metadata = {
  title: "マイページ | コミュニティマーケット",
  robots: { index: false, follow: false },
};

export default function MyMarketPage() {
  return (
    <Container className="py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold text-slate-900">マーケット マイページ</h1>
          <Link href="/community/market/new" className="rounded-full bg-sky-700 px-4 py-2 text-sm font-semibold text-white">
            掲載する
          </Link>
        </div>
        <MyMarketDashboard />
      </div>
    </Container>
  );
}
