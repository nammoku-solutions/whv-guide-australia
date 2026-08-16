import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { MyPageDashboard } from "@/components/mypage/MyPageDashboard";

export const metadata: Metadata = {
  title: "マイページ",
  description: "保存した記事・掲載、応募状況、88日カウンターの進捗、通知をまとめて確認できます。",
  robots: { index: false, follow: false },
};

export default function MyPage() {
  return (
    <Container className="py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-extrabold">マイページ</h1>
            <p className="mt-1 text-sm text-slate-600">
              保存したコンテンツ・応募状況・進捗をまとめて確認できます。
            </p>
          </div>
          <div className="flex gap-2 text-sm">
            <Link href="/notifications" className="rounded-full border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50">
              通知
            </Link>
            <Link href="/profile" className="rounded-full border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50">
              アカウント設定
            </Link>
          </div>
        </div>
        <MyPageDashboard />
      </div>
    </Container>
  );
}
