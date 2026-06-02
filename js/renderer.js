// ============================================================
// Gradient Descent — Renderer & UI
// ============================================================

// ─── Canvas Refs ───
let cvs, ctx;
let acvs, actx;
let lcvs, lctx;

window.__onGameReady = function() {
  cvs = document.getElementById('gameCanvas');
  ctx = cvs.getContext('2d');
  acvs = document.getElementById('archCanvas');
  actx = acvs.getContext('2d');
  lcvs = document.getElementById('lossCanvas');
  lctx = lcvs.getContext('2d');

  // Input
  document.addEventListener('keydown', onKey);
  document.getElementById('restartBtn').addEventListener('click', (e) => {
    e.preventDefault();
    window.__restart();
  });

  // Initial render
  renderAll();
};

// ─── Input ───
function onKey(e) {
  const S = window.__getState();
  if (!S) return;
  const key = e.key;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','W','a','A','s','S','d','D',' '].includes(key)) {
    e.preventDefault();
  }
  switch (key) {
    case 'ArrowUp': case 'w': case 'W': window.__move(0,-1); break;
    case 'ArrowDown': case 's': case 'S': window.__move(0,1); break;
    case 'ArrowLeft': case 'a': case 'A': window.__move(-1,0); break;
    case 'ArrowRight': case 'd': case 'D': window.__move(1,0); break;
    case ' ': window.__wait(); break;
    case 'r': case 'R': window.__restart(); break;
    default: return;
  }
  renderAll();
}

// ─── Render Everything ───
function renderAll() {
  const S = window.__getState();
  if (!S) return;
  renderMap(S);
  renderArchitecture(S);
  renderLossCurve(S);
  renderMetrics(S);
  updateHeader(S);
}

// ─── Loss Color ───
function lossColor(loss) {
  if (loss<0.2) return '#1a5276';
  if (loss<0.4) return '#1a6b5a';
  if (loss<0.6) return '#2ecc71';
  if (loss<0.8) return '#f39c12';
  return '#e74c3c';
}

// ─── Render Map ───
function renderMap(S) {
  const W = MAP_W, H = MAP_H, SZ = TILE_SZ;
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0,0,cvs.width,cvs.height);

  const p = S.player;
  const viewR = 12;

  for (let y=0; y<H; y++) {
    for (let x=0; x<W; x++) {
      const dist = Math.abs(x-p.x)+Math.abs(y-p.y);
      if (dist>viewR) {
        ctx.fillStyle = '#0a0e14';
        ctx.fillRect(x*SZ, y*SZ, SZ, SZ);
        continue;
      }

      const t = S.tiles[y][x];
      if (t.type === T_WALL) {
        ctx.fillStyle = '#1c2333';
        ctx.fillRect(x*SZ, y*SZ, SZ, SZ);
        ctx.fillStyle = '#2d3a4a';
        ctx.fillRect(x*SZ+1, y*SZ+1, SZ-2, SZ-2);
      } else {
        const c = lossColor(t.loss);
        ctx.fillStyle = c;
        ctx.fillRect(x*SZ, y*SZ, SZ, SZ);
        // subtle grid
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.fillRect(x*SZ, y*SZ, 1, SZ);
        ctx.fillRect(x*SZ, y*SZ, SZ, 1);
      }

      // items
      const item = S.items.find(it => it.alive && it.x===x && it.y===y);
      if (item) {
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (item.type==='layer') {
          ctx.fillStyle = '#ffd700';
          ctx.globalAlpha = 0.5 + 0.5*Math.sin(Date.now()/200);
          ctx.fillText('◆', x*SZ+SZ/2, y*SZ+SZ/2);
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = '#3fb950';
          ctx.fillText('♦', x*SZ+SZ/2, y*SZ+SZ/2);
        }
      }

      // stairs
      if (t.type === T_STAIRS) {
        ctx.fillStyle = '#3fb950';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('>', x*SZ+SZ/2, y*SZ+SZ/2);
      }
    }
  }

  // enemies
  for (const e of S.enemies) {
    if (!e.alive) continue;
    const dist = Math.abs(e.x-p.x)+Math.abs(e.y-p.y);
    if (dist>viewR) continue;
    ctx.fillStyle = e.color;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // hp bar
    const hpPct = e.hp/e.maxHp;
    ctx.fillStyle = '#21262d';
    ctx.fillRect(e.x*SZ+2, e.y*SZ-2, SZ-4, 3);
    ctx.fillStyle = hpPct>0.5 ? '#3fb950' : hpPct>0.25 ? '#d29922' : '#f85149';
    ctx.fillRect(e.x*SZ+2, e.y*SZ-2, (SZ-4)*hpPct, 3);
    ctx.fillStyle = e.color;
    ctx.fillText(e.symbol, e.x*SZ+SZ/2, e.y*SZ+SZ/2+2);
  }

  // player
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#58a6ff';
  ctx.shadowBlur = 8;
  ctx.fillText('@', p.x*SZ+SZ/2, p.y*SZ+SZ/2);
  ctx.shadowBlur = 0;

  // floor label
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`Floor ${S.floor} | Turn ${S.turn}`, 4, cvs.height-3);
}

// ─── Render Architecture ───
function renderArchitecture(S) {
  const W = acvs.width, H = acvs.height;
  actx.fillStyle = '#0d1117';
  actx.fillRect(0,0,W,H);

  const layers = S.player.layers;
  if (layers.length===0) {
    actx.fillStyle = '#8b949e';
    actx.font = '12px monospace';
    actx.textAlign = 'center';
    actx.fillText('No layers — network empty', W/2, H/2);
    return;
  }

  const totalW = W - 20;
  const boxW = Math.min(52, totalW / layers.length - 6);
  const boxH = 40;
  const startY = (H - boxH) / 2;
  const gap = Math.min(8, (totalW - layers.length*boxW) / (layers.length-1));
  const startX = 10;

  for (let i=0; i<layers.length; i++) {
    const l = layers[i];
    const x = startX + i*(boxW+gap);

    // input arrow
    if (i>0) {
      const prevX = startX + (i-1)*(boxW+gap);
      actx.strokeStyle = '#30363d';
      actx.lineWidth = 1.5;
      actx.beginPath();
      actx.moveTo(prevX+boxW, startY+boxH/2);
      actx.lineTo(x, startY+boxH/2);
      actx.stroke();
      // arrow head
      actx.fillStyle = '#30363d';
      actx.beginPath();
      actx.moveTo(x-4, startY+boxH/2-3);
      actx.lineTo(x, startY+boxH/2);
      actx.lineTo(x-4, startY+boxH/2+3);
      actx.fill();
    }

    // box
    actx.fillStyle = l.color + '33';
    actx.strokeStyle = l.color;
    actx.lineWidth = 1.5;
    actx.fillRect(x, startY, boxW, boxH);
    actx.strokeRect(x, startY, boxW, boxH);

    // label
    actx.fillStyle = '#fff';
    actx.font = 'bold 9px monospace';
    actx.textAlign = 'center';
    actx.textBaseline = 'middle';
    actx.fillText(l.emoji, x+boxW/2, startY+boxH/2-5);
    actx.font = '8px monospace';
    actx.fillStyle = '#8b949e';
    actx.fillText(`Lv${l.level}`, x+boxW/2, startY+boxH/2+8);
  }

  // output node
  if (layers.length>0) {
    const lastX = startX + (layers.length-1)*(boxW+gap) + boxW;
    actx.fillStyle = '#58a6ff';
    actx.beginPath();
    actx.arc(lastX+8, startY+boxH/2, 4, 0, Math.PI*2);
    actx.fill();
    actx.font = '6px monospace';
    actx.textAlign = 'center';
    actx.fillText('out', lastX+8, startY+boxH/2+12);
  }

  // layer tags below
  const tagsEl = document.getElementById('layerSlots');
  tagsEl.innerHTML = '';
  for (const l of layers) {
    const span = document.createElement('span');
    span.className = 'layer-tag';
    span.style.background = l.color;
    span.textContent = `${l.emoji} ${l.name}`;
    tagsEl.appendChild(span);
  }
}

// ─── Render Loss Curve ───
function renderLossCurve(S) {
  const W = lcvs.width, H = lcvs.height;
  lctx.fillStyle = '#0d1117';
  lctx.fillRect(0,0,W,H);

  const data = S.lossHistory;
  if (data.length<2) {
    lctx.fillStyle = '#8b949e';
    lctx.font = '10px monospace';
    lctx.textAlign = 'center';
    lctx.fillText('Collecting data...', W/2, H/2);
    return;
  }

  const pad = 8;
  const gw = W - pad*2;
  const gh = H - pad*2;
  const minLoss = Math.max(0, Math.min(...data) - 0.05);
  const maxLoss = Math.min(1, Math.max(...data) + 0.05);
  const range = Math.max(0.1, maxLoss - minLoss);

  // grid lines
  lctx.strokeStyle = '#21262d';
  lctx.lineWidth = 1;
  for (let i=0; i<4; i++) {
    const y = pad + (gh/4)*i;
    lctx.beginPath();
    lctx.moveTo(pad, y);
    lctx.lineTo(W-pad, y);
    lctx.stroke();
    lctx.fillStyle = '#484f58';
    lctx.font = '8px monospace';
    lctx.textAlign = 'right';
    lctx.fillText((maxLoss - range*i/4).toFixed(2), pad-3, y+3);
  }

  // loss line
  const curLoss = S.player.loss;
  const lineColor = curLoss<0.4 ? '#3fb950' : curLoss<0.6 ? '#d29922' : '#f85149';

  lctx.strokeStyle = lineColor;
  lctx.lineWidth = 2;
  lctx.beginPath();
  const step = Math.max(1, Math.floor(data.length / gw));
  const visible = data.filter((_,i)=> i%step===0 || i===data.length-1);
  const spacing = gw / Math.max(1, visible.length-1);
  for (let i=0; i<visible.length; i++) {
    const x = pad + i*spacing;
    const y = pad + gh - ((visible[i]-minLoss)/range)*gh;
    if (i===0) lctx.moveTo(x, y);
    else lctx.lineTo(x, y);
  }
  lctx.stroke();

  // threshold line
  lctx.strokeStyle = '#f8514944';
  lctx.lineWidth = 1;
  lctx.setLineDash([4,4]);
  const threshY = pad + gh - ((S.player.maxLoss-minLoss)/range)*gh;
  lctx.beginPath();
  lctx.moveTo(pad, threshY);
  lctx.lineTo(W-pad, threshY);
  lctx.stroke();
  lctx.setLineDash([]);
  lctx.fillStyle = '#f8514966';
  lctx.font = '8px monospace';
  lctx.textAlign = 'left';
  lctx.fillText('divergence threshold', W-pad-75, threshY-2);

  // current loss value
  lctx.fillStyle = lineColor;
  lctx.font = 'bold 10px monospace';
  lctx.textAlign = 'right';
  lctx.fillText(curLoss.toFixed(3), W-pad-3, pad+gh+8);

  // update loss value in header
  const el = document.getElementById('lossValue');
  el.textContent = curLoss.toFixed(3);
  el.className = 'val ' + (curLoss<0.4?'safe':curLoss<0.6?'warning':'danger');
}

// ─── Render Metrics ───
function renderMetrics(S) {
  const p = S.player;
  document.getElementById('gradientVal').textContent = p.gradient.toFixed(2);
  document.getElementById('gradientBar').style.width = (p.gradient*100)+'%';
  document.getElementById('gradientBar').style.background = p.gradient<0.3?'#f85149':'#58a6ff';

  document.getElementById('dataVal').textContent = p.data;
  const dataMax = 50;
  document.getElementById('dataBar').style.width = Math.min(100, p.data/dataMax*100)+'%';

  document.getElementById('paramsVal').textContent = p.totalParams;
  const paramMax = 80;
  document.getElementById('paramsBar').style.width = Math.min(100, p.totalParams/paramMax*100)+'%';

  // accuracy ≈ inverse of loss
  const acc = Math.max(0, Math.min(100, (1-p.loss)*100));
  document.getElementById('accuracyVal').textContent = acc.toFixed(0)+'%';
  document.getElementById('accuracyBar').style.width = acc+'%';
  document.getElementById('accuracyBar').style.background = acc>60?'#3fb950':acc>30?'#d29922':'#f85149';
}

// ─── Update Header ───
function updateHeader(S) {
  document.getElementById('epochDisplay').textContent = S.floor;
  document.getElementById('statusDot').style.background = S.gameOver ? '#f85149' : '#3fb950';
  document.getElementById('statusText').textContent = S.gameOver ? 'DIVERGED' : 'TRAINING';
  document.getElementById('statusText').style.color = S.gameOver ? '#f85149' : '#3fb950';
}

// ─── Terminal ───
let terminalEl = null;
let terminalRenderCount = -1;

function renderTerminal() {
  const S = window.__getState();
  if (!S) return;
  if (!terminalEl) terminalEl = document.getElementById('terminal');
  const term = terminalEl;

  // detect restart: terminal was cleared
  if (S.terminal.length < terminalRenderCount) {
    term.innerHTML = '';
    terminalRenderCount = 0;
  }

  const existing = term.children.length;
  if (existing >= S.terminal.length) return;
  let html = '';
  for (let i=existing; i<S.terminal.length; i++) {
    const entry = S.terminal[i];
    const ts = new Date().toLocaleTimeString();
    html += `<div class="term-${entry.cls}">[${ts}] ${entry.msg}</div>`;
  }
  term.insertAdjacentHTML('beforeend', html);
  terminalRenderCount = S.terminal.length;
  term.scrollTop = term.scrollHeight;
}
