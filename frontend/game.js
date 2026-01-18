// CHANGE THIS TO YOUR FLY.IO URL AFTER DEPLOY
const BACKEND_URL = "http://localhost:5000";

const socket = io(BACKEND_URL);

let myId = null;
let currentMatch = null;
let gamepadIndex = null;
let lastButtonState = {};

const logEl = () => document.getElementById("log");
const statusText = () => document.getElementById("statusText");
const matchArea = () => document.getElementById("matchArea");
const playerRow = () => document.getElementById("playerRow");
const opponentRow = () => document.getElementById("opponentRow");

// ---------- PARTICLE BACKGROUND ----------

const canvas = document.getElementById("bgCanvas");
const ctx = canvas.getContext("2d");
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

const particles = Array.from({ length: 120 }, () => ({
  x: Math.random() * canvas.width,
  y: Math.random() * canvas.height,
  size: Math.random() * 2 + 1,
  speedX: (Math.random() - 0.5) * 0.3,
  speedY: (Math.random() - 0.5) * 0.3,
  color: randomAccent(),
}));

function randomAccent() {
  const colors = ["#ff7a3c", "#ff3b3b", "#2dd4d4", "#1b3b8f", "#1f6b3a"];
  return colors[Math.floor(Math.random() * colors.length)];
}

function animateParticles() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles.forEach(p => {
    p.x += p.speedX;
    p.y += p.speedY;
    if (p.x < 0 || p.x > canvas.width) p.speedX *= -1;
    if (p.y < 0 || p.y > canvas.height) p.speedY *= -1;
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.floor(p.x), Math.floor(p.y), p.size, p.size);
  });
  requestAnimationFrame(animateParticles);
}
animateParticles();

// ---------- UI HELPERS ----------

function log(msg) {
  const el = document.createElement("div");
  el.textContent = msg;
  logEl().appendChild(el);
  logEl().scrollTop = logEl().scrollHeight;
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
  currentMatch = state;
  const players = state.players;
  const ids = Object.keys(players);
  if (!myId) return;

  playerRow().innerHTML = "";
  opponentRow().innerHTML = "";

  ids.forEach(id => {
    const p = players[id];
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <h2 style="font-size:13px;margin:0 0 4px;">
        ${id === myId ? "You" : "Player"} – ${p.fighter} (Team ${p.team})
      </h2>
      ${renderBar(p.hp, p.max_hp)}
      <p>HP: ${p.hp} / ${p.max_hp}</p>
      <p>${p.resource_name}: ${p.resource} / ${p.max_resource}</p>
      <p>Blocking: ${p.blocking ? "Yes" : "No"}</p>
      <p>Effects: ${p.effects.map(e => e.name).join(", ") || "None"}</p>
    `;
    if (id === myId) {
      playerRow().appendChild(card);
    } else {
      opponentRow().appendChild(card);
    }
  });
}

// ---------- SOCKET EVENTS ----------

socket.on("connected", (data) => {
  myId = data.id;
  statusText().textContent = "Connected. Choose 1v1 or 2v2.";
});

socket.on("match_start", (state) => {
  statusText().textContent = `Match started (${state.mode}).`;
  matchArea().classList.remove("hidden");
  log("Match started.");
  renderMatch(state);
});

socket.on("state_update", (state) => {
  renderMatch(state);
  checkEnd(state);
});

socket.on("opponent_left", () => {
  log("Opponent left the match.");
  statusText().textContent = "Opponent disconnected.";
});

// ---------- INPUT ----------

document.getElementById("queue1v1Btn").addEventListener("click", () => {
  socket.emit("queue_1v1");
  statusText().textContent = "Queued for 1v1...";
});

document.getElementById("queue2v2Btn").addEventListener("click", () => {
  socket.emit("queue_2v2");
  statusText().textContent = "Queued for 2v2...";
});

function sendAction(action) {
  if (!currentMatch) return;
  socket.emit("action", { action });
}

document.addEventListener("keydown", (e) => {
  if (!currentMatch) return;
  switch (e.key) {
    case "j": sendAction("LIGHT_ATTACK"); break;
    case "k": sendAction("HEAVY_ATTACK"); break;
    case "l": sendAction("BLOCK"); break;
    case "u": sendAction("ABILITY"); break;
    case "i": sendAction("ECLIPSE"); break;
  }
});

document.querySelectorAll("#mobileControls button").forEach(btn => {
  const action = btn.getAttribute("data-action");
  btn.addEventListener("click", () => sendAction(action));
  btn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    sendAction(action);
  });
});

// ---------- GAMEPAD ----------

window.addEventListener("gamepadconnected", (e) => {
  gamepadIndex = e.gamepad.index;
  log("Gamepad connected: " + e.gamepad.id);
});

window.addEventListener("gamepaddisconnected", () => {
  gamepadIndex = null;
  log("Gamepad disconnected.");
});

function pollGamepad() {
  if (gamepadIndex !== null && currentMatch) {
    const gp = navigator.getGamepads()[gamepadIndex];
    if (gp) {
      const map = [
        { idx: 0, action: "LIGHT_ATTACK" }, // A
        { idx: 2, action: "HEAVY_ATTACK" }, // X
        { idx: 1, action: "BLOCK" },        // B
        { idx: 4, action: "ABILITY" },      // LB
        { idx: 5, action: "ECLIPSE" },      // RB
      ];
      map.forEach(m => {
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

// ---------- END CHECK ----------

function checkEnd(state) {
  const players = state.players;
  const ids = Object.keys(players);
  const aliveTeams = new Set(
    ids.filter(id => players[id].hp > 0).map(id => players[id].team)
  );
  if (aliveTeams.size <= 1 && ids.length > 1) {
    const myAlive = players[myId].hp > 0;
    if (myAlive) log("Your team wins!");
    else log("Your team loses.");
  }
}
