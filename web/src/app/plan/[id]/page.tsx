import { Suspense } from "react";
import PlanPageClient from "./PlanPageClient";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Loading…</div>}>
      <PlanPageClient id={id} />
    </Suspense>
  );
}
export async function generateStaticParams() { return [{ id: '1' }]; }
