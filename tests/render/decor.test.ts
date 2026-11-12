import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FLOORS } from '../../src/sim/config/floors';
import { Tile } from '../../src/sim/map/tilemap';
import { buildDecor } from '../../src/render/decor';
import { wallTop } from '../../src/render/world';
import { logoSpots } from '../../src/sim/map/logo-spots';
import { ladders } from '../../src/sim/map/ladders';

describe('decoration', () => {
  it('nothing sticks into a wall: trees, props and ladders stay in front of it or on top of it', () => {
    const report: string[] = [];
    for (const [id, def] of Object.entries(FLOORS)) {
      const map = def.map;
      const tileOf = (tx: number, tz: number): Tile => (tx < 0 || tz < 0 || tx >= map.w || tz >= map.h ? Tile.Wall : map.tiles[tz * map.w + tx]);
      const floorTiles: { tx: number; tz: number }[] = [];
      const wallTiles: { tx: number; tz: number }[] = [];
      for (let tz = 0; tz < map.h; tz++)
        for (let tx = 0; tx < map.w; tx++) {
          if (tileOf(tx, tz) === Tile.Floor) floorTiles.push({ tx, tz });
          if (tileOf(tx, tz) === Tile.Wall) wallTiles.push({ tx, tz });
        }
      const top = (tx: number, tz: number) => wallTop(map, tx + 0.5, tz + 0.5);
      const keepClear = [map.spawn, map.elevator, ...map.pads.map(p => p.pos), ...map.nestSpots.flatMap(n => [n.pos, ...n.entries]), ...map.vehicleSpots, ...map.powerSpots, ...map.crateSpots];
      const decor = buildDecor({ map, look: def.theme, floorTiles, wallTiles, tileOf, wallTopY: top, keepClear });
      const inside: string[] = [];
      const v = new THREE.Vector3();
      for (const group of [decor.group, decor.ladders])
        group.traverse(o => {
          if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh) return;
          o.updateMatrixWorld(true);
          const pos = o.geometry.getAttribute('position');
          for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
            const tx = Math.floor(v.x), tz = Math.floor(v.z);
            const fx = v.x - tx, fz = v.z - tz;
            // well inside a wall block's footprint and below its top (signs and tubes mounted flush on a wall
            // may sink in a little)
            if (tileOf(tx, tz) !== Tile.Wall || fx < 0.12 || fx > 0.88 || fz < 0.12 || fz > 0.88) continue;
            if (v.y < top(tx, tz) - 0.05 && v.y > 0.02) inside.push(`${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)} top ${top(tx, tz).toFixed(2)} #${((o.material as THREE.MeshLambertMaterial).color?.getHexString?.() ?? "?")}`);
          }
        });
      if (inside.length > 0) report.push(`${id}: ${inside.length} corners inside walls, e.g. ${inside.slice(0, 3).join(' | ')}`);
    }
    expect(report).toEqual([]);
  });

  it('the AmannLabs logos stay free: nothing on, over or in front of them', () => {
    const report: string[] = [];
    for (const [id, def] of Object.entries(FLOORS)) {
      const map = def.map;
      const tileOf = (tx: number, tz: number): Tile => (tx < 0 || tz < 0 || tx >= map.w || tz >= map.h ? Tile.Wall : map.tiles[tz * map.w + tx]);
      const floorTiles: { tx: number; tz: number }[] = [];
      const wallTiles: { tx: number; tz: number }[] = [];
      for (let tz = 0; tz < map.h; tz++)
        for (let tx = 0; tx < map.w; tx++) {
          if (tileOf(tx, tz) === Tile.Floor) floorTiles.push({ tx, tz });
          if (tileOf(tx, tz) === Tile.Wall) wallTiles.push({ tx, tz });
        }
      const top = (tx: number, tz: number) => wallTop(map, tx + 0.5, tz + 0.5);
      const decor = buildDecor({ map, look: def.theme, floorTiles, wallTiles, tileOf, wallTopY: top, keepClear: [] });
      // the areas: the floor stamp, and a strip of floor in front of the wall decal
      const areas: { x0: number; x1: number; z0: number; z1: number }[] = [];
      for (const s of logoSpots(map)) {
        if (s.kind === 'floor') {
          areas.push({ x0: s.tx, x1: s.tx + s.w, z0: s.tz, z1: s.tz + s.h });
          // no tall grass under it, no wall next to it to hang a tree crown over it
          // (the minigame maps have no decoration to hang over it, and the maze has no room for a margin)
          if (!['race', 'lane', 'maze'].includes(id))
            for (let tz = s.tz - 1; tz <= s.tz + s.h; tz++) for (let tx = s.tx - 1; tx <= s.tx + s.w; tx++) if (tileOf(tx, tz) !== Tile.Floor) report.push(`${id}: wall or hazard next to the floor logo at ${tx},${tz}`);
          for (const g of map.grass ?? []) if (g.x >= s.tx && g.x <= s.tx + s.w && g.z >= s.tz && g.z <= s.tz + s.h) report.push(`${id}: grass on the floor logo`);
        } else {
          const len = s.along === 'x' ? { x: s.w, z: 1 } : { x: 1, z: s.w };
          const fx = s.tx + s.facing.x, fz = s.tz + s.facing.z;
          areas.push({ x0: fx, x1: fx + len.x, z0: fz, z1: fz + len.z });
          for (const l of ladders(map)) if (l.tx >= fx && l.tx < fx + len.x && l.tz >= fz && l.tz < fz + len.z) report.push(`${id}: a ladder in front of the wall logo`);
        }
      }
      const v = new THREE.Vector3();
      let hits = 0;
      for (const group of [decor.group, decor.ladders])
        group.traverse(o => {
          if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh) return;
          o.updateMatrixWorld(true);
          const pos = o.geometry.getAttribute('position');
          for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
            if (areas.some(a => v.x > a.x0 + 0.02 && v.x < a.x1 - 0.02 && v.z > a.z0 + 0.02 && v.z < a.z1 - 0.02)) hits++;
          }
        });
      if (hits > 0) report.push(`${id}: ${hits} corners of decoration on or in front of a logo`);
    }
    expect(report).toEqual([]);
  });
});
