import CompletedClient from "./CompletedClient";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Zakończone Prace - ET⚡U.DE",
};

export default function CompletedPage() {
    return <CompletedClient />;
}
