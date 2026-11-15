import {
  createEmptyAiQuotaState,
  parsePersistedAiQuotaState,
  type AiQuotaStateStore,
  type PersistedAiQuotaState,
} from "@/game/aiQuota";

const STATE_KEY = "ai-quota-state-v1";

export interface SynchronousQuotaStorage {
  kv: {
    get(key: string): unknown;
    put(key: string, value: unknown): void;
  };
  transactionSync<T>(operation: () => T): T;
}

export class DurableAiQuotaStateStore implements AiQuotaStateStore {
  constructor(private readonly storage: SynchronousQuotaStorage) {}

  transactionSync<T>(operation: (state: PersistedAiQuotaState) => T): T {
    return this.storage.transactionSync(() => {
      const persisted = this.storage.kv.get(STATE_KEY);
      const state =
        persisted === undefined ? createEmptyAiQuotaState() : parsePersistedAiQuotaState(persisted);
      const result = operation(state);
      this.storage.kv.put(STATE_KEY, state);
      return result;
    });
  }
}
