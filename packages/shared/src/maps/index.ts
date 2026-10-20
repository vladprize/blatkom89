import { buildFactoryMap } from './factory.js';
import { buildGaragesMap } from './garages.js';
import { buildYardMap } from './yard.js';
import { buildStroykaMap } from './stroyka.js';
import { buildDkMap } from './dk.js';
import { buildGastronomMap } from './gastronom.js';
import { buildHospitalMap } from './hospital.js';
import { buildCemeteryMap } from './cemetery.js';
import { buildSquareMap } from './square.js';
import { buildCampMap } from './camp.js';
import { CollisionWorld } from './collision.js';
import type { MapDef, MapId } from './types.js';
import { MAP_IDS } from './types.js';

export * from './types.js';
export * from './props.js';
export * from './collision.js';
export * from './builder.js';

const builders: Record<MapId, () => MapDef> = {
  factory: buildFactoryMap,
  garages: buildGaragesMap,
  yard: buildYardMap,
  stroyka: buildStroykaMap,
  dk: buildDkMap,
  gastronom: buildGastronomMap,
  hospital: buildHospitalMap,
  cemetery: buildCemeteryMap,
  square: buildSquareMap,
  camp: buildCampMap,
};

const mapCache = new Map<MapId, MapDef>();
const collisionCache = new Map<MapId, CollisionWorld>();

export function getMap(id: MapId): MapDef {
  let m = mapCache.get(id);
  if (!m) {
    m = builders[id]();
    mapCache.set(id, m);
  }
  return m;
}

export function getCollision(id: MapId): CollisionWorld {
  let c = collisionCache.get(id);
  if (!c) {
    c = new CollisionWorld(getMap(id));
    collisionCache.set(id, c);
  }
  return c;
}

export function isMapId(v: unknown): v is MapId {
  return typeof v === 'string' && (MAP_IDS as readonly string[]).includes(v);
}

export const MAP_ORDER: readonly MapId[] = ['factory', 'stroyka', 'dk', 'gastronom', 'hospital', 'cemetery', 'square', 'camp', 'garages', 'yard'];
