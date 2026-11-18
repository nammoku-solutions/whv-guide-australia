import type { Metadata } from "next";
import { ToolShell } from "@/components/tools/ToolShell";
import { EightyEightDayCalculator } from "@/components/tools/EightyEightDayCalculator";
import { getToolBySlug } from "@/lib/tools/registry";

const tool = getToolBySlug("tool-88-day-calculator")!;

export const metadata: Metadata = {
  title: tool.title,
  description: tool.description,
  alternates: { canonical: tool.path },
};

export default function EightyEightDayCalculatorPage() {
  return (
    <ToolShell
      tool={tool}
      disclaimer={
        <>
          <p className="font-semibold text-amber-900">
            これは勤務日を記録・集計するためのツールであり、ビザの可否や指定業務（Specified work）の該当性を判定するものではありません。
          </p>
          <p>
            どの業務・地域が対象になるか、証拠として何が必要かは、必ず移民局（Department of
            Home Affairs）の公式情報で確認してください。記録した勤務日の数と、移民局が数える指定労働の期間は一致するとは限りません。
          </p>
          <p>日本のパスポートでの申請では、2027年2月28日までに指定労働を完了し、有効な申請を提出できる場合は88日が目安です。2027年3月1日からは、セカンドの指定労働は120日となり、招待も必要です。</p>
          <p>入力した記録はお使いのブラウザにのみ保存され、サーバーには送信されません。ビザ申請時の正式な証拠にはなりません。</p>
        </>
      }
    >
      <EightyEightDayCalculator />
    </ToolShell>
  );
}
