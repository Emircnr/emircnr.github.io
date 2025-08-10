/***************************************************************
 * Global Conquest - gameLogic.js (Uyumlu sürüm)
 * - Bu dosya, gönderdiğin yeni HTML ile birebir uyumludur.
 * - Firebase Realtime DB + Auth (compat), Leaflet 1.9.4.
 * - Lobi → Oyun akışı, popuplar, chat, market, pakt, bina/asker,
 *   tur zamanlayıcı, ülke veri/tooltipleri ve bayrak editörü içerir.
 ***************************************************************/

/* =============================================================
 * 1) Firebase Başlatma
 * ===========================================================*/
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

/* =============================================================
 * 2) Global Durum
 * ===========================================================*/
let currentUser         = null;   // Firebase auth user
let currentUserData     = null;   // users/uid
let currentRoomId       = null;   // rooms/<id>
let roomRef             = null;
let roomData            = null;

let map                 = null;
let geoJsonLayer        = null;
let infoCardsPermanent  = false;
let selectedCountry     = null;

let isSpectator         = false;
let chatOpen            = false;
let unreadMessages      = 0;

let startInterval       = null;
let turnTimerInterval   = null;
let turnTimeRemaining   = 60;

let chatListenerAdded   = false;

// Basit renk paleti (lobi renk seçimi görseli)
const COLOR_PRESETS = [
  "#64ffda","#00c9ff","#ffcb6b","#ff6e6e","#a387ff",
  "#ffd166","#06d6a0","#118ab2","#ef476f","#f7df1e"
];

/* =============================================================
 * 3) DOM Referansları
 * ===========================================================*/
const $ = (id)=>document.getElementById(id);

// Ekranlar
const authContainer  = $("auth-container");
const lobbyContainer = $("lobby-container");
const gameContainer  = $("game-container");

// AUTH alanı
const authTitle            = $("auth-title");
const toggleAuth           = $("toggle-auth");
const loginFields          = $("auth-login-fields");
const registerFields       = $("auth-register-fields");
const btnAuthAction        = $("auth-action-btn");
const btnGoogle            = $("auth-google-btn");
const inpEmailLogin        = $("auth-email");
const inpPwLogin           = $("auth-password");
const inpDisplayName       = $("auth-displayName");
const inpEmailReg          = $("auth-email-reg");
const inpPwReg             = $("auth-password-reg");
const inpPwReg2            = $("auth-passwordConfirm");

// Lobi
const creatorName          = $("creator-player-name");
const creatorColors        = $("creator-color-options");
const inpMaxPlayers        = $("max-players");
const btnCreateRoom        = $("create-room-btn");
const btnEditFlag          = $("edit-flag-btn");

const joinName             = $("join-player-name");
const joinColors           = $("join-color-options");
const inpRoomCode          = $("room-code");
const btnJoinRoom          = $("join-room-btn");
const btnWatchRoom         = $("watch-room-btn");
const activeRoomsList      = $("active-rooms-list");

// Oyun üst bilgi
const displayRoomName      = $("display-room-name");
const displayRoomCode      = $("display-room-code");
const currentRoundEl       = $("current-round");
const currentPlayerEl      = $("current-player");
const btnEndTurn           = $("end-turn-btn");
const btnStartGame         = $("start-game-btn");
const startCountdownEl     = $("start-countdown");
const turnTimerEl          = $("turn-timer");

// Harita & info toggle
const btnToggleInfoCards   = $("toggle-info-cards");

// Alt ikonlar
const btnOpenPlayers       = $("open-players-btn");
const btnOpenMilitary      = $("open-military-btn");
const btnOpenBuilding      = $("open-building-btn");
const btnOpenResource      = $("open-resource-btn");
const btnOpenMarket        = $("open-market-btn");
const btnOpenPact          = $("open-pact-btn");
const btnOpenChat          = $("open-chat-btn");
const btnOpenProfile       = $("open-profile-btn");
const btnOpenNotifs        = $("open-notifications-btn");
const btnExitRoom          = $("exit-room-btn");

// Popuplar
const popPlayers           = $("players-popup");
const popMilitary          = $("military-popup");
const popBuilding          = $("building-popup");
const popResource          = $("resource-popup");
const popChat              = $("chat-popup");
const popPact              = $("pact-popup");
const popMarket            = $("market-popup");
const popProfile           = $("profile-popup");
const popFlagEditor        = $("flag-editor-popup");

// Popup kapat butonları
$("close-players-btn").onclick  = ()=>hidePopup(popPlayers);
$("close-military-btn").onclick = ()=>hidePopup(popMilitary);
$("close-building-btn").onclick = ()=>hidePopup(popBuilding);
$("close-resource-btn").onclick = ()=>hidePopup(popResource);
$("close-chat-btn").onclick     = ()=>toggleChat(false);
$("close-pact-btn").onclick     = ()=>hidePopup(popPact);
$("close-market-btn").onclick   = ()=>hidePopup(popMarket);
$("close-profile-btn").onclick  = ()=>hidePopup(popProfile);
$("close-flag-editor-btn").onclick = ()=>hidePopup(popFlagEditor);

// Bildirim alanı
const notificationArea     = $("notification-area");

// Profil içi
const profileUsername      = $("profile-username");
const profileEmail         = $("profile-email");
const profileFlag          = $("profile-flag");
const btnProfileLogout     = $("profile-logout-btn");
const btnProfileEditFlag   = $("profile-edit-flag-btn");

// Flag editor
const flagCanvas           = $("flag-canvas");
const flagCtx              = flagCanvas.getContext("2d");
const btnFlagErase         = $("flag-erase-btn");
const btnFlagClear         = $("flag-clear-btn");
const colorPicker          = $("flag-color");
const brushSizeRange       = $("flag-brush-size");
const btnFlagSave          = $("save-flag-btn");

// Chat
const chatMessages         = $("chat-messages");
const chatInput            = $("chat-input");
const btnSendChat          = $("send-chat-btn");
const privateRecipientSel  = $("private-message-recipient");
const privateInput         = $("private-message-input");
const btnSendPrivate       = $("send-private-message-btn");

// Players popup content
const playersInfoDiv       = $("players-info");

// Military
const inpAttackSoldiers    = $("attack-soldiers");
const btnAttack            = $("attack-btn");
const inpBuySoldiers       = $("soldiers-to-buy");
const btnBuySoldiers       = $("buy-soldiers-btn");
const inpPullSoldiers      = $("pull-soldiers-count");
const btnPullSoldiers      = $("pull-soldiers-btn");
const selSupportRecipient  = $("support-recipient");
const selSupportCountry    = $("support-recipient-country");
const inpSupportSoldiers   = $("support-soldiers");
const btnSendSupport       = $("send-support-btn");

// Building
const inpBarracks          = $("barracks-quantity");
const inpFactory           = $("factory-quantity");
const inpRefinery          = $("refinery-quantity");
const inpGrainMill         = $("grainmill-quantity");
const btnBarracks          = $("buy-barracks-btn");
const btnFactory           = $("build-factory-btn");
const btnRefinery          = $("build-refinery-btn");
const btnGrainMill         = $("build-grainmill-btn");
const btnBuildCastle       = $("build-castle-btn");
const btnUpgradeCastle     = $("upgrade-castle-btn");
const castleNextCostText   = $("castle-upgrade-cost-text");

// Resource
const inpMoneyToSend       = $("money-to-send");
const selMoneyRecipient    = $("recipient-player");
const btnSendMoney         = $("send-money-btn");
const inpPetrolToSend      = $("petrol-to-send");
const selPetrolRecipient   = $("recipient-player-petrol");
const btnSendPetrol        = $("send-petrol-btn");
const inpWheatToSend       = $("wheat-to-send");
const selWheatRecipient    = $("recipient-player-wheat");
const btnSendWheat         = $("send-wheat-btn");

// Pact
const selPactRecipient     = $("pact-offer-recipient");
const inpPactDuration      = $("pact-duration");
const inpPactCost          = $("pact-cost");
const btnSendPactOffer     = $("send-pact-offer-btn");
const pactPendingOffersDiv = $("pact-pending-offers");
const activePactsDiv       = $("active-pacts-container");

// Market
const selTradeItemType     = $("trade-item-type");
const inpTradeQty          = $("trade-quantity");
const inpTradePrice        = $("trade-price");
const selEmbargoPlayers    = $("embargo-players");
const btnCreateOffer       = $("create-trade-offer-btn");
const tradeOffersList      = $("trade-offers-list");

// Profile friends/requests/invites
const friendListDiv        = $("friend-list");
const incomingRequestsDiv  = $("incoming-requests");
const friendReqUsername    = $("friend-request-username");
const btnSendFriendReq     = $("send-friend-request-btn");
const incomingInvitesDiv   = $("incoming-invites");

/* =============================================================
 * 4) Basit yardımcılar
 * ===========================================================*/
function showAuth(){
  document.body.classList.remove("lobby-bg");
  authContainer.style.display  = "flex";
  lobbyContainer.style.display = "none";
  gameContainer.style.display  = "none";
}
function showLobby(){
  document.body.classList.add("lobby-bg");
  authContainer.style.display  = "none";
  lobbyContainer.style.display = "block";
  gameContainer.style.display  = "none";
}
function showGame(){
  document.body.classList.remove("lobby-bg");
  authContainer.style.display  = "none";
  lobbyContainer.style.display = "none";
  gameContainer.style.display  = "block";
}
function togglePopup(el){
  el.style.display = (el.style.display==="flex")?"none":"flex";
}
function showPopup(el){ el.style.display = "flex"; }
function hidePopup(el){ el.style.display = "none"; }

function notif(msg, duration=3000){
  const item = document.createElement("div");
  item.className = "notification-item";
  item.textContent = msg;
  notificationArea.appendChild(item);
  setTimeout(()=> item.remove(), duration+600);
}

// Chat badge
function setChatBadge(){
  btnOpenChat.dataset.badge = unreadMessages>0 ? unreadMessages : "";
}

// Random room code
function randomRoomCode(len=6){
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for(let i=0;i<len;i++) s += chars[Math.floor(Math.random()*chars.length)];
  return s;
}

// Canvas tools
let isDrawing=false, brushColor="#ff0000", brushSize=6, isErasing=false;
function flagCanvasReset(bg = "#ffffff"){
  flagCtx.fillStyle = bg; flagCtx.fillRect(0,0,flagCanvas.width,flagCanvas.height);
}

/* =============================================================
 * 5) Auth Akışı
 * ===========================================================*/
let authMode = "login"; // "register"
toggleAuth.onclick = ()=>{
  if(authMode==="login"){
    authMode="register";
    authTitle.textContent = "Kayıt Ol";
    btnAuthAction.innerHTML = `<i class="fa-solid fa-user-plus"></i><span> Kayıt Ol</span>`;
    loginFields.style.display = "none";
    registerFields.style.display = "block";
    toggleAuth.textContent = "Giriş için tıkla";
  }else{
    authMode="login";
    authTitle.textContent = "Giriş Yap";
    btnAuthAction.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i><span> Giriş Yap</span>`;
    loginFields.style.display = "block";
    registerFields.style.display = "none";
    toggleAuth.textContent = "Kayıt olmak için tıkla";
  }
};

btnAuthAction.onclick = async ()=>{
  try{
    if(authMode==="login"){
      const email = inpEmailLogin.value.trim();
      const pw    = inpPwLogin.value.trim();
      if(!email || !pw) return notif("Lütfen email ve şifre girin!");
      await auth.signInWithEmailAndPassword(email, pw);
      notif("Giriş başarılı!");
    }else{
      const disp = inpDisplayName.value.trim();
      const email= inpEmailReg.value.trim();
      const pw   = inpPwReg.value.trim();
      const pw2  = inpPwReg2.value.trim();
      if(!disp || !email || !pw || !pw2) return notif("Lütfen tüm alanları doldurun!");
      if(pw!==pw2) return notif("Şifreler eşleşmiyor!");
      const cred = await auth.createUserWithEmailAndPassword(email, pw);
      await db.ref("users/"+cred.user.uid).set({
        email, displayName: disp, online:true, friends:{}, friendRequests:{}, roomInvites:{}, flag:""
      });
      notif("Kayıt başarılı, giriş yapıldı!");
    }
  }catch(err){
    notif("Hata: " + err.message);
  }
};

// (Opsiyonel) Google ile giriş
btnGoogle.onclick = async ()=>{
  try{
    const provider = new firebase.auth.GoogleAuthProvider();
    const {user} = await auth.signInWithPopup(provider);
    const snap = await db.ref("users/"+user.uid).once("value");
    if(!snap.exists()){
      await db.ref("users/"+user.uid).set({
        email:user.email, displayName:user.displayName || (user.email||"").split("@")[0],
        online:true, friends:{}, friendRequests:{}, roomInvites:{}, flag:""
      });
    }else{
      await db.ref("users/"+user.uid+"/online").set(true);
    }
    notif("Google ile giriş başarılı!");
  }catch(err){ notif("Google: " + err.message); }
};

// Auth state
auth.onAuthStateChanged(async (user)=>{
  if(user){
    currentUser = user;
    await db.ref("users/"+user.uid+"/online").set(true);
    db.ref("users/"+user.uid+"/online").onDisconnect().set(false);

    const snap = await db.ref("users/"+user.uid).once("value");
    currentUserData = snap.val() || {};
    if(!currentUserData.displayName){
      currentUserData.displayName = (user.email||"User").split("@")[0];
      await db.ref("users/"+user.uid+"/displayName").set(currentUserData.displayName);
    }
    // Profil kartı
    profileUsername.textContent = currentUserData.displayName || "Kullanıcı";
    profileEmail.textContent    = currentUser.email || "";
    profileFlag.innerHTML       = currentUserData.flag ? `<img src="${currentUserData.flag}" alt="flag" style="width:100%;height:100%;object-fit:cover" />` : "";

    // Lobi hazırlıkları
    renderColorOptions(creatorColors);
    renderColorOptions(joinColors);
    loadActiveRooms();

    showLobby();
  }else{
    currentUser = null;
    currentUserData = null;
    showAuth();
  }
});

btnProfileLogout.onclick = async ()=>{
  try{
    if(currentUser) await db.ref("users/"+currentUser.uid+"/online").set(false);
    await auth.signOut();
    notif("Çıkış yapıldı.");
  }catch(err){ notif("Hata: " + err.message); }
};

/* =============================================================
 * 6) Lobi: Renk & Oda İşlemleri
 * ===========================================================*/
function renderColorOptions(container){
  container.innerHTML = "";
  COLOR_PRESETS.forEach(c=>{
    const div = document.createElement("div");
    div.className="global-color-option";
    div.style.background = c;
    div.onclick = ()=>{
      container.querySelectorAll(".global-color-option").forEach(x=>x.classList.remove("selected"));
      div.classList.add("selected");
      container.dataset.selectedColor = c;
    };
    container.appendChild(div);
  });
  // varsayılan seç
  container.firstChild?.classList.add("selected");
  container.dataset.selectedColor = COLOR_PRESETS[0];
}

btnCreateRoom.onclick = async ()=>{
  try{
    if(!currentUser) return;
    const rName = (creatorName.value || currentUserData.displayName+"'ın Odası").trim();
    const maxP  = Math.max(2, Math.min(8, parseInt(inpMaxPlayers.value||"4")));
    const code  = randomRoomCode(6);

    const roomId = db.ref("rooms").push().key;
    const hostData = {
      name: currentUserData.displayName,
      money:1000, soldiers:0, countries:[],
      petrol:100, wheat:400, joinedAt: firebase.database.ServerValue.TIMESTAMP,
      isHost:true, flag: currentUserData.flag || "", color: creatorColors.dataset.selectedColor || COLOR_PRESETS[0]
    };
    const data = {
      roomId, code, name:rName, gameState:"waiting",
      currentTurnIndex:0, round:1, maxPlayers:maxP,
      playerOrder: [currentUser.uid],
      players: { [currentUser.uid]: hostData },
      watchers:{}, createdAt: firebase.database.ServerValue.TIMESTAMP, hostUid: currentUser.uid
    };
    await db.ref("rooms/"+roomId).set(data);
    await initializeCountryData(roomId);
    notif("Oda oluşturuldu: "+rName);
    joinRoomDirect(roomId);
  }catch(err){ notif("Oda oluşturma hatası: "+err.message); }
};

btnJoinRoom.onclick = async ()=>{
  try{
    const code = (inpRoomCode.value||"").trim().toUpperCase();
    if(!code) return notif("Oda kodu girin!");
    const query = await db.ref("rooms").orderByChild("code").equalTo(code).once("value");
    if(!query.exists()) return notif("Oda bulunamadı!");
    const rid = Object.keys(query.val())[0];
    const r   = query.val()[rid];
    if(r.gameState!=="waiting" && r.gameState!=="starting") return notif("Oyun başlamış/bitti.");
    const pc  = r.players ? Object.keys(r.players).length : 0;
    if(pc >= (r.maxPlayers||8)) return notif("Oda dolu.");

    // Odaya oyuncu olarak ekle
    const newPl = {
      name: (joinName.value.trim() || currentUserData.displayName || "Oyuncu"),
      money:1000, soldiers:0, countries:[],
      petrol:100, wheat:400, joinedAt: firebase.database.ServerValue.TIMESTAMP,
      isHost:false, flag: currentUserData.flag || "", color: joinColors.dataset.selectedColor || COLOR_PRESETS[1]
    };
    const ups = {};
    ups[`rooms/${rid}/players/${currentUser.uid}`] = newPl;
    const order = r.playerOrder||[];
    order.push(currentUser.uid);
    ups[`rooms/${rid}/playerOrder`] = order;
    await db.ref().update(ups);

    notif("Odaya katıldınız!");
    joinRoomDirect(rid);
  }catch(err){ notif("Katılma hatası: "+err.message); }
};

btnWatchRoom.onclick = async ()=>{
  try{
    const code = (inpRoomCode.value||"").trim().toUpperCase();
    if(!code) return notif("Oda kodu girin!");
    const query = await db.ref("rooms").orderByChild("code").equalTo(code).once("value");
    if(!query.exists()) return notif("Oda bulunamadı!");
    const rid = Object.keys(query.val())[0];
    await db.ref(`rooms/${rid}/watchers/${currentUser.uid}`).set({
      name: currentUserData.displayName,
      joinedAt: firebase.database.ServerValue.TIMESTAMP
    });
    notif("İzleyici olarak odaya giriliyor...");
    isSpectator = true;
    joinRoomDirect(rid);
  }catch(err){ notif("İzleyici hatası: "+err.message); }
};

function loadActiveRooms(){
  activeRoomsList.innerHTML = "";
  db.ref("rooms").on("value",(snap)=>{
    activeRoomsList.innerHTML = "";
    const all = snap.val()||{};
    Object.values(all).sort((a,b)=> (b.createdAt||0)-(a.createdAt||0)).forEach(r=>{
      if(!r || r.gameState==="ended") return;
      const pc = r.players ? Object.keys(r.players).length : 0;
      const div = document.createElement("div");
      div.className = "room-invite-item";
      div.innerHTML = `
        <div>
          <strong>${r.name}</strong>
          <div style="color:#9aa5b1;font-size:13px">Kod: ${r.code} • Oyuncu: ${pc}/${r.maxPlayers||8} • Durum: ${r.gameState}</div>
        </div>
        <div class="profile-actions">
          <button class="btn btn-primary btn-mini" data-act="join" data-id="${r.roomId}"><i class="fa-solid fa-right-to-bracket"></i></button>
          <button class="btn btn-ghost btn-mini" data-act="watch" data-id="${r.roomId}"><i class="fa-solid fa-eye"></i></button>
        </div>`;
      activeRoomsList.appendChild(div);
    });
  });

  activeRoomsList.onclick = async (e)=>{
    const btn = e.target.closest("button[data-act]");
    if(!btn) return;
    const rid = btn.getAttribute("data-id");
    const act = btn.getAttribute("data-act");
    const snap = await db.ref("rooms/"+rid).once("value");
    if(!snap.exists()) return notif("Oda yok.");
    const r = snap.val();
    if(act==="join"){
      if(r.gameState!=="waiting" && r.gameState!=="starting") return notif("Oyun başlamış/bitti.");
      const pc = r.players ? Object.keys(r.players).length : 0;
      if(pc >= (r.maxPlayers||8)) return notif("Oda dolu.");
      const newPl = {
        name: currentUserData.displayName,
        money:1000, soldiers:0, countries:[],
        petrol:100, wheat:400, joinedAt: firebase.database.ServerValue.TIMESTAMP,
        isHost:false, flag: currentUserData.flag || "", color: COLOR_PRESETS[1]
      };
      const ups = {};
      ups[`rooms/${rid}/players/${currentUser.uid}`] = newPl;
      const order = r.playerOrder||[];
      order.push(currentUser.uid);
      ups[`rooms/${rid}/playerOrder`] = order;
      await db.ref().update(ups);
      notif("Odaya katıldınız!");
      joinRoomDirect(rid);
    }else{
      await db.ref(`rooms/${rid}/watchers/${currentUser.uid}`).set({
        name: currentUserData.displayName, joinedAt: firebase.database.ServerValue.TIMESTAMP
      });
      notif("İzleyici olarak girdiniz.");
      isSpectator = true;
      joinRoomDirect(rid);
    }
  };
}

/* =============================================================
 * 7) Oda & Harita
 * ===========================================================*/
function joinRoomDirect(roomId){
  currentRoomId = roomId;
  roomRef = db.ref("rooms/"+roomId);
  roomRef.on("value",(snap)=>{
    roomData = snap.val()||{};
    updateGameUI();
    displayPendingPactOffers();
    displayActivePacts();
    displayTradeOffers();
  });
  showGame();
  if(!map) initializeMap();
  addChatListeners();
}

async function initializeCountryData(roomId){
  // Oda kurarken 1 kez çağrılır. Ülkeleri oluşturur.
  const resp = await fetch("https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json");
  const geo = await resp.json();
  const features = geo.features||[];

  let oilIdx = new Set(), wheatIdx = new Set();
  while(oilIdx.size < Math.min(43,features.length))  oilIdx.add(Math.floor(Math.random()*features.length));
  while(wheatIdx.size < Math.min(60,features.length)) wheatIdx.add(Math.floor(Math.random()*features.length));

  const cData = {};
  features.forEach((f,idx)=>{
    const name = f.properties.name;
    let oil = oilIdx.has(idx) ? (150+Math.floor(Math.random()*351)) : 0;
    let wheat = wheatIdx.has(idx)? (200+Math.floor(Math.random()*501)) : 0;
    cData[name] = {
      income: 100 + Math.floor(Math.random()*500),
      soldiers: 0,
      owner: null,
      barracksCount: 0,
      factories: 0,
      refineries: 0,
      oilProduction: oil,
      wheatProduction: wheat,
      grainMills: 0,
      supporters: {},
      castleDefenseLevel: 0,
      castleNextUpgradeCost: null
    };
  });
  await db.ref(`rooms/${roomId}/countryData`).set(cData);
}

function initializeMap(){
  map = L.map("map",{center:[20,0],zoom:2, maxBounds:[[-85,-180],[85,180]], maxBoundsViscosity:1.0, worldCopyJump:false, noWrap:true});
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}",{
    maxZoom:7, minZoom:2,
    attribution:'Tiles © Esri, GEBCO, NOAA...'
  }).addTo(map);

  fetch("https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json")
    .then(r=>r.json())
    .then(geo=>{
      geoJsonLayer = L.geoJson(geo,{
        style: { color:"#555", weight:1, fillColor:"#ccc", fillOpacity:.7 },
        onEachFeature: (feature, layer)=>{
          const cname = feature.properties.name;
          const tooltip = L.tooltip({permanent:infoCardsPermanent, direction:"center", className:"country-popup-tooltip"})
            .setContent(getCountryTooltip(cname));
          layer.bindTooltip(tooltip);
          layer.on("click", ()=> selectCountryOnMap(cname, layer));
        }
      }).addTo(map);
    });

  btnToggleInfoCards.onclick = ()=>{
    infoCardsPermanent = !infoCardsPermanent;
    btnToggleInfoCards.querySelector("i").className = infoCardsPermanent?"fas fa-eye":"fas fa-eye-slash";
    // Tooltiplere uygula
    geoJsonLayer?.eachLayer(layer=>{
      const cname = layer.feature.properties.name;
      const tt = layer.getTooltip();
      if(tt){
        tt.setContent(getCountryTooltip(cname));
        tt.options.permanent = infoCardsPermanent;
        if(infoCardsPermanent){ layer.openTooltip(); } else { layer.closeTooltip(); }
      }
    });
  };
}

function updateMapCountries(){
  if(!geoJsonLayer || !roomData?.countryData) return;
  geoJsonLayer.eachLayer((layer)=>{
    const cname = layer.feature.properties.name;
    const c = roomData.countryData[cname];
    if(!c) return;
    const defStyle = { weight:1, color:"#555", fillColor:"#ccc", fillOpacity:.7 };
    if(c.owner && roomData.players?.[c.owner]){
      // Basit renklendirme (bayrak pattern yerine)
      const color = roomData.players[c.owner].color || "#f39c12";
      layer.setStyle({ weight:1, color:"#444", fillColor: color, fillOpacity:.85 });
    }else{
      layer.setStyle(defStyle);
    }
    const tt = layer.getTooltip();
    if(tt) tt.setContent(getCountryTooltip(cname));
  });
}

function getCountryTooltip(cname){
  const c = roomData?.countryData?.[cname];
  if(!c) return `<div><p>${cname}</p><p>Veri yok</p></div>`;
  const ownerTxt = c.owner && roomData.players?.[c.owner] ? roomData.players[c.owner].name : "Yok";
  let effIncome = c.income||0;
  if(c.factories) effIncome = Math.floor(effIncome*(1+0.2*c.factories));
  const effOil   = c.oilProduction ? Math.floor(c.oilProduction*(1+0.15*(c.refineries||0))) : 0;
  const effWheat = c.wheatProduction? Math.floor(c.wheatProduction*(1+0.2*(c.grainMills||0))) : 0;
  const castleDef= c.castleDefenseLevel>0 ? `+%${c.castleDefenseLevel*5}` : "-";

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
      <p><i class="fas fa-crown"></i> Sahip: ${ownerTxt}</p>
    </div>`;
}

function selectCountryOnMap(cname, layer){
  if(isSpectator) return notif("Seyirci modundasınız.");
  selectedCountry = cname;
  notif("Seçilen ülke: " + cname, 1500);
  layer.setStyle({weight:4, color:"#FF4500"});
  setTimeout(()=> updateMapCountries(), 800);
  updateCastleUpgradeCostUI();
}

/* =============================================================
 * 8) UI Güncelleme
 * ===========================================================*/
function updateGameUI(){
  if(!roomData) return;
  displayRoomName.textContent = roomData.name || "-";
  displayRoomCode.textContent = roomData.code || "-";
  currentRoundEl.textContent  = roomData.round || 1;

  // sıra bilgisi
  if(roomData.playerOrder && roomData.players){
    const idx = roomData.currentTurnIndex||0;
    const pid = roomData.playerOrder[idx];
    currentPlayerEl.textContent = roomData.players[pid]?.name || "?";
  }

  handleGameState(roomData.gameState);
  updatePlayersPopup();
  updateMapCountries();

  updateRecipientSelects();
  updatePactRecipientSelect();
  updatePrivateMessageRecipientSelect();
  updateEmbargoPlayersSelect();
  updateSupportRecipientSelect();

  // Profil popup mühim alanlar
  profileUsername.textContent = currentUserData?.displayName || "Kullanıcı";
  profileEmail.textContent    = currentUser?.email || "";
  if(currentUserData?.flag){
    profileFlag.innerHTML = `<img src="${currentUserData.flag}" alt="flag" style="width:100%;height:100%;object-fit:cover" />`;
  }else profileFlag.innerHTML = "";
}

function handleGameState(state){
  const isHost = !!(roomData.players && currentUser && roomData.players[currentUser.uid]?.isHost);
  if(state==="waiting"){
    if(isHost && !isSpectator){
      btnStartGame.style.display = "inline-flex";
    }else btnStartGame.style.display = "none";
    startCountdownEl.style.display = "none";
    stopTurnTimer();
  }else if(state==="starting"){
    btnStartGame.style.display = "none";
    startCountdownEl.style.display = "inline";
    startCountdownListener();
    stopTurnTimer();
  }else if(state==="started"){
    btnStartGame.style.display = "none";
    startCountdownEl.style.display = "none";
    clearInterval(startInterval); startInterval=null;
    if(isMyTurn()) startTurnTimer(); else stopTurnTimer();
  }
}

btnStartGame.onclick = ()=>{
  if(!roomData || !currentUser) return;
  const isHost = roomData.players[currentUser.uid]?.isHost;
  if(!isHost || isSpectator) return;
  if(roomData.gameState!=="waiting") return;
  const startTime = Date.now()+30000;
  roomRef.update({ gameState:"starting", startTime });
};

function startCountdownListener(){
  if(!roomData?.startTime) return;
  clearInterval(startInterval);
  startInterval = setInterval(()=>{
    const diff = roomData.startTime - Date.now();
    if(diff<=0){
      clearInterval(startInterval); startInterval=null;
      roomRef.update({ gameState:"started" });
      return;
    }
    startCountdownEl.textContent = Math.floor(diff/1000);
  },1000);
}

/* =============================================================
 * 9) Tur Sayacı & Sıra
 * ===========================================================*/
function isMyTurn(){
  if(!roomData?.playerOrder || roomData.gameState!=="started" || isSpectator || !currentUser) return false;
  const idx = roomData.currentTurnIndex||0;
  return roomData.playerOrder[idx]===currentUser.uid;
}

function startTurnTimer(){
  turnTimeRemaining = 60;
  if(turnTimerInterval) clearInterval(turnTimerInterval);
  turnTimerEl.textContent = "60s";
  turnTimerInterval = setInterval(()=>{
    turnTimeRemaining--;
    if(turnTimeRemaining<=0){
      clearInterval(turnTimerInterval);
      turnTimerEl.textContent = "0s";
      if(isMyTurn()) nextTurn(true);
    }else turnTimerEl.textContent = turnTimeRemaining+"s";
  },1000);
}
function stopTurnTimer(){
  if(turnTimerInterval) clearInterval(turnTimerInterval);
  turnTimerEl.textContent = "60s";
}

btnEndTurn.onclick = ()=>{
  if(isSpectator) return notif("Seyirci modundasınız.");
  nextTurn(false);
};

function nextTurn(autoEnd=false){
  if(!isMyTurn()) return;
  stopTurnTimer();

  const idx = roomData.currentTurnIndex||0;
  const currPid = roomData.playerOrder[idx];
  const pl = roomData.players[currPid];
  if(!pl) return;

  const ups = {};
  // Tur sonu gelir/buğday + kışla üretimi
  if(pl.countries && roomData.countryData){
    let moneyGained = 0, wheatGained = 0;
    pl.countries.forEach(cn=>{
      const cd = roomData.countryData[cn]; if(!cd) return;
      if(cd.barracksCount){
        ups[`rooms/${currentRoomId}/countryData/${cn}/soldiers`] = (cd.soldiers||0) + 5*cd.barracksCount;
      }
      let effIncome = cd.income||0;
      if(cd.factories) effIncome = Math.floor(effIncome*(1+0.2*cd.factories));
      moneyGained += effIncome;

      if(cd.wheatProduction){
        const effW = Math.floor(cd.wheatProduction*(1+0.2*(cd.grainMills||0)));
        wheatGained += effW;
      }
    });
    ups[`rooms/${currentRoomId}/players/${currPid}/money`] = (pl.money||0) + moneyGained;
    ups[`rooms/${currentRoomId}/players/${currPid}/wheat`] = (pl.wheat||0) + wheatGained;
  }

  // Sırayı ilerlet
  let newIndex = idx+1;
  let newRound = roomData.round||1;
  if(newIndex >= roomData.playerOrder.length){
    newIndex = 0; newRound++;
    ups[`rooms/${currentRoomId}/round`] = newRound;
  }
  ups[`rooms/${currentRoomId}/currentTurnIndex`] = newIndex;

  db.ref().update(ups, ()=>{
    const nextPid = roomData.playerOrder[newIndex];
    let txt = "Sıra " + (roomData.players[nextPid]?.name||"?") + " adlı oyuncuda.";
    if(autoEnd) txt = `${pl.name} süresini doldurdu! ${txt}`;
    pushRoomNotification(txt);
  });
}

/* =============================================================
 * 10) Bildirimler
 * ===========================================================*/
let notificationsMuted = false;
function pushRoomNotification(text){
  if(!currentRoomId) return;
  db.ref(`rooms/${currentRoomId}/notifications`).push({
    text, timestamp: firebase.database.ServerValue.TIMESTAMP
  });
}
btnOpenNotifs.onclick = ()=>{
  notificationsMuted = !notificationsMuted;
  notif(notificationsMuted? "Bildirimler kapatıldı." : "Bildirimler açıldı.");
};

// Oda genel bildirim listener (chat ile birlikte eklenir)
function addChatListeners(){
  if(chatListenerAdded || !roomRef) return;
  roomRef.child("chat").on("child_added",(snap)=>{
    const m = snap.val(); appendChatMessage(m);
  });
  roomRef.child("notifications").on("child_added",(snap)=>{
    const n = snap.val(); if(!n?.text) return;
    if(!notificationsMuted) notif(n.text, 5200);
  });
  chatListenerAdded = true;
}

/* =============================================================
 * 11) Popuplar Aç/Kapat
 * ===========================================================*/
btnOpenPlayers.onclick  = ()=> togglePopup(popPlayers);
btnOpenMilitary.onclick = ()=> { if(isSpectator) return notif("Seyirci modundasınız."); togglePopup(popMilitary); };
btnOpenBuilding.onclick = ()=> { if(isSpectator) return notif("Seyirci modundasınız."); togglePopup(popBuilding); updateCastleUpgradeCostUI(); };
btnOpenResource.onclick = ()=> { if(isSpectator) return notif("Seyirci modundasınız."); togglePopup(popResource); };
btnOpenMarket.onclick   = ()=> { if(isSpectator) return notif("Seyirci modundasınız."); togglePopup(popMarket); };
btnOpenPact.onclick     = ()=> { if(isSpectator) return notif("Seyirci modundasınız."); togglePopup(popPact); };
btnOpenChat.onclick     = ()=> toggleChat(!chatOpen);
btnOpenProfile.onclick  = ()=> togglePopup(popProfile);

btnExitRoom.onclick = async ()=>{
  if(!roomRef || !roomData) return;
  stopTurnTimer(); clearInterval(startInterval);
  if(!isSpectator && roomData.players?.[currentUser.uid]){
    const ups = {};
    const newOrder = (roomData.playerOrder||[]).filter(id=> id!==currentUser.uid);
    // sırası kendisindeyse sırayı ilerlet
    if(isMyTurn()){
      let idx = (roomData.currentTurnIndex||0)+1;
      let newR = roomData.round||1;
      if(idx >= newOrder.length && newOrder.length>0){ idx=0; newR++; }
      ups[`rooms/${currentRoomId}/round`] = newR;
      ups[`rooms/${currentRoomId}/currentTurnIndex`] = newOrder.length? idx : 0;
    }
    ups[`rooms/${currentRoomId}/playerOrder`] = newOrder;
    ups[`rooms/${currentRoomId}/players/${currentUser.uid}`] = null;
    await db.ref().update(ups);
    notif("Odadan ayrıldınız.");
  }else if(isSpectator && roomData.watchers?.[currentUser.uid]){
    await db.ref(`rooms/${currentRoomId}/watchers/${currentUser.uid}`).remove();
    notif("İzlemeyi bıraktınız.");
  }
  isSpectator = false;
  chatListenerAdded = false;
  showLobby();
};

/* =============================================================
 * 12) Oyuncular Popup
 * ===========================================================*/
function updatePlayersPopup(){
  if(!playersInfoDiv || !roomData) return;
  playersInfoDiv.innerHTML = "";

  (roomData.playerOrder||[]).forEach(pid=>{
    const p = roomData.players?.[pid];
    if(!p) return;
    const wrap = document.createElement("div");
    wrap.className = "player-info";
    const flagImg = p.flag ? `<img src="${p.flag}" alt="flag" style="max-width:40px;max-height:25px;margin-right:10px;border-radius:4px" />` : "";
    wrap.innerHTML = `
      <p><strong>${flagImg} ${p.name}</strong></p>
      <p>Para: <span>${p.money}</span>$ | Asker: <span>${p.soldiers}</span> | Ülke: ${(p.countries||[]).length}</p>
      <p>Petrol: <span>${p.petrol}</span> | Buğday: <span>${p.wheat}</span></p>`;
    playersInfoDiv.appendChild(wrap);
  });

  // Seyirciler
  const w = roomData.watchers||{};
  const keys = Object.keys(w);
  if(keys.length){
    const d = document.createElement("div");
    d.className="player-info";
    d.innerHTML = `<p><strong>Seyirciler</strong></p>` + keys.map(k=>`<p>- ${w[k].name}</p>`).join("");
    playersInfoDiv.appendChild(d);
  }
}

/* =============================================================
 * 13) Asker İşlemleri
 * ===========================================================*/
btnAttack.onclick = attack;
btnBuySoldiers.onclick = buySoldiers;
btnPullSoldiers.onclick = pullSoldiers;
btnSendSupport.onclick = sendSupport;

function attack(){
  if(!isMyTurn()) return notif("Sıranız değil!");
  if(!selectedCountry) return notif("Bir ülke seçin!");
  const soldiers = parseInt(inpAttackSoldiers.value);
  if(isNaN(soldiers)||soldiers<=0) return notif("Geçerli asker sayısı girin!");
  const att = roomData.players[currentUser.uid];
  const targ= roomData.countryData[selectedCountry];
  if(att.petrol < soldiers) return notif(`Bu saldırı için ${soldiers} varil petrol gerekli!`);

  // İlk 3 tur sadece sahipsiz
  if((roomData.round||1)<4 && targ.owner && targ.owner!==currentUser.uid){
    return notif("İlk 3 tur yalnızca sahipsiz ülkelere saldırabilirsiniz!");
  }
  // Pakt kontrolü
  if(targ.owner && targ.owner!==currentUser.uid){
    if(hasActivePact(currentUser.uid, targ.owner)) return notif("Bu oyuncu ile saldırmazlık paktınız var!");
  }

  const ups = {};
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/petrol`] = att.petrol - soldiers;

  // Kendi ülkesine takviye
  if(targ.owner === currentUser.uid){
    if(soldiers > att.soldiers) return notif("Yeterli askeriniz yok!");
    ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/soldiers`] = (targ.soldiers||0)+soldiers;
    ups[`rooms/${currentRoomId}/players/${currentUser.uid}/soldiers`] = att.soldiers - soldiers;
    db.ref().update(ups, ()=> immediateOilReward(currentUser.uid));
    pushRoomNotification(`${att.name} kendi ülkesine asker taşıdı (${selectedCountry}).`);
    notif(`${selectedCountry} ülkesine ${soldiers} asker yerleştirildi.`);
    return nextTurn();
  }

  // Normal saldırı
  if(soldiers > att.soldiers) return notif("Yeterli askeriniz yok!");
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/soldiers`] = att.soldiers - soldiers;

  let effectiveAttackers = soldiers;
  let resultTxt = "";

  // Kale savunması
  if((targ.castleDefenseLevel||0) > 0){
    const defPerc = targ.castleDefenseLevel*5;
    const killed = Math.floor((defPerc/100)*effectiveAttackers);
    effectiveAttackers = Math.max(0, effectiveAttackers - killed);
    resultTxt += `Kale savunması: ${killed} saldıran asker öldü. `;
  }

  if(effectiveAttackers > (targ.soldiers||0)){
    const rem = effectiveAttackers - (targ.soldiers||0);
    ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/soldiers`] = rem;
    // sahip değişimi
    if(targ.owner && roomData.players[targ.owner]){
      const oldList = (roomData.players[targ.owner].countries||[]).filter(x=>x!==selectedCountry);
      ups[`rooms/${currentRoomId}/players/${targ.owner}/countries`] = oldList;
    }
    const myList = new Set(roomData.players[currentUser.uid].countries||[]);
    myList.add(selectedCountry);
    ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/owner`] = currentUser.uid;
    ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/supporters`] = {};
    ups[`rooms/${currentRoomId}/players/${currentUser.uid}/countries`] = Array.from(myList);
    resultTxt += `${selectedCountry} fethedildi!`;
  }else{
    ups[`rooms/${currentRoomId}/countryData/${selectedCountry}]()
