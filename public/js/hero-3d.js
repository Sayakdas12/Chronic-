/**
 * ChronicAI — 3D Interactive Disaster Topography & Telemetry Digital Twin
 * Powered by Three.js WebGL
 */

(function () {
  function initHero3D() {
    const canvas = document.getElementById("hero3dCanvas");
    if (!canvas || typeof THREE === "undefined") return;

    const container = canvas.parentElement;
    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;
    if (height < 300) height = Math.max(window.innerHeight - 100, 600);

    // 1. Scene & Atmosphere
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x040914, 0.022);

    // 2. Camera Setup (Tactical EOC Overview Angle)
    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 1000);
    camera.position.set(0, 16, 30);
    camera.lookAt(0, -1, 0);

    // 3. High-Performance WebGL Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // 4. Tactical Lighting
    const ambientLight = new THREE.AmbientLight(0x132b4a, 1.4);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0x60a5fa, 2.0);
    mainLight.position.set(12, 24, 18);
    scene.add(mainLight);

    const redLight = new THREE.PointLight(0xef4444, 3.5, 30);
    redLight.position.set(-7, 4, -2);
    scene.add(redLight);

    const amberLight = new THREE.PointLight(0xf59e0b, 3.0, 25);
    amberLight.position.set(8, 3, 4);
    scene.add(amberLight);

    const cyanLight = new THREE.PointLight(0x38bdf8, 2.5, 25);
    cyanLight.position.set(2, 4, -7);
    scene.add(cyanLight);

    // 5. Dynamic 3D Topographical Grid (Digital Twin Terrain)
    const gridWidth = 56;
    const gridHeight = 44;
    const gridSegmentsX = 52;
    const gridSegmentsY = 40;
    const terrainGeo = new THREE.PlaneGeometry(gridWidth, gridHeight, gridSegmentsX, gridSegmentsY);
    terrainGeo.rotateX(-Math.PI / 2.3);

    const posAttr = terrainGeo.attributes.position;
    const origPositions = [];
    for (let i = 0; i < posAttr.count; i++) {
      origPositions.push({
        x: posAttr.getX(i),
        y: posAttr.getY(i),
        z: posAttr.getZ(i),
      });
    }

    const terrainMat = new THREE.MeshStandardMaterial({
      color: 0x0a1e36,
      wireframe: true,
      roughness: 0.3,
      metalness: 0.85,
      emissive: 0x051324,
    });

    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.position.y = -4.5;
    scene.add(terrainMesh);

    // Glowing Node Points at terrain grid intersections
    const pointsMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.16,
      transparent: true,
      opacity: 0.85,
    });
    const pointsMesh = new THREE.Points(terrainGeo, pointsMat);
    pointsMesh.position.y = -4.45;
    scene.add(pointsMesh);

    // 6. Ground Radar Tactical Range Rings
    [6, 13, 20].forEach((radius) => {
      const ringGeo = new THREE.RingGeometry(radius - 0.05, radius + 0.05, 64);
      ringGeo.rotateX(-Math.PI / 2.3);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x1e4976,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.45,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.y = -4.4;
      scene.add(ringMesh);
    });

    // 7. Rotating Radar Sweep Beam
    const sweepGeo = new THREE.CircleGeometry(20, 32, 0, Math.PI / 4);
    sweepGeo.rotateX(-Math.PI / 2.3);
    const sweepMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.12,
    });
    const sweepMesh = new THREE.Mesh(sweepGeo, sweepMat);
    sweepMesh.position.y = -4.38;
    scene.add(sweepMesh);

    // 8. Helper to create 3D Floating Incident HUD Labels (Hi-DPI)
    function createIncidentTag(text, colorHex, subtext) {
      const tagCanvas = document.createElement("canvas");
      tagCanvas.width = 512;
      tagCanvas.height = 160;
      const ctx = tagCanvas.getContext("2d");

      // Background Card
      ctx.fillStyle = "rgba(4, 12, 28, 0.94)";
      ctx.strokeStyle = colorHex;
      ctx.lineWidth = 5;

      const r = 16, x = 8, y = 8, w = 496, h = 144;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Glowing Pulse Indicator Dot
      ctx.fillStyle = colorHex;
      ctx.shadowColor = colorHex;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(38, 48, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Title Text (Crisp White with High Impact)
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 32px 'Space Grotesk', system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 64, 48);

      // Subtext Details
      ctx.fillStyle = "#93c5fd";
      ctx.font = "600 24px monospace";
      ctx.fillText(subtext, 64, 98);

      const texture = new THREE.CanvasTexture(tagCanvas);
      texture.minFilter = THREE.LinearFilter;
      const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.98 });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(4.8, 1.5, 1);
      return sprite;
    }

    // 9. Vertical 3D Disaster & Fleet Beacons with Floating Tags
    const beaconData = [
      { x: -7, z: -2, color: 0xef4444, colorHex: "#ef4444", height: 11, title: "P1 FLOOD INUNDATION", sub: "Ward 7 Breach · Urgent" },
      { x: 8, z: 4, color: 0xf59e0b, colorHex: "#f59e0b", height: 9, title: "P2 ROAD SUBSIDENCE", sub: "Flyover Pillar 14 Alert" },
      { x: 2, z: -7, color: 0x38bdf8, colorHex: "#38bdf8", height: 10, title: "RESCUE FLEET 04", sub: "Dispatched · ETA 4m" },
      { x: -12, z: 6, color: 0x10b981, colorHex: "#10b981", height: 7.5, title: "RELIEF CORRIDOR", sub: "Shelter Beta Open" },
    ];

    const beacons = [];

    beaconData.forEach((b) => {
      // Beam cylinder
      const beamGeo = new THREE.CylinderGeometry(0.06, 0.28, b.height, 16);
      const beamMat = new THREE.MeshBasicMaterial({
        color: b.color,
        transparent: true,
        opacity: 0.85,
      });
      const beamMesh = new THREE.Mesh(beamGeo, beamMat);
      beamMesh.position.set(b.x, b.height / 2 - 4.5, b.z);
      scene.add(beamMesh);

      // Sphere at apex
      const sphereGeo = new THREE.SphereGeometry(0.38, 16, 16);
      const sphereMat = new THREE.MeshBasicMaterial({ color: b.color });
      const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
      sphereMesh.position.set(b.x, b.height - 4.5, b.z);
      scene.add(sphereMesh);

      // Base pulsing ring
      const ringGeo = new THREE.RingGeometry(0.4, 0.75, 32);
      ringGeo.rotateX(-Math.PI / 2.3);
      const ringMat = new THREE.MeshBasicMaterial({
        color: b.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.set(b.x, -4.4, b.z);
      scene.add(ringMesh);

      // Floating 3D HUD Tag Sprite
      const tagSprite = createIncidentTag(b.title, b.colorHex, b.sub);
      tagSprite.position.set(b.x, b.height - 3.4, b.z);
      scene.add(tagSprite);

      beacons.push({
        beam: beamMesh,
        sphere: sphereMesh,
        ring: ringMesh,
        tag: tagSprite,
        height: b.height,
        color: b.color,
      });
    });

    // 10. Airborne Telemetry Particles
    const particleCount = 280;
    const particleGeo = new THREE.BufferGeometry();
    const particlePos = new Float32Array(particleCount * 3);
    const particleVel = [];

    for (let i = 0; i < particleCount; i++) {
      particlePos[i * 3] = (Math.random() - 0.5) * 46;
      particlePos[i * 3 + 1] = Math.random() * 22 - 4.5;
      particlePos[i * 3 + 2] = (Math.random() - 0.5) * 38;

      particleVel.push({
        y: 0.02 + Math.random() * 0.035,
        x: (Math.random() - 0.5) * 0.012,
      });
    }

    particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePos, 3));
    const particleMaterial = new THREE.PointsMaterial({
      color: 0x93c5fd,
      size: 0.22,
      transparent: true,
      opacity: 0.7,
    });
    const particleSystem = new THREE.Points(particleGeo, particleMaterial);
    scene.add(particleSystem);

    // 11. Mouse Movement & Camera Parallax Tracking
    let mouseX = 0;
    let mouseY = 0;
    let targetCamX = 0;
    let targetCamY = 16;

    window.addEventListener("mousemove", (e) => {
      const normX = e.clientX / window.innerWidth - 0.5;
      const normY = e.clientY / window.innerHeight - 0.5;
      mouseX = normX * 10;
      mouseY = normY * 6;
      targetCamX = mouseX;
      targetCamY = 16 - normY * 5;
    });

    // 12. Window Resize Handling
    function onResize() {
      width = container.clientWidth || window.innerWidth;
      height = container.clientHeight || window.innerHeight;
      if (height < 300) height = Math.max(window.innerHeight - 100, 600);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    }
    window.addEventListener("resize", onResize);

    // 13. Animation Loop
    const clock = new THREE.Clock();
    let isVisible = true;

    document.addEventListener("visibilitychange", () => {
      isVisible = !document.hidden;
    });

    function animate() {
      requestAnimationFrame(animate);
      if (!isVisible) return;

      const elapsedTime = clock.getElapsedTime();

      // A. Topographical Terrain Wave Undulation
      const pos = terrainGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const orig = origPositions[i];
        const wave =
          Math.sin(orig.x * 0.28 + elapsedTime * 1.6) * 0.85 +
          Math.cos(orig.y * 0.22 + elapsedTime * 1.2) * 0.65;
        pos.setZ(i, orig.z + wave);
      }
      pos.needsUpdate = true;
      terrainGeo.computeVertexNormals();

      // B. Pulse Beacon Base Rings & Hovering Apex
      beacons.forEach((b, index) => {
        const scale = 1 + ((elapsedTime * 2.2 + index * 1.4) % 3.0);
        b.ring.scale.set(scale, scale, scale);
        b.ring.material.opacity = Math.max(0, 0.85 - scale / 3.4);

        // Hover bobbing on sphere and tag
        const bob = Math.sin(elapsedTime * 3 + index * 1.5) * 0.22;
        b.sphere.position.y = (b.height - 4.5) + bob;
        b.tag.position.y = (b.height - 3.4) + bob;
      });

      // C. Rotate Ground Radar Sweep Beam
      sweepMesh.rotation.z = -elapsedTime * 0.75;

      // D. Airborne Telemetry Particles Motion
      const pPositions = particleSystem.geometry.attributes.position.array;
      for (let i = 0; i < particleCount; i++) {
        pPositions[i * 3 + 1] += particleVel[i].y;
        pPositions[i * 3] += particleVel[i].x;

        if (pPositions[i * 3 + 1] > 18) {
          pPositions[i * 3 + 1] = -4.5;
          pPositions[i * 3] = (Math.random() - 0.5) * 46;
        }
      }
      particleSystem.geometry.attributes.position.needsUpdate = true;

      // E. Camera Smooth Interpolation (Parallax Tilt)
      camera.position.x += (targetCamX - camera.position.x) * 0.05;
      camera.position.y += (targetCamY - camera.position.y) * 0.05;
      camera.lookAt(0, -1, 0);

      renderer.render(scene, camera);
    }

    animate();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHero3D);
  } else {
    initHero3D();
  }
})();
