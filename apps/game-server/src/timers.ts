import type { Clock, TimerService } from "./ports.js";

/**
 * Real timer + clock implementations (Section 9: 60s turn/claim timers that
 * advance immediately once a player acts — the orchestrator clears the timer on
 * action, decision 19.2). Keyed so re-arming a turn replaces the prior timer.
 */
export class NodeTimerService implements TimerService {
  private readonly handles = new Map<string, NodeJS.Timeout>();

  arm(key: string, ms: number, cb: () => void): void {
    this.clear(key);
    this.handles.set(
      key,
      setTimeout(() => {
        this.handles.delete(key);
        cb();
      }, ms),
    );
  }

  clear(key: string): void {
    const h = this.handles.get(key);
    if (h) {
      clearTimeout(h);
      this.handles.delete(key);
    }
  }

  clearAll(): void {
    for (const h of this.handles.values()) clearTimeout(h);
    this.handles.clear();
  }
}

export const systemClock: Clock = { now: () => Date.now() };
