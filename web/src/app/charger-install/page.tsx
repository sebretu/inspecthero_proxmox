import ChargerInstallationClient from "./ChargerInstallationClient";
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Instalacja Ładowarek',
};

export default function ChargerInstallPage() {
  return <ChargerInstallationClient />;
}
