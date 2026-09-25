import { mapSupabaseError } from './errors';
import type { Database } from './db.types';

// Supabase .rpc() zwraca "thenable" builder, nie czysty Promise (TS).
// Traktujemy jako any i normalizujemy przez Promise.resolve().
type RpcClient = {
  rpc: (fn: any, args?: any) => any;
};

async function rpcCall(client: RpcClient, fn: string, args: any) {
  const res = await Promise.resolve(client.rpc(fn as any, args as any));
  if (res?.error) throw mapSupabaseError(res.error);
  return res?.data;
}

export async function rpcListTasks(
  client: RpcClient,
  args: Database['public']['Functions']['list_tasks']['Args']
) {
  return rpcCall(client, 'list_tasks', args);
}

export async function rpcGetTask(
  client: RpcClient,
  args: Database['public']['Functions']['get_task']['Args']
) {
  return rpcCall(client, 'get_task', args);
}
