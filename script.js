// --- Supabase Hybrid Initialization ---
// This checks if we are running locally (config.js) or on a server (Env Vars)
const SUPABASE_URL = window.SUPABASE_URL || (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : null);
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || (typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : null);

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("CRITICAL ERROR: Database credentials not found. System offline.");
}

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- DOM References ---
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const startScreen = document.getElementById("startScreen");
const startBtn = document.getElementById("startBtn");
const usernameInput = document.getElementById("usernameInput");

const btnLeft = document.getElementById("btnLeft");
const btnRight = document.getElementById("btnRight");

const leaderboardScreen = document.getElementById("leaderboardScreen");
const showLeaderboardBtn = document.getElementById("showLeaderboardBtn");
const closeLeaderboardBtn = document.getElementById("closeLeaderboardBtn");
const leaderboardData = document.getElementById("leaderboardData");

const gameOverScreen = document.getElementById("gameOverScreen");
const finalScoreText = document.getElementById("finalScoreText");
const rebootBtn = document.getElementById("rebootBtn");
const mainMenuBtn = document.getElementById("mainMenuBtn");

// --- User Management ---
let currentUsername = localStorage.getItem("godmode_callsign") || "";
if (currentUsername) usernameInput.value = currentUsername;

function validateAndSetUser() {
  const rawName = usernameInput.value.trim().toUpperCase();
  if (rawName.length < 3) {
    alert("Callsign must be at least 3 characters.");
    return false;
  }
  currentUsername = rawName;
  localStorage.setItem("godmode_callsign", currentUsername);
  return true;
}

// --- Leaderboard Subsystem ---
async function submitScoreToNetwork(finalScore) {
  if (!currentUsername) return;

  const localBest = parseFloat(localStorage.getItem("godmode_best_score")) || 0;
  if (finalScore <= localBest) return;

  localStorage.setItem("godmode_best_score", finalScore);

  const { data, error } = await db
    .from("leaderboard")
    .upsert(
      { username: currentUsername, score: Math.floor(finalScore) },
      { onConflict: "username" },
    );

  if (error) console.error("Database uplink failed:", error);
}

async function fetchAndRenderLeaderboard() {
  leaderboardData.innerHTML = "Fetching secure data...";
  leaderboardScreen.style.display = "flex";

  const { data, error } = await db
    .from("leaderboard")
    .select("username, score")
    .order("score", { ascending: false })
    .limit(10);

  if (error) {
    leaderboardData.innerHTML = "Uplink Error. Cannot reach database.";
    return;
  }
  if (data.length === 0) {
    leaderboardData.innerHTML = "Network is empty. Be the first.";
    return;
  }

  leaderboardData.innerHTML = "";
  data.forEach((row, index) => {
    const div = document.createElement("div");
    div.className = "lb-row";
    if (row.username === currentUsername) div.classList.add("lb-me");
    div.innerHTML = `<span>#${index + 1} ${row.username}</span> <span>${row.score} mb</span>`;
    leaderboardData.appendChild(div);
  });
}

showLeaderboardBtn.addEventListener("click", fetchAndRenderLeaderboard);
closeLeaderboardBtn.addEventListener("click", () => {
  leaderboardScreen.style.display = "none";
});

// --- SYNTHESIZER ENGINE (Web Audio API) ---
let audioCtx;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function playTone(freq, type, duration, vol) {
  if (!audioCtx) return;
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

function sfxSpawn() {
  playTone(600, "square", 0.05, 0.05);
}

function sfxExplosion() {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(150, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(10, audioCtx.currentTime + 0.5); 

  gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5); 

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.5);
}

// --- Game State & POOLS ---
let player;
let activeBlocks = [];
let activeParticles = [];

const blockPool = [];
const particlePool = [];

let score = 0;
let gameOver = false;
let gameFrame;
let lastTime = 0;
let blockSpawnTimer = 0;
let screenShakeTime = 0;

// --- Hardware Input State ---
const keys = {};
let tiltGamma = 0;
let touchingLeft = false;
let touchingRight = false;

const PLAYER_SPEED = 400;
const BLOCK_SIZE = 25;
const BASE_SPAWN_RATE_MS = 800;
const MIN_SPAWN_RATE_MS = 200;
const SCORE_INCREMENT_PER_SEC = 10;

// --- Keyboard & Touch Listeners ---
document.addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (
    [
      "ArrowLeft",
      "ArrowRight",
      "Space",
      "KeyA",
      "KeyD",
      "KeyW",
      "KeyS",
      "Enter",
    ].includes(e.code)
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
document.addEventListener("keyup", (e) => (keys[e.code] = false));

window.addEventListener("blur", () => {
  for (const key in keys) keys[key] = false;
  touchingLeft = false;
  touchingRight = false;
});

if (btnLeft && btnRight) {
  const pressLeft = (e) => {
    e.preventDefault();
    touchingLeft = true;
    btnLeft.classList.add("active");
  };
  const releaseLeft = (e) => {
    e.preventDefault();
    touchingLeft = false;
    btnLeft.classList.remove("active");
  };
  const pressRight = (e) => {
    e.preventDefault();
    touchingRight = true;
    btnRight.classList.add("active");
  };
  const releaseRight = (e) => {
    e.preventDefault();
    touchingRight = false;
    btnRight.classList.remove("active");
  };

  btnLeft.addEventListener("touchstart", pressLeft, { passive: false });
  btnLeft.addEventListener("touchend", releaseLeft, { passive: false });
  btnLeft.addEventListener("mousedown", pressLeft);
  btnLeft.addEventListener("mouseup", releaseLeft);
  btnLeft.addEventListener("mouseleave", releaseLeft);

  btnRight.addEventListener("touchstart", pressRight, { passive: false });
  btnRight.addEventListener("touchend", releaseRight, { passive: false });
  btnRight.addEventListener("mousedown", pressRight);
  btnRight.addEventListener("mouseup", releaseRight);
  btnRight.addEventListener("mouseleave", releaseRight);
}

// --- NEW EXPLICIT UI ROUTING ---
rebootBtn.addEventListener("click", () => {
  if (gameOver) initGame();
});

mainMenuBtn.addEventListener("click", () => {
  gameOverScreen.style.display = "none";
  startScreen.style.display = "flex"; // Route back to the main menu
});

startBtn.addEventListener("click", () => {
  if (!validateAndSetUser()) return;
  initAudio(); 

  if (
    typeof DeviceOrientationEvent !== "undefined" &&
    typeof DeviceOrientationEvent.requestPermission === "function"
  ) {
    DeviceOrientationEvent.requestPermission()
      .then((permissionState) => {
        if (permissionState === "granted")
          window.addEventListener("deviceorientation", handleOrientation);
        bootGame();
      })
      .catch(() => bootGame());
  } else {
    window.addEventListener("deviceorientation", handleOrientation);
    bootGame();
  }
});

function handleOrientation(event) {
  if (event.gamma !== null) tiltGamma = event.gamma;
}

// --- Classes ---
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
    let velocity = 0;

    if (keys["ArrowLeft"] || keys["KeyA"] || touchingLeft)
      velocity = -this.speed;
    else if (keys["ArrowRight"] || keys["KeyD"] || touchingRight)
      velocity = this.speed;
    else if (tiltGamma !== 0) {
      const deadzone = 3;
      const maxTilt = 30;
      if (Math.abs(tiltGamma) > deadzone) {
        let normalizedTilt = tiltGamma / maxTilt;
        normalizedTilt = Math.max(-1, Math.min(1, normalizedTilt));
        velocity = normalizedTilt * this.speed;
      }
    }

    this.x += velocity * dt;
    this.x = Math.max(0, Math.min(canvas.width - this.width, this.x));
  }

  draw(ctx) {
    if (gameOver) return;
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x, this.y, this.width, this.height);
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

    if (this.type === "normal") this.color = "#ff9800";
    else if (this.type === "wobbler") this.color = "#9c27b0";
    else if (this.type === "chaser") this.color = "#f44336";
  }

  update(dt) {
    this.y += this.speed * dt;
    this.timeAlive += dt;

    if (this.type === "wobbler") {
      this.x = this.startX + Math.sin(this.timeAlive * 5) * 60;
    } else if (this.type === "chaser") {
      const chaseSpeed = this.speed * 0.45;
      if (this.x + this.width / 2 < player.x + player.width / 2)
        this.x += chaseSpeed * dt;
      else if (this.x + this.width / 2 > player.x + player.width / 2)
        this.x -= chaseSpeed * dt;
    }
  }

  draw(ctx) {
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x, this.y, this.width, this.height);
  }
}

class Particle {
  constructor() {}

  init(x, y, color) {
    this.x = x;
    this.y = y;
    this.size = Math.random() * 4 + 2;
    this.speedX = (Math.random() - 0.5) * 800;
    this.speedY = (Math.random() - 0.5) * 800;
    this.color = color;
    this.life = 1.0;
  }

  update(dt) {
    this.x += this.speedX * dt;
    this.y += this.speedY * dt;
    this.life -= dt * 1.5;
  }

  draw(ctx) {
    ctx.globalAlpha = Math.max(0, this.life);
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x, this.y, this.size, this.size);
    ctx.globalAlpha = 1.0;
  }
}

// --- Engine Boot & Logic ---
function bootGame() {
  startScreen.style.display = "none";
  if (!player) player = new Player();
  initGame();
}

function initGame() {
  initAudio(); 
  player.reset();
  
  // Hide the game over overlay on reboot
  gameOverScreen.style.display = "none";

  while (activeBlocks.length > 0) blockPool.push(activeBlocks.pop());
  while (activeParticles.length > 0) particlePool.push(activeParticles.pop());

  score = 0;
  gameOver = false;
  blockSpawnTimer = 0;
  screenShakeTime = 0;
  tiltGamma = 0;
  touchingLeft = false;
  touchingRight = false;
  lastTime = performance.now();

  for (const key in keys) keys[key] = false;
  if (btnLeft && btnRight) {
    btnLeft.classList.remove("active");
    btnRight.classList.remove("active");
  }

  if (gameFrame) cancelAnimationFrame(gameFrame);
  gameLoop(performance.now());
}

function spawnBlock() {
  const difficultyScalar = 1 + score / 100;
  const x = Math.random() * (canvas.width - BLOCK_SIZE);
  const speed = (150 + Math.random() * 150) * difficultyScalar;

  let type = "normal";
  const roll = Math.random();
  if (score > 50 && roll > 0.6) type = "wobbler";
  if (score > 120 && roll > 0.8) type = "chaser";

  let block = blockPool.length > 0 ? blockPool.pop() : new Block();
  block.init(x, -BLOCK_SIZE, speed, type);

  activeBlocks.push(block);
  sfxSpawn(); 
}

function triggerDeathExplosion() {
  sfxExplosion(); 
  screenShakeTime = 0.4;

  for (let i = 0; i < 40; i++) {
    let p = particlePool.length > 0 ? particlePool.pop() : new Particle();
    p.init(
      player.x + player.width / 2,
      player.y + player.height / 2,
      player.color,
    );
    activeParticles.push(p);
  }
}

function update(dt) {
  if (!gameOver) {
    player.update(dt);
    score += SCORE_INCREMENT_PER_SEC * dt;

    const difficultyScalar = 1 + score / 150;
    let currentSpawnRate = BASE_SPAWN_RATE_MS / difficultyScalar;
    currentSpawnRate = Math.max(MIN_SPAWN_RATE_MS, currentSpawnRate);

    blockSpawnTimer += dt * 1000;
    if (blockSpawnTimer > currentSpawnRate) {
      spawnBlock();
      blockSpawnTimer = 0;
    }

    for (let i = activeBlocks.length - 1; i >= 0; i--) {
      const block = activeBlocks[i];
      block.update(dt);

      if (checkCollision(player, block)) {
        gameOver = true;
        triggerDeathExplosion();
        submitScoreToNetwork(score);
        
        // Trigger DOM Overlay
        finalScoreText.innerText = `Data Survived: ${Math.floor(score)} mb`;
        gameOverScreen.style.display = "flex";
      }

      if (block.y > canvas.height) {
        blockPool.push(activeBlocks.splice(i, 1)[0]);
      }
    }
  }

  for (let i = activeParticles.length - 1; i >= 0; i--) {
    const p = activeParticles[i];
    p.update(dt);

    if (p.life <= 0) {
      particlePool.push(activeParticles.splice(i, 1)[0]);
    }
  }

  if (screenShakeTime > 0) screenShakeTime -= dt;
}

function checkCollision(rect1, rect2) {
  const leniency = 4;
  return (
    rect1.x + leniency < rect2.x + rect2.width &&
    rect1.x + rect1.width - leniency > rect2.x &&
    rect1.y + leniency < rect2.y + rect2.height &&
    rect1.y + rect1.height - leniency > rect2.y
  );
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();

  if (screenShakeTime > 0) {
    const magnitude = screenShakeTime * 20;
    const dx = (Math.random() - 0.5) * magnitude;
    const dy = (Math.random() - 0.5) * magnitude;
    ctx.translate(dx, dy);
  }

  player.draw(ctx);
  for (const block of activeBlocks) block.draw(ctx);
  for (const particle of activeParticles) particle.draw(ctx);

  ctx.restore();

  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.font = "bold 20px Consolas, monospace";
  ctx.fillText(`SCORE: ${Math.floor(score)}`, 15, 30);

  // Screen dimming effect on death (Text rendering removed, handled by DOM now)
  if (gameOver) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function gameLoop(timestamp) {
  let dt = (timestamp - lastTime) / 1000;
  if (dt > 0.1) dt = 0.1;
  lastTime = timestamp;

  update(dt);
  draw();
  gameFrame = requestAnimationFrame(gameLoop);
}