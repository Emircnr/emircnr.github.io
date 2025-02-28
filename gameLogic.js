/***************************************************************
 *  gameLogic.js
 *  Özellikler:
 *    - Firebase Auth (Giriş/Kayıt)
 *    - Presence (Online/Offline)
 *    - Profil: Arkadaş listesi, istekler, bayrak çizimi (canvas)
 *    - Oda oluşturma (tek buton) + davet linki
 *    - Davet linkine tıklayarak odaya katılma
 *    - Asker, bina, kaynak, pakt, market, sohbet
 *    - Bayrak resmi: Ülke tooltips içinde görüntülenir
 ***************************************************************/

/*****************************************************************
 * 1. Firebase Başlatma
 *****************************************************************/
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
const db = firebase.database();

/*****************************************************************
 * 2. GENEL DEĞİŞKENLER
 *****************************************************************/
let currentUser = null;            // Firebase Auth user
let currentUserData = null;        // DB'deki kullanıcı verisi
let localPlayerId = null;          // Oyun içi ID
let currentRoomCode = null;
let roomRef = null;
let roomData = null;

let map = null;
let geoJsonLayer = null;
let selectedCountry = null;

let infoCardsPermanent = false;
let notificationsMuted = false;
let unreadMessages = 0;
let chatOpen = false;

let turnTimeRemaining = 60;
let turnTimerInterval = null;
let startInterval = null;

let chatListenerAdded = false;

/*****************************************************************
 * 3. SAYFA YÖNETİMİ
 *****************************************************************/
const authContainer = document.getElementById("auth-container");
const profileContainer = document.getElementById("profile-container");
const lobbyContainer = document.getElementById("lobby-container");
const gameContainer = document.getElementById("game-container");

function showAuthPage() {
  authContainer.style.display = "flex";
  profileContainer.style.display = "none";
  lobbyContainer.style.display = "none";
  gameContainer.style.display = "none";
}
function showProfilePage() {
  authContainer.style.display = "none";
  profileContainer.style.display = "flex";
  lobbyContainer.style.display = "none";
  gameContainer.style.display = "none";
}
function showLobbyPage() {
  authContainer.style.display = "none";
  profileContainer.style.display = "none";
  lobbyContainer.style.display = "flex";
  gameContainer.style.display = "none";
}
function showGamePage() {
  authContainer.style.display = "none";
  profileContainer.style.display = "none";
  lobbyContainer.style.display = "none";
  gameContainer.style.display = "block";
}

/*****************************************************************
 * 4. Firebase Authentication (Giriş & Kayıt)
 *****************************************************************/
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    const snap = await db.ref("users/" + user.uid).once("value");
    currentUserData = snap.val();

    if (!currentUserData) {
      showNotification("Kullanıcı verisi bulunamadı, lütfen kayıt olun.");
    } else {
      document.getElementById("profile-username").textContent =
        currentUserData.displayName || "Kullanıcı Adınız";

      // Presence
      setupPresence(user.uid);

      // Arkadaş, istek, davet, bayrak painter
      loadUserFriends();
      loadFriendRequests();
      loadRoomInvites();
      loadFriendInviteList();
      initFlagPainter();

      showProfilePage();

      // URL parametresi ile davet linkinden gelme
      const urlParams = new URLSearchParams(window.location.search);
      const rCode = urlParams.get("room");
      if (rCode) {
        joinRoomByInviteLink(rCode);
      }
    }
  } else {
    currentUser = null;
    currentUserData = null;
    showAuthPage();
  }
});

/** LOGIN & REGISTER Tablama */
const loginTab = document.getElementById("login-tab");
const registerTab = document.getElementById("register-tab");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");

loginTab.addEventListener("click", () => {
  loginTab.classList.add("active");
  registerTab.classList.remove("active");
  loginForm.style.display = "block";
  registerForm.style.display = "none";
});
registerTab.addEventListener("click", () => {
  registerTab.classList.add("active");
  loginTab.classList.remove("active");
  registerForm.style.display = "block";
  loginForm.style.display = "none";
});

/** GİRİŞ */
document.getElementById("login-btn").addEventListener("click", async () => {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value.trim();
  if (!email || !password) {
    showNotification("Tüm alanları doldurun!");
    return;
  }
  try {
    await auth.signInWithEmailAndPassword(email, password);
    showNotification("Giriş başarılı!");
  } catch (err) {
    showNotification("Giriş hata: " + err.message);
  }
});

/** KAYIT */
document.getElementById("register-btn").addEventListener("click", async () => {
  const email = document.getElementById("register-email").value.trim();
  const pw = document.getElementById("register-password").value.trim();
  const pw2 = document
    .getElementById("register-confirm-password")
    .value.trim();
  const dName = document
    .getElementById("register-display-name")
    .value.trim();

  if (!email || !pw || !pw2 || !dName) {
    showNotification("Tüm alanları doldurun!");
    return;
  }
  if (pw !== pw2) {
    showNotification("Şifreler eşleşmiyor!");
    return;
  }
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, pw);
    await db.ref("users/" + cred.user.uid).set({
      email,
      displayName: dName,
      friends: {},
      friendRequests: {},
      roomInvites: {},
      flag: null
    });
    showNotification("Kayıt başarılı!");
  } catch (err) {
    showNotification("Kayıt hata: " + err.message);
  }
});

/** Çıkış */
document
  .getElementById("profile-logout-btn")
  .addEventListener("click", async () => {
    await auth.signOut();
    showNotification("Çıkış yapıldı.");
  });

/*****************************************************************
 * 5. Presence (Online / Offline)
 *****************************************************************/
function setupPresence(uid) {
  const userStatusRef = db.ref("status/" + uid);
  const connRef = db.ref(".info/connected");
  connRef.on("value", (snap) => {
    if (snap.val() === false) return;
    userStatusRef
      .onDisconnect()
      .set({ state: "offline", lastChanged: firebase.database.ServerValue.TIMESTAMP })
      .then(() => {
        userStatusRef.set({
          state: "online",
          lastChanged: firebase.database.ServerValue.TIMESTAMP
        });
      });
  });
}

/*****************************************************************
 * 6. Profil Ekranı (Arkadaşlar, Oda Davetleri, Bayrak Painter)
 *****************************************************************/
async function loadUserFriends() {
  const friendList = document.getElementById("friend-list");
  friendList.innerHTML = "";
  if (!currentUserData?.friends) return;
  const fIds = Object.keys(currentUserData.friends);

  for (let fid of fIds) {
    const snap = await db.ref("users/" + fid).once("value");
    const fData = snap.val();
    if (!fData) continue;

    // Online/Offline
    let isOnline = false;
    const stSnap = await db.ref("status/" + fid).once("value");
    const stVal = stSnap.val();
    if (stVal && stVal.state === "online") {
      isOnline = true;
    }
    let statusLabel = isOnline
      ? `<span class="online-status">(Online)</span>`
      : `<span class="offline-status">(Offline)</span>`;

    const div = document.createElement("div");
    div.className = "friend-item";
    div.innerHTML = `
      <span>${fData.displayName} ${statusLabel}</span>
      <button class="remove-friend-btn" data-fid="${fid}">Sil</button>
    `;
    friendList.appendChild(div);
  }
}

/** Arkadaş İstekleri */
async function loadFriendRequests() {
  const reqList = document.getElementById("friend-request-list");
  reqList.innerHTML = "";
  if (!currentUserData?.friendRequests) return;
  const rIds = Object.keys(currentUserData.friendRequests);

  for (let rid of rIds) {
    const snap = await db.ref("users/" + rid).once("value");
    const rData = snap.val();
    if (!rData) continue;

    const div = document.createElement("div");
    div.className = "friend-request-item";
    div.innerHTML = `
      <span>${rData.displayName}</span>
      <div>
        <button class="accept-friend-btn" data-fid="${rid}">Kabul</button>
        <button class="reject-friend-btn" data-fid="${rid}">Reddet</button>
      </div>
    `;
    reqList.appendChild(div);
  }
}
document
  .getElementById("friend-request-list")
  .addEventListener("click", async (e) => {
    if (e.target.classList.contains("accept-friend-btn")) {
      const fUid = e.target.getAttribute("data-fid");
      await acceptFriendRequest(fUid);
    } else if (e.target.classList.contains("reject-friend-btn")) {
      const fUid = e.target.getAttribute("data-fid");
      await rejectFriendRequest(fUid);
    }
  });

async function acceptFriendRequest(fUid) {
  if (!currentUser) return;
  await db.ref(`users/${currentUser.uid}/friends/${fUid}`).set(true);
  await db.ref(`users/${fUid}/friends/${currentUser.uid}`).set(true);
  await db.ref(`users/${currentUser.uid}/friendRequests/${fUid}`).remove();
  showNotification("Arkadaşlık isteği kabul edildi!");
}

async function rejectFriendRequest(fUid) {
  if (!currentUser) return;
  await db.ref(`users/${currentUser.uid}/friendRequests/${fUid}`).remove();
  showNotification("Arkadaşlık isteği reddedildi.");
}

/** Arkadaş Ekle */
document
  .getElementById("send-friend-request-btn")
  .addEventListener("click", async () => {
    const targetName = document
      .getElementById("add-friend-username")
      .value.trim();
    if (!targetName) {
      showNotification("Kullanıcı adı girin!");
      return;
    }
    const allSnap = await db.ref("users").once("value");
    const allData = allSnap.val();
    let tUid = null;
    for (let uid in allData) {
      if (
        allData[uid].displayName &&
        allData[uid].displayName.toLowerCase() === targetName.toLowerCase()
      ) {
        tUid = uid;
        break;
      }
    }
    if (!tUid) {
      showNotification("Bu kullanıcı adı bulunamadı!");
      return;
    }
    if (tUid === currentUser.uid) {
      showNotification("Kendinize istek gönderemezsiniz!");
      return;
    }
    await db
      .ref(`users/${tUid}/friendRequests/${currentUser.uid}`)
      .set(true);
    showNotification("Arkadaşlık isteği gönderildi!");
  });

/** Arkadaş Sil */
document
  .getElementById("friend-list")
  .addEventListener("click", async (e) => {
    if (e.target.classList.contains("remove-friend-btn")) {
      const fId = e.target.getAttribute("data-fid");
      await removeFriend(fId);
    }
  });
async function removeFriend(fId) {
  if (!currentUser) return;
  await db.ref(`users/${currentUser.uid}/friends/${fId}`).remove();
  await db.ref(`users/${fId}/friends/${currentUser.uid}`).remove();
  showNotification("Arkadaş silindi.");
}

/** Oda Davetleri */
function loadRoomInvites() {
  const invList = document.getElementById("room-invite-list");
  invList.innerHTML = "";
  if (!currentUserData?.roomInvites) return;
  for (let invId in currentUserData.roomInvites) {
    const inv = currentUserData.roomInvites[invId];
    if (!inv) continue;
    const div = document.createElement("div");
    div.className = "room-invite-item";
    div.innerHTML = `
      <span>${inv.fromName} | Oda Kodu: ${inv.roomCode}</span>
      <div>
        <button class="accept-room-invite-btn" data-iid="${invId}">Kabul</button>
        <button class="reject-room-invite-btn" data-iid="${invId}">Reddet</button>
      </div>
    `;
    invList.appendChild(div);
  }
}
document
  .getElementById("room-invite-list")
  .addEventListener("click", async (e) => {
    if (e.target.classList.contains("accept-room-invite-btn")) {
      const iId = e.target.getAttribute("data-iid");
      await acceptRoomInvite(iId);
    } else if (e.target.classList.contains("reject-room-invite-btn")) {
      const iId = e.target.getAttribute("data-iid");
      await rejectRoomInvite(iId);
    }
  });
async function acceptRoomInvite(inviteId) {
  const invData = currentUserData.roomInvites[inviteId];
  if (!invData) return;

  await joinRoomByInviteLink(invData.roomCode);
  await db
    .ref(`users/${currentUser.uid}/roomInvites/${inviteId}`)
    .remove();
  showNotification("Oda daveti kabul edildi.");
}
async function rejectRoomInvite(inviteId) {
  await db
    .ref(`users/${currentUser.uid}/roomInvites/${inviteId}`)
    .remove();
  showNotification("Oda daveti reddedildi.");
}

/** Davet Gönder (Arkadaşlara) */
function loadFriendInviteList() {
  const invDiv = document.getElementById("invite-friend-list");
  invDiv.innerHTML = "";
  if (!currentUserData?.friends) return;

  const fIds = Object.keys(currentUserData.friends);
  fIds.forEach(async (fid) => {
    const snap = await db.ref("users/" + fid).once("value");
    const fData = snap.val();
    if (!fData) return;

    let online = false;
    const st = await db.ref("status/" + fid).once("value");
    if (st.val() && st.val().state === "online") {
      online = true;
    }
    let statusLbl = online ? "(Online)" : "(Offline)";

    const div = document.createElement("div");
    div.className = "invite-friend-item";
    div.innerHTML = `<span>${fData.displayName} ${statusLbl}</span>`;
    invDiv.appendChild(div);
  });
}

/** Odaya Davet Gönder (Varolan odaya) */
document
  .getElementById("send-room-invite-btn")
  .addEventListener("click", async () => {
    if (!currentRoomCode) {
      showNotification("Bir odaya bağlı değilsiniz!");
      return;
    }
    if (!currentUserData?.friends) {
      showNotification("Arkadaş listeniz boş!");
      return;
    }
    const frIds = Object.keys(currentUserData.friends);
    for (let fid of frIds) {
      const newKey = db.ref(`users/${fid}/roomInvites`).push().key;
      await db.ref(`users/${fid}/roomInvites/${newKey}`).set({
        fromUid: currentUser.uid,
        fromName: currentUserData.displayName,
        roomCode: currentRoomCode,
        status: "pending"
      });
    }
    showNotification("Arkadaşlara oda daveti gönderildi!");
  });

/*****************************************************************
 * 7. Bayrak (Canvas Painter)
 *****************************************************************/
function initFlagPainter() {
  const canvas = document.getElementById("flag-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  let drawing = false;
  let currentColor = "#000000";
  let eraserMode = false;

  // İlk zemin beyaz
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  canvas.addEventListener("mousedown", (e) => {
    drawing = true;
    ctx.beginPath();
    ctx.moveTo(e.offsetX, e.offsetY);
  });
  canvas.addEventListener("mousemove", (e) => {
    if (!drawing) return;
    if (eraserMode) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 15;
    } else {
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = 4;
    }
    ctx.lineCap = "round";
    ctx.lineTo(e.offsetX, e.offsetY);
    ctx.stroke();
  });
  canvas.addEventListener("mouseup", () => {
    drawing = false;
  });
  canvas.addEventListener("mouseleave", () => {
    drawing = false;
  });

  // Color Picker
  const colorPicker = document.getElementById("flag-color-picker");
  colorPicker.addEventListener("change", () => {
    currentColor = colorPicker.value;
    eraserMode = false;
  });

  // Silgi
  document
    .getElementById("flag-eraser-btn")
    .addEventListener("click", () => {
      eraserMode = true;
    });

  // Temizle
  document
    .getElementById("flag-clear-btn")
    .addEventListener("click", () => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    });

  // Kaydet
  document
    .getElementById("save-flag-btn")
    .addEventListener("click", async () => {
      if (!currentUser) return;
      const dataUrl = canvas.toDataURL("image/png");
      await db.ref("users/" + currentUser.uid + "/flag").set(dataUrl);
      showNotification("Bayrak kaydedildi!");
      currentUserData.flag = dataUrl; // local veri
    });
}

/*****************************************************************
 * 8. Lobby: Tek Buton Oda Oluştur + Davet Linki
 *****************************************************************/
document.getElementById("create-room-btn").addEventListener("click", async () => {
  if (!localStorage.getItem("playerId")) {
    localStorage.setItem("playerId", Math.random().toString(36).substr(2, 9));
  }
  localPlayerId = localStorage.getItem("playerId");

  const roomCode = generateRoomCode();
  const ref = db.ref("rooms/" + roomCode);

  const newRoomData = {
    roomCode: roomCode,
    gameState: "waiting",
    currentTurnIndex: 0,
    round: 1,
    playerOrder: [localPlayerId],
    players: {},
    countryData: {},
    createdAt: firebase.database.ServerValue.TIMESTAMP
  };
  newRoomData.players[localPlayerId] = {
    name: currentUserData.displayName || "Oyuncu",
    money: 1000,
    soldiers: 0,
    countries: [],
    petrol: 100,
    wheat: 400,
    joinedAt: firebase.database.ServerValue.TIMESTAMP,
    isHost: true,
    flag: currentUserData.flag || null
  };

  await ref.set(newRoomData);
  localStorage.setItem("roomCode", roomCode);
  currentRoomCode = roomCode;
  roomRef = ref;

  // Davet linki
  const inviteLinkContainer = document.getElementById("invite-link-container");
  const inviteLinkInput = document.getElementById("invite-link");
  inviteLinkContainer.style.display = "block";
  const fullUrl = `${window.location.origin}?room=${roomCode}`;
  inviteLinkInput.value = fullUrl;

  document
    .getElementById("copy-invite-btn")
    .addEventListener("click", () => {
      inviteLinkInput.select();
      document.execCommand("copy");
      showNotification("Davet linki kopyalandı!");
    });

  showNotification("Oda oluşturuldu! Kod: " + roomCode);
  // GeoJSON -> countryData
  loadAndInitializeGeoJson(ref);

  // Odaya gir
  joinRoomAndListen();
  showGamePage();
  document.getElementById("display-room-code").textContent = roomCode;
});

/** Davet linki tıklayınca */
async function joinRoomByInviteLink(code) {
  if (!localStorage.getItem("playerId")) {
    localStorage.setItem("playerId", Math.random().toString(36).substr(2, 9));
  }
  localPlayerId = localStorage.getItem("playerId");

  const checkRef = db.ref("rooms/" + code);
  const snap = await checkRef.once("value");
  if (!snap.exists()) {
    showNotification("Böyle bir oda yok! (Davet linki geçersiz)");
    return;
  }
  const rData = snap.val();
  if (rData.gameState !== "waiting") {
    showNotification("Oyun başlamış veya başlamak üzere, katılamazsınız.");
    return;
  }

  let order = rData.playerOrder || [];
  if (!order.includes(localPlayerId)) {
    order.push(localPlayerId);
  }
  const plData = {
    name: currentUserData.displayName || "Oyuncu",
    money: 1000,
    soldiers: 0,
    countries: [],
    petrol: 100,
    wheat: 400,
    joinedAt: firebase.database.ServerValue.TIMESTAMP,
    isHost: false,
    flag: currentUserData.flag || null
  };
  const ups = {};
  ups["players/" + localPlayerId] = plData;
  ups["playerOrder"] = order;

  await checkRef.update(ups);
  localStorage.setItem("roomCode", code);
  currentRoomCode = code;
  roomRef = checkRef;
  showGamePage();
  document.getElementById("display-room-code").textContent = code;
  joinRoomAndListen();
}

/*****************************************************************
 * 9. Oyun Ekranı
 *****************************************************************/
function joinRoomAndListen() {
  if (!roomRef) return;
  roomRef.on("value", (snap) => {
    roomData = snap.val();
    updateGameUI();
    displayPendingPactOffers();
    displayActivePacts();
    displayTradeOffers();
  });

  if (!chatListenerAdded) {
    roomRef.child("chat").on("child_added", (s) => {
      const msg = s.val();
      appendChatMessage(msg);
    });
    roomRef.child("notifications").on("child_added", (s) => {
      const dat = s.val();
      if (dat && dat.text) {
        displayGlobalNotification(dat.text);
      }
    });
    chatListenerAdded = true;
  }
}

function updateGameUI() {
  if (!roomData) return;
  // Tur
  document.getElementById("current-round").textContent = roomData.round || 1;
  // Sıra
  if (roomData.playerOrder && roomData.players) {
    const idx = roomData.currentTurnIndex || 0;
    const curPid = roomData.playerOrder[idx];
    if (roomData.players[curPid]) {
      document.getElementById("current-player").textContent =
        roomData.players[curPid].name;
    }
  }
  // Oyun Durumu
  handleGameState(roomData.gameState);

  // Oyuncu Listesi
  const pInfoDiv = document.getElementById("players-info");
  pInfoDiv.innerHTML = "";
  if (roomData.playerOrder) {
    roomData.playerOrder.forEach((pid) => {
      const pData = roomData.players[pid];
      if (!pData) return;
      const div = document.createElement("div");
      div.className = "player-info";
      div.innerHTML = `
        <p><strong>${pData.name}</strong></p>
        <p>Para: <span>${pData.money}</span>$</p>
        <p>Asker: <span>${pData.soldiers}</span></p>
        <p>Ülkeler: <span>${pData.countries?.length || 0}</span></p>
        <p>Petrol: <span>${pData.petrol}</span></p>
        <p>Buğday: <span>${pData.wheat}</span></p>
      `;
      pInfoDiv.appendChild(div);
    });
  }

  // Harita
  if (map && geoJsonLayer && roomData.countryData) {
    geoJsonLayer.eachLayer((layer) => {
      const cname = layer.feature.properties.name;
      const c = roomData.countryData[cname];
      if (c) {
        if (c.owner && roomData.players[c.owner]) {
          // Renk sabit #444, tooltip'te bayrak
          layer.setStyle({ fillColor: "#444", fillOpacity: 0.7 });
        } else {
          layer.setStyle({ fillColor: "#ccc", fillOpacity: 0.7 });
        }
        layer.setTooltipContent(getCountryPopupContent(cname, c));
      }
    });
  }

  // Tur zamanlama
  if (roomData.gameState === "started") {
    if (isMyTurn()) startTurnTimer();
    else stopTurnTimer();
  } else {
    stopTurnTimer();
  }

  // Select listeler
  updateRecipientSelects();
  updatePactRecipientSelect();
  updatePrivateMessageRecipientSelect();
  updateEmbargoPlayersSelect();
  updateSupportRecipientSelect();
}

/** Oyun Durumu */
function handleGameState(st) {
  const startBtn = document.getElementById("start-game-btn");
  const scSpan = document.getElementById("start-countdown");
  if (!st) return;

  if (st === "waiting") {
    startBtn.style.display = roomData.players[localPlayerId]?.isHost
      ? "block"
      : "none";
    scSpan.style.display = "none";
  } else if (st === "starting") {
    startBtn.style.display = "none";
    scSpan.style.display = "inline";
    startCountdownListener();
  } else if (st === "started") {
    startBtn.style.display = "none";
    scSpan.style.display = "none";
    clearInterval(startInterval);
    startInterval = null;
  }
}

/** Oyunu Başlat */
document.getElementById("start-game-btn").addEventListener("click", () => {
  if (!roomData?.players[localPlayerId]?.isHost) return;
  if (roomData.gameState !== "waiting") return;
  const now = Date.now();
  const stTime = now + 30000;
  roomRef.update({ gameState: "starting", startTime: stTime });
});

function startCountdownListener() {
  if (!roomData?.startTime) return;
  const sc = document.getElementById("start-countdown");
  if (startInterval) clearInterval(startInterval);

  startInterval = setInterval(() => {
    const now = Date.now();
    const diff = roomData.startTime - now;
    if (diff <= 0) {
      clearInterval(startInterval);
      startInterval = null;
      roomRef.update({ gameState: "started" });
      return;
    }
    const secLeft = Math.floor(diff / 1000);
    sc.textContent = secLeft;
  }, 1000);
}

/** Harita Başlat */
function initializeMap() {
  if (map) return;
  map = L.map("map", {
    center: [20, 0],
    zoom: 2,
    maxBounds: [
      [-85, -180],
      [85, 180]
    ],
    maxBoundsViscosity: 1.0,
    noWrap: true
  });

  L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: 7,
      minZoom: 2,
      attribution:
        "Tiles &copy; Esri &mdash; Source: GEBCO, NOAA, National Geographic, DeLorme, HERE"
    }
  ).addTo(map);

  fetch(
    "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json"
  )
    .then((r) => r.json())
    .then((data) => {
      geoJsonLayer = L.geoJson(data, {
        style: () => ({
          color: "#555",
          weight: 1,
          fillColor: "#ccc",
          fillOpacity: 0.7
        }),
        onEachFeature: (feat, lyr) => {
          const cName = feat.properties.name;
          lyr.bindTooltip(
            getCountryPopupContent(
              cName,
              roomData?.countryData?.[cName] || {}
            ),
            {
              permanent: infoCardsPermanent,
              direction: "center",
              className: "country-popup-tooltip"
            }
          );
          lyr.on("click", () => selectCountryOnMap(cName, lyr));
        }
      }).addTo(map);
    });
}
function selectCountryOnMap(cName, lyr) {
  selectedCountry = cName;
  showNotification("Seçilen ülke: " + cName, 1500);
  lyr.setStyle({ weight: 4, color: "#FF4500" });
  setTimeout(() => {
    const cData = roomData.countryData[cName];
    if (cData?.owner) {
      lyr.setStyle({ fillColor: "#444", fillOpacity: 0.7, weight: 1, color: "#555" });
    } else {
      lyr.setStyle({ fillColor: "#ccc", fillOpacity: 0.7, weight: 1, color: "#555" });
    }
  }, 800);
  updateCastleUpgradeCostUI();
}

/** countryData Başlangıç */
function loadAndInitializeGeoJson(ref) {
  fetch(
    "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json"
  )
    .then((r) => r.json())
    .then((geoData) => {
      const feats = geoData.features;
      let oilIdx = [];
      while (oilIdx.length < 43 && oilIdx.length < feats.length) {
        const rnd = Math.floor(Math.random() * feats.length);
        if (!oilIdx.includes(rnd)) oilIdx.push(rnd);
      }
      let wheatIdx = [];
      while (wheatIdx.length < 60 && wheatIdx.length < feats.length) {
        const rnd = Math.floor(Math.random() * feats.length);
        if (!wheatIdx.includes(rnd)) wheatIdx.push(rnd);
      }
      const cDataInit = {};
      feats.forEach((f, i) => {
        const cN = f.properties.name;
        let oilProd = 0;
        if (oilIdx.includes(i)) {
          oilProd = Math.floor(Math.random() * (500 - 150 + 1)) + 150;
        }
        let wheatProd = 0;
        if (wheatIdx.includes(i)) {
          wheatProd = Math.floor(Math.random() * (700 - 200 + 1)) + 200;
        }
        cDataInit[cN] = {
          income: Math.floor(Math.random() * 500) + 100,
          soldiers: 0,
          owner: null,
          barracksCount: 0,
          factories: 0,
          refineries: 0,
          oilProduction: oilProd,
          wheatProduction: wheatProd,
          grainMills: 0,
          supporters: {},
          castleDefenseLevel: 0,
          castleNextUpgradeCost: null
        };
      });
      ref.child("countryData").set(cDataInit);
    });
}

/** Tooltip İçeriği */
function getCountryPopupContent(cName, cData) {
  if (!cData) cData = {};
  let ownerText = "Yok";
  let flagHtml = "";
  if (cData.owner && roomData.players[cData.owner]) {
    ownerText = roomData.players[cData.owner].name;
    // Bayrak
    if (roomData.players[cData.owner].flag) {
      flagHtml = `<p><img src="${roomData.players[cData.owner].flag}" alt="Bayrak" style="max-width:100px; border:1px solid #ccc"/></p>`;
    }
  }

  let effIncome = cData.income || 0;
  if (cData.factories) {
    effIncome = Math.floor(effIncome * (1 + 0.2 * cData.factories));
  }
  let effOil = 0;
  if (cData.oilProduction) {
    effOil = Math.floor(
      cData.oilProduction * (1 + 0.15 * (cData.refineries || 0))
    );
  }
  let effWheat = 0;
  if (cData.wheatProduction) {
    effWheat = Math.floor(
      cData.wheatProduction * (1 + 0.2 * (cData.grainMills || 0))
    );
  }
  let castleDef = 0;
  if (cData.castleDefenseLevel > 0) {
    castleDef = cData.castleDefenseLevel * 5;
  }

  return `
    <div>
      ${flagHtml}
      <p><i class="fas fa-money-bill-wave"></i> Gelir: ${effIncome}$</p>
      <p><i class="fas fa-users"></i> Asker: ${cData.soldiers || 0}</p>
      <p><i class="fas fa-oil-can"></i> Petrol Üretimi: ${effOil}</p>
      <p><i class="fas fa-wheat-awn"></i> Buğday Üretimi: ${effWheat}</p>
      <p><i class="fas fa-chess-rook"></i> Kale Gücü: ${
        castleDef > 0 ? "%" + castleDef : "-"
      }</p>
      <p><i class="fas fa-crown"></i> Sahip: ${ownerText}</p>
    </div>
  `;
}

/** Bilgi Kartı Aç/Kapa */
document
  .getElementById("toggle-info-cards")
  .addEventListener("click", () => {
    infoCardsPermanent = !infoCardsPermanent;
    updateTooltipsPermanent();
    const icon = document
      .getElementById("toggle-info-cards")
      .querySelector("i");
    icon.className = infoCardsPermanent ? "fas fa-eye" : "fas fa-eye-slash";
  });

function updateTooltipsPermanent() {
  if (!geoJsonLayer) return;
  geoJsonLayer.eachLayer((layer) => {
    layer.unbindTooltip();
    const cName = layer.feature.properties.name;
    const cData = roomData.countryData[cName];
    layer.bindTooltip(getCountryPopupContent(cName, cData), {
      permanent: infoCardsPermanent,
      direction: "center",
      className: "country-popup-tooltip"
    });
  });
}

/*****************************************************************
 * 10. Bildirim Sistemi
 *****************************************************************/
function showNotification(msg, duration = 3000) {
  if (notificationsMuted) return;
  const notifArea = document.getElementById("notification-area");
  if (!notifArea) return;
  const div = document.createElement("div");
  div.className = "notification-item";
  div.textContent = msg;
  notifArea.appendChild(div);

  setTimeout(() => {
    if (notifArea.contains(div)) {
      notifArea.removeChild(div);
    }
  }, duration + 800);
}
function broadcastNotification(text) {
  if (!roomRef) return;
  roomRef.child("notifications").push({
    text,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  });
}
function displayGlobalNotification(text) {
  if (notificationsMuted) return;
  const area = document.getElementById("notification-area");
  if (!area) return;
  const div = document.createElement("div");
  div.className = "notification-item";
  div.textContent = text;
  area.appendChild(div);
  setTimeout(() => {
    if (area.contains(div)) {
      area.removeChild(div);
    }
  }, 6500);
}
document
  .getElementById("open-notifications-btn")
  .addEventListener("click", () => {
    notificationsMuted = !notificationsMuted;
    showNotification(
      notificationsMuted ? "Bildirimler kapatıldı." : "Bildirimler açıldı."
    );
  });

/*****************************************************************
 * 11. Turn Sayacı
 *****************************************************************/
function isMyTurn() {
  if (!roomData?.playerOrder) return false;
  if (roomData.gameState !== "started") return false;
  const idx = roomData.currentTurnIndex || 0;
  return roomData.playerOrder[idx] === localPlayerId;
}
function startTurnTimer() {
  turnTimeRemaining = 60;
  const tEl = document.getElementById("turn-timer");
  tEl.textContent = "60s";
  if (turnTimerInterval) clearInterval(turnTimerInterval);

  turnTimerInterval = setInterval(() => {
    turnTimeRemaining--;
    if (turnTimeRemaining <= 0) {
      clearInterval(turnTimerInterval);
      tEl.textContent = "0s";
      if (isMyTurn()) {
        nextTurn(true);
      }
    } else {
      tEl.textContent = turnTimeRemaining + "s";
    }
  }, 1000);
}
function stopTurnTimer() {
  if (turnTimerInterval) clearInterval(turnTimerInterval);
  const tEl = document.getElementById("turn-timer");
  if (tEl) tEl.textContent = "60s";
}

/*****************************************************************
 * 12. Oyun Butonları (Tur Sonu, Odadan Çık)
 *****************************************************************/
document.getElementById("end-turn-btn").addEventListener("click", () => {
  nextTurn(false);
});
async function nextTurn(autoEnd) {
  if (!isMyTurn()) return;
  stopTurnTimer();

  const idx = roomData.currentTurnIndex || 0;
  const pid = roomData.playerOrder[idx];
  const pl = roomData.players[pid];
  if (!pl) return;

  const ups = {};
  // Gelir
  if (pl.countries && roomData.countryData) {
    let totalMoney = 0;
    let totalWheat = 0;
    pl.countries.forEach((cName) => {
      const c = roomData.countryData[cName];
      if (!c) return;
      // Kışla
      if (c.barracksCount) {
        ups[`countryData/${cName}/soldiers`] =
          (c.soldiers || 0) + 5 * c.barracksCount;
      }
      let effInc = c.income || 0;
      if (c.factories) {
        effInc = Math.floor(effInc * (1 + 0.2 * c.factories));
      }
      totalMoney += effInc;

      if (c.wheatProduction) {
        let effW = Math.floor(
          c.wheatProduction * (1 + 0.2 * (c.grainMills || 0))
        );
        totalWheat += effW;
      }
    });
    ups[`players/${pid}/money`] = (pl.money || 0) + totalMoney;
    ups[`players/${pid}/wheat`] = (pl.wheat || 0) + totalWheat;
  }

  let newIdx = idx + 1;
  let newRound = roomData.round || 1;
  if (newIdx >= roomData.playerOrder.length) {
    newIdx = 0;
    newRound++;
    ups["round"] = newRound;
  }
  ups["currentTurnIndex"] = newIdx;
  await roomRef.update(ups);

  const nextPid = roomData.playerOrder[newIdx];
  let text = `Sıra ${roomData.players[nextPid]?.name} adlı oyuncuya geçti.`;
  if (autoEnd) {
    text = pl.name + " süresini doldurdu! " + text;
  }
  broadcastNotification(text);
  showNotification(text, 1500);
}

/** Odadan Çık */
document.getElementById("exit-room-btn").addEventListener("click", async () => {
  if (!roomRef || !roomData) return;
  const ups = {};
  let newOrder = (roomData.playerOrder || []).filter(
    (id) => id !== localPlayerId
  );

  if (isMyTurn()) {
    stopTurnTimer();
    let idx = roomData.currentTurnIndex || 0;
    idx++;
    let newR = roomData.round || 1;
    if (idx >= newOrder.length && newOrder.length > 0) {
      idx = 0;
      newR++;
    }
    ups["round"] = newR;
    ups["currentTurnIndex"] = newOrder.length ? idx : 0;
  }
  ups["playerOrder"] = newOrder;
  ups[`players/${localPlayerId}`] = null;
  await roomRef.update(ups);

  localStorage.removeItem("roomCode");
  stopTurnTimer();
  clearInterval(startInterval);
  showLobbyPage();
  showNotification("Odadan ayrıldınız.");
});

/*****************************************************************
 * 13. Asker İşlemleri
 *****************************************************************/
// (attack, buySoldiers, pullSoldiers, sendSupport) - Zaten yukarıda

/*****************************************************************
 * 14. Kaynak Gönderme
 *****************************************************************/
// (sendMoney, sendPetrol, sendWheat) - Zaten yukarıda
// (updateRecipientSelects)

function updateSupportRecipientSelect() {
  const sel = document.getElementById("support-recipient");
  sel.innerHTML = "<option value=''>--Oyuncu Seç--</option>";
  if (!roomData?.playerOrder) return;
  roomData.playerOrder.forEach((pid) => {
    if (pid !== localPlayerId && roomData.players[pid]) {
      const opt = document.createElement("option");
      opt.value = pid;
      opt.textContent = roomData.players[pid].name;
      sel.appendChild(opt);
    }
  });
}
document
  .getElementById("support-recipient")
  .addEventListener("change", function () {
    const rec = this.value;
    const cSel = document.getElementById("support-recipient-country");
    cSel.innerHTML = "<option value=''>--Ülke Seç--</option>";
    if (!rec || !roomData?.players[rec]) return;
    const cList = roomData.players[rec].countries || [];
    cList.forEach((cName) => {
      const o = document.createElement("option");
      o.value = cName;
      o.textContent = cName;
      cSel.appendChild(o);
    });
  });

/*****************************************************************
 * 15. Bina Kurma & Kale
 *****************************************************************/
document
  .getElementById("buy-barracks-btn")
  .addEventListener("click", buildBarracks);
document
  .getElementById("build-factory-btn")
  .addEventListener("click", buildFactory);
document
  .getElementById("build-refinery-btn")
  .addEventListener("click", buildRefinery);
document
  .getElementById("build-grainmill-btn")
  .addEventListener("click", buildGrainMill);
document
  .getElementById("build-castle-btn")
  .addEventListener("click", buildCastle);
document
  .getElementById("upgrade-castle-btn")
  .addEventListener("click", upgradeCastle);

/** Bina Kur */
function buildBarracks() {
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const q = parseInt(document.getElementById("barracks-quantity").value);
  if (isNaN(q) || q <= 0) {
    showNotification("Geçerli kışla sayısı girin!");
    return;
  }
  const c = roomData.countryData[selectedCountry];
  if (!c) return;
  if (c.owner !== localPlayerId) {
    showNotification("Bu ülke size ait değil!");
    return;
  }
  const costM = 300 * q;
  const costP = 50 * q;
  const costW = 120 * q;
  const p = roomData.players[localPlayerId];
  if (p.money < costM || p.petrol < costP || p.wheat < costW) {
    showNotification("Yeterli kaynağınız yok!");
    return;
  }
  const ups = {};
  ups[`players/${localPlayerId}/money`] = p.money - costM;
  ups[`players/${localPlayerId}/petrol`] = p.petrol - costP;
  ups[`players/${localPlayerId}/wheat`] = p.wheat - costW;
  ups[`countryData/${selectedCountry}/barracksCount`] = c.barracksCount + q;
  roomRef.update(ups);
  showNotification(`${q} kışla kuruldu!`);
  broadcastNotification(`${p.name}, ${selectedCountry} ülkesine ${q} kışla kurdu.`);
}

function buildFactory() {
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const q = parseInt(document.getElementById("factory-quantity").value);
  if (isNaN(q) || q <= 0) {
    showNotification("Geçerli fabrika sayısı girin!");
    return;
  }
  const c = roomData.countryData[selectedCountry];
  if (!c || c.owner !== localPlayerId) {
    showNotification("Bu ülke size ait değil!");
    return;
  }
  const costM = 500 * q;
  const costP = 130 * q;
  const p = roomData.players[localPlayerId];
  if (p.money < costM || p.petrol < costP) {
    showNotification("Yeterli kaynak yok!");
    return;
  }
  const ups = {};
  ups[`players/${localPlayerId}/money`] = p.money - costM;
  ups[`players/${localPlayerId}/petrol`] = p.petrol - costP;
  ups[`countryData/${selectedCountry}/factories`] = c.factories + q;
  roomRef.update(ups);
  showNotification(`${q} fabrika kuruldu!`);
  broadcastNotification(`${p.name}, ${selectedCountry} ülkesine ${q} fabrika kurdu.`);
}

function buildRefinery() {
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const q = parseInt(document.getElementById("refinery-quantity").value);
  if (isNaN(q) || q <= 0) {
    showNotification("Geçerli rafine sayısı girin!");
    return;
  }
  const c = roomData.countryData[selectedCountry];
  if (!c || c.owner !== localPlayerId) {
    showNotification("Bu ülke size ait değil!");
    return;
  }
  const costM = 800 * q;
  const costP = 250 * q;
  const p = roomData.players[localPlayerId];
  if (p.money < costM || p.petrol < costP) {
    showNotification("Yeterli kaynak yok!");
    return;
  }
  const ups = {};
  ups[`players/${localPlayerId}/money`] = p.money - costM;
  ups[`players/${localPlayerId}/petrol`] = p.petrol - costP;
  ups[`countryData/${selectedCountry}/refineries`] = c.refineries + q;
  roomRef.update(ups);
  showNotification(`${q} rafine kuruldu!`);
  broadcastNotification(`${p.name}, ${selectedCountry} ülkesine ${q} rafine kurdu.`);
}

function buildGrainMill() {
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const q = parseInt(document.getElementById("grainmill-quantity").value);
  if (isNaN(q) || q <= 0) {
    showNotification("Geçerli değirmen sayısı girin!");
    return;
  }
  const c = roomData.countryData[selectedCountry];
  if (!c || c.owner !== localPlayerId) {
    showNotification("Bu ülke size ait değil!");
    return;
  }
  const costM = 200 * q;
  const costP = 100 * q;
  const p = roomData.players[localPlayerId];
  if (p.money < costM || p.petrol < costP) {
    showNotification("Yeterli kaynak yok!");
    return;
  }
  const ups = {};
  ups[`players/${localPlayerId}/money`] = p.money - costM;
  ups[`players/${localPlayerId}/petrol`] = p.petrol - costP;
  ups[`countryData/${selectedCountry}/grainMills`] = c.grainMills + q;
  roomRef.update(ups);
  showNotification(`${q} değirmen kuruldu!`);
  broadcastNotification(`${p.name}, ${selectedCountry} ülkesine ${q} değirmen kurdu.`);
}

function buildCastle() {
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const c = roomData.countryData[selectedCountry];
  if (!c || c.owner !== localPlayerId) {
    showNotification("Bu ülke size ait değil!");
    return;
  }
  if (c.castleDefenseLevel > 0) {
    showNotification("Bu ülkede zaten kale var!");
    return;
  }
  const p = roomData.players[localPlayerId];
  if (p.money < 1000 || p.petrol < 1000 || p.wheat < 1000) {
    showNotification("Kale için yeterli kaynak yok!");
    return;
  }
  const ups = {};
  ups[`players/${localPlayerId}/money`] = p.money - 1000;
  ups[`players/${localPlayerId}/petrol`] = p.petrol - 1000;
  ups[`players/${localPlayerId}/wheat`] = p.wheat - 1000;
  ups[`countryData/${selectedCountry}/castleDefenseLevel`] = 1;
  ups[`countryData/${selectedCountry}/castleNextUpgradeCost`] = {
    money: 1300,
    petrol: 1300,
    wheat: 1300
  };
  roomRef.update(ups);
  showNotification("Kale kuruldu! (%5 savunma)");
  broadcastNotification(`${p.name}, ${selectedCountry} ülkesine kale kurdu.`);
}

function upgradeCastle() {
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const c = roomData.countryData[selectedCountry];
  if (!c || c.owner !== localPlayerId) {
    showNotification("Bu ülke size ait değil!");
    return;
  }
  if (c.castleDefenseLevel < 1) {
    showNotification("Önce kale kurun!");
    return;
  }
  if (c.castleDefenseLevel >= 6) {
    showNotification("Kale savunması %30'a ulaştı (max)!");
    return;
  }
  if (!c.castleNextUpgradeCost) {
    showNotification("Yükseltme maliyeti verisi yok!");
    return;
  }
  const p = roomData.players[localPlayerId];
  const cost = c.castleNextUpgradeCost;
  if (
    p.money < cost.money ||
    p.petrol < cost.petrol ||
    p.wheat < cost.wheat
  ) {
    showNotification("Yeterli kaynak yok!");
    return;
  }
  const ups = {};
  ups[`players/${localPlayerId}/money`] = p.money - cost.money;
  ups[`players/${localPlayerId}/petrol`] = p.petrol - cost.petrol;
  ups[`players/${localPlayerId}/wheat`] = p.wheat - cost.wheat;

  const newLevel = c.castleDefenseLevel + 1;
  ups[`countryData/${selectedCountry}/castleDefenseLevel`] = newLevel;

  const nm = Math.floor(cost.money * 1.3);
  const np = Math.floor(cost.petrol * 1.3);
  const nw = Math.floor(cost.wheat * 1.3);
  ups[`countryData/${selectedCountry}/castleNextUpgradeCost`] = {
    money: nm,
    petrol: np,
    wheat: nw
  };
  roomRef.update(ups, () => {
    updateCastleUpgradeCostUI();
  });
  showNotification(`Kale güçlendirildi (%${newLevel * 5} savunma).`);
  broadcastNotification(
    `${p.name}, ${selectedCountry} kalesini güçlendirdi (Seviye ${newLevel}).`
  );
}

function updateCastleUpgradeCostUI() {
  const costSpan = document.getElementById("castle-upgrade-cost-text");
  if (!costSpan) return;
  if (!selectedCountry || !roomData?.countryData?.[selectedCountry]) {
    costSpan.textContent = "-";
    return;
  }
  const c = roomData.countryData[selectedCountry];
  if (c.castleDefenseLevel < 1) {
    costSpan.textContent = "Önce kale kurulmalı.";
    return;
  }
  if (c.castleDefenseLevel >= 6) {
    costSpan.textContent = "Maksimum seviye (%30)!";
    return;
  }
  if (!c.castleNextUpgradeCost) {
    costSpan.textContent = "-";
    return;
  }
  costSpan.textContent = `
    ${c.castleNextUpgradeCost.money}$ + 
    ${c.castleNextUpgradeCost.petrol} Varil + 
    ${c.castleNextUpgradeCost.wheat} Buğday
  `;
}

/*****************************************************************
 * 16. Saldırmazlık Pakti
 *****************************************************************/
document
  .getElementById("send-pact-offer-btn")
  .addEventListener("click", () => {
    if (!isMyTurn()) {
      showNotification("Pakt teklifini sadece kendi sıranızda yapabilirsiniz!");
      return;
    }
    const rec = document.getElementById("pact-offer-recipient").value;
    const dur = parseInt(document.getElementById("pact-duration").value);
    const cost = parseInt(document.getElementById("pact-cost").value);
    if (!rec || rec === localPlayerId) {
      showNotification("Geçerli bir oyuncu seçin!");
      return;
    }
    if (isNaN(dur) || dur <= 0) {
      showNotification("Tur sayısı geçersiz!");
      return;
    }
    if (isNaN(cost) || cost < 0) {
      showNotification("Para geçersiz!");
      return;
    }
    if (hasActivePact(localPlayerId, rec)) {
      showNotification("Bu oyuncu ile zaten aktif pakt var!");
      return;
    }
    const sData = roomData.players[localPlayerId];
    if (!sData) return;

    const offRef = roomRef.child("pactOffers").push();
    const newOff = {
      offerId: offRef.key,
      senderId: localPlayerId,
      senderName: sData.name,
      recipientId: rec,
      duration: dur,
      cost: cost,
      status: "pending"
    };
    offRef.set(newOff);
    broadcastNotification(
      `Pakt Teklifi: ${sData.name} → ${roomData.players[rec].name} (Tur:${dur}, Para:${cost}$)`
    );
    showNotification("Pakt teklifi gönderildi!");
  });

function hasActivePact(a, b) {
  if (!roomData?.pacts) return false;
  for (let pId in roomData.pacts) {
    const p = roomData.pacts[pId];
    if (p.active && roomData.round <= p.expirationRound) {
      if (
        (p.playerA === a && p.playerB === b) ||
        (p.playerA === b && p.playerB === a)
      ) {
        return true;
      }
    }
  }
  return false;
}

function displayPendingPactOffers() {
  const cont = document.getElementById("pact-pending-offers");
  if (!cont) return;
  cont.innerHTML = "";
  if (!roomData?.pactOffers) return;

  Object.values(roomData.pactOffers).forEach((offer) => {
    if (offer.status === "pending" && offer.recipientId === localPlayerId) {
      const div = document.createElement("div");
      div.className = "pact-offer-item";
      div.dataset.offerId = offer.offerId;
      div.innerHTML = `
        <p><strong>${offer.senderName}</strong> size pakt teklif ediyor.</p>
        <p>Tur: ${offer.duration}, Para: ${offer.cost}$</p>
        <button class="accept-btn" data-offer-id="${offer.offerId}">Kabul</button>
        <button class="reject-btn" data-offer-id="${offer.offerId}">Reddet</button>
      `;
      cont.appendChild(div);
    }
  });
}
function displayActivePacts() {
  const cont = document.getElementById("active-pacts-container");
  if (!cont) return;
  cont.innerHTML = "";
  if (!roomData?.pacts) return;

  for (let pId in roomData.pacts) {
    const pact = roomData.pacts[pId];
    if (pact.active && roomData.round <= pact.expirationRound) {
      if (pact.playerA === localPlayerId || pact.playerB === localPlayerId) {
        const oPid =
          pact.playerA === localPlayerId ? pact.playerB : pact.playerA;
        const oName = roomData.players[oPid]?.name || "???";
        const rLeft = pact.expirationRound - roomData.round + 1;
        const d = document.createElement("div");
        d.className = "active-pact-item";
        d.innerHTML = `
          <p>Pakt: <strong>${oName}</strong></p>
          <p>Kalan Tur: <strong>${rLeft}</strong></p>
        `;
        cont.appendChild(d);
      }
    }
  }
}
document
  .getElementById("pact-pending-offers")
  .addEventListener("click", (e) => {
    if (e.target.classList.contains("accept-btn")) {
      const offId = e.target.getAttribute("data-offer-id");
      acceptPactOffer(offId);
    } else if (e.target.classList.contains("reject-btn")) {
      const offId = e.target.getAttribute("data-offer-id");
      rejectPactOffer(offId);
    }
  });
function acceptPactOffer(offerId) {
  const off = roomData.pactOffers[offerId];
  if (!off || off.status !== "pending") return;
  if (hasActivePact(off.senderId, off.recipientId)) {
    showNotification("Zaten aktif pakt var!");
    roomRef.child("pactOffers").child(offerId).update({ status: "rejected" });
    return;
  }
  const s = roomData.players[off.senderId];
  const r = roomData.players[off.recipientId];
  if (!s || !r) return;
  if (s.money < off.cost) {
    showNotification("Gönderende yeterli para yok, teklif geçersiz.");
    roomRef.child("pactOffers").child(offerId).update({ status: "rejected" });
    return;
  }
  const exp = (roomData.round || 1) + off.duration;
  const pactId = db.ref().push().key;
  const ups = {};
  ups[`pactOffers/${offerId}/status`] = "accepted";
  ups[`players/${off.senderId}/money`] = s.money - off.cost;
  ups[`players/${off.recipientId}/money`] = r.money + off.cost;
  ups[`pacts/${pactId}`] = {
    playerA: off.senderId,
    playerB: off.recipientId,
    active: true,
    cost: off.cost,
    duration: off.duration,
    expirationRound: exp
  };
  roomRef.update(ups);
  broadcastNotification(
    `Pakt Anlaşması: ${s.name} & ${r.name} (Tur:${off.duration}, Para:${off.cost}$).`
  );
  showNotification("Pakt teklifi kabul edildi!");
}
function rejectPactOffer(offerId) {
  const off = roomData.pactOffers[offerId];
  if (!off || off.status !== "pending") return;
  roomRef.child("pactOffers").child(offerId).update({ status: "rejected" });
  broadcastNotification(`Pakt Reddedildi: ${off.senderName} → Reddedildi.`);
  showNotification("Pakt teklifi reddedildi.");
}
function updatePactRecipientSelect() {
  const sel = document.getElementById("pact-offer-recipient");
  if (!sel) return;
  sel.innerHTML = "";
  if (!roomData?.playerOrder) return;
  roomData.playerOrder.forEach((pid) => {
    if (pid !== localPlayerId && roomData.players[pid]) {
      const o = document.createElement("option");
      o.value = pid;
      o.textContent = roomData.players[pid].name;
      sel.appendChild(o);
    }
  });
}

/*****************************************************************
 * 17. Market (Ticaret)
 *****************************************************************/
document
  .getElementById("create-trade-offer-btn")
  .addEventListener("click", createTradeOffer);

function createTradeOffer() {
  if (!roomData?.players?.[localPlayerId]) {
    showNotification("Oyun verisi geçersiz!");
    return;
  }
  const itemType = document.getElementById("trade-item-type").value;
  const qty = parseInt(document.getElementById("trade-quantity").value);
  const price = parseInt(document.getElementById("trade-price").value);
  if (isNaN(qty) || qty <= 0 || isNaN(price) || price <= 0) {
    showNotification("Geçerli miktar/fiyat girin!");
    return;
  }
  const seller = roomData.players[localPlayerId];
  let enough = false;
  if (itemType === "petrol" && seller.petrol >= qty) enough = true;
  if (itemType === "wheat" && seller.wheat >= qty) enough = true;
  if (!enough) {
    showNotification("Yeterli miktar yok!");
    return;
  }
  // Ambargo
  const embSel = document.getElementById("embargo-players");
  let embargoList = [];
  for (let i = 0; i < embSel.options.length; i++) {
    if (embSel.options[i].selected) {
      embargoList.push(embSel.options[i].value);
    }
  }

  const tRef = roomRef.child("tradeOffers").push();
  const newOffer = {
    offerId: tRef.key,
    sellerId: localPlayerId,
    sellerName: seller.name,
    itemType,
    quantity: qty,
    price,
    status: "pending",
    embargo: embargoList
  };
  tRef.set(newOffer);
  broadcastNotification(
    `${seller.name} ticaret teklifi oluşturdu (${itemType}, adet:${qty}, fiyat:${price}$).`
  );
  showNotification("Ticaret teklifi oluşturuldu!");
}

function displayTradeOffers() {
  const tList = document.getElementById("trade-offers-list");
  if (!tList) return;
  tList.innerHTML = "";
  if (!roomData?.tradeOffers) return;

  const offers = Object.values(roomData.tradeOffers);
  offers.forEach((offer) => {
    if (offer.status === "pending") {
      if (offer.embargo && offer.embargo.includes(localPlayerId)) {
        return; // Embargo
      }
      const div = document.createElement("div");
      div.className = "offer-item";
      let itemLabel = offer.itemType === "petrol" ? "Petrol" : "Buğday";
      let html = `
        <p><strong>Satıcı:</strong> ${offer.sellerName}</p>
        <p><strong>Ürün:</strong> ${itemLabel}</p>
        <p><strong>Mevcut Miktar:</strong> ${offer.quantity}</p>
        <p><strong>Birim Fiyat:</strong> ${offer.price} $</p>
      `;
      if (offer.sellerId !== localPlayerId) {
        html += `
          <label style="font-size:14px;color:#ccc;">Almak istediğiniz miktar:</label>
          <input type="number" class="partial-buy-quantity" placeholder="Miktar" min="1" max="${offer.quantity}" />
          <button class="partial-buy-btn">Satın Al</button>
        `;
      } else {
        html += `
          <button class="cancel-offer-btn" style="background:linear-gradient(45deg, #c0392b, #e74c3c); margin-top:10px;">İptal Et</button>
        `;
      }
      if (offer.embargo?.length) {
        const embUsers = offer.embargo
          .map((id) => roomData.players[id]?.name || "???")
          .join(", ");
        html += `<p style="color:red;"><strong>Ambargo:</strong> ${embUsers}</p>`;
      }
      div.innerHTML = html;

      const pbBtn = div.querySelector(".partial-buy-btn");
      if (pbBtn) {
        pbBtn.addEventListener("click", () => {
          const inp = div.querySelector(".partial-buy-quantity");
          const amt = parseInt(inp.value);
          if (isNaN(amt) || amt <= 0) {
            showNotification("Miktar hatalı!");
            return;
          }
          acceptTradeOffer(offer.offerId, amt);
        });
      }
      const cBtn = div.querySelector(".cancel-offer-btn");
      if (cBtn) {
        cBtn.addEventListener("click", () => {
          cancelTradeOffer(offer.offerId);
        });
      }
      tList.appendChild(div);
    }
  });
}

function acceptTradeOffer(offerId, buyAmount) {
  if (!roomData?.tradeOffers?.[offerId]) {
    showNotification("Teklif bulunamadı!");
    return;
  }
  const off = roomData.tradeOffers[offerId];
  if (off.status !== "pending") {
    showNotification("Bu teklif geçerli değil!");
    return;
  }
  const seller = roomData.players[off.sellerId];
  const buyer = roomData.players[localPlayerId];
  if (!seller || !buyer) return;
  if (buyAmount > off.quantity) {
    showNotification("Stok yetersiz!");
    return;
  }
  const totalCost = off.price * buyAmount;
  if (buyer.money < totalCost) {
    showNotification("Yeterli paranız yok!");
    return;
  }

  const ups = {};
  let hasEnough = false;
  if (off.itemType === "petrol") {
    if (seller.petrol >= buyAmount) {
      hasEnough = true;
      ups[`players/${off.sellerId}/petrol`] = seller.petrol - buyAmount;
      ups[`players/${localPlayerId}/petrol`] = buyer.petrol + buyAmount;
    }
  } else if (off.itemType === "wheat") {
    if (seller.wheat >= buyAmount) {
      hasEnough = true;
      ups[`players/${off.sellerId}/wheat`] = seller.wheat - buyAmount;
      ups[`players/${localPlayerId}/wheat`] = buyer.wheat + buyAmount;
    }
  }
  if (!hasEnough) {
    showNotification("Satıcının yeterli miktarı kalmamış!");
    return;
  }
  ups[`players/${localPlayerId}/money`] = buyer.money - totalCost;
  ups[`players/${off.sellerId}/money`] = seller.money + totalCost;
  let newQ = off.quantity - buyAmount;
  if (newQ <= 0) {
    ups[`tradeOffers/${offerId}/status`] = "completed";
  }
  ups[`tradeOffers/${offerId}/quantity`] = newQ;

  roomRef.update(ups, () => {
    broadcastNotification(
      `Ticaret: ${seller.name} -> ${buyer.name} (${buyAmount} x ${off.itemType}).`
    );
    showNotification("Ticaret gerçekleşti!");
    const cMsg = {
      sender: "Sistem",
      senderId: "system",
      text: `Ticaret Onaylandı: ${seller.name} -> ${buyer.name}, ${buyAmount} x ${off.itemType}`,
      recipientId: "",
      timestamp: firebase.database.ServerValue.TIMESTAMP
    };
    roomRef.child("chat").push(cMsg);
  });
}

function cancelTradeOffer(offerId) {
  if (!roomData?.tradeOffers?.[offerId]) return;
  const off = roomData.tradeOffers[offerId];
  if (off.sellerId !== localPlayerId) {
    showNotification("Sadece kendi teklifinizi iptal edebilirsiniz!");
    return;
  }
  if (off.status !== "pending") {
    showNotification("Bu teklif zaten tamamlanmış/iptal.");
    return;
  }
  roomRef.child("tradeOffers").child(offerId).update({ status: "cancelled" });
  broadcastNotification("Ticaret teklifi iptal edildi: " + off.sellerName);
  showNotification("Teklif iptal edildi.");
}

function updateEmbargoPlayersSelect() {
  const sel = document.getElementById("embargo-players");
  if (!sel) return;
  sel.innerHTML = "";
  if (!roomData?.playerOrder) return;
  roomData.playerOrder.forEach((pid) => {
    if (pid !== localPlayerId && roomData.players[pid]) {
      const o = document.createElement("option");
      o.value = pid;
      o.textContent = roomData.players[pid].name;
      sel.appendChild(o);
    }
  });
}

/*****************************************************************
 * 18. Sohbet
 *****************************************************************/
function toggleChat(open) {
  const cPop = document.getElementById("chat-popup");
  cPop.style.display = open ? "flex" : "none";
  chatOpen = open;
  if (chatOpen) {
    unreadMessages = 0;
    updateChatBadge();
  }
}
document.getElementById("send-chat-btn").addEventListener("click", sendChatMessage);
document
  .getElementById("chat-input")
  .addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendChatMessage();
  });

function sendChatMessage() {
  const input = document.getElementById("chat-input");
  const txt = input.value.trim();
  if (!txt || !roomRef) return;

  let sName = "Anon";
  if (roomData?.players?.[localPlayerId]) {
    sName = roomData.players[localPlayerId].name;
  }
  const msg = {
    sender: sName,
    senderId: localPlayerId,
    text: txt,
    recipientId: "",
    timestamp: firebase.database.ServerValue.TIMESTAMP
  };
  roomRef.child("chat").push(msg, () => {
    input.value = "";
  });
}

/** Özel Mesaj */
document
  .getElementById("send-private-message-btn")
  .addEventListener("click", () => {
    const pmInput = document.getElementById("private-message-input");
    const pmRec = document.getElementById("private-message-recipient");
    const pmText = pmInput.value.trim();
    const rec = pmRec.value;
    if (!pmText || !rec) return;
    let sName = "Anon";
    if (roomData?.players?.[localPlayerId]) {
      sName = roomData.players[localPlayerId].name;
    }
    const pm = {
      sender: sName,
      senderId: localPlayerId,
      text: pmText,
      recipientId: rec,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    };
    roomRef.child("chat").push(pm, () => {
      pmInput.value = "";
      showNotification("Özel mesaj gönderildi!");
    });
  });

function appendChatMessage(m) {
  if (m.recipientId && m.recipientId !== "") {
    // Özel mesaj
    if (
      m.senderId !== localPlayerId &&
      m.recipientId !== localPlayerId
    ) {
      return;
    }
  }
  const cDiv = document.getElementById("chat-messages");
  const div = document.createElement("div");

  if (m.recipientId && m.recipientId !== "") {
    const rName = roomData.players[m.recipientId]?.name || "???";
    if (m.senderId === localPlayerId) {
      div.innerHTML = `<strong>[PM to ${rName}]:</strong> ${m.text}`;
    } else {
      div.innerHTML = `<strong>[PM from ${m.sender}]:</strong> ${m.text}`;
    }
    div.style.color = "#f39c12";
  } else {
    div.textContent = `${m.sender}: ${m.text}`;
  }
  cDiv.appendChild(div);
  cDiv.scrollTop = cDiv.scrollHeight;

  if (!chatOpen && m.senderId !== localPlayerId) {
    unreadMessages++;
    updateChatBadge();
  }
}

function updateChatBadge() {
  const b = document.getElementById("open-chat-btn");
  b.dataset.badge = unreadMessages > 0 ? unreadMessages : "";
}
function updatePrivateMessageRecipientSelect() {
  const pmSel = document.getElementById("private-message-recipient");
  if (!pmSel) return;
  pmSel.innerHTML = "";
  if (!roomData?.playerOrder) return;
  roomData.playerOrder.forEach((pid) => {
    if (pid !== localPlayerId) {
      const p = roomData.players[pid];
      if (p) {
        const opt = document.createElement("option");
        opt.value = pid;
        opt.textContent = p.name;
        pmSel.appendChild(opt);
      }
    }
  });
}

/*****************************************************************
 * 19. Yardımcı Fonksiyonlar
 *****************************************************************/
function generateRoomCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function autoReconnect() {
  const savedRoom = localStorage.getItem("roomCode");
  if (savedRoom) {
    const r = db.ref("rooms/" + savedRoom);
    r.once("value", (snap) => {
      if (!snap.exists()) return;
      const d = snap.val();
      if (!d.players || !d.players[localPlayerId]) return;
      currentRoomCode = savedRoom;
      roomRef = r;
      joinRoomAndListen();
      showGamePage();
      document.getElementById("display-room-code").textContent = savedRoom;
    });
  }
}

/*****************************************************************
 * DOMContentLoaded
 *****************************************************************/
document.addEventListener("DOMContentLoaded", () => {
  if (!localStorage.getItem("playerId")) {
    localStorage.setItem("playerId", Math.random().toString(36).substr(2, 9));
  }
  localPlayerId = localStorage.getItem("playerId");

  // Otomatik reconnect
  autoReconnect();

  // GameContainer observer: map init
  const gameContainerObserver = new MutationObserver(() => {
    if (gameContainer.style.display !== "none") {
      initializeMap();
    }
  });
  gameContainerObserver.observe(document.getElementById("game-container"), {
    attributes: true,
    attributeFilter: ["style"]
  });
});
