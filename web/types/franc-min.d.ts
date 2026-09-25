declare module "franc-min" {
  export function franc(input: string, options?: { minLength?: number; only?: string[] }): string;
}
