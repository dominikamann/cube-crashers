import { describe, expect, it } from 'vitest';
import { FLOORS } from '../../src/sim/config/floors';
import { ClientSession, HostSession } from '../../src/net/session';
import { createMemoryHub } from '../../src/net/transport';

describe('Single floor on the LAN', () => {
  it('starts everyone on the floor the host picked', () => {
    const hub = createMemoryHub();
    const host = new HostSession(hub.host(), { name: 'Dominik' });
    const a = new ClientSession(hub.client(), { name: 'Kim' });
    hub.flush();
    host.start(7, 'medium', 'quick', 'jungle');
    hub.flush();
    expect(host.sim!.run.mode).toBe('quick');
    expect(host.sim!.map).toBe(FLOORS.jungle.map);
    expect(a.view!.run.mode).toBe('quick');
    expect(a.view!.map).toBe(FLOORS.jungle.map);
  });

  it('falls back to the first floor for a map it does not know', () => {
    const hub = createMemoryHub();
    const host = new HostSession(hub.host(), { name: 'Dominik' });
    hub.flush();
    host.start(7, 'medium', 'quick', 'nope');
    expect(host.sim!.map).toBe(FLOORS.floor01.map);
  });
});
