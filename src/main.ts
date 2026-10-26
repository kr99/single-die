import * as THREE from "three";
import { SigilDie } from "./die";
import { GLYPH_SYMBOLS, RUNE_NAMES, createGlyphAtlas } from "./glyphs";
import { createComposer } from "./postfx";
import type { ShapeId } from "./polyhedra";
import { createWorld } from "./world";

function fail(message: string): void {
  const unsupported = document.querySelector<HTMLElement>("#unsupported");
  if (unsupported) {
    unsupported.textContent = message;
    unsupported.hidden = false;
  }
  const boot = document.querySelector<HTMLElement>("#boot");
  boot?.classList.add("is-hidden");
}

function boot(): void {
  const host = document.querySelector<HTMLElement>("#canvas-host");
  const bootOverlay = document.querySelector<HTMLElement>("#boot");
  if (!host) return;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      stencil: false,
    });
  } catch {
    fail("This reliquary needs WebGL2. Try a newer browser or enable hardware acceleration.");
    return;
  }

  if (!renderer.capabilities.isWebGL2) {
    renderer.dispose();
    fail("This reliquary needs WebGL2. Try a newer browser or enable hardware acceleration.");
    return;
  }

  const debugInfo = renderer.getContext().getExtension("WEBGL_debug_renderer_info");
  const gpuName = debugInfo
    ? String(renderer.getContext().getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
    : "";
  const qualityOverride = new URLSearchParams(window.location.search).get("quality");
  const lowQuality =
    qualityOverride === "low" ||
    (qualityOverride !== "high" && /swiftshader|llvmpipe|software/i.test(gpuName));

  if (lowQuality) renderer.transmissionResolutionScale = 0.55;

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x030209, 1);
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.setAttribute(
    "aria-label",
    "A translucent glass die inscribed with glowing arcane sigils, floating before a ritual circle. Poke it to cast.",
  );
  host.appendChild(renderer.domElement);

  renderer.domElement.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    fail("The reliquary lost its light. Reload the page to rekindle it.");
  });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030209);

  const camera = new THREE.PerspectiveCamera(33, window.innerWidth / window.innerHeight, 0.1, 70);
  const baseCameraPosition = new THREE.Vector3(0, 0.62, 6.4);
  const cameraTarget = new THREE.Vector3(0, 0.03, 0);
  camera.position.copy(baseCameraPosition);
  camera.lookAt(cameraTarget);

  const world = createWorld(scene, renderer, lowQuality);

  const atlas = createGlyphAtlas();
  atlas.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const shared = {
    uTime: { value: 0 },
    uBurst: { value: 0 },
  };

  const die = new SigilDie(scene, camera, atlas, shared, lowQuality);

  const { composer, film } = createComposer(renderer, scene, camera, !lowQuality, !lowQuality);

  // --- HUD -----------------------------------------------------------------
  const readout = document.querySelector<HTMLElement>(".readout");
  const readoutGlyph = document.querySelector<HTMLElement>("#glyph-char");
  const readoutName = document.querySelector<HTMLElement>("#glyph-name");
  const readoutState = document.querySelector<HTMLElement>("#readout-state");
  const shapeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".shape-btn"));
  const shapeLabels: Record<ShapeId, string> = { d6: "D6", d8: "D8", d20: "D20" };
  let readoutTimer: number | undefined;

  const renderReadout = (symbolIndex: number, faceIndex: number, shape: ShapeId, casting: boolean) => {
    if (readoutGlyph) readoutGlyph.textContent = GLYPH_SYMBOLS[symbolIndex % GLYPH_SYMBOLS.length];
    if (readoutName) readoutName.textContent = RUNE_NAMES[symbolIndex % RUNE_NAMES.length];
    if (readoutState) {
      const sides = die.sides;
      readoutState.textContent = casting
        ? `${shapeLabels[shape]} // FACE ${faceIndex + 1} OF ${sides}`
        : "AWAITING TOUCH";
    }
    if (readout && casting) {
      readout.classList.remove("is-casting");
      void readout.offsetWidth;
      readout.classList.add("is-casting");
    }
    if (readoutTimer !== undefined) window.clearTimeout(readoutTimer);
    if (casting) {
      readoutTimer = window.setTimeout(() => {
        if (readoutState) readoutState.textContent = "AWAITING TOUCH";
      }, 2400);
    }
  };

  const setActiveShape = (shape: ShapeId) => {
    for (const button of shapeButtons) {
      const active = button.dataset.shape === shape;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
  };

  setActiveShape("d6");
  renderReadout(die.symbolIndex, die.faceIndex, "d6", false);

  for (const button of shapeButtons) {
    button.addEventListener("click", () => {
      const shape = button.dataset.shape as ShapeId | undefined;
      if (!shape) return;
      setActiveShape(shape);
      const faceIndex = die.setShape(shape);
      renderReadout(die.symbolIndex, faceIndex, shape, true);
    });
  }

  // --- Interaction ---------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const pointer = new THREE.Vector2();
  const updatePointer = (event: PointerEvent) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointerNdc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    pointer.set(pointerNdc.x, pointerNdc.y);
    die.setPointer(pointerNdc.x, pointerNdc.y);

    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObject(die.hitMesh, false);
    renderer.domElement.style.cursor = hits.length > 0 ? "pointer" : "default";
  };

  const cast = () => {
    const result = die.poke();
    renderReadout(result.symbolIndex, result.faceIndex, die.shapeId, true);
  };

  window.addEventListener("pointermove", updatePointer, { passive: true });

  renderer.domElement.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointerNdc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObject(die.hitMesh, false);
    if (hits.length > 0) cast();
  });

  window.addEventListener("keydown", (event) => {
    if (event.code !== "Space" && event.code !== "Enter") return;
    if (event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    cast();
  });

  // --- Sizing --------------------------------------------------------------
  const applySize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const aspect = width / height;

    // Cap the drawing-buffer budget on high-DPI / 4K displays: transmission
    // and the post chain get expensive quickly beyond a few megapixels.
    const pixelRatio = lowQuality
      ? Math.min(0.5, Math.sqrt(700_000 / (width * height)))
      : Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(3_000_000 / (width * height)));

    // Portrait screens need a wider vertical field of view and a little more
    // breathing room, otherwise the die's silhouette is cropped.
    camera.fov = THREE.MathUtils.clamp(33 / Math.min(1, aspect), 33, 62);
    baseCameraPosition.z = 6.4 + THREE.MathUtils.clamp((0.85 - aspect) * 1.8, 0, 0.8);

    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(width, height);
    film?.uniforms.uResolution.value.set(width * pixelRatio, height * pixelRatio);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  };

  applySize();
  window.addEventListener("resize", applySize, { passive: true });

  // --- Render loop ---------------------------------------------------------
  const startTime = window.performance.now();
  let previousTime = startTime;
  let firstFrame = true;

  const tick = () => {
    const now = window.performance.now();
    const dt = Math.min((now - previousTime) / 1000, 0.05);
    previousTime = now;
    const time = (now - startTime) / 1000;

    world.update(time, dt);
    die.update(time, dt);

    // Gentle pointer parallax on the camera.
    const parallax = 1 - Math.exp(-dt * 2.2);
    camera.position.x += (baseCameraPosition.x + pointer.x * 0.3 - camera.position.x) * parallax;
    camera.position.y += (baseCameraPosition.y + pointer.y * 0.16 - camera.position.y) * parallax;
    camera.position.z += (baseCameraPosition.z - camera.position.z) * parallax;
    camera.lookAt(cameraTarget);

    if (film) film.uniforms.uTime.value = time;
    composer.render();

    if (firstFrame) {
      firstFrame = false;
      window.setTimeout(() => bootOverlay?.classList.add("is-hidden"), 420);
    }

    window.requestAnimationFrame(tick);
  };

  window.requestAnimationFrame(tick);
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
