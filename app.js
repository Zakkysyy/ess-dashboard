/**
 * ==============================================================================
 * Smart Environmental Sensing System (ESS) - Frontend Engine & Data Stream Controller
 * Bengkel Mekatronika Politeknik Kota Malang (POLTEKOM)
 * Mengikuti Konstitusi RULEBOOK.md & Kontrak Arsitektur 5-Layer
 * ==============================================================================
 */

// --- 1. GLOBAL STATE ---
let isSimulatedDanger = false;
let isRealDanger = false;
let audioAllowed = true;
let audioCtx = null;
let sirenOsc = null;
let sirenTimer = null;
let chatHistory = [];

// Data sensor real-time terkini
let currentSensorState = {
  temp: 25.0,
  hum: 52.0,
  mq7_ppm: 5,
  mq2_ppm: 20,
  status: "NORMAL",
  nodeId: "NODE-MRS01",
  lastUpdated: null
};

// --- 2. CAROUSEL KAMPUS POLTEKOM ---
let currentSlideIndex = 0;
const totalSlides = 3;
let slideTimer = null;

function updateSlidePosition() {
  const track = document.getElementById('carouselTrack');
  if (track) {
    track.style.transform = `translateX(-${currentSlideIndex * 100}%)`;
  }
  const dots = document.querySelectorAll('.carousel-dot');
  dots.forEach((dot, idx) => {
    if (idx === currentSlideIndex) {
      dot.className = 'carousel-dot w-6 h-2 rounded-full bg-emerald-400 transition-all duration-300';
    } else {
      dot.className = 'carousel-dot w-2 h-2 rounded-full bg-white/40 hover:bg-white/80 transition-all duration-300';
    }
  });
}

function nextSlide() {
  currentSlideIndex = (currentSlideIndex + 1) % totalSlides;
  updateSlidePosition();
  restartSlideTimer();
}

function prevSlide() {
  currentSlideIndex = (currentSlideIndex - 1 + totalSlides) % totalSlides;
  updateSlidePosition();
  restartSlideTimer();
}

function goToSlide(idx) {
  currentSlideIndex = idx;
  updateSlidePosition();
  restartSlideTimer();
}

function restartSlideTimer() {
  if (slideTimer) clearInterval(slideTimer);
  slideTimer = setInterval(() => {
    currentSlideIndex = (currentSlideIndex + 1) % totalSlides;
    updateSlidePosition();
  }, 5000);
}

// --- 3. WEB AUDIO SIREN ALARM ---
function initAudio() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audioCtx = new AudioContextClass();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function startSiren() {
  if (!audioAllowed) return;
  initAudio();
  if (!audioCtx || sirenOsc) return;

  try {
    sirenOsc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    sirenOsc.type = 'sawtooth';
    sirenOsc.frequency.setValueAtTime(650, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(0.04, audioCtx.currentTime);
    sirenOsc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    sirenOsc.start();

    let toggle = false;
    sirenTimer = setInterval(() => {
      if (!sirenOsc || !audioCtx) return;
      toggle = !toggle;
      sirenOsc.frequency.setValueAtTime(toggle ? 1100 : 650, audioCtx.currentTime);
    }, 450);
  } catch (e) {
    console.warn("[Siren Warning] Autoplay audio restricted:", e);
  }
}

function stopSiren() {
  if (sirenTimer) {
    clearInterval(sirenTimer);
    sirenTimer = null;
  }
  if (sirenOsc) {
    try { sirenOsc.stop(); } catch (e) {}
    sirenOsc.disconnect();
    sirenOsc = null;
  }
}

function toggleAudio() {
  audioAllowed = !audioAllowed;
  const icon = document.getElementById('audioIcon');
  const btn = document.getElementById('btnAudioMute');
  if (!icon || !btn) return;

  if (audioAllowed) {
    icon.innerText = 'volume_up';
    btn.classList.remove('text-red-400', 'border-red-500/40');
    btn.classList.add('text-slate-300');
    if (isSimulatedDanger || isRealDanger) startSiren();
  } else {
    icon.innerText = 'volume_off';
    btn.classList.add('text-red-400', 'border-red-500/40');
    btn.classList.remove('text-slate-300');
    stopSiren();
  }
}

// --- 4. TOGGLE MANUAL SIMULASI BAHAYA ---
function toggleDangerSimulation() {
  isSimulatedDanger = !isSimulatedDanger;
  applyDisplay(currentSensorState);
}

// --- 5. RENDER UI KE TAMPILAN DASHBOARD ---
function applyDisplay(state) {
  const isDanger = isSimulatedDanger || isRealDanger;

  // Tombol Simulasi
  const btnLabel = document.getElementById('btnDangerLabel');
  const btnIcon = document.getElementById('btnDangerIcon');
  const btnDanger = document.getElementById('btnDangerToggle');
  if (btnLabel && btnIcon && btnDanger) {
    if (isSimulatedDanger) {
      btnLabel.innerText = "Kembalikan ke Normal (Live Sync)";
      btnIcon.innerText = "✅";
      btnDanger.className = "group px-4 py-2 rounded-xl bg-red-600 text-white font-semibold text-xs flex items-center gap-2 transition-all shadow-lg shadow-red-600/50 scale-105";
    } else {
      btnLabel.innerText = "Simulasi Status: Bahaya";
      btnIcon.innerText = "🚨";
      btnDanger.className = "group px-4 py-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/35 text-red-200 text-xs font-semibold flex items-center gap-2 transition-all shadow-md active:scale-95";
    }
  }

  // Header System Status Pill
  const statusPill = document.getElementById('systemStatusPill');
  const statusText = document.getElementById('systemStatusText');
  if (statusText) {
    if (isDanger) {
      statusText.innerHTML = `<span class="text-red-400 font-bold">${state.nodeId}: DANGER ALERT</span>`;
      if (statusPill) statusPill.className = "hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 text-xs font-medium animate-pulse";
    } else {
      statusText.innerText = `${state.nodeId} (Live Connected)`;
      if (statusPill) statusPill.className = "hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs font-medium";
    }
  }

  // 1. Banner Status Utama
  const bannerGlow = document.getElementById('bannerGlow');
  if (bannerGlow) {
    bannerGlow.className = isDanger
      ? "absolute -right-16 -top-16 w-80 h-80 bg-red-600/30 rounded-full blur-3xl pointer-events-none transition-colors duration-500"
      : "absolute -right-16 -top-16 w-80 h-80 bg-sky-500/15 rounded-full blur-3xl pointer-events-none transition-colors duration-500";
  }

  // 2. Card 1: Suhu & Kelembapan (DHT22)
  const cardComfort = document.getElementById('cardComfort');
  const badgeComfort = document.getElementById('badgeComfort');
  const displayComfort = document.getElementById('displayComfort');
  const badgeHumidity = document.getElementById('badgeHumidity');
  const barComfort = document.getElementById('barComfort');
  const summaryComfort = document.getElementById('summaryComfort');

  const tempVal = isSimulatedDanger ? 41.5 : (state.temp || 25.0);
  const humVal = isSimulatedDanger ? 32.0 : (state.hum || 52.0);

  if (displayComfort) {
    if (tempVal > 35.0) {
      displayComfort.innerText = `${tempVal.toFixed(1)}°C • Suhu Panas Ekstrem!`;
      displayComfort.className = "text-2xl sm:text-3xl font-extrabold text-red-400 tracking-tight drop-shadow-sm";
      if (badgeComfort) {
        badgeComfort.className = "px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500/25 text-red-300 border border-red-500/40 animate-pulse";
        badgeComfort.innerText = "Overheat!";
      }
      if (summaryComfort) {
        summaryComfort.className = "font-bold text-red-400 flex items-center gap-1 text-xs";
        summaryComfort.innerHTML = "<span>⚠️</span> Suhu ruangan melebihi batas aman!";
      }
      if (cardComfort) cardComfort.className = "rounded-2xl p-4 sm:p-5 border border-red-500/50 bg-red-950/30 relative overflow-hidden flex flex-col justify-between backdrop-blur-md";
    } else {
      displayComfort.innerText = `${tempVal.toFixed(1)}°C • Suhu Nyaman & Sejuk`;
      displayComfort.className = "text-2xl sm:text-3xl font-extrabold text-white tracking-tight drop-shadow-sm";
      if (badgeComfort) {
        badgeComfort.className = "px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-500/20 text-sky-300 border border-sky-400/30 flex-shrink-0";
        badgeComfort.innerText = "Optimal";
      }
      if (summaryComfort) {
        summaryComfort.className = "font-bold text-emerald-400 flex items-center gap-1 text-xs";
        summaryComfort.innerHTML = "<span>✅</span> Sangat nyaman untuk riset & praktikum";
      }
      if (cardComfort) cardComfort.className = "rounded-2xl p-4 sm:p-5 border border-sky-400/30 relative overflow-hidden flex flex-col justify-between backdrop-blur-md transition-all duration-300 hover:border-white/20";
    }
  }

  if (badgeHumidity) {
    badgeHumidity.innerHTML = `<span>💧</span> Kelembapan ${humVal.toFixed(1)}%`;
  }
  if (barComfort) {
    const comfortPercent = Math.min(Math.max((tempVal / 50) * 100, 10), 100);
    barComfort.style.width = `${comfortPercent}%`;
  }

  // 3. Card 2: Asap & Gas Mudah Terbakar (MQ-2)
  const cardSmoke = document.getElementById('cardSmoke');
  const badgeSmoke = document.getElementById('badgeSmoke');
  const displaySmoke = document.getElementById('displaySmoke');
  const labelSmokeRisk = document.getElementById('labelSmokeRisk');
  const barSmoke = document.getElementById('barSmoke');
  const summarySmoke = document.getElementById('summarySmoke');
  const iconSmokeBox = document.getElementById('iconSmokeBox');

  const mq2Val = isSimulatedDanger ? 1000 : (state.mq2_ppm || 0);

  if (displaySmoke) {
    if (mq2Val > 300) {
      displaySmoke.innerText = `BAHAYA! TERDETEKSI ASAP (${mq2Val} PPM)`;
      displaySmoke.className = "text-2xl sm:text-3xl font-extrabold text-red-400 tracking-tight drop-shadow-sm";
      if (badgeSmoke) {
        badgeSmoke.className = "px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500/30 text-red-200 border border-red-500/50 animate-pulse";
        badgeSmoke.innerText = "Risiko Tinggi!";
      }
      if (labelSmokeRisk) labelSmokeRisk.innerText = "Sensor mendeteksi kepulan asap pekat atau kebocoran gas LPG mudah terbakar!";
      if (summarySmoke) {
        summarySmoke.className = "font-bold text-red-400 flex items-center gap-1 text-xs";
        summarySmoke.innerHTML = "<span>🚨</span> Waspada bahaya kebakaran atau kebocoran gas!";
      }
      if (iconSmokeBox) {
        iconSmokeBox.className = "w-11 h-11 rounded-xl bg-red-500/30 border border-red-500/50 flex items-center justify-center text-2xl shadow-sm text-red-400 animate-pulse";
        iconSmokeBox.innerText = "🔥";
      }
      if (cardSmoke) cardSmoke.className = "rounded-2xl p-4 sm:p-5 border border-red-500/60 bg-red-950/35 relative overflow-hidden flex flex-col justify-between backdrop-blur-md";
    } else {
      displaySmoke.innerText = `BERSIH (${mq2Val} PPM • Aman)`;
      displaySmoke.className = "text-2xl sm:text-3xl font-extrabold text-emerald-400 tracking-tight drop-shadow-sm";
      if (badgeSmoke) {
        badgeSmoke.className = "px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex-shrink-0";
        badgeSmoke.innerText = "0% Risiko";
      }
      if (labelSmokeRisk) labelSmokeRisk.innerText = "Sensor tidak menemukan adanya kepulan asap kebakaran maupun kebocoran gas LPG.";
      if (summarySmoke) {
        summarySmoke.className = "font-bold text-emerald-400 flex items-center gap-1 text-xs";
        summarySmoke.innerHTML = "<span>🛡️</span> Aman dari kebakaran & kebocoran LPG";
      }
      if (iconSmokeBox) {
        iconSmokeBox.className = "w-11 h-11 rounded-xl bg-emerald-500/20 border border-emerald-400/35 flex items-center justify-center text-2xl shadow-sm";
        iconSmokeBox.innerText = "🛡️";
      }
      if (cardSmoke) cardSmoke.className = "rounded-2xl p-4 sm:p-5 border border-emerald-500/30 relative overflow-hidden flex flex-col justify-between backdrop-blur-md transition-all duration-300 hover:border-white/20";
    }
  }
  if (barSmoke) {
    const smokePercent = Math.min(Math.max((mq2Val / 1000) * 100, 8), 100);
    barSmoke.style.width = `${smokePercent}%`;
  }

  // 4. Card 3: Gas Karbon Monoksida (MQ-7)
  const cardTox = document.getElementById('cardTox');
  const badgeTox = document.getElementById('badgeTox');
  const displayTox = document.getElementById('displayTox');
  const labelToxDesc = document.getElementById('labelToxDesc');
  const barTox = document.getElementById('barTox');
  const summaryTox = document.getElementById('summaryTox');
  const iconToxBox = document.getElementById('iconToxBox');

  const mq7Val = isSimulatedDanger ? 150 : (state.mq7_ppm || 0);

  if (displayTox) {
    if (mq7Val > 50) {
      displayTox.innerText = `TERCEMAR GAS CO (${mq7Val} PPM)`;
      displayTox.className = "text-2xl sm:text-3xl font-extrabold text-red-400 tracking-tight drop-shadow-sm";
      if (badgeTox) {
        badgeTox.className = "px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500/30 text-red-200 border border-red-500/50 animate-pulse";
        badgeTox.innerText = "Berbahaya!";
      }
      if (labelToxDesc) labelToxDesc.innerText = "Kandungan Karbon Monoksida (CO) beracun jika terhirup. Buka ventilasi dan nyalakan exhaust fan!";
      if (summaryTox) {
        summaryTox.className = "font-bold text-red-400 flex items-center gap-1 text-xs";
        summaryTox.innerHTML = "<span>☠️</span> Terdeteksi konsentrasi gas CO beracun!";
      }
      if (iconToxBox) {
        iconToxBox.className = "w-11 h-11 rounded-xl bg-red-500/30 border border-red-500/50 flex items-center justify-center text-2xl shadow-sm text-red-400 animate-pulse";
        iconToxBox.innerText = "⚠️";
      }
      if (cardTox) cardTox.className = "rounded-2xl p-4 sm:p-5 border border-red-500/60 bg-red-950/35 relative overflow-hidden flex flex-col justify-between backdrop-blur-md";
    } else {
      displayTox.innerText = `BEBAS RACUN (${mq7Val} PPM CO)`;
      displayTox.className = "text-2xl sm:text-3xl font-extrabold text-teal-300 tracking-tight drop-shadow-sm";
      if (badgeTox) {
        badgeTox.className = "px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30 flex-shrink-0";
        badgeTox.innerText = "Sangat Bersih";
      }
      if (labelToxDesc) labelToxDesc.innerText = "Kadar udara murni dan sangat bersih untuk dihirup oleh mahasiswa dan teknisi lab.";
      if (summaryTox) {
        summaryTox.className = "font-bold text-emerald-400 flex items-center gap-1 text-xs";
        summaryTox.innerHTML = "<span>🍃</span> Kadar Karbon Monoksida dalam batas aman";
      }
      if (iconToxBox) {
        iconToxBox.className = "w-11 h-11 rounded-xl bg-teal-500/20 border border-teal-400/35 flex items-center justify-center text-2xl shadow-sm";
        iconToxBox.innerText = "🫁";
      }
      if (cardTox) cardTox.className = "rounded-2xl p-4 sm:p-5 border border-teal-500/30 relative overflow-hidden flex flex-col justify-between backdrop-blur-md transition-all duration-300 hover:border-white/20";
    }
  }
  if (barTox) {
    const toxPercent = Math.min(Math.max((mq7Val / 100) * 100, 5), 100);
    barTox.style.width = `${toxPercent}%`;
  }

  // Siren Trigger
  if (isDanger) {
    startSiren();
  } else {
    stopSiren();
  }
}

// --- 6. REAL-TIME DATA STREAM (FIREBASE RTDB POLLING) ---
async function fetchLatestTelemetry() {
  if (typeof CONFIG === 'undefined' || !CONFIG.FIREBASE_DATABASE_URL) return;

  try {
    const res = await fetch(CONFIG.FIREBASE_DATABASE_URL);
    if (!res.ok) return;

    const data = await res.json();
    if (!data) return;

    const keys = Object.keys(data);
    if (keys.length === 0) return;

    // Ambil data terbaru berdasarkan key atau timestamp
    const latestKey = keys[keys.length - 1];
    const record = data[latestKey];
    if (!record) return;

    // Update state sensor
    currentSensorState.temp = parseFloat(record.temp || record.temperature || 25.0);
    currentSensorState.hum = parseFloat(record.hum || record.humidity || 50.0);
    currentSensorState.mq7_ppm = parseInt(record.mq7_ppm || record.mq7 || 0, 10);
    currentSensorState.mq2_ppm = parseInt(record.mq2_ppm || record.mq2 || 0, 10);
    currentSensorState.nodeId = record.node_id || record.device_id || "NODE-MRS01";
    currentSensorState.status = record.status || "NORMAL";
    currentSensorState.lastUpdated = new Date();

    // Deteksi bahaya riil dari sensor fisik
    const isOverheat = currentSensorState.temp > (CONFIG.THRESHOLDS?.TEMP_MAX || 35.0);
    const isGasDanger = currentSensorState.mq2_ppm > (CONFIG.THRESHOLDS?.MQ2_MAX || 300);
    const isToxDanger = currentSensorState.mq7_ppm > (CONFIG.THRESHOLDS?.MQ7_MAX || 50);

    isRealDanger = (currentSensorState.status === "DANGER") || isOverheat || isGasDanger || isToxDanger;

    // Terapkan ke tampilan UI
    applyDisplay(currentSensorState);

  } catch (err) {
    console.warn("[Firebase RTDB] Fetch stream error:", err);
  }
}

// --- 7. ESI (ENVIRONMENTAL SENSING INTELLIGENCE) CHATBOT SYSTEM ---
function appendUserMessage(text) {
  const feed = document.getElementById('chatFeed');
  if (!feed) return;
  const div = document.createElement('div');
  div.className = "flex gap-2 justify-end animate-fadeIn";
  div.innerHTML = `
    <div class="bg-sky-500/25 border border-sky-400/35 text-sky-100 rounded-2xl rounded-tr-none px-4 py-2.5 max-w-[85%] leading-relaxed shadow-sm">
      ${text}
    </div>
  `;
  feed.appendChild(div);
  feed.scrollTop = feed.scrollHeight;
}

function showTypingIndicator() {
  removeTypingIndicator();
  const feed = document.getElementById('chatFeed');
  if (!feed) return;
  const ind = document.createElement('div');
  ind.id = "typingIndicator";
  ind.className = "flex gap-3 items-center animate-fadeIn";
  ind.innerHTML = `
    <div class="w-8 h-8 rounded-xl bg-indigo-600/35 border border-indigo-400/30 flex-shrink-0 flex items-center justify-center text-base shadow-sm">🤖</div>
    <div class="bg-slate-900/80 rounded-2xl rounded-tl-none p-3 border border-white/10 text-slate-300 text-xs flex items-center gap-2">
      <span>ESI sedang menganalisis data sensor...</span>
      <span class="inline-flex gap-1">
        <span class="w-1.5 h-1.5 bg-sky-400 rounded-full typing-dot"></span>
        <span class="w-1.5 h-1.5 bg-sky-400 rounded-full typing-dot"></span>
        <span class="w-1.5 h-1.5 bg-sky-400 rounded-full typing-dot"></span>
      </span>
    </div>
  `;
  feed.appendChild(ind);
  feed.scrollTop = feed.scrollHeight;
}

function removeTypingIndicator() {
  const ind = document.getElementById('typingIndicator');
  if (ind) ind.remove();
}

function appendBotMessage(text) {
  removeTypingIndicator();
  const feed = document.getElementById('chatFeed');
  if (!feed) return;
  const div = document.createElement('div');
  div.className = "flex gap-3 items-start animate-fadeIn";
  div.innerHTML = `
    <div class="w-8 h-8 rounded-xl bg-indigo-600/35 border border-indigo-400/30 flex-shrink-0 flex items-center justify-center text-base shadow-sm">
      🤖
    </div>
    <div class="bg-slate-900/80 rounded-2xl rounded-tl-none p-3.5 border border-white/10 text-slate-100 max-w-[90%] leading-relaxed shadow-sm">
      ${text}
    </div>
  `;
  feed.appendChild(div);
  feed.scrollTop = feed.scrollHeight;
}

function askPrompt(question) {
  appendUserMessage(question);
  processChatQuery(question);
}

function handleUserSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('inputMessage');
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;
  input.value = '';
  appendUserMessage(val);
  processChatQuery(val);
}

// Terhubung ke Layer 4 FastAPI Gateway (POST /api/chat) dengan timeout 20 detik & payload history
async function processChatQuery(query) {
  showTypingIndicator();
  const baseBackend = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_API_URL) ? CONFIG.BACKEND_API_URL.replace(/\/+$/, "") : "";

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
          removeTypingIndicator();
          appendBotMessage(json.reply);
          chatHistory.push({ role: 'user', content: query });
          chatHistory.push({ role: 'model', content: json.reply });
          return;
        }
      }
    } catch (e) {
      console.warn("[ESS Gateway] FastAPI Gateway tidak merespons, beralih ke local reasoning:", e);
    }
  }

  // Local Reasoning Fallback
  setTimeout(() => {
    removeTypingIndicator();
    const q = query.toLowerCase();
    const isDanger = isSimulatedDanger || isRealDanger;
    let answer = "";

    if (q.includes('sehat') || q.includes('kualitas') || q.includes('udara')) {
      if (isDanger) {
        answer = "⚠️ <strong>Status Udara Lab: WASPADA!</strong> Sensor mendeteksi kenaikan partikel asap dan gas di ruangan. Disarankan membuka pintu/jendela atau segera evakuasi ke tempat terbuka.";
      } else {
        answer = `🍃 <strong>Udara Sangat Sehat & Bersih!</strong> Kadar Karbon Monoksida (CO) terpantau <strong>${currentSensorState.mq7_ppm} PPM</strong> (jauh di bawah batas bahaya 50 PPM). Sirkulasi udara ruangan sangat baik untuk kegiatan praktikum.`;
      }
    } else if (q.includes('suhu') || q.includes('panas') || q.includes('dingin') || q.includes('cuaca') || q.includes('temp')) {
      answer = `🌡️ Suhu ruangan saat ini tercatat <strong>${currentSensorState.temp.toFixed(1)}°C</strong> dengan kelembapan <strong>${currentSensorState.hum.toFixed(1)}%</strong>. Suhu ${currentSensorState.temp > 35 ? 'terlalu panas' : 'sejuk dan optimal'} untuk ruangan laboratorium.`;
    } else if (q.includes('asap') || q.includes('bahaya') || q.includes('bocor') || q.includes('kebakaran') || q.includes('gas')) {
      if (isDanger) {
        answer = `🚨 <strong>PERINGATAN BAHAYA:</strong> Sensor MQ-2 mendeteksi konsentrasi asap/gas sebesar <strong>${currentSensorState.mq2_ppm} PPM</strong>! Segera periksa sumber panas, kompor solder, atau tabung gas.`;
      } else {
        answer = `🛡️ <strong>Alhamdulillah aman!</strong> Sensor MQ-2 mendeteksi konsentrasi asap sebesar <strong>${currentSensorState.mq2_ppm} PPM</strong> (Batas aman < 300 PPM). Tidak ada indikasi kebakaran atau kebocoran gas LPG.`;
      }
    } else if (q.includes('tips') || q.includes('hemat') || q.includes('jaga') || q.includes('k3')) {
      answer = "💡 <strong>Tips Keselamatan & K3 Laboratorium:</strong><br>1. Matikan solder dan alat pemanas listrik setelah selesai digunakan.<br>2. Pastikan ventilasi udara terbuka saat melakukan praktikum pengelasan atau perakitan.<br>3. Hubungi teknisi bengkel jika alarm sensor gas menyala.";
    } else {
      answer = `Terima kasih pertanyaannya! Berdasarkan pembacaan sensor node <code>${currentSensorState.nodeId}</code> secara langsung: Suhu: <strong>${currentSensorState.temp.toFixed(1)}°C</strong>, Kelembapan: <strong>${currentSensorState.hum.toFixed(1)}%</strong>, MQ-7 (CO): <strong>${currentSensorState.mq7_ppm} PPM</strong>, MQ-2 (Asap): <strong>${currentSensorState.mq2_ppm} PPM</strong>. Status: <strong>${currentSensorState.status}</strong>.`;
    }

    appendBotMessage(answer);
    chatHistory.push({ role: 'user', content: query });
    chatHistory.push({ role: 'model', content: answer });
  }, 400);
}

// --- 8. INITIALIZATION ON PAGE LOAD ---
document.addEventListener("DOMContentLoaded", () => {
  // Inisialisasi Carousel
  restartSlideTimer();

  // Initial UI Render
  applyDisplay(currentSensorState);

  // Polling data telemetri pertama dan berulang
  fetchLatestTelemetry();
  setInterval(fetchLatestTelemetry, (typeof CONFIG !== 'undefined' && CONFIG.POLL_INTERVAL) ? CONFIG.POLL_INTERVAL : 2500);

  console.log("🏭 Smart Environmental Sensing System (ESS) POLTEKOM initialized successfully!");
});
