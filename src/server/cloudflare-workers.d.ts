declare module "cloudflare:workers" {
  export abstract class DurableObject<Env = unknown> {
    protected ctx: DurableObjectState;
    protected env: Env;
    constructor(ctx: DurableObjectState, env: Env);
    fetch?(request: Request): Response | Promise<Response>;
  }
}

interface DurableObjectState {
  storage: DurableObjectStorage;
}

interface DurableObjectStorage {
  kv: {
    get<T = unknown>(key: string): T | undefined;
    put(key: string, value: unknown): void;
  };
  transactionSync<T>(closure: () => T): T;
}
