import * as THREE from "three";
import {
  DIM,
  bassBridgeCurve,
  hitchRailCurve,
  mainBridgeCurve,
  tag,
} from "./geometry.js";

const UP = new THREE.Vector3(0, 1, 0);

function curvePoint(curve, t, y) {
  return curve.getPoint(t).setY(y);
}

/** Extend a bridge-to-hitch line forward through the front bearing and pin. */
function makeStraightRoute(bridgePoint, hitchPoint, tuningZ, stringY) {
  const direction = new THREE.Vector3().subVectors(hitchPoint, bridgePoint);
  direction.y = 0;
  direction.normalize();
  const frontDistance = (DIM.frontBearingZ - bridgePoint.z) / -direction.z;
  const frontBearingPoint = bridgePoint
    .clone()
    .addScaledVector(direction, -frontDistance)
    .setY(DIM.frontBearingY + stringY);
  const tuningDistance = (tuningZ - frontBearingPoint.z) / -direction.z;
  const tuningPoint = frontBearingPoint
    .clone()
    .addScaledVector(direction, -tuningDistance)
    .setY(DIM.tuningPointY + stringY);
  bridgePoint.y = DIM.bridgeContactY + stringY;
  hitchPoint.y = DIM.hitchPointY + stringY;
  return { tuningPoint, frontBearingPoint, bridgePoint, hitchPoint };
}

function routeOffset(route, amount) {
  const direction = new THREE.Vector3().subVectors(
    route.hitchPoint,
    route.frontBearingPoint,
  );
  direction.y = 0;
  const sideways = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
  return Object.fromEntries(
    Object.entries(route).map(([key, point]) => [
      key,
      point.clone().addScaledVector(sideways, amount),
    ]),
  );
}

/** Development-only guard against plan-view string kinks. */
export function validateStringRouting(routes, tolerance = 3) {
  let maximum = 0;
  const failures = [];
  for (const route of routes) {
    const incoming = new THREE.Vector2(
      route.bridgePoint.x - route.frontBearingPoint.x,
      route.bridgePoint.z - route.frontBearingPoint.z,
    ).normalize();
    const outgoing = new THREE.Vector2(
      route.hitchPoint.x - route.bridgePoint.x,
      route.hitchPoint.z - route.bridgePoint.z,
    ).normalize();
    const change = THREE.MathUtils.radToDeg(
      Math.acos(THREE.MathUtils.clamp(incoming.dot(outgoing), -1, 1)),
    );
    maximum = Math.max(maximum, change);
    if (change > tolerance) failures.push({ route, change });
  }
  if (import.meta.env?.DEV && failures.length) {
    console.warn(
      "String routes exceed the plan-view direction tolerance.",
      failures,
    );
  }
  return { maximum, failures };
}

/** Static, shared course map consumed by strings, bridges, and pin fields. */
export function createStringLayout() {
  const routes = [];
  const mainBridge = mainBridgeCurve();
  const bassBridge = bassBridgeCurve();
  const hitchRail = hitchRailCurve();
  const zones = [
    { name: "bass", courses: 11, strings: 1, spacing: 0, stringY: 0.014 },
    { name: "tenor", courses: 11, strings: 2, spacing: 0.028, stringY: 0 },
    { name: "treble", courses: 14, strings: 3, spacing: 0.021, stringY: 0 },
  ];
  let courseIndex = 0;

  for (const zone of zones) {
    for (let course = 0; course < zone.courses; course++) {
      const t = zone.courses === 1 ? 0 : course / (zone.courses - 1);
      let bridgePoint;
      let hitchPoint;
      if (zone.name === "bass") {
        bridgePoint = curvePoint(bassBridge, 0.08 + t * 0.82, 0);
        hitchPoint = curvePoint(hitchRail, 0.62 + t * 0.28, 0);
      } else if (zone.name === "tenor") {
        bridgePoint = curvePoint(mainBridge, 0.92 - t * 0.4, 0);
        hitchPoint = curvePoint(hitchRail, 0.72 - t * 0.24, 0);
      } else {
        bridgePoint = curvePoint(mainBridge, 0.5 - t * 0.46, 0);
        hitchPoint = curvePoint(hitchRail, 0.48 - t * 0.38, 0);
      }

      const row = courseIndex % 3;
      const route = makeStraightRoute(
        bridgePoint,
        hitchPoint,
        DIM.tuningPinZ + row * DIM.tuningRowStep,
        zone.stringY,
      );
      for (let string = 0; string < zone.strings; string++) {
        const offset = (string - (zone.strings - 1) / 2) * zone.spacing;
        routes.push({
          ...routeOffset(route, offset),
          zone: zone.name,
          courseIndex,
          stringIndex: string,
        });
      }
      courseIndex++;
    }
  }
  validateStringRouting(routes);
  return { routes, mainBridge, bassBridge, hitchRail };
}

function addCylinderInstances(
  group,
  segments,
  radius,
  material,
  radialSegments = 8,
) {
  const mesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(1, 1, 1, radialSegments),
    material,
    segments.length,
  );
  const direction = new THREE.Vector3();
  const midpoint = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const matrix = new THREE.Matrix4();
  segments.forEach(([start, end], index) => {
    direction.subVectors(end, start);
    const length = direction.length();
    midpoint.copy(start).addScaledVector(direction, 0.5);
    quaternion.setFromUnitVectors(UP, direction.normalize());
    scale.set(radius, length, radius);
    matrix.compose(midpoint, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = mesh.receiveShadow = true;
  group.add(mesh);
}

function addVerticalPins(group, points, height, radius, material) {
  const mesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(1, 0.88, 1, 7),
    material,
    points.length,
  );
  const matrix = new THREE.Matrix4();
  const scale = new THREE.Vector3(radius, height, radius);
  const position = new THREE.Vector3();
  points.forEach((point, index) => {
    position.copy(point).setY(point.y - height / 2);
    matrix.compose(position, new THREE.Quaternion(), scale);
    mesh.setMatrixAt(index, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = mesh.receiveShadow = true;
  group.add(mesh);
}

export function buildStringSystem(mats, layout) {
  const group = new THREE.Group();
  const steelVertices = [];
  const bassSegments = [];
  const tuningPins = [];
  const hitchPins = [];
  const agraffes = [];

  for (const route of layout.routes) {
    const segments = [
      [route.tuningPoint, route.frontBearingPoint],
      [route.frontBearingPoint, route.bridgePoint],
      [route.bridgePoint, route.hitchPoint],
    ];
    tuningPins.push(route.tuningPoint);
    hitchPins.push(route.hitchPoint);
    if (route.zone !== "treble") agraffes.push(route.frontBearingPoint);
    if (route.zone === "bass") bassSegments.push(...segments);
    else {
      for (const [start, end] of segments) {
        steelVertices.push(start.x, start.y, start.z, end.x, end.y, end.z);
      }
    }
  }

  addCylinderInstances(group, bassSegments, 0.016, mats.copper, 6);
  const steelGeometry = new THREE.BufferGeometry();
  steelGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(steelVertices, 3),
  );
  group.add(new THREE.LineSegments(steelGeometry, mats.trebleLine));
  addVerticalPins(
    group,
    tuningPins,
    DIM.tuningPinHeight,
    DIM.tuningPinRadius,
    mats.bronze,
  );
  addVerticalPins(
    group,
    hitchPins,
    DIM.hitchPinHeight,
    DIM.hitchPinRadius,
    mats.bronze,
  );
  addVerticalPins(group, agraffes, 0.042, 0.01, mats.gold);

  return tag(
    group,
    "Routed string field & tuning system",
    "Each representative string follows one straight plan-view trajectory through its tuning pin, front bearing, bridge crown and matched hitch pin. Bass strings form a coherent raised crossover family; tenor pairs and treble trichords remain restrained steel-grey.",
    "Acoustics",
  );
}
