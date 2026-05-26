import { use } from "react";
import AdminOrderEmailClient from "./AdminOrderEmailClient";

export default function AdminOrderEmailPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    return <AdminOrderEmailClient orderId={resolvedParams.id} />;
}
export async function generateStaticParams() { return [{ id: '1' }]; }
