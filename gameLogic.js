/***************************************************************
 *  gameLogic.js
 *  Yeni Özellikler:
 *   1) Profilde Bayrak Çizimi (Canvas) ve Kaydetme
 *   2) Lobby'de Tek Buton: Oda Oluştur + Davet Linki
 *   3) Online/Offline Arkadaş Durumu (basit presence)
 *   4) Oyunda ülke rengi yerine bayrak gösterimi (Tooltips)
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
let currentUser = null;            // Firebase Auth kullanıcısı (uid)
let currentUserData = null;        // DB'deki kullanıcı verisi
let localPlayerId = null;          // Oyun içi ID (localStorage)
let currentRoomCode = null;
let roomRef = null;
let roomData = null;

let selectedCountry = null;
let map = null;
let geoJsonLayer = null;
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
    // Kullanıcı verisini çek
    const snap = await db.ref("users/" + user.uid).once("value");
    currentUserData = snap.val();
    if (!currentUserData) {
      showNotification("Kullanıcı veriniz oluşturulmamış, lütfen kayıt olun.");
    } else {
      document.getElementById("profile-username").textContent =
        currentUserData.displayName || "Kullanıcı Adınız";

      // Presence (online/offline) ayarla
      setupPresence(user.uid);

      // Profil ekranını doldur
      loadUserFriends();
      loadFriendRequests();
      loadRoomInvites();
      loadFriendInviteList();
      initFlagPainter();
      showProfilePage();

      // Linkte room parametresi varsa, oraya katıl
      const urlParams = new URLSearchParams(window.location.search);
      const roomCodeParam = urlParams.get("room");
      if (roomCodeParam) {
        // Otomatik odaya katıl
        joinRoomByInviteLink(roomCodeParam);
      }
    }
  } else {
    currentUser = null;
    currentUserData = null;
    showAuthPage();
  }
});

/** GİRİŞ / KAYIT FORM ELEMENTLERİ */
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

/** GİRİŞ YAP */
document.getElementById("login-btn").addEventListener("click", async () => {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value.trim();
  if (!email || !password) {
    showNotification("Lütfen tüm alanları doldurun!");
    return;
  }
  try {
    await auth.signInWithEmailAndPassword(email, password);
    showNotification("Giriş başarılı!");
  } catch (err) {
    showNotification("Giriş hata: " + err.message);
  }
});

/** KAYIT OL */
document.getElementById("register-btn").addEventListener("click", async () => {
  const email = document.getElementById("register-email").value.trim();
  const password = document.getElementById("register-password").value.trim();
  const confirm = document
    .getElementById("register-confirm-password")
    .value.trim();
  const displayName = document
    .getElementById("register-display-name")
    .value.trim();

  if (!email || !password || !confirm || !displayName) {
    showNotification("Tüm alanları doldurun!");
    return;
  }
  if (password !== confirm) {
    showNotification("Şifreler eşleşmiyor!");
    return;
  }
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await db.ref("users/" + cred.user.uid).set({
      email,
      displayName,
      friends: {},
      friendRequests: {},
      roomInvites: {},
      flag: null // Başlangıçta bayrak yok
    });
    showNotification("Kayıt başarılı, giriş yapıldı!");
  } catch (err) {
    showNotification("Kayıt hata: " + err.message);
  }
});

/** ÇIKIŞ */
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
  // Basit bir presence: .info/connected -> status/ uid
  const userStatusRef = db.ref("status/" + uid);
  const connRef = db.ref(".info/connected");
  connRef.on("value", (snap) => {
    if (snap.val() === false) {
      return;
    }
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
 * 6. Profil Ekranı (Arkadaşlar, İstekler, Bayrak)
 *****************************************************************/
document.getElementById("go-lobby-btn").addEventListener("click", () => {
  showLobbyPage();
});

async function loadUserFriends() {
  const friendList = document.getElementById("friend-list");
  friendList.innerHTML = "";
  if (!currentUserData?.friends) return;

  const friendIds = Object.keys(currentUserData.friends);
  for (const fid of friendIds) {
    const snap = await db.ref("users/" + fid).once("value");
    const fData = snap.val();
    if (!fData) continue;

    // Presence durumunu da çek
    let isOnline = false;
    const statusSnap = await db.ref("status/" + fid).once("value");
    const statusVal = statusSnap.val();
    if (statusVal && statusVal.state === "online") {
      isOnline = true;
    }

    const div = document.createElement("div");
    div.className = "friend-item";
    let statusSpan = isOnline
      ? `<span class="online-status">(Online)</span>`
      : `<span class="offline-status">(Offline)</span>`;
    div.innerHTML = `
      <span>${fData.displayName} ${statusSpan}</span>
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

  const reqIds = Object.keys(currentUserData.friendRequests);
  for (const rid of reqIds) {
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
      const fromUid = e.target.getAttribute("data-fid");
      await acceptFriendRequest(fromUid);
    } else if (e.target.classList.contains("reject-friend-btn")) {
      const fromUid = e.target.getAttribute("data-fid");
      await rejectFriendRequest(fromUid);
    }
  });

async function acceptFriendRequest(fromUid) {
  if (!currentUser) return;
  await db.ref(`users/${currentUser.uid}/friends/${fromUid}`).set(true);
  await db.ref(`users/${fromUid}/friends/${currentUser.uid}`).set(true);
  await db
    .ref(`users/${currentUser.uid}/friendRequests/${fromUid}`)
    .remove();
  showNotification("Arkadaşlık isteği kabul edildi!");
}

async function rejectFriendRequest(fromUid) {
  if (!currentUser) return;
  await db
    .ref(`users/${currentUser.uid}/friendRequests/${fromUid}`)
    .remove();
  showNotification("Arkadaşlık isteği reddedildi.");
}

/** Arkadaş Ekle */
document
  .getElementById("send-friend-request-btn")
  .addEventListener("click", async () => {
    const userNameInput = document
      .getElementById("add-friend-username")
      .value.trim();
    if (!userNameInput) {
      showNotification("Kullanıcı Adı girin!");
      return;
    }

    const allUsersSnap = await db.ref("users").once("value");
    const allUsersData = allUsersSnap.val();
    let targetUid = null;
    for (let uid in allUsersData) {
      const dName = allUsersData[uid].displayName || "";
      if (dName.toLowerCase() === userNameInput.toLowerCase()) {
        targetUid = uid;
        break;
      }
    }
    if (!targetUid) {
      showNotification("Bu kullanıcı adı bulunamadı!");
      return;
    }
    if (targetUid === currentUser.uid) {
      showNotification("Kendinize istek gönderemezsiniz!");
      return;
    }

    // Gönder
    await db
      .ref(`users/${targetUid}/friendRequests/${currentUser.uid}`)
      .set(true);
    showNotification("Arkadaşlık isteği gönderildi!");
  });

/** Arkadaş Silme */
document
  .getElementById("friend-list")
  .addEventListener("click", async (e) => {
    if (e.target.classList.contains("remove-friend-btn")) {
      const fid = e.target.getAttribute("data-fid");
      await removeFriend(fid);
    }
  });

async function removeFriend(fid) {
  if (!currentUser) return;
  await db.ref(`users/${currentUser.uid}/friends/${fid}`).remove();
  await db.ref(`users/${fid}/friends/${currentUser.uid}`).remove();
  showNotification("Arkadaş silindi.");
}

/** Oda Davetleri */
function loadRoomInvites() {
  const inviteList = document.getElementById("room-invite-list");
  inviteList.innerHTML = "";
  if (!currentUserData?.roomInvites) return;

  Object.keys(currentUserData.roomInvites).forEach((invId) => {
    const inv = currentUserData.roomInvites[invId];
    if (!inv) return;
    const div = document.createElement("div");
    div.className = "room-invite-item";
    div.innerHTML = `
      <span>${inv.fromName} | Oda Kodu: ${inv.roomCode}</span>
      <div>
        <button class="accept-room-invite-btn" data-iid="${invId}">Kabul</button>
        <button class="reject-room-invite-btn" data-iid="${invId}">Reddet</button>
      </div>
    `;
    inviteList.appendChild(div);
  });
}

document
  .getElementById("room-invite-list")
  .addEventListener("click", async (e) => {
    if (e.target.classList.contains("accept-room-invite-btn")) {
      const inviteId = e.target.getAttribute("data-iid");
      await acceptRoomInvite(inviteId);
    } else if (e.target.classList.contains("reject-room-invite-btn")) {
      const inviteId = e.target.getAttribute("data-iid");
      await rejectRoomInvite(inviteId);
    }
  });

async function acceptRoomInvite(inviteId) {
  const inviteData = currentUserData.roomInvites[inviteId];
  if (!inviteData) return;

  // Odaya katıl
  await joinRoomByInviteLink(inviteData.roomCode);

  // Daveti sil
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
  const inviteList = document.getElementById("invite-friend-list");
  inviteList.innerHTML = "";
  if (!currentUserData?.friends) return;

  const fIds = Object.keys(currentUserData.friends);
  fIds.forEach(async (fid) => {
    const snap = await db.ref("users/" + fid).once("value");
    const fData = snap.val();
    if (!fData) return;

    // presence
    let isOnline = false;
    const statSnap = await db.ref("status/" + fid).once("value");
    if (statSnap.val() && statSnap.val().state === "online") {
      isOnline = true;
    }
    let statusLabel = isOnline ? "(Online)" : "(Offline)";

    const div = document.createElement("div");
    div.className = "invite-friend-item";
    div.innerHTML = `<span>${fData.displayName} ${statusLabel}</span>`;
    inviteList.appendChild(div);
  });
}

/** Odaya Davet Gönder */
document
  .getElementById("send-room-invite-btn")
  .addEventListener("click", async () => {
  showNotification("Bu örnekte, oda daveti 'odaya katılmışsanız' job bulamıyor. Oda yoksa hata.");

  // Gerçekte: Mevcut odaya davet -> roomRef ? roomData? 
  // Örnek: If "currentRoomCode" var, or "roomRef" var.
  if (!currentRoomCode) {
    showNotification("Şu anda bir odaya bağlı değilsiniz! Lütfen oda oluşturup oyuna girin.");
    return;
  }
  if (!currentUserData?.friends) {
    showNotification("Arkadaş listeniz boş.");
    return;
  }
  // Tüm arkadaşlara oda daveti
  const friendsIds = Object.keys(currentUserData.friends);
  for (let fid of friendsIds) {
    const newInvKey = db.ref(`users/${fid}/roomInvites`).push().key;
    await db.ref(`users/${fid}/roomInvites/${newInvKey}`).set({
      fromUid: currentUser.uid,
      fromName: currentUserData.displayName,
      roomCode: currentRoomCode,
      status: "pending"
    });
  }
  showNotification("Arkadaşlara oda daveti gönderildi!");
});

/*****************************************************************
 * 7. Bayrak Oluşturma (Canvas)
 *****************************************************************/
function initFlagPainter() {
  const canvas = document.getElementById("flag-canvas");
  if (!canvas) return; // Güvenlik
  const ctx = canvas.getContext("2d");

  let drawing = false;
  let currentColor = "#000000";
  let eraserMode = false;

  // Canvas Eventleri
  canvas.addEventListener("mousedown", (e) => {
    drawing = true;
    ctx.beginPath();
    ctx.moveTo(e.offsetX, e.offsetY);
  });
  canvas.addEventListener("mousemove", (e) => {
    if (!drawing) return;
    if (eraserMode) {
      ctx.strokeStyle = "#ffffff"; // Eraser: beyaz arka plan
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

  // Renk picker
  const colorPicker = document.getElementById("flag-color-picker");
  colorPicker.addEventListener("change", () => {
    currentColor = colorPicker.value;
    eraserMode = false;
  });

  // Silgi
  document.getElementById("flag-eraser-btn").addEventListener("click", () => {
    eraserMode = true;
  });

  // Temizle
  document.getElementById("flag-clear-btn").addEventListener("click", () => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  });
  // İlk açıldığında beyaz zemin
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Kaydet
  document.getElementById("save-flag-btn").addEventListener("click", async () => {
    if (!currentUser) return;
    const dataUrl = canvas.toDataURL("image/png");
    // DB'ye kaydet
    await db.ref("users/" + currentUser.uid + "/flag").set(dataUrl);
    showNotification("Bayrak kaydedildi!");
    // currentUserData güncelleyelim:
    currentUserData.flag = dataUrl;
  });
}

/*****************************************************************
 * 8. Lobby: Oda Oluştur (tek buton) + Davet Linki
 *****************************************************************/
document.getElementById("create-room-btn").addEventListener("click", async () => {
  // localPlayerId
  if (!localStorage.getItem("playerId")) {
    localStorage.setItem(
      "playerId",
      Math.random().toString(36).substr(2, 9)
    );
  }
  localPlayerId = localStorage.getItem("playerId");

  const roomCode = generateRoomCode();
  const ref = db.ref("rooms/" + roomCode);
  const newRoomData = {
    roomCode,
    gameState: "waiting",
    currentTurnIndex: 0,
    round: 1,
    playerOrder: [localPlayerId],
    players: {},
    countryData: {},
    createdAt: firebase.database.ServerValue.TIMESTAMP
  };

  // Oyun içi ad: currentUserData.displayName
  // Bayrak: currentUserData.flag
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

  // Invite link
  const inviteLinkContainer = document.getElementById("invite-link-container");
  const inviteLinkInput = document.getElementById("invite-link");
  inviteLinkContainer.style.display = "block";
  const fullUrl = `${window.location.origin}?room=${roomCode}`;
  inviteLinkInput.value = fullUrl;

  // Kopyala buton
  document
    .getElementById("copy-invite-btn")
    .addEventListener("click", () => {
      inviteLinkInput.select();
      document.execCommand("copy");
      showNotification("Davet linki kopyalandı!");
    });

  showNotification("Oda oluşturuldu! Kod: " + roomCode);
  // Ülke verilerini yükle
  loadAndInitializeGeoJson(ref);
  // Odaya girebilir
  joinRoomAndListen();
  showGamePage();
  document.getElementById("display-room-code").textContent = roomCode;
});

/** Invite Link Tıklayanlar */
async function joinRoomByInviteLink(roomCode) {
  // localPlayerId
  if (!localStorage.getItem("playerId")) {
    localStorage.setItem("playerId", Math.random().toString(36).substr(2, 9));
  }
  localPlayerId = localStorage.getItem("playerId");

  const ref = db.ref("rooms/" + roomCode);
  const snapshot = await ref.once("value");
  if (!snapshot.exists()) {
    showNotification("Böyle bir oda bulunamadı! (Davet linki geçersiz.)");
    return;
  }
  const rData = snapshot.val();
  if (rData.gameState !== "waiting") {
    showNotification("Oyun başlamış veya başlamak üzere, katılamazsınız.");
    return;
  }

  // Odaya ekle
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

  await ref.update(ups);
  localStorage.setItem("roomCode", roomCode);
  currentRoomCode = roomCode;
  roomRef = ref;

  showGamePage();
  document.getElementById("display-room-code").textContent = roomCode;
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
    roomRef.child("chat").on("child_added", (cSnap) => {
      appendChatMessage(cSnap.val());
    });
    roomRef.child("notifications").on("child_added", (nSnap) => {
      const d = nSnap.val();
      if (d && d.text) {
        displayGlobalNotification(d.text);
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
    const i = roomData.currentTurnIndex || 0;
    const curPid = roomData.playerOrder[i];
    if (roomData.players[curPid]) {
      document.getElementById("current-player").textContent =
        roomData.players[curPid].name;
    }
  }
  // Durum
  handleGameState(roomData.gameState);

  // Oyuncu Listesi
  const playersInfoDiv = document.getElementById("players-info");
  playersInfoDiv.innerHTML = "";
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
        <p>Petrol: <span>${pData.petrol}</span> varil</p>
        <p>Buğday: <span>${pData.wheat}</span></p>
      `;
      playersInfoDiv.appendChild(div);
    });
  }

  // Harita
  if (map && roomData.countryData && geoJsonLayer) {
    geoJsonLayer.eachLayer((layer) => {
      const cname = layer.feature.properties.name;
      const cData = roomData.countryData[cname];
      if (cData) {
        if (cData.owner && roomData.players[cData.owner]) {
          // Haritayı bayrakla temsil edebiliriz. 
          // Basit yaklaşım: doldurma rengi sabit, tooltip bayrağı
          layer.setStyle({
            fillColor: "#444",
            fillOpacity: 0.7
          });
        } else {
          layer.setStyle({ fillColor: "#ccc", fillOpacity: 0.7 });
        }
        layer.setTooltipContent(getCountryPopupContent(cname, cData));
      }
    });
  }

  // Timer
  if (roomData.gameState === "started") {
    if (isMyTurn()) startTurnTimer();
    else stopTurnTimer();
  } else {
    stopTurnTimer();
  }

  // Select listelerini yenile
  updateRecipientSelects();
  updatePactRecipientSelect();
  updatePrivateMessageRecipientSelect();
  updateEmbargoPlayersSelect();
  updateSupportRecipientSelect();
}

function handleGameState(st) {
  const startBtn = document.getElementById("start-game-btn");
  const cdSpan = document.getElementById("start-countdown");
  if (!st) return;

  if (st === "waiting") {
    startBtn.style.display = roomData.players[localPlayerId]?.isHost
      ? "block"
      : "none";
    cdSpan.style.display = "none";
  } else if (st === "starting") {
    startBtn.style.display = "none";
    cdSpan.style.display = "inline";
    startCountdownListener();
  } else if (st === "started") {
    startBtn.style.display = "none";
    cdSpan.style.display = "none";
    clearInterval(startInterval);
    startInterval = null;
  }
}

/** Oyun Başlat */
document.getElementById("start-game-btn").addEventListener("click", () => {
  if (!roomData?.players[localPlayerId]?.isHost) return;
  if (roomData.gameState !== "waiting") return;
  const now = Date.now();
  const st = now + 30000; // 30 sn
  roomRef.update({ gameState: "starting", startTime: st });
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
    const sLeft = Math.floor(diff / 1000);
    sc.textContent = sLeft;
  }, 1000);
}

/** Haritayı Başlat */
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
    .then((res) => res.json())
    .then((geoData) => {
      geoJsonLayer = L.geoJson(geoData, {
        style: () => ({
          color: "#555",
          weight: 1,
          fillColor: "#ccc",
          fillOpacity: 0.7
        }),
        onEachFeature: (feat, lyr) => {
          const cname = feat.properties.name;
          lyr.bindTooltip(
            getCountryPopupContent(
              cname,
              roomData && roomData.countryData ? roomData.countryData[cname] : {}
            ),
            {
              permanent: infoCardsPermanent,
              direction: "center",
              className: "country-popup-tooltip"
            }
          );
          lyr.on("click", () => selectCountry(cname, lyr));
        }
      }).addTo(map);
    });
}

/** Ülke Data */
function loadAndInitializeGeoJson(ref) {
  fetch(
    "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json"
  )
    .then((res) => res.json())
    .then((geoData) => {
      const feats = geoData.features;
      let oilIdx = [];
      while (oilIdx.length < 43 && oilIdx.length < feats.length) {
        const r = Math.floor(Math.random() * feats.length);
        if (!oilIdx.includes(r)) oilIdx.push(r);
      }
      let wheatIdx = [];
      while (wheatIdx.length < 60 && wheatIdx.length < feats.length) {
        const r = Math.floor(Math.random() * feats.length);
        if (!wheatIdx.includes(r)) wheatIdx.push(r);
      }
      const cDataInit = {};
      feats.forEach((f, i) => {
        const cname = f.properties.name;
        let oilProduction = 0;
        if (oilIdx.includes(i)) {
          oilProduction =
            Math.floor(Math.random() * (500 - 150 + 1)) + 150;
        }
        let wheatProduction = 0;
        if (wheatIdx.includes(i)) {
          wheatProduction =
            Math.floor(Math.random() * (700 - 200 + 1)) + 200;
        }
        cDataInit[cname] = {
          income: Math.floor(Math.random() * 500) + 100,
          soldiers: 0,
          owner: null,
          barracksCount: 0,
          factories: 0,
          refineries: 0,
          oilProduction,
          wheatProduction,
          grainMills: 0,
          supporters: {},
          castleDefenseLevel: 0,
          castleNextUpgradeCost: null
        };
      });
      ref.child("countryData").set(cDataInit);
    });
}

function getCountryPopupContent(cname, cData) {
  if (!cData) cData = {};
  const p = cData.owner ? roomData.players[cData.owner] : null;
  let ownerName = p ? p.name : "Yok";

  // Bayrak resmi var mı?
  let flagHtml = "";
  if (p && p.flag) {
    flagHtml = `<p><img src="${p.flag}" alt="Bayrak" style="max-width:100px; border:1px solid #ccc"/></p>`;
  }

  // Hesaplamalar
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
      <p><i class="fas fa-crown"></i> Sahip: ${ownerName}</p>
    </div>
  `;
}

function selectCountry(cname, layer) {
  selectedCountry = cname;
  showNotification(`Seçilen ülke: ${cname}`, 1500);

  layer.setStyle({ weight: 4, color: "#FF4500" });
  setTimeout(() => {
    const cData = roomData.countryData[cname];
    if (cData && cData.owner) {
      layer.setStyle({
        fillColor: "#444",
        fillOpacity: 0.7,
        weight: 1,
        color: "#555"
      });
    } else {
      layer.setStyle({
        fillColor: "#ccc",
        fillOpacity: 0.7,
        weight: 1,
        color: "#555"
      });
    }
  }, 800);

  updateCastleUpgradeCostUI();
}

/** Bilgi Kartlarını Aç/Kapa */
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
    const cname = layer.feature.properties.name;
    const cData = roomData.countryData[cname];
    layer.bindTooltip(getCountryPopupContent(cname, cData), {
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
  const area = document.getElementById("notification-area");
  if (!area) return;

  const div = document.createElement("div");
  div.className = "notification-item";
  div.textContent = msg;
  area.appendChild(div);

  setTimeout(() => {
    if (area.contains(div)) {
      area.removeChild(div);
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

/** Bildirim Butonu */
document
  .getElementById("open-notifications-btn")
  .addEventListener("click", () => {
    notificationsMuted = !notificationsMuted;
    showNotification(
      notificationsMuted
        ? "Bildirimler kapatıldı."
        : "Bildirimler açıldı."
    );
  });

/*****************************************************************
 * 11. 60 Saniye Tur Sayacı
 *****************************************************************/
function isMyTurn() {
  if (!roomData?.playerOrder) return false;
  if (roomData.gameState !== "started") return false;
  const idx = roomData.currentTurnIndex || 0;
  return roomData.playerOrder[idx] === localPlayerId;
}

function startTurnTimer() {
  turnTimeRemaining = 60;
  const timerEl = document.getElementById("turn-timer");
  timerEl.textContent = `${turnTimeRemaining}s`;
  if (turnTimerInterval) clearInterval(turnTimerInterval);

  turnTimerInterval = setInterval(() => {
    turnTimeRemaining--;
    if (turnTimeRemaining <= 0) {
      clearInterval(turnTimerInterval);
      timerEl.textContent = "0s";
      if (isMyTurn()) {
        nextTurn(true);
      }
    } else {
      timerEl.textContent = `${turnTimeRemaining}s`;
    }
  }, 1000);
}

function stopTurnTimer() {
  if (turnTimerInterval) clearInterval(turnTimerInterval);
  const timerEl = document.getElementById("turn-timer");
  if (timerEl) timerEl.textContent = "60s";
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
  // Tur sonu gelir
  if (pl.countries && roomData.countryData) {
    let totalMoney = 0;
    let totalWheat = 0;
    pl.countries.forEach((cName) => {
      const c = roomData.countryData[cName];
      if (!c) return;
      // Kışla -> asker
      if (c.barracksCount) {
        ups[`countryData/${cName}/soldiers`] =
          (c.soldiers || 0) + 5 * c.barracksCount;
      }
      // Para
      let effInc = c.income || 0;
      if (c.factories) {
        effInc = Math.floor(effInc * (1 + 0.2 * c.factories));
      }
      totalMoney += effInc;
      // Buğday
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
    text = `${pl.name} süresini doldurdu! ` + text;
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
 * 13. Asker, Bina, Kaynak GÖNDERME vb. 
 *****************************************************************/
// Asker PopUp
const militaryPopup = document.getElementById("military-popup");
document.getElementById("open-military-btn").addEventListener("click", () => {
  togglePopup(militaryPopup);
});
document
  .getElementById("close-military-btn")
  .addEventListener("click", () => {
    militaryPopup.style.display = "none";
  });
// Bina
const buildingPopup = document.getElementById("building-popup");
document.getElementById("open-building-btn").addEventListener("click", () => {
  togglePopup(buildingPopup);
  updateCastleUpgradeCostUI();
});
document
  .getElementById("close-building-btn")
  .addEventListener("click", () => {
    buildingPopup.style.display = "none";
  });
// Kaynak
const resourcePopup = document.getElementById("resource-popup");
document.getElementById("open-resource-btn").addEventListener("click", () => {
  togglePopup(resourcePopup);
});
document
  .getElementById("close-resource-btn")
  .addEventListener("click", () => {
    resourcePopup.style.display = "none";
  });

// Oyuncular Popup
const playersPopup = document.getElementById("players-popup");
document
  .getElementById("open-players-btn")
  .addEventListener("click", () => {
    togglePopup(playersPopup);
  });
document
  .getElementById("close-players-btn")
  .addEventListener("click", () => {
    playersPopup.style.display = "none";
  });

// Ticaret
const marketPopup = document.getElementById("market-popup");
document.getElementById("open-market-btn").addEventListener("click", () => {
  togglePopup(marketPopup);
});
document
  .getElementById("close-market-btn")
  .addEventListener("click", () => {
    marketPopup.style.display = "none";
  });

// Pakt
const pactPopup = document.getElementById("pact-popup");
document.getElementById("open-pact-btn").addEventListener("click", () => {
  togglePopup(pactPopup);
});
document
  .getElementById("close-pact-btn")
  .addEventListener("click", () => {
    pactPopup.style.display = "none";
  });

// Chat
const chatPopup = document.getElementById("chat-popup");
document.getElementById("open-chat-btn").addEventListener("click", () => {
  toggleChat(!chatOpen);
});
document.getElementById("close-chat-btn").addEventListener("click", () => {
  toggleChat(false);
});

// Popup Aç/Kapa Yardımcı
function togglePopup(popupEl) {
  if (popupEl.style.display === "flex") {
    popupEl.style.display = "none";
  } else {
    popupEl.style.display = "flex";
  }
}

/*****************************************************************
 * 14. Asker İşlemleri (Saldırı vb.)
 *****************************************************************/
document.getElementById("attack-btn").addEventListener("click", attack);
document
  .getElementById("buy-soldiers-btn")
  .addEventListener("click", buySoldiers);
document
  .getElementById("pull-soldiers-btn")
  .addEventListener("click", pullSoldiers);
document
  .getElementById("send-support-btn")
  .addEventListener("click", sendSupport);

function attack() {
  if (!isMyTurn()) {
    showNotification("Sıranız değil!");
    return;
  }
  if (!selectedCountry) {
    showNotification("Ülke seçin!");
    return;
  }
  const count = parseInt(document.getElementById("attack-soldiers").value);
  if (isNaN(count) || count <= 0) {
    showNotification("Geçerli asker sayısı girin!");
    return;
  }
  const p = roomData.players[localPlayerId];
  if (p.petrol < count) {
    showNotification(
      `Saldırı için ${count} varil petrol lazım, elinizde yok!`
    );
    return;
  }
  const c = roomData.countryData[selectedCountry];
  if (!c) return;

  // Kendi toprağına
  if (c.owner === localPlayerId) {
    if (count > p.soldiers) {
      showNotification("Yeterli askeriniz yok!");
      return;
    }
    const ups = {};
    ups[`players/${localPlayerId}/petrol`] = p.petrol - count;
    ups[`countryData/${selectedCountry}/soldiers`] =
      c.soldiers + count;
    ups[`players/${localPlayerId}/soldiers`] = p.soldiers - count;
    roomRef.update(ups);
    showNotification(`${selectedCountry} ülkesine ${count} asker yerleştirdiniz.`);
    broadcastNotification(`${p.name}, kendi ülkesine asker yığdı.`);
    return;
  }

  if (count > p.soldiers) {
    showNotification("Yeterli askeriniz yok!");
    return;
  }
  // Pakt kontrol
  if (c.owner && c.owner !== localPlayerId) {
    if (hasActivePact(localPlayerId, c.owner)) {
      showNotification("Bu oyuncu ile paktınız var, saldıramazsınız!");
      return;
    }
  }

  const ups = {};
  ups[`players/${localPlayerId}/petrol`] = p.petrol - count;
  ups[`players/${localPlayerId}/soldiers`] = p.soldiers - count;

  // Kale savunma
  let effAttack = count;
  if (c.castleDefenseLevel > 0) {
    const defPc = 5 * c.castleDefenseLevel;
    const killByCastle = Math.floor((defPc / 100) * effAttack);
    effAttack -= killByCastle;
    if (effAttack < 0) effAttack = 0;
  }

  let result = "";
  if (effAttack > c.soldiers) {
    // Fethedildi
    const remain = effAttack - c.soldiers;
    ups[`countryData/${selectedCountry}/soldiers`] = remain;
    ups[`countryData/${selectedCountry}/owner`] = localPlayerId;
    ups[`countryData/${selectedCountry}/supporters`] = {};
    // Eski sahibin listesinden
    if (c.owner && roomData.players[c.owner]) {
      let oldCnts = roomData.players[c.owner].countries || [];
      oldCnts = oldCnts.filter((x) => x !== selectedCountry);
      ups[`players/${c.owner}/countries`] = oldCnts;
    }
    let myCnts = p.countries || [];
    if (!myCnts.includes(selectedCountry)) myCnts.push(selectedCountry);
    ups[`players/${localPlayerId}/countries`] = myCnts;
    result = `${selectedCountry} fethedildi!`;
  } else {
    // Savunma
    ups[`countryData/${selectedCountry}/soldiers`] = c.soldiers - effAttack;
    result = `${selectedCountry} savunuldu!`;
  }
  roomRef.update(ups, () => immediateOilReward(localPlayerId));
  broadcastNotification(`Saldırı: ${p.name} → ${selectedCountry}. ${result}`);
  showNotification(result);
  nextTurn();
}

/** Saldırı sonrası petrol ödülü */
function immediateOilReward(pid) {
  if (!roomData?.players[pid]) return;
  const pl = roomData.players[pid];
  if (!pl.countries) return;
  let totalOil = 0;
  pl.countries.forEach((cName) => {
    const c = roomData.countryData[cName];
    if (!c) return;
    if (c.oilProduction) {
      let effOil = Math.floor(
        c.oilProduction * (1 + 0.15 * (c.refineries || 0))
      );
      totalOil += effOil;
    }
  });
  if (totalOil > 0) {
    roomRef.child(`players/${pid}/petrol`).set(pl.petrol + totalOil);
    broadcastNotification(
      `${pl.name}, saldırı sonrası +${totalOil} petrol kazandı.`
    );
    showNotification(`Saldırı sonrası +${totalOil} petrol`);
  }
}

/** Asker Satın Al */
function buySoldiers() {
  const num = parseInt(document.getElementById("soldiers-to-buy").value);
  if (isNaN(num) || num <= 0) {
    showNotification("Geçerli bir asker sayısı girin!");
    return;
  }
  const costM = 10 * num;
  const costW = 25 * num;
  const p = roomData.players[localPlayerId];
  if (p.money < costM) {
    showNotification("Yeterli paranız yok!");
    return;
  }
  if (p.wheat < costW) {
    showNotification("Yeterli buğdayınız yok!");
    return;
  }
  const ups = {};
  ups[`players/${localPlayerId}/money`] = p.money - costM;
  ups[`players/${localPlayerId}/wheat`] = p.wheat - costW;
  ups[`players/${localPlayerId}/soldiers`] = p.soldiers + num;
  roomRef.update(ups);
  showNotification(`${num} asker satın alındı.`);
  broadcastNotification(`${p.name} ${num} asker satın aldı.`);
}

/** Asker Çek */
function pullSoldiers() {
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const num = parseInt(document.getElementById("pull-soldiers-count").value);
  if (isNaN(num) || num <= 0) {
    showNotification("Geçerli asker sayısı girin!");
    return;
  }
  const p = roomData.players[localPlayerId];
  const c = roomData.countryData[selectedCountry];
  if (!c) return;

  const ups = {};
  if (c.owner === localPlayerId) {
    let totalSup = 0;
    for (let sid in c.supporters) {
      totalSup += c.supporters[sid];
    }
    const occupant = c.soldiers - totalSup;
    if (occupant < num) {
      showNotification("Ülkedeki destek askerler hariç bu kadar çekilemez!");
      return;
    }
    ups[`countryData/${selectedCountry}/soldiers`] = c.soldiers - num;
    ups[`players/${localPlayerId}/soldiers`] = p.soldiers + num;
    showNotification(`${selectedCountry} ülkesinden ${num} asker çekildi.`);
    broadcastNotification(`${p.name}, ${selectedCountry} ülkesinden asker çekti.`);
  } else {
    // Destek
    const mySup = c.supporters?.[localPlayerId] || 0;
    if (mySup < num) {
      showNotification("O ülkede bu kadar destek askeriniz yok!");
      return;
    }
    if (c.soldiers < num) {
      showNotification("Toplam asker yetersiz! (Veri tutarsızlığı)");
      return;
    }
    ups[`countryData/${selectedCountry}/soldiers`] = c.soldiers - num;
    const newSup = mySup - num;
    if (newSup <= 0) {
      ups[`countryData/${selectedCountry}/supporters/${localPlayerId}`] = null;
    } else {
      ups[`countryData/${selectedCountry}/supporters/${localPlayerId}`] = newSup;
    }
    ups[`players/${localPlayerId}/soldiers`] = p.soldiers + num;
    showNotification("Destek asker geri çekildi.");
    broadcastNotification(`${p.name}, destek askerini geri çekti.`);
  }
  roomRef.update(ups);
}

/** Destek Gönder */
function sendSupport() {
  const rec = document.getElementById("support-recipient").value;
  const cn = document.getElementById("support-recipient-country").value;
  const num = parseInt(document.getElementById("support-soldiers").value);
  if (!rec || !cn) {
    showNotification("Oyuncu ve ülke seçmelisiniz!");
    return;
  }
  if (isNaN(num) || num <= 0) {
    showNotification("Geçerli asker sayısı!");
    return;
  }
  const p = roomData.players[localPlayerId];
  if (p.soldiers < num) {
    showNotification("Yeterli askeriniz yok!");
    return;
  }
  const c = roomData.countryData[cn];
  if (!c) {
    showNotification("Ülke bulunamadı!");
    return;
  }
  if (c.owner !== rec) {
    showNotification("Bu ülke, seçtiğiniz oyuncuya ait değil!");
    return;
  }
  const ups = {};
  ups[`players/${localPlayerId}/soldiers`] = p.soldiers - num;
  ups[`countryData/${cn}/soldiers`] = (c.soldiers || 0) + num;
  const oldSup = c.supporters?.[localPlayerId] || 0;
  ups[`countryData/${cn}/supporters/${localPlayerId}`] = oldSup + num;
  roomRef.update(ups);
  showNotification("Askeri destek gönderildi!");
  broadcastNotification(
    `${p.name}, ${roomData.players[rec].name} (${cn}) ülkesine ${num} asker destek yolladı.`
  );
}

/*****************************************************************
 * 15. Kaynak Gönderme (Para, Petrol, Buğday)
 *****************************************************************/
document.getElementById("send-money-btn").addEventListener("click", sendMoney);
document.getElementById("send-petrol-btn").addEventListener("click", sendPetrol);
document.getElementById("send-wheat-btn").addEventListener("click", sendWheat);

function sendMoney() {
  const amt = parseInt(document.getElementById("money-to-send").value);
  const rec = document.getElementById("recipient-player").value;
  if (isNaN(amt) || amt <= 0) {
    showNotification("Geçerli miktar girin!");
    return;
  }
  const p = roomData.players[localPlayerId];
  if (p.money < amt) {
    showNotification("Yeterli paranız yok!");
    return;
  }
  if (!rec) {
    showNotification("Alıcı seçin!");
    return;
  }
  const ups = {};
  ups[`players/${localPlayerId}/money`] = p.money - amt;
  ups[`players/${rec}/money`] = roomData.players[rec].money + amt;
  roomRef.update(ups);

  broadcastNotification(`${p.name} → ${roomData.players[rec].name}: ${amt}$`);
  showNotification(`${amt}$ gönderildi.`);
}

function sendPetrol() {
  const amt = parseInt(document.getElementById("petrol-to-send").value);
  const rec = document.getElementById("recipient-player-petrol").value;
  if (isNaN(amt) || amt <= 0) {
    showNotification("Geçerli miktar girin!");
    return;
  }
  const p = roomData.players[localPlayerId];
  if (p.petrol < amt) {
    showNotification("Yeterli petrol yok!");
    return;
  }
  if (!rec) {
    showNotification("Alıcı seçin!");
    return;
  }
  const ups = {};
  ups[`players/${localPlayerId}/petrol`] = p.petrol - amt;
  ups[`players/${rec}/petrol`] = roomData.players[rec].petrol + amt;
  roomRef.update(ups);

  broadcastNotification(`${p.name} → ${roomData.players[rec].name}: ${amt} petrol`);
  showNotification(`${amt} varil petrol gönderildi.`);
}

function sendWheat() {
  const amt = parseInt(document.getElementById("wheat-to-send").value);
  const rec = document.getElementById("recipient-player-wheat").value;
  if (isNaN(amt) || amt <= 0) {
    showNotification("Geçerli miktar girin!");
    return;
  }
  const p = roomData.players[localPlayerId];
  if (p.wheat < amt) {
    showNotification("Yeterli buğday yok!");
    return;
  }
  if (!rec) {
    showNotification("Alıcı seçin!");
    return;
  }
  const ups = {};
  ups[`players/${localPlayerId}/wheat`] = p.wheat - amt;
  ups[`players/${rec}/wheat`] = roomData.players[rec].wheat + amt;
  roomRef.update(ups);

  broadcastNotification(`${p.name} → ${roomData.players[rec].name}: ${amt} buğday`);
  showNotification(`${amt} buğday gönderildi.`);
}

function updateRecipientSelects() {
  const selMoney = document.getElementById("recipient-player");
  const selPetrol = document.getElementById("recipient-player-petrol");
  const selWheat = document.getElementById("recipient-player-wheat");
  if (!selMoney || !selPetrol || !selWheat) return;
  selMoney.innerHTML = "";
  selPetrol.innerHTML = "";
  selWheat.innerHTML = "";
  if (!roomData?.playerOrder) return;
  roomData.playerOrder.forEach((pid) => {
    if (pid !== localPlayerId && roomData.players[pid]) {
      const pName = roomData.players[pid].name;
      const o1 = document.createElement("option");
      o1.value = pid;
      o1.textContent = pName;
      selMoney.appendChild(o1);

      const o2 = document.createElement("option");
      o2.value = pid;
      o2.textContent = pName;
      selPetrol.appendChild(o2);

      const o3 = document.createElement("option");
      o3.value = pid;
      o3.textContent = pName;
      selWheat.appendChild(o3);
    }
  });
}

/*****************************************************************
 * 16. Bina Kurma + Kale
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

function buildBarracks() { ... /* aynı mantık, parametre kontrolleri vs. */ }
function buildFactory() { ... }
function buildRefinery() { ... }
function buildGrainMill() { ... }
function buildCastle() { ... }
function upgradeCastle() { ... }
function updateCastleUpgradeCostUI() { ... }

/*****************************************************************
 * 17. Saldırmazlık Pakti
 *****************************************************************/
// (Benzer mantık, "pact-popup" => Teklif Gönder, Kabul/Reddet)
document
  .getElementById("send-pact-offer-btn")
  .addEventListener("click", () => { ... /* benzer mantık */ });

function hasActivePact(a, b) { ... }
function displayPendingPactOffers() { ... }
function displayActivePacts() { ... }
function acceptPactOffer(offerId) { ... }
function rejectPactOffer(offerId) { ... }
function updatePactRecipientSelect() { ... }

/*****************************************************************
 * 18. Market (Ticaret)
 *****************************************************************/
document
  .getElementById("create-trade-offer-btn")
  .addEventListener("click", createTradeOffer);

function createTradeOffer() { ... }
function displayTradeOffers() { ... }
function acceptTradeOffer(offerId, buyAmount) { ... }
function cancelTradeOffer(offerId) { ... }
function updateEmbargoPlayersSelect() { ... }

/*****************************************************************
 * 19. Sohbet (Chat)
 *****************************************************************/
function toggleChat(open) {
  chatPopup.style.display = open ? "flex" : "none";
  chatOpen = open;
  if (chatOpen) {
    unreadMessages = 0;
    updateChatBadge();
  }
}
document.getElementById("send-chat-btn").addEventListener("click", sendChatMsg);
document
  .getElementById("chat-input")
  .addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendChatMsg();
  });

function sendChatMsg() {
  const input = document.getElementById("chat-input");
  const txt = input.value.trim();
  if (!txt || !roomRef) return;

  let senderName = "Anon";
  if (roomData?.players?.[localPlayerId]) {
    senderName = roomData.players[localPlayerId].name;
  }
  const msg = {
    sender: senderName,
    senderId: localPlayerId,
    text: txt,
    recipientId: "",
    timestamp: firebase.database.ServerValue.TIMESTAMP
  };
  roomRef.child("chat").push(msg, () => (input.value = ""));
}

/** Özel Mesaj */
document
  .getElementById("send-private-message-btn")
  .addEventListener("click", () => {
    const pmInput = document.getElementById("private-message-input");
    const pmRecip = document.getElementById("private-message-recipient");
    const pmText = pmInput.value.trim();
    const r = pmRecip.value;
    if (!pmText || !r) return;
    let senderName = "Anon";
    if (roomData?.players?.[localPlayerId]) {
      senderName = roomData.players[localPlayerId].name;
    }
    const pm = {
      sender: senderName,
      senderId: localPlayerId,
      text: pmText,
      recipientId: r,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    };
    roomRef.child("chat").push(pm, () => {
      pmInput.value = "";
      showNotification("Özel mesaj gönderildi!");
    });
  });

function appendChatMessage(m) {
  if (m.recipientId && m.recipientId !== "") {
    if (m.senderId !== localPlayerId && m.recipientId !== localPlayerId) {
      return;
    }
  }
  const cm = document.getElementById("chat-messages");
  const div = document.createElement("div");
  if (m.recipientId && m.recipientId !== "") {
    // PM
    const targName = roomData.players[m.recipientId]?.name || "???";
    if (m.senderId === localPlayerId) {
      div.innerHTML = `<strong>[PM to ${targName}]:</strong> ${m.text}`;
    } else {
      div.innerHTML = `<strong>[PM from ${m.sender}]:</strong> ${m.text}`;
    }
    div.style.color = "#f39c12";
  } else {
    // Genel
    div.textContent = `${m.sender}: ${m.text}`;
  }
  cm.appendChild(div);
  cm.scrollTop = cm.scrollHeight;

  if (!chatOpen && m.senderId !== localPlayerId) {
    unreadMessages++;
    updateChatBadge();
  }
}

function updateChatBadge() {
  const btn = document.getElementById("open-chat-btn");
  btn.dataset.badge = unreadMessages > 0 ? unreadMessages : "";
}

function updatePrivateMessageRecipientSelect() {
  const pmSel = document.getElementById("private-message-recipient");
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
 * 20. Yardımcı Fonksiyonlar (Random Kodu, Otomatik Bağlanma)
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
    const re = db.ref("rooms/" + savedRoom);
    re.once("value", (snap) => {
      if (!snap.exists()) return;
      const rd = snap.val();
      if (!rd.players || !rd.players[localPlayerId]) return;
      currentRoomCode = savedRoom;
      roomRef = re;
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
  // localPlayerId
  if (!localStorage.getItem("playerId")) {
    localStorage.setItem("playerId", Math.random().toString(36).substr(2, 9));
  }
  localPlayerId = localStorage.getItem("playerId");

  // Otomatik reconnect
  autoReconnect();

  // Oyun ekranı görünür olduğunda haritayı init
  const gcObserver = new MutationObserver(() => {
    if (gameContainer.style.display !== "none") {
      initializeMap();
    }
  });
  gcObserver.observe(document.getElementById("game-container"), {
    attributes: true,
    attributeFilter: ["style"]
  });
});
