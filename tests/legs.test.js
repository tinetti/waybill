import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { BOOKABLE_IDS, LEGS, OFF_ROUTE_BOOKINGS, WRAPPER_STAMPS, bayIsDone, cleanupIsDone } from '../src/legs.js';

/**
 * The structural invariants of the leg model — the ones that survive a changing leg count.
 *
 * Deliberately count-free: nothing here asserts `LEGS.length === 6`, because the count is the thing
 * every other assertion in the suite stopped hardcoding. What is asserted instead is the shape the
 * route has at any length: `bay` anchors it, `cleanup` terminates it, and every leg is judged by
 * something — a wrapper stamp or its booking, never neither.
 *
 * The one exception is the explicit id list, which names the route outright. It pins a product
 * decision rather than a count: a rename or a dropped leg should have to be written down here.
 *
 * Pure: no git, no temp directories, no fixtures. It is the inner loop.
 */
describe('the leg model', () => {
  const wrapperLegs = LEGS.filter((leg) => leg.owner === 'wrapper');

  it('anchors on bay, the first leg that leaves papers behind', () => {
    // Array index 0 — leg 1 in the 1-based numbering the waybills and `leg N of M` use. Index 0
    // because every leg on the route is now judged by papers it leaves behind, and `bay` is the
    // first of them: nothing precedes it that a stamp could read.
    assert.equal(LEGS[0].id, 'bay');
    assert.equal(
      LEGS.findIndex((leg) => leg.owner === 'wrapper'),
      0,
      'bay is wrapper-owned, and nothing before it is — a wrapper leg earlier would move the anchor',
    );
  });

  it('is exactly the six ids of the route, in order', () => {
    // The one assertion here that does name the route outright. The rest of this suite holds the
    // shape at any length; this one holds the route itself, because a rename or a dropped leg is a
    // change to the product and should have to be written down, not merely observed.
    assert.deepEqual(LEGS.map((leg) => leg.id), ['bay', 'ideate', 'specify', 'execute', 'review', 'cleanup']);
  });

  it('keeps the off-route bookings off the route, and bookable all the same', () => {
    // `brainstorm` ships a booking but is not a leg: `/waybill:new` resolves its carrier, and the
    // loader must accept the binding. Folding it into LEGS instead would put it in the tick strip
    // and in every `leg N of M`.
    for (const id of OFF_ROUTE_BOOKINGS) {
      assert.equal(LEGS.some((leg) => leg.id === id), false, `${id} is off-route but sits in LEGS`);
    }
    // A literal, not the implementation's own expression: `[...LEGS.map(...), ...OFF_ROUTE_BOOKINGS]`
    // restates the derivation and so could never fail.
    assert.deepEqual(BOOKABLE_IDS, ['bay', 'ideate', 'specify', 'execute', 'review', 'cleanup', 'brainstorm']);
  });

  it('terminates on cleanup, stated against the end of the list so it holds at any length', () => {
    assert.equal(LEGS.at(-1).id, 'cleanup');
    assert.equal(LEGS.at(-1).owner, 'wrapper');
  });

  it('runs booking-owned work between the anchor and the terminus', () => {
    const bay = LEGS.findIndex((leg) => leg.id === 'bay');
    const cleanup = LEGS.findIndex((leg) => leg.id === 'cleanup');
    assert.ok(bay < cleanup, 'the anchor must precede the terminus');
    assert.ok(cleanup - bay > 1, 'a route with nothing between the anchor and the terminus is not a route');
  });

  it('names every leg once, and none of them blank', () => {
    const ids = LEGS.map((leg) => leg.id);
    for (const id of ids) assert.ok(id, 'a blank leg id cannot be bound to a booking');
    assert.deepEqual([...new Set(ids)], ids, 'a duplicate id would have one booking answer for two positions');
  });

  it('stamps exactly the wrapper-owned legs itself — no strays, and none missed', () => {
    // Both directions. A missing entry is the worst bug this tool has: the leg is never done and
    // the route stalls there forever, with nothing printed to say why.
    assert.deepEqual(
      [...WRAPPER_STAMPS.keys()].sort(),
      wrapperLegs.map((leg) => leg.id).sort(),
    );
  });

  it('pairs each wrapper leg with the function documented to stamp it', () => {
    assert.equal(WRAPPER_STAMPS.get('bay'), bayIsDone);
    assert.equal(WRAPPER_STAMPS.get('cleanup'), cleanupIsDone);
  });

  it('leaves every booking-owned leg to its booking alone', () => {
    for (const leg of LEGS.filter((entry) => entry.owner === 'booking')) {
      assert.equal(WRAPPER_STAMPS.has(leg.id), false, `${leg.id} is booking-owned but stamps itself`);
    }
  });
});
