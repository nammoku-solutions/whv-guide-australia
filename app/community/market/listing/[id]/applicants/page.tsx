import type { Metadata } from "next";
import { Container } from "@/components/layout/Container";
import { ApplicantList } from "@/components/market/ApplicantList";

export const metadata: Metadata = {
  title: "応募者一覧",
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ApplicantsPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <Container className="py-10">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-4 text-2xl font-extrabold text-slate-900">応募者一覧</h1>
        <ApplicantList listingId={id} />
      </div>
    </Container>
  );
}
