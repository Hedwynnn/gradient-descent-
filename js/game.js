// ============================================================
// Gradient Descent — Game Logic (v3: Problem + VRAM + Combos)
// ============================================================

// ─── Adjacency Bonus Table (Noita-style combos) ───
const ADJACENCY = {
  'conv2d-relu':       { atk:2,crit:0.03,dim2d:0,seq:0,comp:0,reg:0,def:0,desc:'Conv→ReLU: 标准激活，输出增强' },
  'relu-conv2d':       { atk:-2,crit:0,dim2d:0,seq:0,comp:0,reg:0,def:0,desc:'ReLU→Conv: 过早激活，信号损失' },
  'batchnorm-relu':    { atk:0,crit:0.02,dim2d:0,seq:0,comp:0,reg:0,def:2,desc:'BN→ReLU: 归一化后激活，稳定高效' },
  'relu-batchnorm':    { atk:-1,crit:0,dim2d:0,seq:0,comp:0,reg:0,def:1,desc:'ReLU→BN: 部分神经元已死，BN修正' },
  'dropout-dense':     { atk:0,crit:0,dim2d:0,seq:0,comp:0,reg:3,def:0,desc:'Dropout→Dense: 正则全连接，抗过拟合' },
  'dense-dropout':     { atk:0,crit:0,dim2d:0,seq:0,comp:0,reg:1,def:0,desc:'Dense→Dropout: 标准Dropout' },
  'batchnorm-conv2d':  { atk:0,crit:0,dim2d:2,seq:0,comp:0,reg:0,def:1,desc:'BN→Conv: 归一化卷积，特征稳定' },
  'conv2d-batchnorm':  { atk:0,crit:0,dim2d:1,seq:0,comp:0,reg:0,def:0,desc:'Conv→BN: 卷积后归一化' },
  'attention-pooling': { atk:0,crit:0,dim2d:0,seq:2,comp:-1,reg:0,def:0,desc:'Attn→Pool: 降维注意力，省算力' },
  'pooling-attention': { atk:0,crit:0,dim2d:0,seq:-1,comp:1,reg:0,def:0,desc:'Pool→Attn: 先降维损失序列信息' },
  'attention-dense':   { atk:1,crit:0,dim2d:0,seq:1,comp:-1,reg:0,def:0,desc:'Attn→Dense: 全局特征+全连接' },
  'sigmoid-dense':     { atk:0,crit:0,dim2d:0,seq:0,comp:0,reg:0,def:2,desc:'Sigmoid→Dense: 平滑激活全连接' },
  'dense-relu':        { atk:2,crit:0.02,dim2d:0,seq:0,comp:0,reg:0,def:0,desc:'Dense→ReLU: 全连接后激活，高输出' },
  'dense-sigmoid':     { atk:0,crit:0,dim2d:0,seq:0,comp:0,reg:0,def:1,desc:'Dense→Sigmoid: 全连接后平滑' },
  'pooling-dense':     { atk:0,crit:0,dim2d:0,seq:0,comp:2,reg:0,def:0,desc:'Pool→Dense: 降维后全连接，省参数量' },
  'dropout-conv2d':    { atk:0,crit:0,dim2d:-1,seq:0,comp:0,reg:1,def:0,desc:'Dropout→Conv: 正则卷积，略损2D' },
  'conv2d-pooling':    { atk:0,crit:0,dim2d:1,seq:0,comp:1,reg:0,def:0,desc:'Conv→Pool: 卷积后池化，标准下采样' },
  'relu-dropout':      { atk:0,crit:0,dim2d:0,seq:0,comp:0,reg:1,def:0,desc:'ReLU→Dropout: 激活后正则' },
  'attention-conv2d':  { atk:1,crit:0,dim2d:1,seq:-1,comp:-2,reg:0,def:0,desc:'Attn→Conv: 全局+局部，极耗算力' },
  'conv2d-attention':  { atk:1,crit:0,dim2d:1,seq:1,comp:-2,reg:0,def:0,desc:'Conv→Attn: 特征图Attention，高算力' },
  'attention-relu':    { atk:1,crit:0.02,dim2d:0,seq:0,comp:0,reg:0,def:0,desc:'Attn→ReLU: 注意力后激活' },
  'batchnorm-dropout': { atk:0,crit:0,dim2d:0,seq:0,comp:0,reg:2,def:0,desc:'BN→Dropout: 归一化后正则' },
  'sigmoid-conv2d':    { atk:0,crit:0,dim2d:-1,seq:0,comp:0,reg:0,def:1,desc:'Sigmoid→Conv: 平滑后卷积，钝化' },
  'pooling-conv2d':    { atk:0,crit:0,dim2d:-1,seq:0,comp:0,reg:0,def:0,desc:'Pool→Conv: 池化后卷积，信息损失' },
};

// ─── Layer Blueprints ───
const LAYERS = {
  dense:     { id:'dense',     name:'Dense',     color:'#4CAF50', atk:2, def:1, rd:0, seq:0, comp:2, reg:0, param:10, emoji:'◆', desc:'+ATK/DEF, 算力↑' },
  conv2d:    { id:'conv2d',    name:'Conv2D',    color:'#2196F3', atk:1, def:1, rd:3, seq:0, comp:3, reg:0, param:15, emoji:'⊞', desc:'图像能力+3，高算力消耗' },
  relu:      { id:'relu',      name:'ReLU',      color:'#FF9800', atk:1, def:0, rd:0, seq:0, comp:0, reg:0, param:3,  emoji:'⌁', desc:'激活，提供暴击修正' },
  dropout:   { id:'dropout',   name:'Dropout',   color:'#9C27B0', atk:0, def:1, rd:0, seq:0, comp:0, reg:3, param:3,  emoji:'⊘', desc:'正则化+3，噪声容错↑' },
  sigmoid:   { id:'sigmoid',   name:'Sigmoid',   color:'#E91E63', atk:0, def:2, rd:0, seq:0, comp:0, reg:1, param:5,  emoji:'∫', desc:'+DEF，微量正则' },
  batchnorm: { id:'batchnorm', name:'BatchNorm', color:'#00BCD4', atk:0, def:2, rd:0, seq:0, comp:0, reg:2, param:8,  emoji:'β', desc:'+DEF，正则化+2，loss抗性' },
  pooling:   { id:'pooling',   name:'Pooling',   color:'#607D8B', atk:0, def:0, rd:0, seq:-1,comp:-2,reg:1, param:2,  emoji:'▽', desc:'降采样：序列需求↓，算力需求↓' },
  attention: { id:'attention', name:'Attention', color:'#E040FB', atk:3, def:0, rd:0, seq:3, comp:5, reg:0, param:20, emoji:'◎', desc:'序列能力+3，极高算力需求' },
};
const LAYER_IDS = Object.keys(LAYERS);

// ─── Problem Blueprints ───
const PROBLEMS = [
  { id:'mnist',   name:'手写数字识别',         desc:'28×28灰度图分类',          dim2d:2, seq:0, comp:1, noise:1, hp:12, atk:3, rewData:3,  rewLayer:0.3 },
  { id:'cifar10', name:'CIFAR-10分类',         desc:'32×32彩色图，10类',        dim2d:3, seq:0, comp:2, noise:2, hp:18, atk:4, rewData:5,  rewLayer:0.4 },
  { id:'imgnet',  name:'ImageNet分类',         desc:'224×224大规模图像分类',    dim2d:5, seq:0, comp:4, noise:2, hp:30, atk:7, rewData:10, rewLayer:0.6 },
  { id:'segment', name:'语义分割',             desc:'像素级分类，空间信息重要',  dim2d:4, seq:0, comp:4, noise:3, hp:26, atk:6, rewData:8,  rewLayer:0.5 },
  { id:'weather', name:'气象时序预测',         desc:'长期气温序列预测',          dim2d:0, seq:4, comp:3, noise:3, hp:22, atk:5, rewData:7,  rewLayer:0.4 },
  { id:'stock',   name:'股价序列预测',         desc:'高频金融时序，噪音大',      dim2d:0, seq:3, comp:2, noise:4, hp:16, atk:4, rewData:5,  rewLayer:0.3 },
  { id:'ecg',     name:'心电图异常检测',       desc:'长序列异常检测',            dim2d:0, seq:5, comp:3, noise:2, hp:28, atk:5, rewData:8,  rewLayer:0.5 },
  { id:'ocr',     name:'OCR文字识别',          desc:'文本检测+识别，2D+序列',    dim2d:2, seq:2, comp:3, noise:2, hp:20, atk:4, rewData:6,  rewLayer:0.4 },
  { id:'video',   name:'视频行为识别',         desc:'时空联合建模，2D+序列高需求',dim2d:3,seq:3, comp:5, noise:1, hp:35, atk:8, rewData:12, rewLayer:0.6 },
  { id:'point',   name:'3D点云分类',           desc:'点云数据，极度缺算力会卡',  dim2d:1, seq:0, comp:5, noise:3, hp:24, atk:6, rewData:9,  rewLayer:0.4 },
  { id:'nlp',     name:'情感分析',             desc:'文本分类，序列为主',        dim2d:0, seq:2, comp:1, noise:2, hp:14, atk:3, rewData:4,  rewLayer:0.3 },
  { id:'trans',   name:'机器翻译',             desc:'seq2seq翻译任务',          dim2d:0, seq:4, comp:2, noise:1, hp:24, atk:5, rewData:7,  rewLayer:0.4 },
];

let S = null;

function rand(min, max) { return Math.floor(Math.random()*(max-min+1))+min; }
function pick(arr) { return arr[rand(0,arr.length-1)]; }
function clamp(v,lo,hi) { return Math.max(lo,Math.min(hi,v)); }

function log(msg, cls='info') {
  S.terminal.push({msg,cls});
  if (S.terminal.length>200) S.terminal.splice(0,50);
  renderTerminal();
}

function createLayer(id) { const bp = LAYERS[id]; return { ...bp, level:1 }; }

// ─── Capabilities ───
function calcCapabilities() {
  const p = S.player;
  let dim2d=0, seq=0, comp=0, reg=0, atk=6, def=0, crit=0.05;

  for (const l of p.layers) {
    const bp = LAYERS[l.id];
    atk += bp.atk * l.level;
    def += bp.def * l.level;
    dim2d += (bp.rd||0) * l.level;
    seq += (bp.seq||0) * l.level;
    comp += (bp.comp||0) * l.level;
    reg += (bp.reg||0) * l.level;
    if (l.id === 'relu') crit += 0.08 * l.level;
  }

  const activeBonuses = [];
  for (let i = 0; i < p.layers.length - 1; i++) {
    const key = p.layers[i].id + '-' + p.layers[i+1].id;
    const bonus = ADJACENCY[key];
    if (bonus) {
      atk += (bonus.atk||0); def += (bonus.def||0); dim2d += (bonus.dim2d||0);
      seq += (bonus.seq||0); comp += (bonus.comp||0); reg += (bonus.reg||0); crit += (bonus.crit||0);
      activeBonuses.push({ key, desc: bonus.desc });
    }
  }
  p._bonuses = activeBonuses;

  p._dim2d = Math.max(0, dim2d); p._seq = Math.max(1, seq);
  p._comp = Math.max(1, comp); p._reg = Math.max(0, reg);
  p._atk = atk; p._def = def; p._crit = Math.min(crit, 0.8);
  p._vramUsed = p.layers.reduce((s, l) => s + LAYERS[l.id].param * l.level, 0);
  p._totalParams = p._vramUsed;
}

// ─── Remove Layer ───
function removeLayer(idx) {
  if (S.gameOver) return;
  const p = S.player;
  if (idx < 0 || idx >= p.layers.length) return;
  const removed = p.layers.splice(idx, 1)[0];
  log(`${removed.name} removed. VRAM freed: ${LAYERS[removed.id].param * removed.level}MB`, 'info');
  calcCapabilities();
}

// ─── Upgrade VRAM ───
function upgradeVram() {
  const p = S.player;
  const cost = 15 + Math.floor(p.maxVram / 5) * 5;
  if (p.data < cost) { log(`VRAM升级需要 ${cost} data (当前 ${p.data})`, 'warn'); return; }
  p.data -= cost; p.maxVram += 5;
  log(`VRAM上限提升至 ${p.maxVram} (消耗 ${cost} data)`, 'good');
}

// ─── Reorder Layers ───
function reorderLayers(fromIdx, toIdx) {
  if (S.gameOver) return;
  const layers = S.player.layers;
  if (fromIdx < 0 || fromIdx >= layers.length || toIdx < 0 || toIdx >= layers.length) return;
  const [removed] = layers.splice(fromIdx, 1);
  layers.splice(toIdx, 0, removed);
  calcCapabilities();
  log(`Layers reordered: ${layers.map(l=>l.emoji).join(' → ')}`, 'highlight');
  const bonuses = S.player._bonuses;
  if (bonuses.length > 0) for (const b of bonuses.slice(-3)) log(`  ↳ ${b.desc}`, 'good');
}

// ─── Generate Problem Choices ───
function generateProblems(count) {
  const available = PROBLEMS.filter(p => p.hp <= 20 + S.floor * 5);
  return [...available].sort(() => Math.random() - 0.5).slice(0, count);
}

// ─── Compatibility ───
function calcCompatibility(problem) {
  calcCapabilities();
  const p = S.player;
  const dim2dMatch = p._dim2d >= problem.dim2d ? 1 : p._dim2d / Math.max(1, problem.dim2d);
  const seqMatch   = p._seq   >= problem.seq   ? 1 : p._seq   / Math.max(1, problem.seq);
  const compMatch  = p._comp  >= problem.comp  ? 1 : p._comp  / Math.max(1, problem.comp);
  const regMatch   = p._reg   >= problem.noise ? 1 : p._reg   / Math.max(1, problem.noise);
  const compat = (dim2dMatch + seqMatch + compMatch + regMatch) / 4;
  return { compat, dim2dMatch, seqMatch, compMatch, regMatch };
}

// ─── Tackle Problem ───
function tackleProblem(problem) {
  if (S.gameOver || !problem) return;
  S.currentProblem = problem;
  const { compat, dim2dMatch, seqMatch, compMatch, regMatch } = calcCompatibility(problem);
  const p = S.player;

  log(`══════ Processing: ${problem.name} ══════`, 'highlight');
  log(`[Task] ${problem.desc}`, 'info');

  const warnings = [];
  if (dim2dMatch < 0.5) warnings.push(`2D能力不足 (${p._dim2d.toFixed(1)} vs 需${problem.dim2d}) - 严重精度损失`);
  else if (dim2dMatch < 0.8) warnings.push(`2D能力略欠 (${p._dim2d.toFixed(1)} vs 需${problem.dim2d}) - 部分损失`);
  if (seqMatch < 0.5) warnings.push(`序列能力不足 (${p._seq.toFixed(1)} vs 需${problem.seq}) - 严重损失`);
  else if (seqMatch < 0.8) warnings.push(`序列能力略欠 (${p._seq.toFixed(1)} vs 需${problem.seq}) - 部分损失`);
  if (compMatch < 0.5) warnings.push(`算力不足 (${p._comp.toFixed(1)} vs 需${problem.comp}) - 推理极慢`);
  else if (compMatch < 0.8) warnings.push(`算力略缺 (${p._comp.toFixed(1)} vs 需${problem.comp}) - 较慢`);
  if (regMatch < 0.5) warnings.push(`正则化不足 (${p._reg.toFixed(1)} vs 需${problem.noise}) - 过拟合严重`);
  else if (regMatch < 0.8) warnings.push(`正则化略欠 (${p._reg.toFixed(1)} vs 需${problem.noise}) - 部分过拟合`);

  for (const w of warnings) log(`⚠ ${w}`, 'warn');
  if (warnings.length === 0) log('✓ 架构与任务高度匹配', 'good');

  const baseDmg = p._atk + rand(-2, 3) + Math.floor(compat * 5);
  let dmg = baseDmg;
  if (Math.random() < p._crit) { dmg = Math.floor(dmg * 2.5); log('✓ ReLU激活！输出增强', 'good'); }
  const actualDmg = Math.max(1, dmg);
  const turnsNeeded = Math.ceil(problem.hp / actualDmg);
  log(`Forward pass: ${actualDmg} damage/turn -> ${turnsNeeded} turns to solve`, 'info');

  const baseLossInc = (problem.atk - p._def * 0.3) * 0.015;
  const lossInc = Math.max(0.005, baseLossInc / (0.3 + 0.7 * compat));
  const totalTurns = Math.min(turnsNeeded, 10);
  const solved = turnsNeeded <= totalTurns;

  for (let t=0; t<totalTurns; t++) {
    p.loss = Math.min(p.maxLoss, p.loss + lossInc * (1 - t * 0.05 * compat));
    log(` Step ${t+1}/${totalTurns} - loss ${p.loss.toFixed(3)}`, t < turnsNeeded-1 ? 'info' : 'good');
    if (p.loss >= p.maxLoss) {
      S.gameOver = true;
      log('═══ GRADIENT EXPLODED - MODEL DIVERGED ═══', 'err');
      log(`Failed on: ${problem.name}`, 'err');
      renderAll();
      return;
    }
  }

  if (solved) {
    const reward = problem.rewData + Math.floor(compat * 3);
    p.data += reward;
    p.loss = Math.max(0.05, p.loss - 0.03 * compat);
    log(`✓ ${problem.name} solved! +${reward} data`, 'good');
    log(`Loss reduced by ${(0.03*compat).toFixed(3)} (compatibility bonus)`, 'good');

    if (Math.random() < problem.rewLayer) {
      let pool = LAYER_IDS;
      if (problem.dim2d >= 3 && Math.random() < 0.4) pool = ['conv2d','pooling','batchnorm'];
      else if (problem.seq >= 3 && Math.random() < 0.4) pool = ['attention','pooling','dense'];
      const lid = pick(pool);
      const cost = LAYERS[lid].param;
      if (p._vramUsed + cost <= p.maxVram) {
        p.layers.push(createLayer(lid));
        log(`✓ New layer: ${LAYERS[lid].name} (VRAM ${cost}MB)`, 'good');
      } else {
        log(`⚠ VRAM不足! ${LAYERS[lid].name} needs ${cost}MB, free: ${p.maxVram - p._vramUsed}MB`, 'warn');
      }
    }
    if (Math.random() < 0.2 * compat) { const l = pick(p.layers); l.level++; log(`↑ ${l.name} Lv.${l.level}`, 'good'); }
  } else {
    p.data += Math.floor(problem.rewData * 0.3);
    log(`⚠ ${problem.name} partially solved, ${Math.floor(problem.rewData * 0.3)} data collected`, 'warn');
  }

  p.totalSolved++; S.turn++; S.currentProblem = null;
  S.lossHistory.push(p.loss);
  if (S.lossHistory.length > 150) S.lossHistory.shift();
  S.currentChoices = generateProblems(2 + Math.floor(S.floor / 3));
}

// ─── Skip Step ───
function skipStep() {
  if (S.gameOver) return;
  S.turn++; const p = S.player;
  p.loss = Math.min(p.maxLoss, p.loss + 0.03);
  p.gradient = Math.min(1.0, p.gradient + 0.15);
  S.lossHistory.push(p.loss);
  if (S.lossHistory.length > 150) S.lossHistory.shift();
  log('Step skipped - gradient recovered, loss drifted', 'info');
  S.currentChoices = generateProblems(2 + Math.floor(S.floor / 3));
}

// ─── Milestone ───
function epochMilestone() {
  if (S.gameOver) return;
  S.floor++; const p = S.player;
  p.loss = Math.max(0.1, p.loss - 0.08);
  p.gradient = 1.0;
  log(`══════ Milestone ${S.floor} - Validating... ══════`, 'highlight');

  let pool = LAYER_IDS;
  if (S.floor % 3 === 0) pool = ['attention','conv2d','batchnorm'];
  const lid = pick(pool);
  const cost = LAYERS[lid].param;
  if (p._vramUsed + cost <= p.maxVram) {
    p.layers.push(createLayer(lid));
    log(`✓ Architecture upgrade: ${LAYERS[lid].name} (VRAM ${cost}MB)`, 'good');
  } else {
    log(`⚠ VRAM不足，无法添加 ${LAYERS[lid].name} (需${cost}MB)`, 'warn');
  }
  p.maxVram += 5;
  log(`↑ VRAM上限 +5 (${p.maxVram})`, 'good');

  for (let i=0; i<Math.min(2, 1+Math.floor(S.floor/5)); i++) {
    const l = pick(p.layers); l.level++;
    log(`↑ ${l.name} Lv.${l.level}`, 'good');
  }
  S.currentChoices = generateProblems(2 + Math.floor(S.floor / 3));
}

// ─── Init & Restart ───
function initGame() {
  S = {
    floor: 1, turn: 0, gameOver: false,
    player: {
      loss: 0.15, maxLoss: 1.0, gradient: 1.0, data: 0,
      layers: [], totalSolved: 0, vram: 30, maxVram: 30,
      _dim2d:0, _seq:0, _comp:0, _reg:0,
      _atk:0, _def:0, _crit:0, _totalParams:0, _vramUsed:0, _bonuses:[],
    },
    currentProblem: null, currentChoices: [],
    lossHistory: [], terminal: [],
  };
  S.player.layers = [createLayer('dense'), createLayer('relu'), createLayer('dropout')];
  S.lossHistory = [S.player.loss];
  calcCapabilities();
  S.currentChoices = generateProblems(2);
  log('═══ Gradient Descent v0.3 ═══', 'highlight');
  log('Model deployed - choose benchmark to process', 'info');
  log(`Architecture: ${S.player.layers.map(l=>l.name).join(' -> ')}`, 'info');
  log(`VRAM: ${S.player._vramUsed}/${S.player.maxVram}MB`, 'info');
}

function restartGame() { initGame(); log('═══ Model reinitialized ═══', 'highlight'); }

// ─── Exports ───
window.__getState = () => S;
window.__restart = restartGame;
window.__tackle = tackleProblem;
window.__skip = skipStep;
window.__milestone = epochMilestone;
window.__reorderLayers = reorderLayers;
window.__removeLayer = removeLayer;
window.__upgradeVram = upgradeVram;

window.addEventListener('DOMContentLoaded', () => { initGame(); if (window.__onGameReady) window.__onGameReady(); });
