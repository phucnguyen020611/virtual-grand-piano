import * as THREE from "three";
import { creditsSlide } from "./credits.js";

/**
 * A round, lantern-show projection on the hall's rear wall, cast as warm,
 * worn old-film light: the playing piece's composer (their portrait or,
 * failing one, a title card) with the name in glowing script, or the closing
 * credits rolling up the disc.
 */

const SCRIPT = '"Pinyon Script", "Cormorant Garamond", Georgia, cursive';
const SERIF = '"Cormorant Garamond", Georgia, serif';
const SIZE = 1024;

/** Draw a song's slide: portrait (when there is one), name and title. */
function slide(song, portrait) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const g = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const draw = (image) => {
    g.fillStyle = "#000";
    g.fillRect(0, 0, SIZE, SIZE);
    if (image) {
      // The 4:5 portraits, cropped square round the face.
      const side = image.width;
      g.drawImage(
        image,
        0,
        image.height * 0.42 - side / 2,
        side,
        side,
        0,
        0,
        SIZE,
        SIZE,
      );
      const shade = g.createLinearGradient(0, SIZE * 0.55, 0, SIZE);
      shade.addColorStop(0, "rgba(0, 0, 0, 0)");
      shade.addColorStop(1, "rgba(0, 0, 0, 0.92)");
      g.fillStyle = shade;
      g.fillRect(0, 0, SIZE, SIZE);
    } else {
      // No portrait survives: a title card ringed in gilt instead.
      g.strokeStyle = "#c99a45";
      for (const [r, w] of [
        [440, 8],
        [410, 2],
      ]) {
        g.lineWidth = w;
        g.beginPath();
        g.arc(SIZE / 2, SIZE / 2, r, 0, 2 * Math.PI);
        g.stroke();
      }
    }
    g.textAlign = "center";
    g.shadowColor = "rgba(255, 200, 110, 0.9)";
    g.fillStyle = "#f6d98f";
    const name = image ? song.composer : song.title;
    const below = image ? song.title : song.composer;
    g.font = `400 ${image ? 100 : 140}px ${SCRIPT}`;
    for (const blur of [30, 10]) {
      g.shadowBlur = blur;
      // Kept inside the disc's chord at that height.
      g.fillText(
        name,
        SIZE / 2,
        image ? 790 : 540,
        SIZE * (image ? 0.66 : 0.74),
      );
    }
    g.shadowBlur = 8;
    g.font = `italic 500 ${image ? 46 : 54}px ${SERIF}`;
    g.fillText(below, SIZE / 2, image ? 862 : 640, SIZE * 0.5);
    g.shadowBlur = 0;
    texture.needsUpdate = true;
  };
  // The wall's own portrait texture: drawn, and shown, once its image is in;
  // redrawn when the script face arrives, whenever that is.
  const paint = () => texture.userData.ready && draw(portrait?.image);
  document.fonts?.load(`100px ${SCRIPT}`).then(paint, () => {});
  texture.userData.poll = () => {
    if (texture.userData.ready || (portrait && !portrait.image)) return;
    texture.userData.ready = true;
    paint();
  };
  return texture;
}

const fragmentShader = /* glsl */ `
  uniform sampler2D map;
  uniform float fade;
  uniform float time;
  uniform float wear; // 1 = worn old film, 0 = steady (reduced motion)
  varying vec2 vUv;
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    // A lantern's disc: soft edge, a brighter rim, a darker falloff inward.
    float disc = smoothstep(1.0, 0.9, r);
    float rim = smoothstep(0.86, 0.97, r) * smoothstep(1.0, 0.95, r);
    // Hand-cranked at 18 frames a second, each frame shivering in the gate.
    float frame = floor(time * 18.0) * wear;
    vec2 weave = (vec2(hash(vec2(frame, 1.0)), hash(vec2(frame, 2.0))) - 0.5)
      * vec2(0.003, 0.006) * wear;
    vec3 image = texture2D(map, vUv + weave).rgb;
    vec3 warm = vec3(1.0, 0.83, 0.58);
    // Carbon-arc light: a little sepia, a deep vignette.
    float grey = dot(image, vec3(0.299, 0.587, 0.114));
    vec3 color = mix(image, grey * warm, 0.3) * (1.0 - 0.45 * r * r);
    // Wear on the print: grain, two scratches that wander down the reel,
    // and the odd fleck of dust.
    color *= 1.0 + (hash(vUv * 613.0 + frame) - 0.5) * 0.35 * wear;
    for (int i = 0; i < 2; i++) {
      float n = float(i);
      float x = hash(vec2(floor(time * 0.7 + n * 0.5), n + 3.0));
      x += 0.01 * sin(time * 2.0 + n * 4.0);
      float shows = step(0.35, hash(vec2(frame, n + 5.0)));
      float line = 1.0 - smoothstep(0.0, 0.0018, abs(vUv.x - x));
      color += warm * line * shows * 0.05 * wear;
    }
    vec2 cell = floor(vUv * 14.0);
    vec2 at = fract(vUv * 14.0) - 0.5;
    float fleck = step(0.993, hash(cell + frame * 0.37));
    color *= 1.0 - fleck * (1.0 - smoothstep(0.05, 0.12, length(at))) * wear;
    // An uneven flicker, frame to frame.
    float flicker = 0.95 + 0.03 * sin(time * 23.0) + 0.02 * sin(time * 7.3);
    flicker += (hash(vec2(frame, 9.0)) - 0.5) * 0.07 * wear;
    color = (color * disc + warm * (0.06 * disc + 0.18 * rim)) * flicker;
    gl_FragColor = vec4(max(color, 0.0) * fade * 1.4, 1.0);
    #include <colorspace_fragment>
  }
`;

// The lantern's light on its way to the wall, caught in the hall's haze:
// densest along the axis and near the lens, specked with drifting dust.
const beamFragment = /* glsl */ `
  uniform float fade;
  uniform float time;
  uniform float wear;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vLocal;
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }
  void main() {
    float along = vLocal.y; // 0 at the lens, 1 at the wall
    float core = pow(abs(dot(normalize(vNormal), normalize(vView))), 2.0);
    float ends = smoothstep(0.0, 0.03, along) * smoothstep(1.0, 0.9, along);
    vec2 cell = vec2(atan(vLocal.x, vLocal.z) * 9.0, along * 140.0 - time * 0.6);
    vec2 at = fract(cell) - 0.5;
    float seed = hash(floor(cell));
    float dust = step(0.9, seed) * smoothstep(0.22, 0.0, length(at))
      * (0.5 + 0.5 * sin(time * (2.0 + 5.0 * seed) + seed * 40.0));
    float frame = floor(time * 18.0) * wear;
    float flicker = 0.94 + (hash(vec2(frame, 9.0)) - 0.5) * 0.08 * wear;
    vec3 warm = vec3(1.0, 0.83, 0.58);
    float glow = core * (1.0 - 0.7 * along) * 0.09 + dust * 0.1;
    gl_FragColor = vec4(warm * glow * ends * flicker * fade, 1.0);
    #include <colorspace_fragment>
  }
`;

/**
 * @param parent the hall group
 * @param at centre of the disc on the wall; the disc faces −z (the stage)
 * @param portraits composer name → their portrait texture on the wall
 * @param lantern the instrument that casts it: { lens: position, material }
 */
export function createComposerProjection(
  parent,
  at,
  diameter,
  portraits,
  lantern,
) {
  const uniforms = {
    map: { value: null },
    fade: { value: 0 },
    time: { value: 0 },
    wear: { value: 1 },
  };
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const disc = new THREE.Mesh(
    new THREE.PlaneGeometry(diameter, diameter),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    }),
  );
  disc.name = "composer-projection";
  disc.position.copy(at);
  disc.rotation.y = Math.PI;
  disc.visible = false;
  parent.add(disc);

  // The beam, an open cone from the lens to the disc's rim.
  const reach = at.distanceTo(lantern.lens);
  const cone = new THREE.CylinderGeometry(
    diameter * 0.46,
    0.45,
    reach,
    40,
    1,
    true,
  );
  cone.translate(0, reach / 2, 0);
  const beam = new THREE.Mesh(
    cone,
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vView;
        varying vec3 vLocal;
        void main() {
          vLocal = vec3(position.x, position.y / ${reach.toFixed(2)}, position.z);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalMatrix * normal;
          vView = -mv.xyz;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: beamFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );
  beam.name = "lantern-beam";
  beam.position.copy(lantern.lens);
  beam.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    at.clone().sub(lantern.lens).normalize(),
  );
  beam.visible = false;
  parent.add(beam);
  const lensDark = lantern.material.color.clone();
  const lensLit = new THREE.Color(0xffe2b0).multiplyScalar(3);

  const slides = new Map();
  let wanted = null; // the slide's key, or null for none
  const cast = (key, make) => {
    wanted = key;
    if (key && !slides.has(key)) slides.set(key, make());
  };
  return {
    /** Show the song's composer, or fade out with `null`. */
    show(song) {
      cast(song?.id, () => slide(song, portraits[song.composer]));
    },
    /** Roll the closing credits from the top. */
    rollCredits() {
      cast("credits", creditsSlide);
      slides.get("credits").userData.restart();
    },
    update(dt) {
      uniforms.time.value += Math.min(dt, 0.1);
      uniforms.wear.value = reducedMotion.matches ? 0 : 1;
      const pending = wanted && slides.get(wanted);
      pending?.userData.poll?.();
      const next = pending?.userData.ready ? pending : null;
      // Fade out before changing slides; fade the new one in.
      const target = next && uniforms.map.value === next ? 1 : 0;
      const f = uniforms.fade.value;
      uniforms.fade.value = THREE.MathUtils.clamp(
        f + Math.sign(target - f) * (dt / 1.2),
        0,
        1,
      );
      if (uniforms.fade.value === 0) uniforms.map.value = next ?? null;
      uniforms.map.value?.userData.tick?.(dt);
      disc.visible = beam.visible = uniforms.fade.value > 0;
      lantern.material.color.lerpColors(lensDark, lensLit, uniforms.fade.value);
    },
  };
}
