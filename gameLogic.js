/* gameLogic.mod.js — Part 1/3
   Çekirdek durum + profil/arkadaş + davetler (modüler Firebase v10)
*/

/* ==== Güvenlik: window.gc hazır mı? (index.html kuruyor) ==== */
if (!window.gc || !window.gc.auth || !window.gc.db) {
  console.error("[GC] window.gc eksik. Lütfen index.html içindeki modüler Firebase başlangıcını ekleyin.");
}

/* ==== Kısa yollar ==== */
const { auth, db, fba, fdb } = window.gc;
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const show = (el, disp = "flex") => el && (el.style.display = disp);
const hide = (el) => el && (el.style.display = "none");

/* ==== Bildirim/Toast ==== */
let notificationsMuted = false;
function toast(text, duration = 3000) {
  if (notificationsMuted) return;
  const area = $("#notification-area");
  if (!area) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  area.appendChild(el);
  setTimeout(() => area.contains(el) && area.removeChild(el), duration + 800);
}
$("#open-notifications-btn")?.addEventListener("click", () => {
  notificationsMuted = !notificationsMuted;
  toast(notificationsMuted ? "Bildirimler kapatıldı." : "Bildirimler açıldı.");
});

/* ==== Global oyun durumu ==== */
let currentUser = null;            // Firebase kullanıcı nesnesi
let currentUserData = null;        // /users/{uid}
let currentRoomId = null;          // rooms/{roomId} — (2. kısımda kullanılacak)
let roomRef = null;                // Realtime DB ref — (2. kısımda)
let roomData = null;               // Oda verisi — (2. kısımda)
let isSpectator = false;

/* ==== UI yardımcıları ==== */
function setUserOnlineStatus(isOnline) {
  if (!currentUser) return;
  const uRef = fdb.ref(db, `users/${currentUser.uid}/online`);
  if (isOnline) {
    fdb.set(uRef, true);
    fdb.onDisconnect(uRef).set(false);
  } else {
    fdb.set(uRef, false);
  }
}

/* Profil popup toggle */
$("#open-profile-btn")?.addEventListener("click", () => show($("#profile-popup")));
$("#close-profile-btn")?.addEventListener("click", () => hide($("#profile-popup")));

/* ==== AUTH durum dinleyici ==== */
fba.onAuthStateChanged(auth, async (user) => {
  if (!user) {
    currentUser = null;
    currentUserData = null;
    return;
  }
  currentUser = user;
  setUserOnlineStatus(true);

  // Kullanıcı dokümanı
  const snap = await fdb.get(fdb.ref(db, `users/${user.uid}`));
  if (snap.exists()) {
    currentUserData = snap.val();
  } else {
    // Hiç kayıt yazılmamışsa oluştur
    const displayName = user.email?.split("@")[0] || "Oyuncu";
    currentUserData = {
      email: user.email || "",
      displayName,
      online: true,
      friends: {},
      friendRequests: {},
      roomInvites: {}
    };
    await fdb.set(fdb.ref(db, `users/${user.uid}`), currentUserData);
  }

  // Profil adı
  $("#profile-username").textContent = currentUserData.displayName || "Oyuncu";

  // Canlı dinleyiciler
  attachUserLiveListeners();

  // İlk yüklemeler
  loadUserFriends();
  loadFriendRequests();
  loadFriendInviteList();
  // loadActiveRooms();  // 2. kısımda gelecek
});

/* ==== Kullanıcı /users/{uid} altına canlı dinleyiciler ==== */
function attachUserLiveListeners() {
  if (!currentUser) return;

  // Arkadaşlık istekleri canlı
  fdb.onValue(fdb.ref(db, `users/${currentUser.uid}/friendRequests`), (s) => {
    currentUserData = currentUserData || {};
    currentUserData.friendRequests = s.val() || {};
    loadFriendRequests();
  });

  // Arkadaş listesi canlı
  fdb.onValue(fdb.ref(db, `users/${currentUser.uid}/friends`), (s) => {
    currentUserData = currentUserData || {};
    currentUserData.friends = s.val() || {};
    loadUserFriends();
    loadFriendInviteList();
  });

  // Oda davetleri canlı
  fdb.onValue(fdb.ref(db, `users/${currentUser.uid}/roomInvites`), (s) => {
    currentUserData = currentUserData || {};
    currentUserData.roomInvites = s.val() || {};
    loadRoomInvites();
  });
}

/* ======================================================================
   ARKADAŞ SİSTEMİ
   - Listeleme, silme
   - İstek gönder/kabul/ret
   ====================================================================== */

/** Arkadaş listesini doldur */
async function loadUserFriends() {
  const host = $("#friend-list");
  if (!host) return;
  host.innerHTML = "";

  const friends = (currentUserData && currentUserData.friends) || {};
  const ids = Object.keys(friends);

  if (ids.length === 0) {
    host.innerHTML = `<div class="item"><span>Henüz arkadaş yok.</span></div>`;
    return;
  }

  for (const fid of ids) {
    const snap = await fdb.get(fdb.ref(db, `users/${fid}`));
    const fd = snap.val();
    if (!fd) continue;

    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <span>
        ${fd.displayName || "Oyuncu"} 
        <span class="chip" style="margin-left:6px">${fd.online ? "Çevrimiçi" : "Çevrimdışı"}</span>
      </span>
      <button class="btn btn-soft remove-friend" data-fid="${fid}"><i class="fa-solid fa-user-xmark"></i> Sil</button>
    `;
    host.appendChild(row);
  }
}

/** Arkadaş silme (karşılıklı) */
$("#friend-list")?.addEventListener("click", async (e) => {
  const btn = e.target.closest(".remove-friend");
  if (!btn) return;
  const fid = btn.getAttribute("data-fid");
  if (!fid || !currentUser) return;
  const ups = {};
  ups[`users/${currentUser.uid}/friends/${fid}`] = null;
  ups[`users/${fid}/friends/${currentUser.uid}`] = null;
  await fdb.update(fdb.ref(db), ups);
  toast("Arkadaş silindi.");
});

/** Gelen arkadaşlık isteklerini doldur */
async function loadFriendRequests() {
  const host = $("#friend-request-list");
  if (!host) return;
  host.innerHTML = "";
  const reqs = (currentUserData && currentUserData.friendRequests) || {};
  const ids = Object.keys(reqs);

  if (ids.length === 0) {
    host.innerHTML = `<div class="item"><span>Yeni istek yok.</span></div>`;
    return;
  }

  for (const rid of ids) {
    const snap = await fdb.get(fdb.ref(db, `users/${rid}`));
    const ud = snap.val();
    if (!ud) continue;

    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <span>${ud.displayName || "Oyuncu"}</span>
      <div class="row" style="gap:6px;flex:none">
        <button class="btn btn-primary accept-friend" data-fid="${rid}">Kabul</button>
        <button class="btn btn-soft reject-friend"  data-fid="${rid}">Reddet</button>
      </div>
    `;
    host.appendChild(row);
  }
}

/** İstek kabul/ret tıklamaları */
$("#friend-request-list")?.addEventListener("click", async (e) => {
  const acc = e.target.closest(".accept-friend");
  const rej = e.target.closest(".reject-friend");
  if (!currentUser) return;

  if (acc) {
    const fromUid = acc.getAttribute("data-fid");
    const ups = {};
    ups[`users/${currentUser.uid}/friends/${fromUid}`] = true;
    ups[`users/${fromUid}/friends/${currentUser.uid}`] = true;
    ups[`users/${currentUser.uid}/friendRequests/${fromUid}`] = null;
    await fdb.update(fdb.ref(db), ups);
    toast("Arkadaşlık isteği kabul edildi!");
  } else if (rej) {
    const fromUid = rej.getAttribute("data-fid");
    await fdb.remove(fdb.ref(db, `users/${currentUser.uid}/friendRequests/${fromUid}`));
    toast("Arkadaşlık isteği reddedildi.");
  }
});

/** Arkadaşlık isteği gönder */
$("#send-friend-request-btn")?.addEventListener("click", async () => {
  if (!currentUser) return;
  const uname = $("#add-friend-username").value.trim();
  if (!uname) return toast("Kullanıcı adı girin!");

  const allSnap = await fdb.get(fdb.ref(db, "users"));
  const all = allSnap.val() || {};
  let targetUid = null;

  for (const uid in all) {
    const dName = (all[uid].displayName || "").toLowerCase();
    if (dName === uname.toLowerCase()) { targetUid = uid; break; }
  }
  if (!targetUid) return toast("Kullanıcı bulunamadı!");
  if (targetUid === currentUser.uid) return toast("Kendinize istek gönderemezsiniz!");

  await fdb.set(fdb.ref(db, `users/${targetUid}/friendRequests/${currentUser.uid}`), true);
  toast("Arkadaşlık isteği gönderildi!");
});

/* Arkadaş listesini oda davet select’ine doldur (oda kurarken) */
function loadFriendInviteList() {
  const sel = $("#room-invite-friends");
  if (!sel) return;
  sel.innerHTML = "";
  const friends = (currentUserData && currentUserData.friends) || {};
  for (const fid of Object.keys(friends)) {
    fdb.get(fdb.ref(db, `users/${fid}`)).then((snap) => {
      const u = snap.val();
      if (!u) return;
      const opt = document.createElement("option");
      opt.value = fid;
      opt.textContent = u.displayName || "Oyuncu";
      sel.appendChild(opt);
    });
  }
}

/* ======================================================================
   ODA DAVETLERİ
   - hostInvite (host → user) ve joinRequest (user → host)
   - Kabul/Reddet akışları
   Not: Odaya gerçek giriş ve harita 2. kısımda.
   ====================================================================== */
function loadRoomInvites() {
  const host = $("#room-invite-list");
  if (!host) return;
  host.innerHTML = "";

  const invs = (currentUserData && currentUserData.roomInvites) || {};
  const ids = Object.keys(invs);
  if (ids.length === 0) {
    host.innerHTML = `<div class="item"><span>Davet/istek yok.</span></div>`;
    return;
  }

  for (const iid of ids) {
    const inv = invs[iid];
    if (!inv) continue;
    const row = document.createElement("div");
    row.className = "item";

    if (inv.type === "hostInvite") {
      row.innerHTML = `
        <span><strong>${inv.fromName}</strong> seni <strong>${inv.roomName}</strong> odasına davet etti.</span>
        <div class="row" style="gap:6px;flex:none">
          <button class="btn btn-primary accept-room-invite" data-iid="${iid}">Kabul</button>
          <button class="btn btn-soft reject-room-invite" data-iid="${iid}">Reddet</button>
        </div>
      `;
    } else if (inv.type === "joinRequest") {
      row.innerHTML = `
        <span><strong>${inv.fromName}</strong> <strong>${inv.roomName}</strong> odana katılmak istiyor.</span>
        <div class="row" style="gap:6px;flex:none">
          <button class="btn btn-primary accept-join-request" data-iid="${iid}">Kabul</button>
          <button class="btn btn-soft reject-room-invite" data-iid="${iid}">Reddet</button>
        </div>
      `;
    }
    host.appendChild(row);
  }
}

/* Liste üstünden tıklama yakalama */
$("#room-invite-list")?.addEventListener("click", async (e) => {
  const accInv = e.target.closest(".accept-room-invite");
  const rejInv = e.target.closest(".reject-room-invite");
  const accReq = e.target.closest(".accept-join-request");

  if (accInv) {
    const invId = accInv.getAttribute("data-iid");
    await acceptRoomInvite(invId);
  } else if (rejInv) {
    const invId = rejInv.getAttribute("data-iid");
    await rejectRoomInvite(invId);
  } else if (accReq) {
    const invId = accReq.getAttribute("data-iid");
    await acceptJoinRequest(invId);
  }
});

/** Daveti kabul eden kullanıcı (hostInvite) */
async function acceptRoomInvite(invId) {
  if (!currentUser) return;
  const inv = (currentUserData?.roomInvites || {})[invId];
  if (!inv) return;

  // Odaya girme mantığı 2. kısımda (window.gc.joinRoomDirect ekleyeceğiz)
  if (typeof window.gc.joinRoomDirect === "function") {
    await window.gc.joinRoomDirect(inv.roomId);
  } else {
    // Şimdilik sadece bilgilendir
    toast(`Davet kabul edildi. Oda: ${inv.roomName} (Odaya giriş 2. kısımda)`);
  }
  // Daveti temizle
  await fdb.remove(fdb.ref(db, `users/${currentUser.uid}/roomInvites/${invId}`));
}

/** Daveti reddet */
async function rejectRoomInvite(invId) {
  if (!currentUser) return;
  await fdb.remove(fdb.ref(db, `users/${currentUser.uid}/roomInvites/${invId}`));
  toast("Davet/istek reddedildi.");
}

/** Host’un joinRequest kabul etmesi: oyuncuyu odaya ekle */
async function acceptJoinRequest(invId) {
  if (!currentUser) return;
  const inv = (currentUserData?.roomInvites || {})[invId];
  if (!inv || inv.type !== "joinRequest") return;

  // Odayı getir
  const rSnap = await fdb.get(fdb.ref(db, `rooms/${inv.roomId}`));
  if (!rSnap.exists()) {
    toast("Oda bulunamadı!");
    await rejectRoomInvite(invId);
    return;
  }
  const r = rSnap.val();
  if (r.hostUid !== currentUser.uid) {
    toast("Bu odanın host'u değilsiniz!");
    return;
  }
  if (!(r.gameState === "waiting" || r.gameState === "starting")) {
    toast("Oyun başlamış, katılamaz!");
    return;
  }
  const already = r.players && r.players[inv.fromUid];
  if (already) {
    toast("Bu oyuncu zaten odada.");
    await rejectRoomInvite(invId);
    return;
  }

  // Oyuncu verisi
  const uSnap = await fdb.get(fdb.ref(db, `users/${inv.fromUid}`));
  const udat  = uSnap.val() || {};
  const newPl = {
    name: udat.displayName || "Oyuncu",
    money: 1000,
    soldiers: 0,
    countries: [],
    petrol: 100,
    wheat: 400,
    joinedAt: fdb.serverTimestamp(),
    isHost: false,
    flag: udat.flag || ""
  };

  const playerOrder = Array.isArray(r.playerOrder) ? [...r.playerOrder, inv.fromUid] : [currentUser.uid, inv.fromUid];

  const ups = {};
  ups[`rooms/${inv.roomId}/players/${inv.fromUid}`] = newPl;
  ups[`rooms/${inv.roomId}/playerOrder`] = playerOrder;
  ups[`users/${currentUser.uid}/roomInvites/${invId}`] = null;

  await fdb.update(fdb.ref(db), ups);
  toast(`${newPl.name} odaya eklendi.`);
}

/* ======================================================================
   YARDIMCI: Oda içi global bildirim (2. kısımda kullanacağız)
   ====================================================================== */
window.gc.broadcastNotification = async function(text, roomId) {
  if (!roomId) return;
  const notifRef = fdb.push(fdb.ref(db, `rooms/${roomId}/notifications`));
  await fdb.set(notifRef, { text, timestamp: fdb.serverTimestamp() });
};

/* ======================================================================
   GEÇİCİ: joinRoomDirect stub (2. kısım bunu gerçekleyip üzerine yazacak)
   ====================================================================== */
window.gc.joinRoomDirect = async function(roomId) {
  console.warn("[GC] joinRoomDirect henüz yüklenmedi (2. kısımda eklenecek). İstenen oda:", roomId);
};

/* ======================================================================
   Temizlik: sayfa kapanırken online=false
   ====================================================================== */
window.addEventListener("beforeunload", () => {
  try { setUserOnlineStatus(false); } catch(_) {}
});

/* Modül olduğu belli olsun (global export yok) */
export {};
/* gameLogic.mod.js — Part 2/3
   Oda yönetimi + harita + UI (modüler Firebase v10)
*/

const { auth, db, fdb } = window.gc;
const $  = (sel) => document.querySelector(sel);
const show = (el, disp = "flex") => el && (el.style.display = disp);
const hide = (el) => el && (el.style.display = "none");

/* ==== Sayfa bölümleri ==== */
const elAuth  = $("#auth-container");
const elLobby = $("#lobby-container");   // varsa
const elGame  = $("#game-container");

function showGamePage() {
  hide(elAuth);
  hide(elLobby || {style:{}}); // lobi yoksa sorun olmasın
  show(elGame, "block");
}

/* ==== Oda & Harita durumları ==== */
let currentRoomId = null;
let roomRef = null;
let roomData = null;
let isSpectator = false;

let map;
let geoJsonLayer;
let infoCardsPermanent = false;
let selectedCountry = null;
let startInterval = null;

/* Seçili ülkeyi diğer parçalara açalım */
window.gc.getSelectedCountry = () => selectedCountry;

/* Küçük yardımcı: uid’den sabit renk üretelim.
   (3. kısımda bayrak desenine geçeceğiz; şimdilik renk yeterli) */
function colorFromId(id = "x") {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const r = 80 + (h & 0x7F);
  const g = 80 + ((h >> 7) & 0x7F);
  const b = 80 + ((h >> 14) & 0x7F);
  return `rgb(${r},${g},${b})`;
}

/* ======================================================================
   ODA KUR / LİSTE / KATIL / İZLE
   ====================================================================== */

/** Oda oluştur */
$("#create-room-btn")?.addEventListener("click", createRoom);
async function createRoom() {
  const rName = $("#room-name-input")?.value.trim();
  if (!rName) return window.gc.toast?.("Oda adı giriniz!");

  const uid = auth.currentUser?.uid;
  if (!uid) return window.gc.toast?.("Giriş yapmalısınız!");

  const hostSnap = await fdb.get(fdb.ref(db, `users/${uid}`));
  const hostUser = hostSnap.val() || {};

  const newRoomId = fdb.push(fdb.ref(db, "rooms")).key;

  const hostData = {
    name: hostUser.displayName || "Oyuncu",
    money: 1000,
    soldiers: 0,
    countries: [],
    petrol: 100,
    wheat: 400,
    joinedAt: fdb.serverTimestamp(),
    isHost: true,
    flag: hostUser.flag || ""
  };

  const newRoom = {
    roomId: newRoomId,
    name: rName,
    gameState: "waiting",
    currentTurnIndex: 0,
    round: 1,
    playerOrder: [uid],
    players: { [uid]: hostData },
    watchers: {},
    createdAt: fdb.serverTimestamp(),
    hostUid: uid
  };

  await fdb.set(fdb.ref(db, `rooms/${newRoomId}`), newRoom);

  // Lobi formunda seçili arkadaşlara davet (opsiyonel)
  const inviteSel = $("#room-invite-friends");
  if (inviteSel) {
    const selected = Array.from(inviteSel.options).filter(o => o.selected).map(o => o.value);
    for (const fid of selected) {
      const invKey = fdb.push(fdb.ref(db, `users/${fid}/roomInvites`)).key;
      await fdb.set(
        fdb.ref(db, `users/${fid}/roomInvites/${invKey}`),
        {
          type: "hostInvite",
          fromUid: uid,
          fromName: hostData.name,
          roomId: newRoomId,
          roomName: rName,
          status: "pending"
        }
      );
    }
  }

  // Ülke verilerini ilk kez yaz
  await initializeCountryData(newRoomId);

  window.gc.toast?.("Oda oluşturuldu.");
  // İsterseniz direkt odaya girin:
  await joinRoomDirect(newRoomId);
}

/** Aktif odaları listele (canlı) */
function loadActiveRooms() {
  const host = $("#active-rooms-list");
  if (!host) return;
  host.innerHTML = "";
  fdb.onValue(fdb.ref(db, "rooms"), (snap) => {
    host.innerHTML = "";
    const all = snap.val() || {};
    for (const rid in all) {
      const r = all[rid];
      if (!r || r.gameState === "ended") continue;
      const pc = r.players ? Object.keys(r.players).length : 0;

      const card = document.createElement("div");
      card.className = "active-room-item";
      card.innerHTML = `
        <strong>${r.name}</strong>
        <p>Host UID: ${r.hostUid}</p>
        <p>Oyuncu Sayısı: ${pc}</p>
        <div>
          <button class="btn-join-room" data-rid="${rid}">Katıl</button>
          <button class="btn-watch-room" data-rid="${rid}">İzle</button>
        </div>
      `;
      host.appendChild(card);
    }
  });
}
loadActiveRooms();

/** Katılma isteği (joinRequest) */
$("#active-rooms-list")?.addEventListener("click", async (e) => {
  const j = e.target.closest(".btn-join-room");
  const w = e.target.closest(".btn-watch-room");
  if (j) {
    await requestJoinRoom(j.getAttribute("data-rid"));
  } else if (w) {
    await watchRoom(w.getAttribute("data-rid"));
  }
});
async function requestJoinRoom(roomId) {
  const uid = auth.currentUser?.uid;
  if (!uid) return window.gc.toast?.("Giriş yapmalısınız!");
  const rSnap = await fdb.get(fdb.ref(db, `rooms/${roomId}`));
  if (!rSnap.exists()) return window.gc.toast?.("Oda bulunamadı!");
  const r = rSnap.val();
  if (!(r.gameState === "waiting" || r.gameState === "starting")) {
    return window.gc.toast?.("Oyun başladı/bitti, katılamazsınız!");
  }
  const me = (await fdb.get(fdb.ref(db, `users/${uid}`))).val() || {};
  const key = fdb.push(fdb.ref(db, `users/${r.hostUid}/roomInvites`)).key;
  await fdb.set(fdb.ref(db, `users/${r.hostUid}/roomInvites/${key}`), {
    type: "joinRequest",
    fromUid: uid,
    fromName: me.displayName || "Oyuncu",
    roomId,
    roomName: r.name,
    status: "pending"
  });
  window.gc.toast?.("Katılma isteği gönderildi (onay bekliyor).");
}

/** İzleyici olarak gir */
async function watchRoom(roomId) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const rSnap = await fdb.get(fdb.ref(db, `rooms/${roomId}`));
  if (!rSnap.exists()) return window.gc.toast?.("Oda bulunamadı!");
  await fdb.set(
    fdb.ref(db, `rooms/${roomId}/watchers/${uid}`),
    { name: (await fdb.get(fdb.ref(db, `users/${uid}`))).val()?.displayName || "Seyirci",
      joinedAt: fdb.serverTimestamp() }
  );
  isSpectator = true;
  await loadMapAndRoom(roomId);
  window.gc.toast?.("İzleyici olarak odaya girildi.");
}

/** Davet kabulünde de çağrılır */
async function joinRoomDirect(roomId) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const rSnap = await fdb.get(fdb.ref(db, `rooms/${roomId}`));
  if (!rSnap.exists()) return window.gc.toast?.("Oda bulunamadı!");
  const r = rSnap.val();
  if (!r.players || !r.players[uid]) {
    return window.gc.toast?.("Katılımınız henüz onaylanmamış.");
  }
  isSpectator = false;
  await loadMapAndRoom(roomId);
}

/* Dışarıdan da çağrılabilsin (1. kısımdaki stub’u override) */
window.gc.joinRoomDirect = joinRoomDirect;

/* ======================================================================
   Odaya girince: canlı dinleyici + oyun ekranı + harita
   ====================================================================== */
async function loadMapAndRoom(roomId) {
  currentRoomId = roomId;
  roomRef = fdb.ref(db, `rooms/${roomId}`);

  fdb.onValue(roomRef, (snapshot) => {
    roomData = snapshot.val() || {};
    updateGameUI();
    // 3. kısım: pakt/market/chat listeleri burada güncellenecek
  });

  showGamePage();
  $("#display-room-name") && ($("#display-room-name").textContent = "-");
  initializeMap(); // haritayı bir kez kur
}

/* === Ülke verisini ilk kez yaz === */
async function initializeCountryData(roomId) {
  // Dünya GeoJSON’ına göre rastgele üretimler
  const res = await fetch("https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json");
  const gj = await res.json();
  const features = gj.features || [];

  const oilIdx = new Set();
  while (oilIdx.size < Math.min(43, features.length)) {
    oilIdx.add(Math.floor(Math.random() * features.length));
  }
  const wheatIdx = new Set();
  while (wheatIdx.size < Math.min(60, features.length)) {
    wheatIdx.add(Math.floor(Math.random() * features.length));
  }

  const cData = {};
  features.forEach((f, i) => {
    const name = f.properties?.name || `C${i}`;
    const oilProduction   = oilIdx.has(i)   ? Math.floor(Math.random() * (500 - 150 + 1)) + 150 : 0;
    const wheatProduction = wheatIdx.has(i) ? Math.floor(Math.random() * (700 - 200 + 1)) + 200 : 0;
    cData[name] = {
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

  await fdb.set(fdb.ref(db, `rooms/${roomId}/countryData`), cData);
}

/* ======================================================================
   HARİTA
   ====================================================================== */
function initializeMap() {
  if (map) return; // yalnızca 1 kez

  map = L.map("map", {
    center: [20, 0],
    zoom: 2,
    maxBounds: [[-85, -180], [85, 180]],
    maxBoundsViscosity: 1.0,
    worldCopyJump: false,
    noWrap: true
  });

  // Hafif bir tile layer (okyanus)
  L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 7, minZoom: 2, attribution: "Tiles © Esri" }
  ).addTo(map);

  // GeoJSON sınırları
  fetch("https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json")
    .then(r => r.json())
    .then(geo => {
      geoJsonLayer = L.geoJson(geo, {
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

  // Tooltip görünürlüğü toggle
  $("#toggle-info-cards")?.addEventListener("click", () => {
    infoCardsPermanent = !infoCardsPermanent;
    updateMapCountries();
    const icon = $("#toggle-info-cards i");
    if (icon) icon.className = infoCardsPermanent ? "fas fa-eye" : "fas fa-eye-slash";
  });
}

/** Oda verisi değiştiğinde katman stillerini güncelle */
function updateMapCountries() {
  if (!geoJsonLayer || !roomData?.countryData) return;

  geoJsonLayer.eachLayer((layer) => {
    const cname = layer.feature.properties.name;
    const cData = roomData.countryData[cname];
    if (!cData) return;

    // varsayılan stil
    let style = { weight: 1, color: "#555", fillColor: "#ccc", fillOpacity: 0.7 };

    if (cData.owner && roomData.players?.[cData.owner]) {
      // 3. kısımda bayrak deseniyle boyayacağız.
      style = {
        weight: 1,
        color: "#333",
        fillColor: colorFromId(cData.owner),
        fillOpacity: 0.9
      };
    }
    layer.setStyle(style);
    layer.setTooltipContent(getCountryPopupContent(cname));
  });
}

/** Tooltip içeriği */
function getCountryPopupContent(cname) {
  const c = roomData?.countryData?.[cname];
  if (!c) return `<div><p>${cname}</p><p>Veri yok</p></div>`;

  const ownerName = c.owner && roomData.players?.[c.owner]
    ? roomData.players[c.owner].name
    : "Yok";

  let effIncome = c.income || 0;
  if (c.factories) effIncome = Math.floor(effIncome * (1 + 0.2 * c.factories));

  const effOil   = c.oilProduction   ? Math.floor(c.oilProduction   * (1 + 0.15 * (c.refineries || 0))) : 0;
  const effWheat = c.wheatProduction ? Math.floor(c.wheatProduction * (1 + 0.20 * (c.grainMills || 0))) : 0;

  const castleDef = c.castleDefenseLevel > 0 ? `%${c.castleDefenseLevel * 5}` : "-";

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
      <p><i class="fas fa-crown"></i> Sahip: ${ownerName}</p>
    </div>
  `;
}

/** Ülke seçimi */
function selectCountryOnMap(cname, layer) {
  if (isSpectator) {
    return window.gc.toast?.("Seyirci modundasınız, etkileşim yok.");
  }
  selectedCountry = cname;
  window.gc.toast?.(`Seçilen ülke: ${cname}`, 1500);

  // kısa bir highlight
  layer.setStyle({ weight: 4, color: "#FF4500" });
  setTimeout(() => updateMapCountries(), 700);

  // 3. kısım fonksiyonu varsa (kale maliyeti vs) güncelle
  if (typeof window.gc.updateCastleUpgradeCostUI === "function") {
    window.gc.updateCastleUpgradeCostUI();
  }
}

/* ======================================================================
   TOP BAR — Oyun durumu ve Başlatma
   ====================================================================== */
function updateGameUI() {
  if (!roomData) return;

  $("#display-room-name") && ($("#display-room-name").textContent = roomData.name || "-");
  $("#current-round")     && ($("#current-round").textContent     = roomData.round || 1);

  // Sıradaki oyuncu
  if (roomData.playerOrder && roomData.players) {
    const idx = roomData.currentTurnIndex || 0;
    const currPid = roomData.playerOrder[idx];
    const pl = roomData.players[currPid];
    if (pl && $("#current-player")) {
      $("#current-player").textContent = pl.name;
    }
  }

  handleGameState(roomData.gameState);
  updatePlayersPopup();
  updateMapCountries();
}

/** Başlat butonu ve geri sayım */
function handleGameState(state) {
  const startBtn = $("#start-game-btn");
  const countdownSpan = $("#start-countdown");
  if (!state) return;

  const isHost = !!(roomData.players?.[auth.currentUser?.uid]?.isHost);

  if (state === "waiting") {
    if (isHost && !isSpectator) show(startBtn, "inline-block"); else hide(startBtn);
    hide(countdownSpan);
  } else if (state === "starting") {
    hide(startBtn);
    show(countdownSpan, "inline");
    startCountdownListener();
  } else if (state === "started") {
    hide(startBtn); hide(countdownSpan);
    if (startInterval) { clearInterval(startInterval); startInterval = null; }
  }
}

/** Host başlatır (30sn geri sayım) */
$("#start-game-btn")?.addEventListener("click", async () => {
  if (!roomData) return;
  const meHost = roomData.players?.[auth.currentUser?.uid]?.isHost;
  if (!meHost || isSpectator) return;
  if (roomData.gameState !== "waiting") return;

  const startTime = Date.now() + 30_000;
  await fdb.update(fdb.ref(db, `rooms/${currentRoomId}`), { gameState: "starting", startTime });
});

function startCountdownListener() {
  if (!roomData?.startTime) return;
  const span = $("#start-countdown");
  if (startInterval) clearInterval(startInterval);

  startInterval = setInterval(async () => {
    const now = Date.now();
    const diff = roomData.startTime - now;
    if (diff <= 0) {
      clearInterval(startInterval);
      startInterval = null;
      await fdb.update(fdb.ref(db, `rooms/${currentRoomId}`), { gameState: "started" });
      return;
    }
    if (span) span.textContent = String(Math.floor(diff / 1000));
  }, 1000);
}

/* ======================================================================
   OYUNCU PANELİ (sol popup)
   ====================================================================== */
function updatePlayersPopup() {
  const host = $("#players-info");
  if (!host) return;
  host.innerHTML = "";

  // Oyuncular
  (roomData.playerOrder || []).forEach((pid) => {
    const p = roomData.players?.[pid];
    if (!p) return;
    const card = document.createElement("div");
    card.className = "player-info";
    const flagImg = p.flag ? `<img src="${p.flag}" alt="Flag" style="max-width:40px;max-height:25px;margin-right:8px;border-radius:2px" />` : "";
    card.innerHTML = `
      <p><strong>${flagImg}${p.name}</strong></p>
      <p>Para: <span>${p.money}</span>$</p>
      <p>Asker: <span>${p.soldiers}</span></p>
      <p>Ülkeler: <span>${(p.countries && p.countries.length) || 0}</span></p>
      <p>Petrol: <span>${p.petrol}</span> varil</p>
      <p>Buğday: <span>${p.wheat}</span></p>
    `;
    host.appendChild(card);
  });

  // Seyirciler
  const watchers = roomData.watchers || {};
  const wKeys = Object.keys(watchers);
  if (wKeys.length) {
    const d = document.createElement("div");
    d.className = "player-info";
    d.innerHTML = `<p><strong>Seyirciler:</strong></p>${wKeys.map(k => `<p>- ${watchers[k].name}</p>`).join("")}`;
    host.appendChild(d);
  }
}

/* ======================================================================
   DIŞA AÇILAN YARDIMCI (3. kısımın kullanacağı)
   ====================================================================== */
window.gc.room = {
  get id() { return currentRoomId; },
  get data() { return roomData; },
  get ref() { return roomRef; },
  get isSpectator() { return isSpectator; },
  setSpectator(v){ isSpectator = !!v; }
};
/* gameLogic.mod.js — Part 3/3
   Aksiyonlar + tur mekanikleri + pakt/market/chat (Firebase v10, modüler)
*/

const { auth, db, fdb } = window.gc;

// Kısa yardımcılar
const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const show = (el, disp="flex") => el && (el.style.display = disp);
const hide = (el) => el && (el.style.display = "none");

// Oda/harita kısım-2’de expose edilmişti:
const room = window.gc.room;

// Basit Toast (HTML tarafı yoksa hızlı fallback)
function notify(msg, ms = 3000) {
  if (state.notificationsMuted) return;
  if (window.gc.toast) return window.gc.toast(msg, ms);
  let area = $("#notification-area");
  if (!area) {
    area = document.createElement("div");
    area.id = "notification-area";
    Object.assign(area.style, { position:"fixed", top:"20px", right:"20px", zIndex:3000 });
    document.body.appendChild(area);
  }
  const item = document.createElement("div");
  item.className = "notification-item";
  item.textContent = msg;
  area.appendChild(item);
  setTimeout(()=> area.contains(item) && area.removeChild(item), ms+800);
}

// Global çalışma durumu
const state = {
  turnTimer: null,
  turnRemain: 60,
  chatOpen: false,
  unread: 0,
  notificationsMuted: false,
  listenersAddedFor: null, // roomId
};

/* ================================================================
   1) TUR MEKANİĞİ
   ================================================================ */

function isMyTurn() {
  const data = room.data;
  const uid  = auth.currentUser?.uid;
  if (!data || !uid || room.isSpectator) return false;
  if (data.gameState !== "started") return false;
  const idx = data.currentTurnIndex || 0;
  return data.playerOrder?.[idx] === uid;
}
window.gc.isMyTurn = isMyTurn;

function startTurnTimer() {
  const el = $("#turn-timer");
  state.turnRemain = 60;
  if (state.turnTimer) clearInterval(state.turnTimer);
  if (el) el.textContent = state.turnRemain + "s";

  state.turnTimer = setInterval(() => {
    state.turnRemain--;
    if (el) el.textContent = (state.turnRemain <= 0 ? 0 : state.turnRemain) + "s";
    if (state.turnRemain <= 0) {
      clearInterval(state.turnTimer);
      state.turnTimer = null;
      if (room.data?.gameState === "started" && isMyTurn()) {
        nextTurn(true);
      }
    }
  }, 1000);
}
window.gc.startTurnTimer = startTurnTimer;

function stopTurnTimer() {
  if (state.turnTimer) clearInterval(state.turnTimer);
  state.turnTimer = null;
  const el = $("#turn-timer");
  if (el) el.textContent = "60s";
}
window.gc.stopTurnTimer = stopTurnTimer;

// Tur Sonu butonu
$("#end-turn-btn")?.addEventListener("click", () => {
  if (room.isSpectator) return notify("Seyirci modundasınız.");
  nextTurn(false);
});

async function nextTurn(autoEnd = false) {
  if (!isMyTurn()) return;
  stopTurnTimer();

  const data = room.data;
  const rid  = room.id;
  const idx  = data.currentTurnIndex || 0;
  const currPid = data.playerOrder[idx];
  const me = data.players?.[currPid];
  if (!me) return;

  const ups = {};

  // Tur geliri & üretimler
  if (me.countries && data.countryData) {
    let moneyGained = 0;
    let wheatGained = 0;

    me.countries.forEach((cName) => {
      const c = data.countryData[cName];
      if (!c) return;

      // Kışla => +5 asker/kışla
      if (c.barracksCount) {
        ups[`rooms/${rid}/countryData/${cName}/soldiers`] = (c.soldiers || 0) + 5 * c.barracksCount;
      }

      // Para
      let effIncome = c.income || 0;
      if (c.factories) effIncome = Math.floor(effIncome * (1 + 0.2 * c.factories));
      moneyGained += effIncome;

      // Buğday
      if (c.wheatProduction) {
        const effWheat = Math.floor(c.wheatProduction * (1 + 0.2 * (c.grainMills || 0)));
        wheatGained += effWheat;
      }
    });

    ups[`rooms/${rid}/players/${currPid}/money`] = me.money + moneyGained;
    ups[`rooms/${rid}/players/${currPid}/wheat`] = me.wheat + wheatGained;
  }

  // Sıra ilerlet
  let newIndex = idx + 1;
  let newRound = data.round || 1;
  if (newIndex >= (data.playerOrder?.length || 0)) {
    newIndex = 0; newRound++;
    ups[`rooms/${rid}/round`] = newRound;
  }
  ups[`rooms/${rid}/currentTurnIndex`] = newIndex;

  await fdb.update(fdb.ref(db), ups);

  const nextPid = data.playerOrder?.[newIndex];
  let text = `Sıra ${(data.players?.[nextPid]?.name || "?")} adlı oyuncuya geçti.`;
  if (autoEnd) text = `${me.name} süresini doldurdu! ` + text;
  broadcast(text);
  notify(text, 1500);
}

$("#exit-room-btn")?.addEventListener("click", async () => {
  const data = room.data; const rid = room.id; const uid = auth.currentUser?.uid;
  if (!data || !rid || !uid) return;
  stopTurnTimer();

  const ups = {};
  if (!room.isSpectator && data.players?.[uid]) {
    // Oyuncu olarak ayrılıyor
    const newOrder = (data.playerOrder || []).filter(id => id !== uid);

    if (isMyTurn()) {
      let idx = (data.currentTurnIndex || 0) + 1;
      let newR = data.round || 1;
      if (idx >= newOrder.length && newOrder.length > 0) { idx = 0; newR++; }
      ups[`rooms/${rid}/round`] = newR;
      ups[`rooms/${rid}/currentTurnIndex`] = newOrder.length ? idx : 0;
    }

    ups[`rooms/${rid}/playerOrder`] = newOrder;
    ups[`rooms/${rid}/players/${uid}`] = null;
    await fdb.update(fdb.ref(db), ups);
    notify("Odadan ayrıldınız.");
  } else if (room.isSpectator && data.watchers?.[uid]) {
    await fdb.set(fdb.ref(db, `rooms/${rid}/watchers/${uid}`), null);
    notify("İzlemeyi bıraktınız.");
  }

  // Güvenli çıkış — sayfayı tazelemek en garantisi
  setTimeout(() => location.reload(), 350);
});

/* ================================================================
   2) ASKER & SAVAŞ & DESTEK
   ================================================================ */

// Saldırı
$("#attack-btn")?.addEventListener("click", attack);
async function attack() {
  if (!isMyTurn()) return notify("Sıranız değil!");
  const cName = window.gc.getSelectedCountry?.();
  if (!cName) return notify("Bir ülke seçin!");
  const soldiers = parseInt($("#attack-soldiers")?.value || "0", 10);
  if (!soldiers || soldiers <= 0) return notify("Geçerli asker sayısı girin!");

  const data = room.data; const rid = room.id; const uid = auth.currentUser?.uid;
  const att = data.players?.[uid];
  const targ = data.countryData?.[cName];
  if (!att || !targ) return;

  // Petrol kontrolü (1 asker = 1 varil)
  if ((att.petrol || 0) < soldiers) return notify(`Bu saldırı için ${soldiers} varil petrol gerekli!`);

  // İlk 3 tur yalnızca sahipsiz ülke
  if ((data.round || 1) < 4 && targ.owner && targ.owner !== uid) {
    return notify("İlk 3 tur yalnızca sahipsiz ülkelere saldırabilirsiniz!");
  }

  // Pakt kontrolü
  if (targ.owner && targ.owner !== uid) {
    if (hasActivePact(uid, targ.owner)) return notify("Bu oyuncu ile saldırmazlık paktınız var!");
  }

  const ups = {};
  ups[`rooms/${rid}/players/${uid}/petrol`] = (att.petrol || 0) - soldiers;

  // Kendi ülkesine asker taşıma
  if (targ.owner === uid) {
    if ((att.soldiers || 0) < soldiers) return notify("Yeterli askeriniz yok!");
    ups[`rooms/${rid}/countryData/${cName}/soldiers`] = (targ.soldiers || 0) + soldiers;
    ups[`rooms/${rid}/players/${uid}/soldiers`] = (att.soldiers || 0) - soldiers;
    await fdb.update(fdb.ref(db), ups);
    immediateOilReward(uid);
    broadcast(`Kendi ülkesine asker taşıdı: ${att.name}`);
    notify(`${cName} ülkesine ${soldiers} asker yerleştirildi.`);
    return nextTurn();
  }

  // Normal saldırı
  if ((att.soldiers || 0) < soldiers) return notify("Yeterli askeriniz yok!");
  ups[`rooms/${rid}/players/${uid}/soldiers`] = (att.soldiers || 0) - soldiers;

  let result = "";
  let effectiveAttackers = soldiers;

  // Kale savunması
  if ((targ.castleDefenseLevel || 0) > 0) {
    const defPerc = targ.castleDefenseLevel * 5;
    const killedByCastle = Math.floor((defPerc / 100) * effectiveAttackers);
    effectiveAttackers = Math.max(0, effectiveAttackers - killedByCastle);
    result += `Kale savunması: ${killedByCastle} saldıran asker öldü. `;
  }

  if (effectiveAttackers > (targ.soldiers || 0)) {
    // FETİH
    const rem = effectiveAttackers - (targ.soldiers || 0);
    ups[`rooms/${rid}/countryData/${cName}/soldiers`] = rem;
    ups[`rooms/${rid}/countryData/${cName}/owner`]    = uid;
    ups[`rooms/${rid}/countryData/${cName}/supporters`] = {};

    // Eski sahibin listesinden çıkar
    if (targ.owner && data.players?.[targ.owner]) {
      const defC = (data.players[targ.owner].countries || []).filter(x => x !== cName);
      ups[`rooms/${rid}/players/${targ.owner}/countries`] = defC;
    }
    // Bana ekle
    const myC = new Set(att.countries || []);
    myC.add(cName);
    ups[`rooms/${rid}/players/${uid}/countries`] = Array.from(myC);
    result += `${cName} fethedildi!`;
  } else {
    // Savunuldu
    ups[`rooms/${rid}/countryData/${cName}/soldiers`] = (targ.soldiers || 0) - effectiveAttackers;
    result += `${cName} savunuldu!`;
  }

  await fdb.update(fdb.ref(db), ups);
  immediateOilReward(uid);
  broadcast(`${att.name} → ${cName}. ${result}`);
  notify(result);
  nextTurn();
}

// Saldırı sonrası anlık petrol ödülü (sahip olunan ülkelerin petrol üretimi)
async function immediateOilReward(playerId) {
  const data = room.data; const rid = room.id;
  const p = data?.players?.[playerId];
  if (!p || !p.countries) return;
  let totalOil = 0;
  p.countries.forEach((cn) => {
    const c = data.countryData?.[cn];
    if (!c?.oilProduction) return;
    const eff = Math.floor(c.oilProduction * (1 + 0.15 * (c.refineries || 0)));
    totalOil += eff;
  });
  if (totalOil > 0) {
    await fdb.set(fdb.ref(db, `rooms/${rid}/players/${playerId}/petrol`), (p.petrol || 0) + totalOil);
    notify(`Saldırı sonrası petrol: +${totalOil} varil`);
    broadcast(`${p.name}, saldırı sonrası +${totalOil} petrol kazandı!`);
  }
}

// Asker satın al
$("#buy-soldiers-btn")?.addEventListener("click", () => {
  if (room.isSpectator) return notify("Seyirci modundasınız.");
  const c = parseInt($("#soldiers-to-buy")?.value || "0", 10);
  if (!c || c <= 0) return notify("Geçerli sayı girin!");

  const data = room.data; const rid = room.id; const uid = auth.currentUser?.uid;
  const p = data.players?.[uid];
  const costM = 10 * c, costW = 25 * c;

  if (p.money < costM) return notify("Yeterli paranız yok!");
  if (p.wheat < costW) return notify("Yeterli buğdayınız yok!");

  const ups = {};
  ups[`rooms/${rid}/players/${uid}/money`]    = p.money - costM;
  ups[`rooms/${rid}/players/${uid}/wheat`]    = p.wheat - costW;
  ups[`rooms/${rid}/players/${uid}/soldiers`] = (p.soldiers || 0) + c;

  fdb.update(fdb.ref(db), ups);
  broadcast(`${p.name} ${c} asker satın aldı.`);
  notify(`${c} asker satın alındı.`);
});

// Asker çek (ülkeden/ destekten)
$("#pull-soldiers-btn")?.addEventListener("click", async () => {
  if (room.isSpectator) return notify("Seyirci modundasınız.");
  const cName = window.gc.getSelectedCountry?.();
  if (!cName) return notify("Bir ülke seçin!");
  const num = parseInt($("#pull-soldiers-count")?.value || "0", 10);
  if (!num || num <= 0) return notify("Geçerli asker sayısı girin!");

  const data = room.data; const rid = room.id; const uid = auth.currentUser?.uid;
  const p = data.players?.[uid];
  const cd = data.countryData?.[cName];
  if (!p || !cd) return;

  const ups = {};
  if (cd.owner === uid) {
    // Destek hariç çekilebilir
    let totalSup = 0; const supObj = cd.supporters || {};
    for (const sid in supObj) totalSup += supObj[sid];
    const occupant = (cd.soldiers || 0) - totalSup;
    if (occupant < num) return notify("Destek askerleri hariç bu kadar çekemezsiniz!");
    ups[`rooms/${rid}/countryData/${cName}/soldiers`] = (cd.soldiers || 0) - num;
    ups[`rooms/${rid}/players/${uid}/soldiers`]       = (p.soldiers || 0) + num;
    broadcast(`${p.name}, ${cName} ülkesinden ${num} asker çekti.`);
  } else {
    // Kendi desteğini geri çek
    const mySup = (cd.supporters?.[uid] || 0);
    if (mySup < num) return notify("Bu ülkede o kadar destek askeriniz yok!");
    if ((cd.soldiers || 0) < num) return notify("Ülkede yeterli asker yok!");

    ups[`rooms/${rid}/countryData/${cName}/soldiers`] = (cd.soldiers || 0) - num;
    const newSup = mySup - num;
    ups[`rooms/${rid}/countryData/${cName}/supporters/${uid}`] = newSup > 0 ? newSup : null;
    ups[`rooms/${rid}/players/${uid}/soldiers`] = (p.soldiers || 0) + num;
    broadcast(`${p.name}, ${cName} ülkesinden ${num} destek asker çekti.`);
  }
  await fdb.update(fdb.ref(db), ups);
  notify("Asker çekildi.");
});

// Askeri destek
$("#send-support-btn")?.addEventListener("click", async () => {
  if (room.isSpectator) return notify("Seyirci modundasınız.");

  const rec = $("#support-recipient")?.value;
  const cName = $("#support-recipient-country")?.value;
  const num = parseInt($("#support-soldiers")?.value || "0", 10);
  if (!rec || !cName || !num || num <= 0) return notify("Oyuncu, ülke ve asker sayısı geçerli olmalı!");

  const data = room.data; const rid = room.id; const uid = auth.currentUser?.uid;
  const p = data.players?.[uid];
  const tc = data.countryData?.[cName];
  if (!p || !tc) return;
  if (p.soldiers < num) return notify("Yeterli askeriniz yok!");
  if (tc.owner !== rec) return notify("Bu ülke o oyuncuya ait değil!");

  const ups = {};
  ups[`rooms/${rid}/players/${uid}/soldiers`]       = p.soldiers - num;
  ups[`rooms/${rid}/countryData/${cName}/soldiers`] = (tc.soldiers || 0) + num;
  const oldSup = tc.supporters?.[uid] || 0;
  ups[`rooms/${rid}/countryData/${cName}/supporters/${uid}`] = oldSup + num;

  await fdb.update(fdb.ref(db), ups);
  broadcast(`${p.name}, ${room.data.players[rec].name} (${cName}) ülkesine ${num} asker destek verdi.`);
  notify("Askeri destek gönderildi!");
});

/* Destek alıcı/ülke select’leri dolsun */
function updateSupportRecipientSelect() {
  const sel = $("#support-recipient");
  if (!sel) return;
  sel.innerHTML = "<option value=''>--Oyuncu Seç--</option>";
  (room.data?.playerOrder || []).forEach((pid) => {
    if (pid !== auth.currentUser?.uid && room.data.players?.[pid]) {
      const o = document.createElement("option");
      o.value = pid; o.textContent = room.data.players[pid].name;
      sel.appendChild(o);
    }
  });
}
$("#support-recipient")?.addEventListener("change", function () {
  const rec = this.value;
  const sc = $("#support-recipient-country");
  if (!sc) return;
  sc.innerHTML = "<option value=''>--Ülke Seç--</option>";
  if (!rec || !room.data?.players?.[rec]) return;
  (room.data.players[rec].countries || []).forEach((cn) => {
    const opt = document.createElement("option");
    opt.value = cn; opt.textContent = cn; sc.appendChild(opt);
  });
});

/* ================================================================
   3) KAYNAK TRANSFERİ
   ================================================================ */
$("#open-resource-btn")?.addEventListener("click", () => togglePopup("#resource-popup"));
$("#close-resource-btn")?.addEventListener("click", () => hide($("#resource-popup")));

$("#send-money-btn")?.addEventListener("click", () => sendResource("money"));
$("#send-petrol-btn")?.addEventListener("click", () => sendResource("petrol"));
$("#send-wheat-btn")?.addEventListener("click", () => sendResource("wheat"));

function updateRecipientSelects() {
  const ids = [
    "#recipient-player",
    "#recipient-player-petrol",
    "#recipient-player-wheat",
    "#private-message-recipient",
    "#pact-offer-recipient",
  ];
  ids.forEach((id) => {
    const sel = $(id); if (!sel) return;
    sel.innerHTML = id === "#private-message-recipient" ? "<option value=''>--Oyuncu Seç--</option>" : "";
    (room.data?.playerOrder || []).forEach((pid) => {
      if (pid !== auth.currentUser?.uid && room.data.players?.[pid]) {
        const o = document.createElement("option");
        o.value = pid; o.textContent = room.data.players[pid].name;
        sel.appendChild(o);
      }
    });
  });
}

async function sendResource(type) {
  if (room.isSpectator) return notify("Seyirci modundasınız.");
  const mapSel = {
    money:  ["#money-to-send",  "#recipient-player"],
    petrol: ["#petrol-to-send", "#recipient-player-petrol"],
    wheat:  ["#wheat-to-send",  "#recipient-player-wheat"],
  }[type];

  const amt = parseInt($(mapSel[0])?.value || "0", 10);
  const recId = $(mapSel[1])?.value;
  if (!amt || amt <= 0) return notify("Geçerli miktar girin!");
  if (!recId) return notify("Alıcı seçin!");

  const data = room.data; const rid = room.id; const uid = auth.currentUser?.uid;
  const me = data.players?.[uid];
  if (!me) return;

  if ((me[type] || 0) < amt) return notify(`Yeterli ${type === "money" ? "paranız" : (type === "petrol" ? "petrol" : "buğday")} yok!`);

  const ups = {};
  ups[`rooms/${rid}/players/${uid}/${type}`]    = (me[type] || 0) - amt;
  ups[`rooms/${rid}/players/${recId}/${type}`]  = (data.players[recId][type] || 0) + amt;
  await fdb.update(fdb.ref(db), ups);

  const label = type === "money" ? `${amt}$` : (type === "petrol" ? `${amt} varil petrol` : `${amt} buğday`);
  broadcast(`${me.name} → ${data.players[recId].name}: ${label}`);
  notify(`${label} gönderildi.`);
}

/* ================================================================
   4) BİNA KURMA & KALE
   ================================================================ */

$("#open-building-btn")?.addEventListener("click", () => { togglePopup("#building-popup"); updateCastleUpgradeCostUI(); });
$("#close-building-btn")?.addEventListener("click", () => hide($("#building-popup")));

$("#buy-barracks-btn")?.addEventListener("click", () => buildStructure("barracks"));
$("#build-factory-btn")?.addEventListener("click", () => buildStructure("factory"));
$("#build-refinery-btn")?.addEventListener("click", () => buildStructure("refinery"));
$("#build-grainmill-btn")?.addEventListener("click", () => buildStructure("grainmill"));
$("#build-castle-btn")?.addEventListener("click",  buildCastle);
$("#upgrade-castle-btn")?.addEventListener("click", upgradeCastle);

async function buildStructure(kind) {
  const map = {
    barracks:  { qSel:"#barracks-quantity",  path: "barracksCount", cost:{money:300, petrol:50, wheat:120} },
    factory:   { qSel:"#factory-quantity",   path: "factories",     cost:{money:500, petrol:130} },
    refinery:  { qSel:"#refinery-quantity",  path: "refineries",    cost:{money:800, petrol:250} },
    grainmill: { qSel:"#grainmill-quantity", path: "grainMills",    cost:{money:200, petrol:100} },
  }[kind];

  const cName = window.gc.getSelectedCountry?.();
  if (!cName) return notify("Bir ülke seçin!");
  const q = parseInt($(map.qSel)?.value || "0", 10);
  if (!q || q <= 0) return notify("Geçerli adet girin!");

  const data = room.data; const rid = room.id; const uid = auth.currentUser?.uid;
  const cd = data.countryData?.[cName]; const me = data.players?.[uid];
  if (!cd || cd.owner !== uid) return notify("Bu ülke size ait değil!");

  // Maliyet kontrol
  const need = {
    money: (map.cost.money || 0) * q,
    petrol:(map.cost.petrol || 0) * q,
    wheat: (map.cost.wheat  || 0) * q,
  };
  if (me.money  < need.money)  return notify("Yeterli para yok!");
  if (me.petrol < need.petrol) return notify("Yeterli petrol yok!");
  if ((map.cost.wheat||0) && me.wheat < need.wheat) return notify("Yeterli buğday yok!");

  const ups = {};
  ups[`rooms/${rid}/players/${uid}/money`]  = me.money  - need.money;
  ups[`rooms/${rid}/players/${uid}/petrol`] = me.petrol - need.petrol;
  if ((map.cost.wheat||0)) ups[`rooms/${rid}/players/${uid}/wheat`] = me.wheat - need.wheat;

  ups[`rooms/${rid}/countryData/${cName}/${map.path}`] = (cd[map.path] || 0) + q;

  await fdb.update(fdb.ref(db), ups);
  broadcast(`${me.name}, ${cName} ülkesine ${q} ${kind === "barracks" ? "kışla" : kind === "factory" ? "fabrika" : kind === "refinery" ? "rafine" : "değirmen"} kurdu!`);
  notify(`${q} adet kuruldu!`);
}

async function buildCastle() {
  const cName = window.gc.getSelectedCountry?.();
  if (!cName) return notify("Bir ülke seçin!");
  const data = room.data; const rid = room.id; const uid = auth.currentUser?.uid;
  const cd = data.countryData?.[cName]; const me = data.players?.[uid];
  if (!cd || cd.owner !== uid) return notify("Bu ülke size ait değil!");
  if ((cd.castleDefenseLevel || 0) > 0) return notify("Bu ülkede zaten kale var!");
  if (me.money < 1000 || me.petrol < 1000 || me.wheat < 1000) return notify("Kale için yeterli kaynak yok!");

  const ups = {};
  ups[`rooms/${rid}/players/${uid}/money`]  = me.money  - 1000;
  ups[`rooms/${rid}/players/${uid}/petrol`] = me.petrol - 1000;
  ups[`rooms/${rid}/players/${uid}/wheat`]  = me.wheat  - 1000;
  ups[`rooms/${rid}/countryData/${cName}/castleDefenseLevel`] = 1;
  ups[`rooms/${rid}/countryData/${cName}/castleNextUpgradeCost`] = { money:1300, petrol:1300, wheat:1300 };

  await fdb.update(fdb.ref(db), ups);
  broadcast(`${me.name}, ${cName} ülkesine kale kurdu!`);
  notify("Kale kuruldu (%5).");
  updateCastleUpgradeCostUI();
}

async function upgradeCastle() {
  const cName = window.gc.getSelectedCountry?.();
  if (!cName) return notify("Bir ülke seçin!");
  const data = room.data; const rid = room.id; const uid = auth.currentUser?.uid;
  const cd = data.countryData?.[cName]; const me = data.players?.[uid];
  if (!cd || cd.owner !== uid) return notify("Bu ülke size ait değil!");
  if ((cd.castleDefenseLevel || 0) < 1) return notify("Önce kale kurun!");
  if ((cd.castleDefenseLevel || 0) >= 6) return notify("Kale savunması %30 üstünde!");
  if (!cd.castleNextUpgradeCost) return notify("Yükseltme verisi yok!");

  const cost = cd.castleNextUpgradeCost;
  if (me.money < cost.money || me.petrol < cost.petrol || me.wheat < cost.wheat) return notify("Yeterli kaynak yok!");

  const newLvl = (cd.castleDefenseLevel || 0) + 1;
  const nm = Math.floor(cost.money * 1.3);
  const np = Math.floor(cost.petrol * 1.3);
  const nw = Math.floor(cost.wheat * 1.3);

  const ups = {};
  ups[`rooms/${rid}/players/${uid}/money`]  = me.money  - cost.money;
  ups[`rooms/${rid}/players/${uid}/petrol`] = me.petrol - cost.petrol;
  ups[`rooms/${rid}/players/${uid}/wheat`]  = me.wheat  - cost.wheat;
  ups[`rooms/${rid}/countryData/${cName}/castleDefenseLevel`] = newLvl;
  ups[`rooms/${rid}/countryData/${cName}/castleNextUpgradeCost`] = { money:nm, petrol:np, wheat:nw };

  await fdb.update(fdb.ref(db), ups);
  broadcast(`${me.name}, ${cName} kalesini güçlendirdi (Seviye ${newLvl}).`);
  notify(`Kale güçlendirildi (%${newLvl * 5}).`);
  updateCastleUpgradeCostUI();
}

// Kısım-2’de çağrılıyordu; burada tanımlayıp globale veriyoruz
function updateCastleUpgradeCostUI() {
  const span = $("#castle-upgrade-cost-text");
  if (!span) return;
  const cName = window.gc.getSelectedCountry?.();
  const cd = cName ? room.data?.countryData?.[cName] : null;
  if (!cd) { span.textContent = "-"; return; }
  if ((cd.castleDefenseLevel || 0) < 1) { span.textContent = "Önce kale kurulmalı."; return; }
  if ((cd.castleDefenseLevel || 0) >= 6) { span.textContent = "Maks seviye (%30)!"; return; }
  if (!cd.castleNextUpgradeCost) { span.textContent = "-"; return; }
  const c = cd.castleNextUpgradeCost;
  span.textContent = `${c.money}$ + ${c.petrol} Varil + ${c.wheat} Buğday`;
}
window.gc.updateCastleUpgradeCostUI = updateCastleUpgradeCostUI;

/* ================================================================
   5) PAKT SİSTEMİ
   ================================================================ */

$("#open-pact-btn")?.addEventListener("click", () => togglePopup("#pact-popup"));
$("#close-pact-btn")?.addEventListener("click", () => hide($("#pact-popup")));

$("#send-pact-offer-btn")?.addEventListener("click", async () => {
  if (!isMyTurn()) return notify("Pakt teklifini sadece kendi sıranızda yapabilirsiniz!");
  const rec = $("#pact-offer-recipient")?.value;
  const dur = parseInt($("#pact-duration")?.value || "0", 10);
  const cst = parseInt($("#pact-cost")?.value || "0", 10);
  if (!rec || rec === auth.currentUser?.uid) return notify("Geçerli bir oyuncu seçin!");
  if (!dur || dur <= 0) return notify("Geçerli tur sayısı girin!");
  if (isNaN(cst) || cst < 0) return notify("Para miktarı geçersiz!");
  if (hasActivePact(auth.currentUser.uid, rec)) return notify("Bu oyuncuyla zaten aktif pakt var!");

  const data = room.data; const rid = room.id; const me = data.players?.[auth.currentUser.uid];
  const offRef = fdb.push(fdb.ref(db, `rooms/${rid}/pactOffers`));
  await fdb.set(offRef, {
    offerId: offRef.key,
    senderId: auth.currentUser.uid,
    senderName: me?.name || "-",
    recipientId: rec,
    duration: dur,
    cost: cst,
    status: "pending"
  });

  broadcast(`Pakt Teklifi: ${me?.name} → ${room.data.players[rec].name} (Tur:${dur}, Para:${cst}$)`);
  notify("Pakt teklifi gönderildi!");
});

function hasActivePact(a, b) {
  const pacts = room.data?.pacts || {};
  const round = room.data?.round || 1;
  for (const pid in pacts) {
    const pk = pacts[pid];
    if (pk.active && round <= pk.expirationRound) {
      if ((pk.playerA === a && pk.playerB === b) || (pk.playerA === b && pk.playerB === a)) return true;
    }
  }
  return false;
}
window.gc.hasActivePact = hasActivePact;

function displayPendingPactOffers() {
  const c = $("#pact-pending-offers"); if (!c) return;
  c.innerHTML = "";
  const offers = room.data?.pactOffers || {};
  for (const k in offers) {
    const off = offers[k];
    if (off.status === "pending" && off.recipientId === auth.currentUser?.uid) {
      const d = document.createElement("div");
      d.className = "pact-offer-item"; d.dataset.offerId = off.offerId;
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
  const con = $("#active-pacts-container"); if (!con) return;
  con.innerHTML = "";
  const pacts = room.data?.pacts || {};
  const round = room.data?.round || 1;
  for (const pid in pacts) {
    const pk = pacts[pid];
    if (pk.active && round <= pk.expirationRound) {
      if (pk.playerA === auth.currentUser?.uid || pk.playerB === auth.currentUser?.uid) {
        const other = pk.playerA === auth.currentUser?.uid ? pk.playerB : pk.playerA;
        const oName = room.data.players?.[other]?.name || "???";
        const rLeft = pk.expirationRound - round + 1;
        const d = document.createElement("div");
        d.className = "active-pact-item";
        d.innerHTML = `<p>Pakt: <strong>${oName}</strong></p><p>Kalan Tur: <strong>${rLeft}</strong></p>`;
        con.appendChild(d);
      }
    }
  }
}
$("#pact-pending-offers")?.addEventListener("click", async (e) => {
  const acc = e.target.closest(".accept-btn");
  const rej = e.target.closest(".reject-btn");
  if (!acc && !rej) return;
  const oid = (acc || rej).getAttribute("data-offer-id");
  if (!oid) return;

  const data = room.data; const rid = room.id;
  const off = data?.pactOffers?.[oid];
  if (!off || off.status !== "pending") return;

  if (acc) {
    if (hasActivePact(off.senderId, off.recipientId)) {
      await fdb.update(fdb.ref(db, `rooms/${rid}/pactOffers/${oid}`), { status: "rejected" });
      return notify("Zaten aktif pakt var!");
    }
    const s = data.players?.[off.senderId];
    const r = data.players?.[off.recipientId];
    if (!s || !r) return;
    if ((s.money || 0) < off.cost) {
      await fdb.update(fdb.ref(db, `rooms/${rid}/pactOffers/${oid}`), { status: "rejected" });
      return notify("Teklifi gönderenin parası yok! Geçersiz.");
    }
    const exRound = (data.round || 1) + off.duration;
    const pkId = fdb.push(fdb.ref(db, `rooms/${rid}/pacts`)).key;

    const ups = {};
    ups[`rooms/${rid}/pactOffers/${oid}/status`]        = "accepted";
    ups[`rooms/${rid}/players/${off.senderId}/money`]   = s.money - off.cost;
    ups[`rooms/${rid}/players/${off.recipientId}/money`] = (r.money || 0) + off.cost;
    ups[`rooms/${rid}/pacts/${pkId}`] = {
      playerA: off.senderId, playerB: off.recipientId,
      active: true, cost: off.cost, duration: off.duration, expirationRound: exRound
    };
    await fdb.update(fdb.ref(db), ups);
    broadcast(`Pakt: ${s.name} & ${r.name} (Tur:${off.duration}, Para:${off.cost}$).`);
    notify("Pakt teklifi kabul edildi!");
  } else {
    await fdb.update(fdb.ref(db, `rooms/${rid}/pactOffers/${oid}`), { status: "rejected" });
    broadcast(`Pakt Reddedildi: ${off.senderName}`);
    notify("Pakt teklifi reddedildi.");
  }
});

// Seçici
function updatePactRecipientSelect() {
  const sel = $("#pact-offer-recipient"); if (!sel) return;
  sel.innerHTML = "";
  (room.data?.playerOrder || []).forEach((pid) => {
    if (pid !== auth.currentUser?.uid && room.data.players?.[pid]) {
      const o = document.createElement("option");
      o.value = pid; o.textContent = room.data.players[pid].name; sel.appendChild(o);
    }
  });
}

/* ================================================================
   6) MARKET
   ================================================================ */

$("#open-market-btn")?.addEventListener("click", () => togglePopup("#market-popup"));
$("#close-market-btn")?.addEventListener("click", () => hide($("#market-popup")));

$("#create-trade-offer-btn")?.addEventListener("click", async () => {
  if (!isMyTurn()) return notify("Sadece kendi sıranızda ticaret teklifi oluşturabilirsiniz!");
  const itemType = $("#trade-item-type")?.value;
  const qty   = parseInt($("#trade-quantity")?.value || "0", 10);
  const price = parseInt($("#trade-price")?.value || "0", 10);
  if (!qty || qty <= 0 || !price || price <= 0) return notify("Geçerli miktar/fiyat girin!");

  const data = room.data; const rid = room.id; const uid = auth.currentUser?.uid;
  const seller = data.players?.[uid]; if (!seller) return;

  let ok = false;
  if (itemType === "petrol" && (seller.petrol || 0) >= qty) ok = true;
  if (itemType === "wheat"  && (seller.wheat  || 0) >= qty) ok = true;
  if (!ok) return notify("Yeterli ürününüz yok!");

  // Ambargo listesi
  const embargoSelect = $("#embargo-players");
  const embargo = embargoSelect ? Array.from(embargoSelect.options).filter(o=>o.selected).map(o=>o.value) : [];

  const offRef = fdb.push(fdb.ref(db, `rooms/${rid}/tradeOffers`));
  await fdb.set(offRef, {
    offerId: offRef.key,
    sellerId: uid,
    sellerName: seller.name,
    itemType,
    quantity: qty,
    price,
    status: "pending",
    embargo
  });

  broadcast(`${seller.name} ticaret teklifi oluşturdu (${itemType}, adet:${qty}, fiyat:${price}$).`);
  notify("Ticaret teklifi oluşturuldu!");
});

function displayTradeOffers() {
  const div = $("#trade-offers-list"); if (!div) return;
  div.innerHTML = "";
  const offers = room.data?.tradeOffers || {};
  for (const id in offers) {
    const o = offers[id];
    if (o.status !== "pending") continue;
    if (o.embargo?.includes(auth.currentUser?.uid)) continue;

    const d = document.createElement("div");
    d.className = "offer-item";
    const label = o.itemType === "petrol" ? "Petrol" : "Buğday";

    let html = `
      <p><strong>Satıcı:</strong> ${o.sellerName}</p>
      <p><strong>Ürün:</strong> ${label}</p>
      <p><strong>Mevcut Miktar:</strong> ${o.quantity}</p>
      <p><strong>Birim Fiyat:</strong> ${o.price} $</p>
    `;
    if (o.sellerId !== auth.currentUser?.uid) {
      html += `
        <label style="font-size:14px;color:#ccc;">Almak istediğiniz miktar:</label>
        <input type="number" class="partial-buy-quantity" placeholder="Miktar" min="1" max="${o.quantity}" />
        <button class="partial-buy-btn" data-id="${o.offerId}">Satın Al</button>
      `;
    } else {
      html += `
        <button class="cancel-offer-btn" data-id="${o.offerId}" style="background:linear-gradient(45deg,#c0392b,#e74c3c);margin-top:10px;">
          İptal Et
        </button>
      `;
    }
    if (o.embargo?.length) {
      const embUsers = o.embargo.map(id => room.data.players?.[id]?.name || "???").join(", ");
      html += `<p style="color:red;"><strong>Ambargo:</strong> ${embUsers}</p>`;
    }
    d.innerHTML = html;
    div.appendChild(d);
  }
}

$("#trade-offers-list")?.addEventListener("click", async (e) => {
  const buy = e.target.closest(".partial-buy-btn");
  const cancel = e.target.closest(".cancel-offer-btn");
  if (buy) {
    const offId = buy.getAttribute("data-id");
    const wrapper = buy.closest(".offer-item");
    const inp = wrapper?.querySelector(".partial-buy-quantity");
    const amt = parseInt(inp?.value || "0", 10);
    if (!amt || amt <= 0) return notify("Geçerli miktar girin!");
    await acceptTradeOffer(offId, amt);
  } else if (cancel) {
    await cancelTradeOffer(cancel.getAttribute("data-id"));
  }
});

async function acceptTradeOffer(offId, buyAmount) {
  const data = room.data; const rid = room.id;
  const off = data?.tradeOffers?.[offId];
  if (!off || off.status !== "pending") return notify("Teklif geçerli değil!");

  const s = data.players?.[off.sellerId];
  const b = data.players?.[auth.currentUser?.uid];
  if (!s || !b) return;
  if (buyAmount > off.quantity) return notify("Teklifte yeterli stok yok!");
  const totalCost = off.price * buyAmount;
  if (b.money < totalCost) return notify("Yeterli paranız yok!");

  const ups = {};
  let hasEnough = false;
  if (off.itemType === "petrol") {
    if ((s.petrol || 0) >= buyAmount) {
      hasEnough = true;
      ups[`rooms/${rid}/players/${off.sellerId}/petrol`] = s.petrol - buyAmount;
      ups[`rooms/${rid}/players/${auth.currentUser.uid}/petrol`] = (b.petrol || 0) + buyAmount;
    }
  } else {
    if ((s.wheat || 0) >= buyAmount) {
      hasEnough = true;
      ups[`rooms/${rid}/players/${off.sellerId}/wheat`] = s.wheat - buyAmount;
      ups[`rooms/${rid}/players/${auth.currentUser.uid}/wheat`] = (b.wheat || 0) + buyAmount;
    }
  }
  if (!hasEnough) return notify("Satıcının yeterli stoğu kalmamış!");

  ups[`rooms/${rid}/players/${auth.currentUser.uid}/money`] = b.money - totalCost;
  ups[`rooms/${rid}/players/${off.sellerId}/money`]        = (s.money || 0) + totalCost;

  const newQ = off.quantity - buyAmount;
  ups[`rooms/${rid}/tradeOffers/${offId}/quantity`] = newQ;
  if (newQ <= 0) ups[`rooms/${rid}/tradeOffers/${offId}/status`] = "completed";

  await fdb.update(fdb.ref(db), ups);
  broadcast(`Ticaret: ${s.name} -> ${b.name} (${buyAmount} x ${off.itemType}).`);
  notify("Ticaret başarıyla gerçekleşti!");
}
async function cancelTradeOffer(offId) {
  const data = room.data; const rid = room.id;
  const off = data?.tradeOffers?.[offId];
  if (!off) return;
  if (off.sellerId !== auth.currentUser?.uid) return notify("Sadece kendi teklifinizi iptal edebilirsiniz!");
  if (off.status !== "pending") return notify("Bu teklif zaten tamamlandı/iptal.");
  await fdb.update(fdb.ref(db, `rooms/${rid}/tradeOffers/${offId}`), { status: "cancelled" });
  broadcast(`Ticaret teklifi iptal edildi: ${off.sellerName}`);
  notify("Teklif iptal edildi.");
}

function updateEmbargoPlayersSelect() {
  const sel = $("#embargo-players"); if (!sel) return;
  sel.innerHTML = "";
  (room.data?.playerOrder || []).forEach((pid) => {
    if (pid !== auth.currentUser?.uid && room.data.players?.[pid]) {
      const o = document.createElement("option");
      o.value = pid; o.textContent = room.data.players[pid].name; sel.appendChild(o);
    }
  });
}

/* ================================================================
   7) SOHBET & BİLDİRİMLER
   ================================================================ */

$("#open-chat-btn")?.addEventListener("click", () => toggleChat(true));
$("#close-chat-btn")?.addEventListener("click", () => toggleChat(false));

function toggleChat(showing) {
  const pop = $("#chat-popup");
  if (pop) pop.style.display = showing ? "flex" : "none";
  state.chatOpen = showing;
  if (showing) { state.unread = 0; updateChatBadge(); }
}

// Genel mesaj
$("#send-chat-btn")?.addEventListener("click", sendChatMessage);
$("#chat-input")?.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendChatMessage();
});
async function sendChatMessage() {
  if (!room.ref) return;
  const input = $("#chat-input");
  const txt = input?.value?.trim();
  if (!txt) return;
  const name = room.data?.players?.[auth.currentUser?.uid]?.name || window.gc.user?.displayName || "Anon";
  const msg = {
    sender: name,
    senderId: auth.currentUser?.uid,
    text: txt,
    recipientId: "",
    timestamp: fdb.serverTimestamp()
  };
  await fdb.push(fdb.ref(db, `rooms/${room.id}/chat`), msg);
  input.value = "";
}

// Özel mesaj
$("#send-private-message-btn")?.addEventListener("click", async () => {
  if (!room.ref) return;
  const txt = $("#private-message-input")?.value.trim();
  const rc  = $("#private-message-recipient")?.value;
  if (!txt || !rc) return;
  const name = room.data?.players?.[auth.currentUser?.uid]?.name || window.gc.user?.displayName || "Anon";
  const pm = { sender:name, senderId:auth.currentUser?.uid, text:txt, recipientId:rc, timestamp:fdb.serverTimestamp() };
  await fdb.push(fdb.ref(db, `rooms/${room.id}/chat`), pm);
  $("#private-message-input").value = "";
  notify("Özel mesaj gönderildi!");
});

function appendChatMessage(m) {
  // PM filtresi
  if (m.recipientId) {
    const me = auth.currentUser?.uid;
    if (m.senderId !== me && m.recipientId !== me) return;
  }
  const chatDiv = $("#chat-messages"); if (!chatDiv) return;
  const d = document.createElement("div");
  if (m.recipientId) {
    const targName = room.data?.players?.[m.recipientId]?.name || "???";
    if (m.senderId === auth.currentUser?.uid) {
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

  if (!state.chatOpen && m.senderId !== auth.currentUser?.uid) {
    state.unread++; updateChatBadge();
  }
}
function updateChatBadge() {
  const btn = $("#open-chat-btn");
  if (!btn) return;
  if (state.unread > 0) btn.setAttribute("data-badge", state.unread);
  else btn.removeAttribute("data-badge");
}

// Bildirim mute tuşu
$("#open-notifications-btn")?.addEventListener("click", () => {
  state.notificationsMuted = !state.notificationsMuted;
  notify(state.notificationsMuted ? "Bildirimler kapatıldı." : "Bildirimler açıldı.");
});

// Sunucuya duyur
function broadcast(text) {
  if (!room.id) return;
  fdb.push(fdb.ref(db, `rooms/${room.id}/notifications`), {
    text, timestamp: fdb.serverTimestamp()
  });
}

// Dinleyicileri 1 kez kur
async function ensureRealtimeListeners() {
  if (!room.id || state.listenersAddedFor === room.id) return;
  // Chat
  if (fdb.onChildAdded) {
    fdb.onChildAdded(fdb.ref(db, `rooms/${room.id}/chat`), (snap) => {
      const m = snap.val(); if (m) appendChatMessage(m);
    });
  } else {
    // Fallback: tümünü al, diff’le
    let seen = new Set();
    fdb.onValue(fdb.ref(db, `rooms/${room.id}/chat`), (snap) => {
      const all = snap.val() || {};
      Object.keys(all).forEach(k => {
        if (seen.has(k)) return; seen.add(k);
        appendChatMessage(all[k]);
      });
    });
  }
  // Notifications
  if (fdb.onChildAdded) {
    fdb.onChildAdded(fdb.ref(db, `rooms/${room.id}/notifications`), (snap) => {
      const n = snap.val(); if (n?.text) notify(n.text, 6500);
    });
  } else {
    let seenN = new Set();
    fdb.onValue(fdb.ref(db, `rooms/${room.id}/notifications`), (snap) => {
      const all = snap.val() || {};
      Object.keys(all).forEach(k => {
        if (seenN.has(k)) return; seenN.add(k);
        const n = all[k]; if (n?.text) notify(n.text, 6500);
      });
    });
  }
  state.listenersAddedFor = room.id;
}

// Periyodik olarak oda değiştiğinde UI/seçici/timer güncelle
function bindRoomLiveUi() {
  if (!room.id || !room.data) return;
  // Seçiciler
  updateRecipientSelects();
  updateSupportRecipientSelect();
  updatePactRecipientSelect();
  updateEmbargoPlayersSelect();
  displayPendingPactOffers();
  displayActivePacts();
  displayTradeOffers();

  // Oyun başladıysa timer (kısım-2’de de çağrılıyor; iki taraf da aynı davranışı sağlar)
  if (room.data.gameState === "started") {
    if (isMyTurn()) startTurnTimer(); else stopTurnTimer();
  } else {
    stopTurnTimer();
  }
  // Realtime dinleyiciler
  ensureRealtimeListeners();
}

// Oyuncular popup
$("#open-players-btn")?.addEventListener("click", () => togglePopup("#players-popup"));
$("#close-players-btn")?.addEventListener("click", () => hide($("#players-popup")));

// Asker popup
$("#open-military-btn")?.addEventListener("click", () => {
  if (room.isSpectator) return notify("Seyirci modundasınız.");
  togglePopup("#military-popup");
});
$("#close-military-btn")?.addEventListener("click", () => hide($("#military-popup")));

// Pakt/Market/Chat popup butonları üstte bağlandı.

// Mini toggle helper
function togglePopup(sel) {
  const p = $(sel); if (!p) return;
  p.style.display = (p.style.display === "flex" ? "none" : "flex");
}

/* ================================================================
   8) DÖNGÜ — Oda güncellemelerini izleyip 3. kısım UI’sını taze tut
   ================================================================ */
setInterval(() => {
  // Oda bağlandıysa canlı UI senkronu yap
  if (room.id && room.data) bindRoomLiveUi();
}, 800);

