import ToApproveClient from "./ToApproveClient";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Do zatwierdzenia - ET⚡U.DE",
};

export default function ToApprovePage() {
    return <ToApproveClient />;
}
