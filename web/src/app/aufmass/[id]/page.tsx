"use client";
import { useParams } from "next/navigation";
import AufmassSessionClient from "./AufmassSessionClient";

export default function AufmassSessionPage() {
  const params = useParams();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;

  if (!id) return <div>Invalid Session ID</div>;

  return <AufmassSessionClient sessionId={id} />;
}
