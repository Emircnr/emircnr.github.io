/***************************************************************
 *  gameLogic.js
 *  Bayrak resmiyle (base64) fethedilen ülkeleri dolduran sürüm.
 *  Tüm önceki özellikler + Leaflet.Pattern ile ülke dolgusu.
 ***************************************************************/

/*****************************************************************
 * 1. Firebase Başlatma
 *****************************************************************/
const firebaseConfig = {
  apiKey: "AIzaSy...",
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
 * 2. GENEL DEĞİŞKENLER (Auth, Profil, Oda vb.)
 *****************************************************************/
let currentUser = null;         // Firebase Auth kullanıcısı (uid)
let currentUserData = null;     // DB'deki kullanıcı verisi
let localPlayerId = null;       // Oyun içi benzersiz ID (Local Storage)
let currentRoomCode = null;
let roomRef = null;             // Firebase Realtime DB'deki "rooms/roomCode" ref
let roomData = null;

let selectedCountry = null;     // Haritada seçilen ülke
let map, geoJsonLayer = null;
let infoCardsPermanent = false; // Harita üzerindeki tooltip'lerin kalıcı olup olmaması
let turnTimeRemaining = 60;
let turnTimerInterval = null;
let startInterval = null;
let notificationsMuted = false;
let unreadMessages = 0;
let chatOpen = false;

// Bayrak düzenleyici
let flagCanvas, flagCtx;
let isDrawing = false;
let brushColor = "#ff0000";
let brushSize = 5;
let isErasing = false;  // Silgi modu

// Leaflet Pattern cache: her oyuncu için bir pattern saklıyoruz
let playerPatterns = {}; // { playerId: L.Pattern }

/*****************************************************************
 * 3. SAYFA YÖNETİMİ (Single Page Uygulama Mantığı)
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
    setUserOnlineStatus(true);

    const snapshot = await db.ref("users/" + user.uid).once("value");
    currentUserData = snapshot.val() || {};

    if (!currentUserData.displayName) {
      currentUserData.displayName = user.email.split("@")[0];
      await db.ref("users/" + user.uid).update({
        displayName: currentUserData.displayName
      });
    }
    document.getElementById("profile-username").textContent =
      currentUserData.displayName || "Kullanıcı Adınız";

    loadUserFriends();
    loadFriendRequests();
    loadFriendInviteList();
    loadRoomInvites();

    showProfilePage();
  } else {
    currentUser = null;
    currentUserData = null;
    showAuthPage();
  }
});

// Presence (online/offline)
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

/** Giriş Yap */
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

/** Kayıt Ol */
document.getElementById("register-btn").addEventListener("click", async () => {
  const email = document.getElementById("register-email").value.trim();
  const password = document.getElementById("register-password").value.trim();
  const confirmPassword = document
    .getElementById("register-confirm-password")
    .value.trim();
  const displayName = document
    .getElementById("register-display-name")
    .value.trim();

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

/** Çıkış Yap */
document.getElementById("profile-logout-btn").addEventListener("click", async () => {
  setUserOnlineStatus(false);
  await auth.signOut();
  showNotification("Çıkış yapıldı.");
});

/*****************************************************************
 * 5. Profil Ekranı (Arkadaşlar, İstekler, Oda Davetleri)
 *****************************************************************/
document.getElementById("go-lobby-btn").addEventListener("click", () => {
  showLobbyPage();
});

/** Arkadaşları Yükle */
async function loadUserFriends() {
  const friendListDiv = document.getElementById("friend-list");
  friendListDiv.innerHTML = "";
  if (!currentUserData || !currentUserData.friends) return;

  const friendIds = Object.keys(currentUserData.friends);
  for (const fId of friendIds) {
    const snap = await db.ref("users/" + fId).once("value");
    const friendData = snap.val();
    if (!friendData) continue;

    const friendItem = document.createElement("div");
    friendItem.className = "friend-item";
    friendItem.innerHTML = `
      <span>
        ${friendData.displayName} 
        ${
          friendData.online
            ? '<span class="online-status">(Çevrimiçi)</span>'
            : '<span class="offline-status">(Çevrimdışı)</span>'
        }
      </span>
      <button class="remove-friend-btn" data-fid="${fId}">
        Sil
      </button>
    `;
    friendListDiv.appendChild(friendItem);
  }
}

/** Arkadaş İsteklerini Yükle */
async function loadFriendRequests() {
  const requestListDiv = document.getElementById("friend-request-list");
  requestListDiv.innerHTML = "";
  if (!currentUserData || !currentUserData.friendRequests) return;

  const requestIds = Object.keys(currentUserData.friendRequests);
  for (const rId of requestIds) {
    const snap = await db.ref("users/" + rId).once("value");
    const requestUserData = snap.val();
    if (!requestUserData) continue;

    const reqItem = document.createElement("div");
    reqItem.className = "friend-request-item";
    reqItem.innerHTML = `
      <span>${requestUserData.displayName}</span>
      <div>
        <button class="accept-friend-btn" data-fid="${rId}">Kabul</button>
        <button class="reject-friend-btn" data-fid="${rId}">Reddet</button>
      </div>
    `;
    requestListDiv.appendChild(reqItem);
  }
}

/** Arkadaş Ekleme İsteği Gönder */
document
  .getElementById("send-friend-request-btn")
  .addEventListener("click", async () => {
    const targetUsername = document
      .getElementById("add-friend-username")
      .value.trim();
    if (!targetUsername) {
      showNotification("Kullanıcı adı girin!");
      return;
    }
    const allUsersSnap = await db.ref("users").once("value");
    const allUsersData = allUsersSnap.val();
    let targetUserId = null;

    for (const uid in allUsersData) {
      const dName = allUsersData[uid].displayName || "";
      if (dName.toLowerCase() === targetUsername.toLowerCase()) {
        targetUserId = uid;
        break;
      }
    }
    if (!targetUserId) {
      showNotification("Bu kullanıcı adı bulunamadı!");
      return;
    }
    if (targetUserId === currentUser.uid) {
      showNotification("Kendinize istek gönderemezsiniz!");
      return;
    }

    await db
      .ref("users/" + targetUserId + "/friendRequests/" + currentUser.uid)
      .set(true);

    showNotification("Arkadaşlık isteği gönderildi!");
  });

const friendRequestList = document.getElementById("friend-request-list");
friendRequestList.addEventListener("click", async (e) => {
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
  showNotification("İstek kabul edildi!");
}

async function rejectFriendRequest(fromUid) {
  if (!currentUser) return;
  await db.ref(`users/${currentUser.uid}/friendRequests/${fromUid}`).remove();
  showNotification("İstek reddedildi.");
}

/** Arkadaş Silme */
const friendListDiv = document.getElementById("friend-list");
friendListDiv.addEventListener("click", async (e) => {
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
  loadUserFriends();
}

/*****************************************************************
 * 6. Oda Davetleri (roomInvites)
 *****************************************************************/
async function loadRoomInvites() {
  const inviteListDiv = document.getElementById("room-invite-list");
  inviteListDiv.innerHTML = "";
  if (!currentUserData || !currentUserData.roomInvites) return;

  const invites = currentUserData.roomInvites;
  for (let inviteId in invites) {
    const inv = invites[inviteId];
    if (!inv) continue;

    const div = document.createElement("div");
    div.className = "room-invite-item";
    div.innerHTML = `
      <span>${inv.fromName} | Oda Kodu: ${inv.roomCode}</span>
      <div>
        <button class="accept-room-invite-btn" data-iid="${inviteId}">Kabul</button>
        <button class="reject-room-invite-btn" data-iid="${inviteId}">Reddet</button>
      </div>
    `;
    inviteListDiv.appendChild(div);
  }
}

const roomInviteList = document.getElementById("room-invite-list");
roomInviteList.addEventListener("click", async (e) => {
  if (e.target.classList.contains("accept-room-invite-btn")) {
    const inviteId = e.target.getAttribute("data-iid");
    await acceptRoomInvite(inviteId);
  } else if (e.target.classList.contains("reject-room-invite-btn")) {
    const inviteId = e.target.getAttribute("data-iid");
    await rejectRoomInvite(inviteId);
  }
});

async function acceptRoomInvite(inviteId) {
  if (!currentUserData || !currentUserData.roomInvites) return;
  const invite = currentUserData.roomInvites[inviteId];
  if (!invite) return;

  const code = invite.roomCode;
  await joinRoomByCode(code);

  await db.ref(`users/${currentUser.uid}/roomInvites/${inviteId}`).remove();
  showNotification(`Oda daveti kabul edildi. Odaya katılıyorsunuz (${code}).`);
}

async function rejectRoomInvite(inviteId) {
  await db.ref(`users/${currentUser.uid}/roomInvites/${inviteId}`).remove();
  showNotification("Oda daveti reddedildi.");
}

/*****************************************************************
 * 7. Arkadaş Listesi: Oda Daveti Gönder
 *****************************************************************/
function loadFriendInviteList() {
  const inviteListDiv = document.getElementById("invite-friend-list");
  inviteListDiv.innerHTML = "";
  if (!currentUserData || !currentUserData.friends) return;

  const friendIds = Object.keys(currentUserData.friends);
  friendIds.forEach(async (fId) => {
    const snap = await db.ref("users/" + fId).once("value");
    const friendData = snap.val();
    if (friendData) {
      const div = document.createElement("div");
      div.className = "invite-friend-item";
      div.innerHTML = `
        <span>
          ${friendData.displayName} 
          ${
            friendData.online
              ? '<span class="online-status">(Çevrimiçi)</span>'
              : '<span class="offline-status">(Çevrimdışı)</span>'
          }
        </span>
      `;
      inviteListDiv.appendChild(div);
    }
  });
}

document.getElementById("create-room-invite-btn").addEventListener("click", async () => {
  showNotification("Oda oluşturuluyor...");

  if (!localStorage.getItem("playerId")) {
    localStorage.setItem("playerId", Math.random().toString(36).substr(2, 9));
  }
  localPlayerId = localStorage.getItem("playerId");

  const newRoomCode = generateRoomCode();
  const newRoomRef = db.ref("rooms/" + newRoomCode);
  const playerName = currentUserData.displayName || "Oyuncu";

  const roomDataToSet = {
    roomCode: newRoomCode,
    gameState: "waiting",
    currentTurnIndex: 0,
    round: 1,
    playerOrder: [localPlayerId],
    players: {},
    countryData: {},
    createdAt: firebase.database.ServerValue.TIMESTAMP
  };
  roomDataToSet.players[localPlayerId] = {
    name: playerName,
    money: 1000,
    soldiers: 0,
    countries: [],
    petrol: 100,
    wheat: 400,
    joinedAt: firebase.database.ServerValue.TIMESTAMP,
    isHost: true,
    flag: currentUserData.flag || ""
  };

  await newRoomRef.set(roomDataToSet);
  showNotification("Oda oluşturuldu: " + newRoomCode);
  localStorage.setItem("roomCode", newRoomCode);

  loadAndInitializeGeoJson(newRoomRef);

  if (currentUserData.friends) {
    const friendIds = Object.keys(currentUserData.friends);
    for (const fId of friendIds) {
      const inviteKey = db.ref(`users/${fId}/roomInvites`).push().key;
      const inviteData = {
        fromUid: currentUser.uid,
        fromName: playerName,
        roomCode: newRoomCode,
        status: "pending"
      };
      await db.ref(`users/${fId}/roomInvites/${inviteKey}`).set(inviteData);
    }
  }

  roomRef = newRoomRef;
  currentRoomCode = newRoomCode;
  showGamePage();
  document.getElementById("display-room-code").textContent = newRoomCode;
  joinRoomAndListen();

  const linkSection = document.getElementById("invite-link-section");
  linkSection.style.display = "block";
  const inviteLinkElem = document.getElementById("invite-link");
  const linkUrl = `${window.location.origin}${window.location.pathname}?roomCode=${newRoomCode}`;
  inviteLinkElem.textContent = linkUrl;
});

/*****************************************************************
 * 8. Lobi Ekranı (Oda Oluştur / Katıl)
 *****************************************************************/
document.getElementById("create-room-btn").addEventListener("click", async () => {
  const playerName = document.getElementById("creator-player-name").value.trim();
  if (!playerName) {
    showNotification("Lütfen oyun içi adınızı girin!");
    return;
  }
  if (!localStorage.getItem("playerId")) {
    localStorage.setItem("playerId", Math.random().toString(36).substr(2, 9));
  }
  localPlayerId = localStorage.getItem("playerId");

  const roomCode = generateRoomCode();
  currentRoomCode = roomCode;
  roomRef = db.ref("rooms/" + roomCode);

  const userFlag = currentUserData.flag || "";

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
    name: playerName,
    money: 1000,
    soldiers: 0,
    countries: [],
    petrol: 100,
    wheat: 400,
    joinedAt: firebase.database.ServerValue.TIMESTAMP,
    isHost: true,
    flag: userFlag
  };

  await roomRef.set(newRoomData);
  showNotification("Oda oluşturuldu. Kod: " + roomCode);
  localStorage.setItem("roomCode", roomCode);

  loadAndInitializeGeoJson(roomRef);

  joinRoomAndListen();
  showGamePage();
  document.getElementById("display-room-code").textContent = roomCode;

  const linkSection = document.getElementById("invite-link-section");
  linkSection.style.display = "block";
  const inviteLinkElem = document.getElementById("invite-link");
  const linkUrl = `${window.location.origin}${window.location.pathname}?roomCode=${roomCode}`;
  inviteLinkElem.textContent = linkUrl;
});

document.getElementById("join-room-btn").addEventListener("click", async () => {
  const playerName = document.getElementById("join-player-name").value.trim();
  const roomCodeInput = document
    .getElementById("room-code")
    .value.trim()
    .toUpperCase();

  if (!playerName) {
    showNotification("Lütfen oyun içi adınızı girin!");
    return;
  }
  if (!roomCodeInput) {
    showNotification("Lütfen oda kodu girin!");
    return;
  }
  if (!localStorage.getItem("playerId")) {
    localStorage.setItem("playerId", Math.random().toString(36).substr(2, 9));
  }
  localPlayerId = localStorage.getItem("playerId");

  await joinRoomByCode(roomCodeInput, playerName);
});

async function joinRoomByCode(roomCodeInput, customName) {
  const refCheck = db.ref("rooms/" + roomCodeInput);
  const snapshot = await refCheck.once("value");
  if (!snapshot.exists()) {
    showNotification("Böyle bir oda bulunamadı!");
    return;
  }
  const room = snapshot.val();
  if (room.gameState !== "waiting") {
    showNotification("Oyun zaten başladı veya başlamak üzere!");
    return;
  }
  const myName = customName || currentUserData?.displayName || "Oyuncu";
  const userFlag = currentUserData.flag || "";

  const updates = {};
  if (!room.playerOrder) room.playerOrder = [];
  room.playerOrder.push(localPlayerId);
  updates["playerOrder"] = room.playerOrder;

  updates["players/" + localPlayerId] = {
    name: myName,
    money: 1000,
    soldiers: 0,
    countries: [],
    petrol: 100,
    wheat: 400,
    joinedAt: firebase.database.ServerValue.TIMESTAMP,
    isHost: false,
    flag: userFlag
  };
  await refCheck.update(updates);
  showNotification("Odaya katıldınız!");
  localStorage.setItem("roomCode", roomCodeInput);

  currentRoomCode = roomCodeInput;
  roomRef = refCheck;
  joinRoomAndListen();
  showGamePage();
  document.getElementById("display-room-code").textContent = roomCodeInput;
}

/** Otomatik Bağlanma */
function autoReconnect() {
  const urlParams = new URLSearchParams(window.location.search);
  const paramRoomCode = urlParams.get("roomCode");
  if (paramRoomCode) {
    localStorage.setItem("roomCode", paramRoomCode);
  }
  const savedRoomCode = localStorage.getItem("roomCode");
  if (savedRoomCode) {
    const refCheck = db.ref("rooms/" + savedRoomCode);
    refCheck.once("value", (snapshot) => {
      if (!snapshot.exists()) return;
      const savedRoomData = snapshot.val();
      if (!savedRoomData.players || !savedRoomData.players[localPlayerId]) {
        return;
      }
      currentRoomCode = savedRoomCode;
      roomRef = refCheck;
      joinRoomAndListen();
      showGamePage();
      document.getElementById("display-room-code").textContent = savedRoomCode;
    });
  }
}

/** Rastgele Oda Kodu */
function generateRoomCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/*****************************************************************
 * 9. Oyun Ekranı ve Harita Kurulumu
 *****************************************************************/
function joinRoomAndListen() {
  if (!roomRef) return;
  roomRef.on("value", (snapshot) => {
    roomData = snapshot.val();
    updateGameUI();
    displayPendingPactOffers();
    displayActivePacts();
    displayTradeOffers();
  });

  // Chat & Notification listener
  if (!chatListenerAdded) {
    roomRef.child("chat").on("child_added", (snap) => {
      const msg = snap.val();
      appendChatMessage(msg);
    });
    roomRef.child("notifications").on("child_added", (snap) => {
      const data = snap.val();
      if (data && data.text) {
        displayGlobalNotification(data.text);
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
    const currentPlayerId = roomData.playerOrder[idx];
    const pl = roomData.players[currentPlayerId];
    if (pl) {
      document.getElementById("current-player").textContent = pl.name;
    }
  }
  handleGameState(roomData.gameState);

  // Oyuncu listesi
  const playersInfoDiv = document.getElementById("players-info");
  if (playersInfoDiv) {
    playersInfoDiv.innerHTML = "";
    if (roomData.playerOrder) {
      roomData.playerOrder.forEach((pid) => {
        const pData = roomData.players[pid];
        if (pData) {
          const pDiv = document.createElement("div");
          pDiv.className = "player-info";
          pDiv.id = "player-info-" + pid;

          // Bayrak resmi (küçük boyut)
          let flagImg = "";
          if (pData.flag) {
            flagImg = `<img src="${pData.flag}" alt="Flag" style="max-width:40px;max-height:25px; margin-right:10px;" />`;
          }

          pDiv.innerHTML = `
            <p><strong>${flagImg} ${pData.name}</strong></p>
            <p>Para: <span>${pData.money}</span>$</p>
            <p>Asker: <span>${pData.soldiers}</span></p>
            <p>Ülkeler: <span>${(pData.countries && pData.countries.length) || 0}</span></p>
            <p>Petrol: <span>${pData.petrol}</span> varil</p>
            <p>Buğday: <span>${pData.wheat}</span></p>
          `;
          playersInfoDiv.appendChild(pDiv);
        }
      });
    }
  }

  // Harita güncelle
  if (map && roomData.countryData && geoJsonLayer) {
    geoJsonLayer.eachLayer((layer) => {
      const cname = layer.feature.properties.name;
      const cData = roomData.countryData[cname];
      if (!cData) return;

      // Varsayılan stil
      const defaultStyle = {
        weight: 1,
        color: "#555",
        fillColor: "#ccc",
        fillOpacity: 0.7
      };

      if (cData.owner && roomData.players[cData.owner]) {
        const ownerData = roomData.players[cData.owner];
        if (ownerData.flag) {
          // Pattern üzerinden doldurma
          const pat = getPlayerPattern(cData.owner);
          if (pat) {
            layer.setStyle({
              fillPattern: pat,
              fillOpacity: 1,
              weight: 1,
              color: "#555"
            });
          } else {
            // eğer pattern oluşturulamazsa veya sorun olursa fallback renge geç
            layer.setStyle({
              fillColor: "#f39c12",
              fillOpacity: 0.7,
              weight: 1,
              color: "#555"
            });
          }
        } else {
          // Bayrak yok, basit renk
          layer.setStyle({
            fillColor: "#f39c12",
            fillOpacity: 0.7,
            weight: 1,
            color: "#555"
          });
        }
      } else {
        // Sahipsiz
        layer.setStyle(defaultStyle);
      }

      layer.setTooltipContent(getCountryPopupContent(cname, cData));
    });
  }

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

  if (state === "waiting") {
    if (roomData.players[localPlayerId]?.isHost) {
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

/** Oyunu Başlat */
document.getElementById("start-game-btn").addEventListener("click", () => {
  if (!roomData || !roomData.players[localPlayerId].isHost) return;
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
    const secondsLeft = Math.floor(diff / 1000);
    countdownSpan.textContent = secondsLeft;
  }, 1000);
}

/** Haritayı Başlatma */
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

  fetch(
    "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json"
  )
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
          layer.bindTooltip(
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
          layer.on("click", () => selectCountryOnMap(cname, layer));
        }
      }).addTo(map);
    });
}

/** Ülke Verilerini (geojson) DB'ye ilk defa yaz */
function loadAndInitializeGeoJson(ref) {
  fetch(
    "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json"
  )
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
      const countryDataInit = {};
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
        countryDataInit[cname] = {
          income: Math.floor(Math.random() * 500) + 100,
          soldiers: 0,
          owner: null,
          barracksCount: 0,
          factories: 0,
          refineries: 0,
          oilProduction: oilProduction,
          wheatProduction: wheatProduction,
          grainMills: 0,
          supporters: {},
          castleDefenseLevel: 0,
          castleNextUpgradeCost: null
        };
      });
      ref.child("countryData").set(countryDataInit);
    });
}

function selectCountryOnMap(countryName, layer) {
  selectedCountry = countryName;
  showNotification("Seçilen ülke: " + countryName, 1500);

  layer.setStyle({ weight: 4, color: "#FF4500" });
  setTimeout(() => {
    const cData = roomData.countryData[countryName];
    if (cData && cData.owner && roomData.players[cData.owner]?.flag) {
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
    } else if (cData && cData.owner && !roomData.players[cData.owner].flag) {
      layer.setStyle({
        fillColor: "#f39c12",
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

function getCountryPopupContent(countryName, country) {
  if (!country) country = {};
  const ownerText = country.owner && roomData.players[country.owner]
    ? roomData.players[country.owner].name
    : "Yok";

  let effectiveIncome = country.income || 0;
  if (country.factories) {
    effectiveIncome = Math.floor(effectiveIncome * (1 + 0.20 * country.factories));
  }
  const effectiveOil = country.oilProduction
    ? Math.floor(country.oilProduction * (1 + 0.15 * (country.refineries || 0)))
    : 0;
  const effectiveWheat = country.wheatProduction
    ? Math.floor(country.wheatProduction * (1 + 0.20 * (country.grainMills || 0)))
    : 0;

  let castleDefensePercent = 0;
  if (country.castleDefenseLevel > 0) {
    castleDefensePercent = 5 * country.castleDefenseLevel;
  }

  return `
    <div>
      <p><i class="fas fa-money-bill-wave"></i> Gelir: ${effectiveIncome}$</p>
      <p><i class="fas fa-users"></i> Asker: ${country.soldiers || 0}</p>
      <p><i class="fas fa-fort-awesome"></i> Kışla: ${country.barracksCount || 0}</p>
      <p><i class="fas fa-industry"></i> Fabrika: ${country.factories || 0}</p>
      <p><i class="fas fa-oil-can"></i> Rafine: ${country.refineries || 0}</p>
      <p><i class="fas fa-oil-can"></i> Petrol Üretimi: ${effectiveOil}</p>
      <p><i class="fas fa-wheat-awn"></i> Değirmen: ${country.grainMills || 0}</p>
      <p><i class="fas fa-wheat-awn"></i> Buğday Üretimi: ${effectiveWheat}</p>
      <p><i class="fas fa-chess-rook"></i> Kale Gücü: ${
        castleDefensePercent > 0 ? "%" + castleDefensePercent : "-"
      }</p>
      <p><i class="fas fa-crown"></i> Sahip: ${ownerText}</p>
    </div>
  `;
}

/** Leaflet Tooltips Kalıcı/Kaldır */
document.getElementById("toggle-info-cards").addEventListener("click", () => {
  infoCardsPermanent = !infoCardsPermanent;
  updateTooltipsPermanent();
  const icon = document.getElementById("toggle-info-cards").querySelector("i");
  icon.className = infoCardsPermanent ? "fas fa-eye" : "fas fa-eye-slash";
});

function updateTooltipsPermanent() {
  if (!geoJsonLayer) return;
  geoJsonLayer.eachLayer((layer) => {
    layer.unbindTooltip();
    const cname = layer.feature.properties.name;
    const cData = roomData?.countryData?.[cname] || {};
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
function showNotification(message, duration = 3000) {
  if (notificationsMuted) return;
  const existingArea = document.getElementById("notification-area");
  if (!existingArea) return;

  const item = document.createElement("div");
  item.className = "notification-item";
  item.textContent = message;
  existingArea.appendChild(item);

  setTimeout(() => {
    if (existingArea.contains(item)) {
      existingArea.removeChild(item);
    }
  }, duration + 800);
}

function broadcastNotification(text) {
  if (!roomRef) return;
  roomRef.child("notifications").push({
    text: text,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  });
}

function displayGlobalNotification(text) {
  if (notificationsMuted) return;
  const nArea = document.getElementById("notification-area");
  if (!nArea) return;

  const item = document.createElement("div");
  item.className = "notification-item";
  item.textContent = text;
  nArea.appendChild(item);

  setTimeout(() => {
    if (nArea.contains(item)) {
      nArea.removeChild(item);
    }
  }, 6500);
}

/** Bildirimleri Kap/Aç */
document
  .getElementById("open-notifications-btn")
  .addEventListener("click", () => {
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
  const currentTurnIndex = roomData.currentTurnIndex || 0;
  return roomData.playerOrder[currentTurnIndex] === localPlayerId;
}

function startTurnTimer() {
  const timerEl = document.getElementById("turn-timer");
  turnTimeRemaining = 60;
  if (turnTimerInterval) clearInterval(turnTimerInterval);
  timerEl.textContent = turnTimeRemaining + "s";

  turnTimerInterval = setInterval(() => {
    turnTimeRemaining--;
    if (turnTimeRemaining <= 0) {
      clearInterval(turnTimerInterval);
      turnTimeRemaining = 0;
      timerEl.textContent = "0s";
      if (roomData && roomData.gameState === "started" && isMyTurn()) {
        nextTurn(true);
      }
    } else {
      timerEl.textContent = turnTimeRemaining + "s";
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

function nextTurn(autoEnd = false) {
  if (!isMyTurn()) return;
  stopTurnTimer();

  const turnIndex = roomData.currentTurnIndex || 0;
  const currentPid = roomData.playerOrder[turnIndex];
  const player = roomData.players[currentPid];
  if (!player) return;

  const updates = {};
  // Tur sonu gelir
  if (player.countries && roomData.countryData) {
    let totalMoneyGained = 0;
    let totalWheatGained = 0;

    player.countries.forEach((cName) => {
      const cData = roomData.countryData[cName];
      if (!cData) return;
      // Kışla -> asker
      if (cData.barracksCount) {
        updates[`countryData/${cName}/soldiers`] =
          (cData.soldiers || 0) + 5 * cData.barracksCount;
      }
      // Para
      let effectiveIncome = cData.income || 0;
      if (cData.factories) {
        effectiveIncome = Math.floor(
          effectiveIncome * (1 + 0.20 * cData.factories)
        );
      }
      totalMoneyGained += effectiveIncome;
      // Buğday
      if (cData.wheatProduction) {
        const effWheat = Math.floor(
          cData.wheatProduction * (1 + 0.20 * (cData.grainMills || 0))
        );
        totalWheatGained += effWheat;
      }
    });
    updates[`players/${currentPid}/money`] = (player.money || 0) + totalMoneyGained;
    updates[`players/${currentPid}/wheat`] = (player.wheat || 0) + totalWheatGained;
  }

  let newIndex = turnIndex + 1;
  let newRound = roomData.round || 1;
  if (newIndex >= roomData.playerOrder.length) {
    newIndex = 0;
    newRound++;
    updates["round"] = newRound;
  }
  updates["currentTurnIndex"] = newIndex;
  roomRef.update(updates);

  const nextPid = roomData.playerOrder[newIndex];
  let endText = "Sıra " + (roomData.players[nextPid]?.name || "?") + " adlı oyuncuya geçti.";
  if (autoEnd) {
    endText = player.name + " süresini doldurdu! " + endText;
  }
  broadcastNotification(endText);
  showNotification(endText, 1500);
}

document.getElementById("exit-room-btn").addEventListener("click", async () => {
  if (!roomRef || !roomData) return;
  const updates = {};
  let newOrder = (roomData.playerOrder || []).filter(id => id !== localPlayerId);

  if (isMyTurn()) {
    stopTurnTimer();
    let idx = roomData.currentTurnIndex || 0;
    idx++;
    let newR = roomData.round || 1;
    if (idx >= newOrder.length && newOrder.length > 0) {
      idx = 0;
      newR++;
    }
    updates["round"] = newR;
    updates["currentTurnIndex"] = newOrder.length ? idx : 0;
  }
  updates["playerOrder"] = newOrder;
  updates[`players/${localPlayerId}`] = null;

  await roomRef.update(updates);
  showLobbyPage();
  localStorage.removeItem("roomCode");
  stopTurnTimer();
  clearInterval(startInterval);
  showNotification("Odadan ayrıldınız.");
});

/*****************************************************************
 * 13. Asker İşlemleri (Saldırı, Satın Al, Çek, Destek)
 *****************************************************************/
const militaryPopup = document.getElementById("military-popup");
const buildingPopup = document.getElementById("building-popup");
const resourcePopup = document.getElementById("resource-popup");
const playersPopup = document.getElementById("players-popup");
const pactPopup = document.getElementById("pact-popup");
const marketPopup = document.getElementById("market-popup");
const chatPopup = document.getElementById("chat-popup");

let chatListenerAdded = false;

function togglePopup(popupElement) {
  if (popupElement.style.display === "flex") {
    popupElement.style.display = "none";
  } else {
    popupElement.style.display = "flex";
  }
}

document.getElementById("open-military-btn").addEventListener("click", () => {
  togglePopup(militaryPopup);
});
document.getElementById("close-military-btn").addEventListener("click", () => {
  militaryPopup.style.display = "none";
});
document.getElementById("open-building-btn").addEventListener("click", () => {
  togglePopup(buildingPopup);
  updateCastleUpgradeCostUI();
});
document.getElementById("close-building-btn").addEventListener("click", () => {
  buildingPopup.style.display = "none";
});
document.getElementById("open-resource-btn").addEventListener("click", () => {
  togglePopup(resourcePopup);
});
document.getElementById("close-resource-btn").addEventListener("click", () => {
  resourcePopup.style.display = "none";
});
document.getElementById("open-players-btn").addEventListener("click", () => {
  togglePopup(playersPopup);
});
document.getElementById("close-players-btn").addEventListener("click", () => {
  playersPopup.style.display = "none";
});
document.getElementById("open-pact-btn").addEventListener("click", () => {
  togglePopup(pactPopup);
});
document.getElementById("close-pact-btn").addEventListener("click", () => {
  pactPopup.style.display = "none";
});
document.getElementById("open-market-btn").addEventListener("click", () => {
  togglePopup(marketPopup);
});
document.getElementById("close-market-btn").addEventListener("click", () => {
  marketPopup.style.display = "none";
});
document.getElementById("open-chat-btn").addEventListener("click", () => {
  toggleChat(!chatOpen);
});
document.getElementById("close-chat-btn").addEventListener("click", () => {
  toggleChat(false);
});

/** Saldırı */
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
  const soldiersToSend = parseInt(document.getElementById("attack-soldiers").value);
  if (isNaN(soldiersToSend) || soldiersToSend <= 0) {
    showNotification("Geçerli bir asker sayısı girin!");
    return;
  }
  const attacker = roomData.players[localPlayerId];
  if (!attacker) return;
  if (attacker.petrol < soldiersToSend) {
    showNotification(`Bu saldırı için ${soldiersToSend} varil petrol gerekiyor, elinizde yeterli yok!`);
    return;
  }
  const target = roomData.countryData[selectedCountry];
  if (!target) return;

  if (roomData.round < 4 && target.owner) {
    showNotification("İlk 3 tur yalnızca sahipsiz ülkelere saldırabilirsiniz!");
    return;
  }
  if (target.owner && target.owner !== localPlayerId) {
    if (hasActivePact(localPlayerId, target.owner)) {
      showNotification("Bu oyuncu ile saldırmazlık paktınız var!");
      return;
    }
  }

  const updates = {};
  let result = "";
  updates[`players/${localPlayerId}/petrol`] = attacker.petrol - soldiersToSend;

  if (target.owner === localPlayerId) {
    if (soldiersToSend > attacker.soldiers) {
      showNotification("Yeterli asker yok!");
      return;
    }
    updates[`countryData/${selectedCountry}/soldiers`] = target.soldiers + soldiersToSend;
    updates[`players/${localPlayerId}/soldiers`] = attacker.soldiers - soldiersToSend;
    result = `${selectedCountry} ülkesine ${soldiersToSend} asker yerleştirildi.`;
    roomRef.update(updates, () => {
      immediateOilReward(localPlayerId);
    });
    broadcastNotification(`Saldırı(?): ${attacker.name} (kendi ülkesine asker yolladı).`);
    showNotification(result);
    return;
  }

  if (soldiersToSend > attacker.soldiers) {
    showNotification("Yeterli askeriniz yok!");
    return;
  }
  updates[`players/${localPlayerId}/soldiers`] = attacker.soldiers - soldiersToSend;

  let effectiveAttackers = soldiersToSend;
  if (target.castleDefenseLevel > 0) {
    const defensePercent = 5 * target.castleDefenseLevel;
    const killedByCastle = Math.floor((defensePercent / 100) * effectiveAttackers);
    effectiveAttackers -= killedByCastle;
    if (effectiveAttackers < 0) effectiveAttackers = 0;
    result += `Kale savunması: ${killedByCastle} saldıran asker öldü. `;
  }

  if (effectiveAttackers > target.soldiers) {
    const remaining = effectiveAttackers - target.soldiers;
    updates[`countryData/${selectedCountry}/soldiers`] = remaining;
    updates[`countryData/${selectedCountry}/owner`] = localPlayerId;
    updates[`countryData/${selectedCountry}/supporters`] = {};

    if (target.owner && roomData.players[target.owner]) {
      let defCountries = roomData.players[target.owner].countries || [];
      defCountries = defCountries.filter((x) => x !== selectedCountry);
      updates[`players/${target.owner}/countries`] = defCountries;
    }
    let myCountries = attacker.countries || [];
    if (!myCountries.includes(selectedCountry)) myCountries.push(selectedCountry);
    updates[`players/${localPlayerId}/countries`] = myCountries;

    result += `${selectedCountry} fethedildi! (${soldiersToSend} vs ${target.soldiers})`;
  } else {
    updates[`countryData/${selectedCountry}/soldiers`] = target.soldiers - effectiveAttackers;
    result += `${selectedCountry} savunuldu! (${soldiersToSend} vs ${target.soldiers})`;
  }

  roomRef.update(updates, () => {
    immediateOilReward(localPlayerId);
  });
  broadcastNotification(`${attacker.name} → ${selectedCountry}. ${result}`);
  showNotification(result);

  nextTurn();
}

/** Saldırı sonrası petrol ödülü */
function immediateOilReward(playerId) {
  if (!roomData || !roomData.players[playerId]) return;
  const p = roomData.players[playerId];
  if (!p.countries) return;
  let totalOil = 0;
  p.countries.forEach((cName) => {
    const c = roomData.countryData[cName];
    if (c && c.oilProduction) {
      const effOil = Math.floor(c.oilProduction * (1 + 0.15 * (c.refineries || 0)));
      totalOil += effOil;
    }
  });
  if (totalOil > 0) {
    roomRef.child(`players/${playerId}/petrol`).set(p.petrol + totalOil);
    showNotification(`Saldırı sonrası petrol: +${totalOil} varil`);
    broadcastNotification(`${p.name}, saldırı sonrası +${totalOil} petrol kazandı!`);
  }
}

/** Asker Satın Al */
document.getElementById("buy-soldiers-btn").addEventListener("click", buySoldiers);
function buySoldiers() {
  const count = parseInt(document.getElementById("soldiers-to-buy").value);
  if (isNaN(count) || count <= 0) {
    showNotification("Geçerli bir sayı girin!");
    return;
  }
  const costMoney = 10 * count;
  const costWheat = 25 * count;
  const currP = roomData.players[localPlayerId];
  if (currP.money < costMoney) {
    showNotification("Yeterli paranız yok!");
    return;
  }
  if (currP.wheat < costWheat) {
    showNotification("Yeterli buğdayınız yok!");
    return;
  }

  const updates = {};
  updates[`players/${localPlayerId}/money`] = currP.money - costMoney;
  updates[`players/${localPlayerId}/wheat`] = currP.wheat - costWheat;
  updates[`players/${localPlayerId}/soldiers`] = currP.soldiers + count;
  roomRef.update(updates);
  broadcastNotification(`${currP.name} ${count} asker satın aldı.`);
  showNotification(`${count} asker satın alındı.`);
}

/** Asker Çek */
document.getElementById("pull-soldiers-btn").addEventListener("click", pullSoldiers);
function pullSoldiers() {
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const count = parseInt(document.getElementById("pull-soldiers-count").value);
  if (isNaN(count) || count <= 0) {
    showNotification("Geçerli bir asker sayısı girin!");
    return;
  }
  const currP = roomData.players[localPlayerId];
  if (!currP) return;

  const cData = roomData.countryData[selectedCountry];
  if (!cData) return;

  const updates = {};

  if (cData.owner === localPlayerId) {
    let totalSup = 0;
    for (let sid in cData.supporters) {
      totalSup += cData.supporters[sid];
    }
    const occupant = cData.soldiers - totalSup;
    if (occupant < count) {
      showNotification("Ülkedeki destek askerleri hariç bu kadar çekemezsiniz!");
      return;
    }
    updates[`countryData/${selectedCountry}/soldiers`] = cData.soldiers - count;
    updates[`players/${localPlayerId}/soldiers`] = currP.soldiers + count;
    broadcastNotification(
      `${currP.name}, ${selectedCountry} ülkesinden ${count} asker çekti.`
    );
  } else {
    const mySupport = cData.supporters?.[localPlayerId] || 0;
    if (mySupport < count) {
      showNotification("Bu ülkede o kadar destek askeriniz yok!");
      return;
    }
    if (cData.soldiers < count) {
      showNotification("Ülkedeki toplam asker yetersiz! (Veri tutarsızlığı)");
      return;
    }
    updates[`countryData/${selectedCountry}/soldiers`] = cData.soldiers - count;
    const newSup = mySupport - count;
    if (newSup <= 0) {
      updates[`countryData/${selectedCountry}/supporters/${localPlayerId}`] = null;
    } else {
      updates[`countryData/${selectedCountry}/supporters/${localPlayerId}`] = newSup;
    }
    updates[`players/${localPlayerId}/soldiers`] = currP.soldiers + count;
    broadcastNotification(
      `${currP.name}, ${selectedCountry} ülkesinden ${count} destek askerini geri çekti.`
    );
  }
  roomRef.update(updates);
  showNotification("Asker çekildi.");
}

/** Askeri Destek Gönder */
document.getElementById("send-support-btn").addEventListener("click", sendSupport);
function sendSupport() {
  const recipient = document.getElementById("support-recipient").value;
  const cName = document.getElementById("support-recipient-country").value;
  const num = parseInt(document.getElementById("support-soldiers").value);

  if (!recipient || !cName) {
    showNotification("Oyuncu ve ülke seçmelisiniz!");
    return;
  }
  if (isNaN(num) || num <= 0) {
    showNotification("Geçerli bir asker sayısı girin!");
    return;
  }
  const currP = roomData.players[localPlayerId];
  if (currP.soldiers < num) {
    showNotification("Yeterli askeriniz yok!");
    return;
  }
  const targC = roomData.countryData[cName];
  if (!targC) {
    showNotification("Ülke bulunamadı!");
    return;
  }
  if (targC.owner !== recipient) {
    showNotification("Bu ülke o oyuncuya ait değil!");
    return;
  }

  const updates = {};
  updates[`players/${localPlayerId}/soldiers`] = currP.soldiers - num;
  updates[`countryData/${cName}/soldiers`] = (targC.soldiers || 0) + num;
  const oldSup = targC.supporters?.[localPlayerId] || 0;
  updates[`countryData/${cName}/supporters/${localPlayerId}`] = oldSup + num;

  roomRef.update(updates);
  broadcastNotification(
    `${currP.name}, ${roomData.players[recipient].name} (${cName}) ülkesine ${num} asker destek gönderdi.`
  );
  showNotification("Askeri destek gönderildi!");
}

/** Select listeleri */
function updateSupportRecipientSelect() {
  const sel = document.getElementById("support-recipient");
  sel.innerHTML = "<option value=''>--Oyuncu Seç--</option>";
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
document.getElementById("support-recipient").addEventListener("change", function () {
  const recipient = this.value;
  const selC = document.getElementById("support-recipient-country");
  selC.innerHTML = "<option value=''>--Ülke Seç--</option>";
  if (!recipient || !roomData.players[recipient]) return;
  const rc = roomData.players[recipient].countries || [];
  rc.forEach((cName) => {
    const opt = document.createElement("option");
    opt.value = cName;
    opt.textContent = cName;
    selC.appendChild(opt);
  });
});

/*****************************************************************
 * 14. Kaynak Gönderme
 *****************************************************************/
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
      if (pid !== localPlayerId && roomData.players[pid]) {
        const pName = roomData.players[pid].name;
        const o1 = document.createElement("option");
        o1.value = pid;
        o1.textContent = pName;
        moneySel.appendChild(o1);

        const o2 = document.createElement("option");
        o2.value = pid;
        o2.textContent = pName;
        petrolSel.appendChild(o2);

        const o3 = document.createElement("option");
        o3.value = pid;
        o3.textContent = pName;
        wheatSel.appendChild(o3);
      }
    });
  }
}

function sendMoney() {
  const amt = parseInt(document.getElementById("money-to-send").value);
  const recId = document.getElementById("recipient-player").value;
  if (isNaN(amt) || amt <= 0) {
    showNotification("Geçerli miktar girin!");
    return;
  }
  const cp = roomData.players[localPlayerId];
  if (cp.money < amt) {
    showNotification("Yeterli paranız yok!");
    return;
  }
  if (!recId) {
    showNotification("Alıcı seçin!");
    return;
  }
  const updates = {};
  updates[`players/${localPlayerId}/money`] = cp.money - amt;
  updates[`players/${recId}/money`] = roomData.players[recId].money + amt;

  roomRef.update(updates);
  broadcastNotification(`${cp.name} → ${roomData.players[recId].name}: ${amt}$`);
  showNotification(`${amt}$ gönderildi.`);
}

function sendPetrol() {
  const amt = parseInt(document.getElementById("petrol-to-send").value);
  const recId = document.getElementById("recipient-player-petrol").value;
  if (isNaN(amt) || amt <= 0) {
    showNotification("Geçerli miktar girin!");
    return;
  }
  const cp = roomData.players[localPlayerId];
  if (cp.petrol < amt) {
    showNotification("Yeterli petrol yok!");
    return;
  }
  if (!recId) {
    showNotification("Alıcı seçin!");
    return;
  }
  const updates = {};
  updates[`players/${localPlayerId}/petrol`] = cp.petrol - amt;
  updates[`players/${recId}/petrol`] = roomData.players[recId].petrol + amt;

  roomRef.update(updates);
  broadcastNotification(`${cp.name} → ${roomData.players[recId].name}: ${amt} varil petrol`);
  showNotification(`${amt} varil petrol gönderildi.`);
}

function sendWheat() {
  const amt = parseInt(document.getElementById("wheat-to-send").value);
  const recId = document.getElementById("recipient-player-wheat").value;
  if (isNaN(amt) || amt <= 0) {
    showNotification("Geçerli miktar girin!");
    return;
  }
  const cp = roomData.players[localPlayerId];
  if (cp.wheat < amt) {
    showNotification("Yeterli buğday yok!");
    return;
  }
  if (!recId) {
    showNotification("Alıcı seçin!");
    return;
  }
  const updates = {};
  updates[`players/${localPlayerId}/wheat`] = cp.wheat - amt;
  updates[`players/${recId}/wheat`] = roomData.players[recId].wheat + amt;

  roomRef.update(updates);
  broadcastNotification(`${cp.name} → ${roomData.players[recId].name}: ${amt} buğday`);
  showNotification(`${amt} buğday gönderildi.`);
}

/*****************************************************************
 * 15. Bina Kurma (Kışla, Fabrika, Rafine, Değirmen, Kale)
 *****************************************************************/
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
    showNotification("Geçerli bir kışla sayısı girin!");
    return;
  }
  const cData = roomData.countryData[selectedCountry];
  if (!cData) return;
  if (cData.owner !== localPlayerId) {
    showNotification("Bu ülke size ait değil!");
    return;
  }
  const costMoney = 300 * q;
  const costPetrol = 50 * q;
  const costWheat = 120 * q;
  const p = roomData.players[localPlayerId];
  if (p.money < costMoney || p.petrol < costPetrol || p.wheat < costWheat) {
    showNotification("Yeterli kaynağınız yok!");
    return;
  }

  const updates = {};
  updates[`players/${localPlayerId}/money`] = p.money - costMoney;
  updates[`players/${localPlayerId}/petrol`] = p.petrol - costPetrol;
  updates[`players/${localPlayerId}/wheat`] = p.wheat - costWheat;
  updates[`countryData/${selectedCountry}/barracksCount`] = cData.barracksCount + q;

  roomRef.update(updates);
  broadcastNotification(`${p.name}, ${selectedCountry} ülkesine ${q} kışla kurdu!`);
  showNotification(`${q} kışla kuruldu!`);
}

function buildFactory() {
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const q = parseInt(document.getElementById("factory-quantity").value);
  if (isNaN(q) || q <= 0) {
    showNotification("Geçerli bir fabrika sayısı girin!");
    return;
  }
  const cData = roomData.countryData[selectedCountry];
  if (!cData) return;
  if (cData.owner !== localPlayerId) {
    showNotification("Bu ülke size ait değil!");
    return;
  }
  const costMoney = 500 * q;
  const costPetrol = 130 * q;
  const p = roomData.players[localPlayerId];
  if (p.money < costMoney || p.petrol < costPetrol) {
    showNotification("Yeterli kaynağınız yok!");
    return;
  }

  const updates = {};
  updates[`players/${localPlayerId}/money`] = p.money - costMoney;
  updates[`players/${localPlayerId}/petrol`] = p.petrol - costPetrol;
  updates[`countryData/${selectedCountry}/factories`] = cData.factories + q;
  roomRef.update(updates);
  broadcastNotification(`${p.name}, ${selectedCountry} ülkesine ${q} fabrika kurdu!`);
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
  const cData = roomData.countryData[selectedCountry];
  if (!cData) return;
  if (cData.owner !== localPlayerId) {
    showNotification("Bu ülke size ait değil!");
    return;
  }
  const costMoney = 800 * q;
  const costPetrol = 250 * q;
  const p = roomData.players[localPlayerId];
  if (p.money < costMoney || p.petrol < costPetrol) {
    showNotification("Yeterli kaynağınız yok!");
    return;
  }

  const updates = {};
  updates[`players/${localPlayerId}/money`] = p.money - costMoney;
  updates[`players/${localPlayerId}/petrol`] = p.petrol - costPetrol;
  updates[`countryData/${selectedCountry}/refineries`] = cData.refineries + q;
  roomRef.update(updates);
  broadcastNotification(`${p.name}, ${selectedCountry} ülkesine ${q} rafine kurdu!`);
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
  const cData = roomData.countryData[selectedCountry];
  if (cData.owner !== localPlayerId) {
    showNotification("Bu ülke size ait değil!");
    return;
  }
  const costMoney = 200 * q;
  const costPetrol = 100 * q;
  const p = roomData.players[localPlayerId];
  if (p.money < costMoney || p.petrol < costPetrol) {
    showNotification("Yeterli kaynağınız yok!");
    return;
  }

  const updates = {};
  updates[`players/${localPlayerId}/money`] = p.money - costMoney;
  updates[`players/${localPlayerId}/petrol`] = p.petrol - costPetrol;
  updates[`countryData/${selectedCountry}/grainMills`] = cData.grainMills + q;
  roomRef.update(updates);
  broadcastNotification(`${p.name}, ${selectedCountry} ülkesine ${q} değirmen kurdu!`);
  showNotification(`${q} değirmen kuruldu!`);
}

function buildCastle() {
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const cData = roomData.countryData[selectedCountry];
  if (!cData || cData.owner !== localPlayerId) {
    showNotification("Bu ülke size ait değil!");
    return;
  }
  if (cData.castleDefenseLevel > 0) {
    showNotification("Bu ülkede zaten kale var!");
    return;
  }
  const p = roomData.players[localPlayerId];
  if (p.money < 1000 || p.petrol < 1000 || p.wheat < 1000) {
    showNotification("Kale için yeterli kaynak yok!");
    return;
  }

  const updates = {};
  updates[`players/${localPlayerId}/money`] = p.money - 1000;
  updates[`players/${localPlayerId}/petrol`] = p.petrol - 1000;
  updates[`players/${localPlayerId}/wheat`] = p.wheat - 1000;

  updates[`countryData/${selectedCountry}/castleDefenseLevel`] = 1;
  updates[`countryData/${selectedCountry}/castleNextUpgradeCost`] = {
    money: 1300,
    petrol: 1300,
    wheat: 1300
  };
  roomRef.update(updates);
  broadcastNotification(`${p.name}, ${selectedCountry} ülkesine kale kurdu!`);
  showNotification("Kale kuruldu (%5).");
}

function upgradeCastle() {
  if (!selectedCountry) {
    showNotification("Bir ülke seçin!");
    return;
  }
  const cData = roomData.countryData[selectedCountry];
  if (!cData || cData.owner !== localPlayerId) {
    showNotification("Bu ülke size ait değil!");
    return;
  }
  if (cData.castleDefenseLevel < 1) {
    showNotification("Önce kale kurun!");
    return;
  }
  if (cData.castleDefenseLevel >= 6) {
    showNotification("Kale savunması %30'u aştı!");
    return;
  }
  if (!cData.castleNextUpgradeCost) {
    showNotification("Yükseltme verisi yok!");
    return;
  }
  const p = roomData.players[localPlayerId];
  const cost = cData.castleNextUpgradeCost;
  if (p.money < cost.money || p.petrol < cost.petrol || p.wheat < cost.wheat) {
    showNotification("Gerekli kaynak yok!");
    return;
  }
  const updates = {};
  updates[`players/${localPlayerId}/money`] = p.money - cost.money;
  updates[`players/${localPlayerId}/petrol`] = p.petrol - cost.petrol;
  updates[`players/${localPlayerId}/wheat`] = p.wheat - cost.wheat;

  const newLevel = cData.castleDefenseLevel + 1;
  updates[`countryData/${selectedCountry}/castleDefenseLevel`] = newLevel;
  const nm = Math.floor(cost.money * 1.3);
  const np = Math.floor(cost.petrol * 1.3);
  const nw = Math.floor(cost.wheat * 1.3);
  updates[`countryData/${selectedCountry}/castleNextUpgradeCost`] = {
    money: nm,
    petrol: np,
    wheat: nw
  };
  roomRef.update(updates, () => {
    updateCastleUpgradeCostUI();
  });
  broadcastNotification(`${p.name}, ${selectedCountry} kalesini güçlendirdi (Seviye ${newLevel}).`);
  showNotification(`Kale güçlendirildi. (%${newLevel * 5} savunma)`);
}

function updateCastleUpgradeCostUI() {
  const costSpan = document.getElementById("castle-upgrade-cost-text");
  if (!costSpan) return;
  if (!selectedCountry || !roomData?.countryData?.[selectedCountry]) {
    costSpan.textContent = "-";
    return;
  }
  const cData = roomData.countryData[selectedCountry];
  if (cData.castleDefenseLevel < 1) {
    costSpan.textContent = "Önce kale kurulmalı.";
    return;
  }
  if (cData.castleDefenseLevel >= 6) {
    costSpan.textContent = "Maksimum seviye (%30)!";
    return;
  }
  if (!cData.castleNextUpgradeCost) {
    costSpan.textContent = "-";
    return;
  }
  costSpan.textContent = `
    ${cData.castleNextUpgradeCost.money}$ + 
    ${cData.castleNextUpgradeCost.petrol} Varil + 
    ${cData.castleNextUpgradeCost.wheat} Buğday
  `;
}

/*****************************************************************
 * 16. Saldırmazlık Pakti
 *****************************************************************/
document.getElementById("send-pact-offer-btn").addEventListener("click", () => {
  if (!isMyTurn()) {
    showNotification("Pakt teklifini yalnızca kendi sıranızda yapabilirsiniz!");
    return;
  }
  const recip = document.getElementById("pact-offer-recipient").value;
  const duration = parseInt(document.getElementById("pact-duration").value);
  const cost = parseInt(document.getElementById("pact-cost").value);

  if (!recip || recip === localPlayerId) {
    showNotification("Geçerli bir oyuncu seçin!");
    return;
  }
  if (isNaN(duration) || duration <= 0) {
    showNotification("Tur sayısı geçersiz!");
    return;
  }
  if (isNaN(cost) || cost < 0) {
    showNotification("Para miktarı geçersiz!");
    return;
  }
  if (hasActivePact(localPlayerId, recip)) {
    showNotification("Bu oyuncuyla zaten aktif pakt var!");
    return;
  }
  const sender = roomData.players[localPlayerId];
  const offRef = roomRef.child("pactOffers").push();
  const newOffer = {
    offerId: offRef.key,
    senderId: localPlayerId,
    senderName: sender.name,
    recipientId: recip,
    duration,
    cost,
    status: "pending"
  };
  offRef.set(newOffer);
  broadcastNotification(
    `Pakt Teklifi: ${sender.name} → ${roomData.players[recip].name} (Tur:${duration}, Para:${cost}$)`
  );
  showNotification("Pakt teklifi gönderildi!");
});

function hasActivePact(a, b) {
  if (!roomData?.pacts) return false;
  for (let pid in roomData.pacts) {
    const pact = roomData.pacts[pid];
    if (pact.active && roomData.round <= pact.expirationRound) {
      if ((pact.playerA === a && pact.playerB === b) ||
          (pact.playerA === b && pact.playerB === a)) {
        return true;
      }
    }
  }
  return false;
}

function displayPendingPactOffers() {
  const container = document.getElementById("pact-pending-offers");
  if (!container) return;
  container.innerHTML = "";
  if (!roomData?.pactOffers) return;

  Object.values(roomData.pactOffers).forEach((offer) => {
    if (offer.status === "pending" && offer.recipientId === localPlayerId) {
      const div = document.createElement("div");
      div.className = "pact-offer-item";
      div.dataset.offerId = offer.offerId;
      div.innerHTML = `
        <p><strong>${offer.senderName}</strong> size saldırmazlık pakti teklif ediyor.</p>
        <p>Tur: ${offer.duration}, Para: ${offer.cost}$</p>
        <button class="accept-btn" data-offer-id="${offer.offerId}">Kabul</button>
        <button class="reject-btn" data-offer-id="${offer.offerId}">Reddet</button>
      `;
      container.appendChild(div);
    }
  });
}

function displayActivePacts() {
  const container = document.getElementById("active-pacts-container");
  if (!container) return;
  container.innerHTML = "";
  if (!roomData?.pacts) return;

  for (let pid in roomData.pacts) {
    const pact = roomData.pacts[pid];
    if (pact.active && roomData.round <= pact.expirationRound) {
      if (pact.playerA === localPlayerId || pact.playerB === localPlayerId) {
        const otherId = (pact.playerA === localPlayerId) ? pact.playerB : pact.playerA;
        const otherName = roomData.players[otherId]?.name || "???";
        const rLeft = pact.expirationRound - roomData.round + 1;

        const d = document.createElement("div");
        d.className = "active-pact-item";
        d.innerHTML = `
          <p>Pakt: <strong>${otherName}</strong></p>
          <p>Kalan Tur: <strong>${rLeft}</strong></p>
        `;
        container.appendChild(d);
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

function acceptPactOffer(offerId) {
  const offer = roomData?.pactOffers[offerId];
  if (!offer || offer.status !== "pending") return;
  if (hasActivePact(offer.senderId, offer.recipientId)) {
    showNotification("Zaten aktif bir pakt var!");
    roomRef.child("pactOffers").child(offerId).update({ status: "rejected" });
    return;
  }
  const sender = roomData.players[offer.senderId];
  const rec = roomData.players[offer.recipientId];
  if (!sender || !rec) return;

  if (sender.money < offer.cost) {
    showNotification("Teklifi gönderenin parası yok! Teklif geçersiz.");
    roomRef.child("pactOffers").child(offerId).update({ status: "rejected" });
    return;
  }
  const expRound = (roomData.round || 1) + offer.duration;
  const pactId = db.ref().push().key;
  const ups = {};
  ups[`pactOffers/${offerId}/status`] = "accepted";
  ups[`players/${offer.senderId}/money`] = sender.money - offer.cost;
  ups[`players/${offer.recipientId}/money`] = rec.money + offer.cost;
  if (!roomData.pacts) {
    ups["pacts"] = {};
  }
  ups[`pacts/${pactId}`] = {
    playerA: offer.senderId,
    playerB: offer.recipientId,
    active: true,
    cost: offer.cost,
    duration: offer.duration,
    expirationRound: expRound
  };
  roomRef.update(ups);
  broadcastNotification(`Pakt: ${sender.name} & ${rec.name} (Tur:${offer.duration}, Para:${offer.cost}$).`);
  showNotification("Pakt teklifi kabul edildi!");
}

function rejectPactOffer(offerId) {
  const offer = roomData?.pactOffers[offerId];
  if (!offer || offer.status !== "pending") return;
  roomRef.child("pactOffers").child(offerId).update({ status: "rejected" });
  broadcastNotification(`Pakt Reddedildi: ${offer.senderName} -> Reddedildi.`);
  showNotification("Pakt teklifi reddedildi.");
}

function updatePactRecipientSelect() {
  const s = document.getElementById("pact-offer-recipient");
  if (!s) return;
  s.innerHTML = "";
  if (roomData?.playerOrder) {
    roomData.playerOrder.forEach((pid) => {
      if (pid !== localPlayerId && roomData.players[pid]) {
        const o = document.createElement("option");
        o.value = pid;
        o.textContent = roomData.players[pid].name;
        s.appendChild(o);
      }
    });
  }
}

/*****************************************************************
 * 17. Market (Ticaret) Sistemi
 *****************************************************************/
document.getElementById("create-trade-offer-btn").addEventListener("click", createTradeOffer);

function createTradeOffer() {
  if (!roomData?.players[localPlayerId]) return;
  const itemType = document.getElementById("trade-item-type").value;
  const qty = parseInt(document.getElementById("trade-quantity").value);
  const price = parseInt(document.getElementById("trade-price").value);

  if (isNaN(qty) || qty <= 0 || isNaN(price) || price <= 0) {
    showNotification("Geçerli miktar/fiyat girin!");
    return;
  }
  const seller = roomData.players[localPlayerId];
  let ok = false;
  if (itemType === "petrol" && seller.petrol >= qty) ok = true;
  if (itemType === "wheat" && seller.wheat >= qty) ok = true;
  if (!ok) {
    showNotification("Yeterli miktar yok!");
    return;
  }

  const embSel = document.getElementById("embargo-players");
  let embargoList = [];
  for (let i = 0; i < embSel.options.length; i++) {
    if (embSel.options[i].selected) {
      embargoList.push(embSel.options[i].value);
    }
  }

  const offRef = roomRef.child("tradeOffers").push();
  offRef.set({
    offerId: offRef.key,
    sellerId: localPlayerId,
    sellerName: seller.name,
    itemType,
    quantity: qty,
    price,
    status: "pending",
    embargo: embargoList
  });
  broadcastNotification(
    `${seller.name} ticaret teklifi oluşturdu (${itemType}, adet:${qty}, fiyat:${price}$).`
  );
  showNotification("Ticaret teklifi oluşturuldu!");
}

function displayTradeOffers() {
  const div = document.getElementById("trade-offers-list");
  if (!div) return;
  div.innerHTML = "";
  if (!roomData?.tradeOffers) return;

  const offers = Object.values(roomData.tradeOffers);
  offers.forEach((o) => {
    if (o.status === "pending") {
      if (o.embargo && o.embargo.includes(localPlayerId)) return;
      const d = document.createElement("div");
      d.className = "offer-item";
      let itemLabel = o.itemType === "petrol" ? "Petrol" : "Buğday";
      let html = `
        <p><strong>Satıcı:</strong> ${o.sellerName}</p>
        <p><strong>Ürün:</strong> ${itemLabel}</p>
        <p><strong>Mevcut Miktar:</strong> ${o.quantity}</p>
        <p><strong>Birim Fiyat:</strong> ${o.price} $</p>
      `;
      if (o.sellerId !== localPlayerId) {
        html += `
          <label style="font-size:14px;color:#ccc;">Almak istediğiniz miktar:</label>
          <input type="number" class="partial-buy-quantity" placeholder="Miktar" min="1" max="${o.quantity}" />
          <button class="partial-buy-btn">Satın Al</button>
        `;
      } else {
        html += `
          <button class="cancel-offer-btn" style="background:linear-gradient(45deg, #c0392b, #e74c3c); margin-top:10px;">İptal Et</button>
        `;
      }
      if (o.embargo && o.embargo.length > 0) {
        const embUsers = o.embargo
          .map((id) => roomData.players[id]?.name || "???")
          .join(", ");
        html += `<p style="color:red;"><strong>Ambargo:</strong> ${embUsers}</p>`;
      }
      d.innerHTML = html;

      const partialBtn = d.querySelector(".partial-buy-btn");
      if (partialBtn) {
        partialBtn.addEventListener("click", () => {
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

function acceptTradeOffer(offerId, buyAmount) {
  const off = roomData?.tradeOffers?.[offerId];
  if (!off || off.status !== "pending") {
    showNotification("Teklif geçerli değil!");
    return;
  }
  const seller = roomData.players[off.sellerId];
  const buyer = roomData.players[localPlayerId];
  if (!seller || !buyer) return;
  if (buyAmount > off.quantity) {
    showNotification("Teklifte yeterli stok yok!");
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
  const newQty = off.quantity - buyAmount;
  if (newQty <= 0) {
    ups[`tradeOffers/${offerId}/status`] = "completed";
  }
  ups[`tradeOffers/${offerId}/quantity`] = newQty;

  roomRef.update(ups, (err) => {
    if (!err) {
      broadcastNotification(
        `Ticaret: ${seller.name} -> ${buyer.name} (${buyAmount} x ${off.itemType}).`
      );
      showNotification("Ticaret başarıyla gerçekleşti!");
      const cMsg = {
        sender: "Sistem",
        senderId: "system",
        text: `Ticaret Onaylandı: ${seller.name} -> ${buyer.name}, ${buyAmount} x ${off.itemType}`,
        recipientId: "",
        timestamp: firebase.database.ServerValue.TIMESTAMP
      };
      roomRef.child("chat").push(cMsg);
    }
  });
}

function cancelTradeOffer(offerId) {
  const off = roomData?.tradeOffers?.[offerId];
  if (!off) return;
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
  if (roomData?.playerOrder) {
    roomData.playerOrder.forEach((pid) => {
      if (pid !== localPlayerId && roomData.players[pid]) {
        const o = document.createElement("option");
        o.value = pid;
        o.textContent = roomData.players[pid].name;
        sel.appendChild(o);
      }
    });
  }
}

/*****************************************************************
 * 18. Sohbet (Chat) Sistemi
 *****************************************************************/
function toggleChat(show) {
  chatPopup.style.display = show ? "flex" : "none";
  chatOpen = show;
  if (chatOpen) {
    unreadMessages = 0;
    updateChatBadge();
  }
}
document.getElementById("send-chat-btn").addEventListener("click", sendChatMessage);
document.getElementById("chat-input").addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    sendChatMessage();
  }
});

function sendChatMessage() {
  const input = document.getElementById("chat-input");
  const text = input.value.trim();
  if (!text || !roomRef) return;

  let senderName = "Anon";
  if (roomData?.players?.[localPlayerId]) {
    senderName = roomData.players[localPlayerId].name;
  }
  const msg = {
    sender: senderName,
    senderId: localPlayerId,
    text,
    recipientId: "",
    timestamp: firebase.database.ServerValue.TIMESTAMP
  };
  roomRef.child("chat").push(msg, () => {
    input.value = "";
  });
}

document.getElementById("send-private-message-btn").addEventListener("click", () => {
  const pmInput = document.getElementById("private-message-input");
  const pmRecip = document.getElementById("private-message-recipient");
  const txt = pmInput.value.trim();
  const rc = pmRecip.value;
  if (!txt || !rc) return;

  let senderName = "Anon";
  if (roomData?.players?.[localPlayerId]) {
    senderName = roomData.players[localPlayerId].name;
  }
  const pm = {
    sender: senderName,
    senderId: localPlayerId,
    text: txt,
    recipientId: rc,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  };
  roomRef.child("chat").push(pm, () => {
    pmInput.value = "";
    showNotification("Özel mesaj gönderildi!");
  });
});

function appendChatMessage(message) {
  // Özel mesaj mı?
  if (message.recipientId && message.recipientId !== "") {
    // Sadece bize veya bizden -> göster
    if (message.senderId !== localPlayerId && message.recipientId !== localPlayerId) {
      return;
    }
  }
  const chatMessagesDiv = document.getElementById("chat-messages");
  const div = document.createElement("div");

  if (message.recipientId && message.recipientId !== "") {
    const targName = roomData.players[message.recipientId]?.name || "???";
    if (message.senderId === localPlayerId) {
      div.innerHTML = `<strong>[PM to ${targName}]:</strong> ${message.text}`;
    } else {
      div.innerHTML = `<strong>[PM from ${message.sender}]:</strong> ${message.text}`;
    }
    div.style.color = "#f39c12";
  } else {
    div.textContent = `${message.sender}: ${message.text}`;
  }
  chatMessagesDiv.appendChild(div);
  chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;

  if (!chatOpen && message.senderId !== localPlayerId) {
    unreadMessages++;
    updateChatBadge();
  }
}

function updateChatBadge() {
  const btn = document.getElementById("open-chat-btn");
  if (unreadMessages > 0) {
    btn.dataset.badge = unreadMessages;
  } else {
    btn.dataset.badge = "";
  }
}

/*****************************************************************
 * 19. BAYRAK DÜZENLEYİCİ (Flag Editor)
 *****************************************************************/
const flagEditorPopup = document.getElementById("flag-editor-popup");
const openFlagEditorBtn = document.getElementById("edit-flag-btn");
const closeFlagEditorBtn = document.getElementById("close-flag-editor-btn");
const saveFlagBtn = document.getElementById("save-flag-btn");
const colorInput = document.getElementById("flag-color");
const brushSizeInput = document.getElementById("flag-brush-size");
const eraseBtn = document.getElementById("flag-erase-btn");
const clearBtn = document.getElementById("flag-clear-btn");

openFlagEditorBtn.addEventListener("click", () => {
  initFlagCanvas();
  flagEditorPopup.style.display = "flex";
});
closeFlagEditorBtn.addEventListener("click", () => {
  flagEditorPopup.style.display = "none";
});
saveFlagBtn.addEventListener("click", saveFlagDrawing);

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

  if (currentUserData && currentUserData.flag) {
    const img = new Image();
    img.onload = function () {
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

  if (isErasing) {
    flagCtx.strokeStyle = "#ffffff";
  } else {
    flagCtx.strokeStyle = brushColor;
  }

  flagCtx.lineTo(x, y);
  flagCtx.stroke();
  flagCtx.beginPath();
  flagCtx.moveTo(x, y);
}
function stopDrawing() {
  isDrawing = false;
  flagCtx.beginPath();
}

eraseBtn.addEventListener("click", () => {
  isErasing = !isErasing;
  eraseBtn.textContent = isErasing ? "Kalem" : "Silgi";
});
clearBtn.addEventListener("click", () => {
  flagCtx.fillStyle = "#ffffff";
  flagCtx.fillRect(0, 0, flagCanvas.width, flagCanvas.height);
});
colorInput.addEventListener("input", () => {
  brushColor = colorInput.value;
  if (isErasing) {
    isErasing = false;
    eraseBtn.textContent = "Silgi";
  }
});
brushSizeInput.addEventListener("input", () => {
  brushSize = parseInt(brushSizeInput.value);
});

function saveFlagDrawing() {
  if (!flagCanvas || !flagCtx) return;
  const dataUrl = flagCanvas.toDataURL("image/png");
  db.ref("users/" + currentUser.uid + "/flag").set(dataUrl);
  currentUserData.flag = dataUrl;
  showNotification("Bayrak kaydedildi!");
  flagEditorPopup.style.display = "none";
}

/*****************************************************************
 * 20. Leaflet Pattern ile Bayrak Pattern'ı Oluşturma
 *****************************************************************/
/**
 * getPlayerPattern(playerId):
 *  - Eğer bu playerId için önceden pattern oluşturduysak cache'den döndür.
 *  - Yoksa yeni bir L.Pattern oluştur, image shape ekle, map'e ekle, cache'le.
 */
function getPlayerPattern(playerId) {
  if (playerPatterns[playerId]) {
    return playerPatterns[playerId];
  }
  if (!roomData || !roomData.players[playerId]) return null;
  const p = roomData.players[playerId];
  if (!p.flag) return null;

  // Pattern oluştur
  const pat = new L.Pattern({
    patternUnits: 'userSpaceOnUse',  // veya objectBoundingBox
    width: 50,
    height: 50
  });

  // Tekrarsız kaplama için image shape ekliyoruz
  pat.addShape(
    new L.PatternShape('image',
      { x: 0, y: 0, width: 50, height: 50 },
      { href: p.flag }
    )
  );

  pat.addTo(map); // map’e ekliyoruz
  playerPatterns[playerId] = pat;
  return pat;
}

/*****************************************************************
 * 21. DOMContentLoaded
 *****************************************************************/
document.addEventListener("DOMContentLoaded", () => {
  if (!localStorage.getItem("playerId")) {
    localStorage.setItem("playerId", Math.random().toString(36).substr(2, 9));
  }
  localPlayerId = localStorage.getItem("playerId");

  autoReconnect();

  // Harita ekranı açılınca haritayı initialize edelim
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
