/******************************************************
 * Global Conquest - gameLogic.js (HTML ile uyumlu)
 * Bölüm 1/3
 ******************************************************/

/* ================== 0) Firebase ================== */
const firebaseConfig = {
  apiKey: "AIzaSyCINihMNGs-qRYIIBLzXyeaLnM_Lhp-iwg",
  authDomain: "warmapg-77acb.firebaseapp.com",
  databaseURL: "https://warmapg-77acb-default-rtdb.firebaseio.com",
  projectId: "warmapg-77acb",
  storageBucket: "warmapg-77acb.appspot.com",
  messagingSenderId: "895613631339",
  appId: "1:895613631339:web:a7ecc0cfd8ab3ae7e02a2e",
  measurementId: "G-6SJVLLVDCF"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.database();

/* ================== 1) Global State ================== */
let currentUser = null;
let currentUserData = null;
let currentRoomId = null;
let roomRef = null, roomData = null;
let isSpectator = false;

let map=null, geoJsonLayer=null, infoCardsPermanent=false, selectedCountry=null;
let turnTimerInterval=null, turnTimeRemaining=60, startInterval=null;

let notificationsMuted=false, unreadMessages=0, chatOpen=false;

let flagCanvas, flagCtx, isDrawing=false, isErasing=false, brushColor="#ff0000", brushSize=6;

/* ================== 2) DOM refs ================== */
const authContainer   = document.getElementById("auth-container");
const lobbyContainer  = document.getElementById("lobby-container");
const gameContainer   = document.getElementById("game-container");

const displayRoomName = document.getElementById("display-room-name");
const displayRoomCode = document.getElementById("display-room-code");
const currentRoundEl  = document.getElementById("current-round");
const currentPlayerEl = document.getElementById("current-player");
const startBtn        = document.getElementById("start-game-btn");
const startCountdown  = document.getElementById("start-countdown");
const endTurnBtn      = document.getElementById("end-turn-btn");
const turnTimerEl     = document.getElementById("turn-timer");
const notifArea       = document.getElementById("notification-area");

/* ================== 3) Helpers ================== */
const uid = () => firebase.database().ref().push().key;
const now = () => Date.now();
const clamp = (n,a,b)=>Math.max(a,Math.min(b,n));
function show(el){ if(el) el.style.display="block"; }
function hide(el){ if(el) el.style.display="none"; }
function flex(el){ if(el) el.style.display="flex"; }

function setBodyLobbyBG(on){ document.body.classList.toggle("lobby-bg", !!on); }

function showAuth(){ show(authContainer); hide(lobbyContainer); hide(gameContainer); setBodyLobbyBG(false); }
function showLobby(){ hide(authContainer); show(lobbyContainer); hide(gameContainer); setBodyLobbyBG(true); }
function showGame(){ hide(authContainer); hide(lobbyContainer); show(gameContainer); setBodyLobbyBG(false); }

function toast(msg, duration=3200){
  if(notificationsMuted) return;
  const item=document.createElement("div");
  item.className="notification-item"; item.textContent=msg;
  notifArea.appendChild(item);
  setTimeout(()=>{ if(notifArea.contains(item)) notifArea.removeChild(item); }, duration+700);
}

function randRoomCode(n=6){
  const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s=""; for(let i=0;i<n;i++) s+=chars[Math.floor(Math.random()*chars.length)];
  return s;
}

function colorDots(containerId, onSelect){
  const colors=["#ff6b6b","#ffd93d","#6bff95","#64ffda","#00c9ff","#7ea1ff","#b17dff","#ff8ad8","#ffa46b","#b8f27c"];
  const el=document.getElementById(containerId); el.innerHTML="";
  colors.forEach(c=>{
    const d=document.createElement("div");
    d.className="global-color-option"; d.style.background=c;
    d.addEventListener("click",()=>{
      el.querySelectorAll(".global-color-option").forEach(e=>e.classList.remove("selected"));
      d.classList.add("selected"); onSelect(c);
    });
    el.appendChild(d);
  });
  const first=el.querySelector(".global-color-option");
  if(first){ first.classList.add("selected"); onSelect(colors[0]); }
}

function currency(n){ return (n||0).toLocaleString("tr-TR"); }

/* ================== 4) Auth ================== */
let authMode="login";
const toggleAuth = document.getElementById("toggle-auth");
const authTitle  = document.getElementById("auth-title");
const loginBox   = document.getElementById("auth-login-fields");
const regBox     = document.getElementById("auth-register-fields");
const authBtn    = document.getElementById("auth-action-btn");
const googleBtn  = document.getElementById("auth-google-btn");

toggleAuth.addEventListener("click", ()=>{
  if(authMode==="login"){
    authMode="register";
    authTitle.textContent="Kayıt Ol";
    hide(loginBox); show(regBox);
    authBtn.innerHTML='<i class="fa-solid fa-user-plus"></i><span>Kayıt Ol</span>';
    toggleAuth.innerHTML="Zaten hesabın var mı? <strong>Giriş Yap</strong>";
  }else{
    authMode="login";
    authTitle.textContent="Giriş Yap";
    show(loginBox); hide(regBox);
    authBtn.innerHTML='<i class="fa-solid fa-right-to-bracket"></i><span>Giriş Yap</span>';
    toggleAuth.innerHTML="Hesabın yok mu? <strong>Kayıt Ol</strong>";
  }
});
/* ================== 4.1) Auth Actions ================== */
authBtn.addEventListener("click", async () => {
  try{
    if(authMode==="login"){
      const email = document.getElementById("auth-email").value.trim();
      const pass  = document.getElementById("auth-password").value.trim();
      if(!email || !pass) return toast("Lütfen email ve şifre girin.");
      await auth.signInWithEmailAndPassword(email, pass);
      toast("Giriş başarılı!");
    }else{
      const displayName = document.getElementById("auth-displayName").value.trim();
      const email = document.getElementById("auth-email-reg").value.trim();
      const pass  = document.getElementById("auth-password-reg").value.trim();
      const pass2 = document.getElementById("auth-passwordConfirm").value.trim();
      if(!displayName || !email || !pass || !pass2) return toast("Lütfen tüm alanları doldurun.");
      if(pass!==pass2) return toast("Şifreler eşleşmiyor.");
      const cred = await auth.createUserWithEmailAndPassword(email, pass);
      const uid = cred.user.uid;
      await db.ref("users/"+uid).set({
        email, displayName, online:true, createdAt: firebase.database.ServerValue.TIMESTAMP,
        flag:"", friends:{}, friendRequests:{}, roomInvites:{}
      });
      toast("Kayıt başarılı, giriş yapıldı!");
    }
  }catch(err){
    toast("Hata: "+(err?.message||err));
  }
});

googleBtn.addEventListener("click", async ()=>{
  try{
    const provider = new firebase.auth.GoogleAuthProvider();
    const cred = await auth.signInWithPopup(provider);
    const u = cred.user;
    const snap = await db.ref("users/"+u.uid).once("value");
    if(!snap.exists()){
      await db.ref("users/"+u.uid).set({
        email: u.email || "", displayName: u.displayName || (u.email?u.email.split("@")[0]:"Oyuncu"),
        online:true, createdAt: firebase.database.ServerValue.TIMESTAMP,
        flag:"", friends:{}, friendRequests:{}, roomInvites:{}
      });
    }else{
      await db.ref("users/"+u.uid+"/online").set(true);
    }
    toast("Google ile giriş yapıldı!");
  }catch(err){
    toast("Google hata: "+(err?.message||err));
  }
});

/* ================== 4.2) Auth State ================== */
auth.onAuthStateChanged(async (user)=>{
  if(user){
    currentUser = user;
    // online presence
    const onlineRef = db.ref("users/"+user.uid+"/online");
    onlineRef.set(true); onlineRef.onDisconnect().set(false);

    // load profile
    const uSnap = await db.ref("users/"+user.uid).once("value");
    currentUserData = uSnap.val() || {};
    // UI: profil popup üst kısmını beslemek (bayrak/isim/email)
    const profName = document.getElementById("profile-username");
    const profMail = document.getElementById("profile-email");
    const profFlag = document.getElementById("profile-flag");
    if(profName) profName.textContent = currentUserData.displayName || (user.email? user.email.split("@")[0]:"Oyuncu");
    if(profMail) profMail.textContent = user.email || "";
    if(profFlag && currentUserData.flag){
      profFlag.innerHTML = `<img src="${currentUserData.flag}" alt="flag" style="width:100%;height:100%;object-fit:cover">`;
    }else if(profFlag){ profFlag.innerHTML=""; }

    // Lobiye geç
    showLobby();
    setupLobbyUI();
    loadActiveRooms(); // list watcher
  }else{
    currentUser = null;
    currentUserData = null;
    showAuth();
  }
});

/* Çıkış (profil popup butonu HTML'de) */
document.getElementById("profile-logout-btn").addEventListener("click", async ()=>{
  try{
    if(currentUser) await db.ref("users/"+currentUser.uid+"/online").set(false);
    await auth.signOut();
    toast("Çıkış yapıldı.");
  }catch(e){ toast("Çıkış hatası: "+(e?.message||e)); }
});

/* ================== 5) Lobby ================== */
let creatorColor="#64ffda", joinColor="#64ffda";
function setupLobbyUI(){
  colorDots("creator-color-options", c=>creatorColor=c);
  colorDots("join-color-options", c=>joinColor=c);
}

document.getElementById("edit-flag-btn").addEventListener("click", ()=>{
  initFlagCanvas();
  flex(document.getElementById("flag-editor-popup"));
});
document.getElementById("profile-edit-flag-btn").addEventListener("click", ()=>{
  initFlagCanvas();
  flex(document.getElementById("flag-editor-popup"));
});

/* ---- Oda Oluştur ---- */
document.getElementById("create-room-btn").addEventListener("click", async ()=>{
  try{
    if(!currentUser) return toast("Önce giriş yapın.");
    const roomName = (document.getElementById("creator-player-name").value || "").trim() || (currentUserData.displayName+"'ın Odası");
    const maxPlayers = clamp(parseInt(document.getElementById("max-players").value)||4, 2, 8);

    const roomId = db.ref("rooms").push().key;
    const code   = randRoomCode(6);

    const hostPlayer = {
      name: currentUserData.displayName || "Oyuncu",
      color: creatorColor,
      money: 1000, soldiers: 0, petrol: 100, wheat: 400,
      countries: [], joinedAt: firebase.database.ServerValue.TIMESTAMP,
      isHost:true, flag: currentUserData.flag || ""
    };

    const roomObj = {
      roomId, name: roomName, code, maxPlayers,
      gameState: "waiting",
      currentTurnIndex: 0,
      round: 1,
      playerOrder: [currentUser.uid],
      players: { [currentUser.uid]: hostPlayer },
      watchers: {},
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      hostUid: currentUser.uid
    };

    await db.ref("rooms/"+roomId).set(roomObj);
    await initializeCountryData(roomId);

    toast("Oda oluşturuldu: "+roomName+" (Kod: "+code+")");
    // Direkt odaya gir
    isSpectator=false;
    enterRoom(roomId);
  }catch(err){
    toast("Oda oluşturma hatası: "+(err?.message||err));
  }
});

/* ---- Odaya Katıl ---- */
document.getElementById("join-room-btn").addEventListener("click", async ()=>{
  try{
    const code = (document.getElementById("room-code").value||"").trim().toUpperCase();
    if(!code) return toast("Oda kodu girin.");
    // kod ile oda bul
    const snap = await db.ref("rooms").orderByChild("code").equalTo(code).once("value");
    if(!snap.exists()) return toast("Oda bulunamadı.");
    let roomId=null, room=null;
    snap.forEach(child=>{ roomId = child.key; room = child.val(); });

    if(room.gameState!=="waiting" && room.gameState!=="starting")
      return toast("Oyun başlamış/bitti. Katılım kapalı.");

    const playersCount = room.players?Object.keys(room.players).length:0;
    if(playersCount >= (room.maxPlayers||8)) return toast("Oda dolu.");

    if(room.players && room.players[currentUser.uid]){
      // zaten ekli
    }else{
      const newPlayer = {
        name: (document.getElementById("join-player-name").value||"").trim() || (currentUserData.displayName||"Oyuncu"),
        color: joinColor,
        money: 1000, soldiers: 0, petrol: 100, wheat: 400,
        countries: [], joinedAt: firebase.database.ServerValue.TIMESTAMP,
        isHost:false, flag: currentUserData.flag || ""
      };
      const updates = {};
      updates[`rooms/${roomId}/players/${currentUser.uid}`]=newPlayer;
      const order = room.playerOrder||[]; order.push(currentUser.uid);
      updates[`rooms/${roomId}/playerOrder`]=order;
      await db.ref().update(updates);
    }

    toast("Odaya katılıyorsunuz…");
    isSpectator=false;
    enterRoom(roomId);
  }catch(err){
    toast("Katılma hatası: "+(err?.message||err));
  }
});

/* ---- İzleyici olarak gir ---- */
document.getElementById("watch-room-btn").addEventListener("click", async ()=>{
  try{
    const code = (document.getElementById("room-code").value||"").trim().toUpperCase();
    if(!code) return toast("Oda kodu girin.");
    const snap = await db.ref("rooms").orderByChild("code").equalTo(code).once("value");
    if(!snap.exists()) return toast("Oda bulunamadı.");
    let roomId=null, room=null;
    snap.forEach(child=>{ roomId = child.key; room = child.val(); });

    await db.ref(`rooms/${roomId}/watchers/${currentUser.uid}`).set({
      name: currentUserData.displayName||"Seyirci", joinedAt: firebase.database.ServerValue.TIMESTAMP
    });

    toast("İzleyici olarak giriş yapılıyor…");
    isSpectator=true;
    enterRoom(roomId);
  }catch(err){
    toast("İzleyici hatası: "+(err?.message||err));
  }
});

/* ---- Aktif Odalar ---- */
function loadActiveRooms(){
  const list = document.getElementById("active-rooms-list");
  db.ref("rooms").on("value",(snap)=>{
    list.innerHTML="";
    const all = snap.val()||{};
    Object.keys(all).forEach(rid=>{
      const r=all[rid]; if(!r || r.gameState==="ended") return;
      const pc = r.players?Object.keys(r.players).length:0;
      const div=document.createElement("div");
      div.className="friend-item"; // hazır stil
      div.innerHTML = `
        <div>
          <strong>${r.name}</strong><br/>
          <small>Kod: ${r.code} • Oyuncular: ${pc}/${r.maxPlayers||8} • Durum: ${r.gameState}</small>
        </div>
        <div class="profile-actions">
          <button class="btn btn-primary" data-join="${rid}"><i class="fa-solid fa-right-to-bracket"></i></button>
          <button class="btn btn-ghost" data-watch="${rid}"><i class="fa-solid fa-eye"></i></button>
        </div>
      `;
      list.appendChild(div);
    });
  });

  list.addEventListener("click", async (e)=>{
    const j = e.target.closest("[data-join]");
    const w = e.target.closest("[data-watch]");
    if(j){
      const rid=j.getAttribute("data-join");
      try{
        const roomSnap = await db.ref("rooms/"+rid).once("value");
        if(!roomSnap.exists()) return toast("Oda bulunamadı.");
        const room = roomSnap.val();
        if(room.gameState!=="waiting" && room.gameState!=="starting")
          return toast("Oyun başlamış/bitti. Katılım kapalı.");

        const playersCount = room.players?Object.keys(room.players).length:0;
        if(playersCount >= (room.maxPlayers||8)) return toast("Oda dolu.");

        if(!room.players[currentUser.uid]){
          const newPlayer = {
            name: currentUserData.displayName||"Oyuncu",
            color: "#64ffda",
            money:1000, soldiers:0, petrol:100, wheat:400,
            countries:[], joinedAt: firebase.database.ServerValue.TIMESTAMP,
            isHost:false, flag: currentUserData.flag||""
          };
          const updates={};
          updates[`rooms/${rid}/players/${currentUser.uid}`]=newPlayer;
          const order=room.playerOrder||[]; order.push(currentUser.uid);
          updates[`rooms/${rid}/playerOrder`]=order;
          await db.ref().update(updates);
        }
        isSpectator=false; enterRoom(rid);
      }catch(err){ toast("Katılma hatası: "+(err?.message||err)); }
    }else if(w){
      const rid=w.getAttribute("data-watch");
      try{
        await db.ref(`rooms/${rid}/watchers/${currentUser.uid}`).set({
          name: currentUserData.displayName||"Seyirci", joinedAt: firebase.database.ServerValue.TIMESTAMP
        });
        isSpectator=true; enterRoom(rid);
      }catch(err){ toast("İzleme hatası: "+(err?.message||err)); }
    }
  });
}

/* ================== 6) Odaya Gir / Oyun Ekranı ================== */
function enterRoom(roomId){
  currentRoomId = roomId;
  roomRef = db.ref("rooms/"+roomId);

  // Canlı dinleyici
  roomRef.on("value", (snap)=>{
    roomData = snap.val()||{};
    updateGameUI();
    // Harita hazır değilse kur
    if(!map) initializeMap();
    // Ülke verisi geldikçe boyaları güncelle
    updateMapCountries();
  });

  // UI
  displayRoomName.textContent = "Yükleniyor…";
  displayRoomCode.textContent = "—";
  showGame();
}

/* ---- Oyun UI güncelle ---- */
function updateGameUI(){
  if(!roomData) return;
  displayRoomName.textContent = roomData.name || "-";
  displayRoomCode.textContent = roomData.code || "-";
  currentRoundEl.textContent = roomData.round || 1;

  if(roomData.playerOrder && roomData.players){
    const idx = roomData.currentTurnIndex || 0;
    const pid = roomData.playerOrder[idx];
    const pl  = roomData.players[pid];
    currentPlayerEl.textContent = pl ? pl.name : "?";
  }else{
    currentPlayerEl.textContent = "?";
  }

  handleGameState(roomData.gameState);
  // oyuncular popup vs (3. parçada detaylı içleri doldurulacak)
}

/* ---- GameState yönetimi & başlatma ---- */
function handleGameState(state){
  if(!state) return;
  const amIHost = !!(roomData.players && roomData.players[currentUser?.uid]?.isHost);
  if(state==="waiting"){
    startBtn.style.display = (amIHost && !isSpectator) ? "inline-flex" : "none";
    startCountdown.style.display = "none";
  }else if(state==="starting"){
    startBtn.style.display = "none";
    startCountdown.style.display = "inline";
    startCountdownListener();
  }else if(state==="started"){
    startBtn.style.display = "none";
    startCountdown.style.display = "none";
    if(startInterval){ clearInterval(startInterval); startInterval=null; }
  }
}

startBtn.addEventListener("click", ()=>{
  if(!roomData) return;
  const amIHost = !!(roomData.players && roomData.players[currentUser.uid]?.isHost);
  if(!amIHost || isSpectator) return;
  if(roomData.gameState!=="waiting") return;
  const startTime = Date.now()+30000; // 30sn
  roomRef.update({ gameState:"starting", startTime });
});

function startCountdownListener(){
  if(!roomData?.startTime) return;
  if(startInterval) clearInterval(startInterval);
  startInterval = setInterval(()=>{
    const diff = roomData.startTime - Date.now();
    if(diff<=0){
      clearInterval(startInterval); startInterval=null;
      roomRef.update({ gameState:"started" });
      return;
    }
    startCountdown.textContent = Math.floor(diff/1000);
  }, 250);
}

/* ================== 7) Ülke Verisi & Harita ================== */
async function initializeCountryData(roomId){
  // Sadece bir kez odada yoksa yaz
  const has = await db.ref("rooms/"+roomId+"/countryData").once("value");
  if(has.exists()) return;

  const res = await fetch("https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json");
  const geo = await res.json();
  const features = geo.features||[];

  // Rastgele petrol/buğday üreticileri
  const oilSet = new Set(), wheatSet = new Set();
  const oilCount = Math.min(43, features.length);
  const wheatCount = Math.min(60, features.length);
  while(oilSet.size<oilCount){ oilSet.add(Math.floor(Math.random()*features.length)); }
  while(wheatSet.size<wheatCount){ wheatSet.add(Math.floor(Math.random()*features.length)); }

  const cData={};
  features.forEach((f,idx)=>{
    const name = f.properties?.name || ("C"+idx);
    const income = Math.floor(Math.random()*500)+100;
    const oilProduction   = oilSet.has(idx)   ? (Math.floor(Math.random()*(500-150+1))+150) : 0;
    const wheatProduction = wheatSet.has(idx) ? (Math.floor(Math.random()*(700-200+1))+200) : 0;
    cData[name]={
      income, soldiers:0, owner:null,
      barracksCount:0, factories:0, refineries:0,
      oilProduction, wheatProduction, grainMills:0,
      supporters:{},
      castleDefenseLevel:0,
      castleNextUpgradeCost:null
    };
  });
  await db.ref("rooms/"+roomId+"/countryData").set(cData);
}

/* ---- Leaflet Harita ---- */
function initializeMap(){
  if(map) return;
  map = L.map("map",{
    center:[20,0], zoom:2,
    maxBounds:[[-85,-180],[85,180]], maxBoundsViscosity:1, worldCopyJump:false, noWrap:true
  });

  L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}",
    { maxZoom:7, minZoom:2, attribution:'Tiles © Esri' }
  ).addTo(map);

  fetch("https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json")
    .then(r=>r.json())
    .then(geo=>{
      geoJsonLayer = L.geoJson(geo,{
        style: { color:"#555", weight:1, fillColor:"#ccc", fillOpacity:0.7 },
        onEachFeature:(feature, layer)=>{
          const cname = feature.properties.name;
          // Tooltip
          layer.bindTooltip(getCountryPopupContent(cname),{
            permanent: infoCardsPermanent, direction:"center", className:"country-popup-tooltip"
          });
          // Click select
          layer.on("click", ()=>selectCountryOnMap(cname, layer));
        }
      }).addTo(map);
    });

  // Bilgi kartı toggle
  document.getElementById("toggle-info-cards").addEventListener("click", ()=>{
    infoCardsPermanent = !infoCardsPermanent;
    updateMapCountries();
    const icon = document.getElementById("toggle-info-cards").querySelector("i");
    icon.className = infoCardsPermanent ? "fas fa-eye" : "fas fa-eye-slash";
  });
}

/* ---- Tooltip içerik ---- */
function getCountryPopupContent(cname){
  const c = roomData?.countryData?.[cname];
  if(!c) return `<div><p>${cname}</p><p>Veri yok</p></div>`;
  const ownerName = (c.owner && roomData.players?.[c.owner]) ? roomData.players[c.owner].name : "Yok";

  // efektif üretimler
  let effIncome = c.income||0;
  if(c.factories) effIncome = Math.floor(effIncome*(1+0.2*c.factories));
  const effOil   = c.oilProduction ? Math.floor(c.oilProduction * (1+0.15*(c.refineries||0))) : 0;
  const effWheat = c.wheatProduction ? Math.floor(c.wheatProduction * (1+0.2*(c.grainMills||0))) : 0;
  const castleDef = c.castleDefenseLevel>0 ? `+%${c.castleDefenseLevel*5}` : "-";

  return `
    <div>
      <p><i class="fas fa-money-bill-wave"></i> Gelir: ${effIncome}$</p>
      <p><i class="fas fa-users"></i> Asker: ${c.soldiers||0}</p>
      <p><i class="fas fa-fort-awesome"></i> Kışla: ${c.barracksCount||0}</p>
      <p><i class="fas fa-industry"></i> Fabrika: ${c.factories||0}</p>
      <p><i class="fas fa-oil-can"></i> Rafine: ${c.refineries||0}</p>
      <p><i class="fas fa-oil-can"></i> Petrol Üretimi: ${effOil}</p>
      <p><i class="fas fa-wheat-awn"></i> Değirmen: ${c.grainMills||0}</p>
      <p><i class="fas fa-wheat-awn"></i> Buğday Üretimi: ${effWheat}</p>
      <p><i class="fas fa-chess-rook"></i> Kale Gücü: ${castleDef}</p>
      <p><i class="fas fa-crown"></i> Sahip: ${ownerName}</p>
    </div>
  `;
}

/* ---- Ülke stillerini güncelle ---- */
function updateMapCountries(){
  if(!geoJsonLayer || !roomData?.countryData) return;
  geoJsonLayer.eachLayer((layer)=>{
    const cname = layer.feature.properties.name;
    const cData = roomData.countryData[cname];
    if(!cData) return;

    const defStyle = { weight:1, color:"#555", fillColor:"#ccc", fillOpacity:0.7 };

    if(cData.owner && roomData.players?.[cData.owner]){
      const owner = roomData.players[cData.owner];
      const fillColor = owner.color || "#f39c12";
      layer.setStyle({ fillColor, fillOpacity:0.85, weight:1, color:"#30343a" });
    }else{
      layer.setStyle(defStyle);
    }

    // tooltip safe update
    const tt = layer.getTooltip && layer.getTooltip();
    if(tt && tt.setContent){
      tt.setContent(getCountryPopupContent(cname));
      // Kalıcılık modu değiştiyse yeniden bağla
      if(tt.options && tt.options.permanent !== infoCardsPermanent){
        layer.unbindTooltip();
        layer.bindTooltip(getCountryPopupContent(cname),{
          permanent: infoCardsPermanent, direction:"center", className:"country-popup-tooltip"
        });
      }
    }
  });
}

/* ---- Ülke seçimi ---- */
function selectCountryOnMap(cname, layer){
  if(isSpectator){ toast("Seyirci modundasınız."); return; }
  selectedCountry = cname;
  toast("Seçilen ülke: "+cname, 1500);
  try{
    layer.setStyle({ weight:4, color:"#FF4500" });
    setTimeout(()=>updateMapCountries(), 700);
  }catch(_){}
  // Kale fiyat metnini (3. parçada) güncelleyen fonksiyon orada
}
/* ================== 8) Tur Sırası & Sayaç ================== */
function isMyTurn(){
  if(!roomData?.playerOrder || roomData.gameState!=="started" || isSpectator) return false;
  const idx = roomData.currentTurnIndex || 0;
  return roomData.playerOrder[idx] === currentUser?.uid;
}

function startTurnTimer(){
  turnTimeRemaining = 60;
  if(turnTimerInterval) clearInterval(turnTimerInterval);
  turnTimerEl.textContent = turnTimeRemaining+"s";
  turnTimerInterval = setInterval(()=>{
    turnTimeRemaining--;
    if(turnTimeRemaining<=0){
      clearInterval(turnTimerInterval);
      turnTimerEl.textContent="0s";
      if(roomData.gameState==="started" && isMyTurn()){
        nextTurn(true);
      }
    }else{
      turnTimerEl.textContent = turnTimeRemaining+"s";
    }
  }, 1000);
}
function stopTurnTimer(){
  if(turnTimerInterval) clearInterval(turnTimerInterval);
  turnTimerEl.textContent="60s";
}

/* Tur butonu */
endTurnBtn.addEventListener("click", ()=>{
  if(isSpectator) return toast("Seyirci modundasınız.");
  nextTurn(false);
});

function nextTurn(autoEnd=false){
  if(!isMyTurn()) return;
  stopTurnTimer();

  const idx = roomData.currentTurnIndex||0;
  const currPid = roomData.playerOrder[idx];
  const pl = roomData.players[currPid];
  if(!pl) return;

  const ups = {};
  // Tur sonu üretimler
  if(pl.countries && roomData.countryData){
    let moneyGain=0, wheatGain=0;
    pl.countries.forEach((cName)=>{
      const c = roomData.countryData[cName];
      if(!c) return;
      // Kışla üretimi (asker)
      if(c.barracksCount){
        ups[`rooms/${currentRoomId}/countryData/${cName}/soldiers`] = (c.soldiers||0) + 5*c.barracksCount;
      }
      // Para
      let effIncome = c.income||0;
      if(c.factories) effIncome = Math.floor(effIncome*(1+0.2*c.factories));
      moneyGain += effIncome;
      // Buğday
      if(c.wheatProduction){
        const effW = Math.floor(c.wheatProduction * (1+0.2*(c.grainMills||0)));
        wheatGain += effW;
      }
    });
    ups[`rooms/${currentRoomId}/players/${currPid}/money`] = pl.money + moneyGain;
    ups[`rooms/${currentRoomId}/players/${currPid}/wheat`] = pl.wheat + wheatGain;
  }

  // Sırayı ilerlet
  let newIndex = idx+1;
  let newRound = roomData.round||1;
  if(newIndex >= roomData.playerOrder.length){
    newIndex=0; newRound++;
    ups[`rooms/${currentRoomId}/round`]=newRound;
  }
  ups[`rooms/${currentRoomId}/currentTurnIndex`] = newIndex;

  db.ref().update(ups, ()=>{
    const nextPid = roomData.playerOrder[newIndex];
    let text = `Sıra ${(roomData.players[nextPid]?.name)||"?"} adlı oyuncuda.`;
    if(autoEnd) text = `${pl.name} süresini doldurdu! `+text;
    broadcastNotification(text, currentRoomId);
    toast(text, 1600);
  });
}

/* Tur değişince sayaç yönetimi */
function onTurnMaybeStartTimer(){
  if(roomData?.gameState==="started"){
    if(isMyTurn()) startTurnTimer(); else stopTurnTimer();
  }else{
    stopTurnTimer();
  }
}

/* ================== 9) Odadan Çık ================== */
document.getElementById("exit-room-btn").addEventListener("click", async ()=>{
  if(!roomRef || !roomData) return;
  stopTurnTimer(); if(startInterval){ clearInterval(startInterval); startInterval=null; }

  try{
    if(!isSpectator && roomData.players?.[currentUser.uid]){
      const ups={};
      let newOrder = (roomData.playerOrder||[]).filter(id=>id!==currentUser.uid);

      if(isMyTurn()){
        let idx = (roomData.currentTurnIndex||0)+1;
        let newR = roomData.round||1;
        if(idx>=newOrder.length && newOrder.length>0){ idx=0; newR++; }
        ups[`rooms/${currentRoomId}/round`]=newR;
        ups[`rooms/${currentRoomId}/currentTurnIndex`] = newOrder.length ? idx : 0;
      }
      ups[`rooms/${currentRoomId}/playerOrder`] = newOrder;
      ups[`rooms/${currentRoomId}/players/${currentUser.uid}`] = null;
      await db.ref().update(ups);
      toast("Odadan ayrıldınız.");
    }else if(isSpectator && roomData.watchers?.[currentUser.uid]){
      await db.ref(`rooms/${currentRoomId}/watchers/${currentUser.uid}`).remove();
      toast("İzlemeyi bıraktınız.");
    }
  }catch(e){ toast("Çıkış hatası: "+(e?.message||e)); }

  showLobby();
});

/* ================== 10) Asker / Savaş ================== */
document.getElementById("open-military-btn").addEventListener("click", ()=>{
  if(isSpectator) return toast("Seyirci modundasınız.");
  togglePopup(document.getElementById("military-popup"));
});
document.getElementById("close-military-btn").addEventListener("click", ()=>{
  document.getElementById("military-popup").style.display="none";
});
function togglePopup(p){ p.style.display = (p.style.display==="flex")?"none":"flex"; }

/* Saldırı */
document.getElementById("attack-btn").addEventListener("click", attack);
function attack(){
  if(!isMyTurn()) return toast("Sıranız değil!");
  if(!selectedCountry) return toast("Bir ülke seçin!");
  const soldiers = parseInt(document.getElementById("attack-soldiers").value);
  if(isNaN(soldiers)||soldiers<=0) return toast("Geçerli asker sayısı girin!");
  const me = roomData.players[currentUser.uid];
  if(me.petrol < soldiers) return toast(`Bu saldırı için ${soldiers} varil petrol gerekli!`);
  const target = roomData.countryData[selectedCountry]; if(!target) return;

  // İlk 3 tur kuralı
  if((roomData.round||1) < 4 && target.owner && target.owner!==currentUser.uid){
    return toast("İlk 3 tur sadece sahipsiz ülkelere saldırabilirsiniz!");
  }
  // Pakt kontrol
  if(target.owner && target.owner!==currentUser.uid){
    if(hasActivePact(currentUser.uid, target.owner)) return toast("Bu oyuncu ile saldırmazlık paktınız var!");
  }

  const ups={};
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/petrol`] = me.petrol - soldiers;

  // Kendi ülkesine asker taşıma
  if(target.owner===currentUser.uid){
    if(soldiers>me.soldiers) return toast("Yeterli askeriniz yok!");
    ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/soldiers`] = (target.soldiers||0)+soldiers;
    ups[`rooms/${currentRoomId}/players/${currentUser.uid}/soldiers`] = me.soldiers - soldiers;
    return db.ref().update(ups, ()=>{
      immediateOilReward(currentUser.uid);
      broadcastNotification(`${me.name} kendi ülkesine asker taşıdı (${selectedCountry}).`, currentRoomId);
      toast(`${selectedCountry} ülkesine ${soldiers} asker yerleştirildi.`);
      nextTurn();
    });
  }

  // Normal saldırı
  if(soldiers>me.soldiers) return toast("Yeterli askeriniz yok!");
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/soldiers`] = me.soldiers - soldiers;

  let result="";
  let effectiveAttackers = soldiers;
  // Kale öldürme
  if(target.castleDefenseLevel>0){
    const killedByCastle = Math.floor((target.castleDefenseLevel*5/100)*effectiveAttackers);
    effectiveAttackers = Math.max(0, effectiveAttackers - killedByCastle);
    result += `Kale savunması: ${killedByCastle} saldıran asker öldü. `;
  }
  if(effectiveAttackers > (target.soldiers||0)){
    // Fetih
    const rem = effectiveAttackers - (target.soldiers||0);
    ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/soldiers`] = rem;
    ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/owner`] = currentUser.uid;
    ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/supporters`] = {};
    // defanstan ülkeyi düşür
    if(target.owner && roomData.players[target.owner]){
      const defC = (roomData.players[target.owner].countries||[]).filter(x=>x!==selectedCountry);
      ups[`rooms/${currentRoomId}/players/${target.owner}/countries`] = defC;
    }
    // bana ekle
    const myC = me.countries||[]; if(!myC.includes(selectedCountry)) myC.push(selectedCountry);
    ups[`rooms/${currentRoomId}/players/${currentUser.uid}/countries`] = myC;
    result += `${selectedCountry} fethedildi!`;
  }else{
    // Savunuldu
    ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/soldiers`] = (target.soldiers||0) - effectiveAttackers;
    result += `${selectedCountry} savunuldu!`;
  }

  db.ref().update(ups, ()=>{
    immediateOilReward(currentUser.uid);
    broadcastNotification(`${me.name} → ${selectedCountry}. ${result}`, currentRoomId);
    toast(result);
    nextTurn();
  });
}

/* Saldırı sonrası anlık petrol ödülü */
function immediateOilReward(playerId){
  if(!roomData?.players?.[playerId]) return;
  const p = roomData.players[playerId];
  if(!p.countries) return;
  let total=0;
  p.countries.forEach(cn=>{
    const c = roomData.countryData[cn];
    if(c?.oilProduction){
      const eff = Math.floor(c.oilProduction * (1+0.15*(c.refineries||0)));
      total += eff;
    }
  });
  if(total>0){
    const newVal = (p.petrol||0)+total;
    db.ref(`rooms/${currentRoomId}/players/${playerId}/petrol`).set(newVal);
    toast(`Saldırı sonrası petrol: +${total} varil`);
    broadcastNotification(`${p.name}, saldırı sonrası +${total} petrol kazandı!`, currentRoomId);
  }
}

/* Asker satın al */
document.getElementById("buy-soldiers-btn").addEventListener("click", ()=>{
  if(isSpectator) return toast("Seyirci modundasınız.");
  const c = parseInt(document.getElementById("soldiers-to-buy").value);
  if(isNaN(c)||c<=0) return toast("Geçerli sayı girin!");
  const p = roomData.players[currentUser.uid];
  const costM = 10*c, costW = 25*c;
  if(p.money<costM) return toast("Yeterli paranız yok!");
  if(p.wheat<costW) return toast("Yeterli buğdayınız yok!");
  const ups={};
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/money`] = p.money-costM;
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/wheat`] = p.wheat-costW;
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/soldiers`] = p.soldiers+c;
  db.ref().update(ups);
  broadcastNotification(`${p.name} ${c} asker satın aldı.`, currentRoomId);
  toast(`${c} asker satın alındı.`);
});

/* Asker çek */
document.getElementById("pull-soldiers-btn").addEventListener("click", ()=>{
  if(isSpectator) return toast("Seyirci modundasınız.");
  if(!selectedCountry) return toast("Bir ülke seçin!");
  const num = parseInt(document.getElementById("pull-soldiers-count").value);
  if(isNaN(num)||num<=0) return toast("Geçerli asker sayısı girin!");
  const p  = roomData.players[currentUser.uid];
  const cd = roomData.countryData[selectedCountry]; if(!cd) return;

  const ups={};
  if(cd.owner===currentUser.uid){
    // Destek hariç
    let totalSup=0; for(const sid in (cd.supporters||{})) totalSup += cd.supporters[sid];
    const occupant = (cd.soldiers||0) - totalSup;
    if(occupant < num) return toast("Destek askerleri hariç bu kadar çekemezsiniz!");
    ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/soldiers`] = (cd.soldiers||0) - num;
    ups[`rooms/${currentRoomId}/players/${currentUser.uid}/soldiers`] = p.soldiers + num;
    broadcastNotification(`${p.name}, ${selectedCountry} ülkesinden ${num} asker çekti.`, currentRoomId);
  }else{
    const mySup = (cd.supporters?.[currentUser.uid])||0;
    if(mySup < num) return toast("Bu ülkede o kadar destek askeriniz yok!");
    if((cd.soldiers||0) < num) return toast("Ülkede yeterli asker yok!");
    const newSup = mySup - num;
    ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/soldiers`] = (cd.soldiers||0) - num;
    ups[`rooms/${currentRoomId}/players/${currentUser.uid}/soldiers`] = p.soldiers + num;
    ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/supporters/${currentUser.uid}`] = newSup>0?newSup:null;
    broadcastNotification(`${p.name}, ${selectedCountry} ülkesinden ${num} destek asker çekti.`, currentRoomId);
  }
  db.ref().update(ups);
  toast("Asker çekildi.");
});

/* Destek gönder */
document.getElementById("send-support-btn").addEventListener("click", ()=>{
  if(isSpectator) return toast("Seyirci modundasınız.");
  const rec = document.getElementById("support-recipient").value;
  const cName = document.getElementById("support-recipient-country").value;
  const num = parseInt(document.getElementById("support-soldiers").value);
  if(!rec || !cName || isNaN(num)||num<=0) return toast("Oyuncu, ülke ve asker sayısı geçerli olmalı!");
  const p = roomData.players[currentUser.uid];
  if(p.soldiers<num) return toast("Yeterli asker yok!");
  const tc = roomData.countryData[cName];
  if(!tc || tc.owner!==rec) return toast("Bu ülke o oyuncuya ait değil!");

  const ups={};
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/soldiers`] = p.soldiers - num;
  ups[`rooms/${currentRoomId}/countryData/${cName}/soldiers`] = (tc.soldiers||0) + num;
  const old = tc.supporters?.[currentUser.uid]||0;
  ups[`rooms/${currentRoomId}/countryData/${cName}/supporters/${currentUser.uid}`] = old + num;

  db.ref().update(ups);
  broadcastNotification(`${p.name}, ${roomData.players[rec].name} (${cName}) ülkesine ${num} asker destek verdi.`, currentRoomId);
  toast("Askeri destek gönderildi!");
});

/* ================== 11) Kaynak Gönderme ================== */
document.getElementById("open-resource-btn").addEventListener("click", ()=>{
  if(isSpectator) return toast("Seyirci modundasınız.");
  togglePopup(document.getElementById("resource-popup"));
});
document.getElementById("close-resource-btn").addEventListener("click", ()=>{
  document.getElementById("resource-popup").style.display="none";
});

document.getElementById("send-money-btn").addEventListener("click", ()=>{
  const amt = parseInt(document.getElementById("money-to-send").value);
  const recId = document.getElementById("recipient-player").value;
  if(isNaN(amt)||amt<=0) return toast("Geçerli miktar girin!");
  const cp = roomData.players[currentUser.uid];
  if(cp.money<amt) return toast("Yeterli para yok!");
  if(!recId) return toast("Alıcı seçin!");
  const ups={};
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/money`] = cp.money - amt;
  ups[`rooms/${currentRoomId}/players/${recId}/money`] = roomData.players[recId].money + amt;
  db.ref().update(ups);
  broadcastNotification(`${cp.name} → ${roomData.players[recId].name}: ${amt}$`, currentRoomId);
  toast(`${amt}$ gönderildi.`);
});

document.getElementById("send-petrol-btn").addEventListener("click", ()=>{
  const amt = parseInt(document.getElementById("petrol-to-send").value);
  const recId = document.getElementById("recipient-player-petrol").value;
  if(isNaN(amt)||amt<=0) return toast("Geçerli miktar girin!");
  const cp = roomData.players[currentUser.uid];
  if(cp.petrol<amt) return toast("Yeterli petrol yok!");
  if(!recId) return toast("Alıcı seçin!");
  const ups={};
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/petrol`] = cp.petrol - amt;
  ups[`rooms/${currentRoomId}/players/${recId}/petrol`] = roomData.players[recId].petrol + amt;
  db.ref().update(ups);
  broadcastNotification(`${cp.name} → ${roomData.players[recId].name}: ${amt} varil petrol`, currentRoomId);
  toast(`${amt} varil petrol gönderildi.`);
});

document.getElementById("send-wheat-btn").addEventListener("click", ()=>{
  const amt = parseInt(document.getElementById("wheat-to-send").value);
  const recId = document.getElementById("recipient-player-wheat").value;
  if(isNaN(amt)||amt<=0) return toast("Geçerli miktar girin!");
  const cp = roomData.players[currentUser.uid];
  if(cp.wheat<amt) return toast("Yeterli buğday yok!");
  if(!recId) return toast("Alıcı seçin!");
  const ups={};
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/wheat`] = cp.wheat - amt;
  ups[`rooms/${currentRoomId}/players/${recId}/wheat`] = roomData.players[recId].wheat + amt;
  db.ref().update(ups);
  broadcastNotification(`${cp.name} → ${roomData.players[recId].name}: ${amt} buğday`, currentRoomId);
  toast(`${amt} buğday gönderildi.`);
});

/* Selectleri doldur (para/petrol/buğday & PM & destek & pakt) */
function updateRecipientSelects(){
  const moneySel = document.getElementById("recipient-player");
  const petrolSel= document.getElementById("recipient-player-petrol");
  const wheatSel = document.getElementById("recipient-player-wheat");
  if(!moneySel||!petrolSel||!wheatSel) return;
  moneySel.innerHTML=""; petrolSel.innerHTML=""; wheatSel.innerHTML="";
  (roomData?.playerOrder||[]).forEach(pid=>{
    if(pid!==currentUser?.uid && roomData.players[pid]){
      const n = roomData.players[pid].name;
      const o1=document.createElement("option"); o1.value=pid; o1.textContent=n; moneySel.appendChild(o1);
      const o2=document.createElement("option"); o2.value=pid; o2.textContent=n; petrolSel.appendChild(o2);
      const o3=document.createElement("option"); o3.value=pid; o3.textContent=n; wheatSel.appendChild(o3);
    }
  });
}

/* ================== 12) Bina / Kale ================== */
document.getElementById("open-building-btn").addEventListener("click", ()=>{
  if(isSpectator) return toast("Seyirci modundasınız.");
  togglePopup(document.getElementById("building-popup"));
  updateCastleUpgradeCostUI();
});
document.getElementById("close-building-btn").addEventListener("click", ()=>{
  document.getElementById("building-popup").style.display="none";
});

document.getElementById("buy-barracks-btn").addEventListener("click", ()=>{
  if(!selectedCountry) return toast("Bir ülke seçin!");
  const q = parseInt(document.getElementById("barracks-quantity").value);
  if(isNaN(q)||q<=0) return toast("Geçerli kışla sayısı girin!");
  const cd = roomData.countryData[selectedCountry];
  if(!cd || cd.owner!==currentUser.uid) return toast("Bu ülke size ait değil!");
  const p = roomData.players[currentUser.uid];
  const costM=300*q, costP=50*q, costW=120*q;
  if(p.money<costM || p.petrol<costP || p.wheat<costW) return toast("Yeterli kaynak yok!");
  const ups={};
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/money`] = p.money-costM;
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/petrol`] = p.petrol-costP;
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/wheat`] = p.wheat-costW;
  ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/barracksCount`] = (cd.barracksCount||0)+q;
  db.ref().update(ups);
  broadcastNotification(`${p.name}, ${selectedCountry} ülkesine ${q} kışla kurdu!`, currentRoomId);
  toast(`${q} kışla kuruldu!`);
});

document.getElementById("build-factory-btn").addEventListener("click", ()=>{
  if(!selectedCountry) return toast("Bir ülke seçin!");
  const q = parseInt(document.getElementById("factory-quantity").value);
  if(isNaN(q)||q<=0) return toast("Geçerli fabrika sayısı girin!");
  const cd = roomData.countryData[selectedCountry];
  if(!cd || cd.owner!==currentUser.uid) return toast("Bu ülke size ait değil!");
  const p = roomData.players[currentUser.uid];
  const costM=500*q, costP=130*q;
  if(p.money<costM || p.petrol<costP) return toast("Yeterli kaynak yok!");
  const ups={};
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/money`] = p.money-costM;
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/petrol`] = p.petrol-costP;
  ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/factories`] = (cd.factories||0)+q;
  db.ref().update(ups);
  broadcastNotification(`${p.name}, ${selectedCountry} ülkesine ${q} fabrika kurdu!`, currentRoomId);
  toast(`${q} fabrika kuruldu!`);
});

document.getElementById("build-refinery-btn").addEventListener("click", ()=>{
  if(!selectedCountry) return toast("Bir ülke seçin!");
  const q = parseInt(document.getElementById("refinery-quantity").value);
  if(isNaN(q)||q<=0) return toast("Geçerli rafine sayısı girin!");
  const cd = roomData.countryData[selectedCountry];
  if(!cd || cd.owner!==currentUser.uid) return toast("Bu ülke size ait değil!");
  const p = roomData.players[currentUser.uid];
  const costM=800*q, costP=250*q;
  if(p.money<costM || p.petrol<costP) return toast("Yeterli kaynak yok!");
  const ups={};
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/money`] = p.money-costM;
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/petrol`] = p.petrol-costP;
  ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/refineries`] = (cd.refineries||0)+q;
  db.ref().update(ups);
  broadcastNotification(`${p.name}, ${selectedCountry} ülkesine ${q} rafine kurdu!`, currentRoomId);
  toast(`${q} rafine kuruldu!`);
});

document.getElementById("build-grainmill-btn").addEventListener("click", ()=>{
  if(!selectedCountry) return toast("Bir ülke seçin!");
  const q = parseInt(document.getElementById("grainmill-quantity").value);
  if(isNaN(q)||q<=0) return toast("Geçerli değirmen sayısı girin!");
  const cd = roomData.countryData[selectedCountry];
  if(!cd || cd.owner!==currentUser.uid) return toast("Bu ülke size ait değil!");
  const p = roomData.players[currentUser.uid];
  const costM=200*q, costP=100*q;
  if(p.money<costM || p.petrol<costP) return toast("Yeterli kaynak yok!");
  const ups={};
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/money`] = p.money-costM;
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/petrol`] = p.petrol-costP;
  ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/grainMills`] = (cd.grainMills||0)+q;
  db.ref().update(ups);
  broadcastNotification(`${p.name}, ${selectedCountry} ülkesine ${q} değirmen kurdu!`, currentRoomId);
  toast(`${q} değirmen kuruldu!`);
});

document.getElementById("build-castle-btn").addEventListener("click", ()=>{
  if(!selectedCountry) return toast("Bir ülke seçin!");
  const cd = roomData.countryData[selectedCountry];
  if(!cd || cd.owner!==currentUser.uid) return toast("Bu ülke size ait değil!");
  if(cd.castleDefenseLevel>0) return toast("Bu ülkede zaten kale var!");
  const p = roomData.players[currentUser.uid];
  if(p.money<1000 || p.petrol<1000 || p.wheat<1000) return toast("Kale için yeterli kaynak yok!");
  const ups={};
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/money`] = p.money-1000;
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/petrol`] = p.petrol-1000;
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/wheat`] = p.wheat-1000;
  ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/castleDefenseLevel`] = 1;
  ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/castleNextUpgradeCost`] = { money:1300, petrol:1300, wheat:1300 };
  db.ref().update(ups);
  broadcastNotification(`${p.name}, ${selectedCountry} ülkesine kale kurdu!`, currentRoomId);
  toast("Kale kuruldu (%5).");
  updateCastleUpgradeCostUI();
});

document.getElementById("upgrade-castle-btn").addEventListener("click", ()=>{
  if(!selectedCountry) return toast("Bir ülke seçin!");
  const cd = roomData.countryData[selectedCountry];
  if(!cd || cd.owner!==currentUser.uid) return toast("Bu ülke size ait değil!");
  if(cd.castleDefenseLevel<1) return toast("Önce kale kurun!");
  if(cd.castleDefenseLevel>=6) return toast("Kale savunması %30 üst sınırda!");
  if(!cd.castleNextUpgradeCost) return toast("Yükseltme verisi yok!");

  const p = roomData.players[currentUser.uid];
  const cost = cd.castleNextUpgradeCost;
  if(p.money<cost.money || p.petrol<cost.petrol || p.wheat<cost.wheat) return toast("Yeterli kaynak yok!");

  const ups={};
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/money`] = p.money-cost.money;
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/petrol`] = p.petrol-cost.petrol;
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/wheat`] = p.wheat-cost.wheat;

  const newLvl = cd.castleDefenseLevel+1;
  ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/castleDefenseLevel`] = newLvl;
  const nm=Math.floor(cost.money*1.3), np=Math.floor(cost.petrol*1.3), nw=Math.floor(cost.wheat*1.3);
  ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/castleNextUpgradeCost`] = { money:nm, petrol:np, wheat:nw };

  db.ref().update(ups, updateCastleUpgradeCostUI);
  broadcastNotification(`${p.name}, ${selectedCountry} kalesini güçlendirdi (Seviye ${newLvl}).`, currentRoomId);
  toast(`Kale güçlendirildi (%${newLvl*5}).`);
});

function updateCastleUpgradeCostUI(){
  const span = document.getElementById("castle-upgrade-cost-text");
  if(!span) return;
  if(!selectedCountry || !roomData?.countryData?.[selectedCountry]){ span.textContent="-"; return; }
  const cd = roomData.countryData[selectedCountry];
  if(cd.castleDefenseLevel<1){ span.textContent="Önce kale kurulmalı."; return; }
  if(cd.castleDefenseLevel>=6){ span.textContent="Maks seviye (%30)!"; return; }
  if(!cd.castleNextUpgradeCost){ span.textContent="-"; return; }
  span.textContent = `${cd.castleNextUpgradeCost.money}$ + ${cd.castleNextUpgradeCost.petrol} Varil + ${cd.castleNextUpgradeCost.wheat} Buğday`;
}

/* ================== 13) Pakt ================== */
document.getElementById("open-pact-btn").addEventListener("click", ()=>{
  if(isSpectator) return toast("Seyirci modundasınız.");
  togglePopup(document.getElementById("pact-popup"));
  updatePactRecipientSelect();
});
document.getElementById("close-pact-btn").addEventListener("click", ()=>{
  document.getElementById("pact-popup").style.display="none";
});

document.getElementById("send-pact-offer-btn").addEventListener("click", ()=>{
  if(!isMyTurn()) return toast("Pakt teklifini sadece kendi sıranızda yapabilirsiniz!");
  const rec = document.getElementById("pact-offer-recipient").value;
  const dur = parseInt(document.getElementById("pact-duration").value);
  const cst = parseInt(document.getElementById("pact-cost").value);
  if(!rec || rec===currentUser.uid) return toast("Geçerli bir oyuncu seçin!");
  if(isNaN(dur)||dur<=0) return toast("Geçerli tur sayısı girin!");
  if(isNaN(cst)||cst<0) return toast("Para miktarı geçersiz!");
  if(hasActivePact(currentUser.uid, rec)) return toast("Bu oyuncuyla zaten aktif pakt var!");

  const snd = roomData.players[currentUser.uid];
  const offRef = db.ref(`rooms/${currentRoomId}/pactOffers`).push();
  const newOff = { offerId:offRef.key, senderId:currentUser.uid, senderName:snd.name, recipientId:rec, duration:dur, cost:cst, status:"pending" };
  offRef.set(newOff);
  broadcastNotification(`Pakt Teklifi: ${snd.name} → ${roomData.players[rec].name} (Tur:${dur}, Para:${cst}$)`, currentRoomId);
  toast("Pakt teklifi gönderildi!");
});

function hasActivePact(a,b){
  if(!roomData?.pacts) return false;
  for(const pid in roomData.pacts){
    const pk = roomData.pacts[pid];
    if(pk.active && (roomData.round||1) <= pk.expirationRound){
      if((pk.playerA===a && pk.playerB===b) || (pk.playerA===b && pk.playerB===a)) return true;
    }
  }
  return false;
}

function displayPendingPactOffers(){
  const c = document.getElementById("pact-pending-offers"); if(!c) return;
  c.innerHTML="";
  if(!roomData?.pactOffers) return;
  for(const key in roomData.pactOffers){
    const off = roomData.pactOffers[key];
    if(off.status==="pending" && off.recipientId===currentUser.uid){
      const d=document.createElement("div");
      d.className="pact-offer-item"; d.dataset.offerId=off.offerId;
      d.innerHTML = `
        <p><strong>${off.senderName}</strong> size saldırmazlık pakti teklif ediyor.</p>
        <p>Tur: ${off.duration}, Para: ${off.cost}$</p>
        <button class="accept-btn" data-offer-id="${off.offerId}">Kabul</button>
        <button class="reject-btn" data-offer-id="${off.offerId}">Reddet</button>
      `;
      c.appendChild(d);
    }
  }
}
function displayActivePacts(){
  const con = document.getElementById("active-pacts-container"); if(!con) return;
  con.innerHTML="";
  if(!roomData?.pacts) return;
  for(const pid in roomData.pacts){
    const pk=roomData.pacts[pid];
    if(pk.active && (roomData.round||1) <= pk.expirationRound){
      if(pk.playerA===currentUser.uid || pk.playerB===currentUser.uid){
        const other = (pk.playerA===currentUser.uid)?pk.playerB:pk.playerA;
        const oName = roomData.players[other]?.name || "???";
        const left = pk.expirationRound - (roomData.round||1) + 1;
        const d=document.createElement("div");
        d.className="active-pact-item";
        d.innerHTML = `<p>Pakt: <strong>${oName}</strong></p><p>Kalan Tur: <strong>${left}</strong></p>`;
        con.appendChild(d);
      }
    }
  }
}

document.getElementById("pact-pending-offers").addEventListener("click",(e)=>{
  const acc = e.target.closest(".accept-btn");
  const rej = e.target.closest(".reject-btn");
  if(acc) acceptPactOffer(acc.getAttribute("data-offer-id"));
  if(rej) rejectPactOffer(rej.getAttribute("data-offer-id"));
});

function acceptPactOffer(oid){
  const off = roomData?.pactOffers?.[oid];
  if(!off || off.status!=="pending") return;
  if(hasActivePact(off.senderId, off.recipientId)){
    db.ref(`rooms/${currentRoomId}/pactOffers/${oid}`).update({ status:"rejected" });
    return toast("Zaten aktif pakt var!");
  }
  const s = roomData.players[off.senderId];
  const r = roomData.players[off.recipientId];
  if(!s||!r) return;

  if(s.money < off.cost){
    db.ref(`rooms/${currentRoomId}/pactOffers/${oid}`).update({ status:"rejected" });
    return toast("Teklifi gönderenin parası yok! Geçersiz.");
  }
  const exRound = (roomData.round||1) + off.duration;
  const pkId = db.ref().push().key;
  const ups={};
  ups[`rooms/${currentRoomId}/pactOffers/${oid}/status`] = "accepted";
  ups[`rooms/${currentRoomId}/players/${off.senderId}/money`] = s.money - off.cost;
  ups[`rooms/${currentRoomId}/players/${off.recipientId}/money`] = r.money + off.cost;
  ups[`rooms/${currentRoomId}/pacts/${pkId}`] = {
    playerA: off.senderId, playerB: off.recipientId, active:true,
    cost: off.cost, duration: off.duration, expirationRound: exRound
  };
  db.ref().update(ups);
  broadcastNotification(`Pakt: ${s.name} & ${r.name} (Tur:${off.duration}, Para:${off.cost}$).`, currentRoomId);
  toast("Pakt teklifi kabul edildi!");
}
function rejectPactOffer(oid){
  const off = roomData?.pactOffers?.[oid]; if(!off || off.status!=="pending") return;
  db.ref(`rooms/${currentRoomId}/pactOffers/${oid}`).update({ status:"rejected" });
  broadcastNotification(`Pakt Reddedildi: ${off.senderName}`, currentRoomId);
  toast("Pakt teklifi reddedildi.");
}

function updatePactRecipientSelect(){
  const sel = document.getElementById("pact-offer-recipient"); if(!sel) return;
  sel.innerHTML="";
  (roomData?.playerOrder||[]).forEach(pid=>{
    if(pid!==currentUser?.uid && roomData.players[pid]){
      const o=document.createElement("option"); o.value=pid; o.textContent=roomData.players[pid].name; sel.appendChild(o);
    }
  });
}

/* ================== 14) Market ================== */
document.getElementById("open-market-btn").addEventListener("click", ()=>{
  if(isSpectator) return toast("Seyirci modundasınız.");
  togglePopup(document.getElementById("market-popup"));
  displayTradeOffers();
  updateEmbargoPlayersSelect();
});
document.getElementById("close-market-btn").addEventListener("click", ()=>{
  document.getElementById("market-popup").style.display="none";
});

document.getElementById("create-trade-offer-btn").addEventListener("click", ()=>{
  if(!isMyTurn()) return toast("Sadece kendi sıranızda ticaret teklifi oluşturabilirsiniz!");
  const itemType = document.getElementById("trade-item-type").value;
  const qty  = parseInt(document.getElementById("trade-quantity").value);
  const price= parseInt(document.getElementById("trade-price").value);
  if(isNaN(qty)||qty<=0 || isNaN(price)||price<=0) return toast("Geçerli miktar/fiyat girin!");
  const seller = roomData.players[currentUser.uid];
  let ok=false;
  if(itemType==="petrol" && seller.petrol>=qty) ok=true;
  if(itemType==="wheat"  && seller.wheat>=qty) ok=true;
  if(!ok) return toast("Yeterli ürününüz yok!");

  const embargoSelect = document.getElementById("embargo-players");
  const embargoList=[];
  for(let i=0;i<embargoSelect.options.length;i++){
    if(embargoSelect.options[i].selected) embargoList.push(embargoSelect.options[i].value);
  }

  const offRef = db.ref(`rooms/${currentRoomId}/tradeOffers`).push();
  offRef.set({
    offerId: offRef.key, sellerId: currentUser.uid, sellerName: seller.name,
    itemType, quantity: qty, price, status:"pending", embargo: embargoList
  });
  broadcastNotification(`${seller.name} ticaret teklifi oluşturdu (${itemType}, adet:${qty}, fiyat:${price}$).`, currentRoomId);
  toast("Ticaret teklifi oluşturuldu!");
});

function displayTradeOffers(){
  const div = document.getElementById("trade-offers-list"); if(!div) return;
  div.innerHTML="";
  if(!roomData?.tradeOffers) return;

  Object.values(roomData.tradeOffers).forEach(o=>{
    if(o.status!=="pending") return;
    if(o.embargo && o.embargo.includes(currentUser.uid)) return;

    const d=document.createElement("div");
    d.className="offer-item";
    const label = o.itemType==="petrol" ? "Petrol" : "Buğday";
    let html = `
      <p><strong>Satıcı:</strong> ${o.sellerName}</p>
      <p><strong>Ürün:</strong> ${label}</p>
      <p><strong>Mevcut Miktar:</strong> ${o.quantity}</p>
      <p><strong>Birim Fiyat:</strong> ${o.price} $</p>
    `;
    if(o.sellerId!==currentUser.uid){
      html += `
        <label style="font-size:14px;color:#ccc;">Almak istediğiniz miktar:</label>
        <input type="number" class="partial-buy-quantity" placeholder="Miktar" min="1" max="${o.quantity}" />
        <button class="partial-buy-btn">Satın Al</button>
      `;
    }else{
      html += `
        <button class="cancel-offer-btn" style="background:linear-gradient(45deg,#c0392b,#e74c3c);margin-top:10px;">İptal Et</button>
      `;
    }
    if(o.embargo?.length>0){
      const embUsers = o.embargo.map(id=>roomData.players[id]?.name||"???").join(", ");
      html += `<p style="color:red;"><strong>Ambargo:</strong> ${embUsers}</p>`;
    }
    d.innerHTML=html;

    const buyBtn = d.querySelector(".partial-buy-btn");
    if(buyBtn){
      buyBtn.addEventListener("click", ()=>{
        const amt = parseInt(d.querySelector(".partial-buy-quantity").value);
        if(isNaN(amt)||amt<=0) return toast("Geçerli miktar girin!");
        acceptTradeOffer(o.offerId, amt);
      });
    }
    const cancelBtn = d.querySelector(".cancel-offer-btn");
    if(cancelBtn){
      cancelBtn.addEventListener("click", ()=> cancelTradeOffer(o.offerId));
    }
    div.appendChild(d);
  });
}

function acceptTradeOffer(offId, buyAmount){
  const off = roomData?.tradeOffers?.[offId];
  if(!off || off.status!=="pending") return toast("Teklif geçerli değil!");
  const s = roomData.players[off.sellerId];
  const b = roomData.players[currentUser.uid];
  if(!s||!b) return;
  if(buyAmount>off.quantity) return toast("Teklifte yeterli stok yok!");
  const totalCost = off.price * buyAmount;
  if(b.money<totalCost) return toast("Yeterli paranız yok!");

  const ups={}; let hasEnough=false;
  if(off.itemType==="petrol"){
    if(s.petrol>=buyAmount){
      hasEnough=true;
      ups[`rooms/${currentRoomId}/players/${off.sellerId}/petrol`] = s.petrol - buyAmount;
      ups[`rooms/${currentRoomId}/players/${currentUser.uid}/petrol`] = b.petrol + buyAmount;
    }
  }else{
    if(s.wheat>=buyAmount){
      hasEnough=true;
      ups[`rooms/${currentRoomId}/players/${off.sellerId}/wheat`] = s.wheat - buyAmount;
      ups[`rooms/${currentRoomId}/players/${currentUser.uid}/wheat`] = b.wheat + buyAmount;
    }
  }
  if(!hasEnough) return toast("Satıcının yeterli stoğu kalmamış!");

  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/money`] = b.money - totalCost;
  ups[`rooms/${currentRoomId}/players/${off.sellerId}/money`] = s.money + totalCost;

  const newQ = off.quantity - buyAmount;
  ups[`rooms/${currentRoomId}/tradeOffers/${offId}/quantity`] = newQ;
  if(newQ<=0) ups[`rooms/${currentRoomId}/tradeOffers/${offId}/status`] = "completed";

  db.ref().update(ups, ()=>{
    broadcastNotification(`Ticaret: ${s.name} -> ${b.name} (${buyAmount} x ${off.itemType}).`, currentRoomId);
    toast("Ticaret başarıyla gerçekleşti!");
  });
}
function cancelTradeOffer(offId){
  const off = roomData?.tradeOffers?.[offId]; if(!off) return;
  if(off.sellerId!==currentUser.uid) return toast("Sadece kendi teklifinizi iptal edebilirsiniz!");
  if(off.status!=="pending") return toast("Bu teklif tamamlandı/iptal.");
  db.ref(`rooms/${currentRoomId}/tradeOffers/${offId}`).update({ status:"cancelled" });
  broadcastNotification(`Ticaret teklifi iptal edildi: ${off.sellerName}`, currentRoomId);
  toast("Teklif iptal edildi.");
}
function updateEmbargoPlayersSelect(){
  const sel=document.getElementById("embargo-players"); if(!sel) return;
  sel.innerHTML="";
  (roomData?.playerOrder||[]).forEach(pid=>{
    if(pid!==currentUser?.uid && roomData.players[pid]){
      const o=document.createElement("option"); o.value=pid; o.textContent=roomData.players[pid].name; sel.appendChild(o);
    }
  });
}

/* ================== 15) Chat ================== */
const chatPopup=document.getElementById("chat-popup");
document.getElementById("open-chat-btn").addEventListener("click", ()=> toggleChat(!chatOpen));
document.getElementById("close-chat-btn").addEventListener("click", ()=> toggleChat(false));
function toggleChat(show){
  chatPopup.style.display = show?"flex":"none";
  chatOpen = show;
  if(chatOpen){ unreadMessages=0; updateChatBadge(); }
}
document.getElementById("send-chat-btn").addEventListener("click", sendChatMessage);
document.getElementById("chat-input").addEventListener("keypress",(e)=>{ if(e.key==="Enter") sendChatMessage(); });
function sendChatMessage(){
  if(!roomRef) return;
  const input=document.getElementById("chat-input");
  const txt=(input.value||"").trim(); if(!txt) return;
  let senderName = currentUserData?.displayName || "Anon";
  if(roomData.players?.[currentUser.uid]) senderName = roomData.players[currentUser.uid].name;
  roomRef.child("chat").push({
    sender: senderName, senderId: currentUser.uid,
    text: txt, recipientId: "", timestamp: firebase.database.ServerValue.TIMESTAMP
  }, ()=> input.value="");
}

/* PM */
document.getElementById("send-private-message-btn").addEventListener("click", ()=>{
  if(!roomRef) return;
  const pmInp=document.getElementById("private-message-input");
  const pmRec=document.getElementById("private-message-recipient");
  const txt=(pmInp.value||"").trim(); const rc=pmRec.value;
  if(!txt||!rc) return;
  let sName=currentUserData?.displayName||"Anon";
  if(roomData.players?.[currentUser.uid]) sName=roomData.players[currentUser.uid].name;
  roomRef.child("chat").push({
    sender:sName, senderId:currentUser.uid, text:txt, recipientId:rc,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  }, ()=>{ pmInp.value=""; toast("Özel mesaj gönderildi!"); });
});

function appendChatMessage(m){
  // PM görünürlük
  if(m.recipientId && m.recipientId!==""){
    if(m.senderId!==currentUser.uid && m.recipientId!==currentUser.uid) return;
  }
  const chatDiv=document.getElementById("chat-messages");
  const d=document.createElement("div");
  if(m.recipientId && m.recipientId!==""){
    const targName = roomData.players[m.recipientId]?.name || "???";
    d.innerHTML = (m.senderId===currentUser.uid)
      ? `<strong>[PM to ${targName}]:</strong> ${m.text}`
      : `<strong>[PM from ${m.sender}]:</strong> ${m.text}`;
    d.style.color="#f39c12";
  }else{
    d.textContent = `${m.sender}: ${m.text}`;
  }
  chatDiv.appendChild(d);
  chatDiv.scrollTop = chatDiv.scrollHeight;

  if(!chatOpen && m.senderId!==currentUser.uid){
    unreadMessages++; updateChatBadge();
  }
}
function updateChatBadge(){
  const btn=document.getElementById("open-chat-btn");
  btn.dataset.badge = unreadMessages>0 ? String(unreadMessages) : "";
}

/* Canlı chat/notification dinleyicileri */
let chatListenerAdded=false;
function addChatListeners(){
  if(chatListenerAdded || !roomRef) return;
  roomRef.child("chat").on("child_added",(snap)=> appendChatMessage(snap.val()));
  roomRef.child("notifications").on("child_added",(snap)=>{
    const data=snap.val(); if(data?.text) displayGlobalNotification(data.text);
  });
  chatListenerAdded=true;
}

/* ================== 16) Oyuncu Listesi & Seçiciler ================== */
function updatePlayersPopup(){
  const div=document.getElementById("players-info"); if(!div) return;
  div.innerHTML="";
  (roomData?.playerOrder||[]).forEach(pid=>{
    const p=roomData.players?.[pid]; if(!p) return;
    const pDiv=document.createElement("div");
    pDiv.className="player-info";
    const flagImg = p.flag ? `<img src="${p.flag}" alt="Flag" style="max-width:40px;max-height:25px;margin-right:10px;border-radius:2px;" />` : "";
    pDiv.innerHTML = `
      <p><strong>${flagImg} ${p.name}</strong></p>
      <p>Para: <span>${currency(p.money)}</span>$</p>
      <p>Asker: <span>${p.soldiers}</span></p>
      <p>Ülkeler: <span>${(p.countries&&p.countries.length)||0}</span></p>
      <p>Petrol: <span>${p.petrol}</span> varil</p>
      <p>Buğday: <span>${p.wheat}</span></p>
    `;
    div.appendChild(pDiv);
  });

  // Seyirciler
  const wKeys = roomData.watchers?Object.keys(roomData.watchers):[];
  if(wKeys.length>0){
    const watchersDiv=document.createElement("div");
    watchersDiv.className="player-info";
    watchersDiv.innerHTML=`<p><strong>Seyirciler:</strong></p>`;
    wKeys.forEach(wu=> watchersDiv.innerHTML += `<p>- ${roomData.watchers[wu].name}</p>`);
    div.appendChild(watchersDiv);
  }

  // Destek & PM & Kaynak ve Pakt selectlerini tazele
  updateSupportRecipientSelect();
  updatePrivateMessageRecipientSelect();
  updateRecipientSelects();
  updatePactRecipientSelect();
}
function updateSupportRecipientSelect(){
  const sel=document.getElementById("support-recipient"); if(!sel) return;
  sel.innerHTML="<option value=''>--Oyuncu Seç--</option>";
  (roomData?.playerOrder||[]).forEach(pid=>{
    if(pid!==currentUser?.uid && roomData.players[pid]){
      const o=document.createElement("option"); o.value=pid; o.textContent=roomData.players[pid].name; sel.appendChild(o);
    }
  });
}
document.getElementById("support-recipient").addEventListener("change", function(){
  const rec=this.value; const sc=document.getElementById("support-recipient-country");
  sc.innerHTML="<option value=''>--Ülke Seç--</option>";
  if(!rec || !roomData.players[rec]) return;
  const rc=roomData.players[rec].countries||[];
  rc.forEach(cn=>{ const opt=document.createElement("option"); opt.value=cn; opt.textContent=cn; sc.appendChild(opt); });
});
function updatePrivateMessageRecipientSelect(){
  const sel=document.getElementById("private-message-recipient"); if(!sel) return;
  sel.innerHTML="<option value=''>--Oyuncu Seç--</option>";
  (roomData?.playerOrder||[]).forEach(pid=>{
    if(pid!==currentUser?.uid && roomData.players[pid]){
      const o=document.createElement("option"); o.value=pid; o.textContent=roomData.players[pid].name; sel.appendChild(o);
    }
  });
}

/* ================== 17) Bildirimler ================== */
document.getElementById("open-notifications-btn").addEventListener("click", ()=>{
  notificationsMuted = !notificationsMuted;
  toast(notificationsMuted? "Bildirimler kapatıldı.":"Bildirimler açıldı.");
});
function broadcastNotification(text, roomId){
  if(!roomId) return;
  db.ref(`rooms/${roomId}/notifications`).push({
    text, timestamp: firebase.database.ServerValue.TIMESTAMP
  });
}
function displayGlobalNotification(text){
  if(notificationsMuted) return;
  const item=document.createElement("div");
  item.className="notification-item"; item.textContent=text;
  notifArea.appendChild(item);
  setTimeout(()=>{ if(notifArea.contains(item)) notifArea.removeChild(item); }, 6500);
}

/* ================== 18) Bayrak Editörü ================== */
document.getElementById("close-flag-editor-btn").addEventListener("click", ()=>{
  document.getElementById("flag-editor-popup").style.display="none";
});
document.getElementById("flag-erase-btn").addEventListener("click", ()=>{
  isErasing=!isErasing;
  document.getElementById("flag-erase-btn").textContent = isErasing? "Kalem":"Silgi";
});
document.getElementById("flag-clear-btn").addEventListener("click", ()=>{
  if(!flagCtx) return;
  flagCtx.fillStyle="#ffffff"; flagCtx.fillRect(0,0,flagCanvas.width, flagCanvas.height);
});
document.getElementById("flag-color").addEventListener("input",(e)=>{
  brushColor = e.target.value;
  if(isErasing){ isErasing=false; document.getElementById("flag-erase-btn").textContent="Silgi"; }
});
document.getElementById("flag-brush-size").addEventListener("input",(e)=>{
  brushSize = parseInt(e.target.value)||6;
});
document.getElementById("save-flag-btn").addEventListener("click", ()=>{
  if(!flagCanvas||!flagCtx) return;
  const url = flagCanvas.toDataURL("image/png");
  db.ref("users/"+currentUser.uid+"/flag").set(url);
  currentUserData.flag=url;
  toast("Bayrak kaydedildi!");
  document.getElementById("flag-editor-popup").style.display="none";
});

function initFlagCanvas(){
  if(!flagCanvas){
    flagCanvas=document.getElementById("flag-canvas");
    flagCtx=flagCanvas.getContext("2d");
    flagCanvas.addEventListener("mousedown", startDrawing);
    flagCanvas.addEventListener("mousemove", drawOnCanvas);
    flagCanvas.addEventListener("mouseup", stopDrawing);
    flagCanvas.addEventListener("mouseleave", stopDrawing);
  }
  flagCtx.fillStyle="#ffffff"; flagCtx.fillRect(0,0,flagCanvas.width, flagCanvas.height);
  if(currentUserData?.flag){
    const img=new Image();
    img.onload=()=> flagCtx.drawImage(img, 0,0, flagCanvas.width, flagCanvas.height);
    img.src=currentUserData.flag;
  }
}
function startDrawing(e){ isDrawing=true; drawOnCanvas(e); }
function drawOnCanvas(e){
  if(!isDrawing) return;
  const r = flagCanvas.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  flagCtx.lineWidth = brushSize; flagCtx.lineCap="round"; flagCtx.lineJoin="round";
  flagCtx.strokeStyle = isErasing? "#ffffff" : brushColor;
  flagCtx.lineTo(x,y); flagCtx.stroke(); flagCtx.beginPath(); flagCtx.moveTo(x,y);
}
function stopDrawing(){ isDrawing=false; flagCtx.beginPath(); }

/* ================== 19) Profil Popup (kısmi) ================== */
/* Arkadaş listesi ve istekler senin önceki sürümündeki DB şemasına uyarlanabilir;
   burada çekirdek oyun akışı tamamlandı. */

/* ================== 20) Harita tooltip/turn entegre ================== */
function refreshSidePanelsAndTimers(){
  updatePlayersPopup();
  displayPendingPactOffers();
  displayActivePacts();
  displayTradeOffers();
  onTurnMaybeStartTimer();
}

/* ================== 21) Room Listener sonrası çağrılar ================== */
/* 2/3'te roomRef.on('value') içinde updateGameUI(), updateMapCountries() çağırıyoruz.
   Oraya şunu da eklemek istersen: refreshSidePanelsAndTimers(); */

/* ================== 22) Chat/Notif listener bağlama ================== */
const gameObserver = new MutationObserver(()=>{
  if(gameContainer.style.display!=="none" && roomRef){
    addChatListeners();
  }
});
gameObserver.observe(gameContainer,{ attributes:true, attributeFilter:["style"] });

