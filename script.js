
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const mainMenu = document.getElementById("mainMenu");
const settingsMenu = document.getElementById("settingsMenu");
const gameUI = document.getElementById("gameUI");
const pauseMenu = document.getElementById("pauseMenu");

let playing = false;
let paused = false;

let player = {
  x: 0,
  z: 0,
  height: 0,
  verticalSpeed: 0,
  yaw: 0,
  pitch: 0,
  grounded: true
};

let blocks = [];
let selectedBlock = "grass";
let keys = {};
let sensitivity = 0.004;

const blockColors = {
  grass: "#65a83e",
  dirt: "#8b5a32",
  stone: "#929292",
  wood: "#98632f"
};

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  render();
}

window.addEventListener("resize", resize);

function createWorld() {
  blocks = [];

  for (let x = -15; x <= 15; x++) {
    for (let z = -15; z <= 15; z++) {
      blocks.push({
        x,
        y: -1,
        z,
        type: "grass"
      });

      blocks.push({
        x,
        y: -2,
        z,
        type: "dirt"
      });

      if (Math.random() > 0.985) {
        for (let y = 0; y < 3; y++) {
          blocks.push({
            x,
            y,
            z,
            type: "wood"
          });
        }

        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            blocks.push({
              x: x + dx,
              y: 3,
              z: z + dz,
              type: "grass"
            });
          }
        }
      }
    }
  }
}

function showScreen(screen) {
  mainMenu.classList.add("hidden");
  settingsMenu.classList.add("hidden");
  gameUI.classList.add("hidden");
  pauseMenu.classList.add("hidden");

  if (screen) {
    screen.classList.remove("hidden");
  }
}

document.getElementById("playBtn").onclick = () => {
  playing = true;
  paused = false;

  player.x = 0;
  player.z = 0;
  player.height = 0;
  player.verticalSpeed = 0;

  createWorld();
  showScreen(gameUI);
  render();
};

document.getElementById("settingsBtn").onclick = () => {
  showScreen(settingsMenu);
};

document.getElementById("backBtn").onclick = () => {
  showScreen(mainMenu);
};

document.getElementById("fullscreenBtn").onclick = async () => {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }

    if (screen.orientation?.lock) {
      screen.orientation.lock("landscape").catch(() => {});
    }
  } catch (error) {
    alert("Полный экран недоступен в этом браузере.");
  }
};

document.getElementById("pauseBtn").onclick = () => {
  if (!playing) return;

  paused = true;
  showScreen(pauseMenu);
};

document.getElementById("resumeBtn").onclick = () => {
  paused = false;
  showScreen(gameUI);
  render();
};

document.getElementById("exitBtn").onclick = () => {
  playing = false;
  paused = false;
  showScreen(mainMenu);
};

document.querySelectorAll(".block-slot").forEach(slot => {
  slot.onclick = () => {
    selectedBlock = slot.dataset.block;

    document.querySelectorAll(".block-slot").forEach(button => {
      button.classList.remove("selected");
    });

    slot.classList.add("selected");
  };
});

// Клавиатура для компьютера
window.addEventListener("keydown", event => {
  keys[event.code] = true;

  if (event.code === "Space") {
    jump();
  }

  if (event.code === "Escape" && playing && !paused) {
    paused = true;
    showScreen(pauseMenu);
  }
});

window.addEventListener("keyup", event => {
  keys[event.code] = false;
});

// Мобильное управление
function bindMove(id, key) {
  const button = document.getElementById(id);

  button.addEventListener("pointerdown", event => {
    event.preventDefault();
    keys[key] = true;
    button.setPointerCapture(event.pointerId);
  });

  const release = () => {
    keys[key] = false;
  };

  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
}

bindMove("forwardBtn", "KeyW");
bindMove("backwardBtn", "KeyS");
bindMove("leftBtn", "KeyA");
bindMove("rightBtn", "KeyD");

document.getElementById("jumpBtn").addEventListener(
  "pointerdown",
  event => {
    event.preventDefault();
    jump();
  }
);

function jump() {
  if (playing && !paused && player.grounded) {
    player.verticalSpeed = 7;
    player.grounded = false;
  }
}

// Поворот камеры пальцем
let lookTouch = null;

canvas.addEventListener("pointerdown", event => {
  if (!playing || paused) return;

  lookTouch = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY
  };

  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", event => {
  if (!lookTouch || event.pointerId !== lookTouch.id) return;

  const dx = event.clientX - lookTouch.x;
  const dy = event.clientY - lookTouch.y;

  player.yaw += dx * sensitivity;
  player.pitch = Math.max(
    -1,
    Math.min(1, player.pitch + dy * sensitivity)
  );

  lookTouch.x = event.clientX;
  lookTouch.y = event.clientY;

  render();
});

canvas.addEventListener("pointerup", () => {
  lookTouch = null;
});

canvas.addEventListener("pointercancel", () => {
  lookTouch = null;
});

// Упрощённая псевдо-3D отрисовка блоков
function project(x, y, z) {
  const dx = x - player.x;
  const dz = z - player.z;

  const sin = Math.sin(player.yaw);
  const cos = Math.cos(player.yaw);

  const depth = dx * sin + dz * cos;
  const side = dx * cos - dz * sin;

  if (depth < 0.2) return null;

  const focal = canvas.height * 0.8;
  const scale = focal / depth;

  return {
    x: canvas.width / 2 + side * scale,
    y: canvas.height / 2 -
       (y - player.height - player.pitch * depth) * scale,
    size: scale
  };
}

function drawCube(block) {
  const p = project(block.x, block.y, block.z);

  if (!p || p.size < 1) return;

  const s = Math.min(p.size, canvas.height * 1.5);

  const color = blockColors[block.type] || "#888888";

  ctx.fillStyle = color;
  ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);

  ctx.fillStyle = "rgba(0,0,0,0.13)";
  ctx.fillRect(p.x - s / 2, p.y, s, s / 2);

  ctx.strokeStyle = "rgba(0,0,0,0.22)";
  ctx.lineWidth = 1;
  ctx.strokeRect(p.x - s / 2, p.y - s / 2, s, s);
}

function render() {
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = "#82c9f0";
  ctx.fillRect(0, 0, w, h);

  const horizon = h / 2;

  ctx.fillStyle = "#638f3f";
  ctx.fillRect(0, horizon, w, h - horizon);

  // Солнце
  ctx.fillStyle = "#fff4a3";
  ctx.beginPath();
  ctx.arc(w * 0.78, h * 0.19, h * 0.055, 0, Math.PI * 2);
  ctx.fill();

  // Рисуем дальние блоки первыми
  const visibleBlocks = [...blocks].sort((a, b) => {
    const da = Math.hypot(a.x - player.x, a.z - player.z);
    const db = Math.hypot(b.x - player.x, b.z - player.z);
    return db - da;
  });

  visibleBlocks.forEach(drawCube);

  // Прицел
  if (playing && !paused) {
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(w / 2 - 8, h / 2);
    ctx.lineTo(w / 2 + 8, h / 2);
    ctx.moveTo(w / 2, h / 2 - 8);
    ctx.lineTo(w / 2, h / 2 + 8);
    ctx.stroke();
  }
}

function update() {
  if (!playing || paused) return;

  const speed = 0.09;

  if (keys["KeyW"] || keys["ArrowUp"]) {
    player.x += Math.sin(player.yaw) * speed;
    player.z += Math.cos(player.yaw) * speed;
  }

  if (keys["KeyS"] || keys["ArrowDown"]) {
    player.x -= Math.sin(player.yaw) * speed;
    player.z -= Math.cos(player.yaw) * speed;
  }

  if (keys["KeyA"] || keys["ArrowLeft"]) {
    player.x -= Math.cos(player.yaw) * speed;
    player.z += Math.sin(player.yaw) * speed;
  }

  if (keys["KeyD"] || keys["ArrowRight"]) {
    player.x += Math.cos(player.yaw) * speed;
    player.z -= Math.sin(player.yaw) * speed;
  }

  player.verticalSpeed -= 0.25;
  player.height += player.verticalSpeed * 0.05;

  if (player.height <= 0) {
    player.height = 0;
    player.verticalSpeed = 0;
    player.grounded = true;
  }

  render();
  requestAnimationFrame(update);
}

// Запуск игрового цикла
createWorld();
resize();

function startLoop() {
  if (playing && !paused) {
    update();
  }
}

document.getElementById("playBtn").addEventListener("click", () => {
  requestAnimationFrame(startLoop);
});
