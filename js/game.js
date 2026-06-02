// ============================================================
// Gradient Descent — Game Logic
// ============================================================

// ─── Tile Types ───
const T_WALL = 0;
const T_FLOOR = 1;
const T_STAIRS = 2;

// ─── Layer Blueprints ───
const LAYERS = {
  dense:    { id:'dense',    name:'Dense',    color:'#4CAF50', atk:2, def:1, param:10, emoji:'◆', desc:'+2 ATK, +1 DEF' },
  conv2d:   { id:'conv2d',   name:'Conv2D',   color:'#2196F3', atk:3, def:0, param:15, emoji:'⊞', desc:'+3 ATK' },
  relu:     { id:'relu',     name:'ReLU',     color:'#FF9800', atk:1, def:0, param:5,  emoji:'⌁', desc:'+1 ATK, +8% crit' },
  dropout:  { id:'dropout',  name:'Dropout',  color:'#9C27B0', atk:0, def:0, param:3,  emoji:'⊘', desc:'+6% dodge' },
  sigmoid:  { id:'sigmoid',  name:'Sigmoid',  color:'#E91E63', atk:0, def:1, param:5,  emoji:'∫', desc:'+1 DEF, 4% lifesteal' },
  batchnorm:{ id:'batchnorm',name:'BatchNorm',color:'#00BCD4', atk:0, def:2, param:8,  emoji:'β', desc:'+2 DEF, loss resist' },
};
const LAYER_IDS = Object.keys(LAYERS);

// ─── Enemy Blueprints ───
const ENEMIES = {
  noise:       { id:'noise',       name:'Noise',       sym:'n', color:'#8b949e', hp:10, atk:3, def:1, xp:2, desc:'Unpredictable data noise' },
  outlier:     { id:'outlier',     name:'Outlier',     sym:'O', color:'#f78166', hp: 8, atk:5, def:0, xp:3, desc:'Sparse but dangerous' },
  missing:     { id:'missing',     name:'MissingVal',  sym:'?', color:'#d29922', hp:12, atk:2, def:2, xp:2, desc:'Erratic, sometimes skips' },
  vanishing:   { id:'vanishing',   name:'Vanishing',   sym:'v', color:'#bc8cff', hp:14, atk:2, def:2, xp:4, desc:'Drains your gradient' },
  exploding:   { id:'exploding',   name:'Exploding',   sym:'X', color:'#f85149', hp:16, atk:6, def:1, xp:5, desc:'Spikes when provoked' },
};
const ENEMY_IDS = Object.keys(ENEMIES);

// ─── Map Config ───
const MAP_W = 40, MAP_H = 30;
const TILE_SZ = 16;

// ─── Game State ───
let S = null;

function rand(min, max) { return Math.floor(Math.random()*(max-min+1))+min; }
function randf(a,b) { return Math.random()*(b-a)+a; }
function pick(arr) { return arr[rand(0,arr.length-1)]; }
function clamp(v,lo,hi) { return Math.max(lo,Math.min(hi,v)); }

// ─── Terminal ───
function log(msg, cls='info') {
  S.terminal.push({msg,cls});
  if (S.terminal.length>200) S.terminal.splice(0,50);
  renderTerminal();
}

// ─── Layer Factory ───
function createLayer(id) {
  const bp = LAYERS[id];
  return { ...bp, level:1 };
}

// ─── Enemy Factory ───
function spawnEnemy(id, x, y, floor) {
  const bp = ENEMIES[id];
  const lvl = floor;
  return {
    ...bp,
    x, y,
    maxHp: bp.hp + lvl*3,
    hp: bp.hp + lvl*3,
    atk: bp.atk + lvl,
    def: bp.def + Math.floor(lvl/2),
    alive: true,
    symbol: bp.sym,
  };
}

// ─── Item Factory ───
function spawnItem(x, y, type, data) {
  return { x, y, type, data, alive: true };
}

// ─── Dungeon Generation ───
function generateDungeon(floor) {
  const tiles = [];
  for (let y=0; y<MAP_H; y++) {
    tiles[y] = [];
    for (let x=0; x<MAP_W; x++) {
      tiles[y][x] = { type: T_WALL, loss: 0.5 };
    }
  }

  // rooms
  const rooms = [];
  const ROOM_ATTEMPTS = 20;
  for (let i=0; i<ROOM_ATTEMPTS; i++) {
    const w = rand(4,9);
    const h = rand(3,7);
    const x = rand(1, MAP_W-w-2);
    const y = rand(1, MAP_H-h-2);
    let ok = true;
    for (const r of rooms) {
      if (x<r.x+r.w+1 && x+w+1>r.x && y<r.y+r.h+1 && y+h+1>r.y) { ok=false; break; }
    }
    if (!ok) continue;
    rooms.push({x,y,w,h});
    for (let ry=y; ry<y+h; ry++)
      for (let rx=x; rx<x+w; rx++)
        tiles[ry][rx] = { type: T_FLOOR, loss: 0.2 + randf(0,0.3) };
  }
  if (rooms.length<3) { // fallback
    const r = {x:5,y:5,w:8,h:6};
    rooms.push(r);
    for (let ry=r.y; ry<r.y+r.h; ry++)
      for (let rx=r.x; rx<r.x+r.w; rx++)
        tiles[ry][rx] = { type: T_FLOOR, loss: 0.3 };
  }

  // connect rooms with L-corridors
  for (let i=1; i<rooms.length; i++) {
    const a = rooms[i-1], b = rooms[i];
    const ax = rand(a.x, a.x+a.w-1), ay = rand(a.y, a.y+a.h-1);
    const bx = rand(b.x, b.x+b.w-1), by = rand(b.y, b.y+b.h-1);
    // horizontal then vertical
    let cx=ax, cy=ay;
    while (cx!==bx) {
      if (cx<bx) cx++; else cx--;
      if (tiles[cy][cx].type===T_WALL) tiles[cy][cx] = { type: T_FLOOR, loss: 0.5+randf(0,0.3) };
    }
    while (cy!==by) {
      if (cy<by) cy++; else cy--;
      if (tiles[cy][cx].type===T_WALL) tiles[cy][cx] = { type: T_FLOOR, loss: 0.5+randf(0,0.3) };
    }
  }

  const enemies = [];
  const items = [];

  // place enemies in rooms (skip first room)
  for (let i=1; i<rooms.length; i++) {
    const r = rooms[i];
    const count = Math.min(rand(1, floor+1), 3);
    for (let e=0; e<count; e++) {
      const ex = rand(r.x+1, r.x+r.w-2);
      const ey = rand(r.y+1, r.y+r.h-2);
      const eid = pick(ENEMY_IDS);
      enemies.push(spawnEnemy(eid, ex, ey, floor));
    }
  }

  // place items in rooms
  for (const r of rooms) {
    if (Math.random()<0.5) continue;
    const ix = rand(r.x+1, r.x+r.w-2);
    const iy = rand(r.y+1, r.y+r.h-2);
    if (Math.random()<0.4) {
      items.push(spawnItem(ix, iy, 'layer', pick(LAYER_IDS)));
    } else {
      items.push(spawnItem(ix, iy, 'data', rand(1,3)));
    }
  }

  // place stairs in last room
  const lr = rooms[rooms.length-1];
  const sx = rand(lr.x+1, lr.x+lr.w-2);
  const sy = rand(lr.y+1, lr.y+lr.h-2);
  tiles[sy][sx].type = T_STAIRS;

  // player start in first room
  const fr = rooms[0];
  const px = rand(fr.x+1, fr.x+fr.w-2);
  const py = rand(fr.y+1, fr.y+fr.h-2);

  return { tiles, rooms, enemies, items, playerX:px, playerY:py, stairsX:sx, stairsY:sy };
}

// ─── Calculate Player Stats ───
function calcPlayerStats() {
  const p = S.player;
  let atk=8, def=0, crit=0.05, dodge=0.05, lifesteal=0;
  p.layers.forEach(l => {
    const bp = LAYERS[l.id];
    atk += bp.atk * l.level;
    def += bp.def * l.level;
    if (bp.critBonus) crit += bp.critBonus * l.level;
    if (bp.dodgeBonus) dodge += bp.dodgeBonus * l.level;
    if (bp.lifesteal) lifesteal += bp.lifesteal * l.level;
  });
  p._atk=atk; p._def=def; p._crit=Math.min(crit,0.8); p._dodge=Math.min(dodge,0.7); p._lifesteal=Math.min(lifesteal,0.4);
}

// ─── Attack Enemy ───
function attackEnemy(enemy) {
  const p = S.player;
  calcPlayerStats();

  let dmg = p._atk + rand(-2,2);
  let crit = false;
  if (Math.random() < p._crit) { dmg = Math.floor(dmg*2.5); crit=true; }

  const actualDmg = Math.max(1, dmg - enemy.def);
  enemy.hp -= actualDmg;

  let msg = `Forward pass → ${enemy.name}: ${actualDmg} damage`;
  if (crit) msg += ' [CRIT: ReLU activated!]';
  else msg += ' [ReLU inactive]';
  log(msg, crit?'good':'info');

  // lifesteal → reduce loss
  if (p._lifesteal>0 && actualDmg>0) {
    const heal = actualDmg * p._lifesteal;
    p.loss = Math.max(0.05, p.loss - heal * 0.01);
    log(`Sigmoid lifesteal: loss -${(heal*0.01).toFixed(3)}`, 'good');
  }

  if (enemy.hp <= 0) {
    enemy.alive = false;
    p.loss = Math.max(0.05, p.loss - 0.03);
    p.data += enemy.xp;
    p.kills++;
    log(`${enemy.name} eliminated. Loss -0.03, +${enemy.xp} data samples`, 'good');
    // maybe drop layer
    if (Math.random()<0.2) {
      const lid = pick(LAYER_IDS);
      S.items.push(spawnItem(enemy.x, enemy.y, 'layer', lid));
      log(`Drop detected: ${LAYERS[lid].name} layer`, 'highlight');
    }
    return;
  }

  // enemy counter-attack
  enemyTurn(enemy);
}

// ─── Enemy Counter ───
function enemyTurn(enemy) {
  const p = S.player;
  calcPlayerStats();

  // dodge check
  if (Math.random() < p._dodge) {
    log(`Dropout active: dodged ${enemy.name} attack!`, 'good');
    return;
  }

  const baseDmg = enemy.atk + rand(-1,1);
  let dmg = Math.max(1, baseDmg - p._def);

  // batchnorm: loss reduction
  let lossMult = 1;
  let hasBN = false;
  for (const l of p.layers) {
    if (l.id==='batchnorm') { lossMult -= 0.1 * l.level; hasBN=true; }
  }
  lossMult = Math.max(0.4, lossMult);

  const lossInc = dmg * 0.02 * lossMult;
  p.loss = Math.min(p.maxLoss, p.loss + lossInc);

  let msg = `${enemy.name} counter-attack: ${dmg} damage`;
  if (hasBN) msg += ` [BatchNorm reduced loss spike by ${((1-lossMult)*100).toFixed(0)}%]`;
  log(msg, 'err');
  log(`Loss spike: +${lossInc.toFixed(3)}`, 'err');

  if (p.loss >= p.maxLoss) {
    S.gameOver = true;
    log('═══ GRADIENT EXPLODED — MODEL DIVERGED ═══', 'err');
    log(`Final stats — Epochs: ${S.floor}, Kills: ${p.kills}, Data: ${p.data}`, 'info');
  }
}

// ─── Move Player ───
function movePlayer(dx, dy) {
  if (S.gameOver) return;
  const p = S.player;
  const nx = p.x + dx, ny = p.y + dy;
  if (nx<0 || nx>=MAP_W || ny<0 || ny>=MAP_H) return;
  const tile = S.tiles[ny][nx];
  if (tile.type === T_WALL) return;

  S.turn++;

  // check enemy
  const enemy = S.enemies.find(e => e.alive && e.x===nx && e.y===ny);
  if (enemy) {
    attackEnemy(enemy);
    return;
  }

  // check item
  const item = S.items.find(it => it.alive && it.x===nx && it.y===ny);
  if (item) {
    item.alive = false;
    if (item.type === 'layer') {
      if (p.layers.length < 8) {
        p.layers.push(createLayer(item.data));
        p.totalParams = p.layers.reduce((s,l)=> s + LAYERS[l.id].param * l.level, 0);
        log(`Layer acquired: ${LAYERS[item.data].name}`, 'highlight');
      } else {
        log(`Network full! Drop ${LAYERS[item.data].name} to pick up?`, 'warn');
        // for demo, just drop it
      }
    } else if (item.type === 'data') {
      p.data += item.data;
      log(`+${item.data} data samples collected`, 'good');
    }
  }

  // check stairs
  if (tile.type === T_STAIRS) {
    descendFloor();
    return;
  }

  // move
  p.x = nx; p.y = ny;

  // gradient slowly decays
  p.gradient = Math.max(0.1, p.gradient - 0.005);
  // loss slowly drifts up
  p.loss = Math.min(p.maxLoss, p.loss + 0.002);

  // record loss for graph
  S.lossHistory.push(p.loss);
  if (S.lossHistory.length > 150) S.lossHistory.shift();
}

// ─── Wait (skip turn) ───
function waitTurn() {
  if (S.gameOver) return;
  S.turn++;
  const p = S.player;
  p.gradient = Math.min(1.0, p.gradient + 0.1);
  p.loss = Math.min(p.maxLoss, p.loss + 0.005);
  S.lossHistory.push(p.loss);
  if (S.lossHistory.length > 150) S.lossHistory.shift();
  log('Gradient recovery step...', 'info');
}

// ─── Descend Floor ───
function descendFloor() {
  S.floor++;
  S.player.loss = Math.max(0.1, S.player.loss - 0.05);
  S.player.gradient = Math.min(1.0, S.player.gradient + 0.2);
  S.lossHistory = [];
  log(`═══ Epoch ${S.floor} — Descending to floor ${S.floor} ═══`, 'highlight');

  // random new layer as reward
  if (S.player.layers.length < 8) {
    const lid = pick(LAYER_IDS);
    S.player.layers.push(createLayer(lid));
    S.player.totalParams = S.player.layers.reduce((s,l)=> s + LAYERS[l.id].param * l.level, 0);
    log(`New layer discovered during descent: ${LAYERS[lid].name}`, 'good');
  }

  const dun = generateDungeon(S.floor);
  S.tiles = dun.tiles;
  S.enemies = dun.enemies;
  S.items = dun.items;
  S.player.x = dun.playerX;
  S.player.y = dun.playerY;
  S.stairsX = dun.stairsX;
  S.stairsY = dun.stairsY;

  // stats improvement
  for (const l of S.player.layers) {
    if (Math.random()<0.3) l.level++;
  }
  S.player.totalParams = S.player.layers.reduce((s,l)=> s + LAYERS[l.id].param * l.level, 0);
}

// ─── Restart ───
function restartGame() {
  initGame();
  log('═══ Model reinitialized with random weights ═══', 'highlight');
}

// ─── Init Game ───
function initGame() {
  S = {
    floor: 1,
    turn: 0,
    gameOver: false,
    player: {
      x: 0, y: 0,
      loss: 0.3,
      maxLoss: 1.0,
      gradient: 1.0,
      data: 0,
      layers: [],
      totalParams: 0,
      kills: 0,
    },
    tiles: [],
    enemies: [],
    items: [],
    stairsX: 0, stairsY: 0,
    lossHistory: [],
    terminal: [],
    prevLossHistory: [],
  };

  // starting layers
  S.player.layers = [
    createLayer('dense'),
    createLayer('relu'),
    createLayer('dropout'),
  ];
  S.player.totalParams = S.player.layers.reduce((s,l)=> s + LAYERS[l.id].param * l.level, 0);

  const dun = generateDungeon(1);
  S.tiles = dun.tiles;
  S.enemies = dun.enemies;
  S.items = dun.items;
  S.player.x = dun.playerX;
  S.player.y = dun.playerY;
  S.stairsX = dun.stairsX;
  S.stairsY = dun.stairsY;

  S.lossHistory = [S.player.loss];

  log('═══ Gradient Descent v0.1 ═══', 'highlight');
  log('Model initialized — descending loss landscape...', 'info');
  log(`Network: ${S.player.layers.map(l=>l.name).join(' → ')}`, 'info');
  log('Use WASD/arrows to explore. Bump enemies to forward-pass.', 'info');
}

// ─── Expose for renderer ───
window.__getState = () => S;
window.__restart = restartGame;
window.__move = movePlayer;
window.__wait = waitTurn;

// ─── Auto-start on load ───
window.addEventListener('DOMContentLoaded', () => {
  initGame();
  if (window.__onGameReady) window.__onGameReady();
});
