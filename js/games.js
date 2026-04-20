// --- GLOBAL GAME STATE ---
let currentGame = null;
let keys = {};

// --- DOOM LITE ENGINE (Dental Edition) ---
let doomLoopId = null;
let doomCanvas, dctx;
const mapSize = 16;
const doomMap = [
  1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
  1,0,0,0,0,0,0,1,1,0,0,0,0,0,0,1,
  1,0,1,1,1,1,0,0,0,0,1,1,1,1,0,1,
  1,0,1,0,0,1,0,1,1,0,1,0,0,1,0,1,
  1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
  1,0,1,0,0,1,0,1,1,0,1,0,0,1,0,1,
  1,0,1,1,1,1,0,0,0,0,1,1,1,1,0,1,
  1,0,0,0,0,0,0,1,1,0,0,0,0,0,0,1,
  1,0,1,1,1,1,0,0,0,0,1,1,1,1,0,1,
  1,0,0,0,0,0,0,1,1,0,0,0,0,0,0,1,
  1,1,1,0,1,1,1,1,1,1,1,1,0,1,1,1,
  1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
  1,0,1,1,0,1,1,1,1,1,1,0,1,1,0,1,
  1,0,1,1,0,0,0,0,0,0,0,0,1,1,0,1,
  1,0,0,0,0,0,1,1,1,1,0,0,0,0,0,1,
  1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
];

let playerX = 1.5, playerY = 1.5, dirX = 1, dirY = 0, planeX = 0, planeY = 0.66;
let bacteria = [];
let pickups = [];
let clinicDecor = [];
let doomAmmo = 100, doomHealth = 100, doomKills = 0;
let zBuffer = new Array(640);
let walkCycle = 0;
let weaponRecoil = 0;
let muzzleFlash = 0;
let doomGameState = 'playing';

function generateClinicalTexture(size = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const tctx = canvas.getContext('2d');
  tctx.fillStyle = '#f8fafc';
  tctx.fillRect(0, 0, size, size);
  
  const imageData = tctx.getImageData(0, 0, size, size);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 8;
    imageData.data[i] += n;
    imageData.data[i+1] += n;
    imageData.data[i+2] += n;
  }
  tctx.putImageData(imageData, 0, 0);
  
  tctx.strokeStyle = 'rgba(0,31,92,0.1)';
  tctx.lineWidth = 2;
  tctx.strokeRect(0, 0, size, size);
  
  const img = new Image();
  img.src = canvas.toDataURL();
  return img;
}

const textures = {
  wall: generateClinicalTexture(),
};

window.startDoom = function() {
  document.getElementById('doom-overlay').style.display = 'none';
  doomCanvas = document.getElementById('doom-canvas');
  dctx = doomCanvas.getContext('2d');
  if (!dctx) return;
  doomCanvas.width = 640;
  doomCanvas.height = 400;

  playerX = 1.5; playerY = 1.5; dirX = 1; dirY = 0; planeX = 0; planeY = 0.66;
  doomAmmo = 100;
  doomHealth = 100;
  doomKills = 0;
  walkCycle = 0;
  weaponRecoil = 0;
  muzzleFlash = 0;
  doomGameState = 'playing';

  bacteria = [];
  for(let i=0; i<15; i++) {
    let bx, by;
    do {
      bx = Math.random() * (mapSize-2) + 1;
      by = Math.random() * (mapSize-2) + 1;
    } while(doomMap[Math.floor(bx) + Math.floor(by)*mapSize] !== 0 || (Math.abs(bx-playerX) < 2 && Math.abs(by-playerY) < 2));
    bacteria.push({x: bx, y: by, alive: true, type: Math.random() > 0.5 ? 'bacteria' : 'plaque', phase: Math.random()*Math.PI*2});
  }

  pickups = [];
  for(let i=0; i<8; i++) {
    let px, py;
    do {
      px = Math.random() * (mapSize-2) + 1;
      py = Math.random() * (mapSize-2) + 1;
    } while(doomMap[Math.floor(px) + Math.floor(py)*mapSize] !== 0);
    pickups.push({x: px, y: py, active: true, type: Math.random() > 0.5 ? 'health' : 'ammo'});
  }

  clinicDecor = [];
  for(let i=0; i<20; i++) {
    let dx, dy;
    do {
      dx = Math.random() * (mapSize-2) + 1;
      dy = Math.random() * (mapSize-2) + 1;
    } while(doomMap[Math.floor(dx) + Math.floor(dy)*mapSize] !== 0);
    const types = ['chair', 'lamp', 'cabinet', 'xray'];
    clinicDecor.push({x: dx, y: dy, type: types[Math.floor(Math.random()*types.length)]});
  }

  window.updateDoomUI();
  if (doomLoopId) cancelAnimationFrame(doomLoopId);
  doomLoop();
};

window.updateDoomUI = function() {
  if (document.getElementById('doom-ammo')) document.getElementById('doom-ammo').innerText = Math.floor(doomAmmo);
  if (document.getElementById('doom-health')) document.getElementById('doom-health').innerText = Math.ceil(doomHealth) + '%';
  if (document.getElementById('doom-kills')) document.getElementById('doom-kills').innerText = doomKills;
};

function doomLoop() {
  if (doomGameState === 'playing') {
    updateDoom();
  }
  drawDoom();
  if(document.getElementById('doom-game-container').style.display !== 'none') {
    doomLoopId = requestAnimationFrame(doomLoop);
  } else {
    doomLoopId = null;
  }
}

function updateDoom() {
  const moveSpeed = 0.08, rotSpeed = 0.05;
  let isMoving = false;

  const canMove = (nx, ny) => {
    const p = 0.25;
    if (nx < p || nx > mapSize-p || ny < p || ny > mapSize-p) return false;
    if (doomMap[Math.floor(nx+p) + Math.floor(ny+p)*mapSize] !== 0) return false;
    if (doomMap[Math.floor(nx-p) + Math.floor(ny+p)*mapSize] !== 0) return false;
    if (doomMap[Math.floor(nx+p) + Math.floor(ny-p)*mapSize] !== 0) return false;
    if (doomMap[Math.floor(nx-p) + Math.floor(ny-p)*mapSize] !== 0) return false;
    return true;
  };

  if (keys['KeyW']) {
    let nx = playerX + dirX * moveSpeed;
    let ny = playerY + dirY * moveSpeed;
    if (canMove(nx, playerY)) playerX = nx;
    if (canMove(playerX, ny)) playerY = ny;
    isMoving = true;
  }
  if (keys['KeyS']) {
    let nx = playerX - dirX * moveSpeed;
    let ny = playerY - dirY * moveSpeed;
    if (canMove(nx, playerY)) playerX = nx;
    if (canMove(playerX, ny)) playerY = ny;
    isMoving = true;
  }

  const rotate = (angle) => {
    let oldDirX = dirX;
    dirX = dirX * Math.cos(angle) - dirY * Math.sin(angle);
    dirY = oldDirX * Math.sin(angle) + dirY * Math.cos(angle);
    let oldPlaneX = planeX;
    planeX = planeX * Math.cos(angle) - planeY * Math.sin(angle);
    planeY = oldPlaneX * Math.sin(angle) + planeY * Math.cos(angle);
  };

  if (keys['KeyA'] || keys['ArrowLeft']) rotate(-rotSpeed);
  if (keys['KeyD'] || keys['ArrowRight']) rotate(rotSpeed);

  if (keys['Space'] && doomAmmo > 0 && weaponRecoil <= 0) {
    doomAmmo--;
    weaponRecoil = 15;
    muzzleFlash = 1.0;
    window.updateDoomUI();

    const core = document.getElementById('doom-status-core');
    if(core) {
      core.style.transform = 'scale(1.5)';
      setTimeout(() => core.style.transform = 'scale(1)', 100);
    }

    bacteria.forEach(b => {
      if(!b.alive) return;
      let dx = b.x - playerX;
      let dy = b.y - playerY;
      let dist = Math.sqrt(dx*dx + dy*dy);
      let angleToB = Math.atan2(dy, dx);
      let anglePlayer = Math.atan2(dirY, dirX);
      let angleDiff = angleToB - anglePlayer;
      while(angleDiff < -Math.PI) angleDiff += Math.PI*2;
      while(angleDiff > Math.PI) angleDiff -= Math.PI*2;

      if(Math.abs(angleDiff) < 0.35 && dist < 8) {
        b.alive = false;
        doomKills++;
        window.updateDoomUI();
        if (bacteria.filter(x => x.alive).length === 0) doomGameState = 'won';
      }
    });
  }

  bacteria.forEach(b => {
    if(!b.alive) return;
    b.phase += 0.05;
    let dist = Math.sqrt((b.x-playerX)**2 + (b.y-playerY)**2);
    if(dist < 0.6) {
      doomHealth -= 0.25;
      window.updateDoomUI();
      if (doomHealth <= 0) doomGameState = 'lost';
    }
    if(Math.random() > 0.96) {
      let nx = b.x + (Math.random()-0.5)*0.3;
      let ny = b.y + (Math.random()-0.5)*0.3;
      if(canMove(nx, ny)) { b.x = nx; b.y = ny; }
    }
  });

  pickups.forEach(p => {
    if(!p.active) return;
    if(Math.sqrt((p.x-playerX)**2 + (p.y-playerY)**2) < 0.6) {
      p.active = false;
      if(p.type === 'health') doomHealth = Math.min(100, doomHealth + 30);
      else doomAmmo = Math.min(200, doomAmmo + 50);
      window.updateDoomUI();
    }
  });

  if (isMoving) walkCycle += 0.15;
  if (weaponRecoil > 0) weaponRecoil -= 2;
  if (muzzleFlash > 0) muzzleFlash -= 0.1;
}

function drawDoom() {
  if (!dctx) return;

  dctx.fillStyle = '#f1f5f9';
  dctx.fillRect(0, 0, 640, 200);
  dctx.fillStyle = '#cbd5e1';
  for(let i=0; i<640; i+=80) {
    let xOff = (playerX * 40) % 80;
    dctx.fillRect(i - xOff, 0, 2, 200);
  }

  dctx.fillStyle = '#1e293b';
  dctx.fillRect(0, 200, 640, 200);
  dctx.fillStyle = '#334155';
  for(let i=0; i<200; i+=20) {
     dctx.fillRect(0, 200 + i, 640, 1);
  }

  for (let x = 0; x < 640; x++) {
    let cameraX = 2 * x / 640 - 1;
    let rayDirX = dirX + planeX * cameraX;
    let rayDirY = dirY + planeY * cameraX;
    let mapX = Math.floor(playerX), mapY = Math.floor(playerY);
    let deltaDistX = Math.abs(1 / rayDirX), deltaDistY = Math.abs(1 / rayDirY);
    let stepX, stepY, sideDistX, sideDistY, hit = 0, side;

    if (rayDirX < 0) { stepX = -1; sideDistX = (playerX - mapX) * deltaDistX; }
    else { stepX = 1; sideDistX = (mapX + 1.0 - playerX) * deltaDistX; }
    if (rayDirY < 0) { stepY = -1; sideDistY = (playerY - mapY) * deltaDistY; }
    else { stepY = 1; sideDistY = (mapY + 1.0 - playerY) * deltaDistY; }

    let safety = 0;
    while (hit === 0 && safety < 100) {
      safety++;
      if (sideDistX < sideDistY) { sideDistX += deltaDistX; mapX += stepX; side = 0; }
      else { sideDistY += deltaDistY; mapY += stepY; side = 1; }
      if (mapX < 0 || mapX >= mapSize || mapY < 0 || mapY >= mapSize) hit = 1;
      else if (doomMap[mapX + mapY * mapSize] > 0) hit = 1;
    }

    let perpWallDist = side === 0 ? (mapX - playerX + (1 - stepX) / 2) / rayDirX : (mapY - playerY + (1 - stepY) / 2) / rayDirY;
    zBuffer[x] = perpWallDist;
    let lineHeight = Math.floor(400 / perpWallDist);
    let drawStart = Math.max(0, -lineHeight / 2 + 200);
    let drawEnd = Math.min(399, lineHeight / 2 + 200);

    let wallHitX = side === 0 ? playerY + perpWallDist * rayDirY : playerX + perpWallDist * rayDirX;
    wallHitX -= Math.floor(wallHitX);

    if(textures.wall.complete) {
       let texX = Math.floor(wallHitX * textures.wall.width);
       dctx.drawImage(textures.wall, texX, 0, 1, textures.wall.height, x, drawStart, 1, drawEnd - drawStart);
       dctx.fillStyle = `rgba(0,0,0,${Math.min(0.8, perpWallDist/15)})`;
       dctx.fillRect(x, drawStart, 1, drawEnd - drawStart);
    } else {
       let brightness = Math.min(100, 220 / perpWallDist);
       dctx.fillStyle = side === 1 ? `hsl(185, 60%, ${brightness/2.5}%)` : `hsl(185, 60%, ${brightness/2}%)`;
       dctx.fillRect(x, drawStart, 1, drawEnd - drawStart);
    }
  }

  let allSprites = [
    ...bacteria.filter(b => b.alive).map(b => ({...b, kind: 'bacteria'})),
    ...pickups.filter(p => p.active).map(p => ({...p, kind: 'pickup'})),
    ...clinicDecor.map(d => ({...d, kind: 'decor'}))
  ];

  allSprites.sort((a,b) => {
    let da = (playerX-a.x)**2 + (playerY-a.y)**2;
    let db = (playerX-b.x)**2 + (playerY-b.y)**2;
    return db - da;
  });

  allSprites.forEach(s => {
    let spriteX = s.x - playerX;
    let spriteY = s.y - playerY;
    let invDet = 1.0 / (planeX * dirY - dirX * planeY);
    let trX = invDet * (dirY * spriteX - dirX * spriteY);
    let trY = invDet * (-planeY * spriteX + planeX * spriteY);
    let sX = Math.floor((640 / 2) * (1 + trX / trY));
    let sH = Math.abs(Math.floor(400 / trY));
    let dY = 200 + (s.kind === 'bacteria' ? Math.sin(s.phase)*10 : sH/4);

    if(trY > 0 && sX > 0 && sX < 640 && trY < zBuffer[sX]) {
      if (s.kind === 'bacteria') {
        dctx.fillStyle = s.type === 'bacteria' ? '#4ade80' : '#eab308';
        dctx.beginPath(); dctx.arc(sX, dY, sH/4, 0, Math.PI*2); dctx.fill();
        dctx.shadowBlur = 10; dctx.shadowColor = dctx.fillStyle; dctx.stroke(); dctx.shadowBlur = 0;
      } else if (s.kind === 'decor') {
        dctx.fillStyle = '#cbd5e1';
        if (s.type === 'chair') {
           dctx.fillRect(sX - sH/4, dY, sH/2, sH/6);
           dctx.fillRect(sX - sH/6, dY - sH/4, sH/3, sH/4);
        } else if (s.type === 'cabinet') {
           dctx.fillStyle = '#94a3b8';
           dctx.fillRect(sX - sH/4, dY - sH/4, sH/2, sH/2);
           dctx.strokeStyle = 'white'; dctx.strokeRect(sX - sH/4, dY - sH/4, sH/2, sH/2);
        } else {
           dctx.fillRect(sX - 2, dY - sH/2, 4, sH/2);
           dctx.fillStyle = '#f8fafc'; dctx.fillRect(sX - sH/6, dY - sH/2, sH/3, sH/4);
        }
      } else {
        dctx.fillStyle = s.type === 'health' ? '#ef4444' : '#3b82f6';
        dctx.fillRect(sX - sH/8, dY - sH/8, sH/4, sH/4);
        dctx.fillStyle = 'white';
        if(s.type === 'health') {
          let sz = sH/16;
          dctx.fillRect(sX - sz/2, dY - sH/10, sz, sH/5);
          dctx.fillRect(sX - sH/10, dY - sz/2, sH/5, sz);
        } else {
          dctx.beginPath(); dctx.moveTo(sX, dY - sH/10); dctx.lineTo(sX - sH/12, dY); dctx.lineTo(sX + sH/12, dY); dctx.lineTo(sX, dY + sH/10); dctx.fill();
        }
      }
    }
  });

  let bob = Math.sin(walkCycle) * 10;
  let tX = 320, tY = 280 + bob + weaponRecoil;
  dctx.fillStyle = '#94a3b8'; dctx.fillRect(tX-15, tY, 30, 150);
  dctx.fillStyle = '#cbd5e1'; dctx.fillRect(tX-4, tY-40, 8, 40);

  if(muzzleFlash > 0) {
    dctx.save(); dctx.globalAlpha = muzzleFlash; dctx.strokeStyle = '#e0f2fe'; dctx.lineWidth = 3;
    for(let i=0; i<10; i++) {
      dctx.beginPath(); dctx.moveTo(tX, tY-40);
      dctx.lineTo(tX + (Math.random()-0.5)*200, tY - 200); dctx.stroke();
    }
    dctx.restore();
  }

  let v = dctx.createRadialGradient(320, 200, 100, 320, 200, 500);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)');
  dctx.fillStyle = v; dctx.fillRect(0, 0, 640, 400);

  if (doomGameState !== 'playing') {
    dctx.fillStyle = 'rgba(15, 23, 42, 0.9)'; dctx.fillRect(0, 0, 640, 400);
    dctx.fillStyle = doomGameState === 'won' ? '#4ade80' : '#ef4444';
    dctx.font = '900 64px Inter'; dctx.textAlign = 'center';
    dctx.fillText(doomGameState === 'won' ? 'STERILIZED' : 'INFECTED', 320, 180);
    dctx.fillStyle = 'white'; dctx.font = '600 20px Inter';
    dctx.fillText(doomGameState === 'won' ? 'The clinic is safe. Shift complete.' : 'Hygiene failed. Medical waste detected.', 320, 230);
    dctx.fillStyle = 'var(--primary-light)'; dctx.fillText('Press RESET MISSION to retry', 320, 280);
  }
}

// --- CLINIC KOMBAT ENGINE ---
let mkLoopId = null;
let mkCanvas, mctx;
let p1 = { x: 100, y: 0, vx: 0, vy: 0, health: 100, state: 'idle', frame: 0, color: '#3385ff', dir: 1, lastHit: 0 };
let p2 = { x: 540, y: 0, vx: 0, vy: 0, health: 100, state: 'idle', frame: 0, color: '#eab308', dir: -1, lastHit: 0 };
let mkTimer = 99;
let mkStatus = 'playing';

window.startMK = function() {
  document.getElementById('mk-overlay').style.display = 'none';
  mkCanvas = document.getElementById('mk-canvas');
  mctx = mkCanvas.getContext('2d');
  mkCanvas.width = 800;
  mkCanvas.height = 500;
  
  p1 = { x: 150, y: 400, vx: 0, vy: 0, health: 100, state: 'idle', frame: 0, color: '#3385ff', dir: 1, lastHit: 0 };
  p2 = { x: 650, y: 400, vx: 0, vy: 0, health: 100, state: 'idle', frame: 0, color: '#eab308', dir: -1, lastHit: 0 };
  mkTimer = 99;
  mkStatus = 'playing';
  
  if (mkLoopId) cancelAnimationFrame(mkLoopId);
  mkLoop();
  
  setInterval(() => { if(mkStatus === 'playing' && mkTimer > 0) mkTimer--; }, 1000);
};

function mkLoop() {
  updateMK();
  drawMK();
  if(document.getElementById('mk-game-container').style.display !== 'none') {
    mkLoopId = requestAnimationFrame(mkLoop);
  }
}

function updateMK() {
  if (mkStatus !== 'playing') return;
  const gravity = 1.2, speed = 6, jump = -22;

  if (keys['KeyA']) p1.vx = -speed;
  else if (keys['KeyD']) p1.vx = speed;
  else p1.vx = 0;
  if (keys['KeyW'] && p1.y >= 400) p1.vy = jump;
  if (keys['KeyJ'] && p1.state === 'idle') { p1.state = 'punch'; p1.frame = 0; }
  if (keys['KeyK'] && p1.state === 'idle') { p1.state = 'kick'; p1.frame = 0; }

  let dist = p1.x - p2.x;
  if (Math.abs(dist) > 80) p2.vx = Math.sign(dist) * 4;
  else {
    p2.vx = 0;
    if (Math.random() > 0.95 && p2.state === 'idle') {
      p2.state = Math.random() > 0.5 ? 'punch' : 'kick';
      p2.frame = 0;
    }
  }
  if (Math.abs(dist) < 150 && p1.vy < 0 && p2.y >= 400 && Math.random() > 0.9) p2.vy = jump;

  [p1, p2].forEach(p => {
    p.x += p.vx; p.y += p.vy;
    if (p.y < 400) p.vy += gravity;
    else { p.y = 400; p.vy = 0; }
    if (p.x < 50) p.x = 50;
    if (p.x > 750) p.x = 750;
    if (p.state !== 'idle') { p.frame++; if (p.frame > 15) p.state = 'idle'; }
  });

  p1.dir = p1.x < p2.x ? 1 : -1;
  p2.dir = p2.x < p1.x ? 1 : -1;

  checkMKHit(p1, p2); checkMKHit(p2, p1);

  document.getElementById('p1-health').style.width = p1.health + '%';
  document.getElementById('p2-health').style.width = p2.health + '%';
  document.getElementById('mk-timer').innerText = mkTimer;

  if (p1.health <= 0 || p2.health <= 0 || mkTimer <= 0) {
    mkStatus = 'gameover';
    let winText = p1.health > p2.health ? 'SUB-ZERO WINS' : 'SCORPION WINS';
    if (p1.health <= 0 && p2.health <= 0) winText = 'DRAW';
    document.getElementById('mk-status').innerText = winText;
    document.getElementById('mk-overlay').style.display = 'flex';
  }
}

function checkMKHit(attacker, defender) {
  if (attacker.state === 'punch' && attacker.frame === 5) {
    let reach = 60 * attacker.dir;
    if (Math.abs(attacker.x + reach - defender.x) < 40 && Math.abs(attacker.y - defender.y) < 80) {
      defender.health -= 5; defender.lastHit = 10;
    }
  }
  if (attacker.state === 'kick' && attacker.frame === 8) {
    let reach = 80 * attacker.dir;
    if (Math.abs(attacker.x + reach - defender.x) < 50 && Math.abs(attacker.y - defender.y) < 80) {
      defender.health -= 10; defender.lastHit = 10;
    }
  }
  if (defender.lastHit > 0) defender.lastHit--;
}

function drawMK() {
  mctx.fillStyle = '#050505'; mctx.fillRect(0, 0, 800, 500);
  mctx.strokeStyle = '#1e293b'; mctx.lineWidth = 2;
  for(let i=0; i<800; i+=100) { mctx.beginPath(); mctx.moveTo(i, 0); mctx.lineTo(i, 500); mctx.stroke(); }
  mctx.fillStyle = '#0f172a'; mctx.fillRect(0, 400, 800, 100);
  drawFighter(p1); drawFighter(p2);
}

function drawFighter(p) {
  mctx.save(); mctx.translate(p.x, p.y); mctx.scale(p.dir, 1);
  if (p.lastHit > 0) mctx.translate((Math.random()-0.5)*10, 0);
  mctx.fillStyle = p.lastHit > 0 ? '#fff' : '#111';
  mctx.fillRect(-15, -40, 12, 40); mctx.fillRect(5, -40, 12, 40);
  mctx.fillRect(-20, -100, 40, 65);
  mctx.beginPath(); mctx.arc(0, -115, 18, 0, Math.PI*2); mctx.fill();
  mctx.fillStyle = p.color; mctx.fillRect(-18, -95, 36, 15); mctx.fillRect(-12, -118, 24, 8);
  if (p.state === 'punch') mctx.fillRect(10, -90, 50, 12);
  else if (p.state === 'kick') { mctx.save(); mctx.translate(10, -40); mctx.rotate(-Math.PI/3); mctx.fillRect(0, 0, 70, 15); mctx.restore(); }
  else { mctx.fillRect(15, -85, 10, 45); mctx.fillRect(-25, -85, 10, 45); }
  mctx.restore();
}

// --- SOLITAIRE GAME ENGINE ---
let deck = [];
let gameStock = [];
let gameWaste = [];
let gameTableau = [[],[],[],[],[],[],[]];
let gameFoundations = { '♥': [], '♦': [], '♣': [], '♠': [] };

window.initSolitaire = function() {
  const suits = ['♥', '♦', '♣', '♠'];
  const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  deck = [];
  suits.forEach(s => { values.forEach((v, i) => { deck.push({ suit: s, value: v, rank: i + 1, color: (s==='♥' || s==='♦') ? 'red' : 'black', faceUp: false }); }); });
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  gameTableau = [[],[],[],[],[],[],[]];
  let cardIdx = 0;
  for (let i = 0; i < 7; i++) { for (let j = 0; j <= i; j++) { const card = deck[cardIdx++]; if (j === i) card.faceUp = true; gameTableau[i].push(card); } }
  gameStock = deck.slice(cardIdx); gameWaste = []; gameFoundations = { '♥': [], '♦': [], '♣': [], '♠': [] };
  setTimeout(() => window.renderSolitaire(), 50);
};

window.drawCard = function() {
  if (gameStock.length === 0) { gameStock = gameWaste.reverse().map(c => ({...c, faceUp: false})); gameWaste = []; }
  else { const card = gameStock.pop(); card.faceUp = true; gameWaste.push(card); }
  window.renderSolitaire();
};

window.renderSolitaire = function() {
  const stock = document.getElementById('stock'), waste = document.getElementById('waste');
  stock.innerHTML = gameStock.length > 0 ? `<div class="solitaire-card back"></div>` : '';
  waste.innerHTML = '';
  if (gameWaste.length > 0) waste.appendChild(createCardEl(gameWaste[gameWaste.length - 1]));
  ['♥', '♦', '♣', '♠'].forEach(s => {
    const el = document.getElementById('f-' + (s === '♥' ? 'hearts' : s === '♦' ? 'diamonds' : s === '♣' ? 'clubs' : 'spades'));
    el.innerHTML = `<div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:45px; opacity:0.1; filter: grayscale(1);">🦷</div>`;
    if (gameFoundations[s].length > 0) el.appendChild(createCardEl(gameFoundations[s][gameFoundations[s].length - 1]));
  });
  for (let i = 0; i < 7; i++) {
    const col = document.getElementById('t-' + i); col.innerHTML = '';
    gameTableau[i].forEach((card, j) => {
      const cardEl = createCardEl(card); cardEl.style.top = (j * 30) + 'px';
      cardEl.onclick = (e) => { e.stopPropagation(); window.handleCardClick(card, 't', i, j); };
      col.appendChild(cardEl);
    });
  }
};

function createCardEl(card) {
  const div = document.createElement('div');
  div.className = `solitaire-card ${card.color} ${card.faceUp ? '' : 'back'}`;
  if (card.faceUp) {
    div.innerHTML = `
      <div style="position:absolute; top:8px; left:8px; display:flex; flex-direction:column; align-items:center; line-height:1; pointer-events:none;"><span style="font-size: 20px;">${card.value}</span><span style="font-size: 14px;">${card.suit}</span></div>
      <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:48px; pointer-events:none; opacity: 0.9;">${card.suit}</div>
      <div style="position:absolute; bottom:8px; right:8px; display:flex; flex-direction:column; align-items:center; line-height:1; pointer-events:none; transform:rotate(180deg);"><span style="font-size: 20px;">${card.value}</span><span style="font-size: 14px;">${card.suit}</span></div>
    `;
  }
  return div;
}

window.handleCardClick = function(card, type, colIdx, rowIdx) {
  if (!card.faceUp) return;
  const suit = card.suit, foundation = gameFoundations[suit];
  if ((foundation.length === 0 && card.value === 'A') || (foundation.length > 0 && card.rank === foundation[foundation.length - 1].rank + 1)) {
    if (type === 't') { if (rowIdx === gameTableau[colIdx].length - 1) { gameFoundations[suit].push(gameTableau[colIdx].pop()); if (gameTableau[colIdx].length > 0) gameTableau[colIdx][gameTableau[colIdx].length - 1].faceUp = true; } }
    else if (type === 'w') gameFoundations[suit].push(gameWaste.pop());
    window.renderSolitaire(); return;
  }
  for (let targetIdx = 0; targetIdx < 7; targetIdx++) {
    if (targetIdx === colIdx && type === 't') continue;
    const targetCol = gameTableau[targetIdx], targetTopCard = targetCol[targetCol.length - 1];
    const isValidMove = (targetCol.length === 0 && card.value === 'K') || (targetCol.length > 0 && targetTopCard.faceUp && targetTopCard.color !== card.color && targetTopCard.rank === card.rank + 1);
    if (isValidMove) {
      let movingCards = [];
      if (type === 't') { movingCards = gameTableau[colIdx].splice(rowIdx); if (gameTableau[colIdx].length > 0) gameTableau[colIdx][gameTableau[colIdx].length - 1].faceUp = true; }
      else if (type === 'w') movingCards = [gameWaste.pop()];
      gameTableau[targetIdx].push(...movingCards); window.renderSolitaire(); break;
    }
  }
};

// --- GAME NAVIGATION ---
window.launchGame = function(game) {
  currentGame = game;
  document.getElementById('game-library').style.display = 'none';
  document.getElementById('break-room-back').style.display = 'block';
  document.getElementById('game-reset-btn').style.display = 'block';
  
  if (game === 'solitaire') {
    document.getElementById('solitaire-game-container').style.display = 'block';
    document.getElementById('doom-game-container').style.display = 'none';
    document.getElementById('mk-game-container').style.display = 'none';
    window.initSolitaire();
  } else if (game === 'doom') {
    document.getElementById('solitaire-game-container').style.display = 'none';
    document.getElementById('doom-game-container').style.display = 'block';
    document.getElementById('mk-game-container').style.display = 'none';
    if (!doomLoopId) document.getElementById('doom-overlay').style.display = 'flex';
  } else if (game === 'mk') {
    document.getElementById('solitaire-game-container').style.display = 'none';
    document.getElementById('doom-game-container').style.display = 'none';
    document.getElementById('mk-game-container').style.display = 'block';
    if (!mkLoopId) document.getElementById('mk-overlay').style.display = 'flex';
  }
};

window.showGameLibrary = function() {
  currentGame = null;
  document.getElementById('game-library').style.display = 'grid';
  document.getElementById('solitaire-game-container').style.display = 'none';
  document.getElementById('doom-game-container').style.display = 'none';
  document.getElementById('mk-game-container').style.display = 'none';
  document.getElementById('break-room-back').style.display = 'none';
  document.getElementById('game-reset-btn').style.display = 'none';
  if (doomLoopId) { cancelAnimationFrame(doomLoopId); doomLoopId = null; }
  if (mkLoopId) { cancelAnimationFrame(mkLoopId); mkLoopId = null; }
};

window.resetCurrentGame = function() {
  if (currentGame === 'solitaire') window.initSolitaire();
  else if (currentGame === 'doom') window.startDoom();
  else if (currentGame === 'mk') window.startMK();
};

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if(['KeyW','KeyA','KeyS','KeyD','Space','KeyJ','KeyK','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) {
    if (currentGame && currentGame !== 'solitaire') e.preventDefault();
  }
});
window.addEventListener('keyup', (e) => keys[e.code] = false);
