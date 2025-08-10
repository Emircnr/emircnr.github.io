/* gameLogic.js (module)
 * Global Conquest — Offline (AI Bots)
 * - No external deps, CSP-safe, type="module"
 * - Hex grid (axial coords), seeded RNG, simple AI, buildings, pacts, market
 */

///////////////////////////////
// 0) DOM helpers & globals  //
///////////////////////////////
const $ = (id) => document.getElementById(id);
const on = (el, ev, fn) => el.addEventListener(ev, fn);

// UI roots
const startScreen = $("start-screen");
const gameRoot    = $("game");
const mapCanvas   = $("mapCanvas");
const ctx         = mapCanvas.getContext("2d", { alpha: false });

// Modals
const modals = {
  attack: $("modal-attack"),
  build: $("modal-build"),
  market: $("modal-market"),
  diplomacy: $("modal-diplomacy"),
  army: $("modal-army"),
  log: $("modal-log"),
  settings: $("modal-settings"),
};

// HUD elements
const hud = {
  round: $("hud-round"),
  current: $("hud-current"),
  bots: $("hud-bots"),
  oil: $("hud-oil"),
  wheat: $("hud-wheat"),
  money: $("hud-money"),
  timer: $("turn-timer"),
};

// Panels / lists
const playersPanel = $("players-panel");
const playersList  = $("players-list");
const toastsBox    = $("toasts");
const tooltipBox   = $("tooltip");

// Start controls
const btnStart = $("btn-start");
const btnHowto = $("btn-howto");

// Dock & header buttons
const btnEnd       = $("btn-end");
const btnPlayers   = $("btn-players");
const btnSettings  = $("btn-settings");
const btnAttack    = $("btn-attack");
const btnBuild     = $("btn-build");
const btnMarket    = $("btn-market");
const btnDip       = $("btn-diplomacy");
const btnArmy      = $("btn-army");
const btnLog       = $("btn-log");
const btnClosePlayers = $("btn-close-players");

// Attack modal controls
const attackTargetLabel = $("attack-target");
const attackUnits = $("attack-units");
const attackPlan  = $("attack-plan");
const doAttackBtn = $("do-attack");

// Build modal
const buildSelected = $("build-selected");
const btnBuildBarracks = $("btn-build-barracks");
const btnBuildFactory  = $("btn-build-factory");
const btnBuildRefinery = $("btn-build-refinery");
const btnBuildMill     = $("btn-build-mill");
const btnBuildCastle   = $("btn-build-castle");
const btnUpgradeCastle = $("btn-upgrade-castle");
const castleUpgradeCostEl = $("castle-upgrade-cost");

// Market
const marketItem   = $("market-item");
const marketAmount = $("market-amount");
const marketSide   = $("market-side");
const marketPrice  = $("market-price");
const marketPlace  = $("btn-market-place");
const ordersList   = $("orders-list");

// Diplomacy
const dipTarget   = $("dip-target");
const dipDuration = $("dip-duration");
const dipCost     = $("dip-cost");
const btnSendPact = $("btn-send-pact");
const pactsList   = $("pacts-list");

// Army
const buySoldiersInput = $("buy-soldiers");
const btnBuySoldiers   = $("btn-buy-soldiers");
const pullCount        = $("pull-count");
const btnPull          = $("btn-pull");
const armyList         = $("army-list");

// Log
const logList = $("log-list");

// Settings
const optTooltips  = $("opt-tooltips");
const optAnims     = $("opt-animations");
const btnReset     = $("btn-reset");

// Start form controls
const botCountInput  = $("bot-count");
const difficultySel  = $("difficulty");
const mapSizeSel     = $("map-size");
const playerColorInp = $("player-color");
const turnSecondsSel = $("turn-seconds");
const seedInput      = $("seed");

// State containers
let RNG = makeRNG("");            // seeded rng
let world = null;                 // {cells[], size, layout}
let state = null;                 // gameplay state (players, round, turn, market, pacts, log)
let selectedId = null;            // selected cell id (number)
let hoverId = null;               // hover cell id (for tooltip)
let scale = 1;                    // canvas scale (auto fits)
let offset = {x:0,y:0};           // canvas offset (centered)
let turnTimer = null;             // interval
let remaining = 60;               // seconds
let animsOn = true;
let tooltipsMode = "hover";       // hover | locked | hidden

/////////////////////////
// 1) Game Constants   //
/////////////////////////
const MAP_PRESETS = {
  small:  { w: 10, h: 6  },  // ~60
  medium: { w: 12, h: 8  },  // ~96
  large:  { w: 14, h: 10 },  // ~140
};
const HEX_SIZE_BASE = 28; // base pixel radius (auto scales with canvas)

const COST = {
  soldierMoney: 10, soldierWheat: 25,
  barracks: { money: 300, oil: 50, wheat: 120 },
  factory:  { money: 500, oil:130 },
  refinery: { money: 800, oil:250 },
  mill:     { money: 200, oil:100 },
  castle:   { money:1000, oil:1000, wheat:1000 },
  castleUpgradeMul: 1.3, // next cost multiplier
};
const EFFECT = {
  barracksSoldiers: 5,                 // per turn, per barracks
  factoryIncome: 0.2,                  // +% income per factory
  refineryOil: 0.15,                   // +% oil per refinery
  millWheat: 0.2,                      // +% wheat per mill
  castleStep: 5,                       // % per level, max 30
};
const START = {
  human: { money: 1000, soldiers: 10, oil: 120, wheat: 350 },
  bot:   { money: 900,  soldiers: 8,  oil: 110, wheat: 300 },
};

const COLORS = {
  neutral: "#2a3345",
  stroke:  "#1b2232",
  text:    "#e9eef5",
  weak:    "#ffb757",
  strong:  "#3cf3c4",
};

// Axial neighbor directions (pointy top)
const DIRS = [
  {q:+1,r: 0}, {q:+1,r:-1}, {q: 0,r:-1},
  {q:-1,r: 0}, {q:-1,r:+1}, {q: 0,r:+1},
];

///////////////////////////////////////
// 2) Lightweight utilities & UI     //
///////////////////////////////////////
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
function choice(arr){ return arr[(RNG() * arr.length) | 0]; }
function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j = (RNG()* (i+1)) | 0;
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  return arr;
}
function uid(prefix="p"){ return prefix + Math.random().toString(36).slice(2,8); }
function lerp(a,b,t){ return a + (b-a)*t; }

// Seeded RNG (xmur3 + sfc32)
function makeRNG(seed){
  const xmur3 = (str)=>{ let h=1779033703^str.length; for(let i=0;i<str.length;i++){ h=Math.imul(h^str.charCodeAt(i),3432918353); h=h<<13|h>>>19; } return ()=>{ h=Math.imul(h^h>>>16,2246822507); h=Math.imul(h^h>>>13,3266489909); return (h^h>>>16)>>>0; }; };
  const s = xmur3(seed||"gc-offline"); return sfc32(s(), s(), s(), s());
  function sfc32(a,b,c,d){ return function(){ a|=0; b|=0; c|=0; d|=0; var t=(a+b|0)+d|0; d=d+1|0; a=b^b>>>9; b=c+(c<<3)|0; c=(c<<21|c>>>11); c=c+t|0; return (t>>>0)/4294967296; } }
}

function toast(text, ms=3000){
  const div = document.createElement("div");
  div.className = "toast";
  div.textContent = text;
  toastsBox.appendChild(div);
  setTimeout(()=> div.remove(), ms);
}

function logEvent(text){
  const item = document.createElement("div");
  item.textContent = text;
  logList.prepend(item);
}

function openModal(id){
  modals[id].classList.add("open");
}
function closeModal(id){
  modals[id].classList.remove("open");
}
document.querySelectorAll("[data-close]").forEach(btn=>{
  on(btn, "click", ()=> closeModal(btn.getAttribute("data-close").replace("modal-","")));
});

on(btnPlayers,"click", ()=>{
  const open = !playersPanel.classList.contains("open");
  playersPanel.classList.toggle("open", open);
  btnPlayers.setAttribute("aria-expanded", String(open));
});
on(btnClosePlayers,"click", ()=> playersPanel.classList.remove("open"));

on(btnAttack, ()=> openModal("attack"));
on(btnBuild,  ()=> openModal("build"));
on(btnMarket, ()=> openModal("market"));
on(btnDip,    ()=> openModal("diplomacy"));
on(btnArmy,   ()=> openModal("army"));
on(btnLog,    ()=> openModal("log"));
on(btnSettings,()=> openModal("settings"));

/////////////////////////////
// 3) Hex map & rendering  //
/////////////////////////////
function axialToPixel(q, r, size){
  // pointy-top layout
  const x = size * (Math.sqrt(3)*q + Math.sqrt(3)/2 * r);
  const y = size * (3/2 * r);
  return {x, y};
}
function hexPath(x, y, size){
  const pts = [];
  for(let i=0;i<6;i++){
    const ang = Math.PI/180 * (60*i - 30);
    pts.push({ x: x + size * Math.cos(ang), y: y + size * Math.sin(ang) });
  }
  return pts;
}
function pathPolygon(pts){
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

function sizeCanvas(){
  const wrap = $("map-wrap");
  const dpr = window.devicePixelRatio || 1;
  const w = wrap.clientWidth;
  const h = Math.max(360, window.innerHeight - wrap.offsetTop - 140);
  mapCanvas.width  = Math.floor(w * dpr);
  mapCanvas.height = Math.floor(h * dpr);
  mapCanvas.style.width  = w + "px";
  mapCanvas.style.height = h + "px";
  ctx.setTransform(dpr,0,0,dpr,0,0);
  fitWorld();
  draw();
}

function fitWorld(){
  if(!world) return;
  const bounds = world.bounds; // {minX,maxX,minY,maxY}
  const pad = 24;
  const availW = mapCanvas.clientWidth - pad*2;
  const availH = mapCanvas.clientHeight - pad*2;
  const scaleX = availW / (bounds.maxX - bounds.minX);
  const scaleY = availH / (bounds.maxY - bounds.minY);
  scale = Math.min(scaleX, scaleY);
  const cx = (bounds.maxX + bounds.minX)/2;
  const cy = (bounds.maxY + bounds.minY)/2;
  offset.x = mapCanvas.clientWidth/2 - cx*scale;
  offset.y = mapCanvas.clientHeight/2 - cy*scale;
}

function worldToScreen(x,y){
  return { x: x*scale + offset.x, y: y*scale + offset.y };
}

function draw(){
  if(!world) return;
  ctx.fillStyle = "#0b121d";
  ctx.fillRect(0,0,mapCanvas.clientWidth,mapCanvas.clientHeight);

  // cells
  for(const c of world.cells){
    const P = worldToScreen(c.pos.x, c.pos.y);
    const pts = hexPath(P.x, P.y, world.size*scale - 0.7);

    // fill
    const color = c.owner ? state.players[c.owner].color : COLORS.neutral;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.92;
    pathPolygon(pts); ctx.fill();
    ctx.globalAlpha = 1;

    // border
    ctx.lineWidth = 1;
    ctx.strokeStyle = COLORS.stroke;
    pathPolygon(pts); ctx.stroke();

    // selection glow
    if(c.id === selectedId){
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#ffb757";
      pathPolygon(pts); ctx.stroke();
    }

    // label (soldiers)
    ctx.fillStyle = "#0b121d";
    ctx.globalAlpha = 0.25;
    pathPolygon(pts); ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = COLORS.text;
    ctx.font = `${Math.max(10, world.size*0.5)}px ui-sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(c.soldiers|0), P.x, P.y);

    // tiny flags for buildings
    const icons = [];
    if(c.barracks>0) icons.push("🛡️");
    if(c.factories>0) icons.push("🏭");
    if(c.refineries>0) icons.push("🛢️");
    if(c.mills>0) icons.push("🌾");
    if(c.castle>0) icons.push("🏰");
    if(icons.length){
      ctx.font = `${Math.max(9, world.size*0.38)}px ui-sans-serif`;
      ctx.fillText(icons.join(""), P.x, P.y + world.size*0.9);
    }
  }
}

function hitTest(px, py){
  // loop brute-force (cells ~140 max)
  for(const c of world.cells){
    const P = worldToScreen(c.pos.x, c.pos.y);
    const pts = hexPath(P.x, P.y, world.size*scale - 0.7);
    pathPolygon(pts);
    if(ctx.isPointInPath(px, py)) return c.id;
  }
  return null;
}

on(mapCanvas, "mousemove", (e)=>{
  const rect = mapCanvas.getBoundingClientRect();
  const id = hitTest(e.clientX - rect.left, e.clientY - rect.top);
  hoverId = id;
  if(tooltipsMode === "hover" && id!=null){
    const c = world.cells[id];
    const info = formatCellInfo(c);
    tooltipBox.style.display = "block";
    tooltipBox.style.left = e.clientX + "px";
    tooltipBox.style.top  = e.clientY + "px";
    tooltipBox.innerHTML = info;
  }else{
    tooltipBox.style.display = "none";
  }
});

on(mapCanvas, "click", (e)=>{
  const rect = mapCanvas.getBoundingClientRect();
  const id = hitTest(e.clientX - rect.left, e.clientY - rect.top);
  if(id==null) return;
  selectedId = id;
  syncSelectedUI();
  draw();
});

function syncSelectedUI(){
  const c = world.cells[selectedId];
  if(!c){ buildSelected.textContent = "Seçili Bölge: —"; attackTargetLabel.textContent = "— haritadan seç —"; return; }
  buildSelected.textContent = "Seçili Bölge: " + c.name;
  attackTargetLabel.textContent = c.name;
  updateCastleCostUI(c);
}

function formatCellInfo(c){
  const ownerName = c.owner!=null ? state.players[c.owner].name : "Boş";
  const effIncome = Math.floor(c.income * (1 + c.factories*EFFECT.factoryIncome));
  const effOil    = Math.floor(c.oil * (1 + c.refineries*EFFECT.refineryOil));
  const effWheat  = Math.floor(c.wheat * (1 + c.mills*EFFECT.millWheat));
  const castlePct = c.castle * EFFECT.castleStep;
  return `
    <div><strong>${c.name}</strong></div>
    <div>👑 Sahip: ${ownerName}</div>
    <div>💵 Gelir: ${effIncome}</div>
    <div>🪖 Asker: ${c.soldiers}</div>
    <div>🏛️ Kışla: ${c.barracks} · 🏭: ${c.factories} · 🛢️: ${c.refineries} · 🌾: ${c.mills}</div>
    <div>⛽ Petrol Ür.: ${effOil} · 🌾 Buğday Ür.: ${effWheat}</div>
    <div>🏰 Kale Gücü: ${c.castle? "%"+castlePct : "-"}</div>
  `;
}

/////////////////////////////////////
// 4) World generation (seeded)    //
/////////////////////////////////////
function makeWorld(seed, sizeKey){
  RNG = makeRNG(seed || "");
  const {w,h} = MAP_PRESETS[sizeKey];
  const size = HEX_SIZE_BASE; // logical; scaled later

  // Build axial grid
  const cells = [];
  let id = 0;
  const names = makeNames(w*h, RNG);
  const minX= {v: Infinity}, maxX={v:-Infinity}, minY={v:Infinity}, maxY={v:-Infinity};

  for(let r=0; r<h; r++){
    for(let q=0; q<w; q++){
      // jitter for variety
      const P = axialToPixel(q, r, size);
      const jx = (RNG()-0.5)*size*0.15;
      const jy = (RNG()-0.5)*size*0.15;
      const x = P.x + jx, y = P.y + jy;

      const c = {
        id: id++,
        name: names[id-1],
        q, r,
        pos: {x, y},
        owner: null,
        soldiers: 0,
        income:   100 + (RNG()*500|0),       // 100–600
        oil:      RNG()<0.35 ? (150 + (RNG()*350|0)) : 0,
        wheat:    RNG()<0.45 ? (200 + (RNG()*500|0)) : 0,
        barracks: 0, factories: 0, refineries:0, mills:0,
        castle: 0, // 0..6 (=>0..30%)
        castleNext: null, // cost
        neighbors: [],
      };
      cells.push(c);

      // bounds
      if(x<minX.v)minX.v=x; if(x>maxX.v)maxX.v=x;
      if(y<minY.v)minY.v=y; if(y>maxY.v)maxY.v=y;
    }
  }
  // neighbors within axial grid bounds
  for(const c of cells){
    for(const d of DIRS){
      const nq = c.q + d.q, nr = c.r + d.r;
      if(nq>=0 && nq<w && nr>=0 && nr<h){
        const nid = nr*w + nq;
        c.neighbors.push(nid);
      }
    }
  }
  return {
    cells, size,
    bounds: {minX:minX.v, maxX:maxX.v, minY:minY.v, maxY:maxY.v}
  };
}

function makeNames(n, rng){
  // silly placeholder names
  const A = ["Ara","Bel","Cora","Dion","Ery","Fara","Gala","Hera","Ily","Jora","Kara","Lysa","Mira","Nera","Orin","Pava","Qira","Rava","Sora","Tyra","Ura","Vena","Wyra","Xara","Yara","Zora"];
  const B = ["land","stan","polis","grad","tia","via","nia","ria","dor","gard","heim","shire"];
  const out=[];
  for(let i=0;i<n;i++){
    out.push(choice(A)+choice(B));
  }
  return out;
}

/////////////////////////////////////
// 5) Players & initial placement  //
/////////////////////////////////////
function makePlayer(name, color, isBot, diff="normal"){
  return {
    name, color, isBot, diff,
    money: isBot ? START.bot.money : START.human.money,
    oil:   isBot ? START.bot.oil   : START.human.oil,
    wheat: isBot ? START.bot.wheat : START.human.wheat,
    soldiers: isBot ? START.bot.soldiers : START.human.soldiers,
    cells: [], // owned cell ids
  };
}

function initGame({bots,diff,mapSize,color,turnSeconds,seed}){
  world = makeWorld(seed, mapSize);
  sizeCanvas();

  // Players
  const players = [];
  players.push( makePlayer("Sen", color, false, "human") );
  const botColors = genBotColors(bots, color);
  for(let i=0;i<bots;i++){
    const d = diff; // can vary per bot if you want
    players.push( makePlayer(`Bot ${i+1}`, botColors[i], true, d) );
  }

  // Start cells: each player 1 bölge + garnizon
  const free = shuffle(world.cells.filter(c=>c.owner===null).map(c=>c.id));
  for(let i=0;i<players.length;i++){
    const id = free[i];
    const cell = world.cells[id];
    cell.owner = i;
    cell.soldiers = 8 + (RNG()*5|0);
    players[i].cells.push(id);
  }

  // Game state
  state = {
    round: 1,
    current: 0, // player index
    players,
    market: { oil:[], wheat:[] }, // simple orderbooks
    pacts: [], // {a,b,expireRound}
    log: [],
    turnSeconds,
  };
  updateHUD();
  refreshPanels();
  buildPactTargetOptions();
  draw();
  gameRoot.classList.add("ready");
  startTurnTimer();
  toast("Oyun başladı. İlk sıra sende.");
  logEvent("Oyun başlatıldı.");
}

function genBotColors(n, humanColor){
  const out=[];
  for(let i=0;i<n;i++){
    // random pleasant colors
    let h = (RNG()*360)|0;
    let s = 60 + (RNG()*30|0);
    let l = 55 + (RNG()*10|0);
    out.push(`hsl(${h} ${s}% ${l}%)`);
  }
  // avoid humanColor collision: meh for now
  return out;
}

/////////////////////////////////////
// 6) Economy & building helpers   //
/////////////////////////////////////
function effIncome(cell){
  return Math.floor(cell.income * (1 + cell.factories*EFFECT.factoryIncome));
}
function effOilProd(cell){
  return Math.floor(cell.oil * (1 + cell.refineries*EFFECT.refineryOil));
}
function effWheatProd(cell){
  return Math.floor(cell.wheat * (1 + cell.mills*EFFECT.millWheat));
}
function castleNextCost(cell){
  if(cell.castle === 0) return { ...COST.castle };
  const step = cell.castleNext || {
    money: Math.floor(COST.castle.money  * Math.pow(COST.castleUpgradeMul, cell.castle-1)),
    oil:   Math.floor(COST.castle.oil    * Math.pow(COST.castleUpgradeMul, cell.castle-1)),
    wheat: Math.floor(COST.castle.wheat  * Math.pow(COST.castleUpgradeMul, cell.castle-1)),
  };
  return step;
}
function updateCastleCostUI(cell){
  if(!cell){ castleUpgradeCostEl.textContent="Sonraki maliyet: —"; return; }
  if(cell.castle>=6){ castleUpgradeCostEl.textContent="Maks seviye (%30)"; return; }
  const c = castleNextCost(cell);
  castleUpgradeCostEl.textContent = `Sonraki maliyet: ${c.money}$ + ${c.oil}⛽ + ${c.wheat}🌾`;
}

function spend(p, cost){
  if(p.money < (cost.money||0)) return false;
  if(p.oil   < (cost.oil||0))   return false;
  if(p.wheat < (cost.wheat||0)) return false;
  p.money -= (cost.money||0);
  p.oil   -= (cost.oil||0);
  p.wheat -= (cost.wheat||0);
  return true;
}

/////////////////////////////////////
// 7) Turn flow & timer            //
/////////////////////////////////////
function isMyTurn(){
  return state && state.players[state.current] && !state.players[state.current].isBot;
}

function startTurnTimer(){
  clearInterval(turnTimer);
  remaining = Number(state.turnSeconds || 60);
  hud.timer.textContent = remaining + "s";
  turnTimer = setInterval(()=>{
    remaining--;
    if(remaining<=0){
      clearInterval(turnTimer);
      hud.timer.textContent = "0s";
      endTurn(true);
    }else{
      hud.timer.textContent = remaining + "s";
    }
  },1000);
}

function endTurn(auto=false){
  // resolve end-of-turn income for current player
  const p = state.players[state.current];
  // barracks produce soldiers, add income & wheat
  let addMoney=0, addWheat=0;
  for(const id of p.cells){
    const c = world.cells[id];
    c.soldiers += c.barracks * EFFECT.barracksSoldiers;
    addMoney += effIncome(c);
    if(c.wheat>0) addWheat += effWheatProd(c);
  }
  p.money += addMoney;
  p.wheat += addWheat;

  // pacts expiry
  state.pacts = state.pacts.filter(pk => state.round <= pk.expireRound);

  logEvent(`${p.name} tur sonu: +$${addMoney}, +🌾${addWheat}.`);
  if(auto) toast(`${p.name} süresi doldu, tur sonlandırıldı.`);

  // next player
  state.current = (state.current + 1) % state.players.length;
  if(state.current === 0) {
    state.round++;
  }
  updateHUD();
  refreshPanels();
  draw();

  // Next actor
  const n = state.players[state.current];
  if(n.isBot){
    setTimeout(()=> botPlay(state.current), 450);
  }else{
    toast(`Sıra sende.`);
    startTurnTimer();
  }
}

on(btnEnd,"click", ()=> {
  if(!isMyTurn()) return toast("Sıran değil.");
  endTurn(false);
});

function updateHUD(){
  hud.round.textContent   = state.round;
  hud.current.textContent = state.players[state.current].name;
  hud.bots.textContent    = state.players.filter(p=>p.isBot).length;
  const me = state.players[0]; // human at index 0
  hud.oil.textContent   = me.oil;
  hud.wheat.textContent = me.wheat;
  hud.money.textContent = me.money;
}

function refreshPanels(){
  playersList.innerHTML = "";
  state.players.forEach((p,idx)=>{
    const div = document.createElement("div");
    div.className = "player-card";
    div.innerHTML = `
      <div class="avatar" style="background:${p.color}"></div>
      <div>
        <div><strong>${p.name}</strong>${idx===state.current?' • <span style="color:#ffb757">Sıra</span>':''}</div>
        <div>💵 ${p.money} &nbsp; ⛽ ${p.oil} &nbsp; 🌾 ${p.wheat} &nbsp; 🪖 ${p.soldiers}</div>
        <div>Ülke: ${p.cells.length}</div>
      </div>
    `;
    playersList.appendChild(div);
  });

  // army list (human)
  armyList.innerHTML = "";
  const human = state.players[0];
  human.cells.slice().sort((a,b)=> world.cells[a].name.localeCompare(world.cells[b].name)).forEach(id=>{
    const c = world.cells[id];
    const row = document.createElement("div");
    row.textContent = `${c.name} — 🪖 ${c.soldiers}`;
    armyList.appendChild(row);
  });

  // pacts list
  pactsList.innerHTML = "";
  state.pacts.forEach(pk=>{
    if(pk.a===0 || pk.b===0){
      const other = pk.a===0 ? pk.b : pk.a;
      const row = document.createElement("div");
      row.textContent = `🤝 ${state.players[other].name} • kalan tur: ${pk.expireRound - state.round + 1}`;
      pactsList.appendChild(row);
    }
  });

  // orders list
  renderOrders();
}

/////////////////////////////
// 8) Attack & movement    //
/////////////////////////////
function findBestSource(targetId, attackerIdx){
  const t = world.cells[targetId];
  let best = null, bestSold = -1;
  for(const nid of t.neighbors){
    const c = world.cells[nid];
    if(c.owner===attackerIdx && c.soldiers>bestSold){
      best = c; bestSold = c.soldiers;
    }
  }
  return best;
}
function areNeighbors(aId,bId){
  return world.cells[aId].neighbors.includes(bId);
}
function hasPact(a,b){
  return state.pacts.some(pk => ((pk.a===a && pk.b===b)||(pk.a===b && pk.b===a)) && state.round<=pk.expireRound);
}

on(doAttackBtn, "click", ()=>{
  if(!isMyTurn()) return toast("Sıran değil.");
  if(selectedId==null) return toast("Hedef bölge seç.");
  const t = world.cells[selectedId];
  if(t.owner===0) return toast("Kendi bölgen zaten.");
  // must be adjacent to any owned cell
  const src = findBestSource(selectedId, 0);
  if(!src) return toast("Hedefe komşu bir birliğin yok.");
  let n = Number(attackUnits.value||0);
  if(n<=0) return toast("Geçerli asker sayısı gir.");
  if(n>src.soldiers) n = src.soldiers;

  const plan = attackPlan.value; // normal|blitz|cautious
  const oilCostMul = plan==="blitz" ? 1.2 : 1.0;
  const lossMul    = plan==="cautious" ? 0.85 : 1.0;

  const me = state.players[0];
  const oilNeed = Math.ceil(n * oilCostMul);
  if(me.oil < oilNeed) return toast(`Yeterli petrol yok (gerekli: ${oilNeed}).`);

  // pacts?
  if(t.owner!=null && hasPact(0, t.owner)) return toast("Bu oyuncu ile saldırmazlık paktı var.");

  // resolve
  me.oil -= oilNeed;
  src.soldiers -= n;

  // castle damage
  let effAttack = n;
  if(t.castle>0){
    const kill = Math.floor(effAttack * (t.castle*EFFECT.castleStep)/100);
    effAttack = Math.max(0, effAttack - kill);
    logEvent(`Kale savunması: ${kill} saldıran asker öldü.`);
  }

  // compare
  const defender = t.soldiers;
  const adjustedAtk = Math.round(effAttack * (plan==="blitz"?1.15:1.0) * lossMul);
  if(adjustedAtk > defender){
    // capture
    const rem = adjustedAtk - defender;
    const prev = t.owner;
    t.owner = 0;
    t.soldiers = rem;

    if(prev!=null){
      state.players[prev].cells = state.players[prev].cells.filter(x=>x!==t.id);
    }
    if(!state.players[0].cells.includes(t.id)) state.players[0].cells.push(t.id);

    // immediate oil reward from all owned oil tiles
    const totalOil = state.players[0].cells.reduce((sum,id)=>{
      const c = world.cells[id];
      return sum + (c.oil>0 ? effOilProd(c):0);
    },0);
    state.players[0].oil += totalOil;
    toast(`Fetih! +⛽${totalOil}`);
    logEvent(`Sen → ${t.name}: fethedildi.`);
  }else{
    // fail
    t.soldiers -= adjustedAtk;
    logEvent(`Sen → ${t.name}: savunuldu.`);
  }

  updateHUD(); refreshPanels(); draw();
});

/////////////////////////////
// 9) Buildings            //
/////////////////////////////
function requireOwnedSelected(){
  const c = world.cells[selectedId||-1];
  if(!c) { toast("Bölge seç."); return null; }
  if(c.owner!==0){ toast("Bu bölge sana ait değil."); return null; }
  return c;
}

on(btnBuildBarracks,"click", ()=>{
  const c = requireOwnedSelected(); if(!c) return;
  const q = Number($("barracks-q").value||0); if(q<=0) return;
  const cost = { money:COST.barracks.money*q, oil:COST.barracks.oil*q, wheat:COST.barracks.wheat*q };
  if(!spend(state.players[0], cost)) return toast("Kaynak yetersiz.");
  c.barracks += q;
  logEvent(`Bina: ${c.name} → +${q} Kışla`);
  updateHUD(); refreshPanels(); draw();
});

on(btnBuildFactory,"click", ()=>{
  const c = requireOwnedSelected(); if(!c) return;
  const q = Number($("factory-q").value||0); if(q<=0) return;
  const cost = { money:COST.factory.money*q, oil:COST.factory.oil*q };
  if(!spend(state.players[0], cost)) return toast("Kaynak yetersiz.");
  c.factories += q;
  logEvent(`Bina: ${c.name} → +${q} Fabrika`);
  updateHUD(); refreshPanels(); draw();
});

on(btnBuildRefinery,"click", ()=>{
  const c = requireOwnedSelected(); if(!c) return;
  const q = Number($("refinery-q").value||0); if(q<=0) return;
  const cost = { money:COST.refinery.money*q, oil:COST.refinery.oil*q };
  if(!spend(state.players[0], cost)) return toast("Kaynak yetersiz.");
  c.refineries += q;
  logEvent(`Bina: ${c.name} → +${q} Rafineri`);
  updateHUD(); refreshPanels(); draw();
});

on(btnBuildMill,"click", ()=>{
  const c = requireOwnedSelected(); if(!c) return;
  const q = Number($("mill-q").value||0); if(q<=0) return;
  const cost = { money:COST.mill.money*q, oil:COST.mill.oil*q };
  if(!spend(state.players[0], cost)) return toast("Kaynak yetersiz.");
  c.mills += q;
  logEvent(`Bina: ${c.name} → +${q} Değirmen`);
  updateHUD(); refreshPanels(); draw();
});

on(btnBuildCastle,"click", ()=>{
  const c = requireOwnedSelected(); if(!c) return;
  if(c.castle>0) return toast("Bu bölgede zaten kale var.");
  const ok = spend(state.players[0], COST.castle);
  if(!ok) return toast("Kaynak yetersiz.");
  c.castle = 1;
  c.castleNext = { money:1300, oil:1300, wheat:1300 };
  logEvent(`Bina: ${c.name} → Kale (%%${EFFECT.castleStep})`);
  updateCastleCostUI(c); updateHUD(); refreshPanels(); draw();
});

on(btnUpgradeCastle,"click", ()=>{
  const c = requireOwnedSelected(); if(!c) return;
  if(c.castle<1) return toast("Önce kale kur.");
  if(c.castle>=6) return toast("Maks seviye.");
  const cost = castleNextCost(c);
  if(!spend(state.players[0], cost)) return toast("Kaynak yetersiz.");
  c.castle++;
  c.castleNext = {
    money: Math.floor(cost.money*COST.castleUpgradeMul),
    oil:   Math.floor(cost.oil*COST.castleUpgradeMul),
    wheat: Math.floor(cost.wheat*COST.castleUpgradeMul),
  };
  logEvent(`Kale: ${c.name} seviye ${c.castle} (%%${c.castle*EFFECT.castleStep})`);
  updateCastleCostUI(c); updateHUD(); refreshPanels(); draw();
});

/////////////////////////////
// 10) Army (buy / pull)   //
/////////////////////////////
on(btnBuySoldiers,"click", ()=>{
  if(!isMyTurn()) return toast("Sıran değil.");
  const n = Number(buySoldiersInput.value||0); if(n<=0) return;
  const cost = { money: COST.soldierMoney*n, wheat: COST.soldierWheat*n };
  const me = state.players[0];
  if(!spend(me, cost)) return toast("Kaynak yetersiz.");
  me.soldiers += n;
  logEvent(`Satın alım: +${n} asker`);
  updateHUD(); refreshPanels();
});

on(btnPull,"click", ()=>{
  if(!isMyTurn()) return toast("Sıran değil.");
  const c = requireOwnedSelected(); if(!c) return;
  let n = Number(pullCount.value||0); if(n<=0) return;
  if(n>c.soldiers) n=c.soldiers;
  c.soldiers -= n;
  state.players[0].soldiers += n;
  logEvent(`Asker çekildi: ${c.name} → ${n}`);
  updateHUD(); refreshPanels(); draw();
});

/////////////////////////////
// 11) Diplomacy (pacts)   //
/////////////////////////////
function buildPactTargetOptions(){
  dipTarget.innerHTML = "";
  state.players.forEach((p,idx)=>{
    if(idx===0) return;
    const opt = document.createElement("option");
    opt.value = idx; opt.textContent = p.name;
    dipTarget.appendChild(opt);
  });
}
on(btnSendPact, "click", ()=>{
  if(!isMyTurn()) return toast("Sıran değil.");
  const b = Number(dipTarget.value);
  const dur = clamp(Number(dipDuration.value||0),1,20);
  const cost = clamp(Number(dipCost.value||0),0,1e9);
  if(isNaN(b)) return toast("Bot seç.");
  // already
  if(hasPact(0,b)) return toast("Zaten aktif pakt var.");
  const me = state.players[0];
  if(me.money < cost) return toast("Yeterli paran yok.");

  // Bot kabul mantığı (basit): teklif oranı vs round
  const bot = state.players[b];
  const base = {easy: 0.5, normal: 0.6, hard:0.7, insane:0.8}[bot.diff] || 0.6;
  const desire = base - (bot.cells.length - me.cells.length)*0.03 + (cost/(300*dur))*0.3;
  const accept = RNG() < clamp(desire, 0.15, 0.95);

  if(accept){
    me.money -= cost; bot.money += cost;
    state.pacts.push({a:0,b,expireRound: state.round + dur});
    toast(`Pakt kabul edildi: ${bot.name} (${dur} tur)`);
    logEvent(`Pakt: Sen & ${bot.name} (${dur} tur).`);
  }else{
    toast(`${bot.name} paktı reddetti.`);
    logEvent(`Pakt reddedildi: ${bot.name}`);
  }
  refreshPanels(); updateHUD();
});

/////////////////////////////
// 12) Market (simple)     //
/////////////////////////////
function renderOrders(){
  ordersList.innerHTML = "";
  ["oil","wheat"].forEach(sym=>{
    const sideBuy = state.market[sym].filter(o=>o.side==="buy").length;
    const sideSell= state.market[sym].filter(o=>o.side==="sell").length;
    const row = document.createElement("div");
    row.textContent = `${sym==="oil"?"⛽ Petrol":"🌾 Buğday"} — Alım ${sideBuy} / Satım ${sideSell}`;
    ordersList.appendChild(row);
  });
}

on(marketPlace,"click", ()=>{
  if(!isMyTurn()) return toast("Sıran değil.");
  const sym = marketItem.value; // oil|wheat
  const side = marketSide.value; // buy|sell
  let qty = clamp(Number(marketAmount.value||0), 1, 999999);
  const price = clamp(Number(marketPrice.value||0), 1, 999999);
  const me = state.players[0];

  if(side==="sell"){
    if(sym==="oil" && me.oil<qty) return toast("Yeterli petrol yok.");
    if(sym==="wheat" && me.wheat<qty) return toast("Yeterli buğday yok.");
  }
  if(side==="buy"){
    if(me.money < qty*price) return toast("Yeterli para yok.");
  }

  // match against best opposing
  const book = state.market[sym];
  const opp = side==="buy" ? "sell" : "buy";

  const bestMatch = book
    .filter(o=>o.side===opp && (side==="buy" ? o.price<=price : o.price>=price))
    .sort((a,b)=> side==="buy" ? a.price-b.price : b.price-a.price);

  let remainingQty = qty;
  for(const o of bestMatch){
    if(remainingQty<=0) break;
    const tradeQty = Math.min(remainingQty, o.qty);
    // transfer
    if(side==="buy"){
      me.money -= tradeQty*o.price;
      if(sym==="oil") me.oil += tradeQty; else me.wheat += tradeQty;
      const seller = state.players[o.owner];
      seller.money += tradeQty*o.price;
      if(sym==="oil") seller.oil -= tradeQty; else seller.wheat -= tradeQty;
    }else{
      // sell
      me.money += tradeQty*o.price;
      if(sym==="oil") me.oil -= tradeQty; else me.wheat -= tradeQty;
      const buyer = state.players[o.owner];
      buyer.money -= tradeQty*o.price;
      if(sym==="oil") buyer.oil += tradeQty; else buyer.wheat += tradeQty;
    }
    o.qty -= tradeQty;
    remainingQty -= tradeQty;
  }
  // remove filled
  state.market[sym] = book.filter(o=>o.qty>0);

  // leftover becomes order
  if(remainingQty>0){
    // reserve assets for sell; reserve money for buy
    if(side==="sell"){
      if(sym==="oil") me.oil -= remainingQty; else me.wheat -= remainingQty;
    }else{
      me.money -= remainingQty*price;
    }
    book.push({ owner:0, side, qty:remainingQty, price });
  }
  logEvent(`Piyasa: ${side==="buy"?"Al":"Sat"} ${qty} ${sym} @${price}`);
  updateHUD(); refreshPanels(); toast("Emir işlendi.");
});

/////////////////////////////
// 13) AI Bots             //
/////////////////////////////
function botPlay(idx){
  const bot = state.players[idx];
  // Simple plan:
  // 1) If soldiers in pool + garrison low: buy soldiers if possible
  buySoldiersBot(bot);

  // 2) Build priorities
  buildBot(bot);

  // 3) Attack: pick frontier target (neutral first, then weak enemy)
  attackBot(idx);

  // 4) Maybe market random action
  marketBot(bot);

  // End turn
  endTurn(false);
}

function buySoldiersBot(bot){
  const want = 6 + (RNG()*10|0);
  const totalCost = COST.soldierMoney*want + COST.soldierWheat*want;
  if(bot.money >= COST.soldierMoney*want && bot.wheat >= COST.soldierWheat*want){
    bot.money -= COST.soldierMoney*want;
    bot.wheat -= COST.soldierWheat*want;
    bot.soldiers += want;
    logEvent(`${bot.name}: ${want} asker satın aldı.`);
  }
}

function buildBot(bot){
  // choose a owned cell with relevant production
  const cells = bot.cells.map(id=>world.cells[id]);
  shuffle(cells);

  for(const c of cells){
    // high oil => refinery, high wheat => mill, else factory/barracks
    if(c.oil>0 && bot.money>=COST.refinery.money && bot.oil>=COST.refinery.oil){
      bot.money-=COST.refinery.money; bot.oil-=COST.refinery.oil; c.refineries++; return;
    }
    if(c.wheat>0 && bot.money>=COST.mill.money && bot.oil>=COST.mill.oil){
      bot.money-=COST.mill.money; bot.oil-=COST.mill.oil; c.mills++; return;
    }
    if(bot.money>=COST.factory.money && bot.oil>=COST.factory.oil){
      bot.money-=COST.factory.money; bot.oil-=COST.factory.oil; c.factories++; return;
    }
    if(bot.money>=COST.barracks.money && bot.oil>=COST.barracks.oil && bot.wheat>=COST.barracks.wheat){
      bot.money-=COST.barracks.money; bot.oil-=COST.barracks.oil; bot.wheat-=COST.barracks.wheat; c.barracks++; return;
    }
  }
}

function attackBot(idx){
  const bot = state.players[idx];
  // source cell with most soldiers
  const srcId = bot.cells.slice().sort((a,b)=> world.cells[b].soldiers - world.cells[a].soldiers)[0];
  const src = world.cells[srcId];
  if(!src || src.soldiers<4 || bot.oil<4) return;

  // frontier targets (neighbors not owned by bot)
  const targets = src.neighbors
    .map(id=>world.cells[id])
    .filter(c => c.owner!==idx && !hasPact(idx, c.owner ?? -999));

  if(!targets.length) return;

  // prefer neutral, else weakest
  let t = targets.filter(x=>x.owner==null)[0];
  if(!t){
    t = targets.sort((a,b)=> a.soldiers - b.soldiers)[0];
  }

  let send = Math.min(src.soldiers-1, 6 + (RNG()*6|0));
  send = Math.min(send, bot.oil); if(send<=0) return;
  src.soldiers -= send; bot.oil -= send;

  // castle damage on target
  let atk = send;
  if(t.castle>0){
    const kill = Math.floor(atk * (t.castle*EFFECT.castleStep)/100);
    atk = Math.max(0, atk - kill);
  }

  if(atk > t.soldiers){
    const rem = atk - t.soldiers;
    const prev = t.owner;
    t.owner = idx; t.soldiers = rem;
    if(prev!=null){
      state.players[prev].cells = state.players[prev].cells.filter(x=>x!==t.id);
    }
    if(!bot.cells.includes(t.id)) bot.cells.push(t.id);
    logEvent(`${bot.name} → ${t.name}: fethedildi.`);
  }else{
    t.soldiers -= atk;
    logEvent(`${bot.name} → ${t.name}: savunuldu.`);
  }
}

function marketBot(bot){
  if(RNG()<0.5) return;
  // sell wheat for money sometimes
  if(bot.wheat>200){
    const qty = 50 + (RNG()*50|0);
    bot.wheat -= qty; bot.money += qty * 8; // rough price
    logEvent(`${bot.name} piyasada ${qty} buğday sattı.`);
  }
}

/////////////////////////////
// 14) Start & Settings    //
/////////////////////////////
on(btnStart,"click", ()=>{
  const bots = clamp(Number(botCountInput.value||3), 1, 7);
  const diff = difficultySel.value;
  const mapSize = mapSizeSel.value;
  const color = playerColorInp.value || "#3cf3c4";
  const turnSeconds = Number(turnSecondsSel.value||60);
  const seed = seedInput.value || `${mapSize}-${bots}-${diff}`;

  // tooltips/anim defaults
  tooltipsMode = optTooltips.value;
  animsOn = optAnims.value==="on";

  startScreen.classList.add("hidden");
  initGame({bots,diff,mapSize,color,turnSeconds,seed});
});

on(btnHowto,"click", ()=>{
  toast("Haritadan bölge seç → Saldırı/Bina/Ordu işlemlerini modallardan yap. Sadece komşu bölgelere saldırılabilir.");
});

on(optTooltips,"change", ()=>{
  tooltipsMode = optTooltips.value;
  if(tooltipsMode!=="hover") tooltipBox.style.display = "none";
});
on(optAnims,"change", ()=> animsOn = optAnims.value==="on");
on(btnReset,"click", ()=>{
  location.reload();
});

/////////////////////////////
// 15) Resize & init       //
/////////////////////////////
window.addEventListener("resize", sizeCanvas);
sizeCanvas(); // before world created—safe

// END OF FILE
