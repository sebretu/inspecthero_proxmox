import { Metadata } from "next";
import MaterialsClient from "./MaterialsClient";

export const metadata: Metadata = {
    title: "Zapotrzebowanie - InspectHero",
    description: "Zapotrzebowanie na materiały z budowy.",
};

export default async function MaterialsPage() {
    return <MaterialsClient />;
}
