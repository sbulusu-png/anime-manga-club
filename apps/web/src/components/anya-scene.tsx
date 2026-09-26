"use client";

import { useEffect, useRef } from "react";
import {
  ACESFilmicToneMapping,
  Box3,
  Group,
  MathUtils,
  type Object3D,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const MODEL_URL = "/models/anya.glb";
const SPIN_SPEED = 1.2; // radians per second while idling
const FOV = 30;

// Loaded once and reused if the toggle remounts (React does that in development).
let model: Promise<Object3D> | null = null;
function loadModel() {
  model ??= new GLTFLoader()
    // The model is meshopt-compressed (see CREDITS.md).
    .setMeshoptDecoder(MeshoptDecoder)
    .loadAsync(MODEL_URL)
    .then((gltf) => gltf.scene)
    .catch((err: unknown) => {
      model = null; // let the next mount try again
      throw err;
    });
  return model;
}

interface AnyaProps {
  /** Each click adds half a turn, eased in over ~0.5s. */
  spins: number;
  reducedMotion: boolean;
}

/**
 * The 3D Anya, drawn with plain three.js and only the parts of it this needs, so the
 * download stays small. Loaded on its own so three.js never delays the page.
 */
export default function AnyaScene({ spins, reducedMotion }: AnyaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // The render loop reads the latest props through these, without restarting.
  const spinsRef = useRef(spins);
  const reducedRef = useRef(reducedMotion);
  const syncRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
    });
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.style.display = "block";
    container.appendChild(renderer.domElement);

    const scene = new Scene();
    const camera = new PerspectiveCamera(FOV, 1, 0.01, 10);
    const pivot = new Group();
    scene.add(pivot);

    const resize = () => {
      const { clientWidth: width, clientHeight: height } = container;
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    let extraTurn = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = Math.min(0.1, (now - last) / 1000);
      last = now;
      const target = spinsRef.current * Math.PI;
      const before = extraTurn;
      extraTurn = MathUtils.damp(before, target, 6, delta);
      pivot.rotation.y += delta * SPIN_SPEED + (extraTurn - before);
      renderer.render(scene, camera);
    };

    // Spin continuously, or, with reduced motion, no loop at all: draw once, facing the
    // way the clicks say. Called whenever the props change.
    let ready = false;
    let looping = false;
    syncRef.current = () => {
      if (!ready) return;
      if (reducedRef.current) {
        renderer.setAnimationLoop(null);
        looping = false;
        pivot.rotation.y = spinsRef.current * Math.PI;
        renderer.render(scene, camera);
      } else if (!looping) {
        looping = true;
        last = performance.now();
        renderer.setAnimationLoop(tick);
      }
    };

    let cancelled = false;
    loadModel().then(
      (anya) => {
        if (cancelled) return;
        // Centre the model and frame her full body, sitting slightly low in the circle.
        anya.position.set(0, 0, 0);
        const box = new Box3().setFromObject(anya);
        const size = box.getSize(new Vector3());
        const center = box.getCenter(new Vector3());
        anya.position.copy(center).negate();
        pivot.add(anya);
        const targetY = size.y * 0.06;
        const fit = size.y / 2 / Math.tan(MathUtils.degToRad(FOV / 2));
        camera.position.set(0, targetY, fit * 1.25);
        camera.lookAt(0, targetY, 0);

        ready = true;
        syncRef.current();
      },
      () => {
        // Offline or blocked: the toggle still switches the theme, just without Anya.
      },
    );

    return () => {
      cancelled = true;
      renderer.setAnimationLoop(null);
      observer.disconnect();
      // Detach the shared model so a remount can reuse it; the renderer goes away.
      pivot.clear();
      renderer.dispose();
      renderer.domElement.remove();
      syncRef.current = () => undefined;
    };
  }, []);

  // Keep the loop's view of the props current (and redraw in reduced motion).
  useEffect(() => {
    spinsRef.current = spins;
    reducedRef.current = reducedMotion;
    syncRef.current();
  }, [spins, reducedMotion]);

  return <div ref={containerRef} className="pointer-events-none size-full" />;
}
