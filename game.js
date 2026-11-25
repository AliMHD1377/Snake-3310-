(() => {
  'use strict';

  const CELL = 20;
  const COLS = 20;
  const ROWS = 20;

  const SPEEDS = [
    { label: 'آهسته', ms: 240 },
    { label: 'معمولی', ms: 165 },
    { label: 'تند', ms: 110 },
    { label: 'خیلی تند', ms: 75 },
    { label: 'نهایت', ms: 50 },
  ];

  const SKINS = {
    classic: 'کلاسیک نوکیا',
    pixel: 'پیکسلی',
    round: 'گرد و نرم',
    dot: 'دانههای',
  };

  const KEYS = {
    history: 'snake3310.history.v1',
    speed: 'snake3310.speed.v1',
    skin: 'snake3310.skin.v1',
    sound: 'snake3310.sound.v1',
  };

  const COLOR = { screen: '#9bbc0f', dark: '#0f380f', mid: '#306230', light: '#8bac0f' };

  const $ = (id) => document.getElementById(id);
  const canvas = $('board');
  const ctx = canvas.getContext('2d');

  const el = {
    score: $('score'),
    best: $('best'),
    speedHud: $('speedHud'),
    status: $('statusText'),
    overlay: $('overlay'),
    overlayTitle: $('overlayTitle'),
    overlayText: $('overlayText'),
    speedSelect: $('speedSelect'),
    skinSelect: $('skinSelect'),
    soundToggle: $('soundToggle'),
    startBtn: $('startBtn'),
    restartBtn: $('restartBtn'),
    okBtn: $('okBtn'),
    historyList: $('historyList'),
    statGames: $('statGames'),
    statBest: $('statBest'),
    statAvg: $('statAvg'),
    clearBtn: $('clearBtn'),
  };

  let history = loadHistory();
  const storedSpeed = read(KEYS.speed, '1');
  let speedIndex = clampInt(storedSpeed, 0, SPEEDS.length - 1);
  const storedSkin = read(KEYS.skin, 'classic');
  let skin = SKINS[storedSkin] ? storedSkin : 'classic';
  let soundOn = read(KEYS.sound, 'false') === 'true';

  let snake = [];
  let food = null;
  let dir = { x: 1, y: 0 };
  let queued = null;
  let score = 0;
  let state = 'idle'; // idle | running | paused | over
  let lastTime = performance.now();
  let acc = 0;
  let audio = null;

  function read(key, fallback) {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  }

  function write(key, value) {
    try { localStorage.setItem(key, String(value)); } catch { /* storage may be disabled */ }
  }

  function clampInt(value, min, max) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
  }

  function loadHistory() {
    try {
      const parsed = JSON.parse(read(KEYS.history, '[]'));
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((e) => e && Number.isFinite(e.score)).slice(0, 20);
    } catch { return []; }
  }

  function bestScore() {
    return history.reduce((max, entry) => Math.max(max, entry.score), 0);
  }

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return new Date(iso).toLocaleString();
    }
  }

  function populateSettings() {
    SPEEDS.forEach((item, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = `${index + 1} - ${item.label}`;
      el.speedSelect.append(option);
    });
    Object.entries(SKINS).forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      el.skinSelect.append(option);
    });
    el.speedSelect.value = String(speedIndex);
    el.skinSelect.value = skin;
    el.soundToggle.checked = soundOn;
  }

  function updateHud() {
    el.score.textContent = String(score);
    el.best.textContent = String(Math.max(bestScore(), score));
    el.speedHud.textContent = `SPD ${speedIndex + 1}`;
  }

  function showOverlay(title, text) {
    el.overlayTitle.textContent = title;
    el.overlayText.textContent = text;
    el.overlay.classList.remove('hidden');
  }

  function hideOverlay() {
    el.overlay.classList.add('hidden');
  }

  function placeFood() {
    const free = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!snake.some((segment) => segment.x === x && segment.y === y)) free.push({ x, y });
      }
    }
    if (!free.length) {
      food = null;
      return false;
    }
    food = free[Math.floor(Math.random() * free.length)];
    return true;
  }

  function newGame(autoStart) {
    const cx = Math.floor(COLS / 2);
    const cy = Math.floor(ROWS / 2);
    snake = [
      { x: cx, y: cy },
      { x: cx - 1, y: cy },
      { x: cx - 2, y: cy },
      { x: cx - 3, y: cy },
    ];
    dir = { x: 1, y: 0 };
    queued = null;
    score = 0;
    acc = 0;
    placeFood();
    if (autoStart) {
      state = 'running';
      hideOverlay();
      el.status.textContent = 'PLAYING';
    } else {
      state = 'idle';
      showOverlay('SNAKE 3310', 'برای شروع Space بزنید یا دکمه شروع را فشار دهید');
      el.status.textContent = 'READY';
    }
    updateHud();
  }

  function toggleStart() {
    if (state === 'running') {
      state = 'paused';
      showOverlay('PAUSED', 'برای ادامه Space بزنید');
      el.status.textContent = 'PAUSED';
      return;
    }
    if (state === 'over') {
      newGame(true);
      return;
    }
    state = 'running';
    hideOverlay();
    el.status.textContent = 'PLAYING';
  }

  function finish(won) {
    state = 'over';
    history.unshift({ score, speed: speedIndex, skin, date: new Date().toISOString() });
    history = history.slice(0, 20);
    write(KEYS.history, JSON.stringify(history));
    renderHistory();
    updateHud();
    el.status.textContent = 'GAME OVER';
    showOverlay(won ? 'YOU WIN!' : 'GAME OVER', `امتیاز: ${score} — برای شروع مجدد Space بزنید`);
    beep(won ? 880 : 180, won ? 0.35 : 0.45);
  }

  function step() {
    if (queued) {
      dir = queued;
      queued = null;
    }
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    const hitWall = head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS;
    const hitSelf = snake.slice(0, -1).some((segment) => segment.x === head.x && segment.y === head.y);
    if (hitWall || hitSelf) {
      finish(false);
      return;
    }

    snake.unshift(head);
    if (food && head.x === food.x && head.y === food.y) {
      score += 10;
      beep(660, 0.09);
      updateHud();
      if (!placeFood()) {
        finish(true);
        return;
      }
    } else {
      snake.pop();
    }
  }

  function setDirection(name) {
    const directions = {
      up: { x: 0, y: -1 },
      down: { x: 0, y: 1 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 },
    };
    const next = directions[name];
    if (!next) return;
    if (state === 'idle' || state === 'over') newGame(true);

    const current = queued || dir;
    if (next.x === -current.x && next.y === -current.y) return;
    queued = next;
  }

  function beep(frequency, duration) {
    if (!soundOn) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = 'square';
      oscillator.frequency.value = frequency;
      const now = audio.currentTime;
      gain.gain.setValueAtTime(0.045, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(now);
      oscillator.stop(now + duration);
    } catch { /* audio is optional */ }
  }

  function roundedPath(x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
  }

  function drawEyes() {
    const head = snake[0];
    const x = head.x * CELL;
    const y = head.y * CELL;
    let points;
    if (dir.x === 1) points = [[x + 13, y + 5], [x + 13, y + 13]];
    else if (dir.x === -1) points = [[x + 4, y + 5], [x + 4, y + 13]];
    else if (dir.y === -1) points = [[x + 5, y + 4], [x + 13, y + 4]];
    else points = [[x + 5, y + 13], [x + 13, y + 13]];

    points.forEach(([px, py]) => {
      ctx.fillStyle = COLOR.light;
      ctx.fillRect(px, py, 4, 4);
      ctx.fillStyle = COLOR.dark;
      ctx.fillRect(px + 2, py + 2, 2, 2);
    });
  }

  function drawSnake() {
    for (let i = snake.length - 1; i >= 0; i--) {
      const segment = snake[i];
      const x = segment.x * CELL;
      const y = segment.y * CELL;
      const isHead = i === 0;

      if (skin === 'pixel') {
        for (let sy = 0; sy < 4; sy++) {
          for (let sx = 0; sx < 4; sx++) {
            if ((sx + sy + i) % 2 === 0) {
              ctx.fillStyle = isHead ? COLOR.dark : COLOR.mid;
              ctx.fillRect(x + sx * 5, y + sy * 5, 5, 5);
            }
          }
        }
      } else if (skin === 'round') {
        roundedPath(x + 1, y + 1, CELL - 2, CELL - 2, 6);
        ctx.fillStyle = isHead ? COLOR.dark : COLOR.mid;
        ctx.fill();
        ctx.strokeStyle = COLOR.dark;
        ctx.lineWidth = 1;
        ctx.stroke();
        if (!isHead) {
          ctx.fillStyle = COLOR.light;
          ctx.fillRect(x + 8, y + 8, 4, 4);
        }
      } else if (skin === 'dot') {
        ctx.beginPath();
        ctx.arc(x + 10, y + 10, isHead ? 9 : 7.5, 0, Math.PI * 2);
        ctx.fillStyle = isHead ? COLOR.dark : COLOR.mid;
        ctx.fill();
        if (!isHead) {
          ctx.beginPath();
          ctx.arc(x + 10, y + 10, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = COLOR.light;
          ctx.fill();
        }
      } else {
        ctx.fillStyle = COLOR.dark;
        ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
        if (!isHead) {
          ctx.fillStyle = COLOR.mid;
          ctx.fillRect(x + 4, y + 4, 2, 2);
        }
      }
    }
    drawEyes();
  }

  function draw(now) {
    ctx.fillStyle = COLOR.screen;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(48, 98, 48, 0.22)';
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) ctx.fillRect(x * CELL + CELL - 1, y * CELL + CELL - 1, 1, 1);
    }

    if (food) {
      const visible = Math.floor(now / 220) % 2 === 0;
      const size = visible ? 12 : 8;
      const fx = food.x * CELL + (CELL - size) / 2;
      const fy = food.y * CELL + (CELL - size) / 2;
      ctx.fillStyle = COLOR.dark;
      ctx.fillRect(fx, fy, size, size);
      ctx.fillStyle = COLOR.light;
      ctx.fillRect(fx + 2, fy + 2, 2, 2);
    }

    if (snake.length) drawSnake();
  }

  function loop(now) {
    const delta = Math.min(now - lastTime, 250);
    lastTime = now;
    if (state === 'running') {
      acc += delta;
      const interval = SPEEDS[speedIndex].ms;
      while (acc >= interval && state === 'running') {
        acc -= interval;
        step();
      }
    }
    draw(now);
    requestAnimationFrame(loop);
  }

  function renderHistory() {
    el.historyList.innerHTML = '';
    const sorted = history
      .slice()
      .sort((a, b) => b.score - a.score || new Date(b.date) - new Date(a.date));

    if (!sorted.length) {
      const item = document.createElement('li');
      item.className = 'empty';
      item.textContent = 'هنوز بازیای ثبت نشده است.';
      el.historyList.append(item);
    } else {
      sorted.slice(0, 10).forEach((entry, index) => {
        const item = document.createElement('li');
        const rank = document.createElement('span');
        rank.className = 'rank';
        rank.textContent = String(index + 1);
        const main = document.createElement('span');
        main.className = 'h-main';
        const title = document.createElement('strong');
        title.textContent = `${entry.score} امتیاز`;
        const meta = document.createElement('small');
        const speedLabel = SPEEDS[clampInt(entry.speed, 0, SPEEDS.length - 1)].label;
        const skinLabel = SKINS[entry.skin] || 'کلاسیک نوکیا';
        meta.textContent = `${speedLabel} · ${skinLabel} · ${formatDate(entry.date)}`;
        main.append(title, document.createElement('br'), meta);
        item.append(rank, main);
        el.historyList.append(item);
      });
    }

    el.statGames.textContent = String(history.length);
    el.statBest.textContent = String(bestScore());
    const average = history.length
      ? Math.round(history.reduce((sum, entry) => sum + entry.score, 0) / history.length)
      : 0;
    el.statAvg.textContent = String(average);
  }

  el.speedSelect.addEventListener('change', (event) => {
    speedIndex = clampInt(event.target.value, 0, SPEEDS.length - 1);
    write(KEYS.speed, speedIndex);
    updateHud();
  });

  el.skinSelect.addEventListener('change', (event) => {
    skin = SKINS[event.target.value] ? event.target.value : 'classic';
    write(KEYS.skin, skin);
  });

  el.soundToggle.addEventListener('change', (event) => {
    soundOn = event.target.checked;
    write(KEYS.sound, soundOn);
    if (soundOn) beep(880, 0.06);
  });

  el.startBtn.addEventListener('click', (event) => {
    toggleStart();
    event.currentTarget.blur();
  });
  el.okBtn.addEventListener('click', (event) => {
    toggleStart();
    event.currentTarget.blur();
  });
  el.restartBtn.addEventListener('click', (event) => {
    newGame(true);
    event.currentTarget.blur();
  });
  el.clearBtn.addEventListener('click', (event) => {
    if (history.length && window.confirm('تاریخچه امتیازها پاک شود؟')) {
      history = [];
      write(KEYS.history, '[]');
      renderHistory();
      updateHud();
    }
    event.currentTarget.blur();
  });

  document.querySelectorAll('[data-dir]').forEach((button) => {
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      setDirection(button.dataset.dir);
    });
  });

  document.addEventListener('keydown', (event) => {
    const tag = event.target && event.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'TEXTAREA') return;

    const key = event.key.toLowerCase();
    const directions = {
      arrowup: 'up', w: 'up',
      arrowdown: 'down', s: 'down',
      arrowleft: 'left', a: 'left',
      arrowright: 'right', d: 'right',
    };
    if (directions[key]) {
      event.preventDefault();
      setDirection(directions[key]);
      return;
    }
    if (key === ' ' || key === 'enter') {
      event.preventDefault();
      toggleStart();
      return;
    }
    if (key === 'r') {
      event.preventDefault();
      newGame(true);
    }
  });

  let touchStart = null;
  canvas.addEventListener('touchstart', (event) => {
    const touch = event.changedTouches[0];
    touchStart = { x: touch.clientX, y: touch.clientY };
  }, { passive: true });
  canvas.addEventListener('touchend', (event) => {
    if (!touchStart) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    setDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  }, { passive: true });

  populateSettings();
  renderHistory();
  newGame(false);
  requestAnimationFrame(loop);
})();
