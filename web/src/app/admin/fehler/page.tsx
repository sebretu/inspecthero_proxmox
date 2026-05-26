import { Suspense } from "react";
import FehlerAdminClient from "./FehlerAdminClient";

export const metadata = { title: "Fehler – Admin" };

export default function FehlerAdminPage() {
    return (
        <Suspense fallback={<div className="p-8 text-ui-muted">Loading...</div>}>
            <FehlerAdminClient />
        </Suspense>
    );
}
