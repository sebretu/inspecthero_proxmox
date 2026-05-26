import TaskClient from "./TaskClient";

// Static export: generate empty params (task IDs are dynamic UUIDs).
// On Android/native the task is opened via TaskDrawer inline (no route navigation).
// On web, Next.js server handles any /task/[id] dynamically.
export async function generateStaticParams() { return []; }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TaskClient id={id} />;
}
