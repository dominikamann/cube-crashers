import { applySnapshot, serializeSnapshot, type SnapState } from './net/snapshot';
import { FLOORS } from './sim/config/floors';
import { createSim } from './sim/sim';
import type { SimEvent, SimState } from './sim/types';
import { TICK_RATE } from './sim/types';

/** how much of the match is kept, and how fast it plays back: as long as a knocked-out player waits to come back */
export const KILLCAM = { seconds: 4.5, speed: 1 };

interface Frame {
  tick: number;
  /** the snapshot as sent over the network: the same format clients already know how to show */
  snap: string;
}

/** A replay being shown: a separate state that the renderer draws instead of the live match. */
export interface KillCamPlayback {
  killerId: number;
  state: SimState;
  /** moves the replay on by `dt` seconds of screen time; false once it is over */
  advance(dt: number): boolean;
  /** shots, blasts and hits of the moments shown since the last call (for effects and sounds) */
  takeEvents(): SimEvent[];
}

/**
 * Versus: keeps the last few seconds of the match as snapshots, so a player who was knocked out can watch
 * how it happened. Works the same alone, as LAN host and as client, because it records what is on screen.
 */
export class KillCamRecorder {
  private frames: Frame[] = [];
  private lastTick = -1;

  record(s: SimState, events: SimEvent[]): void {
    if (s.tick === this.lastTick) return;
    this.lastTick = s.tick;
    this.frames.push({ tick: s.tick, snap: serializeSnapshot(s, events) });
    const oldest = s.tick - Math.round(KILLCAM.seconds * TICK_RATE);
    while (this.frames.length > 0 && this.frames[0].tick < oldest) this.frames.shift();
  }

  /** seconds of match kept right now */
  seconds(): number {
    return this.frames.length < 2 ? 0 : (this.frames[this.frames.length - 1].tick - this.frames[0].tick) / TICK_RATE;
  }

  clear(): void {
    this.frames = [];
    this.lastTick = -1;
  }

  /** the replay of what is kept, watched from `killerId`'s side; null when nothing was recorded */
  start(killerId: number): KillCamPlayback | null {
    if (this.frames.length === 0) return null;
    const frames = this.frames.map(f => JSON.parse(f.snap) as { state: SnapState; events: SimEvent[] });
    const first = frames[0].state;
    const map = FLOORS[first.mapId]?.map;
    if (!map) return null;
    const state = createSim(map, 1, { mode: 'versus', players: first.players.length });
    state.tick = -1;
    let next = 0;
    let clock = first.tick;
    let events: SimEvent[] = [];
    const applyUpTo = (tick: number) => {
      while (next < frames.length && frames[next].state.tick <= tick) {
        applySnapshot(state, frames[next].state);
        events.push(...frames[next].events);
        next++;
      }
    };
    applyUpTo(clock);
    return {
      killerId,
      state,
      advance(dt) {
        clock += dt * TICK_RATE * KILLCAM.speed;
        applyUpTo(clock);
        return next < frames.length;
      },
      takeEvents() {
        const e = events;
        events = [];
        return e;
      },
    };
  }
}
