import test from "node:test";
import assert from "node:assert/strict";
import { resolveShipmentPlace, buildShipmentRoute, routeMetrics, positionOnRoute, shipmentProgressAt, createCheckpointPlan } from "./tracking-engine.js";

test("local directory resolves major airport and city coordinates",()=>{
  assert.deepEqual(resolveShipmentPlace("Lagos","Nigeria","LOS"),[6.5774,3.3212]);
  assert.deepEqual(resolveShipmentPlace("London","United Kingdom"),[51.5072,-0.1276]);
  assert.equal(resolveShipmentPlace("Unknown City","Unknown Country"),null);
});

test("route engine builds a continuous route without a routing API",()=>{
  const from=resolveShipmentPlace("Lagos","Nigeria","LOS");
  const to=resolveShipmentPlace("London","United Kingdom","LHR");
  const route=buildShipmentRoute(from,to,"air",40);
  assert.equal(route.length,41);
  assert.deepEqual(route[0],from);
  assert.ok(Math.abs(route.at(-1)[0]-to[0])<1e-8);
  assert.ok(Math.abs(route.at(-1)[1]-to[1])<1e-8);
  assert.ok(routeMetrics(route,"air").distanceKm>4000);
  assert.ok(positionOnRoute(route,.5));
});

test("checkpoint plan contains scheduled route milestones",()=>{
  const route=buildShipmentRoute([6.5,3.3],[51.5,-.12],"air",30);
  const plan=createCheckpointPlan(route,"2026-11-23T08:00:00.000Z","2026-11-23T18:00:00.000Z");
  assert.equal(plan.length,4);
  assert.ok(plan[0].expected_at<plan[3].expected_at);
  assert.equal(plan[2].id,"CP03");
});

test("movement progress respects the departure window and pause state",()=>{
  const start=Date.parse("2026-11-23T08:00:00.000Z");
  const end=Date.parse("2026-11-23T18:00:00.000Z");
  const shipment={departure_at:new Date(start).toISOString(),arrival_at:new Date(end).toISOString(),paused_duration_seconds:0};
  assert.equal(shipmentProgressAt(shipment,start-1000),0);
  assert.equal(shipmentProgressAt(shipment,start+5*60*60*1000),.5);
  assert.equal(shipmentProgressAt({...shipment,is_obstructed:true,paused_progress:37},end),.37);
  assert.equal(shipmentProgressAt({...shipment,paused_duration_seconds:3600},start+5*60*60*1000),.4);
});
