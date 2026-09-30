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

/** Build one straight plan-view route from a bridge contact and rail hitch. */
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

function routeFitsTuningField(route) {
  const { tuningPoint, frontBearingPoint } = route;
  return (
    tuningPoint.x >= DIM.tuningFieldMinX &&
    tuningPoint.x <= DIM.tuningFieldMaxX &&
    frontBearingPoint.x >= DIM.frontBearingMinX &&
    frontBearingPoint.x <= DIM.frontBearingMaxX &&
    tuningPoint.x >= DIM.pinblockMinX &&
    tuningPoint.x <= DIM.pinblockMaxX &&
    tuningPoint.z >= DIM.pinblockMinZ &&
    tuningPoint.z <= DIM.pinblockMaxZ
  );
}

/**
 * Pick a hitch location from the rail that satisfies a desired tuning-field
 * coordinate. This keeps all four route points collinear in plan view rather
 * than clamping a completed route and introducing a bridge kink.
 */
function solveConstrainedRoute(
  bridgePoint,
  hitchRail,
  hitchRange,
  desiredTuningX,
  tuningZ,
  stringY,
) {
  let bestRoute;
  let bestScore = Infinity;
  let bestT = hitchRange[0];
  const tryT = (t) => {
    const route = makeStraightRoute(
      bridgePoint.clone(),
      curvePoint(hitchRail, t, 0),
      tuningZ,
      stringY,
    );
    // Even spacing belongs at the front bearing (next to the strike line);
    // the staggered tuning-pin rows then fall wherever each line lands.
    const error = route.frontBearingPoint.x - desiredTuningX;
    const score = error * error;
    if (routeFitsTuningField(route) && score < bestScore) {
      bestRoute = route;
      bestScore = score;
      bestT = t;
    }
  };
  const samples = 180;
  const step = (hitchRange[1] - hitchRange[0]) / samples;
  for (let sample = 0; sample <= samples; sample++)
    tryT(hitchRange[0] + sample * step);
  // Refine around the coarse winner so neighbouring courses stay in order.
  const coarse = bestT;
  for (let sample = -40; sample <= 40; sample++)
    tryT(THREE.MathUtils.clamp(coarse + (sample / 40) * step, 0, 1));
  if (!bestRoute) {
    throw new Error(
      `No valid hitch-rail solution for string route at tuning X ${desiredTuningX}.`,
    );
  }
  return bestRoute;
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
  const directionFailures = [];
  const boundsFailures = [];
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
    if (change > tolerance) directionFailures.push({ route, change });
    if (!routeFitsTuningField(route)) boundsFailures.push(route);
  }
  if (import.meta.env?.DEV && directionFailures.length) {
    console.warn(
      "String routes exceed the plan-view direction tolerance.",
      directionFailures,
    );
  }
  if (import.meta.env?.DEV && boundsFailures.length) {
    console.warn(
      "String routes extend outside the tuning-pin field.",
      boundsFailures,
    );
  }
  return { maximum, directionFailures, boundsFailures };
}

/** Static, shared course map consumed by strings, bridges, and pin fields. */
export function createStringLayout() {
  const routes = [];
  const mainBridge = mainBridgeCurve();
  const bassBridge = bassBridgeCurve();
  const hitchRail = hitchRailCurve();
  // One course per key, as on a real grand, so every hammer and damper sits
  // on its own string. Courses are evenly spaced per semitone (keys are not:
  // E-F and B-C have no black key between), as a real action is.
  const zones = [
    // Wound single bass strings, overstrung on the rear bass bridge.
    {
      name: "bass",
      from: 21,
      to: 40,
      strings: 1,
      spacing: 0,
      stringY: 0.014,
      bridgeRange: [0.94, 0.06],
      hitchRange: [0, 1],
    },
    {
      name: "tenor",
      from: 41,
      to: 60,
      strings: 2,
      spacing: 0.02,
      stringY: 0,
      bridgeRange: [0.96, 0.55],
      hitchRange: [0, 1],
    },
    {
      name: "treble",
      from: 61,
      to: 108,
      strings: 3,
      spacing: 0.014,
      stringY: 0,
      bridgeRange: [0.54, 0.04],
      hitchRange: [0, 1],
    },
  ];
  const courseX = (midi) => THREE.MathUtils.lerp(-2.69, 2.69, (midi - 21) / 87);
  let courseIndex = 0;

  for (const zone of zones) {
    for (let midi = zone.from; midi <= zone.to; midi++) {
      const t = (midi - zone.from) / (zone.to - zone.from);
      const bridge = zone.name === "bass" ? bassBridge : mainBridge;
      const bridgePoint = curvePoint(
        bridge,
        THREE.MathUtils.lerp(zone.bridgeRange[0], zone.bridgeRange[1], t),
        0,
      );

      const row = courseIndex % 3;
      const route = solveConstrainedRoute(
        bridgePoint,
        hitchRail,
        zone.hitchRange,
        courseX(midi),
        DIM.tuningPinZ + row * DIM.tuningRowStep,
        zone.stringY,
      );
      for (let string = 0; string < zone.strings; string++) {
        const offset = (string - (zone.strings - 1) / 2) * zone.spacing;
        routes.push({
          ...routeOffset(route, offset),
          zone: zone.name,
          courseIndex,
          midi,
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

  addCylinderInstances(
    group,
    bassSegments,
    DIM.bassStringRadius,
    mats.copper,
    6,
  );
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
