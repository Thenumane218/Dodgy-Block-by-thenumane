const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const startScreen = document.getElementById('startScreen');
const startBtn = document.getElementById('startBtn');

const btnLeft = document.getElementById('btnLeft');
const btnRight = document.getElementById('btnRight');

// --- Game State ---
let player;
let fallingBlocks = [];
let score = 0;
let gameOver = false;
let gameFrame;
let lastTime = 0; 
let blockSpawnTimer = 0; 

// --- Hardware Input State ---
const keys = {};
let tiltGamma = 0; 
let touchingLeft = false;
let touchingRight = false;

// --- Configuration ---
const PLAYER_SPEED = 400; 
const BLOCK_SIZE = 25;
const BASE_SPAWN_RATE_MS = 800; 
const MIN_SPAWN_RATE_MS = 200; 
const SCORE_INCREMENT_PER_SEC = 10; 

// --- Keyboard Listeners & State Management ---
document.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    
    // Added 'Enter' to the array of keys that prevent default browser behavior
    if (['ArrowLeft', 'ArrowRight', 'Space', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'Enter'].includes(e.code)) {
        e.preventDefault();
    }
    
    // GLOBAL ENTER KEY INTERCEPT: Boot the game if the start screen is visible
    if (e.code === 'Enter' && startScreen.style.display !== 'none') {
        startBtn.click(); 
    }

    // Allow Spacebar, 'R', OR 'Enter' to restart on Game Over
    if (gameOver && (e.code === 'KeyR' || e.code === 'Space' || e.code === 'Enter')) {
        initGame(); 
    }
});

document.addEventListener('keyup', (e) => {
    keys[e.code] = false;
});

// THE ANTI-GHOSTING PROTOCOL
window.addEventListener('blur', () => {
    for (const key in keys) keys[key] = false;
    touchingLeft = false;
    touchingRight = false;
});
document.addEventListener('keyup', (e) => keys[e.code] = false);

// --- EXPLICIT UI BUTTON LISTENERS ---
if (btnLeft && btnRight) {
    const pressLeft = (e) => { e.preventDefault(); touchingLeft = true; btnLeft.classList.add('active'); };
    const releaseLeft = (e) => { e.preventDefault(); touchingLeft = false; btnLeft.classList.remove('active'); };

    const pressRight = (e) => { e.preventDefault(); touchingRight = true; btnRight.classList.add('active'); };
    const releaseRight = (e) => { e.preventDefault(); touchingRight = false; btnRight.classList.remove('active'); };

    btnLeft.addEventListener('touchstart', pressLeft, {passive: false});
    btnLeft.addEventListener('touchend', releaseLeft, {passive: false});
    btnLeft.addEventListener('mousedown', pressLeft);
    btnLeft.addEventListener('mouseup', releaseLeft);
    btnLeft.addEventListener('mouseleave', releaseLeft); 

    btnRight.addEventListener('touchstart', pressRight, {passive: false});
    btnRight.addEventListener('touchend', releaseRight, {passive: false});
    btnRight.addEventListener('mousedown', pressRight);
    btnRight.addEventListener('mouseup', releaseRight);
    btnRight.addEventListener('mouseleave', releaseRight);
} else {
    console.warn("Mobile UI buttons not found in DOM. Defaulting to keyboard/tilt only.");
}

// --- UNIVERSAL REBOOT LISTENER (The Missing Piece) ---
const handleReboot = (e) => {
    // Prevent restarting if the user accidentally clicks a UI button
    if (gameOver && e.target.tagName !== 'BUTTON') {
        initGame();
    }
};
document.body.addEventListener('touchstart', handleReboot, { passive: false });
document.body.addEventListener('click', handleReboot);

// --- Sensor Boot ---
startBtn.addEventListener('click', () => {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') window.addEventListener('deviceorientation', handleOrientation);
                bootGame(); 
            })
            .catch(() => bootGame());
    } else {
        window.addEventListener('deviceorientation', handleOrientation);
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
        this.x = (canvas.width - this.width) / 2;
        this.y = canvas.height - this.height - 20;
        this.speed = PLAYER_SPEED;
        this.color = '#00bcd4';
    }
    
    update(dt) {
        let velocity = 0;

        if (keys['ArrowLeft'] || touchingLeft) velocity = -this.speed;
        else if (keys['ArrowRight'] || touchingRight) velocity = this.speed;
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
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
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
        this.startX = x; 
        this.timeAlive = 0;

        if (this.type === 'normal') this.color = '#ff9800'; 
        else if (this.type === 'wobbler') this.color = '#9c27b0'; 
        else if (this.type === 'chaser') this.color = '#f44336'; 
    }
    
    update(dt) {
        this.y += this.speed * dt;
        this.timeAlive += dt;

        if (this.type === 'wobbler') {
            this.x = this.startX + Math.sin(this.timeAlive * 4) * 50;
        } else if (this.type === 'chaser') {
            const chaseSpeed = this.speed * 0.4;
            if (this.x + this.width/2 < player.x + player.width/2) this.x += chaseSpeed * dt;
            else if (this.x + this.width/2 > player.x + player.width/2) this.x -= chaseSpeed * dt;
        }
    }
    
    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }
}

function bootGame() {
    startScreen.style.display = 'none'; 
    initGame();
}

function initGame() {
    player = new Player();
    fallingBlocks = [];
    score = 0;
    gameOver = false;
    blockSpawnTimer = 0;
    tiltGamma = 0; 
    touchingLeft = false;
    touchingRight = false;
    lastTime = performance.now(); 
    
    for (const key in keys) keys[key] = false;
    if (btnLeft && btnRight) {
        btnLeft.classList.remove('active');
        btnRight.classList.remove('active');
    }

    if (gameFrame) cancelAnimationFrame(gameFrame);
    gameLoop(performance.now());
}

function spawnBlock() {
    const difficultyScalar = 1 + (score / 100); 
    const x = Math.random() * (canvas.width - BLOCK_SIZE);
    const speed = (150 + Math.random() * 150) * difficultyScalar;

    let type = 'normal';
    const roll = Math.random();

    if (score > 50 && roll > 0.6) type = 'wobbler'; 
    if (score > 120 && roll > 0.8) type = 'chaser'; 

    fallingBlocks.push(new Block(x, -BLOCK_SIZE, speed, type));
}

function update(dt) {
    if (gameOver) return;

    player.update(dt);

    const difficultyScalar = 1 + (score / 150);
    let currentSpawnRate = BASE_SPAWN_RATE_MS / difficultyScalar;
    currentSpawnRate = Math.max(MIN_SPAWN_RATE_MS, currentSpawnRate); 

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
            return; 
        }

        if (block.y > canvas.height) fallingBlocks.splice(i, 1);
    }

    score += SCORE_INCREMENT_PER_SEC * dt;
}

function checkCollision(rect1, rect2) {
    const leniency = 4; 
    return rect1.x + leniency < rect2.x + rect2.width &&
           rect1.x + rect1.width - leniency > rect2.x &&
           rect1.y + leniency < rect2.y + rect2.height &&
           rect1.y + rect1.height - leniency > rect2.y;
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    player.draw(ctx);
    for (const block of fallingBlocks) block.draw(ctx);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = 'bold 20px Consolas, monospace';
    ctx.fillText(`SCORE: ${Math.floor(score)}`, 15, 30);

    if (gameOver) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#f44336';
        ctx.font = 'bold 40px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('CRITICAL HIT', canvas.width / 2, canvas.height / 2 - 20);
        
        ctx.fillStyle = '#eee';
        ctx.font = '20px Consolas, monospace';
        ctx.fillText(`Data Survived: ${Math.floor(score)} mb`, canvas.width / 2, canvas.height / 2 + 20);
        
        ctx.fillStyle = '#00bcd4';
        ctx.font = '16px Consolas, monospace';
        ctx.fillText("[ TAP SCREEN TO REBOOT ]", canvas.width / 2, canvas.height / 2 + 70);
        ctx.textAlign = 'left'; 
    }
}

function gameLoop(timestamp) {
    let dt = (timestamp - lastTime) / 1000; 
    if (dt > 0.1) dt = 0.1; 
    lastTime = timestamp;

    update(dt);
    draw();

    if (!gameOver) gameFrame = requestAnimationFrame(gameLoop);
}