// --- Supabase Hybrid Initialization ---
const dbUrl =
  window.SUPABASE_URL ||
  (typeof SUPABASE_URL !== "undefined" ? SUPABASE_URL : null);
const dbKey =
  window.SUPABASE_ANON_KEY ||
  (typeof SUPABASE_ANON_KEY !== "undefined" ? SUPABASE_ANON_KEY : null);

if (!dbUrl || !dbKey) {
  console.error(
    "CRITICAL ERROR: Database credentials not found. System offline.",
  );
}

const db = supabase.createClient(dbUrl, dbKey);

// --- DOM References ---
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const startScreen = document.getElementById("startScreen");
const startBtn = document.getElementById("startBtn");
const usernameInput = document.getElementById("usernameInput");
const passwordInput = document.getElementById("passwordInput");
const loginModeBtn = document.getElementById("loginModeBtn");
const registerModeBtn = document.getElementById("registerModeBtn");
const leaderboardScreen = document.getElementById("leaderboardScreen");
const showLeaderboardBtn = document.getElementById("showLeaderboardBtn");
const closeLeaderboardBtn = document.getElementById("closeLeaderboardBtn");
const leaderboardData = document.getElementById("leaderboardData");
const gameOverScreen = document.getElementById("gameOverScreen");
const finalScoreText = document.getElementById("finalScoreText");
const bestScoreText = document.getElementById("bestScoreText");
const rankText = document.getElementById("rankText");
const rebootBtn = document.getElementById("rebootBtn");
const mainMenuBtn = document.getElementById("mainMenuBtn");

// UI & Sound References
const authBox = document.getElementById("authBox");
const welcomeBox = document.getElementById("welcomeBox");
const displayUsername = document.getElementById("displayUsername");
const logoutBtn = document.getElementById("logoutBtn");
const soundToggleBtn = document.getElementById("soundToggleBtn");

// --- CANVAS SIZE FIX ---
// Enforce canvas display size via JS so no CSS rule (cached or otherwise) can
// stretch it beyond its 400x600 drawing buffer. aspect-ratio:2/3 + max-height:70vh
// in style.css was making the canvas render at ~504x756 on 1080p screens (1.26x zoom).
function enforceCanvasSize() {
  const maxH = window.innerHeight - 120; // leave room for header + mobile controls
  const scale = Math.min(1, maxH / 600, window.innerWidth / 400);
  canvas.style.width = Math.floor(400 * scale) + "px";
  canvas.style.height = Math.floor(600 * scale) + "px";
  canvas.style.maxWidth = "100vw";
  canvas.style.aspectRatio = "unset";
  canvas.style.objectFit = "unset";
  canvas.style.maxHeight = "none";
}
enforceCanvasSize();
window.addEventListener("resize", enforceCanvasSize);

// --- State Management ---
let currentUsername = localStorage.getItem("godmode_callsign") || "";
let authMode = "login";
let isMuted = localStorage.getItem("godmode_muted") === "true";
let score = 0;
let gameOver = false;
let gameFrame;
let lastTime = 0;
let blockSpawnTimer = 0;
let gameStartTime = 0;

const keys = {};
const PLAYER_SPEED = 500;
const BLOCK_SIZE = 25;
const BASE_SPAWN_RATE_MS = 1000;
const MIN_SPAWN_RATE_MS = 200;
const SCORE_INCREMENT_PER_SEC = 12;

// --- UI Logic & Timers ---

function updateResetTimer() {
  const now = new Date();
  const nextReset = new Date();
  nextReset.setHours(24, 0, 0, 0);
  const diff = nextReset - now;
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  const timerElement = document.getElementById("resetTimer");
  if (timerElement) timerElement.innerText = `${hours}H ${mins}M ${secs}S`;
}
setInterval(updateResetTimer, 1000);

function updateAuthUI() {
  if (currentUsername) {
    if (authBox) authBox.style.display = "none";
    if (welcomeBox) welcomeBox.style.display = "block";
    displayUsername.innerText = `USER: ${currentUsername}`;
    startBtn.innerText = "INITIALIZE ENGINE";
  } else {
    if (authBox) authBox.style.display = "block";
    if (welcomeBox) welcomeBox.style.display = "none";
    startBtn.innerText = "BOOT ENGINE";
  }
}

function updateSoundButtonUI() {
  if (!soundToggleBtn) return;
  soundToggleBtn.innerText = isMuted ? "SOUND: OFF" : "SOUND: ON";
  if (isMuted) soundToggleBtn.classList.add("muted");
  else soundToggleBtn.classList.remove("muted");
}

updateAuthUI();
updateSoundButtonUI();

// --- Event Listeners ---

if (loginModeBtn && registerModeBtn) {
  loginModeBtn.addEventListener("click", () => {
    authMode = "login";
    loginModeBtn.classList.add("active");
    registerModeBtn.classList.remove("active");
  });
  registerModeBtn.addEventListener("click", () => {
    authMode = "register";
    registerModeBtn.classList.add("active");
    loginModeBtn.classList.remove("active");
  });
}

soundToggleBtn.addEventListener("click", () => {
  isMuted = !isMuted;
  localStorage.setItem("godmode_muted", isMuted);
  updateSoundButtonUI();
});

logoutBtn.addEventListener("click", () => {
  currentUsername = "";
  localStorage.removeItem("godmode_callsign");
  localStorage.removeItem("godmode_best_score");
  updateAuthUI();
});

document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
    if (e.code === "Enter" && startScreen.style.display !== "none")
      startBtn.click();
    return;
  }
  keys[e.code] = true;
  if (
    ["ArrowLeft", "ArrowRight", "Space", "KeyA", "KeyD", "Enter"].includes(
      e.code,
    )
  )
    e.preventDefault();
  if (e.code === "Enter" && startScreen.style.display !== "none")
    startBtn.click();
  if (
    gameOver &&
    (e.code === "KeyR" || e.code === "Space" || e.code === "Enter")
  )
    initGame();
});

document.addEventListener("keyup", (e) => {
  if (e.target.tagName !== "INPUT") keys[e.code] = false;
});

// --- FIX: Mobile Button Controls ---
// Wire up the LEFT and RIGHT touch buttons so they set the same
// keys flags used by the keyboard handler. passive:false + preventDefault()
// prevents ghost mouse events from firing after touch, avoiding double-input.
const btnLeft = document.getElementById("btnLeft");
const btnRight = document.getElementById("btnRight");

btnLeft.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    keys["ArrowLeft"] = true;
  },
  { passive: false },
);
btnLeft.addEventListener(
  "touchend",
  (e) => {
    e.preventDefault();
    keys["ArrowLeft"] = false;
  },
  { passive: false },
);
btnLeft.addEventListener(
  "touchcancel",
  (e) => {
    e.preventDefault();
    keys["ArrowLeft"] = false;
  },
  { passive: false },
);

btnRight.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    keys["ArrowRight"] = true;
  },
  { passive: false },
);
btnRight.addEventListener(
  "touchend",
  (e) => {
    e.preventDefault();
    keys["ArrowRight"] = false;
  },
  { passive: false },
);
btnRight.addEventListener(
  "touchcancel",
  (e) => {
    e.preventDefault();
    keys["ArrowRight"] = false;
  },
  { passive: false },
);

// Mouse fallback (useful for desktop testing of mobile layout)
btnLeft.addEventListener("mousedown", () => (keys["ArrowLeft"] = true));
btnLeft.addEventListener("mouseup", () => (keys["ArrowLeft"] = false));
btnLeft.addEventListener("mouseleave", () => (keys["ArrowLeft"] = false));
btnRight.addEventListener("mousedown", () => (keys["ArrowRight"] = true));
btnRight.addEventListener("mouseup", () => (keys["ArrowRight"] = false));
btnRight.addEventListener("mouseleave", () => (keys["ArrowRight"] = false));

// --- Auth & Network Logic ---

async function authenticateUser() {
  const username = usernameInput.value.trim().toUpperCase();
  const password = passwordInput.value;
  const forbidden = [
    "BITCH",
    "FUCK",
    "SHIT",
    "GAY",
    "COCK",
    "PORN",
    "ADMIN",
    "SYSTEM",
    "ROOT",
  ];

  const bannedIPsOrNames = ["QQQJJJ", "HACKERMAN"];
  if (bannedIPsOrNames.includes(username)) {
    alert("ACCOUNT TERMINATED FOR NETWORK VIOLATIONS.");
    return false;
  }

  if (forbidden.some((word) => username.includes(word))) {
    alert("PROHIBITED TERMINOLOGY.");
    return false;
  }
  if (username.length < 3) {
    alert("CALLSIGN TOO SHORT.");
    return false;
  }
  if (new Set(username).size < 2 && username.length > 3) {
    alert("REPETITIVE IDENTITY REJECTED.");
    return false;
  }
  if (password.length < 4) {
    alert("PASSWORD TOO WEAK.");
    return false;
  }

  if (authMode === "register") {
    const guestScore =
      parseFloat(localStorage.getItem("godmode_best_score")) || 0;
    const { error } = await db
      .from("leaderboard")
      .insert([
        { username, password_hash: password, score: Math.floor(guestScore) },
      ]);
    if (error) {
      alert(error.code === "23505" ? "CALLSIGN TAKEN." : "UPLINK ERROR.");
      return false;
    }
  } else {
    const { data, error } = await db
      .from("leaderboard")
      .select("*")
      .eq("username", username)
      .single();
    if (error || !data || data.password_hash !== password) {
      alert("INVALID CREDENTIALS.");
      return false;
    }
    localStorage.setItem("godmode_best_score", data.score);
  }
  currentUsername = username;
  localStorage.setItem("godmode_callsign", currentUsername);
  updateAuthUI();
  return true;
}

// --- SILENT NETWORK SYNC ---
async function syncLocalScoreWithNetwork() {
  if (currentUsername) {
    const { data, error } = await db
      .from("leaderboard")
      .select("score")
      .eq("username", currentUsername)
      .single();

    if (!error && data) {
      const todayUTC = new Date().toISOString().split("T")[0];
      localStorage.setItem("godmode_daily_best", Math.floor(data.score));
      localStorage.setItem("godmode_daily_date", todayUTC);
    }
  }
}

// Call this inside your startBtn event listener, right before bootGame():
startBtn.addEventListener("click", async () => {
  if (!currentUsername) {
    if (!(await authenticateUser())) return;
  }
  initAudio();
  await syncLocalScoreWithNetwork(); // <-- ADD THIS HERE
  bootGame();
});

async function submitScoreToNetwork(finalScore) {
  if (!currentUsername) return false;
  const roundedScore = Math.floor(finalScore);
  const duration = (performance.now() - gameStartTime) / 1000;

  // 1. Anti-Cheat
  if (roundedScore / duration > 15 && roundedScore > 50) return false;

  // 2. All-Time Record Check (For the "NEW RECORD" visual flash)
  let isAllTimeRecord = false;
  const allTimeBest = Math.floor(
    localStorage.getItem("godmode_best_score") || 0,
  );
  if (roundedScore > allTimeBest) {
    isAllTimeRecord = true;
    localStorage.setItem("godmode_best_score", roundedScore);
  }

  // 3. Daily Record Check (For the Database)
  const todayUTC = new Date().toISOString().split("T")[0];
  const savedDailyDate = localStorage.getItem("godmode_daily_date");
  let dailyBest = Math.floor(localStorage.getItem("godmode_daily_best") || 0);

  // If a new UTC day has started, reset the local daily target to 0
  if (savedDailyDate !== todayUTC) {
    dailyBest = 0;
  }

  // 4. Update the Network IF we beat TODAY'S best
  if (roundedScore > dailyBest) {
    const { error } = await db
      .from("leaderboard")
      .update({ score: roundedScore })
      .eq("username", currentUsername);

    if (!error) {
      localStorage.setItem("godmode_daily_best", roundedScore);
      localStorage.setItem("godmode_daily_date", todayUTC);
      console.log("Daily Leaderboard Updated:", roundedScore);
    }
  }

  // We only return true if they beat their ALL-TIME record to trigger the flash
  return isAllTimeRecord;
}

async function fetchAndRenderLeaderboard() {
  if (leaderboardScreen.style.display === "none") return;
  leaderboardData.innerHTML = "<div class='lb-row'>SCANNING...</div>";
  const { data, error } = await db
    .from("leaderboard")
    .select("username, score, is_verified")
    .order("score", { ascending: false })
    .limit(10);
  if (error) return;
  if (!data || data.length === 0) {
    leaderboardData.innerHTML = "<div class='lb-row'>NO UPLINKS.</div>";
    return;
  }

  leaderboardData.innerHTML = "";
  data.forEach((row, index) => {
    const div = document.createElement("div");
    div.className = `lb-row ${row.username === currentUsername ? "lb-me" : ""} ${row.is_verified ? "verified" : ""}`;
    const badge = row.is_verified
      ? `<span class="badge-verified">✓</span>`
      : "";
    div.innerHTML = `<span>#${index + 1} ${row.username}${badge}</span> <span>${row.score} mb</span>`;
    leaderboardData.appendChild(div);
  });
}

db.channel("public:leaderboard")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "leaderboard" },
    fetchAndRenderLeaderboard,
  )
  .subscribe();

async function updateGlobalRankDisplay() {
  if (!currentUsername) return;

  // Determine the score we are ranking against (Today's best)
  const todayUTC = new Date().toISOString().split("T")[0];
  const savedDailyDate = localStorage.getItem("godmode_daily_date");
  let dailyBest = 0;

  if (savedDailyDate === todayUTC) {
    dailyBest = Math.floor(localStorage.getItem("godmode_daily_best") || 0);
  }

  const { count: higherCount } = await db
    .from("leaderboard")
    .select("*", { count: "exact", head: true })
    .gt("score", dailyBest);
  const { count: totalPlayers } = await db
    .from("leaderboard")
    .select("*", { count: "exact", head: true });

  if (rankText)
    rankText.innerText = `NETWORK RANKING: #${(higherCount || 0) + 1} / ${totalPlayers || 1}`;
}

// --- Audio Engine ---
let audioCtx;
function initAudio() {
  if (!audioCtx)
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
}
function playTone(freq, type, duration, vol) {
  if (isMuted || !audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

// --- Game Engine ---
let player,
  activeBlocks = [],
  blockPool = [];

class Player {
  constructor() {
    this.width = 40;
    this.height = 20;
    this.speed = PLAYER_SPEED;
    this.color = "#00bcd4";
    this.reset();
  }
  reset() {
    this.x = (canvas.width - this.width) / 2;
    this.y = canvas.height - this.height - 20;
  }
  update(dt) {
    if (gameOver) return;
    let vel = 0;
    if (keys["ArrowLeft"] || keys["KeyA"]) vel = -this.speed;
    if (keys["ArrowRight"] || keys["KeyD"]) vel = this.speed;
    this.x += vel * dt;
    this.x = Math.max(0, Math.min(canvas.width - this.width, this.x));
  }
  draw(ctx) {
    if (!gameOver) {
      ctx.fillStyle = this.color;
      ctx.fillRect(this.x, this.y, this.width, this.height);
    }
  }
}

class Block {
  constructor() {
    this.width = BLOCK_SIZE;
    this.height = BLOCK_SIZE;
  }
  init(x, y, speed, type) {
    this.x = x;
    this.y = y;
    this.speed = speed;
    this.type = type;
    this.startX = x;
    this.timeAlive = 0;
    this.color =
      type === "normal"
        ? "#ff9800"
        : type === "wobbler"
          ? "#9c27b0"
          : "#f44336";
  }
  update(dt) {
    this.y += this.speed * dt;
    this.timeAlive += dt;
    if (this.type === "wobbler")
      this.x = this.startX + Math.sin(this.timeAlive * 5) * 60;
    else if (this.type === "chaser" && player) {
      if (this.x + this.width / 2 < player.x + player.width / 2)
        this.x += this.speed * 0.45 * dt;
      else this.x -= this.speed * 0.45 * dt;
    }
  }
  draw(ctx) {
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x, this.y, this.width, this.height);
  }
}

function bootGame() {
  startScreen.style.display = "none";
  if (!player) player = new Player();
  initGame();
}

function initGame() {
  initAudio();
  player.reset();
  gameOverScreen.style.display = "none";
  activeBlocks = [];
  score = 0;
  gameOver = false;
  blockSpawnTimer = 0;
  lastTime = performance.now();
  gameStartTime = performance.now();
  if (gameFrame) cancelAnimationFrame(gameFrame);
  gameLoop(performance.now());
}

function update(dt) {
  if (gameOver) return;
  player.update(dt);
  score += SCORE_INCREMENT_PER_SEC * dt;
  blockSpawnTimer += dt * 1000;

  // RESTORED: Block Spawning Logic
  if (
    blockSpawnTimer >
    Math.max(MIN_SPAWN_RATE_MS, BASE_SPAWN_RATE_MS / (1 + score / 150))
  ) {
    const x = Math.random() * (canvas.width - BLOCK_SIZE);
    const speed = (150 + Math.random() * 150) * (1 + score / 100);
    let type =
      score > 120 && Math.random() > 0.8
        ? "chaser"
        : score > 50 && Math.random() > 0.6
          ? "wobbler"
          : "normal";
    let b = blockPool.length > 0 ? blockPool.pop() : new Block();
    b.init(x, -BLOCK_SIZE, speed, type);
    activeBlocks.push(b);
    blockSpawnTimer = 0;
    playTone(600, "square", 0.05, 0.05);
  }

  for (let i = activeBlocks.length - 1; i >= 0; i--) {
    activeBlocks[i].update(dt);

    // FIXED: Combined Collision Detection
    if (
      activeBlocks[i].x < player.x + player.width &&
      activeBlocks[i].x + activeBlocks[i].width > player.x &&
      activeBlocks[i].y < player.y + player.height &&
      activeBlocks[i].y + activeBlocks[i].height > player.y
    ) {
      gameOver = true;
      leaderboardScreen.style.display = "none";

      const finalScore = Math.floor(score);
      finalScoreText.innerText = `DATA SURVIVED: ${finalScore} mb`;

      submitScoreToNetwork(score).then((isNewRecord) => {
        if (isNewRecord) {
          finalScoreText.innerHTML = `DATA SURVIVED: ${finalScore} mb <span class="new-record-tag">NEW RECORD!</span>`;
          playTone(880, "square", 0.2, 0.1);
          setTimeout(() => playTone(1100, "square", 0.3, 0.1), 100);
        }
        const pb = localStorage.getItem("godmode_best_score") || finalScore;
        bestScoreText.innerText = `PERSONAL BEST: ${pb} mb`;
        updateGlobalRankDisplay();
      });

      gameOverScreen.style.display = "flex";
      playTone(150, "sawtooth", 0.5, 0.3);
    }

    if (activeBlocks[i].y > canvas.height)
      blockPool.push(activeBlocks.splice(i, 1)[0]);
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  player.draw(ctx);
  activeBlocks.forEach((b) => b.draw(ctx));
  ctx.fillStyle = "white";
  ctx.font = "20px Consolas";
  ctx.fillText(`SCORE: ${Math.floor(score)}`, 15, 30);
  if (gameOver) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function gameLoop(t) {
  update(Math.min(0.1, (t - lastTime) / 1000));
  draw();
  lastTime = t;
  gameFrame = requestAnimationFrame(gameLoop);
}

startBtn.addEventListener("click", async () => {
  if (!currentUsername) {
    if (!(await authenticateUser())) return;
  }
  initAudio();
  bootGame();
});

showLeaderboardBtn.addEventListener("click", () => {
  leaderboardScreen.style.display = "flex";
  fetchAndRenderLeaderboard();
});
closeLeaderboardBtn.addEventListener(
  "click",
  () => (leaderboardScreen.style.display = "none"),
);
rebootBtn.addEventListener("click", () => {
  if (gameOver) initGame();
});
mainMenuBtn.addEventListener("click", () => {
  gameOverScreen.style.display = "none";
  startScreen.style.display = "flex";
});

document.getElementById("shareBtn").addEventListener("click", () => {
  window.open(
    `https://twitter.com/intent/tweet?text=${encodeURIComponent(`I survived ${Math.floor(score)}mb of data in #Dodgy_Block! 🕹️`)}&url=${encodeURIComponent(window.location.href)}`,
    "_blank",
  );
});
