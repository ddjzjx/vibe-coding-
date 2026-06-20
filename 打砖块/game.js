const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const W = 780;
const H = 1032;
const DPR_LIMIT = 2;

const layout = {
  outer: { x: 20, y: 28, w: 740, h: 978, r: 34 },
  inner: { x: 54, y: 62, w: 672, h: 920, r: 24 },
  play: { x: 54, y: 130, w: 672, h: 580 },
  floor: { x1: 134, x2: 650, y: 948 },
  paddleY: 876,
};

const colors = {
  bg: "#10147b",
  bgDeep: "#0b106f",
  panelStroke: "rgba(120, 154, 255, 0.48)",
  ice: "#dbe9ff",
  iceDim: "#a8c3ff",
  green: "#00ff8a",
  mint: "#66ffcb",
  gray: "#b9c9ff",
  white: "#f6fbff",
  cyan: "#7db9ff",
  magenta: "#8e315d",
};

let bricks = [];
let particles = [];
let powerups = [];
let balls = [];
let score = 0;
let lives = 8;
let level = 1;
let targetsLeft = 0;
let state = "ready";
let lastTime = performance.now();
let autoTimer = 0;
let pointerActive = false;

const keys = new Set();
const paddle = {
  x: W / 2 - 57,
  y: layout.paddleY,
  w: 114,
  h: 10,
  baseW: 114,
  speed: 9,
  wideUntil: 0,
};

const uiButtons = {
  pause: { x: 508, y: 82, w: 38, h: 38 },
  mute: { x: 560, y: 82, w: 38, h: 38 },
  reset: { x: 612, y: 82, w: 42, h: 42 },
};

const POWERUP_DROP_CHANCE = 0.05;
const POWERUP_PITY_LIMIT = 10;
let powerupMisses = 0;

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, DPR_LIMIT);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rectContains(p, r) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

function roundedRect(x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function ellipse(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

function rect(x, y, x1, y1, x2, y2) {
  return x >= x1 && x <= x2 && y >= y1 && y <= y2;
}

function brickKey(x, y) {
  return `${Math.round(x)}:${Math.round(y)}`;
}

function setBrick(x, y, color, type, occupied, overwrite = false) {
  const key = brickKey(x, y);
  const index = occupied.get(key);
  if (index !== undefined) {
    if (overwrite) {
      bricks[index].color = color;
      bricks[index].type = type;
      bricks[index].target = type !== "wall";
    }
    return;
  }

  occupied.set(key, bricks.length);
  bricks.push({
    x,
    y,
    r: 2.35,
    color,
    type,
    target: type !== "wall",
    alive: true,
  });
}

function addDots(mask, color, type, occupied, overwrite = false) {
  const step = 6;
  for (let y = 130; y <= 710; y += step) {
    for (let x = 54; x <= 726; x += step) {
      if (mask(x, y)) {
        setBrick(x, y, color, type, occupied, overwrite);
      }
    }
  }
}

function wallMask(x, y) {
  return (
    rect(x, y, 54, 130, 726, 148) ||
    rect(x, y, 54, 130, 132, 710) ||
    rect(x, y, 648, 130, 726, 710) ||
    rect(x, y, 132, 694, 318, 710) ||
    rect(x, y, 438, 694, 648, 710)
  );
}

function creatureMask(x, y) {
  const solid =
    ellipse(x, y, 368, 438, 147, 151) ||
    ellipse(x, y, 304, 386, 112, 86) ||
    ellipse(x, y, 396, 522, 170, 92) ||
    rect(x, y, 180, 220, 270, 256) ||
    rect(x, y, 218, 308, 340, 356) ||
    rect(x, y, 174, 358, 318, 402) ||
    rect(x, y, 176, 428, 355, 468) ||
    rect(x, y, 166, 532, 362, 616) ||
    rect(x, y, 230, 520, 350, 642) ||
    rect(x, y, 344, 272, 396, 314) ||
    rect(x, y, 394, 310, 500, 396) ||
    rect(x, y, 480, 250, 596, 324) ||
    rect(x, y, 590, 278, 640, 362) ||
    rect(x, y, 508, 350, 602, 390) ||
    rect(x, y, 440, 434, 596, 468) ||
    rect(x, y, 486, 486, 640, 552) ||
    rect(x, y, 330, 550, 538, 616);

  const cutouts =
    ellipse(x, y, 366, 348, 28, 42) ||
    ellipse(x, y, 438, 372, 30, 39) ||
    ellipse(x, y, 330, 512, 19, 43) ||
    rect(x, y, 174, 404, 236, 424) ||
    rect(x, y, 184, 468, 242, 526) ||
    rect(x, y, 488, 392, 594, 432);

  return solid && !cutouts;
}

function shineMask(x, y) {
  return (
    ellipse(x, y, 414, 326, 24, 54) ||
    rect(x, y, 394, 286, 420, 380) ||
    ellipse(x, y, 430, 366, 22, 38)
  );
}

function generateBricks() {
  bricks = [];
  const occupied = new Map();
  addDots(wallMask, colors.ice, "wall", occupied);
  addDots(creatureMask, colors.green, "target", occupied);
  addDots(shineMask, colors.gray, "target", occupied, true);
  targetsLeft = bricks.filter((brick) => brick.target).length;
}

function resetBall() {
  balls = [
    {
      x: paddle.x + paddle.w / 2,
      y: paddle.y - 17,
      r: 5.2,
      vx: 0,
      vy: 0,
      stuck: true,
      glow: colors.white,
    },
  ];
  state = "ready";
  autoTimer = 48;
}

function resetGame() {
  score = 0;
  lives = 8;
  level = 1;
  particles = [];
  powerups = [];
  powerupMisses = 0;
  paddle.w = paddle.baseW;
  paddle.x = W / 2 - paddle.w / 2;
  paddle.wideUntil = 0;
  generateBricks();
  resetBall();
}

function nextLevel() {
  level += 1;
  particles = [];
  powerups = [];
  powerupMisses = 0;
  paddle.w = paddle.baseW;
  paddle.x = W / 2 - paddle.w / 2;
  generateBricks();
  resetBall();
  balls.forEach((ball) => {
    ball.speedBonus = Math.min(1.8, (level - 1) * 0.22);
  });
}

function launchBalls() {
  if (state !== "ready") return;
  state = "running";
  balls.forEach((ball, index) => {
    if (ball.stuck) {
      const angle = index % 2 === 0 ? -0.58 : 0.58;
      const speed = 4.7 + Math.min(1.2, (level - 1) * 0.2);
      ball.vx = Math.sin(angle) * speed;
      ball.vy = -Math.cos(angle) * speed;
      ball.stuck = false;
    }
  });
}

function togglePause() {
  if (state === "paused") {
    state = balls.some((ball) => ball.stuck) ? "ready" : "running";
    return;
  }

  if (state === "running" || state === "ready") {
    state = "paused";
  }
}

function spawnParticles(x, y, color, count = 5) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.8 + Math.random() * 2.2;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 28 + Math.random() * 18,
      maxLife: 46,
      color,
      r: 1.4 + Math.random() * 1.6,
    });
  }
}

function spawnPowerup(x, y) {
  powerups.push({
    x,
    y,
    r: 12,
    vy: 1.8,
    kind: "multi",
    spin: Math.random() * Math.PI,
  });
}

function shouldDropPowerup() {
  powerupMisses += 1;
  if (powerupMisses >= POWERUP_PITY_LIMIT || Math.random() < POWERUP_DROP_CHANCE) {
    powerupMisses = 0;
    return true;
  }
  return false;
}

function applyPowerup(kind) {
  const source = balls.find((ball) => !ball.stuck) || balls[0] || {
    x: paddle.x + paddle.w / 2,
    y: paddle.y - 24,
    vx: 2.4,
    vy: -4.2,
    r: 5.2,
  };
  const baseSpeed = clamp(Math.hypot(source.vx, source.vy) || 4.9, 4.6, 6.8);
  const created = [-0.6, 0.6].map((angle) => ({
    x: source.x,
    y: source.y,
    r: 5.2,
    vx: Math.sin(angle) * baseSpeed,
    vy: -Math.cos(angle) * baseSpeed,
    stuck: false,
    glow: colors.white,
  }));
  balls.push(...created);
  state = "running";
}

function loseBall() {
  lives -= 1;
  if (lives <= 0) {
    state = "over";
    balls = [];
  } else {
    resetBall();
  }
}

function completeLevel() {
  state = "clear";
  setTimeout(() => {
    if (state === "clear") nextLevel();
  }, 1200);
}

function updatePaddle(dt) {
  const leftBound = layout.inner.x + 80;
  const rightBound = layout.inner.x + layout.inner.w - 80;

  if (keys.has("ArrowLeft") || keys.has("KeyA")) {
    paddle.x -= paddle.speed * dt;
  }
  if (keys.has("ArrowRight") || keys.has("KeyD")) {
    paddle.x += paddle.speed * dt;
  }

  if (paddle.wideUntil && performance.now() > paddle.wideUntil) {
    const center = paddle.x + paddle.w / 2;
    paddle.w = paddle.baseW;
    paddle.x = center - paddle.w / 2;
    paddle.wideUntil = 0;
  }

  paddle.x = clamp(paddle.x, leftBound, rightBound - paddle.w);
}

function bounceFromPaddle(ball) {
  const withinX = ball.x + ball.r >= paddle.x && ball.x - ball.r <= paddle.x + paddle.w;
  const withinY = ball.y + ball.r >= paddle.y && ball.y - ball.r <= paddle.y + paddle.h;
  if (!withinX || !withinY || ball.vy <= 0) return;

  const hit = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
  const speed = clamp(Math.hypot(ball.vx, ball.vy) + 0.06, 4.4, 7.4);
  const angle = hit * 1.08;
  ball.vx = Math.sin(angle) * speed;
  ball.vy = -Math.cos(angle) * speed;
  ball.y = paddle.y - ball.r - 0.5;
}

function reflectBallFromBrick(ball, brick) {
  const dx = ball.x - brick.x;
  const dy = ball.y - brick.y;
  const distance = Math.hypot(dx, dy) || 1;
  const nx = dx / distance;
  const ny = dy / distance;
  const dot = ball.vx * nx + ball.vy * ny;

  ball.vx -= 2 * dot * nx;
  ball.vy -= 2 * dot * ny;

  const speed = clamp(Math.hypot(ball.vx, ball.vy), 3.6, 7.8);
  const normalized = Math.hypot(ball.vx, ball.vy) || 1;
  ball.vx = (ball.vx / normalized) * speed;
  ball.vy = (ball.vy / normalized) * speed;
  ball.x += nx * 1.8;
  ball.y += ny * 1.8;
}

function handleBrickCollision(ball) {
  for (const brick of bricks) {
    if (!brick.alive) continue;
    const limit = ball.r + brick.r + 0.8;
    const dx = ball.x - brick.x;
    const dy = ball.y - brick.y;
    if (dx * dx + dy * dy > limit * limit) continue;

    reflectBallFromBrick(ball, brick);

    if (brick.type === "wall") {
      spawnParticles(brick.x, brick.y, brick.color, 2);
      return;
    }

    brick.alive = false;
    spawnParticles(brick.x, brick.y, brick.color, 7);
    score += 10;
    targetsLeft -= 1;
    if (shouldDropPowerup()) spawnPowerup(brick.x, brick.y);
    if (targetsLeft <= 0) completeLevel();
    return;
  }
}

function updateBalls(dt) {
  const left = layout.inner.x + 76;
  const right = layout.inner.x + layout.inner.w - 76;
  const top = layout.play.y + 12;
  const bottom = layout.floor.y + 28;

  balls.forEach((ball) => {
    if (ball.stuck) {
      ball.x = paddle.x + paddle.w / 2;
      ball.y = paddle.y - 17;
      return;
    }

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.x - ball.r <= left) {
      ball.x = left + ball.r;
      ball.vx = Math.abs(ball.vx);
    }
    if (ball.x + ball.r >= right) {
      ball.x = right - ball.r;
      ball.vx = -Math.abs(ball.vx);
    }
    if (ball.y - ball.r <= top) {
      ball.y = top + ball.r;
      ball.vy = Math.abs(ball.vy);
    }

    bounceFromPaddle(ball);
    handleBrickCollision(ball);

    if (ball.y - ball.r > bottom) {
      ball.dead = true;
    }
  });

  balls = balls.filter((ball) => !ball.dead);
  if (state === "running" && balls.length === 0) {
    loseBall();
  }
}

function updatePowerups(dt) {
  powerups.forEach((powerup) => {
    powerup.y += powerup.vy * dt;
    powerup.spin += 0.08 * dt;

    const hitPaddle =
      powerup.x + powerup.r >= paddle.x &&
      powerup.x - powerup.r <= paddle.x + paddle.w &&
      powerup.y + powerup.r >= paddle.y &&
      powerup.y - powerup.r <= paddle.y + paddle.h + 6;

    if (hitPaddle) {
      applyPowerup(powerup.kind);
      spawnParticles(powerup.x, powerup.y, colors.cyan, 12);
      powerup.dead = true;
    }
    if (powerup.y > layout.floor.y + 34) powerup.dead = true;
  });
  powerups = powerups.filter((powerup) => !powerup.dead);
}

function updateParticles(dt) {
  particles.forEach((particle) => {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 0.025 * dt;
    particle.life -= dt;
  });
  particles = particles.filter((particle) => particle.life > 0);
}

function update(dt) {
  updatePaddle(dt);

  if (state === "ready") {
    autoTimer -= dt;
    if (autoTimer <= 0) launchBalls();
  }

  if (state === "running") {
    updateBalls(dt);
    updatePowerups(dt);
  }

  updateParticles(dt);
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, "#11178c");
  gradient.addColorStop(1, "#0b106e");
  ctx.fillStyle = gradient;
  roundedRect(layout.outer.x, layout.outer.y, layout.outer.w, layout.outer.h, layout.outer.r);
  ctx.fill();
  ctx.strokeStyle = "rgba(103, 137, 255, 0.48)";
  ctx.lineWidth = 1;
  ctx.stroke();

  const innerGradient = ctx.createLinearGradient(0, 62, 0, 982);
  innerGradient.addColorStop(0, "#111780");
  innerGradient.addColorStop(1, "#0f1476");
  ctx.fillStyle = innerGradient;
  roundedRect(layout.inner.x, layout.inner.y, layout.inner.w, layout.inner.h, layout.inner.r);
  ctx.fill();
  ctx.strokeStyle = colors.panelStroke;
  ctx.stroke();
}

function drawPill(x, y, w, h, label, active = false) {
  ctx.save();
  ctx.fillStyle = active ? "rgba(46, 88, 198, 0.92)" : "rgba(9, 18, 92, 0.78)";
  ctx.strokeStyle = active ? "rgba(106, 155, 255, 0.78)" : "rgba(123, 154, 255, 0.36)";
  ctx.lineWidth = 1;
  roundedRect(x, y, w, h, h / 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = colors.white;
  ctx.font = "700 20px 'Microsoft YaHei UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  ctx.restore();
}

function drawIconButton(button, kind, tint = "rgba(10, 18, 88, 0.74)") {
  const cx = button.x + button.w / 2;
  const cy = button.y + button.h / 2;
  ctx.save();
  ctx.fillStyle = tint;
  ctx.strokeStyle = "rgba(138, 165, 255, 0.42)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, button.w / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = colors.white;
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";

  if (kind === "pause") {
    ctx.beginPath();
    ctx.moveTo(cx - 5, cy - 8);
    ctx.lineTo(cx - 5, cy + 8);
    ctx.moveTo(cx + 5, cy - 8);
    ctx.lineTo(cx + 5, cy + 8);
    ctx.stroke();
  }

  if (kind === "minus") {
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy);
    ctx.lineTo(cx + 8, cy);
    ctx.stroke();
  }

  if (kind === "reset") {
    ctx.beginPath();
    ctx.moveTo(cx - 7, cy - 7);
    ctx.lineTo(cx + 7, cy + 7);
    ctx.moveTo(cx + 7, cy - 7);
    ctx.lineTo(cx - 7, cy + 7);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHud() {
  drawPill(78, 82, 64, 36, String(lives));
  drawPill(154, 82, 84, 36, `关卡 ${level}`, true);
  drawPill(424, 82, 70, 36, "本地");
  drawIconButton(uiButtons.pause, "pause", state === "paused" ? "rgba(39, 77, 183, 0.96)" : "rgba(9, 18, 92, 0.78)");
  drawIconButton(uiButtons.mute, "minus");
  drawIconButton(uiButtons.reset, "reset", "rgba(122, 39, 88, 0.82)");

  ctx.save();
  ctx.fillStyle = colors.cyan;
  ctx.shadowColor = colors.cyan;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(676, 99, 8, 0, Math.PI * 2);
  ctx.arc(701, 99, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBricks() {
  const alive = bricks.filter((brick) => brick.alive);
  const groups = new Map();
  alive.forEach((brick) => {
    if (!groups.has(brick.color)) groups.set(brick.color, []);
    groups.get(brick.color).push(brick);
  });

  ctx.save();
  groups.forEach((group, color) => {
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = color === colors.green ? 8 : 4;
    ctx.beginPath();
    group.forEach((brick) => {
      ctx.moveTo(brick.x + brick.r, brick.y);
      ctx.arc(brick.x, brick.y, brick.r, 0, Math.PI * 2);
    });
    ctx.fill();
  });
  ctx.restore();
}

function drawParticles() {
  particles.forEach((particle) => {
    const alpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.shadowColor = particle.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawPowerups() {
  powerups.forEach((powerup) => {
    ctx.save();
    ctx.translate(powerup.x, powerup.y);
    ctx.rotate(powerup.spin);
    ctx.fillStyle = "#edf6ff";
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(0, 0, powerup.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#112076";
    roundedRect(-5, -5, 10, 10, 3);
    ctx.fill();

    ctx.strokeStyle = colors.green;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    if (powerup.kind === "wide") {
      ctx.moveTo(-4, 0);
      ctx.lineTo(4, 0);
      ctx.moveTo(-2, -3);
      ctx.lineTo(-5, 0);
      ctx.lineTo(-2, 3);
      ctx.moveTo(2, -3);
      ctx.lineTo(5, 0);
      ctx.lineTo(2, 3);
    } else if (powerup.kind === "multi") {
      ctx.moveTo(-4, -4);
      ctx.lineTo(4, 4);
      ctx.moveTo(4, -4);
      ctx.lineTo(-4, 4);
    } else {
      ctx.arc(0, 0, 4, 0.2, Math.PI * 1.7);
    }
    ctx.stroke();
    ctx.restore();
  });
}

function drawBalls() {
  balls.forEach((ball) => {
    ctx.save();
    ctx.fillStyle = colors.white;
    ctx.shadowColor = colors.white;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawPaddle() {
  ctx.save();
  ctx.fillStyle = colors.white;
  ctx.shadowColor = colors.white;
  ctx.shadowBlur = 9;
  roundedRect(paddle.x, paddle.y, paddle.w, paddle.h, 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(210, 232, 255, 0.68)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(layout.floor.x1, layout.floor.y);
  ctx.lineTo(layout.floor.x2, layout.floor.y);
  ctx.stroke();
  ctx.restore();
}

function drawStatusOverlay() {
  if (!["paused", "over", "clear"].includes(state)) return;

  const label = state === "paused" ? "暂停" : state === "clear" ? "完成" : "结束";
  ctx.save();
  ctx.fillStyle = "rgba(5, 8, 52, 0.48)";
  roundedRect(228, 396, 324, 126, 18);
  ctx.fill();
  ctx.strokeStyle = "rgba(132, 174, 255, 0.55)";
  ctx.stroke();

  ctx.fillStyle = colors.white;
  ctx.font = "800 42px 'Microsoft YaHei UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, W / 2, 442);

  ctx.font = "700 22px 'Microsoft YaHei UI', sans-serif";
  ctx.fillStyle = colors.cyan;
  ctx.fillText(String(score).padStart(4, "0"), W / 2, 486);
  ctx.restore();
}

function drawCursorHint() {
  if (!pointerActive) return;

  ctx.save();
  ctx.strokeStyle = "rgba(141, 191, 255, 0.42)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(paddle.x + paddle.w / 2, paddle.y + paddle.h / 2, 16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  drawBackground();
  drawHud();
  drawBricks();
  drawParticles();
  drawPowerups();
  drawBalls();
  drawPaddle();
  drawCursorHint();
  drawStatusOverlay();
}

function tick(now) {
  const dt = Math.min(2.2, (now - lastTime) / 16.6667);
  lastTime = now;
  if (state !== "paused" && state !== "over" && state !== "clear") update(dt);
  else updateParticles(dt);
  draw();
  requestAnimationFrame(tick);
}

function getPointer(event) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - bounds.left) / bounds.width) * W,
    y: ((event.clientY - bounds.top) / bounds.height) * H,
  };
}

function movePaddleTo(x) {
  const leftBound = layout.inner.x + 80;
  const rightBound = layout.inner.x + layout.inner.w - 80;
  paddle.x = clamp(x - paddle.w / 2, leftBound, rightBound - paddle.w);
}

canvas.addEventListener("pointermove", (event) => {
  const point = getPointer(event);
  pointerActive = true;
  movePaddleTo(point.x);
});

canvas.addEventListener("pointerleave", () => {
  pointerActive = false;
});

canvas.addEventListener("pointerdown", (event) => {
  const point = getPointer(event);
  canvas.focus();

  if (rectContains(point, uiButtons.pause)) {
    togglePause();
    return;
  }

  if (rectContains(point, uiButtons.reset)) {
    resetGame();
    return;
  }

  if (state === "paused") {
    state = "running";
    return;
  }

  if (state === "over") {
    resetGame();
    return;
  }

  movePaddleTo(point.x);
  launchBalls();
});

window.addEventListener("keydown", (event) => {
  keys.add(event.code);
  if (["ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();

  if (event.code === "Space") {
    if (state === "ready") launchBalls();
    else if (state === "running" || state === "paused") togglePause();
    else if (state === "over") resetGame();
  }

  if (event.code === "KeyR") resetGame();
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

window.addEventListener("resize", resizeCanvas);

resizeCanvas();
resetGame();
requestAnimationFrame(tick);
