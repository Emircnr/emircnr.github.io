/***************************************************************
 * gameLogic.js
 * Son sürüm: Lobi yok, oda kurma/katılma profil üzerinden.
 * Bayrak (Canvas) ile fethedilen ülkeler pattern doldurulur.
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
let currentUser = null;         // Firebase Auth kullanıcısı (UID)
let currentUserData = null;     // DB'deki kullanıcı verisi
let localPlayerId = null;       // (Artık çok kullanılmıyor, UID ile gidiyoruz)
let currentRoomId = null;       // rooms/roomId
let roomRef = null;             // Firebase Realtime DB "rooms/roomId"
let roomData = null;            // Odanın anlık verisi
let selectedCountry = null;     // Haritada seçilen ülke
let map, geoJsonLayer = null;   // Leaflet
let infoCardsPermanent = false; // Ülke tooltip'lerinin kalıcılığı
let turnTimeRemaining = 60;
let turnTimerInterval = null;
let startInterval = null;
let notificationsMuted = false;
let unreadMessages = 0;
let chatOpen = false;
let isSpectator = false;        // "İzle" ile katıldıysa hamle yapamaz

// Bayrak (Canvas) düzenleyici
let flagCanvas, flagCtx;
let isDrawing = false;
let brushColor = "#ff0000";
let brushSize = 5;
let isErasing = false;

// Leaflet Pattern cache: her oyuncu için pattern
let playerPatterns = {};

// Chat & Notification listener kontrol
let chatListenerAdded = false;

/*****************************************************************
 * 3. SAYFA YÖNETİMİ (Single Page)
 *****************************************************************/
const authContainer = document.getElementById("auth-container");
const profileContainer = document.getElementById("profile-container");
const gameContainer = document.getElementById("game-container");

function showAuthPage() {
  authContainer.style.display = "flex";
  profileContainer.style.display = "none";
  gameContainer.style.display = "none";
}
function showProfilePage() {
  authContainer.style.display = "none";
  profileContainer.style.display = "flex";
  gameContainer.style.display = "none";
}
function showGamePage() {
  authContainer.style.display = "none";
  profileContainer.style.display = "none";
  gameContainer.style.display = "block";
}

/*****************************************************************
 * 4. Firebase Authentication (Giriş & Kayıt)
 *****************************************************************/
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    setUserOnlineStatus(true);

    const snapshot = await db.ref("users/" + user.uid).once("value");
    currentUserData = snapshot.val() || {};

    if (!currentUserData.displayName) {
      // Varsayılan isim
      currentUserData.displayName = user.email.split("@")[0];
      await db.ref("users/" + user.uid).update({
        displayName: currentUserData.displayName
      });
    }

    document.getElementById("profile-username").textContent =
      currentUserData.displayName || "Kullanıcı Adınız";

    // Profil sayfası verileri
    loadUserFriends();
    loadFriendRequests();
    loadRoomInvites();
    loadFriendInviteList();
    loadActiveRooms();

    showProfilePage();
  } else {
    currentUser = null;
    currentUserData = null;
    showAuthPage();
  }
});

function setUserOnlineStatus(isOnline) {
  if (!currentUser) return;
  const userStatusRef = db.ref("users/" + currentUser.uid + "/online");
  if (isOnline) {
    userStatusRef.set(true);
    userStatusRef.onDisconnect().set(false);
  } else {
    userStatusRef.set(false);
  }
}

// Giriş / Kayıt sekme geçiş
document.getElementById("login-tab").addEventListener("click", () => {
  document.getElementById("login-tab").classList.add("active");
  document.getElementById("register-tab").classList.remove("active");
  document.getElementById("login-form").style.display = "block";
  document.getElementById("register-form").style.display = "none";
});
document.getElementById("register-tab").addEventListener("click", () => {
  document.getElementById("register-tab").classList.add("active");
  document.getElementById("login-tab").classList.remove("active");
  document.getElementById("register-form").style.display = "block";
  document.getElementById("login-form").style.display = "none";
});

// Giriş Yap
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

// Kayıt Ol
document.getElementById("register-btn").addEventListener("click", async () => {
  const email = document.getElementById("register-email").value.trim();
  const password = document.getElementById("register-password").value.trim();
  const confirmPassword = document.getElementById("register-confirm-password").value.trim();
  const displayName = document.getElementById("register-display-name").value.trim();

  if (!email || !password || !confirmPassword || !displayName) {
    showNotification("Lütfen tüm alanları doldurun!");
    return;
  }
  if (password !== confirmPassword) {
    showNotification("Şifreler eşleşmiyor!");
    return;
  }
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    const uid = cred.user.uid;
    await db.ref("users/" + uid).set({
      email: email,
      displayName: displayName,
      online: true,
      friends: {},
      friendRequests: {},
      roomInvites: {}
    });
    showNotification("Kayıt başarılı, giriş yapıldı!");
  } catch (err) {
    showNotification("Kayıt hata: " + err.message);
  }
});

// Çıkış Yap
document.getElementById("profile-logout-btn").addEventListener("click", async () => {
  setUserOnlineStatus(false);
  await auth.signOut();
  showNotification("Çıkış yapıldı.");
});

/*****************************************************************
 * 5. Profil Ekranı (Arkadaşlar, İstekler, Oda Davetleri)
 *****************************************************************/

/** Arkadaşlar */
async function loadUserFriends() {
  const friendListDiv = document.getElementById("friend-list");
  friendListDiv.innerHTML = "";
  if (!currentUserData || !currentUserData.friends) return;

  const friendIds = Object.keys(currentUserData.friends);
  for (const fId of friendIds) {
    const snap = await db.ref("users/" + fId).once("value");
    const friendData = snap.val();
    if (!friendData) continue;

    const item = document.createElement("div");
    item.className = "friend-item";
    item.innerHTML = `
      <span>
        ${friendData.displayName}
        ${
          friendData.online
            ? '<span class="online-status">(Çevrimiçi)</span>'
            : '<span class="offline-status">(Çevrimdışı)</span>'
        }
      </span>
      <button class="remove-friend-btn" data-fid="${fId}">Sil</button>
    `;
    friendListDiv.appendChild(item);
  }
}
document.getElementById("friend-list").addEventListener("click", (e) => {
  if (e.target.classList.contains("remove-friend-btn")) {
    const fid = e.target.getAttribute("data-fid");
    removeFriend(fid);
  }
});
async function removeFriend(fId) {
  if (!currentUser) return;
  await db.ref(`users/${currentUser.uid}/friends/${fId}`).remove();
  await db.ref(`users/${fId}/friends/${currentUser.uid}`).remove();
  showNotification("Arkadaş silindi.");
  loadUserFriends();
}

/** Arkadaş İstekleri */
async function loadFriendRequests() {
  const list = document.getElementById("friend-request-list");
  list.innerHTML = "";
  if (!currentUserData || !currentUserData.friendRequests) return;

  const requestIds = Object.keys(currentUserData.friendRequests);
  for (const rId of requestIds) {
    const snap = await db.ref("users/" + rId).once("value");
    const reqUserData = snap.val();
    if (!reqUserData) continue;

    const item = document.createElement("div");
    item.className = "friend-request-item";
    item.innerHTML = `
      <span>${reqUserData.displayName}</span>
      <div>
        <button class="accept-friend-btn" data-fid="${rId}">Kabul</button>
        <button class="reject-friend-btn" data-fid="${rId}">Reddet</button>
      </div>
    `;
    list.appendChild(item);
  }
}
document.getElementById("friend-request-list").addEventListener("click", async (e) => {
  if (e.target.classList.contains("accept-friend-btn")) {
    const fromUid = e.target.getAttribute("data-fid");
    await acceptFriendRequest(fromUid);
    loadUserFriends();
  } else if (e.target.classList.contains("reject-friend-btn")) {
    const fromUid = e.target.getAttribute("data-fid");
    await rejectFriendRequest(fromUid);
  }
});
async function acceptFriendRequest(fromUid) {
  if (!currentUser) return;
  await db.ref(`users/${currentUser.uid}/friends/${fromUid}`).set(true);
  await db.ref(`users/${fromUid}/friends/${currentUser.uid}`).set(true);
  await db.ref(`users/${currentUser.uid}/friendRequests/${fromUid}`).remove();
  showNotification("Arkadaşlık isteği kabul edildi!");
}
async function rejectFriendRequest(fromUid) {
  if (!currentUser) return;
  await db.ref(`users/${currentUser.uid}/friendRequests/${fromUid}`).remove();
  showNotification("Arkadaşlık isteği reddedildi.");
}

/** Arkadaş Ekle */
document.getElementById("send-friend-request-btn").addEventListener("click", async () => {
  const uname = document.getElementById("add-friend-username").value.trim();
  if (!uname) {
    showNotification("Kullanıcı adı girin!");
    return;
  }
  const allUsersSnap = await db.ref("users").once("value");
  const allUsersData = allUsersSnap.val();
  let targetUid = null;

  for (let uid in allUsersData) {
    const dName = allUsersData[uid].displayName || "";
    if (dName.toLowerCase() === uname.toLowerCase()) {
      targetUid = uid;
      break;
    }
  }
  if (!targetUid) {
    showNotification("Kullanıcı bulunamadı!");
    return;
  }
  if (targetUid === currentUser.uid) {
    showNotification("Kendinize istek gönderemezsiniz!");
    return;
  }

  await db.ref(`users/${targetUid}/friendRequests/${currentUser.uid}`).set(true);
  showNotification("Arkadaşlık isteği gönderildi!");
});

/*****************************************************************
 * 6. Oda Davetleri (hostInvite, joinRequest)
 *****************************************************************/
async function loadRoomInvites() {
  const list = document.getElementById("room-invite-list");
  list.innerHTML = "";
  if (!currentUserData || !currentUserData.roomInvites) return;

  const invites = currentUserData.roomInvites;
  for (let invId in invites) {
    const inv = invites[invId];
    if (!inv) continue;

    const div = document.createElement("div");
    div.className = "room-invite-item";

    if (inv.type === "hostInvite") {
      // host => user
      div.innerHTML = `
        <span>${inv.fromName} odasına davet: ${inv.roomName}</span>
        <div>
          <button class="accept-room-invite-btn" data-iid="${invId}">Kabul</button>
          <button class="reject-room-invite-btn" data-iid="${invId}">Reddet</button>
        </div>
      `;
    } else if (inv.type === "joinRequest") {
      // user => host
      // Biz host isek, bu isteği kabul/reddet edebiliriz
      div.innerHTML = `
        <span>${inv.fromName} adlı kullanıcı, ${inv.roomName} odanıza katılmak istiyor.</span>
        <div>
          <button class="accept-join-request-btn" data-iid="${invId}">Kabul</button>
          <button class="reject-room-invite-btn" data-iid="${invId}">Reddet</button>
        </div>
      `;
    }
    list.appendChild(div);
  }
}
document.getElementById("room-invite-list").addEventListener("click", async (e) => {
  if (e.target.classList.contains("accept-room-invite-btn")) {
    const invId = e.target.getAttribute("data-iid");
    await acceptRoomInvite(invId);
  } else if (e.target.classList.contains("reject-room-invite-btn")) {
    const invId = e.target.getAttribute("data-iid");
    await rejectRoomInvite(invId);
  } else if (e.target.classList.contains("accept-join-request-btn")) {
    const invId = e.target.getAttribute("data-iid");
    await acceptJoinRequest(invId);
  }
});

async function acceptRoomInvite(invId) {
  const invite = currentUserData.roomInvites[invId];
  if (!invite) return;
  const roomId = invite.roomId;
  await joinRoomDirect(roomId);
  await db.ref(`users/${currentUser.uid}/roomInvites/${invId}`).remove();
  showNotification(`Odaya katılıyorsunuz: ${invite.roomName}`);
}
async function rejectRoomInvite(invId) {
  await db.ref(`users/${currentUser.uid}/roomInvites/${invId}`).remove();
  showNotification("Oda daveti reddedildi.");
}

/** Host'un joinRequest kabul etmesi */
async function acceptJoinRequest(invId) {
  const req = currentUserData.roomInvites[invId];
  if (!req) return;
  const roomId = req.roomId;
  const snap = await db.ref("rooms/" + roomId).once("value");
  if (!snap.exists()) {
    showNotification("Oda bulunamadı!");
    await db.ref(`users/${currentUser.uid}/roomInvites/${invId}`).remove();
    return;
  }
  const rData = snap.val();
  // Host mu
  if (rData.hostUid !== currentUser.uid) {
    showNotification("Bu odanın host'u değilsiniz!");
    return;
  }
  if (rData.gameState !== "waiting" && rData.gameState !== "starting") {
    showNotification("Oyun başlamış, katılamaz!");
    return;
  }
  // Zaten ekli mi
  if (!rData.players) rData.players = {};
  if (rData.players[req.fromUid]) {
    showNotification("Bu oyuncu zaten odada!");
    await db.ref(`users/${currentUser.uid}/roomInvites/${invId}`).remove();
    return;
  }

  // Ekliyoruz
  const userSnap = await db.ref("users/" + req.fromUid).once("value");
  const userData = userSnap.val();
  const newPlayerObj = {
    name: userData.displayName || "Oyuncu",
    money: 1000,
    soldiers: 0,
    countries: [],
    petrol: 100,
    wheat: 400,
    joinedAt: firebase.database.ServerValue.TIMESTAMP,
    isHost: false,
    flag: userData.flag || ""
  };
  if (!rData.playerOrder) rData.playerOrder = [];
  rData.playerOrder.push(req.fromUid);

  const updates = {};
  updates[`rooms/${roomId}/players/${req.fromUid}`] = newPlayerObj;
  updates[`rooms/${roomId}/playerOrder`] = rData.playerOrder;
  updates[`users/${currentUser.uid}/roomInvites/${invId}`] = null;
  await db.ref().update(updates);

  showNotification(`${newPlayerObj.name} odaya eklendi!`);
  broadcastNotification(`${newPlayerObj.name} katıldı (${rData.name}).`, roomId);
}

/*****************************************************************
 * 7. Arkadaş Listesi: Oda Kurarken Davet
 *****************************************************************/
function loadFriendInviteList() {
  const sel = document.getElementById("room-invite-friends");
  sel.innerHTML = "";
  if (!currentUserData || !currentUserData.friends) return;
  const fIds = Object.keys(currentUserData.friends);
  for (let fid of fIds) {
    db.ref("users/" + fid).once("value").then((snap) => {
      const fd = snap.val();
      if (fd) {
        const opt = document.createElement("option");
        opt.value = fid;
        opt.textContent = fd.displayName;
        sel.appendChild(opt);
      }
    });
  }
}

/*****************************************************************
 * 8. Oda Kurma + Aktif Odalar
 *****************************************************************/
document.getElementById("create-room-btn").addEventListener("click", createRoom);
async function createRoom() {
  const nameInput = document.getElementById("room-name-input");
  const inviteSelect = document.getElementById("room-invite-friends");
  const rName = nameInput.value.trim();
  if (!rName) {
    showNotification("Oda adı giriniz!");
    return;
  }
  // Oda ID
  const newRoomId = db.ref("rooms").push().key;

  // Host player verisi
  const hostData = {
    name: currentUserData.displayName || "Oyuncu",
    money: 1000,
    soldiers: 0,
    countries: [],
    petrol: 100,
    wheat: 400,
    joinedAt: firebase.database.ServerValue.TIMESTAMP,
    isHost: true,
    flag: currentUserData.flag || ""
  };
  const newRoomData = {
    roomId: newRoomId,
    name: rName,
    gameState: "waiting",
    currentTurnIndex: 0,
    round: 1,
    playerOrder: [currentUser.uid],
    players: {
      [currentUser.uid]: hostData
    },
    watchers: {},
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    hostUid: currentUser.uid
  };
  await db.ref("rooms/" + newRoomId).set(newRoomData);

  // Davet gönder
  const selectedFriends = Array.from(inviteSelect.options)
    .filter((opt) => opt.selected)
    .map((o) => o.value);
  if (selectedFriends.length > 0) {
    for (const fId of selectedFriends) {
      const invKey = db.ref(`users/${fId}/roomInvites`).push().key;
      const data = {
        type: "hostInvite",
        fromUid: currentUser.uid,
        fromName: hostData.name,
        roomId: newRoomId,
        roomName: rName,
        status: "pending"
      };
      await db.ref(`users/${fId}/roomInvites/${invKey}`).set(data);
    }
  }

  // Ülke verileri (geojson) ilk kez
  initializeCountryData(newRoomId);

  showNotification("Oda oluşturuldu: " + rName);
  loadActiveRooms();
}

/** Mevcut (Aktif) Odaları Yükle */
function loadActiveRooms() {
  const list = document.getElementById("active-rooms-list");
  list.innerHTML = "";

  db.ref("rooms").on("value", (snap) => {
    list.innerHTML = "";
    const all = snap.val();
    if (!all) return;
    for (let rid in all) {
      const r = all[rid];
      if (!r || r.gameState === "ended") continue;
      const pc = r.players ? Object.keys(r.players).length : 0;
      const div = document.createElement("div");
      div.className = "active-room-item";
      div.innerHTML = `
        <strong>${r.name}</strong>
        <p>Host: ${r.hostUid}</p>
        <p>Oyuncu Sayısı: ${pc}</p>
        <div>
          <button class="btn-join-room" data-rid="${rid}">Katıl</button>
          <button class="btn-watch-room" data-rid="${rid}">İzle</button>
        </div>
      `;
      list.appendChild(div);
    }
  });
}
document.getElementById("active-rooms-list").addEventListener("click", (e) => {
  if (e.target.classList.contains("btn-join-room")) {
    const rid = e.target.getAttribute("data-rid");
    requestJoinRoom(rid);
  } else if (e.target.classList.contains("btn-watch-room")) {
    const rid = e.target.getAttribute("data-rid");
    watchRoom(rid);
  }
});

/** Katıl butonu => joinRequest */
async function requestJoinRoom(roomId) {
  const snap = await db.ref("rooms/" + roomId).once("value");
  if (!snap.exists()) {
    showNotification("Oda bulunamadı!");
    return;
  }
  const r = snap.val();
  if (r.gameState !== "waiting" && r.gameState !== "starting") {
    showNotification("Oyun başladı veya bitti, katılamazsınız!");
    return;
  }
  const hostUid = r.hostUid;
  const key = db.ref(`users/${hostUid}/roomInvites`).push().key;
  const data = {
    type: "joinRequest",
    fromUid: currentUser.uid,
    fromName: currentUserData.displayName,
    roomId,
    roomName: r.name,
    status: "pending"
  };
  await db.ref(`users/${hostUid}/roomInvites/${key}`).set(data);
  showNotification("Katılma isteği gönderildi (onay bekleniyor).");
}

/** İzle butonu => watchers listesine eklenir */
async function watchRoom(roomId) {
  const snap = await db.ref("rooms/" + roomId).once("value");
  if (!snap.exists()) {
    showNotification("Oda bulunamadı!");
    return;
  }
  const rData = snap.val();
  const ups = {};
  ups[`rooms/${roomId}/watchers/${currentUser.uid}`] = {
    name: currentUserData.displayName,
    joinedAt: firebase.database.ServerValue.TIMESTAMP
  };
  await db.ref().update(ups);
  showNotification(`İzleyici olarak ${rData.name} odasına giriliyor...`);
  joinRoomAsSpectator(roomId);
}

/*****************************************************************
 * 9. Oyun Ekranı Kurulumu
 *****************************************************************/
function joinRoomDirect(roomId) {
  db.ref("rooms/" + roomId).once("value", (snap) => {
    if (!snap.exists()) {
      showNotification("Oda bulunamadı!");
      return;
    }
    const r = snap.val();
    if (!r.players || !r.players[currentUser.uid]) {
      showNotification("Katılımınız onaylanmadı!");
      return;
    }
    loadMapAndRoom(roomId);
  });
}
function joinRoomAsSpectator(roomId) {
  isSpectator = true;
  loadMapAndRoom(roomId);
}
function loadMapAndRoom(roomId) {
  currentRoomId = roomId;
  roomRef = db.ref("rooms/" + roomId);
  roomRef.on("value", (snapshot) => {
    roomData = snapshot.val() || {};
    updateGameUI();
    displayPendingPactOffers();
    displayActivePacts();
    displayTradeOffers();
  });
  showGamePage();
  document.getElementById("display-room-name").textContent = "-";

  initializeMap(); // Harita
}

/** Oda verisi değiştikçe UI güncelle */
function updateGameUI() {
  if (!roomData) return;
  document.getElementById("display-room-name").textContent = roomData.name || "-";
  document.getElementById("current-round").textContent = roomData.round || 1;

  if (roomData.playerOrder && roomData.players) {
    const idx = roomData.currentTurnIndex || 0;
    const currPid = roomData.playerOrder[idx];
    const pl = roomData.players[currPid];
    if (pl) {
      document.getElementById("current-player").textContent = pl.name;
    }
  }
  handleGameState(roomData.gameState);
  updatePlayersPopup();
  updateMapCountries();
  updateRecipientSelects();
  updatePactRecipientSelect();
  updatePrivateMessageRecipientSelect();
  updateEmbargoPlayersSelect();
  updateSupportRecipientSelect();

  if (roomData.gameState === "started") {
    if (isMyTurn()) startTurnTimer();
    else stopTurnTimer();
  } else {
    stopTurnTimer();
  }
}

function handleGameState(state) {
  const startBtn = document.getElementById("start-game-btn");
  const countdownSpan = document.getElementById("start-countdown");
  if (!state) return;
  const isHost = !!(roomData.players && roomData.players[currentUser?.uid]?.isHost);

  if (state === "waiting") {
    if (isHost && !isSpectator) {
      startBtn.style.display = "block";
    } else {
      startBtn.style.display = "none";
    }
    countdownSpan.style.display = "none";
  } else if (state === "starting") {
    startBtn.style.display = "none";
    countdownSpan.style.display = "inline";
    startCountdownListener();
  } else if (state === "started") {
    startBtn.style.display = "none";
    countdownSpan.style.display = "none";
    clearInterval(startInterval);
    startInterval = null;
  }
}

document.getElementById("start-game-btn").addEventListener("click", () => {
  if (!roomData) return;
  const isHost = roomData.players[currentUser.uid]?.isHost;
  if (!isHost || isSpectator) return;
  if (roomData.gameState !== "waiting") return;
  const now = Date.now();
  const startTime = now + 30000; // 30 sn
  roomRef.update({ gameState: "starting", startTime });
});

function startCountdownListener() {
  if (!roomData || !roomData.startTime) return;
  const countdownSpan = document.getElementById("start-countdown");
  if (startInterval) clearInterval(startInterval);

  startInterval = setInterval(() => {
    if (!roomData) return;
    const now = Date.now();
    const diff = roomData.startTime - now;
    if (diff <= 0) {
      clearInterval(startInterval);
      startInterval = null;
      roomRef.update({ gameState: "started" });
      return;
    }
    countdownSpan.textContent = Math.floor(diff / 1000);
  }, 1000);
}

function updatePlayersPopup() {
  const div = document.getElementById("players-info");
  if (!div) return;
  div.innerHTML = "";

  if (roomData.playerOrder) {
    roomData.playerOrder.forEach((pid) => {
      const pData = roomData.players[pid];
      if (pData) {
        let flagImg = pData.flag
          ? `<img src="${pData.flag}" alt="Flag" style="max-width:40px;max-height:25px; margin-right:10px;" />`
          : "";
        const pDiv = document.createElement("div");
        pDiv.className = "player-info";
        pDiv.innerHTML = `
          <p><strong>${flagImg} ${pData.name}</strong></p>
          <p>Para: <span>${pData.money}</span>$</p>
          <p>Asker: <span>${pData.soldiers}</span></p>
          <p>Ülkeler: <span>${(pData.countries && pData.countries.length) || 0}</span></p>
          <p>Petrol: <span>${pData.petrol}</span> varil</p>
          <p>Buğday: <span>${pData.wheat}</span></p>
        `;
        div.appendChild(pDiv);
      }
    });
  }
  if (roomData.watchers) {
    const wKeys = Object.keys(roomData.watchers);
    if (wKeys.length > 0) {
      const watchersDiv = document.createElement("div");
      watchersDiv.className = "player-info";
      watchersDiv.innerHTML = `<p><strong>Seyirciler:</strong></p>`;
      wKeys.forEach((wu) => {
        watchersDiv.innerHTML += `<p>- ${roomData.watchers[wu].name}</p>`;
      });
      div.appendChild(watchersDiv);
    }
  }
}

/*****************************************************************
 * Ülke (GeoJSON) verisi DB'ye ilk defa yaz
 *****************************************************************/
function initializeCountryData(roomId) {
  fetch("https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json")
    .then((r) => r.json())
    .then((geoJsonData) => {
      const features = geoJsonData.features;
      let oilIndexes = [];
      while (oilIndexes.length < 43 && oilIndexes.length < features.length) {
        const rand = Math.floor(Math.random() * features.length);
        if (!oilIndexes.includes(rand)) oilIndexes.push(rand);
      }
      let wheatIndexes = [];
      while (wheatIndexes.length < 60 && wheatIndexes.length < features.length) {
        const rand = Math.floor(Math.random() * features.length);
        if (!wheatIndexes.includes(rand)) wheatIndexes.push(rand);
      }
      const cData = {};
      features.forEach((f, idx) => {
        const cname = f.properties.name;
        let oilProduction = 0;
        if (oilIndexes.includes(idx)) {
          oilProduction = Math.floor(Math.random() * (500 - 150 + 1)) + 150;
        }
        let wheatProduction = 0;
        if (wheatIndexes.includes(idx)) {
          wheatProduction = Math.floor(Math.random() * (700 - 200 + 1)) + 200;
        }
        cData[cname] = {
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
      db.ref("rooms/" + roomId + "/countryData").set(cData);
    });
}

/*****************************************************************
 * Haritayı Başlatma
 *****************************************************************/
function initializeMap() {
  if (map) return; // Sadece 1 kez
  map = L.map("map", {
    center: [20, 0],
    zoom: 2,
    maxBounds: [
      [-85, -180],
      [85, 180]
    ],
    maxBoundsViscosity: 1.0,
    worldCopyJump: false,
    noWrap: true
  });

  L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: 7,
      minZoom: 2,
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, GEBCO, NOAA...'
    }
  ).addTo(map);

  fetch("https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json")
    .then((r) => r.json())
    .then((geoJsonData) => {
      geoJsonLayer = L.geoJson(geoJsonData, {
        style: {
          color: "#555",
          weight: 1,
          fillColor: "#ccc",
          fillOpacity: 0.7
        },
        onEachFeature: (feature, layer) => {
          const cname = feature.properties.name;
          layer.bindTooltip(getCountryPopupContent(cname), {
            permanent: infoCardsPermanent,
            direction: "center",
            className: "country-popup-tooltip"
          });
          layer.on("click", () => selectCountryOnMap(cname, layer));
        }
      }).addTo(map);
    });
}

function updateMapCountries() {
  if (!geoJsonLayer || !roomData?.countryData) return;
  geoJsonLayer.eachLayer((layer) => {
    const cname = layer.feature.properties.name;
    const cData = roomData.countryData[cname];
    if (!cData) return;
    const defStyle = {
      weight: 1,
      color: "#555",
      fillColor: "#ccc",
      fillOpacity: 0.7
    };
    if (cData.owner && roomData.players[cData.owner]) {
      const owner = roomData.players[cData.owner];
      if (owner.flag) {
        const pat = getPlayerPattern(cData.owner);
        if (pat) {
          layer.setStyle({
            fillPattern: pat,
            fillOpacity: 1,
            weight: 1,
            color: "#555"
          });
        } else {
          layer.setStyle({
            fillColor: "#f39c12",
            fillOpacity: 0.7,
            weight: 1,
            color: "#555"
          });
        }
      } else {
        layer.setStyle({
          fillColor: "#f39c12",
          fillOpacity: 0.7,
          weight: 1,
          color: "#555"
        });
      }
    } else {
      layer.setStyle(defStyle);
    }
    layer.setTooltipContent(getCountryPopupContent(cname));
  });
}

function getCountryPopupContent(cname) {
  if (!roomData?.countryData?.[cname]) {
    return `<div><p>${cname}</p><p>Veri yok</p></div>`;
  }
  const c = roomData.countryData[cname];
  const ownerText = c.owner && roomData.players[c.owner]
    ? roomData.players[c.owner].name
    : "Yok";

  let effIncome = c.income || 0;
  if (c.factories) {
    effIncome = Math.floor(effIncome * (1 + 0.2 * c.factories));
  }
  const effOil = c.oilProduction
    ? Math.floor(c.oilProduction * (1 + 0.15 * (c.refineries || 0)))
    : 0;
  const effWheat = c.wheatProduction
    ? Math.floor(c.wheatProduction * (1 + 0.2 * (c.grainMills || 0)))
    : 0;
  let castleDef = c.castleDefenseLevel > 0 ? `+%${c.castleDefenseLevel * 5}` : "-";

  return `
    <div>
      <p><i class="fas fa-money-bill-wave"></i> Gelir: ${effIncome}$</p>
      <p><i class="fas fa-users"></i> Asker: ${c.soldiers || 0}</p>
      <p><i class="fas fa-fort-awesome"></i> Kışla: ${c.barracksCount || 0}</p>
      <p><i class="fas fa-industry"></i> Fabrika: ${c.factories || 0}</p>
      <p><i class="fas fa-oil-can"></i> Rafine: ${c.refineries || 0}</p>
      <p><i class="fas fa-oil-can"></i> Petrol Üretimi: ${effOil}</p>
      <p><i class="fas fa-wheat-awn"></i> Değirmen: ${c.grainMills || 0}</p>
      <p><i class="fas fa-wheat-awn"></i> Buğday Üretimi: ${effWheat}</p>
      <p><i class="fas fa-chess-rook"></i> Kale Gücü: ${castleDef}</p>
      <p><i class="fas fa-crown"></i> Sahip: ${ownerText}</p>
    </div>
  `;
}

function selectCountryOnMap(cname, layer) {
  if (isSpectator) {
    showNotification("Seyirci modundasınız, etkileşim yok.");
    return;
  }
  selectedCountry = cname;
  showNotification("Seçilen ülke: " + cname, 1500);

  layer.setStyle({ weight: 4, color: "#FF4500" });
  setTimeout(() => updateMapCountries(), 800);

  updateCastleUpgradeCostUI();
}

document.getElementById("toggle-info-cards").addEventListener("click", () => {
  infoCardsPermanent = !infoCardsPermanent;
  updateMapCountries();
  const icon = document.getElementById("toggle-info-cards").querySelector("i");
  icon.className = infoCardsPermanent ? "fas fa-eye" : "fas fa-eye-slash";
});

/*****************************************************************
 * 10. Bildirim Sistemi
 *****************************************************************/
function showNotification(msg, duration = 3000) {
  if (notificationsMuted) return;
  const area = document.getElementById("notification-area");
  if (!area) return;
  const item = document.createElement("div");
  item.className = "notification-item";
  item.textContent = msg;
  area.appendChild(item);

  setTimeout(() => {
    if (area.contains(item)) area.removeChild(item);
  }, duration + 800);
}

function broadcastNotification(text, roomId) {
  if (!roomId) return;
  db.ref(`rooms/${roomId}/notifications`).push({
    text,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  });
}

function displayGlobalNotification(text) {
  if (notificationsMuted) return;
  const area = document.getElementById("notification-area");
  if (!area) return;
  const item = document.createElement("div");
  item.className = "notification-item";
  item.textContent = text;
  area.appendChild(item);
  setTimeout(() => {
    if (area.contains(item)) area.removeChild(item);
  }, 6500);
}

document.getElementById("open-notifications-btn").addEventListener("click", () => {
  notificationsMuted = !notificationsMuted;
  if (!notificationsMuted) {
    showNotification("Bildirimler açıldı.");
  } else {
    showNotification("Bildirimler kapatıldı.");
  }
});

/*****************************************************************
 * 11. 60 Saniye Tur Sayacı
 *****************************************************************/
function isMyTurn() {
  if (!roomData?.playerOrder) return false;
  if (roomData.gameState !== "started") return false;
  if (isSpectator) return false;
  const idx = roomData.currentTurnIndex || 0;
  return roomData.playerOrder[idx] === currentUser.uid;
}

function startTurnTimer() {
  const el = document.getElementById("turn-timer");
  turnTimeRemaining = 60;
  if (turnTimerInterval) clearInterval(turnTimerInterval);
  el.textContent = turnTimeRemaining + "s";

  turnTimerInterval = setInterval(() => {
    turnTimeRemaining--;
    if (turnTimeRemaining <= 0) {
      clearInterval(turnTimerInterval);
      turnTimeRemaining = 0;
      el.textContent = "0s";
      if (roomData.gameState === "started" && isMyTurn()) {
        nextTurn(true);
      }
    } else {
      el.textContent = turnTimeRemaining + "s";
    }
  }, 1000);
}

function stopTurnTimer() {
  if (turnTimerInterval) clearInterval(turnTimerInterval);
  const el = document.getElementById("turn-timer");
  if (el) el.textContent = "60s";
}

/*****************************************************************
 * 12. Oyun Butonları (Tur Sonu, Odadan Çık)
 *****************************************************************/
document.getElementById("end-turn-btn").addEventListener("click", () => {
  if (isSpectator) {
    showNotification("Seyirci modundasınız.");
    return;
  }
  nextTurn(false);
});

function nextTurn(autoEnd = false) {
  if (!isMyTurn()) return;
  stopTurnTimer();

  const turnIndex = roomData.currentTurnIndex || 0;
  const currPid = roomData.playerOrder[turnIndex];
  const pl = roomData.players[currPid];
  if (!pl) return;

  const ups = {};
  // Tur sonu gelir
  if (pl.countries && roomData.countryData) {
    let moneyGained = 0;
    let wheatGained = 0;
    pl.countries.forEach((cName) => {
      const cData = roomData.countryData[cName];
      if (!cData) return;
      // Kışla => her kışla 5 asker
      if (cData.barracksCount) {
        ups[`rooms/${currentRoomId}/countryData/${cName}/soldiers`] =
          (cData.soldiers || 0) + 5 * cData.barracksCount;
      }
      // Para
      let effIncome = cData.income || 0;
      if (cData.factories) {
        effIncome = Math.floor(effIncome * (1 + 0.2 * cData.factories));
      }
      moneyGained += effIncome;
      // Buğday
      if (cData.wheatProduction) {
        const effWheat = Math.floor(
          cData.wheatProduction * (1 + 0.2 * (cData.grainMills || 0))
        );
        wheatGained += effWheat;
      }
    });
    ups[`rooms/${currentRoomId}/players/${currPid}/money`] = pl.money + moneyGained;
    ups[`rooms/${currentRoomId}/players/${currPid}/wheat`] = pl.wheat + wheatGained;
  }

  let newIndex = turnIndex + 1;
  let newRound = roomData.round || 1;
  if (newIndex >= roomData.playerOrder.length) {
    newIndex = 0;
    newRound++;
    ups[`rooms/${currentRoomId}/round`] = newRound;
  }
  ups[`rooms/${currentRoomId}/currentTurnIndex`] = newIndex;

  db.ref().update(ups, () => {
    const nextPid = roomData.playerOrder[newIndex];
    let endText = "Sıra " + (roomData.players[nextPid]?.name || "?") + " adlı oyuncuya geçti.";
    if (autoEnd) {
      endText = pl.name + " süresini doldurdu! " + endText;
    }
    broadcastNotification(endText, currentRoomId);
    showNotification(endText, 1500);
  });
}

document.getElementById("exit-room-btn").addEventListener("click", async () => {
  if (!roomRef || !roomData) return;
  stopTurnTimer();
  clearInterval(startInterval);

  if (!isSpectator && roomData.players && roomData.players[currentUser.uid]) {
    // Oyuncu olarak çıktı
    const ups = {};
    let newOrder = roomData.playerOrder.filter((id) => id !== currentUser.uid);

    // Sıradaysa
    if (isMyTurn()) {
      let idx = roomData.currentTurnIndex || 0;
      idx++;
      let newR = roomData.round || 1;
      if (idx >= newOrder.length && newOrder.length > 0) {
        idx = 0;
        newR++;
      }
      ups[`rooms/${currentRoomId}/round`] = newR;
      ups[`rooms/${currentRoomId}/currentTurnIndex`] = newOrder.length ? idx : 0;
    }
    ups[`rooms/${currentRoomId}/playerOrder`] = newOrder;
    ups[`rooms/${currentRoomId}/players/${currentUser.uid}`] = null;

    await db.ref().update(ups);
    showNotification("Odadan ayrıldınız.");
  } else if (isSpectator && roomData.watchers && roomData.watchers[currentUser.uid]) {
    // Seyirci ise
    await db.ref(`rooms/${currentRoomId}/watchers/${currentUser.uid}`).remove();
    showNotification("İzlemeyi bıraktınız.");
  }

  showProfilePage();
});

/*****************************************************************
 * 13. Asker İşlemleri
 *****************************************************************/
function togglePopup(popup) {
  if (popup.style.display === "flex") popup.style.display = "none";
  else popup.style.display = "flex";
}

// Asker Popup
document.getElementById("open-military-btn").addEventListener("click", () => {
  if (isSpectator) {
    showNotification("Seyirci modundasınız.");
    return;
  }
  togglePopup(document.getElementById("military-popup"));
});
document.getElementById("close-military-btn").addEventListener("click", () => {
  document.getElementById("military-popup").style.display = "none";
});

document.getElementById("attack-btn").addEventListener("click", attack);
function attack() {
  if (!isMyTurn()) {
    showNotification("Sıranız değil!");
    return;
  }
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const soldiers = parseInt(document.getElementById("attack-soldiers").value);
  if (isNaN(soldiers) || soldiers <= 0) {
    showNotification("Geçerli asker sayısı girin!");
    return;
  }
  const att = roomData.players[currentUser.uid];
  if (att.petrol < soldiers) {
    showNotification(`Bu saldırı için ${soldiers} varil petrol gerekli!`);
    return;
  }
  const targ = roomData.countryData[selectedCountry];
  if (!targ) return;

  // İlk 3 tur sadece sahipsiz ülkeye
  if (roomData.round < 4 && targ.owner && targ.owner !== currentUser.uid) {
    showNotification("İlk 3 tur yalnızca sahipsiz ülkelere saldırabilirsiniz!");
    return;
  }
  // Pakt
  if (targ.owner && targ.owner !== currentUser.uid) {
    if (hasActivePact(currentUser.uid, targ.owner)) {
      showNotification("Bu oyuncu ile saldırmazlık paktınız var!");
      return;
    }
  }

  const ups = {};
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/petrol`] = att.petrol - soldiers;

  // Kendi ülkesine asker koyma
  if (targ.owner === currentUser.uid) {
    if (soldiers > att.soldiers) {
      showNotification("Yeterli askeriniz yok!");
      return;
    }
    ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/soldiers`] = targ.soldiers + soldiers;
    ups[`rooms/${currentRoomId}/players/${currentUser.uid}/soldiers`] = att.soldiers - soldiers;
    db.ref().update(ups, () => {
      immediateOilReward(currentUser.uid);
    });
    broadcastNotification(`Kendi ülkesine asker taşıdı: ${att.name}`, currentRoomId);
    showNotification(`${selectedCountry} ülkesine ${soldiers} asker yerleştirildi.`);
    return nextTurn();
  }

  // Normal saldırı
  if (soldiers > att.soldiers) {
    showNotification("Yeterli askeriniz yok!");
    return;
  }
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/soldiers`] = att.soldiers - soldiers;

  let result = "";
  let effectiveAttackers = soldiers;
  // Kale
  if (targ.castleDefenseLevel > 0) {
    const defPerc = targ.castleDefenseLevel * 5;
    const killedByCastle = Math.floor((defPerc / 100) * effectiveAttackers);
    effectiveAttackers -= killedByCastle;
    if (effectiveAttackers < 0) effectiveAttackers = 0;
    result += `Kale savunması: ${killedByCastle} saldıran asker öldü. `;
  }
  if (effectiveAttackers > targ.soldiers) {
    // Fethedildi
    const rem = effectiveAttackers - targ.soldiers;
    ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/soldiers`] = rem;
    ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/owner`] = currentUser.uid;
    ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/supporters`] = {};

    if (targ.owner && roomData.players[targ.owner]) {
      let defC = roomData.players[targ.owner].countries || [];
      defC = defC.filter((x) => x !== selectedCountry);
      ups[`rooms/${currentRoomId}/players/${targ.owner}/countries`] = defC;
    }
    let myC = att.countries || [];
    if (!myC.includes(selectedCountry)) myC.push(selectedCountry);
    ups[`rooms/${currentRoomId}/players/${currentUser.uid}/countries`] = myC;
    result += `${selectedCountry} fethedildi!`;
  } else {
    ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/soldiers`] =
      targ.soldiers - effectiveAttackers;
    result += `${selectedCountry} savunuldu!`;
  }

  db.ref().update(ups, () => {
    immediateOilReward(currentUser.uid);
  });
  broadcastNotification(`${att.name} → ${selectedCountry}. ${result}`, currentRoomId);
  showNotification(result);
  nextTurn();
}

function immediateOilReward(playerId) {
  if (!roomData?.players[playerId]) return;
  const p = roomData.players[playerId];
  if (!p.countries) return;
  let totalOil = 0;
  p.countries.forEach((cn) => {
    const c = roomData.countryData[cn];
    if (c?.oilProduction) {
      const eff = Math.floor(c.oilProduction * (1 + 0.15 * (c.refineries || 0)));
      totalOil += eff;
    }
  });
  if (totalOil > 0) {
    const newVal = (p.petrol || 0) + totalOil;
    db.ref(`rooms/${currentRoomId}/players/${playerId}/petrol`).set(newVal);
    showNotification(`Saldırı sonrası petrol: +${totalOil} varil`);
    broadcastNotification(`${p.name}, saldırı sonrası +${totalOil} petrol kazandı!`, currentRoomId);
  }
}

// Asker Satın Al
document.getElementById("buy-soldiers-btn").addEventListener("click", buySoldiers);
function buySoldiers() {
  if (isSpectator) {
    showNotification("Seyirci modundasınız.");
    return;
  }
  const c = parseInt(document.getElementById("soldiers-to-buy").value);
  if (isNaN(c) || c <= 0) {
    showNotification("Geçerli sayı girin!");
    return;
  }
  const p = roomData.players[currentUser.uid];
  const costMoney = 10 * c;
  const costWheat = 25 * c;
  if (p.money < costMoney) {
    showNotification("Yeterli paranız yok!");
    return;
  }
  if (p.wheat < costWheat) {
    showNotification("Yeterli buğdayınız yok!");
    return;
  }
  const ups = {};
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/money`] = p.money - costMoney;
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/wheat`] = p.wheat - costWheat;
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/soldiers`] = p.soldiers + c;

  db.ref().update(ups);
  broadcastNotification(`${p.name} ${c} asker satın aldı.`, currentRoomId);
  showNotification(`${c} asker satın alındı.`);
}

// Asker Çek
document.getElementById("pull-soldiers-btn").addEventListener("click", pullSoldiers);
function pullSoldiers() {
  if (isSpectator) {
    showNotification("Seyirci modundasınız.");
    return;
  }
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const num = parseInt(document.getElementById("pull-soldiers-count").value);
  if (isNaN(num) || num <= 0) {
    showNotification("Geçerli asker sayısı girin!");
    return;
  }
  const p = roomData.players[currentUser.uid];
  const cd = roomData.countryData[selectedCountry];
  if (!cd) return;

  const ups = {};
  if (cd.owner === currentUser.uid) {
    // Destek hariç
    let totalSup = 0;
    for (let sid in cd.supporters) totalSup += cd.supporters[sid];
    const occupant = cd.soldiers - totalSup;
    if (occupant < num) {
      showNotification("Destek askerleri hariç bu kadar çekemezsiniz!");
      return;
    }
    ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/soldiers`] = cd.soldiers - num;
    ups[`rooms/${currentRoomId}/players/${currentUser.uid}/soldiers`] = p.soldiers + num;
    broadcastNotification(`${p.name}, ${selectedCountry} ülkesinden ${num} asker çekti.`, currentRoomId);
  } else {
    // Destek asker çekme
    const mySup = cd.supporters?.[currentUser.uid] || 0;
    if (mySup < num) {
      showNotification("Bu ülkede o kadar destek askeriniz yok!");
      return;
    }
    if (cd.soldiers < num) {
      showNotification("Ülkede yeterli asker yok!");
      return;
    }
    ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/soldiers`] = cd.soldiers - num;
    const newSup = mySup - num;
    if (newSup <= 0) {
      ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/supporters/${currentUser.uid}`] = null;
    } else {
      ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/supporters/${currentUser.uid}`] = newSup;
    }
    ups[`rooms/${currentRoomId}/players/${currentUser.uid}/soldiers`] = p.soldiers + num;
    broadcastNotification(`${p.name}, ${selectedCountry} ülkesinden ${num} destek asker çekti.`, currentRoomId);
  }
  db.ref().update(ups);
  showNotification("Asker çekildi.");
}

// Askeri Destek
document.getElementById("send-support-btn").addEventListener("click", sendSupport);
function sendSupport() {
  if (isSpectator) {
    showNotification("Seyirci modundasınız.");
    return;
  }
  const rec = document.getElementById("support-recipient").value;
  const cName = document.getElementById("support-recipient-country").value;
  const num = parseInt(document.getElementById("support-soldiers").value);
  if (!rec || !cName || isNaN(num) || num <= 0) {
    showNotification("Oyuncu, ülke ve asker sayısı geçerli olmalı!");
    return;
  }
  const p = roomData.players[currentUser.uid];
  if (p.soldiers < num) {
    showNotification("Yeterli askeriniz yok!");
    return;
  }
  const tc = roomData.countryData[cName];
  if (!tc || tc.owner !== rec) {
    showNotification("Bu ülke o oyuncuya ait değil!");
    return;
  }

  const ups = {};
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/soldiers`] = p.soldiers - num;
  ups[`rooms/${currentRoomId}/countryData/${cName}/soldiers`] = (tc.soldiers || 0) + num;
  const oldSup = tc.supporters?.[currentUser.uid] || 0;
  ups[`rooms/${currentRoomId}/countryData/${cName}/supporters/${currentUser.uid}`] = oldSup + num;

  db.ref().update(ups);
  broadcastNotification(`${p.name}, ${roomData.players[rec].name} (${cName}) ülkesine ${num} asker destek verdi.`, currentRoomId);
  showNotification("Askeri destek gönderildi!");
}

// Destek select
function updateSupportRecipientSelect() {
  const sel = document.getElementById("support-recipient");
  if (!sel) return;
  sel.innerHTML = "<option value=''>--Oyuncu Seç--</option>";
  if (!roomData?.playerOrder) return;
  roomData.playerOrder.forEach((pid) => {
    if (pid !== currentUser.uid && roomData.players[pid]) {
      const o = document.createElement("option");
      o.value = pid;
      o.textContent = roomData.players[pid].name;
      sel.appendChild(o);
    }
  });
}
document.getElementById("support-recipient").addEventListener("change", function () {
  const rec = this.value;
  const sc = document.getElementById("support-recipient-country");
  sc.innerHTML = "<option value=''>--Ülke Seç--</option>";
  if (!rec || !roomData.players[rec]) return;
  const rc = roomData.players[rec].countries || [];
  rc.forEach((cn) => {
    const opt = document.createElement("option");
    opt.value = cn;
    opt.textContent = cn;
    sc.appendChild(opt);
  });
});

/*****************************************************************
 * 14. Kaynak Gönderme
 *****************************************************************/
document.getElementById("open-resource-btn").addEventListener("click", () => {
  if (isSpectator) {
    showNotification("Seyirci modundasınız.");
    return;
  }
  togglePopup(document.getElementById("resource-popup"));
});
document.getElementById("close-resource-btn").addEventListener("click", () => {
  document.getElementById("resource-popup").style.display = "none";
});

document.getElementById("send-money-btn").addEventListener("click", sendMoney);
document.getElementById("send-petrol-btn").addEventListener("click", sendPetrol);
document.getElementById("send-wheat-btn").addEventListener("click", sendWheat);

function updateRecipientSelects() {
  const moneySel = document.getElementById("recipient-player");
  const petrolSel = document.getElementById("recipient-player-petrol");
  const wheatSel = document.getElementById("recipient-player-wheat");
  if (!moneySel || !petrolSel || !wheatSel) return;
  moneySel.innerHTML = "";
  petrolSel.innerHTML = "";
  wheatSel.innerHTML = "";

  if (roomData?.playerOrder) {
    roomData.playerOrder.forEach((pid) => {
      if (pid !== currentUser.uid && roomData.players[pid]) {
        const n = roomData.players[pid].name;
        const o1 = document.createElement("option");
        o1.value = pid;
        o1.textContent = n;
        moneySel.appendChild(o1);

        const o2 = document.createElement("option");
        o2.value = pid;
        o2.textContent = n;
        petrolSel.appendChild(o2);

        const o3 = document.createElement("option");
        o3.value = pid;
        o3.textContent = n;
        wheatSel.appendChild(o3);
      }
    });
  }
}

function sendMoney() {
  if (isSpectator) {
    showNotification("Seyirci modundasınız.");
    return;
  }
  const amt = parseInt(document.getElementById("money-to-send").value);
  const recId = document.getElementById("recipient-player").value;
  if (isNaN(amt) || amt <= 0) {
    showNotification("Geçerli miktar girin!");
    return;
  }
  const cp = roomData.players[currentUser.uid];
  if (cp.money < amt) {
    showNotification("Yeterli paranız yok!");
    return;
  }
  if (!recId) {
    showNotification("Alıcı seçin!");
    return;
  }
  const ups = {};
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/money`] = cp.money - amt;
  ups[`rooms/${currentRoomId}/players/${recId}/money`] = roomData.players[recId].money + amt;

  db.ref().update(ups);
  broadcastNotification(`${cp.name} → ${roomData.players[recId].name}: ${amt}$`, currentRoomId);
  showNotification(`${amt}$ gönderildi.`);
}

function sendPetrol() {
  if (isSpectator) {
    showNotification("Seyirci modundasınız.");
    return;
  }
  const amt = parseInt(document.getElementById("petrol-to-send").value);
  const recId = document.getElementById("recipient-player-petrol").value;
  if (isNaN(amt) || amt <= 0) {
    showNotification("Geçerli miktar girin!");
    return;
  }
  const cp = roomData.players[currentUser.uid];
  if (cp.petrol < amt) {
    showNotification("Yeterli petrol yok!");
    return;
  }
  if (!recId) {
    showNotification("Alıcı seçin!");
    return;
  }
  const ups = {};
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/petrol`] = cp.petrol - amt;
  ups[`rooms/${currentRoomId}/players/${recId}/petrol`] = roomData.players[recId].petrol + amt;

  db.ref().update(ups);
  broadcastNotification(`${cp.name} → ${roomData.players[recId].name}: ${amt} varil petrol`, currentRoomId);
  showNotification(`${amt} varil petrol gönderildi.`);
}

function sendWheat() {
  if (isSpectator) {
    showNotification("Seyirci modundasınız.");
    return;
  }
  const amt = parseInt(document.getElementById("wheat-to-send").value);
  const recId = document.getElementById("recipient-player-wheat").value;
  if (isNaN(amt) || amt <= 0) {
    showNotification("Geçerli miktar girin!");
    return;
  }
  const cp = roomData.players[currentUser.uid];
  if (cp.wheat < amt) {
    showNotification("Yeterli buğday yok!");
    return;
  }
  if (!recId) {
    showNotification("Alıcı seçin!");
    return;
  }
  const ups = {};
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/wheat`] = cp.wheat - amt;
  ups[`rooms/${currentRoomId}/players/${recId}/wheat`] = roomData.players[recId].wheat + amt;

  db.ref().update(ups);
  broadcastNotification(`${cp.name} → ${roomData.players[recId].name}: ${amt} buğday`, currentRoomId);
  showNotification(`${amt} buğday gönderildi.`);
}

/*****************************************************************
 * 15. Bina Kurma
 *****************************************************************/
document.getElementById("open-building-btn").addEventListener("click", () => {
  if (isSpectator) {
    showNotification("Seyirci modundasınız.");
    return;
  }
  togglePopup(document.getElementById("building-popup"));
  updateCastleUpgradeCostUI();
});
document.getElementById("close-building-btn").addEventListener("click", () => {
  document.getElementById("building-popup").style.display = "none";
});

document.getElementById("buy-barracks-btn").addEventListener("click", buildBarracks);
document.getElementById("build-factory-btn").addEventListener("click", buildFactory);
document.getElementById("build-refinery-btn").addEventListener("click", buildRefinery);
document.getElementById("build-grainmill-btn").addEventListener("click", buildGrainMill);
document.getElementById("build-castle-btn").addEventListener("click", buildCastle);
document.getElementById("upgrade-castle-btn").addEventListener("click", upgradeCastle);

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
  const cd = roomData.countryData[selectedCountry];
  if (!cd || cd.owner !== currentUser.uid) {
    showNotification("Bu ülke size ait değil!");
    return;
  }
  const costM = 300 * q;
  const costP = 50 * q;
  const costW = 120 * q;
  const p = roomData.players[currentUser.uid];
  if (p.money < costM || p.petrol < costP || p.wheat < costW) {
    showNotification("Yeterli kaynağınız yok!");
    return;
  }

  const ups = {};
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/money`] = p.money - costM;
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/petrol`] = p.petrol - costP;
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/wheat`] = p.wheat - costW;
  ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/barracksCount`] = cd.barracksCount + q;
  db.ref().update(ups);
  broadcastNotification(`${p.name}, ${selectedCountry} ülkesine ${q} kışla kurdu!`, currentRoomId);
  showNotification(`${q} kışla kuruldu!`);
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
  const cd = roomData.countryData[selectedCountry];
  if (!cd || cd.owner !== currentUser.uid) {
    showNotification("Bu ülke size ait değil!");
    return;
  }
  const costM = 500 * q;
  const costP = 130 * q;
  const p = roomData.players[currentUser.uid];
  if (p.money < costM || p.petrol < costP) {
    showNotification("Yeterli kaynağınız yok!");
    return;
  }

  const ups = {};
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/money`] = p.money - costM;
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/petrol`] = p.petrol - costP;
  ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/factories`] = cd.factories + q;
  db.ref().update(ups);
  broadcastNotification(`${p.name}, ${selectedCountry} ülkesine ${q} fabrika kurdu!`, currentRoomId);
  showNotification(`${q} fabrika kuruldu!`);
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
  const cd = roomData.countryData[selectedCountry];
  if (!cd || cd.owner !== currentUser.uid) {
    showNotification("Bu ülke size ait değil!");
    return;
  }
  const costM = 800 * q;
  const costP = 250 * q;
  const p = roomData.players[currentUser.uid];
  if (p.money < costM || p.petrol < costP) {
    showNotification("Yeterli kaynağınız yok!");
    return;
  }

  const ups = {};
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/money`] = p.money - costM;
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/petrol`] = p.petrol - costP;
  ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/refineries`] = cd.refineries + q;
  db.ref().update(ups);
  broadcastNotification(`${p.name}, ${selectedCountry} ülkesine ${q} rafine kurdu!`, currentRoomId);
  showNotification(`${q} rafine kuruldu!`);
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
  const cd = roomData.countryData[selectedCountry];
  if (!cd || cd.owner !== currentUser.uid) {
    showNotification("Bu ülke size ait değil!");
    return;
  }
  const costM = 200 * q;
  const costP = 100 * q;
  const p = roomData.players[currentUser.uid];
  if (p.money < costM || p.petrol < costP) {
    showNotification("Yeterli kaynağınız yok!");
    return;
  }

  const ups = {};
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/money`] = p.money - costM;
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/petrol`] = p.petrol - costP;
  ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/grainMills`] = cd.grainMills + q;
  db.ref().update(ups);
  broadcastNotification(`${p.name}, ${selectedCountry} ülkesine ${q} değirmen kurdu!`, currentRoomId);
  showNotification(`${q} değirmen kuruldu!`);
}

function buildCastle() {
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const cd = roomData.countryData[selectedCountry];
  if (!cd || cd.owner !== currentUser.uid) {
    showNotification("Bu ülke size ait değil!");
    return;
  }
  if (cd.castleDefenseLevel > 0) {
    showNotification("Bu ülkede zaten kale var!");
    return;
  }
  const p = roomData.players[currentUser.uid];
  if (p.money < 1000 || p.petrol < 1000 || p.wheat < 1000) {
    showNotification("Kale için yeterli kaynak yok!");
    return;
  }
  const ups = {};
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/money`] = p.money - 1000;
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/petrol`] = p.petrol - 1000;
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/wheat`] = p.wheat - 1000;
  ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/castleDefenseLevel`] = 1;
  ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/castleNextUpgradeCost`] = {
    money: 1300,
    petrol: 1300,
    wheat: 1300
  };
  db.ref().update(ups);
  broadcastNotification(`${p.name}, ${selectedCountry} ülkesine kale kurdu!`, currentRoomId);
  showNotification("Kale kuruldu (%5).");
}

function upgradeCastle() {
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const cd = roomData.countryData[selectedCountry];
  if (!cd || cd.owner !== currentUser.uid) {
    showNotification("Bu ülke size ait değil!");
    return;
  }
  if (cd.castleDefenseLevel < 1) {
    showNotification("Önce kale kurun!");
    return;
  }
  if (cd.castleDefenseLevel >= 6) {
    showNotification("Kale savunması %30 üstünde!");
    return;
  }
  if (!cd.castleNextUpgradeCost) {
    showNotification("Yükseltme verisi yok!");
    return;
  }
  const p = roomData.players[currentUser.uid];
  const cost = cd.castleNextUpgradeCost;
  if (p.money < cost.money || p.petrol < cost.petrol || p.wheat < cost.wheat) {
    showNotification("Yeterli kaynak yok!");
    return;
  }

  const ups = {};
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/money`] = p.money - cost.money;
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/petrol`] = p.petrol - cost.petrol;
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/wheat`] = p.wheat - cost.wheat;

  const newLvl = cd.castleDefenseLevel + 1;
  ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/castleDefenseLevel`] = newLvl;
  const nm = Math.floor(cost.money * 1.3);
  const np = Math.floor(cost.petrol * 1.3);
  const nw = Math.floor(cost.wheat * 1.3);
  ups[`rooms/${currentRoomId}/countryData/${selectedCountry}/castleNextUpgradeCost`] = {
    money: nm, petrol: np, wheat: nw
  };
  db.ref().update(ups, () => updateCastleUpgradeCostUI());
  broadcastNotification(`${p.name}, ${selectedCountry} kalesini güçlendirdi (Seviye ${newLvl}).`, currentRoomId);
  showNotification(`Kale güçlendirildi (%${newLvl * 5}).`);
}

function updateCastleUpgradeCostUI() {
  const span = document.getElementById("castle-upgrade-cost-text");
  if (!span) return;
  if (!selectedCountry || !roomData?.countryData?.[selectedCountry]) {
    span.textContent = "-";
    return;
  }
  const cd = roomData.countryData[selectedCountry];
  if (cd.castleDefenseLevel < 1) {
    span.textContent = "Önce kale kurulmalı.";
    return;
  }
  if (cd.castleDefenseLevel >= 6) {
    span.textContent = "Maks seviye (%30)!";
    return;
  }
  if (!cd.castleNextUpgradeCost) {
    span.textContent = "-";
    return;
  }
  span.textContent = `${cd.castleNextUpgradeCost.money}$ + ${cd.castleNextUpgradeCost.petrol} Varil + ${cd.castleNextUpgradeCost.wheat} Buğday`;
}

/*****************************************************************
 * 16. Saldırmazlık Pakti
 *****************************************************************/
document.getElementById("open-pact-btn").addEventListener("click", () => {
  if (isSpectator) {
    showNotification("Seyirci modundasınız.");
    return;
  }
  togglePopup(document.getElementById("pact-popup"));
});
document.getElementById("close-pact-btn").addEventListener("click", () => {
  document.getElementById("pact-popup").style.display = "none";
});
document.getElementById("send-pact-offer-btn").addEventListener("click", () => {
  if (!isMyTurn()) {
    showNotification("Saldırmazlık Paktı teklifini sadece kendi sıranızda yapabilirsiniz!");
    return;
  }
  const rec = document.getElementById("pact-offer-recipient").value;
  const dur = parseInt(document.getElementById("pact-duration").value);
  const cst = parseInt(document.getElementById("pact-cost").value);
  if (!rec || rec === currentUser.uid) {
    showNotification("Geçerli bir oyuncu seçin!");
    return;
  }
  if (isNaN(dur) || dur <= 0) {
    showNotification("Geçerli tur sayısı girin!");
    return;
  }
  if (isNaN(cst) || cst < 0) {
    showNotification("Para miktarı geçersiz!");
    return;
  }
  if (hasActivePact(currentUser.uid, rec)) {
    showNotification("Bu oyuncuyla zaten aktif pakt var!");
    return;
  }
  const snd = roomData.players[currentUser.uid];
  const offRef = db.ref(`rooms/${currentRoomId}/pactOffers`).push();
  const newOff = {
    offerId: offRef.key,
    senderId: currentUser.uid,
    senderName: snd.name,
    recipientId: rec,
    duration: dur,
    cost: cst,
    status: "pending"
  };
  offRef.set(newOff);
  broadcastNotification(`Pakt Teklifi: ${snd.name} → ${roomData.players[rec].name} (Tur:${dur}, Para:${cst}$)`, currentRoomId);
  showNotification("Pakt teklifi gönderildi!");
});

function hasActivePact(a, b) {
  if (!roomData?.pacts) return false;
  for (let pid in roomData.pacts) {
    const pk = roomData.pacts[pid];
    if (pk.active && roomData.round <= pk.expirationRound) {
      if ((pk.playerA === a && pk.playerB === b) ||
          (pk.playerA === b && pk.playerB === a)) {
        return true;
      }
    }
  }
  return false;
}

function displayPendingPactOffers() {
  const c = document.getElementById("pact-pending-offers");
  if (!c) return;
  c.innerHTML = "";
  if (!roomData?.pactOffers) return;

  for (let key in roomData.pactOffers) {
    const off = roomData.pactOffers[key];
    if (off.status === "pending" && off.recipientId === currentUser.uid) {
      const d = document.createElement("div");
      d.className = "pact-offer-item";
      d.dataset.offerId = off.offerId;
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

function displayActivePacts() {
  const con = document.getElementById("active-pacts-container");
  if (!con) return;
  con.innerHTML = "";
  if (!roomData?.pacts) return;
  for (let pid in roomData.pacts) {
    const pk = roomData.pacts[pid];
    if (pk.active && roomData.round <= pk.expirationRound) {
      if (pk.playerA === currentUser.uid || pk.playerB === currentUser.uid) {
        const other = pk.playerA === currentUser.uid ? pk.playerB : pk.playerA;
        const oName = roomData.players[other]?.name || "???";
        const rLeft = pk.expirationRound - roomData.round + 1;

        const d = document.createElement("div");
        d.className = "active-pact-item";
        d.innerHTML = `
          <p>Pakt: <strong>${oName}</strong></p>
          <p>Kalan Tur: <strong>${rLeft}</strong></p>
        `;
        con.appendChild(d);
      }
    }
  }
}

document.getElementById("pact-pending-offers").addEventListener("click", (e) => {
  if (e.target.classList.contains("accept-btn")) {
    const oid = e.target.getAttribute("data-offer-id");
    acceptPactOffer(oid);
  } else if (e.target.classList.contains("reject-btn")) {
    const oid = e.target.getAttribute("data-offer-id");
    rejectPactOffer(oid);
  }
});

function acceptPactOffer(offId) {
  const off = roomData?.pactOffers?.[offId];
  if (!off || off.status !== "pending") return;
  if (hasActivePact(off.senderId, off.recipientId)) {
    showNotification("Zaten aktif pakt var!");
    db.ref(`rooms/${currentRoomId}/pactOffers/${offId}`).update({ status: "rejected" });
    return;
  }
  const s = roomData.players[off.senderId];
  const r = roomData.players[off.recipientId];
  if (!s || !r) return;

  if (s.money < off.cost) {
    showNotification("Teklifi gönderenin parası yok! Geçersiz.");
    db.ref(`rooms/${currentRoomId}/pactOffers/${offId}`).update({ status: "rejected" });
    return;
  }
  const exRound = (roomData.round || 1) + off.duration;
  const pkId = db.ref().push().key;
  const ups = {};
  ups[`rooms/${currentRoomId}/pactOffers/${offId}/status`] = "accepted";
  ups[`rooms/${currentRoomId}/players/${off.senderId}/money`] = s.money - off.cost;
  ups[`rooms/${currentRoomId}/players/${off.recipientId}/money`] = r.money + off.cost;
  if (!roomData.pacts) ups[`rooms/${currentRoomId}/pacts`] = {};
  ups[`rooms/${currentRoomId}/pacts/${pkId}`] = {
    playerA: off.senderId,
    playerB: off.recipientId,
    active: true,
    cost: off.cost,
    duration: off.duration,
    expirationRound: exRound
  };
  db.ref().update(ups);
  broadcastNotification(`Pakt: ${s.name} & ${r.name} (Tur:${off.duration}, Para:${off.cost}$).`, currentRoomId);
  showNotification("Pakt teklifi kabul edildi!");
}

function rejectPactOffer(offId) {
  const off = roomData?.pactOffers?.[offId];
  if (!off || off.status !== "pending") return;
  db.ref(`rooms/${currentRoomId}/pactOffers/${offId}`).update({ status: "rejected" });
  broadcastNotification(`Pakt Reddedildi: ${off.senderName}`, currentRoomId);
  showNotification("Pakt teklifi reddedildi.");
}

function updatePactRecipientSelect() {
  const sel = document.getElementById("pact-offer-recipient");
  if (!sel) return;
  sel.innerHTML = "";
  if (roomData?.playerOrder) {
    roomData.playerOrder.forEach((pid) => {
      if (pid !== currentUser.uid && roomData.players[pid]) {
        const o = document.createElement("option");
        o.value = pid;
        o.textContent = roomData.players[pid].name;
        sel.appendChild(o);
      }
    });
  }
}

/*****************************************************************
 * 17. Market (Ticaret)
 *****************************************************************/
document.getElementById("open-market-btn").addEventListener("click", () => {
  if (isSpectator) {
    showNotification("Seyirci modundasınız.");
    return;
  }
  togglePopup(document.getElementById("market-popup"));
});
document.getElementById("close-market-btn").addEventListener("click", () => {
  document.getElementById("market-popup").style.display = "none";
});

document.getElementById("create-trade-offer-btn").addEventListener("click", createTradeOffer);
function createTradeOffer() {
  if (!isMyTurn()) {
    showNotification("Sadece kendi sıranızda ticaret teklifi oluşturabilirsiniz!");
    return;
  }
  const itemType = document.getElementById("trade-item-type").value;
  const qty = parseInt(document.getElementById("trade-quantity").value);
  const price = parseInt(document.getElementById("trade-price").value);
  if (isNaN(qty) || qty <= 0 || isNaN(price) || price <= 0) {
    showNotification("Geçerli miktar/fiyat girin!");
    return;
  }
  const seller = roomData.players[currentUser.uid];
  let ok = false;
  if (itemType === "petrol" && seller.petrol >= qty) ok = true;
  if (itemType === "wheat" && seller.wheat >= qty) ok = true;
  if (!ok) {
    showNotification("Yeterli ürününüz yok!");
    return;
  }

  const embargoSelect = document.getElementById("embargo-players");
  let embargoList = [];
  for (let i = 0; i < embargoSelect.options.length; i++) {
    if (embargoSelect.options[i].selected) {
      embargoList.push(embargoSelect.options[i].value);
    }
  }

  const offRef = db.ref(`rooms/${currentRoomId}/tradeOffers`).push();
  offRef.set({
    offerId: offRef.key,
    sellerId: currentUser.uid,
    sellerName: seller.name,
    itemType,
    quantity: qty,
    price,
    status: "pending",
    embargo: embargoList
  });
  broadcastNotification(`${seller.name} ticaret teklifi oluşturdu (${itemType}, adet:${qty}, fiyat:${price}$).`, currentRoomId);
  showNotification("Ticaret teklifi oluşturuldu!");
}

function displayTradeOffers() {
  const div = document.getElementById("trade-offers-list");
  if (!div) return;
  div.innerHTML = "";
  if (!roomData?.tradeOffers) return;

  Object.values(roomData.tradeOffers).forEach((o) => {
    if (o.status === "pending") {
      if (o.embargo && o.embargo.includes(currentUser.uid)) return;
      const d = document.createElement("div");
      d.className = "offer-item";
      let label = o.itemType === "petrol" ? "Petrol" : "Buğday";
      let html = `
        <p><strong>Satıcı:</strong> ${o.sellerName}</p>
        <p><strong>Ürün:</strong> ${label}</p>
        <p><strong>Mevcut Miktar:</strong> ${o.quantity}</p>
        <p><strong>Birim Fiyat:</strong> ${o.price} $</p>
      `;
      if (o.sellerId !== currentUser.uid) {
        html += `
          <label style="font-size:14px;color:#ccc;">Almak istediğiniz miktar:</label>
          <input type="number" class="partial-buy-quantity" placeholder="Miktar" min="1" max="${o.quantity}" />
          <button class="partial-buy-btn">Satın Al</button>
        `;
      } else {
        html += `
          <button class="cancel-offer-btn" style="background:linear-gradient(45deg, #c0392b, #e74c3c); margin-top:10px;">
            İptal Et
          </button>
        `;
      }
      if (o.embargo?.length > 0) {
        const embUsers = o.embargo.map((id) => roomData.players[id]?.name || "???").join(", ");
        html += `<p style="color:red;"><strong>Ambargo:</strong> ${embUsers}</p>`;
      }
      d.innerHTML = html;

      const buyBtn = d.querySelector(".partial-buy-btn");
      if (buyBtn) {
        buyBtn.addEventListener("click", () => {
          const inp = d.querySelector(".partial-buy-quantity");
          const amt = parseInt(inp.value);
          if (isNaN(amt) || amt <= 0) {
            showNotification("Geçerli miktar girin!");
            return;
          }
          acceptTradeOffer(o.offerId, amt);
        });
      }
      const cancelBtn = d.querySelector(".cancel-offer-btn");
      if (cancelBtn) {
        cancelBtn.addEventListener("click", () => cancelTradeOffer(o.offerId));
      }
      div.appendChild(d);
    }
  });
}

function acceptTradeOffer(offId, buyAmount) {
  const off = roomData?.tradeOffers?.[offId];
  if (!off || off.status !== "pending") {
    showNotification("Teklif geçerli değil!");
    return;
  }
  const s = roomData.players[off.sellerId];
  const b = roomData.players[currentUser.uid];
  if (!s || !b) return;
  if (buyAmount > off.quantity) {
    showNotification("Teklifte yeterli stok yok!");
    return;
  }
  const totalCost = off.price * buyAmount;
  if (b.money < totalCost) {
    showNotification("Yeterli paranız yok!");
    return;
  }

  const ups = {};
  let hasEnough = false;
  if (off.itemType === "petrol") {
    if (s.petrol >= buyAmount) {
      hasEnough = true;
      ups[`rooms/${currentRoomId}/players/${off.sellerId}/petrol`] = s.petrol - buyAmount;
      ups[`rooms/${currentRoomId}/players/${currentUser.uid}/petrol`] = b.petrol + buyAmount;
    }
  } else {
    // wheat
    if (s.wheat >= buyAmount) {
      hasEnough = true;
      ups[`rooms/${currentRoomId}/players/${off.sellerId}/wheat`] = s.wheat - buyAmount;
      ups[`rooms/${currentRoomId}/players/${currentUser.uid}/wheat`] = b.wheat + buyAmount;
    }
  }
  if (!hasEnough) {
    showNotification("Satıcının yeterli stoğu kalmamış!");
    return;
  }
  ups[`rooms/${currentRoomId}/players/${currentUser.uid}/money`] = b.money - totalCost;
  ups[`rooms/${currentRoomId}/players/${off.sellerId}/money`] = s.money + totalCost;
  const newQ = off.quantity - buyAmount;
  if (newQ <= 0) {
    ups[`rooms/${currentRoomId}/tradeOffers/${offId}/status`] = "completed";
  }
  ups[`rooms/${currentRoomId}/tradeOffers/${offId}/quantity`] = newQ;

  db.ref().update(ups, () => {
    broadcastNotification(`Ticaret: ${s.name} -> ${b.name} (${buyAmount} x ${off.itemType}).`, currentRoomId);
    showNotification("Ticaret başarıyla gerçekleşti!");
  });
}

function cancelTradeOffer(offId) {
  const off = roomData?.tradeOffers?.[offId];
  if (!off) return;
  if (off.sellerId !== currentUser.uid) {
    showNotification("Sadece kendi teklifinizi iptal edebilirsiniz!");
    return;
  }
  if (off.status !== "pending") {
    showNotification("Bu teklif zaten tamamlandı/iptal.");
    return;
  }
  db.ref(`rooms/${currentRoomId}/tradeOffers/${offId}`).update({ status: "cancelled" });
  broadcastNotification(`Ticaret teklifi iptal edildi: ${off.sellerName}`, currentRoomId);
  showNotification("Teklif iptal edildi.");
}

function updateEmbargoPlayersSelect() {
  const sel = document.getElementById("embargo-players");
  if (!sel) return;
  sel.innerHTML = "";
  if (roomData?.playerOrder) {
    roomData.playerOrder.forEach((pid) => {
      if (pid !== currentUser.uid && roomData.players[pid]) {
        const o = document.createElement("option");
        o.value = pid;
        o.textContent = roomData.players[pid].name;
        sel.appendChild(o);
      }
    });
  }
}

/*****************************************************************
 * 18. Sohbet (Chat)
 *****************************************************************/
document.getElementById("open-chat-btn").addEventListener("click", () => {
  toggleChat(!chatOpen);
});
document.getElementById("close-chat-btn").addEventListener("click", () => {
  toggleChat(false);
});
function toggleChat(show) {
  const cPop = document.getElementById("chat-popup");
  cPop.style.display = show ? "flex" : "none";
  chatOpen = show;
  if (chatOpen) {
    unreadMessages = 0;
    updateChatBadge();
  }
}

document.getElementById("send-chat-btn").addEventListener("click", sendChatMessage);
document.getElementById("chat-input").addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendChatMessage();
});
function sendChatMessage() {
  if (!roomRef) return;
  const input = document.getElementById("chat-input");
  const txt = input.value.trim();
  if (!txt) return;
  let senderName = currentUserData?.displayName || "Anon";
  if (roomData.players?.[currentUser.uid]) {
    senderName = roomData.players[currentUser.uid].name;
  }
  const msg = {
    sender: senderName,
    senderId: currentUser.uid,
    text: txt,
    recipientId: "",
    timestamp: firebase.database.ServerValue.TIMESTAMP
  };
  roomRef.child("chat").push(msg, () => {
    input.value = "";
  });
}

// Özel Mesaj
document.getElementById("send-private-message-btn").addEventListener("click", () => {
  if (!roomRef) return;
  const pmInp = document.getElementById("private-message-input");
  const pmRec = document.getElementById("private-message-recipient");
  const txt = pmInp.value.trim();
  const rc = pmRec.value;
  if (!txt || !rc) return;

  let sName = currentUserData?.displayName || "Anon";
  if (roomData.players?.[currentUser.uid]) {
    sName = roomData.players[currentUser.uid].name;
  }
  const pm = {
    sender: sName,
    senderId: currentUser.uid,
    text: txt,
    recipientId: rc,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  };
  roomRef.child("chat").push(pm, () => {
    pmInp.value = "";
    showNotification("Özel mesaj gönderildi!");
  });
});

function appendChatMessage(m) {
  if (m.recipientId && m.recipientId !== "") {
    if (m.senderId !== currentUser.uid && m.recipientId !== currentUser.uid) {
      return;
    }
  }
  const chatDiv = document.getElementById("chat-messages");
  const d = document.createElement("div");
  if (m.recipientId && m.recipientId !== "") {
    const targName = roomData.players[m.recipientId]?.name || "???";
    if (m.senderId === currentUser.uid) {
      d.innerHTML = `<strong>[PM to ${targName}]:</strong> ${m.text}`;
    } else {
      d.innerHTML = `<strong>[PM from ${m.sender}]:</strong> ${m.text}`;
    }
    d.style.color = "#f39c12";
  } else {
    d.textContent = `${m.sender}: ${m.text}`;
  }
  chatDiv.appendChild(d);
  chatDiv.scrollTop = chatDiv.scrollHeight;

  if (!chatOpen && m.senderId !== currentUser.uid) {
    unreadMessages++;
    updateChatBadge();
  }
}

function updateChatBadge() {
  const btn = document.getElementById("open-chat-btn");
  btn.dataset.badge = unreadMessages > 0 ? unreadMessages : "";
}

/*****************************************************************
 * 19. PVT MSG Seçici
 *****************************************************************/
function updatePrivateMessageRecipientSelect() {
  const sel = document.getElementById("private-message-recipient");
  if (!sel) return;
  sel.innerHTML = "<option value=''>--Oyuncu Seç--</option>";
  if (roomData?.playerOrder) {
    roomData.playerOrder.forEach((pid) => {
      if (pid !== currentUser.uid && roomData.players[pid]) {
        const o = document.createElement("option");
        o.value = pid;
        o.textContent = roomData.players[pid].name;
        sel.appendChild(o);
      }
    });
  }
}

/*****************************************************************
 * 20. LEAFLET PATTERN (Bayrak)
 *****************************************************************/
function getPlayerPattern(playerId) {
  if (playerPatterns[playerId]) return playerPatterns[playerId];
  if (!roomData?.players[playerId]) return null;
  const p = roomData.players[playerId];
  if (!p.flag) return null;

  const pat = new L.Pattern({
    patternUnits: 'userSpaceOnUse',
    width: 50,
    height: 50
  });
  pat.addShape(
    new L.PatternShape('image', { x: 0, y: 0, width: 50, height: 50 }, { href: p.flag })
  );
  pat.addTo(map);
  playerPatterns[playerId] = pat;
  return pat;
}

/*****************************************************************
 * 21. BAYRAK DÜZENLEYİCİ
 *****************************************************************/
document.getElementById("edit-flag-btn").addEventListener("click", () => {
  initFlagCanvas();
  document.getElementById("flag-editor-popup").style.display = "flex";
});
document.getElementById("close-flag-editor-btn").addEventListener("click", () => {
  document.getElementById("flag-editor-popup").style.display = "none";
});
document.getElementById("save-flag-btn").addEventListener("click", saveFlagDrawing);

function initFlagCanvas() {
  if (!flagCanvas) {
    flagCanvas = document.getElementById("flag-canvas");
    flagCtx = flagCanvas.getContext("2d");
    flagCanvas.addEventListener("mousedown", startDrawing);
    flagCanvas.addEventListener("mousemove", drawOnCanvas);
    flagCanvas.addEventListener("mouseup", stopDrawing);
    flagCanvas.addEventListener("mouseleave", stopDrawing);
  }
  flagCtx.fillStyle = "#ffffff";
  flagCtx.fillRect(0, 0, flagCanvas.width, flagCanvas.height);

  if (currentUserData?.flag) {
    const img = new Image();
    img.onload = () => {
      flagCtx.drawImage(img, 0, 0, flagCanvas.width, flagCanvas.height);
    };
    img.src = currentUserData.flag;
  }
}
function startDrawing(e) {
  isDrawing = true;
  drawOnCanvas(e);
}
function drawOnCanvas(e) {
  if (!isDrawing) return;
  const rect = flagCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  flagCtx.lineWidth = brushSize;
  flagCtx.lineCap = "round";
  flagCtx.lineJoin = "round";
  flagCtx.strokeStyle = isErasing ? "#ffffff" : brushColor;

  flagCtx.lineTo(x, y);
  flagCtx.stroke();
  flagCtx.beginPath();
  flagCtx.moveTo(x, y);
}
function stopDrawing() {
  isDrawing = false;
  flagCtx.beginPath();
}
document.getElementById("flag-erase-btn").addEventListener("click", () => {
  isErasing = !isErasing;
  document.getElementById("flag-erase-btn").textContent = isErasing ? "Kalem" : "Silgi";
});
document.getElementById("flag-clear-btn").addEventListener("click", () => {
  flagCtx.fillStyle = "#ffffff";
  flagCtx.fillRect(0, 0, flagCanvas.width, flagCanvas.height);
});
document.getElementById("flag-color").addEventListener("input", (e) => {
  brushColor = e.target.value;
  if (isErasing) {
    isErasing = false;
    document.getElementById("flag-erase-btn").textContent = "Silgi";
  }
});
document.getElementById("flag-brush-size").addEventListener("input", (e) => {
  brushSize = parseInt(e.target.value);
});

function saveFlagDrawing() {
  if (!flagCanvas || !flagCtx) return;
  const url = flagCanvas.toDataURL("image/png");
  db.ref("users/" + currentUser.uid + "/flag").set(url);
  currentUserData.flag = url;
  showNotification("Bayrak kaydedildi!");
  document.getElementById("flag-editor-popup").style.display = "none";
}

/*****************************************************************
 * 22. Chat + Notification Dinleyicileri
 *****************************************************************/
function addChatListeners() {
  if (chatListenerAdded || !roomRef) return;
  roomRef.child("chat").on("child_added", (snap) => {
    const msg = snap.val();
    appendChatMessage(msg);
  });
  roomRef.child("notifications").on("child_added", (snap) => {
    const data = snap.val();
    if (data?.text) displayGlobalNotification(data.text);
  });
  chatListenerAdded = true;
}

/*****************************************************************
 * DOMContentLoaded
 *****************************************************************/
document.addEventListener("DOMContentLoaded", () => {
  // random local ID, ama asıl UID = firebase
  if (!localStorage.getItem("playerId")) {
    localStorage.setItem("playerId", Math.random().toString(36).substr(2, 9));
  }
  localPlayerId = localStorage.getItem("playerId");

  // Oyun ekranı açıldığı zaman chat dinleyicisini ekle
  const observer = new MutationObserver(() => {
    if (gameContainer.style.display !== "none" && roomRef) {
      addChatListeners();
    }
  });
  observer.observe(gameContainer, { attributes: true, attributeFilter: ["style"] });
});
