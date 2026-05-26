import { Metadata } from "next";
import AdminMaterialsClient from "./AdminMaterialsClient";

export const metadata: Metadata = {
    title: "Zarządzanie Materiałami - InspectHero",
    description: "Zarządzanie bazą materiałów",
};

export default function AdminMaterialsPage() {
    return <AdminMaterialsClient />;
}
