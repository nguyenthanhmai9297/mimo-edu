import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export type SolidShapeType =
  | 'LP' // Lập phương (Cube)
  | 'HCN' // Hộp chữ nhật (Cuboid)
  | 'CHOP' // Chóp tứ giác (Pyramid)
  | 'TRU' // Trụ (Cylinder)
  | 'CAU' // Cầu (Sphere)
  | 'NON' // Nón (Cone)
  | 'TU' // Tứ diện đều (Tetrahedron)
  | 'LANG_TRU'; // Lăng trụ tam giác (Triangular Prism)

export interface Geometry3DSettings {
  shapeType: SolidShapeType;
  showVertices: boolean;
  showEdges: boolean;
  showFaces: boolean;
  showLabels: boolean;
  mode: 'explore' | 'volume' | 'net';
  opacity: number; // 0.1 to 1.0
  length: number; // 1 to 10
  width: number; // 1 to 10
  height: number; // 1 to 10
  radius: number; // 1 to 8
  unfoldProgress: number; // 0 to 100%
  fillProgress: number; // 0 to 100%
  wireframeOnly?: boolean;
}

interface Geometry3DStudioProps {
  settings: Geometry3DSettings;
  onSnapshotReady?: (dataUrl: string) => void;
  className?: string;
  isDarkTheme?: boolean;
}

export const Geometry3DStudio: React.FC<Geometry3DStudioProps> = ({
  settings,
  className = '',
  isDarkTheme = true,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const solidGroupRef = useRef<THREE.Group | null>(null);
  const unitCubesGroupRef = useRef<THREE.Group | null>(null);
  const labelsGroupRef = useRef<THREE.Group | null>(null);

  // Orbit controls state (manual implementation to avoid extra dependencies)
  const isDraggingRef = useRef(false);
  const prevMouseRef = useRef({ x: 0, y: 0 });
  const sphericalRef = useRef({ radius: 18, theta: Math.PI / 4, phi: Math.PI / 3 });

  // Update camera position from spherical coordinates
  const updateCamera = () => {
    if (!cameraRef.current) return;
    const { radius, theta, phi } = sphericalRef.current;
    cameraRef.current.position.x = radius * Math.sin(phi) * Math.sin(theta);
    cameraRef.current.position.y = radius * Math.cos(phi);
    cameraRef.current.position.z = radius * Math.sin(phi) * Math.cos(theta);
    cameraRef.current.lookAt(0, 0, 0);
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(isDarkTheme ? 0x0f172a : 0xf8fafc);

    // Subtle grid helper for spatial grounding
    const gridHelper = new THREE.GridHelper(
      30,
      30,
      isDarkTheme ? 0x334155 : 0x94a3b8,
      isDarkTheme ? 0x1e293b : 0xe2e8f0
    );
    gridHelper.position.y = -4;
    scene.add(gridHelper);

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    cameraRef.current = camera;
    updateCamera();

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    rendererRef.current = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    // 2. Lighting Rig
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.9);
    dirLight1.position.set(15, 25, 20);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x60a5fa, 0.5);
    dirLight2.position.set(-15, -10, -20);
    scene.add(dirLight2);

    // 3. Object Groups
    const solidGroup = new THREE.Group();
    scene.add(solidGroup);
    solidGroupRef.current = solidGroup;

    const unitCubesGroup = new THREE.Group();
    scene.add(unitCubesGroup);
    unitCubesGroupRef.current = unitCubesGroup;

    const labelsGroup = new THREE.Group();
    scene.add(labelsGroup);
    labelsGroupRef.current = labelsGroup;

    // 4. Mouse & Touch Orbit Interactions
    const onMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      prevMouseRef.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - prevMouseRef.current.x;
      const dy = e.clientY - prevMouseRef.current.y;
      prevMouseRef.current = { x: e.clientX, y: e.clientY };

      sphericalRef.current.theta -= dx * 0.008;
      sphericalRef.current.phi = Math.max(
        0.05,
        Math.min(Math.PI - 0.05, sphericalRef.current.phi - dy * 0.008)
      );
      updateCamera();
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      sphericalRef.current.radius = Math.max(
        6,
        Math.min(50, sphericalRef.current.radius + e.deltaY * 0.02)
      );
      updateCamera();
    };

    // Touch support for mobile devices
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1 && e.touches[0]) {
        isDraggingRef.current = true;
        prevMouseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current || e.touches.length !== 1 || !e.touches[0]) return;
      const dx = e.touches[0].clientX - prevMouseRef.current.x;
      const dy = e.touches[0].clientY - prevMouseRef.current.y;
      prevMouseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };

      sphericalRef.current.theta -= dx * 0.008;
      sphericalRef.current.phi = Math.max(
        0.05,
        Math.min(Math.PI - 0.05, sphericalRef.current.phi - dy * 0.008)
      );
      updateCamera();
    };

    const onTouchEnd = () => {
      isDraggingRef.current = false;
    };

    const dom = renderer.domElement;
    dom.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);

    // 5. Render Loop
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // 6. Resize Observer
    const resizeObserver = new ResizeObserver(() => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animId);
      dom.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      dom.removeEventListener('wheel', onWheel);
      dom.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      resizeObserver.disconnect();
      renderer.dispose();
      if (dom.parentNode) dom.parentNode.removeChild(dom);
    };
  }, [isDarkTheme]);

  // Helper to create text sprite for vertex labels (A, B, C, D...)
  const createTextSprite = (text: string, color = '#38bdf8') => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 128, 128);
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(64, 64, 48, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = color;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 52px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 64, 64);
    }
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(1.1, 1.1, 1.1);
    return sprite;
  };

  // Re-build 3D Meshes whenever settings change
  useEffect(() => {
    const solidGroup = solidGroupRef.current;
    const unitCubesGroup = unitCubesGroupRef.current;
    const labelsGroup = labelsGroupRef.current;
    if (!solidGroup || !unitCubesGroup || !labelsGroup) return;

    // Clean up previous geometries & materials
    while (solidGroup.children.length > 0) {
      const obj = solidGroup.children[0];
      solidGroup.remove(obj);
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    }
    while (unitCubesGroup.children.length > 0) {
      const obj = unitCubesGroup.children[0];
      unitCubesGroup.remove(obj);
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        obj.material.dispose();
      }
    }
    while (labelsGroup.children.length > 0) {
      const obj = labelsGroup.children[0];
      labelsGroup.remove(obj);
    }

    const {
      shapeType,
      showVertices,
      showEdges,
      showFaces,
      showLabels,
      opacity,
      length,
      width,
      height,
      radius,
      fillProgress,
    } = settings;

    // Materials
    const faceMaterial = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: showFaces ? Math.max(0.1, opacity) : 0.02,
      roughness: 0.3,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });

    const edgeMaterial = new THREE.LineBasicMaterial({
      color: isDarkTheme ? 0x38bdf8 : 0x0284c7,
      linewidth: 3,
    });

    const vertexMaterial = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
    });
    const vertexGeom = new THREE.SphereGeometry(0.16, 16, 16);

    const addVertexAndLabel = (pos: THREE.Vector3, labelText: string) => {
      if (showVertices) {
        const vMesh = new THREE.Mesh(vertexGeom, vertexMaterial);
        vMesh.position.copy(pos);
        labelsGroup.add(vMesh);
      }
      if (showLabels) {
        const sprite = createTextSprite(labelText, isDarkTheme ? '#38bdf8' : '#0369a1');
        const offset = pos.clone().add(pos.clone().normalize().multiplyScalar(0.7));
        sprite.position.copy(offset);
        labelsGroup.add(sprite);
      }
    };

    // 1. HÌNH LẬP PHƯƠNG (LP) & HÌNH HỘP CHỮ NHẬT (HCN)
    if (shapeType === 'LP' || shapeType === 'HCN') {
      const sx = shapeType === 'LP' ? length : length;
      const sy = shapeType === 'LP' ? length : height;
      const sz = shapeType === 'LP' ? length : width;

      const boxGeom = new THREE.BoxGeometry(sx, sy, sz);
      const mesh = new THREE.Mesh(boxGeom, faceMaterial);
      solidGroup.add(mesh);

      if (showEdges) {
        const edges = new THREE.EdgesGeometry(boxGeom);
        const line = new THREE.LineSegments(edges, edgeMaterial);
        solidGroup.add(line);
      }

      // 8 Vertices
      const hx = sx / 2;
      const hy = sy / 2;
      const hz = sz / 2;
      const verts: [THREE.Vector3, string][] = [
        [new THREE.Vector3(-hx, -hy, hz), 'A'],
        [new THREE.Vector3(hx, -hy, hz), 'B'],
        [new THREE.Vector3(hx, -hy, -hz), 'C'],
        [new THREE.Vector3(-hx, -hy, -hz), 'D'],
        [new THREE.Vector3(-hx, hy, hz), "A'"],
        [new THREE.Vector3(hx, hy, hz), "B'"],
        [new THREE.Vector3(hx, hy, -hz), "C'"],
        [new THREE.Vector3(-hx, hy, -hz), "D'"],
      ];
      verts.forEach(([p, l]) => addVertexAndLabel(p, l));

      // Unit Cube Packing Simulator (Volume fill progress)
      if (settings.mode === 'volume' || fillProgress > 0) {
        const totalUnits = Math.round(sx) * Math.round(sy) * Math.round(sz);
        const activeUnits = Math.round((fillProgress / 100) * totalUnits);
        let count = 0;
        const cubeMat = new THREE.MeshStandardMaterial({
          color: 0x10b981,
          transparent: true,
          opacity: 0.85,
          roughness: 0.2,
        });
        const unitGeom = new THREE.BoxGeometry(0.96, 0.96, 0.96);

        for (let y = 0; y < Math.round(sy); y++) {
          for (let z = 0; z < Math.round(sz); z++) {
            for (let x = 0; x < Math.round(sx); x++) {
              if (count >= activeUnits) break;
              const unitMesh = new THREE.Mesh(unitGeom, cubeMat);
              unitMesh.position.set(
                -hx + 0.5 + x,
                -hy + 0.5 + y,
                -hz + 0.5 + z
              );
              unitCubesGroup.add(unitMesh);
              count++;
            }
          }
        }
      }
    }

    // 2. HÌNH CHÓP TỨ GIÁC (CHOP)
    else if (shapeType === 'CHOP') {
      const a = length;
      const h = height;
      const ha = a / 2;

      // Custom Pyramid Geometry
      const geom = new THREE.BufferGeometry();
      const vertices = new Float32Array([
        // Base quad (2 triangles)
        -ha, 0, ha,   ha, 0, ha,   ha, 0, -ha,
        -ha, 0, ha,   ha, 0, -ha,  -ha, 0, -ha,
        // Side 1: S-A-B
        0, h, 0,  -ha, 0, ha,   ha, 0, ha,
        // Side 2: S-B-C
        0, h, 0,   ha, 0, ha,   ha, 0, -ha,
        // Side 3: S-C-D
        0, h, 0,   ha, 0, -ha,  -ha, 0, -ha,
        // Side 4: S-D-A
        0, h, 0,  -ha, 0, -ha,  -ha, 0, ha,
      ]);
      geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      geom.computeVertexNormals();

      const mesh = new THREE.Mesh(geom, faceMaterial);
      mesh.position.y = -h / 2;
      solidGroup.add(mesh);

      if (showEdges) {
        const edges = new THREE.EdgesGeometry(geom);
        const line = new THREE.LineSegments(edges, edgeMaterial);
        line.position.y = -h / 2;
        solidGroup.add(line);
      }

      addVertexAndLabel(new THREE.Vector3(0, h / 2, 0), 'S');
      addVertexAndLabel(new THREE.Vector3(-ha, -h / 2, ha), 'A');
      addVertexAndLabel(new THREE.Vector3(ha, -h / 2, ha), 'B');
      addVertexAndLabel(new THREE.Vector3(ha, -h / 2, -ha), 'C');
      addVertexAndLabel(new THREE.Vector3(-ha, -h / 2, -ha), 'D');
    }

    // 3. HÌNH TRỤ (TRU)
    else if (shapeType === 'TRU') {
      const r = radius * 0.7;
      const h = height;
      const cylGeom = new THREE.CylinderGeometry(r, r, h, 36);
      const mesh = new THREE.Mesh(cylGeom, faceMaterial);
      solidGroup.add(mesh);

      if (showEdges) {
        const edges = new THREE.EdgesGeometry(cylGeom, 30);
        const line = new THREE.LineSegments(edges, edgeMaterial);
        solidGroup.add(line);
      }

      addVertexAndLabel(new THREE.Vector3(0, h / 2, 0), "O'");
      addVertexAndLabel(new THREE.Vector3(0, -h / 2, 0), 'O');
      addVertexAndLabel(new THREE.Vector3(r, h / 2, 0), "A'");
      addVertexAndLabel(new THREE.Vector3(r, -h / 2, 0), 'A');
    }

    // 4. HÌNH CẦU (CAU)
    else if (shapeType === 'CAU') {
      const r = radius * 0.8;
      const sphereGeom = new THREE.SphereGeometry(r, 32, 24);
      const mesh = new THREE.Mesh(sphereGeom, faceMaterial);
      solidGroup.add(mesh);

      // Great circle rings for spatial orientation
      const ringGeom = new THREE.RingGeometry(r - 0.04, r, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: isDarkTheme ? 0x38bdf8 : 0x0284c7,
        side: THREE.DoubleSide,
      });
      const ringX = new THREE.Mesh(ringGeom, ringMat);
      ringX.rotation.x = Math.PI / 2;
      solidGroup.add(ringX);

      addVertexAndLabel(new THREE.Vector3(0, 0, 0), 'O');
      addVertexAndLabel(new THREE.Vector3(r, 0, 0), 'R');
    }

    // 5. HÌNH NÓN (NON)
    else if (shapeType === 'NON') {
      const r = radius * 0.7;
      const h = height;
      const coneGeom = new THREE.ConeGeometry(r, h, 36);
      const mesh = new THREE.Mesh(coneGeom, faceMaterial);
      solidGroup.add(mesh);

      if (showEdges) {
        const edges = new THREE.EdgesGeometry(coneGeom, 30);
        const line = new THREE.LineSegments(edges, edgeMaterial);
        solidGroup.add(line);
      }

      addVertexAndLabel(new THREE.Vector3(0, h / 2, 0), 'S');
      addVertexAndLabel(new THREE.Vector3(0, -h / 2, 0), 'O');
      addVertexAndLabel(new THREE.Vector3(r, -h / 2, 0), 'A');
    }

    // 6. TỨ DIỆN ĐỀU (TU)
    else if (shapeType === 'TU') {
      const r = length * 0.9;
      const tetGeom = new THREE.TetrahedronGeometry(r);
      const mesh = new THREE.Mesh(tetGeom, faceMaterial);
      solidGroup.add(mesh);

      if (showEdges) {
        const edges = new THREE.EdgesGeometry(tetGeom);
        const line = new THREE.LineSegments(edges, edgeMaterial);
        solidGroup.add(line);
      }

      // Approximate vertices of Tetrahedron
      addVertexAndLabel(new THREE.Vector3(0, r, 0), 'S');
      addVertexAndLabel(new THREE.Vector3(-r * 0.8, -r * 0.4, r * 0.6), 'A');
      addVertexAndLabel(new THREE.Vector3(r * 0.8, -r * 0.4, r * 0.6), 'B');
      addVertexAndLabel(new THREE.Vector3(0, -r * 0.4, -r * 0.9), 'C');
    }

    // 7. LĂNG TRỤ TAM GIÁC (LANG_TRU)
    else if (shapeType === 'LANG_TRU') {
      const a = length;
      const h = height;
      const prismGeom = new THREE.CylinderGeometry(a * 0.6, a * 0.6, h, 3);
      const mesh = new THREE.Mesh(prismGeom, faceMaterial);
      solidGroup.add(mesh);

      if (showEdges) {
        const edges = new THREE.EdgesGeometry(prismGeom);
        const line = new THREE.LineSegments(edges, edgeMaterial);
        solidGroup.add(line);
      }

      addVertexAndLabel(new THREE.Vector3(0, h / 2, a * 0.6), "A'");
      addVertexAndLabel(new THREE.Vector3(-a * 0.5, h / 2, -a * 0.3), "B'");
      addVertexAndLabel(new THREE.Vector3(a * 0.5, h / 2, -a * 0.3), "C'");
      addVertexAndLabel(new THREE.Vector3(0, -h / 2, a * 0.6), 'A');
      addVertexAndLabel(new THREE.Vector3(-a * 0.5, -h / 2, -a * 0.3), 'B');
      addVertexAndLabel(new THREE.Vector3(a * 0.5, -h / 2, -a * 0.3), 'C');
    }
  }, [settings, isDarkTheme]);

  // Export current canvas snapshot as PNG data URL
  const exportSnapshot = (): string => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return '';
    rendererRef.current.render(sceneRef.current, cameraRef.current);
    return rendererRef.current.domElement.toDataURL('image/png');
  };

  return (
    <div className={`relative h-full w-full select-none ${className}`}>
      <div ref={mountRef} className="h-full w-full cursor-grab active:cursor-grabbing" />
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-slate-900/70 px-3 py-1.5 text-[11px] font-semibold text-slate-200 backdrop-blur-xs">
        🖱️ Giữ chuột trái & kéo để xoay 360° · Cuộn chuột để phóng to/thu nhỏ
      </div>
    </div>
  );
};
