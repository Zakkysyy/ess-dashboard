/**
 * ==============================================================================
 * Smart Environmental Sensing System (ESS) - Core Application Logic
 * Bengkel Mekatronika Politeknik Kota Malang (POLTEKOM)
 * Layer 5 Presentation Tier: Multiplatform Web Client
 * Terintegrasi dengan Firebase RTDB (Hot Buffer) & FastAPI Gateway (ESI AI Agent)
 * ==============================================================================
 */

// --- GLOBAL STATE ---
let state = {
  temp: 25.9,
  humidity: 57.8,
  mq2: 110,
  mq7: 5,
  envStatus: "NORMAL",
  nodeId: (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_NODE_ID) ? CONFIG.DEFAULT_NODE_ID : "NODE-MRS01",
  isDangerSimulated: false,
  audioAlarmEnabled: true,
  isFirebaseLive: false,
  isBackendLive: false,
  rssi: -58,
  uptimeSeconds: 14220,
  filter: 'live',
  thresholds: {
    tempMax: (typeof CONFIG !== 'undefined' && CONFIG.THRESHOLDS) ? CONFIG.THRESHOLDS.TEMP_MAX : 35.0,
    mq2Max: (typeof CONFIG !== 'undefined' && CONFIG.THRESHOLDS) ? CONFIG.THRESHOLDS.MQ2_MAX : 300,
    mq7Max: (typeof CONFIG !== 'undefined' && CONFIG.THRESHOLDS) ? CONFIG.THRESHOLDS.MQ7_MAX : 50
  },
  history: []
};

// --- WEB AUDIO SYNTHESIZED SIREN ---
let audioCtx = null;
let alarmOscillator = null;
let isSirenRinging = false;

function initAudio() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function startSirenSound() {
  if (!state.audioAlarmEnabled) return;
  initAudio();
  if (!audioCtx || isSirenRinging) return;

  try {
    isSirenRinging = true;
    alarmOscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    alarmOscillator.type = 'sawtooth';
    alarmOscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
    alarmOscillator.frequency.exponentialRampToValueAtTime(1400, audioCtx.currentTime + 0.35);
    gainNode.gain.setValueAtTime(0.06, audioCtx.currentTime);
    alarmOscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    alarmOscillator.start();

    let freqToggle = false;
    alarmOscillator._interval = setInterval(() => {
      if (!alarmOscillator) return;
      freqToggle = !freqToggle;
      alarmOscillator.frequency.setValueAtTime(freqToggle ? 1300 : 750, audioCtx.currentTime);
    }, 400);
  } catch (e) {
    console.warn('Audio belum diizinkan oleh gesture pengguna:', e);
  }
}

function stopSirenSound() {
  isSirenRinging = false;
  if (alarmOscillator) {
    clearInterval(alarmOscillator._interval);
    try { alarmOscillator.stop(); } catch(e){}
    alarmOscillator.disconnect();
    alarmOscillator = null;
  }
}

function toggleAudioAlarm() {
  initAudio();
  state.audioAlarmEnabled = !state.audioAlarmEnabled;
  const btn = document.getElementById('audioToggleBtn');
  const icon = document.getElementById('audioIcon');
  if (!btn || !icon) return;

  if (state.audioAlarmEnabled) {
    btn.classList.remove('text-red-400', 'border-red-500/30');
    btn.classList.add('text-slate-300');
    icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />`;
  } else {
    stopSirenSound();
    btn.classList.add('text-red-400', 'border-red-500/30');
    icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />`;
  }
}

// --- DANGER SIMULATOR TOGGLE ---
function toggleDangerSimulation() {
  initAudio();
  state.isDangerSimulated = !state.isDangerSimulated;
  const btn = document.getElementById('toggleDangerBtn');
  const btnText = document.getElementById('dangerBtnText');

  if (state.isDangerSimulated) {
    if (btn) {
      btn.className = "group relative px-3 py-1.5 rounded-lg bg-red-600 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-lg shadow-red-500/50 animate-pulse";
    }
    if (btnText) btnText.innerText = "Stop Danger Sim";
    appendAIMessage("🚨 <strong>Mode Simulasi Bahaya Diaktifkan:</strong> Nilai Suhu (42.0°C), MQ-2 (520 PPM), dan MQ-7 (85 PPM) melampaui ambang batas keselamatan K3 ESS! Indikator fisik LED merah & exhaust fan aktif!");
  } else {
    if (btn) {
      btn.className = "group relative px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 hover:text-red-200 text-xs font-medium flex items-center gap-1.5 transition-all shadow-sm";
    }
    if (btnText) btnText.innerText = "Simulate Danger";
    stopSirenSound();
    appendAIMessage("✅ <strong>Mode Simulasi Dimatikan:</strong> Sistem kembali memantau data real-time bengkel.");
  }
  updateTelemetry();
}

// --- HISTORICAL DATA INITIALIZER ---
function initializeHistoricalData() {
  const now = Date.now();
  state.history = [];
  for (let i = 24; i >= 0; i--) {
    const time = new Date(now - i * 3000);
    state.history.push({
      time: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      temp: parseFloat((25.5 + Math.sin(i * 0.4) * 0.8).toFixed(1)),
      humidity: Math.round(57 + Math.cos(i * 0.3) * 3),
      mq2: Math.round(105 + Math.random() * 15),
      mq7: Math.round(5 + Math.random() * 3)
    });
  }
}

// --- TELEMETRY ENGINE & FIREBASE SYNC ---
async function fetchFirebaseTelemetry() {
  if (typeof CONFIG === 'undefined' || !CONFIG.FIREBASE_DATABASE_URL) return false;

  let url = CONFIG.FIREBASE_DATABASE_URL.trim();
  if (CONFIG.FIREBASE_AUTH_TOKEN) {
    const separator = url.includes('?') ? '&' : '?';
    url += separator + "auth=" + encodeURIComponent(CONFIG.FIREBASE_AUTH_TOKEN);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2800);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object') {
        let latest = null;

        if (Array.isArray(data)) {
          latest = data[data.length - 1];
        } else {
          const keys = Object.keys(data);
          if (keys.length > 0) {
            latest = data[keys[keys.length - 1]];
          }
        }

        if (latest) {
          // Pemetaan field dari payload hardware ESS (PlatformIO WROOM-32 / C3)
          if (latest.temp !== undefined) state.temp = parseFloat(latest.temp);
          else if (latest.temperature !== undefined) state.temp = parseFloat(latest.temperature);

          if (latest.hum !== undefined) state.humidity = parseFloat(latest.hum);
          else if (latest.humidity !== undefined) state.humidity = parseFloat(latest.humidity);

          if (latest.mq7_ppm !== undefined) state.mq7 = Math.round(latest.mq7_ppm);
          if (latest.mq2_ppm !== undefined) state.mq2 = Math.round(latest.mq2_ppm);
          else if (latest.mq2 !== undefined) state.mq2 = Math.round(latest.mq2);

          if (latest.node_id) state.nodeId = latest.node_id;
          if (latest.status) state.envStatus = latest.status;

          return true;
        }
      }
    }
  } catch (err) {
    // Mode offline / buffer Firebase belum terjangkau
  }
  return false;
}

// --- CHECK BACKEND GATEWAY HEALTH (FastAPI) ---
async function checkBackendHealth() {
  if (typeof CONFIG === 'undefined' || !CONFIG.BACKEND_API_URL) return false;
  try {
    const base = CONFIG.BACKEND_API_URL.replace(/\/+$/, "");
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const json = await res.json();
      return json.status === "healthy";
    }
  } catch (e) {
    // Backend offline
  }
  return false;
}

async function updateTelemetry() {
  state.uptimeSeconds += 2;

  // Uptime formatting
  const h = String(Math.floor(state.uptimeSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((state.uptimeSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(state.uptimeSeconds % 60).padStart(2, '0');
  const elUptime = document.getElementById('diagUptime');
  if (elUptime) elUptime.innerText = `${h}h : ${m}m : ${s}s`;

  // Status Connection Pill
  const connPill = document.getElementById('connectionPill');
  const connText = document.getElementById('connectionStatusText');
  const connPing = document.getElementById('connectionPing');

  if (state.isDangerSimulated) {
    state.temp = 42.0;
    state.humidity = 35;
    state.mq2 = 520;
    state.mq7 = 85;
    state.envStatus = "DANGER";
    if (connText) connText.innerText = "Danger Simulation";
  } else {
    // Tarik data real-time dari Hot Buffer Firebase RTDB
    const hasLiveFirebase = await fetchFirebaseTelemetry();
    state.isFirebaseLive = hasLiveFirebase;

    if (hasLiveFirebase) {
      if (connPill) connPill.className = "flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 text-xs font-medium font-mono transition-all";
      if (connText) connText.innerText = "RTDB Buffer Synced";
      if (connPing) connPing.className = "animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75";
      const diagSync = document.getElementById('diagLastSync');
      if (diagSync) diagSync.innerText = "Live (RTDB)";
    } else {
      // Fallback ke Realistic Simulator
      state.temp = +(state.temp + (Math.random() * 0.4 - 0.2)).toFixed(1);
      if (state.temp < 23) state.temp = 24.5;
      if (state.temp > 30) state.temp = 28.5;

      state.humidity = Math.round(state.humidity + (Math.random() * 2 - 1));
      if (state.humidity < 45) state.humidity = 50;
      if (state.humidity > 68) state.humidity = 62;

      state.mq7 = Math.round(state.mq7 + (Math.random() * 2 - 1));
      if (state.mq7 < 3) state.mq7 = 4;
      if (state.mq7 > 20) state.mq7 = 12;

      state.mq2 = Math.round(state.mq2 + (Math.random() * 6 - 3));
      if (state.mq2 < 85) state.mq2 = 95;
      if (state.mq2 > 200) state.mq2 = 140;

      if (connPill) connPill.className = "flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-950/40 border border-amber-500/30 text-amber-400 text-xs font-medium font-mono transition-all";
      if (connText) connText.innerText = "Simulator Mode";
      if (connPing) connPing.className = "animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75";
      const diagSync = document.getElementById('diagLastSync');
      if (diagSync) diagSync.innerText = "Simulated";
    }
  }

  // Safety threshold check (Pilar 1 RULEBOOK)
  const isDanger = (
    state.temp >= state.thresholds.tempMax ||
    state.mq2 >= state.thresholds.mq2Max ||
    state.mq7 >= state.thresholds.mq7Max ||
    state.envStatus === "DANGER"
  );

  // Render Card UI
  renderCardsUI(isDanger);

  // Push to history
  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  state.history.push({
    time: timeStr,
    temp: state.temp,
    humidity: state.humidity,
    mq2: state.mq2,
    mq7: state.mq7
  });
  if (state.history.length > 25) state.history.shift();

  // Redraw Canvas Chart
  drawChart();
}

// --- RENDER TELEMETRY CARDS & EMERGENCY BANNER ---
function renderCardsUI(isDanger) {
  // DHT22 (Suhu & Kelembaban)
  const elValTemp = document.getElementById('valTemp');
  const elValHum = document.getElementById('valHum');
  const badgeDHT = document.getElementById('badgeDHT');
  if (elValTemp) elValTemp.innerText = state.temp.toFixed(1);
  if (elValHum) elValHum.innerText = state.humidity;
  if (badgeDHT) {
    if (state.temp >= state.thresholds.tempMax) {
      badgeDHT.className = "px-2 py-0.5 rounded-md text-[11px] font-medium bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse";
      badgeDHT.innerText = "Overheat!";
    } else {
      badgeDHT.className = "px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20";
      badgeDHT.innerText = "Optimal";
    }
  }

  // MQ-2 (LPG, Asap, & Gas Pengelasan)
  const elValMQ2 = document.getElementById('valMQ2');
  const barMQ2 = document.getElementById('barMQ2');
  const badgeMQ2 = document.getElementById('badgeMQ2');
  if (elValMQ2) elValMQ2.innerText = state.mq2;
  const mq2Percent = Math.min(100, Math.round((state.mq2 / 600) * 100));
  if (barMQ2) barMQ2.style.width = mq2Percent + '%';
  if (badgeMQ2) {
    if (state.mq2 >= state.thresholds.mq2Max) {
      badgeMQ2.className = "px-2 py-0.5 rounded-md text-[11px] font-medium bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse";
      badgeMQ2.innerText = "SMOKE DETECTED!";
    } else {
      badgeMQ2.className = "px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20";
      badgeMQ2.innerText = "Clean Air";
    }
  }

  // MQ-7 (Karbon Monoksida / CO)
  const elValMQ7 = document.getElementById('valMQ7');
  const barMQ7 = document.getElementById('barMQ7');
  const badgeMQ7 = document.getElementById('badgeMQ7');
  if (elValMQ7) elValMQ7.innerText = state.mq7;
  const mq7Percent = Math.min(100, Math.round((state.mq7 / 120) * 100));
  if (barMQ7) barMQ7.style.width = mq7Percent + '%';
  if (badgeMQ7) {
    if (state.mq7 >= state.thresholds.mq7Max) {
      badgeMQ7.className = "px-2 py-0.5 rounded-md text-[11px] font-medium bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse";
      badgeMQ7.innerText = "TOXIC HAZARD (CO)!";
    } else {
      badgeMQ7.className = "px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20";
      badgeMQ7.innerText = "Safe (<50 PPM)";
    }
  }

  // EMERGENCY BANNER & HARDWARE ACTUATOR (GPIO 5 LED)
  const banner = document.getElementById('alertBanner');
  const bannerTitle = document.getElementById('bannerTitle');
  const bannerDesc = document.getElementById('bannerDescription');
  const bannerBadge = document.getElementById('bannerModeBadge');
  const bannerIconWrapper = document.getElementById('bannerIconWrapper');
  const bannerIcon = document.getElementById('bannerIcon');
  const actuatorVal = document.getElementById('actuatorVal');
  const ledLight = document.getElementById('hardwareLedLight');

  if (isDanger) {
    if (banner) banner.className = "relative overflow-hidden rounded-2xl p-4 sm:p-5 transition-all duration-500 border bg-red-950/40 border-red-500/60 text-red-200 neon-border-danger";
    if (bannerTitle) {
      bannerTitle.className = "font-extrabold text-sm sm:text-base tracking-wide uppercase text-red-400 flex items-center gap-2";
      bannerTitle.innerHTML = `⚠️ DANGER: KUALITAS UDARA BENGKEL KRITIS!`;
    }
    if (bannerBadge) {
      bannerBadge.className = "text-[10px] font-mono px-2 py-0.5 rounded bg-red-500/30 text-red-200 border border-red-500/50 animate-pulse";
      bannerBadge.innerText = "SOP EVAKUASI AKTIF";
    }
    if (bannerDesc) {
      bannerDesc.innerText = `Peringatan Keselamatan ESS: Suhu (${state.temp}°C), Asap MQ-2 (${state.mq2} PPM), atau Gas CO (${state.mq7} PPM) melampaui batas baku mutu K3. Indikator LED Merah & Kipas Ekstraktor Aktif!`;
    }
    if (bannerIconWrapper) {
      bannerIconWrapper.className = "flex-shrink-0 w-11 h-11 rounded-xl bg-red-500/30 border border-red-500 flex items-center justify-center text-red-400 animate-bounce";
    }
    if (bannerIcon) {
      bannerIcon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />`;
    }

    if (actuatorVal) actuatorVal.innerHTML = `<span class="text-red-400 font-extrabold animate-pulse">ACTIVE HIGH (RED ALARM + FAN)</span>`;
    if (ledLight) ledLight.className = "w-4 h-4 rounded-full bg-red-500 border-2 border-white shadow-[0_0_18px_#ef4444] animate-ping-siren";

    startSirenSound();
  } else {
    if (banner) banner.className = "relative overflow-hidden rounded-2xl p-4 sm:p-5 transition-all duration-500 border bg-emerald-950/20 border-emerald-500/30 text-emerald-300";
    if (bannerTitle) {
      bannerTitle.className = "font-bold text-sm sm:text-base tracking-wide uppercase text-emerald-400";
      bannerTitle.innerText = "Bengkel Terpantau Aman";
    }
    if (bannerBadge) {
      bannerBadge.className = "text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-white/80";
      bannerBadge.innerText = "STANDAR K3 TERPENUHI";
    }
    if (bannerDesc) {
      bannerDesc.innerText = `Udara bengkel mekatronika dalam ambang batas normal. Tidak ada akumulasi gas CO (${state.mq7} PPM) maupun asap pekat.`;
    }
    if (bannerIconWrapper) {
      bannerIconWrapper.className = "flex-shrink-0 w-11 h-11 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400";
    }
    if (bannerIcon) {
      bannerIcon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />`;
    }

    if (actuatorVal) actuatorVal.innerHTML = `<span class="text-slate-400 font-medium">STANDBY (NORMAL)</span>`;
    if (ledLight) ledLight.className = "w-4 h-4 rounded-full bg-slate-600 border border-slate-400 transition-all duration-300";

    stopSirenSound();
  }
}

// --- CANVAS GRAPH DRAWING LOGIC ---
function getCoords(index, val, maxScale, width, height, paddingLeft, paddingBottom) {
  const graphW = width - paddingLeft - 10;
  const graphH = height - paddingBottom - 10;
  const x = paddingLeft + (index / (state.history.length - 1)) * graphW;
  const y = 10 + graphH * (1 - (val / maxScale));
  return { x, y };
}

function drawChart() {
  const canvas = document.getElementById('telemetryCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;
  const paddingLeft = 35;
  const paddingBottom = 25;

  ctx.clearRect(0, 0, width, height);
  if (state.history.length < 2) return;

  const maxScale = 300;

  // Grid background lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#64748b';
  ctx.font = '10px "JetBrains Mono", monospace';

  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const yVal = Math.round((maxScale / steps) * i);
    const y = 10 + (height - paddingBottom - 10) * (1 - (i / steps));
    ctx.beginPath();
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(width - 10, y);
    ctx.stroke();
    ctx.fillText(yVal, 5, y + 3);
  }

  // Red Hazard Reference Line (Ambang MQ-2 300 PPM)
  const dangerY = 10 + (height - paddingBottom - 10) * (1 - (state.thresholds.mq2Max / maxScale));
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(paddingLeft, dangerY);
  ctx.lineTo(width - 10, dangerY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Time timestamps along bottom
  ctx.fillStyle = '#64748b';
  const labelInterval = Math.max(1, Math.floor(state.history.length / 4));
  for (let i = 0; i < state.history.length; i += labelInterval) {
    const { x } = getCoords(i, 0, maxScale, width, height, paddingLeft, paddingBottom);
    ctx.fillText(state.history[i].time, x - 15, height - 8);
  }

  // Render MQ-2 line (Amber)
  renderSeries(ctx, state.history, d => d.mq2, maxScale, '#f59e0b', 'rgba(245, 158, 11, 0.08)');

  // Render Temperature line (Cyan)
  renderSeries(ctx, state.history, d => d.temp * 4, maxScale, '#38bdf8', 'rgba(56, 189, 248, 0.08)');

  // Render MQ-7 line (Purple)
  renderSeries(ctx, state.history, d => d.mq7 * 2.5, maxScale, '#a855f7', 'rgba(168, 85, 247, 0.08)');
}

function renderSeries(ctx, data, valueAccessor, maxScale, strokeColor, fillColor) {
  const paddingLeft = 35;
  const paddingBottom = 25;
  const width = ctx.canvas.width / (window.devicePixelRatio || 1);
  const height = ctx.canvas.height / (window.devicePixelRatio || 1);
  const graphW = width - paddingLeft - 10;
  const graphH = height - paddingBottom - 10;

  ctx.beginPath();
  let firstCoord;
  data.forEach((d, idx) => {
    const val = Math.min(maxScale, valueAccessor(d));
    const x = paddingLeft + (idx / (data.length - 1)) * graphW;
    const y = 10 + graphH * (1 - (val / maxScale));
    if (idx === 0) {
      firstCoord = { x, y };
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Filled gradient underneath
  ctx.lineTo(paddingLeft + graphW, 10 + graphH);
  ctx.lineTo(firstCoord.x, 10 + graphH);
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();
}

window.addEventListener('resize', drawChart);

function setChartFilter(mode) {
  state.filter = mode;
  ['filterLive', 'filter1h', 'filter24h'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.className = "px-2.5 py-1 rounded text-slate-400 hover:text-white transition";
  });
  const activeEl = document.getElementById(mode === 'live' ? 'filterLive' : (mode === '1h' ? 'filter1h' : 'filter24h'));
  if (activeEl) activeEl.className = "px-2.5 py-1 rounded bg-cyan-500/20 text-cyan-300 font-semibold transition";
}

// --- EXPORT CSV FUNCTIONALITY ---
function exportCSVData() {
  let csv = "Timestamp,Node_ID,Temperature_C,Humidity_Percent,MQ2_Smoke_PPM,MQ7_CO_PPM,Status\n";
  state.history.forEach(row => {
    csv += `${row.time},${state.nodeId},${row.temp},${row.humidity},${row.mq2},${row.mq7},${state.envStatus}\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `ESS_Telemetry_${state.nodeId}_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// --- AI ASSISTANT CHATBOT LOGIC (ESI AGENT) ---
let chatHistory = [];

function appendUserMessage(text) {
  const feed = document.getElementById('aiChatFeed');
  if (!feed) return;
  const msg = document.createElement('div');
  msg.className = "flex gap-2 justify-end animate-fadeIn";
  msg.innerHTML = `
    <div class="bg-cyan-500/20 border border-cyan-400/30 text-cyan-100 rounded-2xl rounded-tr-none p-3 max-w-[85%] leading-relaxed">
      ${text}
    </div>
  `;
  feed.appendChild(msg);
  feed.scrollTop = feed.scrollHeight;
}

function showAITypingIndicator() {
  const feed = document.getElementById('aiChatFeed');
  if (!feed) return;
  removeAITypingIndicator();
  const indicator = document.createElement('div');
  indicator.id = 'aiTypingIndicator';
  indicator.className = 'flex gap-2.5 items-start animate-fadeIn';
  indicator.innerHTML = `
    <div class="w-6 h-6 rounded-md bg-purple-600/30 border border-purple-400/40 flex-shrink-0 flex items-center justify-center text-[10px] text-purple-300 font-bold font-mono">ESI</div>
    <div class="bg-slate-800/80 rounded-2xl rounded-tl-none p-3 border border-white/5 text-slate-400 max-w-[90%] flex items-center gap-2 text-xs">
      <span>ESI sedang menganalisis sensor...</span>
      <span class="inline-flex gap-1 items-center">
        <span class="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse"></span>
        <span class="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse [animation-delay:200ms]"></span>
        <span class="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse [animation-delay:400ms]"></span>
      </span>
    </div>
  `;
  feed.appendChild(indicator);
  feed.scrollTop = feed.scrollHeight;
}

function removeAITypingIndicator() {
  const ind = document.getElementById('aiTypingIndicator');
  if (ind) ind.remove();
}

function appendAIMessage(text) {
  removeAITypingIndicator();
  const feed = document.getElementById('aiChatFeed');
  if (!feed) return;
  const msg = document.createElement('div');
  msg.className = "flex gap-2.5 items-start animate-fadeIn";
  msg.innerHTML = `
    <div class="w-6 h-6 rounded-md bg-purple-600/30 border border-purple-400/40 flex-shrink-0 flex items-center justify-center text-[10px] text-purple-300 font-bold font-mono">ESI</div>
    <div class="bg-slate-800/80 rounded-2xl rounded-tl-none p-3 border border-white/5 text-slate-200 max-w-[90%] leading-relaxed">
      ${text}
    </div>
  `;
  feed.appendChild(msg);
  feed.scrollTop = feed.scrollHeight;
}

function handleChatSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('chatInput');
  if (!input) return;
  const prompt = input.value.trim();
  if (!prompt) return;
  input.value = '';
  appendUserMessage(prompt);
  processAIQuery(prompt);
}

function sendQuickPrompt(promptText) {
  appendUserMessage(promptText);
  processAIQuery(promptText);
}

// Terhubung ke Layer 4 FastAPI Gateway (POST /api/chat)
async function processAIQuery(query) {
  showAITypingIndicator();
  const baseBackend = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_API_URL) ? CONFIG.BACKEND_API_URL.replace(/\/+$/, "") : "";

  // 1. Coba kirim ke Backend FastAPI ESI Agent dengan timeout 20 detik & payload history
  if (baseBackend) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const res = await fetch(`${baseBackend}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true"
        },
        body: JSON.stringify({
          message: query,
          history: chatHistory
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const json = await res.json();
        if (json && json.reply) {
          removeAITypingIndicator();
          appendAIMessage(json.reply);
          chatHistory.push({ role: 'user', content: query });
          chatHistory.push({ role: 'model', content: json.reply });
          return;
        }
      }
    } catch (e) {
      console.warn("[ESS Gateway] Backend FastAPI tidak merespons, beralih ke local reasoning:", e);
    }
  }

  // 2. Fallback cerdas lokal (jika Raspberry Pi / backend offline)
  setTimeout(() => {
    removeAITypingIndicator();
    const q = query.toLowerCase();
    let reply = "";
    if (q.includes('suhu') || q.includes('temp') || q.includes('kelembapan') || q.includes('dht22')) {
      reply = `🌡️ <strong>Analisis Suhu & Kelembapan:</strong> Suhu saat ini <strong>${state.temp}°C</strong> dan Kelembapan <strong>${state.humidity}%</strong> di node <code>${state.nodeId}</code>. Ambang batas panas K3 ESS adalah ${state.thresholds.tempMax}°C. ${state.temp >= state.thresholds.tempMax ? '⚠️ <span class="text-red-400 font-bold">PERINGATAN:</span> Suhu ruang praktikum melebihi batas!' : 'Kondisi mikroklimat bengkel mekatronika terpantau sejuk dan kondusif.'}`;
    } else if (q.includes('mq-2') || q.includes('lpg') || q.includes('asap') || q.includes('gas') || q.includes('solder') || q.includes('las')) {
      reply = `🔥 <strong>Analisis Sensor Asap MQ-2:</strong> Konsentrasi asap/fume las terukur <strong>${state.mq2} PPM</strong> (Ambang batas aman: &lt; ${state.thresholds.mq2Max} PPM). ${state.mq2 >= state.thresholds.mq2Max ? '🚨 <span class="text-red-400 font-bold">BAHAYA:</span> Asap pekat hasil pengelasan/soldering menumpuk! Kipas ekstraktor otomatis diaktifkan!' : 'Ventilasi udara bersih dari asap pekat dan gas metana.'}`;
    } else if (q.includes('co') || q.includes('karbon') || q.includes('mq-7') || q.includes('beracun')) {
      reply = `⚠️ <strong>Analisis Toksisitas CO (MQ-7):</strong> Konsentrasi Karbon Monoksida terdeteksi <strong>${state.mq7} PPM</strong> (Batas bahaya keselamatan ESS: 50 PPM). ${state.mq7 >= state.thresholds.mq7Max ? '☠️ <span class="text-red-400 font-bold">DARURAT KRITIS:</span> Paparan gas CO melebihi batas 50 PPM dapat menyebabkan pusing fatal. Segera evakuasi bengkel!' : 'Kadar CO sangat rendah dan aman bagi pernapasan teknisi.'}`;
    } else if (q.includes('laporan') || q.includes('audit') || q.includes('total')) {
      const isSafe = state.temp < state.thresholds.tempMax && state.mq2 < state.thresholds.mq2Max && state.mq7 < state.thresholds.mq7Max;
      reply = `🛡️ <strong>Laporan Audit Keselamatan ESS (Bengkel Mekatronika):</strong><br>
      • <strong>Status Bengkel:</strong> ${isSafe ? '<span class="text-emerald-400 font-bold">NORMAL & AMAN</span>' : '<span class="text-red-400 font-bold animate-pulse">DARURAT (ALERT)</span>'}<br>
      • <strong>Edge Node:</strong> ${state.nodeId} (${state.isFirebaseLive ? 'Hot Buffer RTDB Live' : 'Simulator Mode'})<br>
      • <strong>Indikator Fisik LED & Kipas:</strong> ${isSafe ? 'OFF (Normal Standby)' : 'ON (Blazing Red + Fan Aktif)'}<br>
      • <strong>Telemetri:</strong> Suhu ${state.temp}°C | Lembap ${state.humidity}% | CO ${state.mq7} PPM | Asap ${state.mq2} PPM`;
    } else if (q.includes('evakuasi') || q.includes('sop') || q.includes('prosedur')) {
      reply = `💡 <strong>SOP Evakuasi Darurat ESS (Bengkel Mekatronika POLTEKOM):</strong><br>
      1. <strong>Tutup Saluran Pernapasan:</strong> Gunakan masker respirator atau kain basah bila ada asap tebal atau gas CO.<br>
      2. <strong>Matikan Mesin & Tabung Las:</strong> Segera putar katup gas asetilen/oksigen dan matikan inverter las.<br>
      3. <strong>Buka Pintu Utama Bengkel:</strong> Maksimalkan sirkulasi udara luar.<br>
      4. <strong>Evakuasi ke Titik Kumpul:</strong> Menjauh ke area lapangan terbuka di depan bengkel.`;
    } else {
      reply = `Telemetri real-time saat ini: Suhu: <strong>${state.temp}°C</strong>, MQ-7 (CO): <strong>${state.mq7} PPM</strong>, MQ-2 (Asap): <strong>${state.mq2} PPM</strong>. Semua sensor terpantau oleh edge node <code>${state.nodeId}</code>. Silakan pilih tombol pertanyaan cepat di atas atau tanyakan parameter keselamatan lainnya.`;
    }
    appendAIMessage(reply);
    chatHistory.push({ role: 'user', content: query });
    chatHistory.push({ role: 'model', content: reply });
  }, 450);
}

// --- CONFIGURATION MODAL CONTROLS ---
function openConfigModal() {
  const modal = document.getElementById('settingsModal');
  if (!modal) return;
  modal.classList.remove('opacity-0', 'pointer-events-none');

  const inputUrl = document.getElementById('cfgDbUrl');
  const inputBackend = document.getElementById('cfgBackendUrl');
  const inputNodeId = document.getElementById('cfgNodeId');
  const inputTemp = document.getElementById('cfgTempMax');
  const inputMQ2 = document.getElementById('cfgMQ2Max');
  const inputMQ7 = document.getElementById('cfgMQ7Max');

  if (inputUrl && typeof CONFIG !== 'undefined') inputUrl.value = CONFIG.FIREBASE_DATABASE_URL || '';
  if (inputBackend && typeof CONFIG !== 'undefined') inputBackend.value = CONFIG.BACKEND_API_URL || '';
  if (inputNodeId && typeof CONFIG !== 'undefined') inputNodeId.value = CONFIG.DEFAULT_NODE_ID || 'NODE-MRS01';
  if (inputTemp) inputTemp.value = state.thresholds.tempMax;
  if (inputMQ2) inputMQ2.value = state.thresholds.mq2Max;
  if (inputMQ7) inputMQ7.value = state.thresholds.mq7Max;
}

function closeConfigModal() {
  const modal = document.getElementById('settingsModal');
  if (modal) modal.classList.add('opacity-0', 'pointer-events-none');
}

async function testFirebaseConnection() {
  const spinner = document.getElementById('testSpinner');
  const label = document.getElementById('testBtnLabel');
  const inputUrl = document.getElementById('cfgDbUrl');
  if (spinner) spinner.classList.remove('hidden');
  if (label) label.innerText = 'Connecting...';

  const testUrl = inputUrl ? inputUrl.value.trim() : (CONFIG.FIREBASE_DATABASE_URL || '');
  let success = false;

  if (testUrl) {
    try {
      const res = await fetch(testUrl);
      if (res.ok) success = true;
    } catch(e) {
      success = false;
    }
  }

  setTimeout(() => {
    if (spinner) spinner.classList.add('hidden');
    if (label) {
      label.innerText = success ? 'Connected! (HTTP 200 OK)' : 'Offline / Check URL';
      setTimeout(() => { label.innerText = 'Test Connection'; }, 3000);
    }
  }, 600);
}

function saveConfiguration() {
  const inputUrl = document.getElementById('cfgDbUrl');
  const inputBackend = document.getElementById('cfgBackendUrl');
  const inputNodeId = document.getElementById('cfgNodeId');
  const inputTemp = document.getElementById('cfgTempMax');
  const inputMQ2 = document.getElementById('cfgMQ2Max');
  const inputMQ7 = document.getElementById('cfgMQ7Max');

  if (inputUrl && typeof CONFIG !== 'undefined') {
    CONFIG.FIREBASE_DATABASE_URL = inputUrl.value.trim();
    localStorage.setItem("ess_cfg_db_url", CONFIG.FIREBASE_DATABASE_URL);
  }
  if (inputBackend && typeof CONFIG !== 'undefined') {
    CONFIG.BACKEND_API_URL = inputBackend.value.trim();
    localStorage.setItem("ess_cfg_backend_url", CONFIG.BACKEND_API_URL);
  }
  if (inputNodeId && typeof CONFIG !== 'undefined') {
    CONFIG.DEFAULT_NODE_ID = inputNodeId.value.trim();
    localStorage.setItem("ess_cfg_node_id", CONFIG.DEFAULT_NODE_ID);
    state.nodeId = CONFIG.DEFAULT_NODE_ID;
  }

  const tempMax = parseFloat(inputTemp ? inputTemp.value : 35);
  const mq2Max = parseFloat(inputMQ2 ? inputMQ2.value : 300);
  const mq7Max = parseFloat(inputMQ7 ? inputMQ7.value : 50);

  if (!isNaN(tempMax)) {
    state.thresholds.tempMax = tempMax;
    localStorage.setItem("ess_cfg_temp_max", tempMax);
  }
  if (!isNaN(mq2Max)) {
    state.thresholds.mq2Max = mq2Max;
    localStorage.setItem("ess_cfg_mq2_max", mq2Max);
  }
  if (!isNaN(mq7Max)) {
    state.thresholds.mq7Max = mq7Max;
    localStorage.setItem("ess_cfg_mq7_max", mq7Max);
  }

  closeConfigModal();
  appendAIMessage(`⚙️ <strong>Konfigurasi Disimpan:</strong> Node ID: <code>${state.nodeId}</code>, Gateway: <code>${CONFIG.BACKEND_API_URL}</code>, Ambang Batas: Suhu ${state.thresholds.tempMax}°C, CO ${state.thresholds.mq7Max} PPM.`);
  updateTelemetry();
}

// --- BOOTSTRAP ---
window.addEventListener('DOMContentLoaded', () => {
  initializeHistoricalData();
  drawChart();
  updateTelemetry();
  // Tick pembaruan setiap interval polling (default 2 detik)
  const interval = (typeof CONFIG !== 'undefined' && CONFIG.POLL_INTERVAL) ? CONFIG.POLL_INTERVAL : 2000;
  setInterval(updateTelemetry, interval);
});
