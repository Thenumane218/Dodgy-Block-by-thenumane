// --- Canvas Setup ---
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// --- Game State Variables ---
let player;
let fallingBlocks = [];
let score;
let gameOver;
let gameFrame;
let lastTime = 0;
let blockSpawnTimer = 0;

// --- Game Configuration ---
const PLAYER_SPEED = 350; // Increased base player speed to handle harder blocks
const BLOCK_SIZE = 25;
const BASE_SPAWN_RATE_MS = 800;
const MIN_SPAWN_RATE_MS = 150; // Hard cap so the game remains mathematically possible
const SCORE_INCREMENT_PER_SEC = 10;

// --- Keyboard Input Tracking ---
const keys = {};

document.addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (["ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
  if (gameOver && e.code === "KeyR") initGame();
});
document.addEventListener("keyup", (e) => (keys[e.code] = false));

// --- Classes ---
class Player {
  constructor() {
    this.width = 40;
    this.height = 20;
    this.x = (canvas.width - this.width) / 2;
    this.y = canvas.height - this.height - 15;
    this.speed = PLAYER_SPEED;
    this.color = "#00bcd4";
  }

  update(dt) {
    if (keys["ArrowLeft"]) this.x -= this.speed * dt;
    if (keys["ArrowRight"]) this.x += this.speed * dt;
    this.x = Math.max(0, Math.min(canvas.width - this.width, this.x));
  }

  draw(ctx) {
    ctx.fillStyle = this.color;
    ctx.shadowBlur = 10;
    ctx.shadowColor = this.color;
    ctx.fillRect(this.x, this.y, this.width, this.height);
    ctx.shadowBlur = 0; // Reset for performance
  }
}

class Block {
  constructor(x, y, speed, type) {
    this.width = BLOCK_SIZE;
    this.height = BLOCK_SIZE;
    this.x = x;
    this.y = y;
    this.speed = speed;
    this.type = type;
    this.startX = x; // Anchor point for Wobblers
    this.timeAlive = 0;

    // Configure appearance based on behavior type
    if (this.type === "normal") {
      this.color = "#ff9800"; // Orange
    } else if (this.type === "wobbler") {
      this.color = "#9c27b0"; // Purple
    } else if (this.type === "chaser") {
      this.color = "#f44336"; // Red
    }
  }

  update(dt) {
    this.y += this.speed * dt;
    this.timeAlive += dt;

    // --- Creative Mechanics ---
    if (this.type === "wobbler") {
      // Sine wave movement: Math.sin(time) creates smooth left/right oscillation
      const amplitude = 60; // How far it swings
      const frequency = 5; // How fast it swings
      this.x = this.startX + Math.sin(this.timeAlive * frequency) * amplitude;
    } else if (this.type === "chaser") {
      // Drift towards the player's X coordinate, but slower than the player
      const chaseSpeed = this.speed * 0.45;
      if (this.x + this.width / 2 < player.x + player.width / 2) {
        this.x += chaseSpeed * dt;
      } else if (this.x + this.width / 2 > player.x + player.width / 2) {
        this.x -= chaseSpeed * dt;
      }
    }
  }

  draw(ctx) {
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x, this.y, this.width, this.height);
  }
}

// --- Game Logic ---
function initGame() {
  player = new Player();
  fallingBlocks = [];
  score = 0;
  gameOver = false;
  blockSpawnTimer = 0;
  lastTime = performance.now();

  document.getElementById("instructions").textContent = "";
  for (const key in keys) keys[key] = false;

  if (gameFrame) cancelAnimationFrame(gameFrame);
  gameLoop(performance.now());
}

function spawnBlock() {
  // Calculate dynamic difficulty scalar based on score
  // E.g., at score 100, difficulty is 2. At 200, it's 3.
  const difficultyScalar = 1 + score / 100;

  const x = Math.random() * (canvas.width - BLOCK_SIZE);

  // Base speed scales up with difficulty
  const speed = (120 + Math.random() * 150) * difficultyScalar;

  // Determine block type via RNG and score thresholds
  let type = "normal";
  const roll = Math.random();

  if (score > 50 && roll > 0.6) {
    type = "wobbler"; // Starts appearing after score 50
  }
  if (score > 120 && roll > 0.8) {
    type = "chaser"; // Starts appearing after score 120, rarer
  }

  fallingBlocks.push(new Block(x, -BLOCK_SIZE, speed, type));
}

function update(dt) {
  if (gameOver) return;

  player.update(dt);

  // Dynamic Spawn Rate calculation
  const difficultyScalar = 1 + score / 150;
  let currentSpawnRate = BASE_SPAWN_RATE_MS / difficultyScalar;
  currentSpawnRate = Math.max(MIN_SPAWN_RATE_MS, currentSpawnRate); // Apply hard cap

  blockSpawnTimer += dt * 1000;
  if (blockSpawnTimer > currentSpawnRate) {
    spawnBlock();
    blockSpawnTimer = 0;
  }

  for (let i = fallingBlocks.length - 1; i >= 0; i--) {
    const block = fallingBlocks[i];
    block.update(dt);

    if (checkCollision(player, block)) {
      gameOver = true;
      document.getElementById("instructions").innerHTML =
        `SYSTEM FAILURE.<br>Final Score: ${Math.floor(score)}<br>Press 'R' to Reboot.`;
      return;
    }

    if (block.y > canvas.height) {
      fallingBlocks.splice(i, 1);
    }
  }

  score += SCORE_INCREMENT_PER_SEC * dt;
}

function checkCollision(rect1, rect2) {
  // Give the player a tiny bit of leniency (a slightly smaller hitbox)
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

  player.draw(ctx);
  for (const block of fallingBlocks) {
    block.draw(ctx);
  }

  // HUD
  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
  ctx.font = "bold 20px Consolas, monospace";
  ctx.fillText(`SCORE: ${Math.floor(score)}`, 15, 30);

  // Difficulty Multiplier Display
  ctx.font = "14px Consolas, monospace";
  ctx.fillStyle = "#ff9800";
  ctx.fillText(`THREAT LVL: ${(1 + score / 100).toFixed(1)}x`, 15, 50);

  if (gameOver) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#f44336";
    ctx.font = "bold 50px Consolas, monospace";
    ctx.textAlign = "center";
    ctx.fillText("CRITICAL HIT", canvas.width / 2, canvas.height / 2 - 20);

    ctx.fillStyle = "#eee";
    ctx.font = "20px Consolas, monospace";
    ctx.fillText(
      `Data Survied: ${Math.floor(score)} mb`,
      canvas.width / 2,
      canvas.height / 2 + 20,
    );

    ctx.fillStyle = "#00bcd4";
    ctx.font = "16px Consolas, monospace";
    ctx.fillText(
      "[ PRESS 'R' TO REINITIALIZE ]",
      canvas.width / 2,
      canvas.height / 2 + 60,
    );
    ctx.textAlign = "left";
  }
}

function gameLoop(timestamp) {
  let dt = (timestamp - lastTime) / 1000;
  if (dt > 0.1) dt = 0.1;
  lastTime = timestamp;

  update(dt);
  draw();

  if (!gameOver) {
    gameFrame = requestAnimationFrame(gameLoop);
  }
}

// Kickstart
initGame();
