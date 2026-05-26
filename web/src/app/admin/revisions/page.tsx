import { Suspense } from "react";
import RevisionAdminClient from "./RevisionAdminClient";

export const metadata = {
    title: "Revisions – Admin",
};

export default function RevisionAdminPage() {
    return (
        <Suspense fallback={<div className="p-8 text-ui-muted">Loading...</div>}>
            <RevisionAdminClient />
        </Suspense>
    );
}
