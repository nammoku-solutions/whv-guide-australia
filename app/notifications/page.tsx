import type { Metadata } from "next";
import { Container } from "@/components/layout/Container";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { NotificationPreferencesForm } from "@/components/notifications/NotificationPreferences";

export const metadata: Metadata = {
  title: "通知",
  description: "保存した記事や掲載の更新、応募の状況などのアプリ内通知。",
  robots: { index: false, follow: false },
};

export default function NotificationsPage() {
  return (
    <Container className="py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-3xl font-extrabold">通知</h1>
          <p className="mt-1 text-sm text-slate-600">
            保存した記事・掲載の更新や、応募・コミュニティの動きをお知らせします。
          </p>
        </div>
        <NotificationCenter />
        <NotificationPreferencesForm />
      </div>
    </Container>
  );
}
