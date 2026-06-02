// ============================================================
// Gradient Descent — Renderer & UI (v2: Problem-based)
// ============================================================

let cvs, ctx; // kept for compatibility
let acvs, actx;
let lcvs, lctx;

// ─── Init ───
window.__onGameReady = function() {
  acvs = document.getElementById('archCanvas');
  actx = acvs.getContext('2d');
  lcvs = document.getElementById('lossCanvas');
  lctx = lcvs.getContext('2d');

  document.addEventListener('keydown', onKey);
  document.getElementById('restartBtn').addEventListener('click', e => {
    e.preventDefault();
    window.__restart();
    document.getElementById('combatResult').innerHTML = '';
    renderAll();
  });
  document.getElementById('milestoneBtn').addEventListener('click', e => {
    e.preventDefault();
    window.__milestone();
    document.getElementById('combatResult').innerHTML = '';
    renderAll();
  });
  document.getElementById('buyVramBtn').addEventListener('click', e => {
    e.preventDefault();
    window.__upgradeVram();
    renderAll();
  });

  renderAll();
};

// ─── Input ───
function onKey(e) {
  const S = window.__getState();
  if (!S) return;
  if (e.key === ' ') { e.preventDefault(); window.__skip(); document.getElementById('combatResult').innerHTML = ''; renderAll(); }
  if (e.key === 'r' || e.key === 'R') { window.__restart(); document.getElementById('combatResult').innerHTML = ''; renderAll(); }
}

// ─── Render Everything ───
function renderAll() {
  const S = window.__getState();
  if (!S) return;
  renderProblems(S);
  renderCapabilities(S);
  renderArchitecture(S);
  renderLossCurve(S);
  renderMetrics(S);
  updateHeader(S);
}

// ============================================================
// PROBLEM CARDS
// ============================================================
function renderProblems(S) {
  const container = document.getElementById('problemCards');
  if (!container) return;

  if (S.gameOver) {
    container.innerHTML = `<div style="text-align:center;padding:40px;color:#f85149">
      <div style="font-size:24px;font-weight:bold;margin-bottom:8px">GRADIENT EXPLODED</div>
      <div style="color:#8b949e">Model diverged after ${S.turn} steps.</div>
      <div style="color:#8b949e">Killed: ${S.player.totalSolved} benchmarks | Data: ${S.player.data}</div>
      <div style="margin-top:12px"><a href="#" id="restartBtn2" style="color:#58a6ff">[ RESTART ]</a></div>
    </div>`;
    const rs = container.querySelector('#restartBtn2');
    if (rs) rs.addEventListener('click', e => { e.preventDefault(); window.__restart(); renderAll(); });
    return;
  }

  const choices = S.currentChoices;
  if (!choices || choices.length === 0) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:#8b949e">No benchmarks available. Press SPACE to skip.</div>';
    return;
  }

  let html = '';
  for (const p of choices) {
    const { compat, dim2dMatch, seqMatch, compMatch, regMatch } = calcMatchDisplay(S, p);

    const disp2d  = p.dim2d > 0  ? `<span class="req-tag ${dim2dMatch  >= 0.8 ? 'matched' : dim2dMatch  < 0.5 ? 'mismatch' : ''} need-2d">2D:${p.dim2d}</span>` : '';
    const dispSeq = p.seq > 0   ? `<span class="req-tag ${seqMatch    >= 0.8 ? 'matched' : seqMatch    < 0.5 ? 'mismatch' : ''} need-seq">SEQ:${p.seq}</span>` : '';
    const dispCmp = p.comp > 0  ? `<span class="req-tag ${compMatch   >= 0.8 ? 'matched' : compMatch   < 0.5 ? 'mismatch' : ''} need-comp">COMP:${p.comp}</span>` : '';
    const dispReg = p.noise > 0 ? `<span class="req-tag ${regMatch    >= 0.8 ? 'matched' : regMatch    < 0.5 ? 'mismatch' : ''} need-reg">REG:${p.noise}</span>` : '';

    const hasWarn = (dim2dMatch < 0.8 || seqMatch < 0.8 || compMatch < 0.8 || regMatch < 0.8);

    html += `<div class="prob-card ${hasWarn?'warning':''}" data-id="${p.id}">
      <div class="prob-name">
        <span>${p.name}</span>
        <span style="font-size:10px;color:${compat>=0.8?'#3fb950':compat>=0.5?'#d29922':'#f85149'}">${(compat*100).toFixed(0)}% match</span>
      </div>
      <div class="prob-desc">${p.desc}</div>
      <div class="prob-req">${disp2d}${dispSeq}${dispCmp}${dispReg}</div>
    </div>`;
  }

  container.innerHTML = html;

      // click handlers
      container.querySelectorAll('.prob-card').forEach(el => {
        el.addEventListener('click', () => {
          const id = el.dataset.id;
          const problem = S.currentChoices.find(p => p.id === id);
          if (problem) {
            window.__tackle(problem);
            renderCombatResult(S);
            renderAll();
          }
        });
      });
}

function calcMatchDisplay(S, problem) {
  // same logic as game.js calcCompatibility but for display
  const p = S.player;
  const dim2dMatch = p._dim2d >= problem.dim2d ? 1 : p._dim2d / Math.max(1, problem.dim2d);
  const seqMatch   = p._seq   >= problem.seq   ? 1 : p._seq   / Math.max(1, problem.seq);
  const compMatch  = p._comp  >= problem.comp  ? 1 : p._comp  / Math.max(1, problem.comp);
  const regMatch   = p._reg   >= problem.noise ? 1 : p._reg   / Math.max(1, problem.noise);
  const compat = (dim2dMatch + seqMatch + compMatch + regMatch) / 4;
  return { compat, dim2dMatch, seqMatch, compMatch, regMatch };
}

// ─── Combat Result ───
let crAnimTimer = null;
function renderCombatResult(S) {
  const el = document.getElementById('combatResult');
  if (!el) return;

  // show brief animation of the last terminal entries related to combat
  const entries = S.terminal.slice(-15);
  el.innerHTML = entries.map(e =>
    `<div class="cr-line cr-${e.cls}">[${new Date().toLocaleTimeString()}] ${e.msg}</div>`
  ).join('');
  el.scrollTop = el.scrollHeight;

  // auto-scroll terminal
  const termEl = document.getElementById('terminal');
  if (termEl) termEl.scrollTop = termEl.scrollHeight;
}

// ─── Capabilities ───
function renderCapabilities(S) {
  const el = document.getElementById('capGrid');
  if (!el) return;
  const p = S.player;
  el.innerHTML = `
    <div class="cap-item"><label>2D</label><span style="color:${p._dim2d>=3?'#3fb950':p._dim2d>=1?'#d29922':'#f85149'}">${p._dim2d.toFixed(1)}</span></div>
    <div class="cap-item"><label>SEQ</label><span style="color:${p._seq>=3?'#3fb950':p._seq>=1?'#d29922':'#f85149'}">${p._seq.toFixed(1)}</span></div>
    <div class="cap-item"><label>COMP</label><span style="color:${p._comp>=3?'#3fb950':p._comp>=1?'#d29922':'#f85149'}">${p._comp.toFixed(1)}</span></div>
    <div class="cap-item"><label>REG</label><span style="color:${p._reg>=3?'#3fb950':p._reg>=1?'#d29922':'#f85149'}">${p._reg.toFixed(1)}</span></div>
  `;
}

// ============================================================
// ARCHITECTURE (drag-and-drop layer list + flow canvas)
// ============================================================
let dragSourceIdx = null;

function renderArchitecture(S) {
  // ── DOM layer list (draggable) ──
  const listEl = document.getElementById('layerList');
  if (!listEl) return;

  const layers = S.player.layers;
  let html = '<div class="layer-flow">';
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i];
    const vramCost = LAYERS[l.id]?.param * l.level || 0;
    html += `<div class="layer-card" draggable="true" data-idx="${i}"
      style="border-color:${l.color}"
      @dragstart="onDragStart" @dragover="onDragOver" @drop="onDrop" @dragend="onDragEnd">
      <span class="lc-emoji">${l.emoji}</span>
      <span class="lc-name" style="color:${l.color}">${l.name}</span>
      <span class="lc-level">Lv${l.level}</span>
      <span class="lc-vram" title="VRAM: ${vramCost}">${vramCost}MB</span>
      <span class="lc-remove" data-idx="${i}" title="Remove layer">✕</span>
    </div>`;
    if (i < layers.length - 1) {
      // check adjacency bonus for this pair
      const key = layers[i].id + '-' + layers[i+1].id;
      const bonus = ADJACENCY[key];
      const bonusColor = bonus && (bonus.atk>0||bonus.def>0||bonus.dim2d>0) ? '#3fb950' :
                         bonus && (bonus.atk<0||bonus.dim2d<0) ? '#f85149' : '#30363d';
      html += `<div class="layer-conn" style="color:${bonusColor}">${bonus ? (bonus.atk>0?'+':'') + (bonus.atk||bonus.def||bonus.dim2d||bonus.seq||bonus.comp||bonus.reg||'') : '→'}</div>`;
    }
  }
  html += '</div>';
  listEl.innerHTML = html;

  // attach drag events
  const cards = listEl.querySelectorAll('.layer-card');
  cards.forEach(card => {
    card.addEventListener('dragstart', onDragStart);
    card.addEventListener('dragover', onDragOver);
    card.addEventListener('drop', onDrop);
    card.addEventListener('dragend', onDragEnd);
  });

  // remove buttons
  listEl.querySelectorAll('.lc-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(e.target.dataset.idx);
      window.__removeLayer(idx);
      renderAll();
    });
  });

  // ── canvas flow visualization (compact) ──
  const W = acvs.width, H = acvs.height;
  actx.fillStyle = '#0d1117';
  actx.fillRect(0, 0, W, H);

  if (layers.length === 0) {
    actx.fillStyle = '#8b949e';
    actx.font = '10px monospace';
    actx.textAlign = 'center';
    actx.fillText('No layers', W/2, H/2);
    return;
  }

  // simple flow line
  const flowY = H / 2;
  actx.strokeStyle = '#30363d';
  actx.lineWidth = 1;
  actx.beginPath();
  actx.moveTo(10, flowY);
  actx.lineTo(W - 10, flowY);
  actx.stroke();

  // layer dots on the flow line
  const spacing = (W - 60) / Math.max(1, layers.length);
  const startX = 30;
  for (let i = 0; i < layers.length; i++) {
    const x = startX + i * spacing;
    const l = layers[i];
    actx.fillStyle = l.color;
    actx.beginPath();
    actx.arc(x, flowY, 4, 0, Math.PI * 2);
    actx.fill();
    actx.fillStyle = '#8b949e';
    actx.font = '7px monospace';
    actx.textAlign = 'center';
    actx.textBaseline = 'top';
    actx.fillText(l.emoji, x, flowY + 6);
  }

  // ── bonus display ──
  renderBonuses(S);
}

function onDragStart(e) {
  dragSourceIdx = parseInt(e.target.dataset.idx);
  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragSourceIdx);
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const cards = document.querySelectorAll('.layer-card');
  cards.forEach(c => c.classList.remove('drag-over'));
  e.target.closest('.layer-card')?.classList.add('drag-over');
}

function onDrop(e) {
  e.preventDefault();
  const targetIdx = parseInt(e.target.closest('.layer-card')?.dataset.idx);
  const S = window.__getState();
  if (S && dragSourceIdx !== null && targetIdx !== null && dragSourceIdx !== targetIdx) {
    window.__reorderLayers(dragSourceIdx, targetIdx);
    renderAll();
  }
  document.querySelectorAll('.layer-card').forEach(c => c.classList.remove('drag-over', 'dragging'));
  dragSourceIdx = null;
}

function onDragEnd(e) {
  document.querySelectorAll('.layer-card').forEach(c => c.classList.remove('drag-over', 'dragging'));
  dragSourceIdx = null;
}

function renderBonuses(S) {
  const el = document.getElementById('bonusDisplay');
  if (!el) return;
  const bonuses = S.player._bonuses;
  if (!bonuses || bonuses.length === 0) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = bonuses.slice(-3).map(b =>
    `<div style="font-size:10px;color:#3fb950;line-height:1.4">▸ ${b.desc}</div>`
  ).join('');
}

// ============================================================
// LOSS CURVE
// ============================================================
function renderLossCurve(S) {
  const W = lcvs.width, H = lcvs.height;
  lctx.fillStyle = '#0d1117';
  lctx.fillRect(0,0,W,H);

  const data = S.lossHistory;
  if (data.length<2) {
    lctx.fillStyle = '#8b949e';
    lctx.font = '10px monospace';
    lctx.textAlign = 'center';
    lctx.fillText('Collecting...', W/2, H/2);
    return;
  }

  const pad = 8;
  const gw = W - pad*2;
  const gh = H - pad*2;
  const minLoss = Math.max(0, Math.min(...data) - 0.02);
  const maxLoss = Math.min(1, Math.max(...data) + 0.02);
  const range = Math.max(0.05, maxLoss - minLoss);

  // grid
  lctx.strokeStyle = '#21262d';
  lctx.lineWidth = 1;
  for (let i=0; i<4; i++) {
    const y = pad + (gh/4)*i;
    lctx.beginPath(); lctx.moveTo(pad, y); lctx.lineTo(W-pad, y); lctx.stroke();
    lctx.fillStyle = '#484f58';
    lctx.font = '7px monospace';
    lctx.textAlign = 'right';
    lctx.fillText((maxLoss - range*i/4).toFixed(2), pad-3, y+3);
  }

  const curLoss = S.player.loss;
  const lineColor = curLoss<0.3 ? '#3fb950' : curLoss<0.5 ? '#d29922' : '#f85149';

  lctx.strokeStyle = lineColor;
  lctx.lineWidth = 2;
  lctx.beginPath();
  const step = Math.max(1, Math.floor(data.length / gw));
  const visible = data.filter((_,i)=> i%step===0 || i===data.length-1);
  const spacing = gw / Math.max(1, visible.length-1);
  for (let i=0; i<visible.length; i++) {
    const x = pad + i*spacing;
    const y = pad + gh - ((visible[i]-minLoss)/range)*gh;
    if (i===0) lctx.moveTo(x, y); else lctx.lineTo(x, y);
  }
  lctx.stroke();

  // threshold
  lctx.strokeStyle = '#f8514944';
  lctx.lineWidth = 1;
  lctx.setLineDash([3,3]);
  const threshY = pad + gh - ((S.player.maxLoss-minLoss)/range)*gh;
  lctx.beginPath(); lctx.moveTo(pad, threshY); lctx.lineTo(W-pad, threshY); lctx.stroke();
  lctx.setLineDash([]);

  // value
  const el = document.getElementById('lossValue');
  el.textContent = curLoss.toFixed(3);
  el.className = 'val ' + (curLoss<0.3?'safe':curLoss<0.5?'warning':'danger');
}

// ============================================================
// METRICS
// ============================================================
function renderMetrics(S) {
  const p = S.player;
  document.getElementById('vramVal').textContent = `${p._vramUsed||0}/${p.maxVram}`;
  const vramPct = Math.min(100, ((p._vramUsed||0) / p.maxVram) * 100);
  document.getElementById('vramBar').style.width = vramPct + '%';
  document.getElementById('vramBar').style.background = vramPct > 85 ? '#f85149' : vramPct > 60 ? '#d29922' : '#58a6ff';

  document.getElementById('gradientVal').textContent = p.gradient.toFixed(2);
  document.getElementById('gradientBar').style.width = (p.gradient*100)+'%';
  document.getElementById('gradientBar').style.background = p.gradient<0.3?'#f85149':'#58a6ff';

  document.getElementById('dataVal').textContent = p.data;
  const dataMax = 100;
  document.getElementById('dataBar').style.width = Math.min(100, p.data/dataMax*100)+'%';

  document.getElementById('paramsVal').textContent = p._vramUsed || 0;
  const paramMax = Math.max(p.maxVram, 1);
  document.getElementById('paramsBar').style.width = Math.min(100, ((p._vramUsed||0)/paramMax)*100)+'%';
  document.getElementById('paramsBar').style.background = '#8b949e';
}

// ============================================================
// HEADER
// ============================================================
function updateHeader(S) {
  document.getElementById('stepDisplay').textContent = S.turn;
  const dot = document.getElementById('statusDot');
  const txt = document.getElementById('statusText');
  if (S.gameOver) {
    dot.style.background = '#f85149';
    txt.textContent = 'DIVERGED';
    txt.style.color = '#f85149';
  } else {
    dot.style.background = '#3fb950';
    txt.textContent = 'BENCHMARKING';
    txt.style.color = '#3fb950';
  }
}

// ============================================================
// TERMINAL
// ============================================================
let terminalEl = null;
let terminalRenderCount = -1;

function renderTerminal() {
  const S = window.__getState();
  if (!S) return;
  if (!terminalEl) terminalEl = document.getElementById('terminal');
  const term = terminalEl;

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
