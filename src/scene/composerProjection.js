import * as THREE from "three";

/**
 * A round, lantern-show projection of the playing piece's composer on the
 * hall's rear wall: their portrait (or, failing one, a title card) with the
 * name in glowing script, cast as warm light that fades in with autoplay.
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
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    // A lantern's disc: soft edge, a brighter rim, a darker falloff inward.
    float disc = smoothstep(1.0, 0.9, r);
    float rim = smoothstep(0.86, 0.97, r) * smoothstep(1.0, 0.95, r);
    vec3 image = texture2D(map, vUv).rgb;
    vec3 warm = vec3(1.0, 0.83, 0.58);
    // Old carbon-arc light: a little sepia and a faint, uneven flicker.
    float grey = dot(image, vec3(0.299, 0.587, 0.114));
    vec3 color = mix(image, grey * warm, 0.3) * (1.0 - 0.35 * r * r);
    float flicker = 0.95 + 0.03 * sin(time * 23.0) + 0.02 * sin(time * 7.3);
    color = (color * disc + warm * (0.06 * disc + 0.18 * rim)) * flicker;
    gl_FragColor = vec4(color * fade * 1.4, 1.0);
    #include <colorspace_fragment>
  }
`;

/**
 * @param parent the hall group
 * @param at centre of the disc on the wall; the disc faces −z (the stage)
 * @param portraits composer name → their portrait texture on the wall
 */
export function createComposerProjection(parent, at, diameter, portraits) {
  const uniforms = {
    map: { value: null },
    fade: { value: 0 },
    time: { value: 0 },
  };
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

  const slides = new Map();
  let wanted = null; // the song to show, or null for none
  return {
    /** Show the song's composer, or fade out with `null`. */
    show(song) {
      wanted = song;
      if (song && !slides.has(song.id))
        slides.set(song.id, slide(song, portraits[song.composer]));
    },
    update(dt) {
      uniforms.time.value += Math.min(dt, 0.1);
      const pending = wanted && slides.get(wanted.id);
      pending?.userData.poll();
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
      disc.visible = uniforms.fade.value > 0;
    },
  };
}
