import * as THREE from "three";

/**
 * Visual string-vibration overlay layered over the static string field.
 *
 * The approved bass InstancedMesh and steel LineSegments stay untouched; this
 * module owns a small pool of dynamic indexed LineSegments that trace the
 * speaking length (front bearing to bridge) of whichever string courses are
 * currently ringing loudest.
 */

const SAMPLES = 16;
const SEGMENTS = SAMPLES - 1;
const MAX_ROUTES_PER_COURSE = 3;
const POOL_SIZE = 20;
const MODE = 1;
// Sideways displacement carries a little vertical component so the motion
// reads from the hero camera as well as from directly above.
const VERTICAL_RATIO = 0.3;
// Below this fraction of a course peak amplitude the overlay is dropped.
const SILENCE_FRACTION = 0.02;
// A course already holding a pool slot must be beaten by this margin before a
// rival takes it, which stops slots flickering between near-equal amplitudes.
const HYSTERESIS = 1.3;

const ZONE_PROFILE = {
  bass: {
    amplitude: 0.012,
    naturalDecay: 0.55,
    dampedDecay: 11,
    color: 0x8a5636,
  },
  tenor: {
    amplitude: 0.006,
    naturalDecay: 0.9,
    dampedDecay: 13,
    color: 0x7c827e,
  },
  treble: {
    amplitude: 0.0035,
    naturalDecay: 1.5,
    dampedDecay: 15,
    color: 0x7c827e,
  },
};

// Semitone interval to sympathetic excitation weight, as a fraction of the
// struck note strike energy. Octaves couple hardest, fifths barely.
const SYMPATHETIC_INTERVALS = [
  [12, 0.18],
  [-12, 0.18],
  [24, 0.1],
  [-24, 0.1],
  [36, 0.07],
  [-36, 0.07],
  [7, 0.05],
  [-7, 0.05],
  [19, 0.05],
];

// Shape lookup tables: fixed for every course, so the per-frame inner loop
// carries no trigonometry on the envelope term.
const SAMPLE_T = new Float32Array(SAMPLES);
const SAMPLE_ENVELOPE = new Float32Array(SAMPLES);
for (let i = 0; i < SAMPLES; i++) {
  SAMPLE_T[i] = i / SEGMENTS;
  SAMPLE_ENVELOPE[i] = Math.sin(Math.PI * SAMPLE_T[i]);
}

/**
 * Compressed VISUALISATION frequency, not the acoustic frequency. A real A0
 * runs at 27.5 Hz and C8 at 4186 Hz; neither survives a 60-144 Hz display, so
 * the whole compass is mapped into a legible 7-19 Hz band instead.
 */
function visualFrequencyForMidi(midi) {
  return 7 + 12 * THREE.MathUtils.clamp((midi - 21) / 87, 0, 1);
}

function buildCourses(stringLayout) {
  const courses = new Map();
  for (const route of stringLayout.routes) {
    let course = courses.get(route.courseIndex);
    if (!course) {
      course = {
        courseIndex: route.courseIndex,
        zone: route.zone,
        profile: ZONE_PROFILE[route.zone],
        routes: [],
        midis: [],
        representativeMidi: 60,
        base: new Float32Array(MAX_ROUTES_PER_COURSE * SAMPLES * 3),
        phaseOffsets: new Float32Array(MAX_ROUTES_PER_COURSE),
        sideX: 0,
        sideZ: 0,
        amplitude: 0,
        phase: 0,
        visualFrequency: 12,
        openRefs: 0,
        undamped: false,
        lastVelocity: 0,
        slot: null,
        rank: -1,
      };
      courses.set(route.courseIndex, course);
    }
    course.routes.push(route);
  }

  for (const course of courses.values()) {
    const first = course.routes[0];
    const sideX = -(first.bridgePoint.z - first.frontBearingPoint.z);
    const sideZ = first.bridgePoint.x - first.frontBearingPoint.x;
    const sideLength = Math.hypot(sideX, sideZ) || 1;
    course.sideX = sideX / sideLength;
    course.sideZ = sideZ / sideLength;

    const count = course.routes.length;
    course.routes.forEach((route, index) => {
      // Neighbouring unison strings sit a hair out of phase so a trichord
      // shimmers instead of moving as one rigid ribbon.
      course.phaseOffsets[index] = (index - (count - 1) / 2) * 0.04;
      // Sampled along the real XZ trajectory, so bass keeps its diagonal
      // overstrung crossover rather than collapsing to a horizontal line.
      for (let i = 0; i < SAMPLES; i++) {
        const t = SAMPLE_T[i];
        const base = (index * SAMPLES + i) * 3;
        course.base[base] = THREE.MathUtils.lerp(
          route.frontBearingPoint.x,
          route.bridgePoint.x,
          t,
        );
        course.base[base + 1] = THREE.MathUtils.lerp(
          route.frontBearingPoint.y,
          route.bridgePoint.y,
          t,
        );
        course.base[base + 2] = THREE.MathUtils.lerp(
          route.frontBearingPoint.z,
          route.bridgePoint.z,
          t,
        );
      }
    });
  }
  return courses;
}

function createPool(group) {
  const indices = [];
  for (let route = 0; route < MAX_ROUTES_PER_COURSE; route++) {
    for (let i = 0; i < SEGMENTS; i++) {
      indices.push(route * SAMPLES + i, route * SAMPLES + i + 1);
    }
  }
  const slots = [];
  for (let index = 0; index < POOL_SIZE; index++) {
    const geometry = new THREE.BufferGeometry();
    const attribute = new THREE.BufferAttribute(
      new Float32Array(MAX_ROUTES_PER_COURSE * SAMPLES * 3),
      3,
    );
    attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", attribute);
    geometry.setIndex(indices.slice());
    const material = new THREE.LineBasicMaterial({
      transparent: true,
      depthTest: true,
      depthWrite: false,
      opacity: 0,
    });
    const line = new THREE.LineSegments(geometry, material);
    line.visible = false;
    // Overlays are pure decoration: never culled (their bounds are stale) and
    // never picked by the inspection raycaster.
    line.frustumCulled = false;
    line.raycast = () => {};
    group.add(line);
    slots.push({ line, geometry, material, attribute, course: null });
  }
  return slots;
}

/**
 * @param stringGroup Approved Strings component; the overlay is parented here
 *   so exploded-view transforms carry the vibration with the strings.
 * @param stringLayout Shared course map from createStringLayout().
 * @param actionMechanisms MIDI to action mechanism, the source of truth for the
 *   representative string route of every note.
 */
export function createStringResonance({
  stringGroup,
  stringLayout,
  actionMechanisms,
}) {
  const group = new THREE.Group();
  group.name = "stringResonance";
  stringGroup.add(group);

  const courses = buildCourses(stringLayout);
  const courseByMidi = new Map();
  for (const [midi, mechanism] of actionMechanisms) {
    const course = courses.get(mechanism.stringRoute?.courseIndex);
    if (!course) continue;
    courseByMidi.set(midi, course);
    course.midis.push(midi);
  }
  for (const course of courses.values()) {
    if (!course.midis.length) continue;
    course.representativeMidi = Math.round(
      course.midis.reduce((sum, midi) => sum + midi, 0) / course.midis.length,
    );
    course.visualFrequency = visualFrequencyForMidi(course.representativeMidi);
    // C7-C8 carry no dampers in the approved action; they only ever decay.
    course.undamped = course.midis.every((midi) => midi > 95);
  }

  // Sympathetic couplings are resolved once here, so a strike costs one short
  // list walk rather than an 88 x 88 scan.
  const sympatheticByMidi = new Map();
  for (const [midi, course] of courseByMidi) {
    const targets = new Map();
    for (const [interval, weight] of SYMPATHETIC_INTERVALS) {
      const target = courseByMidi.get(midi + interval);
      if (!target || target === course) continue;
      targets.set(target, Math.max(targets.get(target) ?? 0, weight));
    }
    sympatheticByMidi.set(
      midi,
      [...targets].map(([target, weight]) => ({ course: target, weight })),
    );
  }

  const slots = createPool(group);
  const courseList = [...courses.values()];
  const ranked = courseList.slice();
  const openMidis = new Set();
  let sustain = false;
  let activeCourses = 0;
  // DEV-only inspection aid; production vibration always ships at 1.
  let debugScale = 1;

  /** Live damper state, so a strike in the same frame as the pedal sees it. */
  function isDamped(course) {
    return !course.undamped && !sustain && course.openRefs === 0;
  }

  function excite(course, energy) {
    course.amplitude = Math.min(
      course.profile.amplitude,
      course.amplitude + course.profile.amplitude * energy,
    );
  }

  function strike(midi, velocity = 0.75) {
    const course = courseByMidi.get(midi);
    if (!course) return;
    // Compressed velocity response: hard notes read louder without turning the
    // string into a rubber band. Energy adds to whatever is still ringing, so a
    // fast repeat feels continuous instead of visually restarting.
    const energy = Math.sqrt(THREE.MathUtils.clamp(velocity, 0, 1));
    course.lastVelocity = velocity;
    excite(course, energy);
    for (const { course: target, weight } of sympatheticByMidi.get(midi)) {
      // A closed damper kills sympathetic response, so this stays effectively
      // invisible until sustain (or a held key) has opened the target.
      if (isDamped(target)) continue;
      // Weights are a fraction of the played note world displacement, not of
      // the target own peak, so a treble note cannot over-swing a bass octave.
      excite(
        target,
        (energy * weight * course.profile.amplitude) / target.profile.amplitude,
      );
    }
  }

  /** Mirrors the performance controller damper ownership, one MIDI at a time. */
  function setDamperOpen(midi, open) {
    const course = courseByMidi.get(midi);
    if (!course || open === openMidis.has(midi)) return;
    if (open) {
      openMidis.add(midi);
      course.openRefs++;
    } else {
      openMidis.delete(midi);
      course.openRefs--;
    }
  }

  function setSustain(down) {
    sustain = down;
  }

  function update(dt) {
    if (!(dt > 0)) return;
    activeCourses = 0;
    for (const course of courseList) {
      if (course.amplitude <= 0) continue;
      // Damper state controls decay speed only; a held key never re-injects
      // energy, so the string decays even while the key stays down.
      const decay = isDamped(course)
        ? course.profile.dampedDecay
        : course.profile.naturalDecay;
      course.amplitude *= Math.exp(-decay * dt);
      if (course.amplitude < course.profile.amplitude * SILENCE_FRACTION) {
        course.amplitude = 0;
        continue;
      }
      course.phase =
        (course.phase + 2 * Math.PI * course.visualFrequency * dt) %
        (2 * Math.PI);
      activeCourses++;
    }

    ranked.sort(
      (a, b) =>
        b.amplitude * (b.slot ? HYSTERESIS : 1) -
        a.amplitude * (a.slot ? HYSTERESIS : 1),
    );
    for (let index = 0; index < ranked.length; index++) {
      const course = ranked[index];
      const wanted = index < POOL_SIZE && course.amplitude > 0;
      if (!wanted && course.slot) {
        course.slot.line.visible = false;
        course.slot.course = null;
        course.slot = null;
      }
      course.rank = wanted ? index : -1;
    }
    for (const course of ranked) {
      if (course.rank < 0 || course.slot) continue;
      const free = slots.find((slot) => !slot.course);
      if (!free) break;
      free.course = course;
      course.slot = free;
      free.material.color.setHex(course.profile.color);
      free.geometry.setDrawRange(0, course.routes.length * SEGMENTS * 2);
      free.line.visible = true;
    }

    for (const slot of slots) {
      const course = slot.course;
      if (!course) continue;
      slot.material.opacity =
        0.22 + 0.6 * (course.amplitude / course.profile.amplitude);
      const scale = course.amplitude * debugScale;
      const positions = slot.attribute.array;
      for (let route = 0; route < course.routes.length; route++) {
        const phase = course.phase + course.phaseOffsets[route];
        for (let i = 0; i < SAMPLES; i++) {
          // Fixed endpoints: the envelope is zero at the front bearing and at
          // the bridge, so the overlay can never drift off its hardware.
          const wave =
            scale *
            SAMPLE_ENVELOPE[i] *
            Math.sin(phase + MODE * Math.PI * SAMPLE_T[i]);
          const base = (route * SAMPLES + i) * 3;
          positions[base] = course.base[base] + course.sideX * wave;
          positions[base + 1] = course.base[base + 1] + wave * VERTICAL_RATIO;
          positions[base + 2] = course.base[base + 2] + course.sideZ * wave;
        }
      }
      slot.attribute.needsUpdate = true;
    }
  }

  function inspectMidi(midi) {
    const course = courseByMidi.get(midi);
    if (!course) return null;
    return {
      midi,
      courseIndex: course.courseIndex,
      zone: course.zone,
      amplitude: course.amplitude,
      damped: isDamped(course),
      visualFrequency: course.visualFrequency,
      mappedRoutes: course.routes,
      sympatheticTargets: sympatheticByMidi
        .get(midi)
        .map(({ course: target, weight }) => ({
          courseIndex: target.courseIndex,
          zone: target.zone,
          weight,
        })),
    };
  }

  return {
    group,
    strike,
    setDamperOpen,
    setSustain,
    update,
    inspectMidi,
    get debugScale() {
      return debugScale;
    },
    set debugScale(value) {
      debugScale = value;
    },
    get activeCourses() {
      return activeCourses;
    },
    get poolUsage() {
      return slots.filter((slot) => slot.course).length;
    },
    get poolSize() {
      return POOL_SIZE;
    },
  };
}
