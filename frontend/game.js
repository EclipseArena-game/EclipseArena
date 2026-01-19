// CHANGE THIS TO YOUR FLY.IO URL AFTER DEPLOY
const BACKEND_URL = "https://eclipse-backend-9ncq.onrender.com";

const socket = io(BACKEND_URL, { autoConnect: false });

let authToken = null;
let currentUser = null;
let currentBattlePass = null;
let currentCharacters = [];
let currentShopItems = [];
let currentMatch = null;
let currentEvent = null;
let currentMaps = [];
let mySocketId = null;
let gamepadIndex = null;
let lastButtonState = {};
let isAdmin = false;

const $ = (id) => document.getElementById(id);
const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => Array.from(document.querySelectorAll(sel));

function showScreen(name) {
  qsa(".screen").forEach((s) => s.classList.add("hidden"));
  $(`screen-${name}`).classList.remove("hidden");
}

function setMessage(id, msg) {
  $(id).textContent = msg || "";
}

function rarityClass(rarity) {
  if (!rarity) return "";
  const r = rarity.toLowerCase();
  if (r === "common") return "rarity-common";
  if (r === "rare") return "rarity-rare";
  if (r === "epic") return "rarity-epic";
  if (r === "legendary") return "rarity-legendary";
  if (r === "mythic") return "rarity-mythic";
  return "";
}

async function api(path, options = {}) {
  const headers = options.headers || {};
  headers["Content-Type"] = "application/json";
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

// PARTICLE BACKGROUND

const bgCanvas = document.getElementById("bgCanvas");
const bgCtx = bgCanvas.getContext("2d");
const trailCanvas = document.getElementById("trailCanvas");
const trailCtx = trailCanvas.getContext("2d");

function resizeCanvas() {
  bgCanvas.width = window.innerWidth;
  bgCanvas.height = window.innerHeight;
  trailCanvas.width = window.innerWidth;
  trailCanvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

let bgParticles = [];
let bgColors = ["#2dd4d4", "#d946ef", "#93c5fd"];

function initParticles() {
  bgParticles = Array.from({ length: 120 }, () => ({
    x: Math.random() * bgCanvas.width,
    y: Math.random() * bgCanvas.height,
    size: Math.random() * 2 + 1,
    speedX: (Math.random() - 0.5) * 0.3,
    speedY: (Math.random() - 0.5) * 0.3,
    color: bgColors[Math.floor(Math.random() * bgColors.length)],
  }));
}

function animateParticles() {
  bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
  bgParticles.forEach((p) => {
    p.x += p.speedX;
    p.y += p.speedY;
    if (p.x < 0 || p.x > bgCanvas.width) p.speedX *= -1;
    if (p.y < 0 || p.y > bgCanvas.height) p.speedY *= -1;
    bgCtx.fillStyle = p.color;
    bgCtx.fillRect(Math.floor(p.x), Math.floor(p.y), p.size, p.size);
  });
  requestAnimationFrame(animateParticles);
}
initParticles();
animateParticles();

// THEME / EVENT

function applyThemeFromEvent(eventData) {
  if (!eventData) return;
  currentEvent = eventData;

  const root = document.documentElement;
  const theme = eventData.theme || "dark";
  const palette = eventData.palette || {};

  if (theme === "dark") {
    root.style.setProperty("--bg", "#05060c");
    root.style.setProperty("--panel", "rgba(10,12,20,0.9)");
    root.style.setProperty("--panel-soft", "rgba(10,12,20,0.75)");
    root.style.setProperty("--text", "#f9fafb");
    root.style.setProperty("--text-muted", "#9ca3af");
  } else {
    root.style.setProperty("--bg", "#e5e9f0");
    root.style.setProperty("--panel", "rgba(255,255,255,0.85)");
    root.style.setProperty("--panel-soft", "rgba(255,255,255,0.7)");
    root.style.setProperty("--text", "#1f2933");
    root.style.setProperty("--text-muted", "#6b7280");
  }

  if (palette.primary) root.style.setProperty("--accent-teal", palette.primary);
  if (palette.secondary) root.style.setProperty("--accent-magenta", palette.secondary);
  if (palette.highlight) root.style.setProperty("--accent-gold", palette.highlight);
  if (palette.ice) root.style.setProperty("--accent-ice", palette.ice);

  $("event-name").textContent = `Event: ${eventData.event_name || "-"}`;
  $("event-theme-tag").textContent = theme.toUpperCase();

  if (Array.isArray(palette.background_particles) && palette.background_particles.length) {
    bgColors = palette.background_particles;
    initParticles();
  }
}

// AUTH

async function handleLogin() {
  const username = $("login-username").value.trim();
  const password = $("login-password").value.trim();
  if (!username || !password) {
    setMessage("auth-message", "Enter username and password.");
    return;
  }
  try {
    const data = await api("/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    authToken = data.token;
    currentUser = data.user;
    isAdmin = currentUser && currentUser.username === "Bogacactus" && currentUser.is_first_bogacactus;
    await loadInitialData();
    connectSocket();
    showScreen("main");
  } catch (err) {
    setMessage("auth-message", err.message || "Login failed.");
  }
}

async function handleSignup() {
  const username = $("signup-username").value.trim();
  const password = $("signup-password").value.trim();
  if (!username || !password) {
    setMessage("auth-message", "Enter username and password.");
    return;
  }
  try {
    const data = await api("/signup", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    authToken = data.token;
    currentUser = data.user;
    isAdmin = currentUser && currentUser.username === "Bogacactus" && currentUser.is_first_bogacactus;
    await loadInitialData();
    connectSocket();
    showScreen("main");
  } catch (err) {
    setMessage("auth-message", err.message || "Signup failed.");
  }
}

function handleLogout() {
  authToken = null;
  currentUser = null;
  currentBattlePass = null;
  currentCharacters = [];
  currentShopItems = [];
  currentMatch = null;
  isAdmin = false;
  socket.disconnect();
  showScreen("auth");
}

// INITIAL DATA

async function loadInitialData() {
  try {
    const me = await api("/me");
    currentUser = me.user;
    currentCharacters = me.characters || [];
    currentBattlePass = me.battlepass || null;
    currentShopItems = me.shop || [];
    currentMaps = me.maps || [];
    applyThemeFromEvent(me.event || null);
    renderMain();
    renderCharacterGrid();
    renderBattlePass();
    renderShop();
    renderMapList();
    setupAdminVisibility();
  } catch (err) {
    console.error(err);
  }
}

function setupAdminVisibility() {
  if (isAdmin) {
    $("player-admin-badge").classList.remove("hidden");
    $("admin-panel-button-wrapper").classList.remove("hidden");
  } else {
    $("player-admin-badge").classList.add("hidden");
    $("admin-panel-button-wrapper").classList.add("hidden");
  }
}

function renderMain() {
  if (!currentUser) return;
  $("player-name").textContent = currentUser.username;
  $("coins").textContent = currentUser.coins ?? 0;
  $("gems").textContent = currentUser.gems ?? 0;
  $("stars").textContent = currentUser.star_points ?? 0;

  const selected = currentCharacters.find(
    (c) => c.id === currentUser.selected_character_id
  );
  if (selected) {
    $("selected-fighter-name").textContent = selected.name;
    const rarityEl = $("selected-fighter-rarity");
    rarityEl.textContent = selected.rarity;
    rarityEl.className = `rarity-tag ${rarityClass(selected.rarity)}`;
    $("selected-fighter-stats").textContent = `HP: ${selected.hp} • DMG: ${selected.damage} • SPD: ${selected.speed}`;
  } else {
    $("selected-fighter-name").textContent = "None";
    $("selected-fighter-rarity").textContent = "-";
    $("selected-fighter-rarity").className = "rarity-tag";
    $("selected-fighter-stats").textContent = "";
  }

  if (currentBattlePass) {
    $("bp-event-name").textContent = `Event: ${currentBattlePass.event_name}`;
    const pct = Math.min(
      100,
      (currentBattlePass.xp / currentBattlePass.xp_for_next) * 100
    );
    $("bp-bar-inner").style.width = `${pct}%`;
    $("bp-level-text").textContent = `Level ${currentBattlePass.level}`;
  }
}

// CHARACTERS

function renderCharacterGrid() {
  const grid = $("character-grid");
  grid.innerHTML = "";
  currentCharacters.forEach((c) => {
    const div = document.createElement("div");
    div.className = "grid-item";
    if (!c.owned) div.classList.add("locked");
    div.innerHTML = `
      <h3>${c.name}</h3>
      <span class="rarity-tag ${rarityClass(c.rarity)}">${c.rarity}</span>
      <p>HP: ${c.hp} • DMG: ${c.damage} • SPD: ${c.speed}</p>
      <p>${c.owned ? "Owned" : `Cost: ${c.cost_coins} coins`}</p>
      <button data-id="${c.id}">
        ${c.owned ? "Select" : "Unlock"}
      </button>
    `;
    const btn = div.querySelector("button");
    btn.addEventListener("click", () => {
      if (c.owned) {
        selectCharacter(c.id);
      } else {
        unlockCharacter(c.id);
      }
    });
    grid.appendChild(div);
  });
}

async function selectCharacter(id) {
  try {
    await api("/character/select", {
      method: "POST",
      body: JSON.stringify({ character_id: id }),
    });
    currentUser.selected_character_id = id;
    renderMain();
    showScreen("main");
  } catch (err) {
    console.error(err);
  }
}

async function unlockCharacter(id) {
  try {
    const data = await api("/character/unlock", {
      method: "POST",
      body: JSON.stringify({ character_id: id }),
    });
    currentUser.coins = data.coins;
    currentCharacters = data.characters;
    renderMain();
    renderCharacterGrid();
  } catch (err) {
    console.error(err);
  }
}

// SHOP

function renderShop() {
  const grid = $("shop-grid");
  grid.innerHTML = "";
  currentShopItems.forEach((item) => {
    const div = document.createElement("div");
    div.className = "grid-item";
    div.innerHTML = `
      <h3>${item.name}</h3>
      <p>Type: ${item.type}</p>
      <p>Rarity: ${item.rarity}</p>
      <p>Cost: ${item.cost_amount} ${item.cost_currency}</p>
      <button data-id="${item.id}">Buy</button>
    `;
    div.querySelector("button").addEventListener("click", () =>
      buyShopItem(item.id)
    );
    grid.appendChild(div);
  });
}

async function buyShopItem(id) {
  try {
    const data = await api("/shop/buy", {
      method: "POST",
      body: JSON.stringify({ item_id: id }),
    });
    currentUser.coins = data.coins;
    currentUser.gems = data.gems;
    currentUser.star_points = data.star_points;
    currentCharacters = data.characters;
    renderMain();
    renderCharacterGrid();
    setMessage("shop-message", "Purchase successful.");
  } catch (err) {
    setMessage("shop-message", err.message || "Purchase failed.");
  }
}

// BATTLE PASS

function renderBattlePass() {
  const list = $("bp-list");
  list.innerHTML = "";
  if (!currentBattlePass || !currentBattlePass.levels) return;

  currentBattlePass.levels.forEach((lvl) => {
    const div = document.createElement("div");
    div.className = "bp-level";
    const claimed = lvl.claimed;
    const canClaim = lvl.can_claim;

    div.innerHTML = `
      <div class="info">
        <span>Level ${lvl.level}</span>
        <span class="reward">${lvl.reward_label}</span>
      </div>
      <div>
        ${
          claimed
            ? "<span>Claimed</span>"
            : canClaim
            ? `<button data-id="${lvl.id}">Claim</button>`
            : `<span>Locked</span>`
        }
      </div>
    `;
    const btn = div.querySelector("button");
    if (btn) {
      btn.addEventListener("click", () => claimBattlePassReward(lvl.id));
    }
    list.appendChild(div);
  });
}

async function claimBattlePassReward(id) {
  try {
    const data = await api("/battlepass/claim", {
      method: "POST",
      body: JSON.stringify({ level_id: id }),
    });
    currentUser.coins = data.coins;
    currentUser.gems = data.gems;
    currentUser.star_points = data.star_points;
    currentCharacters = data.characters;
    currentBattlePass = data.battlepass;
    renderMain();
    renderCharacterGrid();
    renderBattlePass();
    setMessage("bp-message", "Reward claimed.");
  } catch (err) {
    setMessage("bp-message", err.message || "Claim failed.");
  }
}

// MAPS

function renderMapList() {
  const list = $("map-list");
  list.innerHTML = "";
  if (!currentMaps || !currentMaps.length) {
    list.textContent = "Maps will rotate dynamically during matches.";
    return;
  }
  currentMaps.forEach((m, idx) => {
    const div = document.createElement("div");
    div.className = "bp-level";
    div.innerHTML = `
      <div class="info">
        <span>Map ${idx + 1}: ${m.name}</span>
        <span class="reward">${m.style || "Dynamic layout"}</span>
      </div>
      <div><span>${m.tagline || "Stick Fight–style arena"}</span></div>
    `;
    list.appendChild(div);
  });
}

// LEADERBOARDS

let currentLeaderboardType = "wins";
let leaderboardData = {
  wins: [],
  damage: [],
  kos: [],
  event_xp: [],
  bp: [],
  admin: [],
};

async function loadLeaderboard(type) {
  try {
    const data = await api(`/leaderboard/${type}?limit=75`);
    leaderboardData[type] = data.entries || [];
    renderLeaderboard(type);
  } catch (err) {
    console.error(err);
  }
}

function renderLeaderboard(type) {
  currentLeaderboardType = type;
  const list = $("lb-list");
  list.innerHTML = "";
  const entries = leaderboardData[type] || [];

  entries.forEach((entry, idx) => {
    const div = document.createElement("div");
    div.className = "lb-row";
    if (idx === 0) div.classList.add("top1");
    else if (idx === 1) div.classList.add("top2");
    else if (idx === 2) div.classList.add("top3");
    if (currentUser && entry.user_id === currentUser.id) {
      div.classList.add("me");
    }

    const rank = idx + 1;
    const valueLabel = entry.value_label || entry.value || 0;
    const isAdminRow = type === "admin";

    div.innerHTML = `
      <div class="lb-rank">#${rank}</div>
      <div class="lb-name">
        ${isAdminRow ? '<span class="admin-badge">ADMIN</span>' : ""}
        <span>${entry.username}</span>
      </div>
      <div class="lb-value">${valueLabel}</div>
    `;
    list.appendChild(div);
  });
}

async function showMyRank() {
  if (!currentUser) return;
  try {
    const data = await api(`/leaderboard/rank?stat=${currentLeaderboardType}`);
    const rank = data.rank;
    const value = data.value;
    const inTop = data.in_top_75;

    $("lb-my-rank-text").textContent = `Your rank: #${rank} (${value})`;

    if (inTop) {
      const rows = qsa(".lb-row");
      if (rows[rank - 1]) {
        rows[rank - 1].scrollIntoView({ behavior: "smooth", block: "center" });
        rows[rank - 1].classList.add("me");
      }
    }
  } catch (err) {
    $("lb-my-rank-text").textContent = "Rank not available.";
  }
}

// ADMIN

async function triggerQuickAdminEvent(key) {
  if (!isAdmin) return;
  try {
    await api("/admin/event/trigger", {
      method: "POST",
      body: JSON.stringify({ preset: key }),
    });
    setMessage("admin-event-message", `Triggered ${key} event.`);
  } catch (err) {
    setMessage("admin-event-message", err.message || "Failed to trigger event.");
  }
}

async function scheduleAdminEvent() {
  if (!isAdmin) return;
  const name = $("admin-event-name").value.trim();
  const theme = $("admin-event-theme").value;
  const start = $("admin-event-start").value;
  const end = $("admin-event-end").value;
  if (!name || !start || !end) {
    setMessage("admin-event-message", "Fill in all fields.");
    return;
  }
  try {
    await api("/admin/event/schedule", {
      method: "POST",
      body: JSON.stringify({ name, theme, start, end }),
    });
    setMessage("admin-event-message", "Event scheduled.");
  } catch (err) {
    setMessage("admin-event-message", err.message || "Failed to schedule event.");
  }
}

async function createCustomAdminEvent() {
  if (!isAdmin) return;
  const jsonText = $("admin-event-json").value.trim();
  if (!jsonText) {
    setMessage("admin-custom-message", "Enter JSON config.");
    return;
  }
  try {
    const config = JSON.parse(jsonText);
    await api("/admin/event/custom", {
      method: "POST",
      body: JSON.stringify({ config }),
    });
    setMessage("admin-custom-message", "Custom event created.");
  } catch (err) {
    setMessage("admin-custom-message", err.message || "Invalid JSON or failed to create.");
  }
}

// SOCKET / MATCH

function connectSocket() {
  socket.auth = { token: authToken };
  socket.connect();
}

socket.on("connect", () => {
  mySocketId = socket.id;
});

socket.on("match_start", (state) => {
  currentMatch = state;
  $("queue-status").textContent = "";
  showScreen("match");
  clearLog();
  log("Match started.");
  renderMatch(state);
  renderMap(state.map);
});

socket.on("state_update", (state) => {
  currentMatch = state;
  renderMatch(state);
  checkEnd(state);
});

socket.on("opponent_left", () => {
  log("Opponent left the match.");
});

socket.on("event_update", (eventData) => {
  applyThemeFromEvent(eventData);
});

function sendAction(action) {
  if (!currentMatch) return;
  socket.emit("action", { action });
}

$("btn-play-1v1").addEventListener("click", () => {
  socket.emit("queue_1v1");
  $("queue-status").textContent = "Queued for 1v1...";
});

$("btn-play-2v2").addEventListener("click", () => {
  socket.emit("queue_2v2");
  $("queue-status").textContent = "Queued for 2v2...";
});

// MATCH RENDERING

function clearLog() {
  $("log").innerHTML = "";
}

function log(msg) {
  const el = document.createElement("div");
  el.textContent = msg;
  $("log").appendChild(el);
  $("log").scrollTop = $("log").scrollHeight;
}

function renderBar(current, max) {
  const pct = Math.max(0, Math.min(1, current / max)) * 100;
  return `
    <div class="bar">
      <div class="bar-inner" style="width:${pct}%;"></div>
    </div>
  `;
}

function renderMatch(state) {
  const players = state.players;
  const ids = Object.keys(players);
  $("playerRow").innerHTML = "";
  $("opponentRow").innerHTML = "";

  ids.forEach((id) => {
    const p = players[id];
    const card = document.createElement("div");
    card.className = "card match-card";
    card.innerHTML = `
      <h2 style="font-size:13px;margin:0 0 4px;">
        ${id === mySocketId || p.is_me ? "You" : "Player"} – ${p.fighter} (Team ${p.team})
      </h2>
      ${renderBar(p.hp, p.max_hp)}
      <p>HP: ${p.hp} / ${p.max_hp}</p>
      <p>Eclipse: ${p.eclipse_meter ?? 0} / 100</p>
      <p>Blocking: ${p.blocking ? "Yes" : "No"} (Stamina: ${p.block_stamina ?? 0})</p>
      <p>Rounds Won: ${p.rounds_won ?? 0}</p>
    `;
    if (id === mySocketId || p.is_me) {
      $("playerRow").appendChild(card);
    } else {
      $("opponentRow").appendChild(card);
    }
  });

  renderActivePickups(state.active_pickups || []);
  renderTrailsFromState(state);
}

function checkEnd(state) {
  if (!state.finished) return;
  if (state.winning_team == null) {
    log("Round ended with no winner.");
    return;
  }
  log(`Team ${state.winning_team} wins the match!`);
}

// MAP RENDERING

const mapCanvas = $("mapCanvas");
const mapCtx = mapCanvas.getContext("2d");

function resizeMapCanvas() {
  mapCanvas.width = mapCanvas.clientWidth;
  mapCanvas.height = mapCanvas.clientHeight;
}
window.addEventListener("resize", resizeMapCanvas);
resizeMapCanvas();

function renderMap(mapState) {
  if (!mapState) {
    mapCtx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
    return;
  }
  mapCtx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);

  const theme = currentEvent?.theme || "dark";
  const platformColor = theme === "dark" ? "#1f2937" : "#cbd5e1";
  const platformEdge = theme === "dark" ? "#4b5563" : "#94a3b8";

  (mapState.platforms || []).forEach((p) => {
    const x = p.x * mapCanvas.width;
    const y = p.y * mapCanvas.height;
    const w = p.w * mapCanvas.width;
    const h = p.h * mapCanvas.height;

    mapCtx.fillStyle = platformColor;
    mapCtx.strokeStyle = platformEdge;
    mapCtx.lineWidth = 2;
    mapCtx.beginPath();
    mapCtx.roundRect(x, y, w, h, 6);
    mapCtx.fill();
    mapCtx.stroke();
  });

  (mapState.hazards || []).forEach((hz) => {
    const x = hz.x * mapCanvas.width;
    const y = hz.y * mapCanvas.height;
    const r = hz.r * Math.min(mapCanvas.width, mapCanvas.height);
    mapCtx.fillStyle = "rgba(220,38,38,0.4)";
    mapCtx.beginPath();
    mapCtx.arc(x, y, r, 0, Math.PI * 2);
    mapCtx.fill();
  });
}

// PICKUPS

function renderActivePickups(pickups) {
  const container = $("active-pickups");
  container.innerHTML = "";
  pickups.forEach((p) => {
    const div = document.createElement("div");
    div.className = "pickup-icon";
    div.title = p.type;
    div.textContent = pickupIconForType(p.type);
    container.appendChild(div);
  });
}

function pickupIconForType(type) {
  switch (type) {
    case "health": return "❤";
    case "eclipse": return "☽";
    case "damage": return "⚔";
    case "speed": return "➤";
    case "shield": return "🛡";
    case "ultimate": return "✦";
    case "event": return "★";
    default: return "?";
  }
}

// TRAILS

let trailGhosts = [];

function renderTrailsFromState(state) {
  if (!state || !state.players) return;
  trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);

  const now = performance.now();
  const newGhosts = [];

  Object.values(state.players).forEach((p) => {
    if (!p.screen_pos) return;
    const { x, y } = p.screen_pos;
    const screenX = x * window.innerWidth;
    const screenY = y * window.innerHeight;

    if (p.moving) {
      const color = trailColorForPlayer(p);
      newGhosts.push({
        x: screenX,
        y: screenY,
        color,
        created: now,
      });
    }
  });

  trailGhosts = trailGhosts.concat(newGhosts).filter((g) => now - g.created < 200);

  trailGhosts.forEach((g, idx) => {
    const age = now - g.created;
    const t = age / 200;
    const alpha = 1 - t;
    const size = 18 * (1 - t * 0.2);

    trailCtx.fillStyle = `rgba(${g.color.r},${g.color.g},${g.color.b},${alpha * 0.6})`;
    trailCtx.beginPath();
    trailCtx.arc(g.x, g.y, size, 0, Math.PI * 2);
    trailCtx.fill();

    const next = trailGhosts[idx + 1];
    if (next) {
      trailCtx.strokeStyle = `rgba(${g.color.r},${g.color.g},${g.color.b},${alpha * 0.4})`;
      trailCtx.lineWidth = 4 * (1 - t * 0.5);
      trailCtx.beginPath();
      trailCtx.moveTo(g.x, g.y);
      trailCtx.lineTo(next.x, next.y);
      trailCtx.stroke();
    }
  });
}

function trailColorForPlayer(p) {
  const rarity = (p.rarity || "common").toLowerCase();
  let base = { r: 147, g: 197, b: 253 };
  if (rarity === "rare") base = { r: 45, g: 212, b: 191 };
  else if (rarity === "epic") base = { r: 217, g: 70, b: 239 };
  else if (rarity === "legendary") base = { r: 250, g: 204, b: 21 };
  else if (rarity === "mythic") base = { r: 239, g: 68, b: 68 };

  if (currentEvent && currentEvent.theme === "dark") {
    base.g = Math.min(255, base.g + 20);
    base.b = Math.min(255, base.b + 20);
  }
  return base;
}

// INPUT

document.addEventListener("keydown", (e) => {
  if (qs("#screen-match.hidden")) return;
  switch (e.key) {
    case "j":
      sendAction("LIGHT_ATTACK");
      break;
    case "k":
      sendAction("HEAVY_ATTACK");
      break;
    case "l":
      sendAction("BLOCK");
      break;
    case "u":
      sendAction("ABILITY");
      break;
    case "i":
      sendAction("ECLIPSE");
      break;
  }
});

qsa("#mobileControls button").forEach((btn) => {
  const action = btn.getAttribute("data-action");
  btn.addEventListener("click", () => sendAction(action));
  btn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    sendAction(action);
  });
});

// GAMEPAD

window.addEventListener("gamepadconnected", (e) => {
  gamepadIndex = e.gamepad.index;
  log("Gamepad connected: " + e.gamepad.id);
});

window.addEventListener("gamepaddisconnected", () => {
  gamepadIndex = null;
  log("Gamepad disconnected.");
});

function pollGamepad() {
  if (gamepadIndex !== null && !qs("#screen-match").classList.contains("hidden")) {
    const gp = navigator.getGamepads()[gamepadIndex];
    if (gp) {
      const map = [
        { idx: 0, action: "LIGHT_ATTACK" },
        { idx: 2, action: "HEAVY_ATTACK" },
        { idx: 1, action: "BLOCK" },
        { idx: 4, action: "ABILITY" },
        { idx: 5, action: "ECLIPSE" },
      ];
      map.forEach((m) => {
        const pressed = gp.buttons[m.idx].pressed;
        const key = `b${m.idx}`;
        if (pressed && !lastButtonState[key]) {
          sendAction(m.action);
        }
        lastButtonState[key] = pressed;
      });
    }
  }
  requestAnimationFrame(pollGamepad);
}
requestAnimationFrame(pollGamepad);

// NAVIGATION

$("login-btn").addEventListener("click", handleLogin);
$("signup-btn").addEventListener("click", handleSignup);
$("btn-logout").addEventListener("click", handleLogout);

$("btn-character-select").addEventListener("click", () => {
  renderCharacterGrid();
  showScreen("characters");
});

$("btn-shop").addEventListener("click", () => {
  renderShop();
  showScreen("shop");
});

$("btn-battlepass").addEventListener("click", () => {
  renderBattlePass();
  showScreen("battlepass");
});

$("btn-maps").addEventListener("click", () => {
  renderMapList();
  showScreen("maps");
});

$("btn-leaderboards").addEventListener("click", () => {
  showScreen("leaderboards");
  setActiveLeaderboardTab("wins");
  loadLeaderboard("wins");
});

$("btn-admin-panel").addEventListener("click", () => {
  if (!isAdmin) return;
  showScreen("admin");
});

qsa(".back-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const back = btn.getAttribute("data-back");
    if (back === "main") {
      showScreen("main");
    }
  });
});

qsa(".lb-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    const type = btn.getAttribute("data-lb");
    setActiveLeaderboardTab(type);
    loadLeaderboard(type);
  });
});

function setActiveLeaderboardTab(type) {
  qsa(".lb-tab").forEach((b) => b.classList.remove("active"));
  const btn = qs(`.lb-tab[data-lb="${type}"]`);
  if (btn) btn.classList.add("active");
  currentLeaderboardType = type;
}

$("btn-show-my-rank").addEventListener("click", showMyRank);

qsa(".admin-event-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const key = btn.getAttribute("data-event");
    triggerQuickAdminEvent(key);
  });
});

$("btn-schedule-event").addEventListener("click", scheduleAdminEvent);
$("btn-create-custom-event").addEventListener("click", createCustomAdminEvent);

showScreen("auth");
