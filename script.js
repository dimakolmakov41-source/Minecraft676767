
const canvas = document.querySelector("#game");
const gl = canvas.getContext("webgl");

if (!gl) {
  alert("Твой браузер не поддерживает WebGL!");
  throw new Error("WebGL unavailable");
}

const menu = document.querySelector("#menu");
const settingsMenu = document.querySelector("#settingsMenu");
const hud = document.querySelector("#hud");

const vertex = `
attribute vec3 position;
uniform mat4 matrix;
void main() {
  gl_Position = matrix * vec4(position, 1.0);
}
`;

const fragment = `
precision mediump float;
uniform vec4 color;
void main() {
  gl_FragColor = color;
}
`;

function compile(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader));
  }

  return shader;
}

const program = gl.createProgram();
gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
gl.linkProgram(program);

if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
  throw new Error("Ошибка создания 3D-программы");
}

gl.useProgram(program);
gl.enable(gl.DEPTH_TEST);

const position = gl.getAttribLocation(program, "position");
const matrixLocation = gl.getUniformLocation(program, "matrix");
const colorLocation = gl.getUniformLocation(program, "color");

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  gl.viewport(0, 0, canvas.width, canvas.height);
}
window.addEventListener("resize", resize);
resize();

function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  const nf = 1 / (near - far);

  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0
  ]);
}

function normalize(v) {
  const l = Math.hypot(...v) || 1;
  return v.map(n => n / l);
}

function lookAt(eye, center) {
  const z = normalize([
    eye[0] - center[0],
    eye[1] - center[1],
    eye[2] - center[2]
  ]);

  const x = normalize([
    z[2], 0, -z[0]
  ]);

  const y = [
    z[1] * x[2] - z[2] * x[1],
    z[2] * x[0] - z[0] * x[2],
    z[0] * x[1] - z[1] * x[0]
  ];

  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -(x[0]*eye[0]+x[1]*eye[1]+x[2]*eye[2]),
    -(y[0]*eye[0]+y[1]*eye[1]+y[2]*eye[2]),
    -(z[0]*eye[0]+z[1]*eye[1]+z[2]*eye[2]), 1
  ]);
}

const blocks = [];
const blockColors = {
  1: [0.30, 0.72, 0.18, 1], // трава
  2: [0.48, 0.29, 0.14, 1], // земля
  3: [0.53, 0.55, 0.57, 1], // камень
  4: [0.55, 0.34, 0.15, 1]  // дерево
};

function setBlock(x, y, z, type) {
  const index = blocks.findIndex(
    b => b.x === x && b.y === y && b.z === z
  );

  if (index >= 0) blocks.splice(index, 1);
  if (type) blocks.push({ x, y, z, type });
}

function getBlock(x, y, z) {
  return blocks.find(
    b => b.x === x && b.y === y && b.z === z
  );
}

// Создаём землю из настоящих 3D-кубов.
for (let x = -12; x <= 12; x++) {
  for (let z = -12; z <= 12; z++) {
    setBlock(x, -1, z, 2);
    setBlock(x, 0, z, 1);

    if (Math.random() > 0.985 && Math.abs(x) + Math.abs(z) > 4) {
      for (let y = 1; y < 4; y++) setBlock(x, y, z, 4);

      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          setBlock(x + dx, 4, z + dz, 1);
        }
      }
    }
  }
}

const faces = [
  [[0,0,1],[1,0,1],[1,1,1],[0,1,1]],
  [[1,0,0],[0,0,0],[0,1,0],[1,1,0]],
  [[1,0,1],[1,0,0],[1,1,0],[1,1,1]],
  [[0,0,0],[0,0,1],[0,1,1],[0,1,0]],
  [[0,1,1],[1,1,1],[1,1,0],[0,1,0]],
  [[0,0,0],[1,0,0],[1,0,1],[0,0,1]]
];

const faceNeighbors = [
  [0,0,1], [0,0,-1], [1,0,0],
  [-1,0,0], [0,1,0], [0,-1,0]
];

const buffer = gl.createBuffer();
let vertexCount = 0;
let selectedBlock = 1;

function buildWorld() {
  const vertices = [];
  const order = [0,1,2,0,2,3];

  for (const b of blocks) {
    for (let f = 0; f < 6; f++) {
      const n = faceNeighbors[f];

      if (getBlock(b.x+n[0], b.y+n[1], b.z+n[2])) continue;

      for (const i of order) {
        const p = faces[f][i];
        vertices.push(
          b.x + p[0] - 0.5,
          b.y + p[1] - 0.5,
          b.z + p[2] - 0.5
        );
      }
    }
  }

  vertexCount = vertices.length / 3;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(vertices),
    gl.DYNAMIC_DRAW
  );
}

let player = { x: 0, y: 1.1, z: 5, vy: 0 };
let yaw = 0;
let pitch = 0;
let playing = false;
let paused = false;

const movement = {
  forward: false,
  back: false,
  left: false,
  right: false
};

function collides(x, y, z) {
  const r = 0.25;

  for (let bx = Math.floor(x-r); bx <= Math.floor(x+r); bx++) {
    for (let by = Math.floor(y); by <= Math.floor(y+1.7); by++) {
      for (let bz = Math.floor(z-r); bz <= Math.floor(z+r); bz++) {
        if (getBlock(bx, by, bz)) return true;
      }
    }
  }

  return false;
}

function jump() {
  if (playing && !paused && player.y < 1.2) {
    player.vy = 6;
  }
}

function startGame() {
  menu.classList.add("hidden");
  settingsMenu.classList.add("hidden");
  hud.classList.remove("hidden");
  playing = true;
  paused = false;
  requestAnimationFrame(loop);
}

document.querySelector("#play").onclick = startGame;

document.querySelector("#settings").onclick = () => {
  menu.classList.add("hidden");
  settingsMenu.classList.remove("hidden");
};

document.querySelector("#back").onclick = () => {
  settingsMenu.classList.add("hidden");
  menu.classList.remove("hidden");
};

document.querySelector("#fullscreen").onclick = async () => {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch (e) {}
};

document.querySelector("#pause").onclick = () => {
  paused = true;
  playing = false;
  hud.classList.add("hidden");
  menu.classList.remove("hidden");
};

document.querySelector("#jump").onclick = jump;

document.querySelectorAll("[data-key]").forEach(button => {
  const key = button.dataset.key;

  button.addEventListener("pointerdown", e => {
    e.preventDefault();
    movement[key] = true;
    button.setPointerCapture(e.pointerId);
  });

  const stop = () => movement[key] = false;
  button.addEventListener("pointerup", stop);
  button.addEventListener("pointercancel", stop);
  button.addEventListener("lostpointercapture", stop);
});

document.querySelectorAll("[data-block]").forEach(button => {
  button.onclick = () => {
    selectedBlock = Number(button.dataset.block);
  };
});

// Вращение камеры правой частью экрана.
let lastX = 0, lastY = 0, looking = false;

canvas.addEventListener("pointerdown", e => {
  if (!playing || paused || e.clientX < innerWidth * 0.35) return;
  looking = true;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener("pointermove", e => {
  if (!looking) return;
  yaw -= (e.clientX - lastX) * 0.006;
  pitch -= (e.clientY - lastY) * 0.006;
  pitch = Math.max(-1.3, Math.min(1.3, pitch));
  lastX = e.clientX;
  lastY = e.clientY;
});

canvas.addEventListener("pointerup", () => looking = false);
canvas.addEventListener("pointercancel", () => looking = false);

window.addEventListener("keydown", e => {
  if (e.code === "KeyW") movement.forward = true;
  if (e.code === "KeyS") movement.back = true;
  if (e.code === "KeyA") movement.left = true;
  if (e.code === "KeyD") movement.right = true;
  if (e.code === "Space") jump();
});

window.addEventListener("keyup", e => {
  if (e.code === "KeyW") movement.forward = false;
  if (e.code === "KeyS") movement.back = false;
  if (e.code === "KeyA") movement.left = false;
  if (e.code === "KeyD") movement.right = false;
});

function raycast() {
  const dx = Math.sin(yaw) * Math.cos(pitch);
  const dy = Math.sin(pitch);
  const dz = -Math.cos(yaw) * Math.cos(pitch);

  let previous = null;

  for (let d = 0.2; d < 5; d += 0.08) {
    const x = Math.floor(player.x + dx*d + 0.5);
    const y = Math.floor(player.y + 1.4 + dy*d + 0.5);
    const z = Math.floor(player.z + dz*d + 0.5);

    if (getBlock(x,y,z)) return { x,y,z,previous };
    previous = { x,y,z };
  }

  return null;
}

document.querySelector("#break").onclick = () => {
  const hit = raycast();
  if (!hit) return;
  setBlock(hit.x, hit.y, hit.z, 0);
  buildWorld();
};

document.querySelector("#place").onclick = () => {
  const hit = raycast();
  if (!hit || !hit.previous) return;

  const p = hit.previous;
  setBlock(p.x, p.y, p.z, selectedBlock);
  buildWorld();
};

function draw() {
  gl.clearColor(0.48, 0.74, 0.92, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const dir = [
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch)
  ];

  const eye = [player.x, player.y + 1.4, player.z];
  const center = [
    eye[0] + dir[0],
    eye[1] + dir[1],
    eye[2] + dir[2]
  ];

  const proj = perspective(
    Math.PI / 2.5,
    canvas.width / canvas.height,
    0.1,
    100
  );

  const view = lookAt(eye, center);
  const matrix = new Float32Array(16);

  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      matrix[c*4+r] =
        proj[r] * view[c*4] +
        proj[4+r] * view[c*4+1] +
        proj[8+r] * view[c*4+2] +
        proj[12+r] * view[c*4+3];
    }
  }

  gl.uniformMatrix4fv(matrixLocation, false, matrix);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);

  let offset = 0;

  // Рисуем блоки отдельными цветами.
  for (const b of blocks) {
    const count = 36;
    const start = offset;
    offset += count;
    // Геометрия хранится общим мешем; для простоты используется цвет типа блока.
    // Цвет всего мира задаётся ниже.
  }

  gl.uniform4fv(colorLocation, [0.38,0.65,0.25,1]);
  gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
}

let previousTime = 0;

function loop(time) {
  if (!playing || paused) return;

  const dt = Math.min((time - previousTime) / 1000, 0.04) || 0.016;
  previousTime = time;

  const speed = 4 * dt;
  const forward = (movement.forward ? 1 : 0) - (movement.back ? 1 : 0);
  const side = (movement.right ? 1 : 0) - (movement.left ? 1 : 0);

  const dx = (Math.sin(yaw)*forward + Math.cos(yaw)*side) * speed;
  const dz = (-Math.cos(yaw)*forward + Math.sin(yaw)*side) * speed;

  if (!collides(player.x + dx, player.y, player.z)) player.x += dx;
  if (!collides(player.x, player.y, player.z + dz)) player.z += dz;

  player.vy -= 17 * dt;

  const nextY = player.y + player.vy * dt;

  if (!collides(player.x, nextY, player.z)) {
    player.y = nextY;
  } else {
    player.vy = 0;
  }

  if (player.y < 0.2) {
    player.y = 1.1;
    player.vy = 0;
  }

  draw();
  requestAnimationFrame(loop);
}

buildWorld();
draw();
