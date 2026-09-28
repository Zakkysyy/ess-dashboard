/**
 * ==============================================================================
 * Smart Environmental Sensing System (ESS) - Frontend Configuration
 * Bengkel Mekatronika Politeknik Kota Malang (POLTEKOM)
 * Mengikuti Konstitusi RULEBOOK.md & Kontrak Arsitektur 5-Layer README.md
 * ==============================================================================
 */

const CONFIG = {
  // 1. Layer 2 Transport: Hot Buffer Firebase Realtime Database
  FIREBASE_DATABASE_URL: "https://environmental-sensing-f6e1c-default-rtdb.asia-southeast1.firebasedatabase.app/telemetry/buffer.json",

  // 2. Layer 4 Intelligence: FastAPI Gateway & ESI AI Agent (Raspberry Pi 3B on-premise via Ngrok)
  BACKEND_API_URL: "https://entrap-glamour-spectrum.ngrok-free.dev",

  // 3. Identitas Perangkat Edge Default
  DEFAULT_NODE_ID: "NODE-MRS01",

  // 4. Polling Interval (milidetik: 2000 = 2 detik)
  POLL_INTERVAL: 2000,

  // 5. Ambang Batas Keselamatan ESS (Pilar 1 RULEBOOK: Standar K3 Bengkel)
  THRESHOLDS: {
    TEMP_MAX: 35.0, // Batas Suhu Panas (°C)
    MQ2_MAX: 300,   // Batas Gas Asap / Pengelasan (PPM)
    MQ7_MAX: 50     // Batas Bahaya Keracunan Gas Karbon Monoksida / CO (PPM)
  }
};

// Muat konfigurasi tersimpan dari LocalStorage browser jika ada perubahan via Settings Modal
(function loadSavedConfig() {
  const savedDbUrl = localStorage.getItem("ess_cfg_db_url");
  const savedBackendUrl = localStorage.getItem("ess_cfg_backend_url");
  const savedNodeId = localStorage.getItem("ess_cfg_node_id");
  const savedTempMax = localStorage.getItem("ess_cfg_temp_max");
  const savedMq2Max = localStorage.getItem("ess_cfg_mq2_max");
  const savedMq7Max = localStorage.getItem("ess_cfg_mq7_max");

  if (savedDbUrl !== null && savedDbUrl.trim() !== "") CONFIG.FIREBASE_DATABASE_URL = savedDbUrl;
  if (savedBackendUrl !== null && savedBackendUrl.trim() !== "") CONFIG.BACKEND_API_URL = savedBackendUrl;
  if (savedNodeId !== null && savedNodeId.trim() !== "") CONFIG.DEFAULT_NODE_ID = savedNodeId;
  if (savedTempMax !== null) CONFIG.THRESHOLDS.TEMP_MAX = parseFloat(savedTempMax);
  if (savedMq2Max !== null) CONFIG.THRESHOLDS.MQ2_MAX = parseFloat(savedMq2Max);
  if (savedMq7Max !== null) CONFIG.THRESHOLDS.MQ7_MAX = parseFloat(savedMq7Max);
})();
