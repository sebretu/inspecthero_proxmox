import { Metadata } from "next";
import MaterialsClient from "./MaterialsClient";

export const metadata: Metadata = {
    title: "Zapotrzebowanie - ET⚡U.DE",
    description: "Zapotrzebowanie na materiały z budowy.",
};

export default async function MaterialsPage() {
    return <MaterialsClient />;
}
