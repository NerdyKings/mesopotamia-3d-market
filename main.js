import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

// --- 1. INITIALISATION & CONFIGURATION ---
const randomRange = (min, max) => Math.random() * (max - min) + min;
const scene = new THREE.Scene();

scene.background = new THREE.Color(0xc49a50);
const sandColor = 0xc49a50;

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1500);
// On placera la caméra plus loin, à l'entrée
camera.position.set(0, 1.7, 55); // On commence en dehors de la porte (qui est à Z=45) 

const canvas = document.querySelector('#bg');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

// Configuration poussée des ombres et lumières
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping;

// --- 2. GESTION DES COLLISIONS ---
const collisionBoxes = [];

// Fonction utilitaire pour ajouter une boîte de collision statique
function addCollisionBox(mesh, buffer = 0) {
    // S'assurer que les matrices mondiales sont à jour avant de calculer la box
    mesh.updateMatrixWorld(true);
    
    // Calculer la boîte englobante exacte du mesh et de ses enfants
    const box = new THREE.Box3().setFromObject(mesh);
    
    // Si la box est valide (pas vide)
    if (!box.isEmpty()) {
        if (buffer > 0) box.expandByScalar(buffer);
        collisionBoxes.push(box);
    }
}

// --- 3. GÉNÉRATEURS DE TEXTURES PROCÉDURALES RÉALISTES ---

// Dôme de ciel : dégradé bleu en haut -> sable en bas, avec nuages
function createSkyDome() {
    const cvs = document.createElement('canvas');
    cvs.width = 2048;
    cvs.height = 1024;
    const ctx = cvs.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 0, cvs.height);
    gradient.addColorStop(0, '#1a5ab5');
    gradient.addColorStop(0.18, '#3a7fd4');
    gradient.addColorStop(0.35, '#6aafe8');
    gradient.addColorStop(0.42, '#b0cce0');
    gradient.addColorStop(0.47, '#c4a870');
    gradient.addColorStop(0.50, '#c49a50');
    gradient.addColorStop(0.55, '#b8893f');
    gradient.addColorStop(0.70, '#a87830');
    gradient.addColorStop(1.0, '#8a6020');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, cvs.width, cvs.height);

    // Bancs de nuages réalistes (clusters de cercles)
    for (let c = 0; c < 25; c++) {
        const cx = Math.random() * cvs.width;
        const cy = randomRange(cvs.height * 0.05, cvs.height * 0.38);
        const clusterSize = randomRange(60, 200);
        const puffs = Math.floor(randomRange(8, 25));
        for (let p = 0; p < puffs; p++) {
            const px = cx + randomRange(-clusterSize, clusterSize);
            const py = cy + randomRange(-clusterSize * 0.3, clusterSize * 0.3);
            const radius = randomRange(30, clusterSize * 0.8);
            const alpha = randomRange(0.04, 0.14);
            const cg = ctx.createRadialGradient(px, py, 0, px, py, radius);
            cg.addColorStop(0, `rgba(255,255,255,${alpha})`);
            cg.addColorStop(0.6, `rgba(255,255,255,${alpha * 0.4})`);
            cg.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = cg;
            ctx.beginPath();
            ctx.arc(px, py, radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Nuages fins éparpillés
    for (let i = 0; i < 80; i++) {
        const x = Math.random() * cvs.width;
        const y = randomRange(0, cvs.height * 0.42);
        const radius = randomRange(15, 60);
        const alpha = randomRange(0.02, 0.08);
        const cg = ctx.createRadialGradient(x, y, 0, x, y, radius);
        cg.addColorStop(0, `rgba(255,255,255,${alpha})`);
        cg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    const tex = new THREE.CanvasTexture(cvs);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
}

// Dôme de ciel complet (pas de brouillard, tout est dans la texture)
const skyGeo = new THREE.SphereGeometry(900, 64, 48);
const skyMat = new THREE.MeshBasicMaterial({
    map: createSkyDome(),
    side: THREE.BackSide,
    depthWrite: false,
    fog: false
});
const skySphere = new THREE.Mesh(skyGeo, skyMat);
scene.add(skySphere);

function createNoiseTexture(width, height, isBump = false) {
    const cvs = document.createElement('canvas');
    cvs.width = width; cvs.height = height;
    const ctx = cvs.getContext('2d');
    const imgData = ctx.createImageData(width, height);
    for (let i = 0; i < imgData.data.length; i += 4) {
        const val = (Math.random() * 255 + Math.random() * 255) / 2; 
        imgData.data[i] = val;
        imgData.data[i+1] = val;
        imgData.data[i+2] = val;
        imgData.data[i+3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
    const tex = new THREE.CanvasTexture(cvs);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    if(isBump) tex.generateMipmaps = true;
    return tex;
}

function createGroundTexture() {
    const cvs = document.createElement('canvas');
    cvs.width = 2048; cvs.height = 2048;
    const ctx = cvs.getContext('2d');
    
    ctx.fillStyle = '#b07830'; 
    ctx.fillRect(0, 0, 2048, 2048);
    
    // Variation de teinte à grande échelle (zones plus claires / plus sombres)
    for (let i = 0; i < 60; i++) {
        const r = Math.random();
        ctx.fillStyle = r < 0.5 ? 'rgba(180, 140, 90, 0.25)' : 'rgba(100, 70, 40, 0.15)';
        ctx.beginPath();
        ctx.arc(Math.random() * 2048, Math.random() * 2048, randomRange(80, 250), 0, Math.PI * 2);
        ctx.fill();
    }

    // Taches d'argile sèche
    for (let i = 0; i < 300; i++) {
        ctx.fillStyle = 'rgba(210, 175, 120, 0.3)';
        ctx.beginPath();
        ctx.arc(Math.random() * 2048, Math.random() * 2048, randomRange(15, 70), 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Traces de roues de charrette
    for (let i = 0; i < 8; i++) {
        ctx.strokeStyle = 'rgba(90, 65, 40, 0.2)';
        ctx.lineWidth = randomRange(3, 8);
        ctx.beginPath();
        const sx = Math.random() * 2048;
        const sy = Math.random() * 2048;
        ctx.moveTo(sx, sy);
        let cx = sx, cy = sy;
        for (let s = 0; s < 6; s++) {
            cx += randomRange(-150, 150);
            cy += randomRange(100, 300);
            ctx.lineTo(cx, cy);
        }
        ctx.stroke();
    }
    
    // Micro graviers et poussière
    for (let i = 0; i < 120000; i++) {
        const r = Math.random();
        if (r < 0.25) ctx.fillStyle = 'rgba(160, 115, 70, 0.5)';
        else if (r < 0.5) ctx.fillStyle = 'rgba(220, 195, 150, 0.5)';
        else if (r < 0.75) ctx.fillStyle = 'rgba(110, 75, 45, 0.3)';
        else ctx.fillStyle = 'rgba(140, 100, 60, 0.4)';
        const sz = randomRange(1, 4);
        ctx.fillRect(Math.random() * 2048, Math.random() * 2048, sz, sz);
    }
    
    // Traces de pas
    for (let i = 0; i < 500; i++) {
        ctx.fillStyle = 'rgba(130, 95, 60, 0.08)';
        ctx.beginPath();
        ctx.ellipse(Math.random() * 2048, Math.random() * 2048, randomRange(3, 6), randomRange(5, 10), randomRange(0, Math.PI), 0, Math.PI * 2);
        ctx.fill();
    }

    const tex = new THREE.CanvasTexture(cvs);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return tex;
}

function createFabricTexture() {
    const cvs = document.createElement('canvas');
    cvs.width = 256; cvs.height = 256;
    const ctx = cvs.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,256,256);
    ctx.fillStyle = '#cccccc';
    for(let i=0; i<256; i+=4) {
        ctx.fillRect(i, 0, 1, 256); // Chaine
        ctx.fillRect(0, i, 256, 1); // Trame
    }
    const tex = new THREE.CanvasTexture(cvs);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
}

const noiseBumpMap = createNoiseTexture(512, 512, true);
// Bump map du sol très fine pour un rendu granuleux réaliste
const sandBumpMap = createNoiseTexture(2048, 2048, true);
sandBumpMap.anisotropy = renderer.capabilities.getMaxAnisotropy();
const groundMap = createGroundTexture();
const fabricMap = createFabricTexture();

// Répétitions plus resserrées pour plus de détails visuels au sol
sandBumpMap.repeat.set(30, 30);
groundMap.repeat.set(10, 10);
fabricMap.repeat.set(6, 6);

// --- 4. MATÉRIAUX RÉALISTES ---
const groundMat = new THREE.MeshLambertMaterial({ 
    color: 0xc49a50,
    map: groundMap, 
    side: THREE.DoubleSide
});
const mudBrickMat = new THREE.MeshStandardMaterial({ 
    color: 0xc48c59, roughness: 1, bumpMap: noiseBumpMap, bumpScale: 0.03 
});
const mudBrickDarkMat = new THREE.MeshStandardMaterial({ 
    color: 0xaa7342, roughness: 1, bumpMap: noiseBumpMap, bumpScale: 0.04 
});
const mudBrickLightMat = new THREE.MeshStandardMaterial({ 
    color: 0xd69f69, roughness: 1, bumpMap: noiseBumpMap, bumpScale: 0.02 
});
const woodMat = new THREE.MeshStandardMaterial({ 
    color: 0x4a3728, roughness: 0.9, bumpMap: noiseBumpMap, bumpScale: 0.015 
});
const oldWoodMat = new THREE.MeshStandardMaterial({ 
    color: 0x6e5c4f, roughness: 1, bumpMap: noiseBumpMap, bumpScale: 0.02 
});
const potteryMat = new THREE.MeshStandardMaterial({ 
    color: 0x9e5b33, roughness: 0.5, bumpMap: noiseBumpMap, bumpScale: 0.005 
});
const leafMat = new THREE.MeshStandardMaterial({ 
    color: 0x3d5225, roughness: 0.7, side: THREE.DoubleSide, map: fabricMap, bumpMap: fabricMap, bumpScale: 0.01 
});
const skinMat = new THREE.MeshStandardMaterial({ color: 0x734222, roughness: 0.4 });
const animalMat = new THREE.MeshStandardMaterial({ color: 0x82644e, roughness: 0.9 });

// Teintures antiques chaudes pour ne pas confondre les tapis avec le ciel
const fabricColors = [0x8b2500, 0xb87333, 0xa13d2d, 0x5c4033, 0xe3d5c8, 0x66023c];
const fabricMats = fabricColors.map(c => new THREE.MeshStandardMaterial({ 
    color: c, roughness: 0.9, side: THREE.DoubleSide, map: fabricMap, bumpMap: fabricMap, bumpScale: 0.01 
}));


// Lumières de milieu de journée, soleil très fort et ombres nettes
const ambientLight = new THREE.AmbientLight(0xffe8c0, 0.6);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffeebb, 1.2);
// Soleil plus haut dans le ciel (Midi/Début d'aprem)
sunLight.position.set(50, 180, -40);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 4096;
sunLight.shadow.mapSize.height = 4096;
sunLight.shadow.camera.near = 10;
sunLight.shadow.camera.far = 400;
const d = 150;
sunLight.shadow.camera.left = -d;
sunLight.shadow.camera.right = d;
sunLight.shadow.camera.top = d;
sunLight.shadow.camera.bottom = -d;
sunLight.shadow.bias = -0.0003;
sunLight.shadow.normalBias = 0.02; 
scene.add(sunLight);

const hemiLight = new THREE.HemisphereLight(0xfff0d0, 0xc49a50, 0.3);
scene.add(hemiLight);

// --- 6. SOL ET ENVIRONNEMENT ---
const groundGeo = new THREE.PlaneGeometry(3000, 3000, 128, 128);
const groundVertices = groundGeo.attributes.position.array;
for(let i = 0; i < groundVertices.length; i += 3) {
    const x = groundVertices[i];
    const z = groundVertices[i+2];
    const distToCenter = Math.sqrt(x*x + z*z);
    const flatten = Math.min(1, distToCenter / 50); // Le centre (marché) est aplani
    groundVertices[i+1] = (Math.sin(x * 0.05) * Math.cos(z * 0.05) * 0.6 + Math.sin(x * 0.01) * 2.5) * flatten;
}
groundGeo.computeVertexNormals();
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Herbes sèches et buissons épars (seulement en périphérie du marché)
const grassGeo = new THREE.PlaneGeometry(0.3, 0.5);
grassGeo.translate(0, 0.25, 0);
const grassMat = new THREE.MeshStandardMaterial({ color: 0x8a7f5d, side: THREE.DoubleSide, roughness: 1, alphaTest: 0.5 });
const grassInstanced = new THREE.InstancedMesh(grassGeo, grassMat, 3000);
const dummy = new THREE.Object3D();
for (let i = 0; i < 3000; i++) {
    const gx = randomRange(-200, 200);
    const gz = randomRange(-200, 200);
    const dist = Math.sqrt(gx * gx + gz * gz);
    if (dist < 35) continue;
    const density = Math.min(1, (dist - 35) / 100);
    if (Math.random() > density) continue;
    dummy.position.set(gx, 0, gz);
    dummy.rotation.y = randomRange(0, Math.PI * 2);
    dummy.rotation.x = randomRange(-0.15, 0.15);
    dummy.scale.set(randomRange(0.6, 1.8), randomRange(0.5, 1.5), 1);
    dummy.updateMatrix();
    grassInstanced.setMatrixAt(i, dummy.matrix);
}
scene.add(grassInstanced);

// Buissons secs à la périphérie
const bushMat = new THREE.MeshStandardMaterial({ color: 0x6b6030, roughness: 1 });
for (let i = 0; i < 40; i++) {
    const bx = randomRange(-120, 120);
    const bz = randomRange(-120, 120);
    if (Math.sqrt(bx * bx + bz * bz) < 45) continue;
    const bushGroup = new THREE.Group();
    const numSpheres = Math.floor(randomRange(3, 7));
    for (let s = 0; s < numSpheres; s++) {
        const r = randomRange(0.3, 0.8);
        const geo = disturbGeometry(new THREE.SphereGeometry(r, 6, 6), 0.1);
        const sphere = new THREE.Mesh(geo, bushMat);
        sphere.position.set(randomRange(-0.5, 0.5), r * 0.6, randomRange(-0.5, 0.5));
        sphere.castShadow = true;
        bushGroup.add(sphere);
    }
    bushGroup.position.set(bx, 0, bz);
    scene.add(bushGroup);
}

// --- PARTICULES DE POUSSIÈRE ---
const dustGeo = new THREE.BufferGeometry();
const dustCount = 6000;
const dustPos = new Float32Array(dustCount * 3);
for(let i=0; i<dustCount*3; i+=3) {
    dustPos[i] = randomRange(-150, 150);
    dustPos[i+1] = randomRange(0, 30);
    dustPos[i+2] = randomRange(-150, 150);
}
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dustMat = new THREE.PointsMaterial({
    size: 0.08, color: 0xffeebb, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false
});
const dustMesh = new THREE.Points(dustGeo, dustMat);
scene.add(dustMesh);

// --- 7. FONCTIONS DE CRÉATION DÉTAILLÉES ---
function disturbGeometry(geometry, amount) {
    const pos = geometry.attributes.position;
    for(let i=0; i<pos.count; i++) {
        pos.setX(i, pos.getX(i) + randomRange(-amount, amount));
        pos.setY(i, pos.getY(i) + randomRange(-amount, amount));
        pos.setZ(i, pos.getZ(i) + randomRange(-amount, amount));
    }
    geometry.computeVertexNormals();
    return geometry;
}

// Maisons hyper-détaillées
function createHouse(x, z, width, depth, height) {
    const houseGroup = new THREE.Group();
    const mats = [mudBrickMat, mudBrickDarkMat, mudBrickLightMat];
    const mat = mats[Math.floor(Math.random() * mats.length)];
    
    // Corps principal (Irrégulier)
    const bodyGeo = disturbGeometry(new THREE.BoxGeometry(width, height, depth, 5, 5, 5), 0.15);
    const body = new THREE.Mesh(bodyGeo, mat);
    body.position.y = height / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    houseGroup.add(body);

    // Muret du toit
    const roofWallGeo = disturbGeometry(new THREE.BoxGeometry(width + 0.2, 0.8, depth + 0.2, 4, 2, 4), 0.08);
    const roofWall = new THREE.Mesh(roofWallGeo, mat);
    roofWall.position.y = height + 0.4;
    roofWall.castShadow = true;
    houseGroup.add(roofWall);
    
    // Intérieur du toit
    const innerRoofGeo = new THREE.BoxGeometry(width - 0.6, 0.8, depth - 0.6);
    const innerRoof = new THREE.Mesh(innerRoofGeo, groundMat);
    innerRoof.position.y = height + 0.4;
    innerRoof.receiveShadow = true;
    houseGroup.add(innerRoof);

    // Poutres saillantes (Structure en bois)
    const beamRadius = 0.12;
    const beamGeo = new THREE.CylinderGeometry(beamRadius, beamRadius, width + 1.8, 6);
    disturbGeometry(beamGeo, 0.03);
    for (let i = -depth/2 + 1.2; i < depth/2 - 0.5; i += randomRange(1.0, 1.4)) {
        const beam = new THREE.Mesh(beamGeo, oldWoodMat);
        beam.rotation.z = Math.PI / 2;
        beam.position.set(randomRange(-0.1, 0.1), height - 0.4, i);
        beam.castShadow = true;
        houseGroup.add(beam);
    }

    // Porte en bois avec cadre
    const doorFrameGeo = new THREE.BoxGeometry(1.8, 2.9, 0.5);
    const doorFrame = new THREE.Mesh(doorFrameGeo, oldWoodMat);
    const doorX = randomRange(-width/2 + 2, width/2 - 2);
    doorFrame.position.set(doorX, 1.45, depth/2 + 0.02);
    houseGroup.add(doorFrame);

    const doorGeo = disturbGeometry(new THREE.BoxGeometry(1.6, 2.7, 0.6), 0.02);
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x3a2518, roughness: 1, bumpMap: noiseBumpMap, bumpScale: 0.02 });
    const door = new THREE.Mesh(doorGeo, doorMat);
    door.position.set(doorX, 1.35, depth/2 + 0.05);
    houseGroup.add(door);

    // Petites fenêtres avec barreaux en bois
    const numWindows = Math.floor(randomRange(1, 4));
    for(let w=0; w<numWindows; w++) {
        const winH = randomRange(2.5, height - 1.5);
        const winX = randomRange(-width/2 + 1.5, width/2 - 1.5);
        if(Math.abs(winX - doorX) < 1.5) continue; // Éviter la porte

        const holeGeo = new THREE.BoxGeometry(0.8, 1, 0.6);
        const holeMat = new THREE.MeshBasicMaterial({ color: 0x110a05 });
        const hole = new THREE.Mesh(holeGeo, holeMat);
        hole.position.set(winX, winH, depth/2 + 0.05);
        houseGroup.add(hole);

        // Barreaux
        for(let b=-0.2; b<=0.2; b+=0.2) {
            const barGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.1, 4);
            const bar = new THREE.Mesh(barGeo, woodMat);
            bar.position.set(winX + b, winH, depth/2 + 0.1);
            bar.castShadow = true;
            houseGroup.add(bar);
        }
    }

    // Auvent de tissu
    if (Math.random() > 0.4) {
        const awningGeo = new THREE.PlaneGeometry(3.5, 3, 6, 6);
        const pos = awningGeo.attributes.position;
        for(let j=0; j<pos.count; j++) {
            if(pos.getY(j) < 0) {
                pos.setZ(j, pos.getZ(j) + Math.sin(pos.getX(j)*2)*0.3 - 0.4);
            }
        }
        awningGeo.computeVertexNormals();
        const awning = new THREE.Mesh(awningGeo, fabricMats[Math.floor(Math.random() * fabricMats.length)]);
        awning.position.set(doorX, 3.8, depth/2 + 1.2);
        awning.rotation.x = -Math.PI / 3;
        awning.castShadow = true;
        houseGroup.add(awning);

        const poleGeo = disturbGeometry(new THREE.CylinderGeometry(0.06, 0.06, 3.8, 5), 0.01);
        [-1.6, 1.6].forEach(px => {
            const pole = new THREE.Mesh(poleGeo, oldWoodMat);
            pole.position.set(doorX + px, 1.9, depth/2 + 2.4);
            pole.rotation.x = -0.1;
            pole.castShadow = true;
            houseGroup.add(pole);
        });
    }

    // Accessoires de toit (Poteries, tapis qui sèche)
    if (Math.random() > 0.3) {
        for(let j=0; j<randomRange(2, 5); j++) {
            const pot = createDetailedPottery();
            pot.position.set(randomRange(-width/2+1, width/2-1), height + 0.8, randomRange(-depth/2+1, depth/2-1));
            houseGroup.add(pot);
        }
        
        if (Math.random() > 0.5) {
            const rugGeo = disturbGeometry(new THREE.PlaneGeometry(2, 3, 4, 4), 0.05);
            const rug = new THREE.Mesh(rugGeo, fabricMats[Math.floor(Math.random() * fabricMats.length)]);
            rug.position.set(randomRange(-width/2+2, width/2-2), height + 0.82, randomRange(-depth/2+2, depth/2-2));
            rug.rotation.x = -Math.PI / 2;
            rug.rotation.z = randomRange(0, Math.PI);
            houseGroup.add(rug);
        }
    }

    // Ajouter un bloc annexe (Cour ou extension)
    if(Math.random() > 0.5) {
        const extW = randomRange(4, 7);
        const extD = randomRange(4, 7);
        const extH = randomRange(3, 5);
        const extGeo = disturbGeometry(new THREE.BoxGeometry(extW, extH, extD, 3, 3, 3), 0.1);
        const ext = new THREE.Mesh(extGeo, mat);
        ext.position.set(width/2 + extW/2 - 0.5, extH/2, 0);
        ext.castShadow = true; ext.receiveShadow = true;
        houseGroup.add(ext);
    }

    houseGroup.position.set(x, 0, z);
    houseGroup.rotation.y = randomRange(-0.15, 0.15); 
    scene.add(houseGroup);
    
    // Ajouter à la physique
    addCollisionBox(houseGroup, 0.5); // Buffer plus grand
}

// Palmiers très réalistes avec vent
const palmTrees = [];
function createRealisticPalm(x, z) {
    const treeGroup = new THREE.Group();
    const height = randomRange(9, 15);
    const segments = Math.floor(height * 2.5);
    
    let currentY = 0;
    const trunkCurveX = randomRange(-0.06, 0.06);
    const trunkCurveZ = randomRange(-0.06, 0.06);
    
    for(let i=0; i<segments; i++) {
        const progress = i / segments;
        const radius = 0.5 - (progress * 0.25); // Tronc plus épais et réaliste
        const segGeo = new THREE.CylinderGeometry(radius*0.9, radius, 0.5, 8);
        disturbGeometry(segGeo, 0.02); // Écorce rugueuse
        
        const seg = new THREE.Mesh(segGeo, oldWoodMat);
        seg.position.set(
            Math.pow(progress, 2) * trunkCurveX * height * 2.0,
            currentY,
            Math.pow(progress, 2) * trunkCurveZ * height * 2.0
        );
        seg.rotation.z = -progress * trunkCurveX * 2.0;
        seg.rotation.x = progress * trunkCurveZ * 2.0;
        seg.rotation.y = randomRange(0, Math.PI);
        
        seg.castShadow = true;
        seg.receiveShadow = true;
        treeGroup.add(seg);
        currentY += 0.4;
    }

    // Noix de coco / Dattes
    const fruitGeo = disturbGeometry(new THREE.SphereGeometry(0.18, 6, 6), 0.02);
    for(let i=0; i<16; i++) {
        const fruit = new THREE.Mesh(fruitGeo, mudBrickDarkMat); 
        fruit.position.set(
            treeGroup.children[segments-1].position.x + randomRange(-0.5, 0.5),
            currentY - 0.4 + randomRange(-0.3, 0.3),
            treeGroup.children[segments-1].position.z + randomRange(-0.5, 0.5)
        );
        treeGroup.add(fruit);
    }

    // Couronne de feuilles (Frondes) plus dense et structurée
    const leafCount = Math.floor(randomRange(28, 36));
    const leafGroupObj = new THREE.Group();
    leafGroupObj.position.copy(treeGroup.children[segments-1].position);
    leafGroupObj.position.y += 0.3;
    
    const baseLeafGeo = new THREE.PlaneGeometry(1.6, 7.0, 5, 12);
    const pos = baseLeafGeo.attributes.position;
    for(let j=0; j<pos.count; j++) {
        const y = pos.getY(j);
        const normY = (y + 3.5) / 7.0; 
        pos.setZ(j, -Math.pow(normY, 1.8) * 4.0); // Courbe gravitaire naturelle
        pos.setX(j, pos.getX(j) * Math.cos(normY * Math.PI / 2)); // Forme de palme réaliste
        pos.setX(j, pos.getX(j) + Math.sin(normY * Math.PI * 1.5) * 0.08); // Ondulation
    }
    baseLeafGeo.computeVertexNormals();
    baseLeafGeo.translate(0, 3.5, 0);

    for(let i=0; i<leafCount; i++) {
        const leaf = new THREE.Mesh(baseLeafGeo, leafMat);
        leaf.rotation.y = (i / leafCount) * Math.PI * 2 + randomRange(-0.1, 0.1);
        
        // Distribution des feuilles : celles du centre montent, celles de l'extérieur tombent
        const layer = Math.floor(Math.random() * 3);
        let droop;
        if(layer === 0) droop = randomRange(-0.1, 0.2); // Hautes, presque droites
        else if (layer === 1) droop = randomRange(0.4, 0.8); // Milieu
        else droop = randomRange(1.2, 1.8); // Basses et tombantes
        
        leaf.rotation.x = Math.PI/2 - droop;
        leaf.castShadow = true;
        
        leaf.userData = {
            baseRotX: leaf.rotation.x,
            phase: randomRange(0, Math.PI * 2),
            speed: randomRange(0.5, 1.0)
        };
        leafGroupObj.add(leaf);
    }
    
    treeGroup.add(leafGroupObj);
    treeGroup.position.set(x, 0, z);
    scene.add(treeGroup);
    
    palmTrees.push(leafGroupObj);

    // Collision pour le tronc
    const trunkBox = new THREE.Box3();
    trunkBox.setFromCenterAndSize(new THREE.Vector3(x, height/2, z), new THREE.Vector3(1.5, height, 1.5));
    collisionBoxes.push(trunkBox);
}

function createDetailedPottery() {
    const points = [];
    const height = randomRange(0.8, 1.6);
    const bulge = randomRange(0.3, 0.8);
    const neck = randomRange(0.1, 0.3);
    for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        let r;
        if(t > 0.85) r = neck + (t-0.85)*0.5; // Lèvre évasée
        else r = Math.sin(t * Math.PI * 1.1) * bulge + 0.15;
        points.push(new THREE.Vector2(r, t * height));
    }
    const geometry = new THREE.LatheGeometry(points, 24);
    const pot = new THREE.Mesh(geometry, potteryMat);
    pot.castShadow = true;
    pot.receiveShadow = true;
    return pot;
}

// Étals de marché hyper détaillés
function createMarketStall(x, z, rotation) {
    const stallGroup = new THREE.Group();
    
    // Structure
    const poleGeo = disturbGeometry(new THREE.CylinderGeometry(0.08, 0.08, 3.5, 6), 0.01);
    [[-1.8, -1.2], [1.8, -1.2], [-1.8, 1.2], [1.8, 1.2]].forEach(p => {
        const pole = new THREE.Mesh(poleGeo, oldWoodMat);
        pole.position.set(p[0], 1.75, p[1]);
        pole.rotation.set(randomRange(-0.05, 0.05), 0, randomRange(-0.05, 0.05));
        pole.castShadow = true;
        stallGroup.add(pole);
    });

    // Toile réaliste avec plis
    const awningGeo = new THREE.PlaneGeometry(4.2, 3.8, 12, 12);
    const pos = awningGeo.attributes.position;
    for(let i=0; i<pos.count; i++) {
        const px = pos.getX(i);
        const py = pos.getY(i);
        const sag = Math.cos(px * 1.5) * 0.25; 
        if(py < 0) {
            pos.setZ(i, pos.getZ(i) - 0.6 + sag); // Pend vers l'avant avec des plis
            pos.setY(i, pos.getY(i) + Math.sin(px * 6)*0.1); // Bordure ondulée
        } else {
            pos.setZ(i, pos.getZ(i) + sag);
        }
    }
    awningGeo.computeVertexNormals();
    const awning = new THREE.Mesh(awningGeo, fabricMats[Math.floor(Math.random() * fabricMats.length)]);
    awning.position.set(0, 3.2, 0);
    awning.rotation.x = -Math.PI / 2 + 0.4;
    awning.castShadow = true;
    stallGroup.add(awning);

    // Table de présentation
    const tableGeo = disturbGeometry(new THREE.BoxGeometry(3.6, 0.15, 1.8, 4, 1, 4), 0.02);
    const table = new THREE.Mesh(tableGeo, oldWoodMat);
    table.position.set(0, 1.2, 0);
    table.castShadow = true; table.receiveShadow = true;
    stallGroup.add(table);

    // Variété de marchandises
    const goodsType = Math.random();
    if(goodsType < 0.3) {
        // Poteries fines
        for(let i=0; i<randomRange(10, 18); i++) {
            const pot = createDetailedPottery();
            pot.position.set(randomRange(-1.6, 1.6), 1.25, randomRange(-0.7, 0.7));
            pot.scale.setScalar(randomRange(0.25, 0.5));
            stallGroup.add(pot);
        }
    } else if (goodsType < 0.6) {
        // Tissus roulés
        const rollGeo = new THREE.CylinderGeometry(0.15, 0.15, 1.4, 16);
        for(let i=0; i<randomRange(8, 14); i++) {
            const roll = new THREE.Mesh(rollGeo, fabricMats[Math.floor(Math.random() * fabricMats.length)]);
            roll.position.set(randomRange(-1.5, 1.5), 1.35 + Math.floor(i/4)*0.25, randomRange(-0.5, 0.5));
            roll.rotation.set(randomRange(-0.1, 0.1), randomRange(0, Math.PI), Math.PI / 2);
            roll.castShadow = true;
            stallGroup.add(roll);
        }
    } else {
        // Épices / Grains dans des sacs
        for(let i=0; i<8; i++) {
            const sackGeo = disturbGeometry(new THREE.SphereGeometry(0.35, 10, 10), 0.05);
            sackGeo.scale(1, 0.7, 1);
            const sack = new THREE.Mesh(sackGeo, fabricMats[5]); // Lin écru
            sack.position.set(-1.4 + (i%4)*0.9, 1.4, i>3 ? -0.4 : 0.4);
            sack.rotation.y = randomRange(0, Math.PI);
            sack.castShadow = true;
            
            const coneGeo = disturbGeometry(new THREE.ConeGeometry(0.3, 0.4, 16), 0.02);
            const spiceMat = new THREE.MeshStandardMaterial({ color: fabricColors[Math.floor(Math.random()*fabricColors.length)], roughness: 1 });
            const cone = new THREE.Mesh(coneGeo, spiceMat);
            cone.position.set(0, 0.3, 0);
            sack.add(cone);
            
            stallGroup.add(sack);
        }
    }

    // Tapis accroché devant
    const frontRugGeo = disturbGeometry(new THREE.PlaneGeometry(2.5, 1.1, 6, 4), 0.05);
    const frontRug = new THREE.Mesh(frontRugGeo, fabricMats[Math.floor(Math.random() * fabricMats.length)]);
    frontRug.position.set(0, 0.6, 1.1);
    stallGroup.add(frontRug);

    stallGroup.position.set(x, 0, z);
    stallGroup.rotation.y = rotation;
    scene.add(stallGroup);

    addCollisionBox(stallGroup, 0.4);
}

// --- 8. NPCs RÉALISTES (Hommes et Femmes en robes/tuniques) ---
const npcs = [];
function createAnimatedNPC(x, z) {
    const npcGroup = new THREE.Group();
    const isFemale = Math.random() > 0.5;
    const clothMat = fabricMats[Math.floor(Math.random() * fabricMats.length)];
    
    const wrapper = new THREE.Group(); 
    wrapper.position.set(x, 0, z);
    
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.6, 0);
    const headGeo = new THREE.SphereGeometry(0.14, 16, 16);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.castShadow = true;
    headGroup.add(head);
    
    // Bras (Communs)
    const armGeo = new THREE.CylinderGeometry(0.05, 0.04, 0.6, 8);
    const createArm = () => {
        const group = new THREE.Group();
        const mesh = new THREE.Mesh(armGeo, skinMat);
        mesh.position.y = -0.3; 
        mesh.castShadow = true;
        group.add(mesh);
        return group;
    };
    const armL = createArm(); armL.position.set(0.28, 1.4, 0); npcGroup.add(armL);
    const armR = createArm(); armR.position.set(-0.28, 1.4, 0); npcGroup.add(armR);

    let legL, legR, bodyMesh;

    if (isFemale) {
        // Femme : Longue robe élégante
        const dressGeo = disturbGeometry(new THREE.CylinderGeometry(0.15, 0.4, 1.35, 14), 0.01); // Plus evasée et fine en haut
        bodyMesh = new THREE.Mesh(dressGeo, clothMat);
        bodyMesh.position.y = 0.7;
        bodyMesh.castShadow = true;
        npcGroup.add(bodyMesh);

        // Voile / Châle sur la tête drapant les épaules
        const veilGeo = disturbGeometry(new THREE.SphereGeometry(0.16, 16, 16, 0, Math.PI * 2, 0, Math.PI / 1.3), 0.02);
        const veil = new THREE.Mesh(veilGeo, clothMat);
        veil.position.y = 0.02;
        veil.castShadow = true;
        headGroup.add(veil);
        
        // Pas de jambes visibles, on crée des groupes vides pour l'animation
        legL = new THREE.Group();
        legR = new THREE.Group();
    } else {
        // Homme : Tunique plus courte et jambes
        const tunicGeo = disturbGeometry(new THREE.CylinderGeometry(0.22, 0.22, 0.9, 10), 0.02);
        bodyMesh = new THREE.Mesh(tunicGeo, clothMat);
        bodyMesh.position.y = 1.05;
        bodyMesh.castShadow = true;
        npcGroup.add(bodyMesh);

        // Turban
        if (Math.random() > 0.3) {
            const turbanGeo = disturbGeometry(new THREE.TorusGeometry(0.15, 0.07, 8, 16), 0.02);
            const turban = new THREE.Mesh(turbanGeo, fabricMats[Math.floor(Math.random() * fabricMats.length)]);
            turban.position.y = 0.05;
            turban.rotation.x = Math.PI / 2;
            turban.castShadow = true;
            headGroup.add(turban);
        }

        const legGeo = new THREE.CylinderGeometry(0.07, 0.05, 0.7, 8);
        const createLeg = () => {
            const group = new THREE.Group();
            const mesh = new THREE.Mesh(legGeo, skinMat);
            mesh.position.y = -0.35;
            mesh.castShadow = true;
            group.add(mesh);
            return group;
        };
        legL = createLeg(); legL.position.set(0.12, 0.7, 0); npcGroup.add(legL);
        legR = createLeg(); legR.position.set(-0.12, 0.7, 0); npcGroup.add(legR);
    }

    npcGroup.add(headGroup);
    wrapper.add(npcGroup);
    scene.add(wrapper);

    // Ajouter le pnj à la liste de collision pour que le joueur ne passe pas au travers (Box dynamique qu'on mettra a jour)
    const npcBox = new THREE.Box3();
    
    npcs.push({
        wrapper: wrapper, body: npcGroup, bodyMesh: bodyMesh, isFemale: isFemale,
        armL: armL, armR: armR, legL: legL, legR: legR,
        target: new THREE.Vector3(x, 0, z),
        speed: randomRange(1.0, 2.2),
        state: 'idle',
        timer: randomRange(0, 5),
        walkCycle: randomRange(0, Math.PI * 2),
        box: npcBox
    });
    
    collisionBoxes.push(npcBox);
}

// --- 9. GÉNÉRATION DE LA VILLE ET DU MARCHÉ ---
const townRadius = 100;
const gridSize = 20;

// Ruelles et maisons d'argile
for (let x = -townRadius; x <= townRadius; x += gridSize) {
    for (let z = -townRadius; z <= townRadius; z += gridSize) {
        // Place du marché très aérée au centre, et on dégage l'entrée en z=40
        const distToCenter = Math.sqrt(x*x + z*z);
        if (distToCenter < 35) continue; 
        
        // Rues principales. Et l'entrée principale au sud (z positif)
        if (Math.abs(x) < 14 || (Math.abs(x) < 20 && z > 20) || Math.abs(z) < 14) continue; 
        
        // Espace dégagé pour le Ziggurat au Nord
        if (Math.abs(x) < 35 && z < -50) continue;

        if (Math.random() > 0.1) {
            const w = randomRange(12, 18);
            const d = randomRange(12, 18);
            const h = randomRange(7, 15);
            const px = x + randomRange(-4, 4);
            const pz = z + randomRange(-4, 4);
            createHouse(px, pz, w, d, h);
            
            if (Math.random() > 0.4) {
                createRealisticPalm(px + randomRange(-w/2-3, w/2+3), pz + randomRange(-d/2-3, d/2+3));
            }
        }
    }
}

// Grand Ziggurat imposant au Nord
createZiggurat(0, -90);

// Grand Marché Central
// L'entrée se situe environ vers z=40. On va dégager le centre pour que la vue s'ouvre.
for(let i=0; i<45; i++) {
    let sx = randomRange(-32, 32);
    let sz = randomRange(-25, 30); // Pas trop près de la caméra
    // Alignement naturel pour former des allées
    if(Math.random() > 0.5) sx = Math.round(sx / 10) * 10;
    else sz = Math.round(sz / 10) * 10;
    
    // Garder l'allée centrale dégagée face à la porte (z=40 -> vers z=-30)
    if(Math.abs(sx) < 10) continue; 

    const rot = Math.random() > 0.5 ? 0 : Math.PI / 2;
    createMarketStall(sx, sz, rot + randomRange(-0.05, 0.05));
}

// --- DÉCORS AU SOL : caisses, paniers, sacs, poteries groupées ---
const crateMat = new THREE.MeshStandardMaterial({ color: 0x5a3e28, roughness: 1, bumpMap: noiseBumpMap, bumpScale: 0.02 });
const basketMat = new THREE.MeshStandardMaterial({ color: 0x9e8050, roughness: 1, bumpMap: noiseBumpMap, bumpScale: 0.03 });
const sackMat = new THREE.MeshStandardMaterial({ color: 0xc4a670, roughness: 1 });

function createCrate(x, z) {
    const s = randomRange(0.6, 1.2);
    const geo = disturbGeometry(new THREE.BoxGeometry(s, s * 0.7, s, 2, 2, 2), 0.02);
    const crate = new THREE.Mesh(geo, crateMat);
    crate.position.set(x, s * 0.35, z);
    crate.rotation.y = randomRange(0, Math.PI);
    crate.castShadow = true; crate.receiveShadow = true;
    scene.add(crate);
    if (s > 0.9) addCollisionBox(crate, 0.1);
}

function createBasket(x, z) {
    const r = randomRange(0.25, 0.5);
    const h = randomRange(0.3, 0.6);
    const geo = new THREE.CylinderGeometry(r, r * 0.8, h, 12);
    disturbGeometry(geo, 0.02);
    const basket = new THREE.Mesh(geo, basketMat);
    basket.position.set(x, h / 2, z);
    basket.castShadow = true; basket.receiveShadow = true;
    scene.add(basket);
}

function createSack(x, z) {
    const geo = disturbGeometry(new THREE.SphereGeometry(randomRange(0.25, 0.45), 8, 8), 0.04);
    geo.scale(1, 0.65, 1);
    const sack = new THREE.Mesh(geo, sackMat);
    sack.position.set(x, 0.18, z);
    sack.rotation.y = randomRange(0, Math.PI);
    sack.castShadow = true; sack.receiveShadow = true;
    scene.add(sack);
}

for (let i = 0; i < 80; i++) {
    const rx = randomRange(-55, 55);
    const rz = randomRange(-55, 55);
    if (Math.sqrt(rx * rx + rz * rz) < 8) continue;
    const r = Math.random();
    if (r < 0.25) {
        createCrate(rx, rz);
    } else if (r < 0.45) {
        createBasket(rx, rz);
    } else if (r < 0.60) {
        createSack(rx, rz);
    } else {
        const pot = createDetailedPottery();
        pot.position.set(rx, 0, rz);
        pot.scale.setScalar(randomRange(0.5, 1.4));
        pot.rotation.y = randomRange(0, Math.PI);
        pot.rotation.z = randomRange(-0.08, 0.08);
        scene.add(pot);
        if (pot.scale.x > 1.1) addCollisionBox(pot, 0.15);
    }
}

function createZiggurat(x, z) {
    const zigguratGroup = new THREE.Group();
    
    // Matériaux pour le ziggurat (plus usés, grandioses)
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xc48c59, roughness: 1, bumpMap: noiseBumpMap, bumpScale: 0.05 });
    const tierMat = new THREE.MeshStandardMaterial({ color: 0xba7c45, roughness: 1, bumpMap: noiseBumpMap, bumpScale: 0.04 });
    const topMat = new THREE.MeshStandardMaterial({ color: 0xa86732, roughness: 1, bumpMap: noiseBumpMap, bumpScale: 0.03 });
    
    // Les étages (Tiers)
    const tiers = [
        { w: 40, d: 40, h: 8, mat: baseMat },
        { w: 30, d: 30, h: 7, mat: tierMat },
        { w: 22, d: 22, h: 6, mat: tierMat },
        { w: 14, d: 14, h: 5, mat: topMat } // Temple au sommet
    ];
    
    let currentY = 0;
    
    tiers.forEach((tier, index) => {
        const geo = disturbGeometry(new THREE.BoxGeometry(tier.w, tier.h, tier.d, 6, 3, 6), 0.2);
        const mesh = new THREE.Mesh(geo, tier.mat);
        mesh.position.y = currentY + tier.h / 2;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        zigguratGroup.add(mesh);
        
        // Ajouter un muret autour de chaque étage (sauf le temple)
        if (index < tiers.length - 1) {
            const wallGeo = disturbGeometry(new THREE.BoxGeometry(tier.w + 0.5, 1.2, tier.d + 0.5, 4, 1, 4), 0.1);
            const wall = new THREE.Mesh(wallGeo, tier.mat);
            wall.position.y = currentY + tier.h + 0.6;
            wall.castShadow = true;
            zigguratGroup.add(wall);
        }

        currentY += tier.h;
    });

    // Le Temple au sommet (Sanctuaire)
    const sanctGeo = disturbGeometry(new THREE.BoxGeometry(10, 6, 10, 4, 3, 4), 0.15);
    const sanct = new THREE.Mesh(sanctGeo, topMat);
    sanct.position.y = currentY + 3;
    sanct.castShadow = true; sanct.receiveShadow = true;
    zigguratGroup.add(sanct);
    
    // Entrée du sanctuaire
    const sanctDoorGeo = new THREE.BoxGeometry(2.5, 4, 1);
    const sanctDoorMat = new THREE.MeshBasicMaterial({ color: 0x110a05 });
    const sanctDoor = new THREE.Mesh(sanctDoorGeo, sanctDoorMat);
    sanctDoor.position.set(0, currentY + 2, 5.1);
    zigguratGroup.add(sanctDoor);

    // Grand escalier monumental à l'avant (Face Sud)
    const stairGroup = new THREE.Group();
    const stairW = 6;
    const totalStairH = tiers[0].h + tiers[1].h + tiers[2].h; // Monte jusqu'au 3ème étage
    const stairD = 25;
    
    // Rampe inclinée (Base de l'escalier)
    const stairBaseGeo = new THREE.BoxGeometry(stairW, totalStairH, stairD);
    const stairBasePos = stairBaseGeo.attributes.position;
    for(let i=0; i<stairBasePos.count; i++) {
        if (stairBasePos.getY(i) > 0) { // Haut
            stairBasePos.setZ(i, stairBasePos.getZ(i) - stairD/2); // Pousse le haut vers le temple
        } else { // Bas
            stairBasePos.setZ(i, stairBasePos.getZ(i) + stairD/2); // Pousse le bas vers l'avant
        }
    }
    stairBaseGeo.computeVertexNormals();
    disturbGeometry(stairBaseGeo, 0.1);
    const stairBase = new THREE.Mesh(stairBaseGeo, baseMat);
    stairBase.position.set(0, totalStairH/2, 20 + stairD/2);
    stairBase.castShadow = true; stairBase.receiveShadow = true;
    stairGroup.add(stairBase);
    
    // Marches de l'escalier
    const numSteps = 45;
    for(let i=0; i<numSteps; i++) {
        const stepProg = i / numSteps;
        const stepGeo = disturbGeometry(new THREE.BoxGeometry(stairW + 0.4, 0.6, 0.8), 0.05);
        const step = new THREE.Mesh(stepGeo, tierMat);
        step.position.set(
            0, 
            stepProg * totalStairH + 0.3, 
            20 + stairD - (stepProg * stairD)
        );
        step.castShadow = true;
        stairGroup.add(step);
    }
    
    zigguratGroup.add(stairGroup);

    // Feux sacrificiels / Braseros devant le temple
    for (let sign of [-1, 1]) {
        const braseroGeo = new THREE.CylinderGeometry(0.8, 0.5, 1.5, 8);
        const brasero = new THREE.Mesh(braseroGeo, new THREE.MeshStandardMaterial({color: 0x333333}));
        brasero.position.set(sign * 6, currentY + 0.75, 8);
        zigguratGroup.add(brasero);
        
        const flameMat = new THREE.MeshBasicMaterial({ color: 0xffaa44 });
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.5, 8), flameMat);
        flame.position.set(sign * 6, currentY + 2.0, 8);
        zigguratGroup.add(flame);
        
        const light = new THREE.PointLight(0xffaa44, 2.0, 30);
        light.position.set(sign * 6, currentY + 2.5, 8);
        zigguratGroup.add(light);
    }

    zigguratGroup.position.set(x, 0, z);
    scene.add(zigguratGroup);

    // Grosse zone de collision
    const ziggBox = new THREE.Box3();
    ziggBox.setFromCenterAndSize(new THREE.Vector3(x, 15, z), new THREE.Vector3(42, 30, 42));
    collisionBoxes.push(ziggBox);
    
    // Collision pour les escaliers
    const stairBox = new THREE.Box3();
    stairBox.setFromCenterAndSize(new THREE.Vector3(x, 5, z + 20 + stairD/2), new THREE.Vector3(stairW + 2, 10, stairD + 2));
    collisionBoxes.push(stairBox);
}

// --- ANIMAUX : Ânes, Chameaux, Moutons, Chèvres ---
const animals = [];
const animalTypes = ['camel', 'donkey', 'sheep', 'goat'];

function createAnimal(x, z, overrideType = null) {
    const animalGroup = new THREE.Group();
    const type = overrideType || animalTypes[Math.floor(Math.random() * animalTypes.length)];
    
    let bodyLen, bodyH, legH, bodyColor, neckL, headSize, mat, roughMat;
    
    // Configurations par type d'animal
    switch(type) {
        case 'camel':
            bodyLen = 2.4; bodyH = 1.6; legH = 1.4; bodyColor = 0xb89b65; neckL = 1.2; headSize = 0.45;
            break;
        case 'donkey':
            bodyLen = 1.6; bodyH = 1.0; legH = 0.8; bodyColor = 0x6e6056; neckL = 0.6; headSize = 0.35;
            break;
        case 'sheep':
            bodyLen = 1.1; bodyH = 0.8; legH = 0.4; bodyColor = 0xe8e1d7; neckL = 0.3; headSize = 0.25;
            break;
        case 'goat':
            bodyLen = 1.2; bodyH = 0.8; legH = 0.6; bodyColor = Math.random() > 0.5 ? 0x2e2b29 : 0x82644e; neckL = 0.4; headSize = 0.22;
            break;
    }

    mat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.95 });
    roughMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 1.0, bumpMap: noiseBumpMap, bumpScale: 0.05 }); // Pour laine/poils

    // Corps (plus gonflé pour les moutons)
    const bodyGeo = type === 'sheep' ? 
        disturbGeometry(new THREE.BoxGeometry(bodyLen, bodyH * 1.2, bodyH * 1.1, 4, 3, 3), 0.1) : 
        disturbGeometry(new THREE.BoxGeometry(bodyLen, bodyH * 0.7, bodyH * 0.5, 3, 2, 2), 0.04);
        
    const body = new THREE.Mesh(bodyGeo, type === 'sheep' ? roughMat : mat);
    body.position.y = legH + bodyH * 0.35;
    body.castShadow = true;
    animalGroup.add(body);

    // Bosses (Chameau)
    if (type === 'camel') {
        const humpGeo = disturbGeometry(new THREE.SphereGeometry(0.45, 8, 8), 0.05);
        const hump = new THREE.Mesh(humpGeo, mat);
        hump.position.set(0, legH + bodyH * 0.7, 0);
        hump.scale.set(1, 1.2, 0.8);
        hump.castShadow = true;
        animalGroup.add(hump);
    }
    
    // Marchandises sur l'âne
    if (type === 'donkey' && Math.random() > 0.3) {
        const goodsGroup = new THREE.Group();
        const packGeo = disturbGeometry(new THREE.BoxGeometry(0.8, 0.6, 0.5), 0.05);
        const packMat = new THREE.MeshStandardMaterial({ color: 0x8f725a, roughness: 1 });
        
        // Sac gauche
        const packL = new THREE.Mesh(packGeo, packMat);
        packL.position.set(0, legH + bodyH * 0.5, bodyH * 0.4);
        packL.rotation.z = -0.2;
        packL.castShadow = true;
        goodsGroup.add(packL);
        
        // Sac droit
        const packR = new THREE.Mesh(packGeo, packMat);
        packR.position.set(0, legH + bodyH * 0.5, -bodyH * 0.4);
        packR.rotation.z = 0.2;
        packR.castShadow = true;
        goodsGroup.add(packR);
        
        animalGroup.add(goodsGroup);
    }

    // Cou et tête (Groupés pour animation)
    const headNeckGroup = new THREE.Group();
    headNeckGroup.position.set(bodyLen * 0.45, legH + bodyH * 0.4, 0);

    const neckGeo = disturbGeometry(new THREE.CylinderGeometry(0.1, 0.15, neckL, 6), 0.02);
    const neck = new THREE.Mesh(neckGeo, type === 'sheep' ? roughMat : mat);
    neck.position.set(Math.sin(0.4)*neckL/2, Math.cos(0.4)*neckL/2, 0);
    neck.rotation.z = -0.4;
    neck.castShadow = true;
    headNeckGroup.add(neck);

    const headGeo = disturbGeometry(new THREE.BoxGeometry(headSize*1.2, headSize, headSize*0.7, 2, 2, 2), 0.02);
    const head = new THREE.Mesh(headGeo, mat);
    head.position.set(Math.sin(0.4)*neckL + headSize*0.3, Math.cos(0.4)*neckL + headSize*0.2, 0);
    head.rotation.z = 0.2;
    head.castShadow = true;
    headNeckGroup.add(head);
    
    // Oreilles / Cornes
    if (type === 'donkey') {
        const earGeo = new THREE.ConeGeometry(0.04, 0.3, 4);
        const earL = new THREE.Mesh(earGeo, mat);
        earL.position.set(Math.sin(0.4)*neckL - 0.05, Math.cos(0.4)*neckL + 0.3, 0.15);
        earL.rotation.set(-0.2, 0, 0.3);
        const earR = new THREE.Mesh(earGeo, mat);
        earR.position.set(Math.sin(0.4)*neckL - 0.05, Math.cos(0.4)*neckL + 0.3, -0.15);
        earR.rotation.set(0.2, 0, 0.3);
        headNeckGroup.add(earL, earR);
    } else if (type === 'goat') {
        const hornGeo = new THREE.CylinderGeometry(0.01, 0.03, 0.25, 4);
        const hornMat = new THREE.MeshStandardMaterial({color: 0x333333, roughness: 0.8});
        const hornL = new THREE.Mesh(hornGeo, hornMat);
        hornL.position.set(Math.sin(0.4)*neckL, Math.cos(0.4)*neckL + 0.25, 0.08);
        hornL.rotation.set(-0.1, 0, -0.4);
        const hornR = new THREE.Mesh(hornGeo, hornMat);
        hornR.position.set(Math.sin(0.4)*neckL, Math.cos(0.4)*neckL + 0.25, -0.08);
        hornR.rotation.set(0.1, 0, -0.4);
        headNeckGroup.add(hornL, hornR);
        
        // Barbiche
        const beardGeo = new THREE.ConeGeometry(0.03, 0.15, 4);
        const beard = new THREE.Mesh(beardGeo, roughMat);
        beard.position.set(Math.sin(0.4)*neckL + 0.2, Math.cos(0.4)*neckL - 0.1, 0);
        beard.rotation.z = -0.5;
        headNeckGroup.add(beard);
    }

    animalGroup.add(headNeckGroup);

    // Pattes (Mouton a des petites pattes fines noires/marron foncé)
    const legThick = type === 'sheep' ? 0.03 : 0.06;
    const legGeo = new THREE.CylinderGeometry(legThick*0.8, legThick, legH, 6);
    const legMat = type === 'sheep' ? new THREE.MeshStandardMaterial({color: 0x3a2c22, roughness: 1}) : mat;
    
    const legPositions = [
        [bodyLen * 0.3, legH / 2, bodyH * 0.2],
        [bodyLen * 0.3, legH / 2, -bodyH * 0.2],
        [-bodyLen * 0.3, legH / 2, bodyH * 0.2],
        [-bodyLen * 0.3, legH / 2, -bodyH * 0.2]
    ];
    const legs = [];
    legPositions.forEach(p => {
        const legGroup = new THREE.Group();
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.y = -legH / 2;
        leg.castShadow = true;
        legGroup.add(leg);
        legGroup.position.set(p[0], p[1], p[2]);
        animalGroup.add(legGroup);
        legs.push(legGroup);
    });

    // Queue
    const tailGeo = new THREE.CylinderGeometry(0.02, 0.01, type === 'sheep' ? 0.2 : 0.6, 4);
    const tail = new THREE.Mesh(tailGeo, type === 'sheep' ? roughMat : mat);
    tail.position.set(-bodyLen * 0.5, legH + bodyH * 0.2, 0);
    tail.rotation.z = type === 'goat' ? -0.5 : 0.4; // Chèvre queue levée
    animalGroup.add(tail);

    animalGroup.position.set(x, 0, z);
    animalGroup.rotation.y = randomRange(0, Math.PI * 2);
    scene.add(animalGroup);

    const animalBox = new THREE.Box3();
    collisionBoxes.push(animalBox);

    // Vitesse adaptée à l'animal
    const speed = type === 'camel' ? randomRange(0.6, 1.2) : 
                  type === 'donkey' ? randomRange(0.8, 1.5) : 
                  randomRange(0.3, 0.7); // Moutons lents

    animals.push({
        group: animalGroup, legs, tail, headNeckGroup, type: type,
        target: new THREE.Vector3(x + randomRange(-15, 15), 0, z + randomRange(-15, 15)),
        speed: speed, state: 'idle', timer: randomRange(2, 10),
        walkCycle: 0, box: animalBox
    });
}

// Générer un troupeau de moutons ou chèvres
for (let i = 0; i < 24; i++) {
    const ax = randomRange(-70, 70);
    const az = randomRange(-45, 70); // Pas dans le Ziggurat
    if (Math.sqrt(ax * ax + az * az) < 20) continue; // Pas au centre
    createAnimal(ax, az, Math.random() > 0.6 ? 'goat' : 'sheep');
}

// Chameaux et Ânes marchands
for (let i = 0; i < 14; i++) {
    const ax = randomRange(-50, 50);
    const az = randomRange(-40, 50); // Pas dans le Ziggurat
    if (Math.sqrt(ax * ax + az * az) < 12) continue;
    createAnimal(ax, az, Math.random() > 0.5 ? 'camel' : 'donkey');
}

// --- TORCHES / LAMPES avec lumière chaude ---
function createTorch(x, z) {
    const torchGroup = new THREE.Group();
    const poleGeo = disturbGeometry(new THREE.CylinderGeometry(0.06, 0.08, 3.2, 6), 0.01);
    const pole = new THREE.Mesh(poleGeo, oldWoodMat);
    pole.position.y = 1.6;
    pole.castShadow = true;
    torchGroup.add(pole);

    const bowlGeo = new THREE.CylinderGeometry(0.18, 0.12, 0.25, 8);
    const bowlMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 1 });
    const bowl = new THREE.Mesh(bowlGeo, bowlMat);
    bowl.position.y = 3.2;
    torchGroup.add(bowl);

    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8830 });
    const flameGeo = new THREE.ConeGeometry(0.1, 0.3, 8);
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.y = 3.45;
    torchGroup.add(flame);

    const light = new THREE.PointLight(0xff9944, 0.8, 18, 2);
    light.position.y = 3.4;
    light.castShadow = false;
    torchGroup.add(light);

    torchGroup.position.set(x, 0, z);
    scene.add(torchGroup);
    return { flame, light };
}

const torches = [];
const torchPositions = [
    [-12, 0], [12, 0], [-12, -15], [12, -15], [-12, 15], [12, 15],
    [-25, -25], [25, -25], [-25, 25], [25, 25], [0, -30], [0, 30],
    [-35, 0], [35, 0], [-8, 40], [8, 40]
];
torchPositions.forEach(p => torches.push(createTorch(p[0], p[1])));

// --- PUITS CENTRAL ---
function createWell() {
    const wellGroup = new THREE.Group();
    const wallGeo = new THREE.CylinderGeometry(1.2, 1.4, 1.0, 16, 1, true);
    disturbGeometry(wallGeo, 0.03);
    const wall = new THREE.Mesh(wallGeo, mudBrickMat);
    wall.position.y = 0.5;
    wall.castShadow = true; wall.receiveShadow = true;
    wellGroup.add(wall);

    const rimGeo = new THREE.TorusGeometry(1.3, 0.12, 8, 24);
    const rim = new THREE.Mesh(rimGeo, mudBrickDarkMat);
    rim.position.y = 1.0;
    rim.rotation.x = Math.PI / 2;
    rim.castShadow = true;
    wellGroup.add(rim);

    const waterGeo = new THREE.CircleGeometry(1.1, 24);
    const waterMat = new THREE.MeshStandardMaterial({
        color: 0x2a5a3a, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.7
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.4;
    wellGroup.add(water);

    const postGeo = disturbGeometry(new THREE.CylinderGeometry(0.08, 0.08, 2.5, 6), 0.01);
    [-1.1, 1.1].forEach(px => {
        const post = new THREE.Mesh(postGeo, oldWoodMat);
        post.position.set(px, 2.25, 0);
        post.castShadow = true;
        wellGroup.add(post);
    });

    const crossGeo = disturbGeometry(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), 0.01);
    const cross = new THREE.Mesh(crossGeo, oldWoodMat);
    cross.position.y = 3.5;
    cross.rotation.z = Math.PI / 2;
    cross.castShadow = true;
    wellGroup.add(cross);

    const ropeGeo = new THREE.CylinderGeometry(0.02, 0.02, 1.8, 4);
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 1 });
    const rope = new THREE.Mesh(ropeGeo, ropeMat);
    rope.position.y = 2.6;
    wellGroup.add(rope);

    const bucketGeo = disturbGeometry(new THREE.CylinderGeometry(0.12, 0.10, 0.25, 8), 0.01);
    const bucket = new THREE.Mesh(bucketGeo, oldWoodMat);
    bucket.position.y = 1.7;
    wellGroup.add(bucket);

    wellGroup.position.set(0, 0, -5);
    scene.add(wellGroup);
    addCollisionBox(wellGroup, 0.5);
}
createWell();

// --- CORDES ET DÉCORATIONS SUSPENDUES entre étals ---
function createHangingDecor(x1, z1, x2, z2, height) {
    const points = [];
    const segments = 16;
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const px = x1 + (x2 - x1) * t;
        const pz = z1 + (z2 - z1) * t;
        const sag = Math.sin(t * Math.PI) * 1.2;
        points.push(new THREE.Vector3(px, height - sag, pz));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const ropeGeo = new THREE.TubeGeometry(curve, 20, 0.02, 6, false);
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 1 });
    const rope = new THREE.Mesh(ropeGeo, ropeMat);
    rope.castShadow = true;
    scene.add(rope);

    const numHanging = Math.floor(randomRange(3, 7));
    for (let i = 0; i < numHanging; i++) {
        const t = randomRange(0.15, 0.85);
        const pt = curve.getPoint(t);
        if (Math.random() > 0.5) {
            const clothW = randomRange(0.4, 0.8);
            const clothH = randomRange(0.3, 0.7);
            const clothGeo = new THREE.PlaneGeometry(clothW, clothH, 4, 4);
            const pos = clothGeo.attributes.position;
            for (let j = 0; j < pos.count; j++) {
                pos.setZ(j, Math.sin(pos.getX(j) * 3) * 0.05);
            }
            clothGeo.computeVertexNormals();
            const cloth = new THREE.Mesh(clothGeo, fabricMats[Math.floor(Math.random() * fabricMats.length)]);
            cloth.position.set(pt.x, pt.y - clothH / 2, pt.z);
            cloth.rotation.y = randomRange(0, Math.PI);
            cloth.castShadow = true;
            scene.add(cloth);
        } else {
            const lanternGeo = new THREE.SphereGeometry(randomRange(0.08, 0.15), 8, 8);
            const lanternMat = new THREE.MeshStandardMaterial({
                color: [0xcc6622, 0xbb4411, 0xddaa33][Math.floor(Math.random() * 3)],
                roughness: 0.6, emissive: 0x331100, emissiveIntensity: 0.3
            });
            const lantern = new THREE.Mesh(lanternGeo, lanternMat);
            lantern.position.set(pt.x, pt.y - 0.1, pt.z);
            lantern.castShadow = true;
            scene.add(lantern);
        }
    }
}

const hangingPairs = [
    [-15, -8, -15, 8, 4.5], [15, -8, 15, 8, 4.5],
    [-20, -20, -10, -20, 5], [10, -20, 20, -20, 5],
    [-25, 10, -15, 10, 4], [15, 10, 25, 10, 4],
    [-12, 25, 12, 25, 5], [-30, -5, -20, -5, 4.5],
    [20, -5, 30, -5, 4.5], [-18, -30, -8, -30, 4]
];
hangingPairs.forEach(p => createHangingDecor(p[0], p[1], p[2], p[3], p[4]));

// Oasis de palmiers au centre
for(let i=0; i<15; i++) {
    createRealisticPalm(randomRange(-30, 30), randomRange(-30, 30));
}

// Foule vivante (ne pas spawn dans le Ziggurat)
for(let i=0; i<100; i++) {
    createAnimatedNPC(randomRange(-60, 60), randomRange(-45, 60));
}


    // Ajouter un mur d'enceinte / Grande porte d'entrée au sud
function createCityGate() {
    const gateGroup = new THREE.Group();
    
    // Piliers de la porte
    const pillarW = 6, pillarD = 8, pillarH = 18;
    const pillarL = new THREE.Mesh(disturbGeometry(new THREE.BoxGeometry(pillarW, pillarH, pillarD, 3,3,3), 0.1), mudBrickMat);
    pillarL.position.set(-8, pillarH/2, 45);
    pillarL.castShadow = true; pillarL.receiveShadow = true;
    gateGroup.add(pillarL);
    addCollisionBox(pillarL);

    const pillarR = new THREE.Mesh(disturbGeometry(new THREE.BoxGeometry(pillarW, pillarH, pillarD, 3,3,3), 0.1), mudBrickMat);
    pillarR.position.set(8, pillarH/2, 45);
    pillarR.castShadow = true; pillarR.receiveShadow = true;
    gateGroup.add(pillarR);
    addCollisionBox(pillarR);

    // Arche (Linteau en briques plus sombres)
    const archH = 4;
    const arch = new THREE.Mesh(disturbGeometry(new THREE.BoxGeometry(16, archH, pillarD, 3,3,3), 0.05), mudBrickDarkMat);
    arch.position.set(0, pillarH - archH/2, 45);
    arch.castShadow = true; arch.receiveShadow = true;
    gateGroup.add(arch);
    
    // Murs d'enceinte qui partent sur les côtés
    const wallW = 100, wallH = 14, wallD = 5;
    const wallL = new THREE.Mesh(disturbGeometry(new THREE.BoxGeometry(wallW, wallH, wallD, 5,3,3), 0.2), mudBrickMat);
    wallL.position.set(-11 - wallW/2, wallH/2, 45);
    wallL.castShadow = true; wallL.receiveShadow = true;
    gateGroup.add(wallL);
    addCollisionBox(wallL);
    
    const wallR = new THREE.Mesh(disturbGeometry(new THREE.BoxGeometry(wallW, wallH, wallD, 5,3,3), 0.2), mudBrickMat);
    wallR.position.set(11 + wallW/2, wallH/2, 45);
    wallR.castShadow = true; wallR.receiveShadow = true;
    gateGroup.add(wallR);
    addCollisionBox(wallR);

    scene.add(gateGroup);
}
createCityGate();

// --- 10. CONTRÔLES FPS & SYSTÈME DE COLLISION ---
const controls = new PointerLockControls(camera, document.body);
scene.add(controls.getObject());

// Forcer la caméra à regarder le marché depuis l'entrée (orientation vers le nord / Z négatif)
controls.getObject().rotation.y = Math.PI; // Pivoter la caméra de 180° pour regarder vers le marché

const instructions = document.getElementById('instructions');
instructions.addEventListener('click', () => controls.lock());
controls.addEventListener('lock', () => instructions.style.display = 'none');
controls.addEventListener('unlock', () => instructions.style.display = 'flex');

let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let canJump = false, isSprinting = false, isGrounded = true, isNoClip = false;
let prevTime = performance.now();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

document.addEventListener('keydown', (e) => {
    switch (e.code) {
        case 'ArrowUp': case 'KeyW': case 'KeyZ': moveForward = true; break;
        case 'ArrowLeft': case 'KeyA': case 'KeyQ': moveLeft = true; break;
        case 'ArrowDown': case 'KeyS': moveBackward = true; break;
        case 'ArrowRight': case 'KeyD': moveRight = true; break;
        case 'Space': if (canJump && !isNoClip) velocity.y += 9.0; canJump = false; break;
        case 'ShiftLeft': case 'ShiftRight': isSprinting = true; break;
        case 'KeyF': 
            isNoClip = !isNoClip; 
            if(isNoClip) velocity.set(0, 0, 0); 
            break;
    }
});
document.addEventListener('keyup', (e) => {
    switch (e.code) {
        case 'ArrowUp': case 'KeyW': case 'KeyZ': moveForward = false; break;
        case 'ArrowLeft': case 'KeyA': case 'KeyQ': moveLeft = false; break;
        case 'ArrowDown': case 'KeyS': moveBackward = false; break;
        case 'ArrowRight': case 'KeyD': moveRight = false; break;
        case 'ShiftLeft': case 'ShiftRight': isSprinting = false; break;
    }
});

function checkCollision() {
    const pos = controls.getObject().position;
    const playerRadius = 0.5; // Rayon plus grand pour ne pas s'enfoncer du tout dans les murs
    const playerHeight = 1.7;
    // Boîte englobante du joueur
    const playerBox = new THREE.Box3(
        new THREE.Vector3(pos.x - playerRadius, pos.y - playerHeight, pos.z - playerRadius),
        new THREE.Vector3(pos.x + playerRadius, pos.y + 0.2, pos.z + playerRadius)
    );
    for(let box of collisionBoxes) {
        if(playerBox.intersectsBox(box)) return true;
    }
    return false;
}

// --- 11. BOUCLE D'ANIMATION ---
function animate() {
    requestAnimationFrame(animate);
    const time = performance.now();
    const delta = Math.min((time - prevTime) / 1000, 0.1); 
    prevTime = time;

    // Particules de Poussière
    const dustPositions = dustGeo.attributes.position.array;
    for(let i=0; i<dustCount*3; i+=3) {
        dustPositions[i] -= 1.2 * delta; 
        dustPositions[i+1] += Math.sin(time * 0.001 + dustPositions[i]) * 0.3 * delta; 
        if(dustPositions[i] < -150) dustPositions[i] = 150;
    }
    dustGeo.attributes.position.needsUpdate = true;

    // Animation des palmiers (Vent très léger et réaliste)
    palmTrees.forEach(leaves => {
        leaves.children.forEach(leaf => {
            const wind = Math.sin(time * 0.0003 * leaf.userData.speed + leaf.userData.phase) * 0.01; // Encore moins de mouvement
            leaf.rotation.x = leaf.userData.baseRotX + wind;
        });
    });

    // Animation de la sphère céleste (rotation lente des nuages)
    skySphere.rotation.y += 0.005 * delta;

    // Animation de la foule
    npcs.forEach(npc => {
        if (npc.state === 'idle') {
            npc.timer -= delta;
            npc.body.position.y = Math.sin(time * 0.002) * 0.02; 
            
            npc.armL.rotation.x = THREE.MathUtils.lerp(npc.armL.rotation.x, 0, 0.1);
            npc.armR.rotation.x = THREE.MathUtils.lerp(npc.armR.rotation.x, 0, 0.1);
            if(!npc.isFemale) {
                npc.legL.rotation.x = THREE.MathUtils.lerp(npc.legL.rotation.x, 0, 0.1);
                npc.legR.rotation.x = THREE.MathUtils.lerp(npc.legR.rotation.x, 0, 0.1);
            } else {
                // Léger mouvement de la robe au repos
                npc.bodyMesh.rotation.z = Math.sin(time * 0.001 + npc.walkCycle) * 0.02;
            }

            if (npc.timer <= 0) {
                npc.state = 'walking';
                npc.target.set(
                    npc.wrapper.position.x + randomRange(-25, 25), 
                    0, 
                    npc.wrapper.position.z + randomRange(-25, 25)
                );
                npc.target.x = Math.max(-townRadius+5, Math.min(townRadius-5, npc.target.x));
                npc.target.z = Math.max(-50, Math.min(townRadius-5, npc.target.z)); // Ne pas aller dans le Ziggurat
            }
        } else if (npc.state === 'walking') {
            const dist = npc.wrapper.position.distanceTo(npc.target);
            if (dist < 0.5) {
                npc.state = 'idle';
                npc.timer = randomRange(3, 12);
            } else {
                const targetRotation = Math.atan2(npc.target.x - npc.wrapper.position.x, npc.target.z - npc.wrapper.position.z);
                const diff = targetRotation - npc.wrapper.rotation.y;
                npc.wrapper.rotation.y += Math.atan2(Math.sin(diff), Math.cos(diff)) * 4 * delta;
                
                npc.wrapper.translateZ(npc.speed * delta);
                
                npc.walkCycle += npc.speed * delta * 4;
                const swing = Math.sin(npc.walkCycle) * 0.6;
                
                npc.armL.rotation.x = swing;
                npc.armR.rotation.x = -swing;
                
                if(!npc.isFemale) {
                    npc.legL.rotation.x = -swing;
                    npc.legR.rotation.x = swing;
                } else {
                    // Les femmes ont un léger balancement de hanche/robe
                    npc.bodyMesh.rotation.z = Math.sin(npc.walkCycle) * 0.05;
                }
                
                npc.body.position.y = Math.abs(Math.sin(npc.walkCycle * 2)) * 0.04;
            }
        }
        
        // Mettre à jour la collision du pnj
        if (npc.box && npc.wrapper && npc.wrapper.position) {
            npc.box.setFromCenterAndSize(
                new THREE.Vector3(npc.wrapper.position.x, 0.8, npc.wrapper.position.z),
                new THREE.Vector3(0.7, 1.8, 0.7)
            );
        }
    });

    // Animation des animaux
    animals.forEach(a => {
        if (a.state === 'idle') {
            a.timer -= delta;
            
            // Animation tête/queue au repos
            if (a.type === 'sheep') {
                a.headNeckGroup.rotation.x = Math.sin(time * 0.002) * 0.1; // Broute
                a.tail.rotation.z = Math.sin(time * 0.01) * 0.1;
            } else if (a.type === 'goat') {
                a.headNeckGroup.rotation.y = Math.sin(time * 0.001) * 0.2; // Regarde autour
                a.tail.rotation.z = -0.5 + Math.sin(time * 0.02) * 0.15;
            } else {
                a.headNeckGroup.rotation.x = Math.sin(time * 0.001) * 0.05;
                a.tail.rotation.z = 0.4 + Math.sin(time * 0.005) * 0.3;
            }

            if (a.timer <= 0) {
                a.state = 'walking';
                // Moutons/Chèvres bougent moins loin
                const dist = (a.type === 'sheep' || a.type === 'goat') ? 10 : 25;
                a.target.set(
                    a.group.position.x + randomRange(-dist, dist),
                    0,
                    a.group.position.z + randomRange(-dist, dist)
                );
                a.target.x = Math.max(-70, Math.min(70, a.target.x));
                a.target.z = Math.max(-45, Math.min(70, a.target.z)); // Ne pas aller dans le Ziggurat
            }
        } else {
            const dist = a.group.position.distanceTo(a.target);
            if (dist < 1.5) {
                a.state = 'idle';
                a.timer = randomRange(5, 15);
                a.headNeckGroup.rotation.x = 0; // Remet la tête droite
                a.headNeckGroup.rotation.y = 0;
            } else {
                const targetRot = Math.atan2(a.target.x - a.group.position.x, a.target.z - a.group.position.z);
                const diff = targetRot - a.group.rotation.y;
                a.group.rotation.y += Math.atan2(Math.sin(diff), Math.cos(diff)) * 2 * delta;
                a.group.translateZ(a.speed * delta);
                
                a.walkCycle += a.speed * delta * (a.type === 'sheep' ? 6 : 4);
                const swing = Math.sin(a.walkCycle) * 0.3;
                
                // Mouvement des pattes (diagonale)
                a.legs[0].rotation.x = swing;
                a.legs[1].rotation.x = -swing;
                a.legs[2].rotation.x = -swing;
                a.legs[3].rotation.x = swing;
                
                // Corps tangue légèrement
                a.group.position.y = Math.abs(Math.sin(a.walkCycle * 2)) * 0.05;
                
                // Mouvement de tête rythmé avec la marche
                a.headNeckGroup.rotation.x = Math.sin(a.walkCycle * 2) * 0.05;
            }
        }
        
        if (a.box) {
            const boxW = a.type === 'camel' ? 3.0 : (a.type === 'sheep' ? 1.4 : 2.0);
            const boxH = a.type === 'camel' ? 2.5 : (a.type === 'sheep' ? 1.0 : 1.5);
            a.box.setFromCenterAndSize(
                new THREE.Vector3(a.group.position.x, boxH / 2, a.group.position.z),
                new THREE.Vector3(boxW, boxH, boxW) // Boîte cube large pour simplifier la rotation
            );
        }
    });

    // Animation des torches (flammes qui vacillent)
    torches.forEach((t, i) => {
        const flicker = Math.sin(time * 0.01 + i * 2) * 0.15 + Math.sin(time * 0.023 + i) * 0.1;
        t.flame.scale.set(1 + flicker, 1 + Math.abs(flicker) * 0.5, 1 + flicker);
        t.flame.rotation.z = Math.sin(time * 0.007 + i) * 0.15;
        t.light.intensity = 0.7 + flicker * 0.5;
    });

    // Mouvements FPS avec Physique/Collisions indépendantes par axe
    if (controls && controls.isLocked === true) {
        const camObj = controls.getObject();

        // Obtenir la direction de la vue actuelle de la caméra
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camObj.quaternion);
        if (!isNoClip) {
            forward.y = 0; // En FPS, on avance toujours horizontalement
            forward.normalize();
        }
        
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camObj.quaternion);
        if (!isNoClip) {
            right.y = 0;
            right.normalize();
        }

        // Direction d'input locale
        const inputDir = new THREE.Vector3();
        if (moveForward) inputDir.add(forward);
        if (moveBackward) inputDir.sub(forward);
        if (moveRight) inputDir.add(right);
        if (moveLeft) inputDir.sub(right);
        inputDir.normalize();

        // Physique
        const friction = isNoClip ? 8.0 : (isGrounded ? 12.0 : 1.5); 
        
        velocity.x -= velocity.x * friction * delta;
        velocity.z -= velocity.z * friction * delta;
        
        if (isNoClip) {
            velocity.y -= velocity.y * friction * delta; // Friction verticale
        } else {
            velocity.y -= 38.0 * delta; // Gravité réactive
        }

        const accel = isNoClip ? 200.0 : (isGrounded ? 120.0 : 30.0);
        
        if (inputDir.lengthSq() > 0) {
            velocity.x += inputDir.x * accel * delta;
            velocity.z += inputDir.z * accel * delta;
            if (isNoClip) {
                velocity.y += inputDir.y * accel * delta;
            }
        }

        // Limiter la vitesse max
        const maxSpeed = isNoClip ? (isSprinting ? 80.0 : 30.0) : (isSprinting ? 22.0 : 12.0);
        const currentSpeedSq = isNoClip 
            ? velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z 
            : velocity.x * velocity.x + velocity.z * velocity.z;
            
        if (currentSpeedSq > maxSpeed * maxSpeed) {
            const ratio = maxSpeed / Math.sqrt(currentSpeedSq);
            velocity.x *= ratio;
            velocity.z *= ratio;
            if (isNoClip) velocity.y *= ratio;
        }

        // Sauvegarder la position pour l'annulation (collisons)
        const oldPos = camObj.position.clone();
        const originalVelX = velocity.x;
        const originalVelZ = velocity.z;

        // --- Mouvement Horizontal (Collision X et Z séparément pour "glisser" sur les murs) ---
        camObj.position.x += velocity.x * delta;
        if(!isNoClip && checkCollision()) {
            camObj.position.x = oldPos.x; // Glisser sur mur Z
            velocity.x = 0; 
        }

        camObj.position.z += velocity.z * delta;
        if(!isNoClip && checkCollision()) {
            camObj.position.z = oldPos.z; // Glisser sur mur X
            velocity.z = 0;
        }

        // --- Algorithme d'escalier (franchir les petits obstacles) ---
        if (!isNoClip && velocity.x === 0 && velocity.z === 0 && inputDir.lengthSq() > 0) {
            camObj.position.y += 0.8; // Soulever virtuellement
            camObj.position.x += originalVelX * delta;
            camObj.position.z += originalVelZ * delta;
            if(checkCollision()) {
                camObj.position.copy(oldPos); // Obstacle trop haut
            }
        }

        // --- Mouvement Vertical (Gravité et saut) ---
        camObj.position.y += velocity.y * delta;
        isGrounded = false; // Par défaut on est en l'air, sauf si on touche le sol

        // Toucher un objet par le haut (Toit, caisse, etc)
        if (!isNoClip && checkCollision()) {
            if (velocity.y < 0) {
                // On atterrit sur quelque chose
                camObj.position.y -= velocity.y * delta; 
                velocity.y = 0;
                canJump = true;
                isGrounded = true;
            } else if (velocity.y > 0) {
                // On tape la tête au plafond
                camObj.position.y -= velocity.y * delta;
                velocity.y = 0;
            }
        }

        // Toucher le sol absolu
        if (!isNoClip && camObj.position.y <= 1.7) {
            camObj.position.y = 1.7;
            velocity.y = 0;
            canJump = true;
            isGrounded = true;
        }
        
        // Limite du sol en noclip pour éviter de se perdre sous la map
        if (isNoClip && camObj.position.y <= 0.2) {
            camObj.position.y = 0.2;
            velocity.y = Math.max(0, velocity.y);
        }
        
        // --- Head Bobbing ultra fluide basé sur la vitesse horizontale ---
        if (isGrounded && !isNoClip) {
            const actualHorizSpeed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
            if (actualHorizSpeed > 1.0) {
                const bobSpeedMult = isSprinting ? 0.016 : 0.012;
                const bobAmount = isSprinting ? 0.07 : 0.04;
                // Transition plus douce
                camObj.position.y = 1.7 + Math.sin(time * bobSpeedMult) * bobAmount * (actualHorizSpeed / maxSpeed);
            }
        }
    } // Fin if (controls.isLocked)

    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();