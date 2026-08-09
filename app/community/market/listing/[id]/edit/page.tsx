import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { EditListingGate } from "@/components/market/EditListingGate";
import { getListingById } from "@/lib/listings";

export const metadata: Metadata = {
  title: "掲載を編集",
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export default async function EditListingPage({ params }: PageProps) {
  const { id } = await params;
  const listing = await getListingById(id);
  if (!listing) notFound();

  return (
    <Container className="py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link href={`/community/market/listing/${id}`} className="text-sm text-sky-700 underline">← 掲載に戻る</Link>
        <EditListingGate listing={listing} />
      </div>
    </Container>
  );
}
