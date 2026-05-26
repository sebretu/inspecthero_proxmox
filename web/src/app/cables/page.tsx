import CablesClient from "./CablesClient";

export const metadata = {
  title: "Kable — InspectHero",
  description: "Manage cable runs and track completion status on site.",
};

export default function CablesPage() {
  return <CablesClient />;
}
