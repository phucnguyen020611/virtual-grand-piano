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

function routeOffset(route, amount) {
  const direction = new THREE.Vector3().subVectors(
    route.bridgePoint,
    route.frontBearingPoint,
  );
  const sideways = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
  return Object.fromEntries(
    Object.entries(route).map(([key, point]) => [
      key,
      point.clone().addScaledVector(sideways, amount),
    ]),
  );
}

/**
 * Static, shared course map. A course may fan into one, two, or three nearby
 * strings, but every individual string receives its own endpoint pins.
 */
export function createStringLayout() {
  const routes = [];
  const mainBridge = mainBridgeCurve();
  const bassBridge = bassBridgeCurve();
  const hitchRail = hitchRailCurve();
  const zones = [
    { name: "bass", courses: 12, strings: 1, spacing: 0, radius: 0.022 },
    { name: "tenor", courses: 13, strings: 2, spacing: 0.032, radius: 0 },
    { name: "treble", courses: 18, strings: 3, spacing: 0.024, radius: 0 },
  ];
  const totalCourses = zones.reduce((sum, zone) => sum + zone.courses, 0);
  let courseIndex = 0;

  for (const zone of zones) {
    for (let course = 0; course < zone.courses; course++) {
      const localT = zone.courses === 1 ? 0 : course / (zone.courses - 1);
      const fieldT = courseIndex / (totalCourses - 1);
      const tuningX = THREE.MathUtils.lerp(-2.84, 2.84, fieldT);
      const row = courseIndex % 3;
      const route = {
        tuningPoint: new THREE.Vector3(
          tuningX,
          DIM.tuningPointY,
          1.18 + row * 0.12,
        ),
        frontBearingPoint: new THREE.Vector3(
          tuningX + THREE.MathUtils.lerp(-0.08, 0.08, fieldT),
          DIM.frontBearingY,
          1.02,
        ),
        bridgePoint: null,
        hitchPoint: null,
      };

      if (zone.name === "bass") {
        route.bridgePoint = curvePoint(
          bassBridge,
          0.08 + localT * 0.82,
          DIM.bridgeContactY,
        );
        route.hitchPoint = curvePoint(
          hitchRail,
          0.62 + localT * 0.28,
          DIM.hitchPointY,
        );
      } else if (zone.name === "tenor") {
        route.bridgePoint = curvePoint(
          mainBridge,
          0.92 - localT * 0.42,
          DIM.bridgeContactY,
        );
        route.hitchPoint = curvePoint(
          hitchRail,
          0.72 - localT * 0.25,
          DIM.hitchPointY,
        );
      } else {
        route.bridgePoint = curvePoint(
          mainBridge,
          0.52 - localT * 0.48,
          DIM.bridgeContactY,
        );
        route.hitchPoint = curvePoint(
          hitchRail,
          0.47 - localT * 0.38,
          DIM.hitchPointY,
        );
      }

      for (let string = 0; string < zone.strings; string++) {
        const offset = (string - (zone.strings - 1) / 2) * zone.spacing;
        routes.push({
          ...routeOffset(route, offset),
          zone: zone.name,
          courseIndex,
          stringIndex: string,
          radius: zone.radius,
        });
      }
      courseIndex++;
    }
  }
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
    midpoint.copy(start).addScaledVector(direction, 0.5);
    quaternion.setFromUnitVectors(UP, direction.normalize());
    scale.set(radius, direction.length(), radius);
    matrix.compose(midpoint, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = mesh.receiveShadow = true;
  group.add(mesh);
}

function addVerticalPins(group, points, height, radius, material) {
  const mesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(1, 0.88, 1, 8),
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

/** Build the routed string paths and their endpoint/bearing hardware. */
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
    if (route.zone === "bass" || route.zone === "tenor") {
      agraffes.push(route.frontBearingPoint);
    }

    if (route.zone === "bass") {
      bassSegments.push(...segments);
    } else {
      for (const [start, end] of segments) {
        steelVertices.push(start.x, start.y, start.z, end.x, end.y, end.z);
      }
    }
  }

  addCylinderInstances(group, bassSegments, 0.022, mats.copper, 6);
  const steelGeometry = new THREE.BufferGeometry();
  steelGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(steelVertices, 3),
  );
  group.add(new THREE.LineSegments(steelGeometry, mats.trebleLine));
  addVerticalPins(group, tuningPins, DIM.tuningPinHeight, 0.025, mats.bronze);
  addVerticalPins(group, hitchPins, DIM.hitchPinHeight, 0.027, mats.bronze);
  addVerticalPins(group, agraffes, 0.055, 0.014, mats.gold);

  return tag(
    group,
    "Routed string field & tuning system",
    "Each visible string follows a four-point course: tuning pin, front bearing, bridge crown, and matching hitch pin. Bass courses are single copper-wound strings; tenor pairs and treble trichords share the steel field.",
    "Acoustics",
  );
}
