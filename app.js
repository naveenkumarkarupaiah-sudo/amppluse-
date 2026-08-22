/**
 * AmpPulse - Smart Energy Monitoring System
 * Everyday User-Friendly Engine & 5s Live ESP32 Stream Generator
 */

// Application Global State
const appState = {
  voltage: 230.2, // Live Grid Voltage (V AC)
  powerFactor: 0.96, // Power Factor
  baseIrms: 4.35, // Base Current Draw (A)
  heavyLoadActive: false, // Heavy appliance load toggle (+10.0A)
  dailyUnits: 4.2, // Units used today (kWh)
  cycleUnits: 342.5, // Units used this month / 60-day billing cycle (kWh)
  cycleDay: 38,
  totalCycleDays: 60,
  maxSubsidyLimit: 500,
  timeframe: 'live',
  relayClosed: true,
  maxLivePoints: 12,
  hardwareMode: 'simulation', // 'simulation' | 'live'
  esp32Ip: '192.168.1.100'
};

// Chart & Connection Instances
let liveChartInstance = null;
let barChartInstance = null;
let simulationInterval = null;
let esp32Socket = null;
let esp32PingTimer = null;

// ======================================================================
// NAVIGATION & LOGIN MANAGEMENT
// ======================================================================

function handleLogin(event) {
  event.preventDefault();
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('dashboardScreen').classList.remove('hidden');
  
  // Initialize Charts & Telemetry Engine
  initCharts();
  startSimulationEngine();
  updateClock();
  setInterval(updateClock, 1000);

  logDemoEvent("Smart Meter connected to ESP32_HOME_01.");
}

function handleLogout() {
  document.getElementById('dashboardScreen').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
  if (simulationInterval) clearInterval(simulationInterval);
}

function switchTab(tabId) {
  const tabs = ['overview', 'subsidy', 'hardware'];
  tabs.forEach(id => {
    const viewEl = document.getElementById(`view-${id}`);
    const btnEl = document.getElementById(`tab-${id}`);
    if (id === tabId) {
      viewEl.classList.remove('hidden');
      btnEl.classList.add('active');
    } else {
      viewEl.classList.add('hidden');
      btnEl.classList.remove('active');
    }
  });

  // Trigger chart resize if needed
  if (tabId === 'overview' && liveChartInstance) {
    setTimeout(() => {
      liveChartInstance.resize();
      if (barChartInstance) barChartInstance.resize();
    }, 100);
  }
}

// ======================================================================
// TELEMETRY SIMULATION & AI ADVISOR ENGINE
// ======================================================================

function startSimulationEngine() {
  updateMetricsAndAdvisor();

  simulationInterval = setInterval(() => {
    updateMetricsAndAdvisor();
  }, 5000);
}

function updateMetricsAndAdvisor() {
  // Generate realistic sensor jitter (±0.12 A)
  const jitter = (Math.random() * 0.24) - 0.12;
  let currentIrms = appState.baseIrms + jitter;

  if (appState.heavyLoadActive) {
    currentIrms += 10.0;
  }

  currentIrms = Math.max(0.05, currentIrms);

  // Accumulate daily & cycle kWh units slightly (every 5s)
  const addedkWh = ((currentIrms * appState.voltage * appState.powerFactor) / 1000) * (5 / 3600);
  appState.dailyUnits += addedkWh;
  appState.cycleUnits += addedkWh;

  // Calculate estimated projected units for 60-day month/cycle
  const remainingDays = appState.totalCycleDays - appState.cycleDay;
  const projectedUnits = appState.cycleUnits + (appState.dailyUnits * (remainingDays / 60) * 15);

  // Calculate estimated 60-day bill
  const projectedBill = appState.cycleUnits > 200 ? (appState.cycleUnits - 200) * 4.50 : 0;

  // Render Top 4 Simplified Metric Cards
  document.getElementById('metricDailyUnits').textContent = appState.dailyUnits.toFixed(1);
  document.getElementById('metricCycleUnits').textContent = appState.cycleUnits.toFixed(1);
  
  const projMetric = document.getElementById('metricProjectedUnits');
  if (projMetric) projMetric.textContent = projectedUnits.toFixed(1);

  document.getElementById('metricEstimatedBill').textContent = `₹${Math.round(projectedBill)}`;

  // Update Cycle Progress Bar
  const cyclePercent = Math.min(100, (appState.cycleUnits / appState.maxSubsidyLimit) * 100);
  const progressBar = document.getElementById('cycleProgressBar');
  if (progressBar) {
    progressBar.style.width = `${cyclePercent.toFixed(1)}%`;
    document.getElementById('cyclePercentText').textContent = `${cyclePercent.toFixed(1)}% Used`;

    if (appState.cycleUnits >= 480) {
      progressBar.className = "bg-red-500 h-2 rounded-full";
    } else if (appState.cycleUnits >= 450) {
      progressBar.className = "bg-amber-500 h-2 rounded-full";
    } else {
      progressBar.className = "bg-emerald-500 h-2 rounded-full";
    }
  }

  // --------------------------------------------------------------------
  // SMART AI USAGE ADVISOR ENGINE
  // --------------------------------------------------------------------
  const bannerEl = document.getElementById('anomalyAlertBanner');
  const iconBox = document.getElementById('anomalyIconBox');
  const titleEl = document.getElementById('anomalyStatusTitle');
  const detailEl = document.getElementById('anomalyStatusDetail');

  if (appState.heavyLoadActive || currentIrms > 8.0) {
    // HIGH APPLIANCE LOAD WARNING
    bannerEl.className = "p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all duration-300 shadow-sm";
    iconBox.className = "w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center text-lg font-bold flex-shrink-0 animate-pulse";
    iconBox.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i>`;
    
    titleEl.className = "text-xs font-bold uppercase tracking-wider text-amber-800 block";
    titleEl.textContent = "⚠️ High Appliance Power Consumption Warning";
    
    detailEl.innerHTML = `High appliance load detected (${currentIrms.toFixed(1)} A draw). At this rate, your projected cycle will breach <strong class="text-amber-800 font-mono">${projectedUnits.toFixed(1)} Units</strong>. Turn off heavy appliances to protect your ₹600 subsidy!`;
  } else {
    // NORMAL SAFE BEHAVIOR
    bannerEl.className = "p-4 bg-[#FAF7F2] border border-[#EAE6DF] rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all duration-300 shadow-sm";
    iconBox.className = "w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-lg font-bold flex-shrink-0";
    iconBox.innerHTML = `<i class="fa-solid fa-circle-check"></i>`;
    
    titleEl.className = "text-xs font-bold uppercase tracking-wider text-emerald-800 block";
    titleEl.textContent = "AI Energy Guidance: Excellent";
    
    detailEl.innerHTML = `At your current burn rate, your 60-day cycle will reach <strong class="text-emerald-600 font-mono">${projectedUnits.toFixed(1)} Units</strong>. You are in the SAFE GREEN ZONE preserving ~₹600 state subsidy!`;
  }

  // --------------------------------------------------------------------
  // SUBSIDY MODULE CALCULATIONS (TAB 2)
  // --------------------------------------------------------------------
  updateSubsidyTabMetrics(projectedUnits);

  // Stream data to sensor console (Tab 3)
  appendSensorLogStream(currentIrms.toFixed(2));

  // Push dataset to Live Line Chart
  pushLiveChartData((currentIrms * appState.voltage * appState.powerFactor).toFixed(0));
}

function updateSubsidyTabMetrics(projectedUnits) {
  const remainingDays = appState.totalCycleDays - appState.cycleDay;

  let protectionScore = 96;
  let scoreBadgeClass = "badge-emerald";
  let scoreBadgeText = "MAXIMUM PROTECTION";
  let descriptionText = "200 Free Units Intact — Preserving ~₹600 State Subsidy";
  let strokeColor = "#10B981";
  let savingsRupees = "₹600.00";
  let dailyHeadroom = `${Math.max(0, ((500 - appState.cycleUnits) / remainingDays)).toFixed(1)} Units/Day`;

  if (appState.cycleUnits >= 480 || projectedUnits >= 480) {
    protectionScore = Math.max(12, Math.round(100 - ((appState.cycleUnits / 500) * 85)));
    scoreBadgeClass = "badge-crimson";
    scoreBadgeText = "HIGH RISK — PENALTY BREACH";
    descriptionText = "Immediate Load Reduction Required! 200 Free Units Forfeiture Near.";
    strokeColor = "#EF4444";
    savingsRupees = "₹0.00 (Risk of Penalty)";
    dailyHeadroom = "0.0 Units/Day (EXCEEDED)";
  } else if (appState.cycleUnits >= 450 || projectedUnits >= 450) {
    protectionScore = Math.round(85 - (((appState.cycleUnits - 450) / 30) * 25));
    scoreBadgeClass = "badge-amber";
    scoreBadgeText = "MODERATE RISK THRESHOLD";
    descriptionText = "Approaching Penalty Limit — Reduce Heavy Appliance Usage";
    strokeColor = "#F59E0B";
    savingsRupees = "₹320.00 (Partial Risk)";
    dailyHeadroom = `${Math.max(0, ((480 - appState.cycleUnits) / remainingDays)).toFixed(1)} Units/Day`;
  } else {
    protectionScore = Math.min(100, Math.round(100 - ((appState.cycleUnits / 450) * 10)));
    scoreBadgeClass = "badge-emerald";
    scoreBadgeText = "MAXIMUM PROTECTION";
    descriptionText = "200 Free Units Intact — Preserving ~₹600 State Subsidy";
    strokeColor = "#10B981";
    savingsRupees = "₹600.00";
  }

  document.getElementById('protectionScoreValue').textContent = protectionScore;
  const scoreBadgeEl = document.getElementById('scoreBadge');
  if (scoreBadgeEl) {
    scoreBadgeEl.className = `${scoreBadgeClass} px-3 py-0.5 rounded-full text-xs font-bold uppercase font-mono`;
    scoreBadgeEl.textContent = scoreBadgeText;
  }

  document.getElementById('scoreDescriptionText').textContent = descriptionText;
  document.getElementById('savingsRupeesText').textContent = savingsRupees;
  document.getElementById('dailyHeadroomText').textContent = dailyHeadroom;
  document.getElementById('tariffCurrentUnits').textContent = `${appState.cycleUnits.toFixed(1)} / 500 Units`;
  
  const headroomBar = document.getElementById('headroomProgressBar');
  if (headroomBar) {
    const headroomPct = Math.min(100, (appState.cycleUnits / 500) * 100);
    headroomBar.style.width = `${headroomPct}%`;
    headroomBar.style.backgroundColor = strokeColor;
  }

  const circleEl = document.getElementById('scoreRadialCircle');
  if (circleEl) {
    const circumference = 251.2;
    const offset = circumference - (protectionScore / 100) * circumference;
    circleEl.style.strokeDashoffset = offset;
    circleEl.style.stroke = strokeColor;
  }

  const projectedBill = appState.cycleUnits > 200 ? (appState.cycleUnits - 200) * 4.50 : 0;
  document.getElementById('tariffProjectedCost').textContent = `₹${projectedBill.toFixed(2)}`;
}

// ======================================================================
// CHART.JS IMPLEMENTATION
// ======================================================================

function initCharts() {
  // 1. Live Electricity Usage Line Chart (Watts)
  const liveCtx = document.getElementById('liveLoadChart').getContext('2d');
  
  const initialLabels = ['19:20:00', '19:20:30', '19:21:00', '19:21:30', '19:22:00', '19:22:30', '19:23:00', '19:23:30', '19:24:00', '19:24:30', '19:25:00', '19:25:30'];
  const initialData = [950, 980, 1010, 960, 1020, 1000, 990, 1050, 1005, 1015, 1000, 1005];

  liveChartInstance = new Chart(liveCtx, {
    type: 'line',
    data: {
      labels: initialLabels,
      datasets: [{
        label: 'Live Power Load (Watts)',
        data: initialData,
        borderColor: '#059669',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderWidth: 2.5,
        pointRadius: 4,
        pointBackgroundColor: '#059669',
        pointBorderColor: '#FFFFFF',
        pointBorderWidth: 1.5,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.35
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0F172A',
          titleColor: '#FFFFFF',
          bodyColor: '#FACC15',
          borderColor: '#E2E8F0',
          borderWidth: 1,
          padding: 10,
          displayColors: false,
          callbacks: {
            label: (ctx) => ` Live Usage: ${ctx.parsed.y} Watts`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(226, 232, 240, 0.8)' },
          ticks: { color: '#64748B', font: { size: 10, family: 'Plus Jakarta Sans' } }
        },
        y: {
          min: 0,
          max: 2000,
          grid: { color: 'rgba(226, 232, 240, 0.8)' },
          ticks: {
            color: '#64748B',
            font: { size: 10, family: 'Plus Jakarta Sans' },
            callback: (value) => `${value} W`
          }
        }
      }
    }
  });

  // 2. Daily Units Bar Chart
  const barCtx = document.getElementById('consumptionBarChart').getContext('2d');
  
  const days = Array.from({length: 15}, (_, i) => `Aug ${i + 1}`);
  const dailyUnitsData = [5.8, 6.2, 7.1, 6.5, 6.8, 7.4, 6.1, 8.2, 7.9, 6.4, 5.9, 6.7, 7.2, 6.4, 6.6];
  const safeLimitData = Array(15).fill(7.5);

  barChartInstance = new Chart(barCtx, {
    type: 'bar',
    data: {
      labels: days,
      datasets: [
        {
          label: 'Daily Units Consumed (kWh)',
          data: dailyUnitsData,
          backgroundColor: (ctx) => {
            const val = ctx.raw;
            return val > 7.5 ? '#EAB308' : '#10B981';
          },
          borderRadius: 6,
          borderSkipped: false
        },
        {
          label: 'Safe Daily Limit (7.5 Units/Day)',
          data: safeLimitData,
          type: 'line',
          borderColor: '#EF4444',
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#475569', font: { size: 11, family: 'Plus Jakarta Sans' } }
        },
        tooltip: {
          backgroundColor: '#0F172A',
          borderColor: '#E2E8F0',
          borderWidth: 1,
          titleColor: '#FFF',
          bodyColor: '#FACC15'
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(226, 232, 240, 0.8)' },
          ticks: { color: '#64748B', font: { size: 10 } }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(226, 232, 240, 0.8)' },
          ticks: { color: '#64748B', font: { size: 10 }, callback: (v) => `${v} Units` }
        }
      }
    }
  });
}

function pushLiveChartData(newWatts) {
  if (!liveChartInstance) return;

  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];

  const labels = liveChartInstance.data.labels;
  const data = liveChartInstance.data.datasets[0].data;

  labels.push(timeStr);
  data.push(newWatts);

  if (labels.length > appState.maxLivePoints) {
    labels.shift();
    data.shift();
  }

  if (parseFloat(newWatts) > 1800) {
    liveChartInstance.options.scales.y.max = 4000;
  } else {
    liveChartInstance.options.scales.y.max = 2000;
  }

  liveChartInstance.update();
}

function setTimeframe(tf) {
  const tfs = ['live', '24h', '7d', '30d'];
  tfs.forEach(t => {
    const btn = document.getElementById(`tf-${t}`);
    if (t === tf) {
      btn.className = "px-3 py-1 rounded-lg font-bold bg-slate-900 text-white shadow-sm";
    } else {
      btn.className = "px-3 py-1 rounded-lg font-semibold text-slate-600 hover:text-slate-900";
    }
  });

  logDemoEvent(`Switched graph timeframe to [${tf.toUpperCase()}].`);
}

// ======================================================================
// DEMO CONTROLLER & SIMULATION CONTROLS
// ======================================================================

function toggleAnomalyInjection() {
  appState.heavyLoadActive = !appState.heavyLoadActive;
  const btn = document.getElementById('anomalyBtn');
  const shortcutBtn = document.getElementById('anomalyInjectShortcutBtn');

  if (appState.heavyLoadActive) {
    btn.className = "bg-yellow-400 text-slate-950 border border-yellow-300 px-3.5 py-1.5 rounded-xl font-extrabold transition flex items-center space-x-1.5 shadow-md shadow-yellow-400/30";
    btn.innerHTML = `<i class="fa-solid fa-fire text-xs"></i> <span>Heavy Usage ACTIVE (+10A)</span>`;
    if (shortcutBtn) shortcutBtn.textContent = "Clear Heavy Usage";
    
    logDemoEvent("HEAVY APPLIANCE USAGE SIMULATED (+10A Heavy Load). Smart Advisor alert updated!");
  } else {
    btn.className = "bg-yellow-400/10 hover:bg-yellow-400/20 text-yellow-300 border border-yellow-400/40 px-3.5 py-1.5 rounded-xl font-bold transition flex items-center space-x-1.5";
    btn.innerHTML = `<i class="fa-solid fa-plug text-xs"></i> <span>Simulate Heavy Usage (+10A)</span>`;
    if (shortcutBtn) shortcutBtn.textContent = "Simulate Heavy Usage (+10A)";

    logDemoEvent("Heavy usage cleared. Power draw returned to normal.");
  }

  updateMetricsAndAdvisor();
}

function fastForwardUnits(addedUnits) {
  appState.cycleUnits += addedUnits;
  logDemoEvent(`FAST-FORWARDED +${addedUnits} UNITS! Recalculating Subsidy & Bill Savings...`);
  updateMetricsAndAdvisor();
}

function resetSimulation() {
  appState.baseIrms = 4.35;
  appState.heavyLoadActive = false;
  appState.dailyUnits = 4.2;
  appState.cycleUnits = 342.5;
  appState.relayClosed = true;

  const anomalyBtn = document.getElementById('anomalyBtn');
  anomalyBtn.className = "bg-yellow-400/10 hover:bg-yellow-400/20 text-yellow-300 border border-yellow-400/40 px-3.5 py-1.5 rounded-xl font-bold transition flex items-center space-x-1.5";
  anomalyBtn.innerHTML = `<i class="fa-solid fa-plug text-xs"></i> <span>Simulate Heavy Usage (+10A)</span>`;

  document.getElementById('relayStatusText').textContent = "CONNECTED (POWER ON)";
  document.getElementById('relayStatusText').className = "text-[11px] font-mono text-emerald-700 font-bold";
  document.getElementById('relayToggleBtn').textContent = "TRIP RELAY";
  document.getElementById('relayToggleBtn').className = "bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition";

  logDemoEvent("Demo reset to default baseline (342.5 / 500 Units).");
  updateMetricsAndAdvisor();
}

// ======================================================================
// ESP32 LIVE HARDWARE WEBSOCKET GATEWAY & RELAY CONTROL
// ======================================================================

function handleESP32ConnectToggle() {
  const ipInput = document.getElementById('esp32IpInput');
  const ipVal = ipInput ? ipInput.value.trim() : '192.168.1.100';

  if (appState.hardwareMode === 'live' || (esp32Socket && esp32Socket.readyState === WebSocket.OPEN)) {
    disconnectESP32Hardware();
  } else {
    connectESP32Hardware(ipVal);
  }
}

function connectESP32Hardware(targetIp) {
  if (!targetIp) targetIp = '192.168.1.100';
  appState.esp32Ip = targetIp;

  // Format WebSocket URL: e.g. ws://192.168.1.100:81/ws or ws://192.168.1.100/ws
  let wsUrl = targetIp;
  if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
    if (wsUrl.includes(':')) {
      wsUrl = `ws://${wsUrl}/ws`;
    } else {
      wsUrl = `ws://${wsUrl}:81/ws`;
    }
  }

  logDemoEvent(`Initiating Hardware Gateway connection to ${wsUrl}...`);
  updateHardwareUIState('CONNECTING');

  try {
    if (esp32Socket) {
      esp32Socket.close();
    }

    esp32Socket = new WebSocket(wsUrl);

    esp32Socket.onopen = () => {
      appState.hardwareMode = 'live';
      updateHardwareUIState('CONNECTED', wsUrl);
      logDemoEvent(`LIVE ESP32 HARDWARE CONNECTED via ${wsUrl}`);
      appendSensorLogCustom(`[SYSTEM] Connected to physical ESP32 Smart Meter at ${wsUrl}`);

      // Stop simulated interval so real sensor data takes over
      if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
      }
    };

    esp32Socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        processIncomingESP32Packet(payload);
      } catch (err) {
        console.error("Malformed JSON payload from ESP32:", err);
      }
    };

    esp32Socket.onerror = (err) => {
      console.warn("ESP32 WebSocket Error:", err);
      logDemoEvent(`WebSocket Error on ${wsUrl}. Verify ESP32 IP & Wi-Fi.`);
      appendSensorLogCustom(`[ERROR] Unable to connect to ${wsUrl}. Is ESP32 online?`);
    };

    esp32Socket.onclose = () => {
      if (appState.hardwareMode === 'live') {
        logDemoEvent("ESP32 Connection lost. Reverting to Simulation Engine.");
        appendSensorLogCustom(`[SYSTEM] ESP32 Disconnected. Baseline simulation active.`);
      }
      appState.hardwareMode = 'simulation';
      updateHardwareUIState('DISCONNECTED');
      if (!simulationInterval) {
        startSimulationEngine();
      }
    };
  } catch (e) {
    logDemoEvent(`Hardware connection attempt failed: ${e.message}`);
    updateHardwareUIState('DISCONNECTED');
  }
}

function disconnectESP32Hardware() {
  if (esp32Socket) {
    esp32Socket.close();
    esp32Socket = null;
  }
  appState.hardwareMode = 'simulation';
  updateHardwareUIState('DISCONNECTED');
  logDemoEvent("Manually disconnected ESP32 Hardware. Simulation active.");
  if (!simulationInterval) {
    startSimulationEngine();
  }
}

function processIncomingESP32Packet(data) {
  // Extract telemetry values
  if (data.voltage !== undefined) appState.voltage = parseFloat(data.voltage);
  if (data.current !== undefined) appState.baseIrms = parseFloat(data.current);
  if (data.powerFactor !== undefined) appState.powerFactor = parseFloat(data.powerFactor);
  if (data.dailyKWh !== undefined) appState.dailyUnits = parseFloat(data.dailyKWh);
  if (data.relayState !== undefined) {
    appState.relayClosed = Boolean(data.relayState);
    updateRelayUIState();
  }

  // Update hardware diagnostic labels
  const diagVolt = document.getElementById('diagVoltage');
  if (diagVolt) diagVolt.textContent = `${appState.voltage.toFixed(1)} V AC`;

  const diagWifi = document.getElementById('diagWifi');
  if (diagWifi && data.rssi) diagWifi.textContent = `${data.rssi} dBm`;

  const calculatedPower = (appState.voltage * appState.baseIrms * appState.powerFactor).toFixed(1);
  appendSensorLogCustom(`[LIVE HARDWARE] P=${calculatedPower}W | V=${appState.voltage}V | I=${appState.baseIrms.toFixed(2)}A | Usage=${appState.dailyUnits.toFixed(2)} kWh`);

  // Trigger metrics update
  updateMetricsAndAdvisor();
}

function injectTestHardwarePacket() {
  // Test packet generator to demonstrate ESP32 live parsing in UI
  const dummyPacket = {
    device_id: "ESP32_HOME_MAIN_01",
    voltage: (228.0 + Math.random() * 5.0).toFixed(1),
    current: (4.5 + Math.random() * 6.0).toFixed(2),
    powerFactor: 0.97,
    dailyKWh: (appState.dailyUnits + 0.05).toFixed(2),
    relayState: appState.relayClosed,
    rssi: -58
  };

  logDemoEvent(`[TEST PACKET] Simulating incoming ESP32 JSON Stream...`);
  processIncomingESP32Packet(dummyPacket);
}

// ======================================================================
// FIREBASE REALTIME DATABASE CLOUD INTEGRATION
// ======================================================================

function connectFirebaseCloud() {
  if (!window.firebaseDb) {
    logDemoEvent("Firebase SDK missing or internet disconnected.");
    appendSensorLogCustom("[FIREBASE ERROR] Realtime Database instance unavailable.");
    return;
  }

  if (appState.hardwareMode === 'firebase') {
    disconnectFirebaseCloud();
    return;
  }

  logDemoEvent("Connecting to Firebase Realtime Database (amppulse-651f2)...");
  appState.hardwareMode = 'firebase';
  updateHardwareUIState('FIREBASE_CONNECTED');

  const telemetryRef = window.firebaseDb.ref('telemetry/ESP32_HOME_MAIN_01');
  telemetryRef.on('value', (snapshot) => {
    const data = snapshot.val();
    if (data) {
      processIncomingESP32Packet(data);
    }
  });

  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
  }
}

function disconnectFirebaseCloud() {
  if (window.firebaseDb) {
    window.firebaseDb.ref('telemetry/ESP32_HOME_MAIN_01').off();
  }
  appState.hardwareMode = 'simulation';
  updateHardwareUIState('DISCONNECTED');
  logDemoEvent("Disconnected from Firebase Cloud. Baseline simulation active.");
  if (!simulationInterval) {
    startSimulationEngine();
  }
}

function updateHardwareUIState(status, wsUrl = '') {
  const btn = document.getElementById('esp32ConnectBtn');
  const fbBtn = document.getElementById('firebaseConnectBtn');
  const badge = document.getElementById('hardwareModeBadge');
  const pill = document.getElementById('meterOnlinePill');
  const subtext = document.getElementById('esp32StatusSubtext');

  if (status === 'CONNECTED') {
    if (btn) {
      btn.className = "bg-red-500 hover:bg-red-600 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition shadow-md flex items-center justify-center space-x-2 flex-shrink-0";
      btn.innerHTML = `<i class="fa-solid fa-plug-circle-xmark text-xs"></i> <span>Disconnect WS</span>`;
    }
    if (badge) {
      badge.className = "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-mono font-bold px-3 py-0.5 rounded-full uppercase tracking-wider animate-pulse";
      badge.innerHTML = `⚡ Mode: Local WebSocket Live`;
    }
    if (pill) {
      pill.className = "badge-emerald px-3 py-1 rounded-full text-xs font-mono font-bold";
      pill.textContent = "ESP32 WEBSOCKET ONLINE";
    }
    if (subtext) subtext.textContent = `Device Status: Live Stream via ${wsUrl}`;
  } else if (status === 'FIREBASE_CONNECTED') {
    if (fbBtn) {
      fbBtn.className = "bg-red-500 hover:bg-red-600 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition shadow-md flex items-center justify-center space-x-2 flex-shrink-0 animate-pulse";
      fbBtn.innerHTML = `<i class="fa-solid fa-fire text-xs"></i> <span>Disconnect Cloud</span>`;
    }
    if (badge) {
      badge.className = "bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-mono font-bold px-3 py-0.5 rounded-full uppercase tracking-wider animate-pulse";
      badge.innerHTML = `🔥 Mode: Firebase Cloud Realtime`;
    }
    if (pill) {
      pill.className = "badge-emerald px-3 py-1 rounded-full text-xs font-mono font-bold";
      pill.textContent = "FIREBASE CLOUD ONLINE";
    }
    if (subtext) subtext.textContent = `Device Status: Streaming via Firebase Database (amppulse-651f2)`;
  } else if (status === 'CONNECTING') {
    if (btn) {
      btn.className = "bg-amber-500 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition shadow-md flex items-center justify-center space-x-2 flex-shrink-0 animate-pulse";
      btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-xs"></i> <span>Connecting...</span>`;
    }
    if (subtext) subtext.textContent = `Connecting to WebSocket ${appState.esp32Ip}...`;
  } else {
    if (btn) {
      btn.className = "bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-extrabold text-xs px-4 py-2.5 rounded-xl transition shadow-md flex items-center justify-center space-x-2 flex-shrink-0";
      btn.innerHTML = `<i class="fa-solid fa-plug text-xs"></i> <span>WebSocket IP</span>`;
    }
    if (fbBtn) {
      fbBtn.className = "bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs px-4 py-2.5 rounded-xl transition shadow-md flex items-center justify-center space-x-2 flex-shrink-0";
      fbBtn.innerHTML = `<i class="fa-solid fa-fire text-xs"></i> <span>Firebase Cloud</span>`;
    }
    if (badge) {
      badge.className = "bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 text-[11px] font-mono font-bold px-3 py-0.5 rounded-full uppercase tracking-wider";
      badge.innerHTML = `⚡ Mode: Simulation Engine`;
    }
    if (pill) {
      pill.className = "badge-emerald px-3 py-1 rounded-full text-xs font-mono font-bold";
      pill.textContent = "SIMULATION ACTIVE";
    }
    if (subtext) subtext.textContent = `Device Status: Simulation Mode (Ready for Hardware)`;
  }
}

function toggleSafetyRelay() {
  appState.relayClosed = !appState.relayClosed;

  // Transmit command to physical ESP32 hardware via WebSocket if active
  if (esp32Socket && esp32Socket.readyState === WebSocket.OPEN) {
    const cmdPayload = JSON.stringify({
      target_device: "ESP32_HOME_MAIN_01",
      action: "TOGGLE_RELAY",
      state: appState.relayClosed
    });
    esp32Socket.send(cmdPayload);
    logDemoEvent(`[WS SENT] Relay command transmitted to ESP32 hardware: ${cmdPayload}`);
  }

  // Transmit command to Firebase Realtime Database Cloud if active
  if (appState.hardwareMode === 'firebase' && window.firebaseDb) {
    window.firebaseDb.ref('telemetry/ESP32_HOME_MAIN_01/relayState').set(appState.relayClosed);
    window.firebaseDb.ref('telemetry/ESP32_HOME_MAIN_01/command').set({
      action: "TOGGLE_RELAY",
      state: appState.relayClosed,
      timestamp: Date.now()
    });
    logDemoEvent(`[FIREBASE CLOUD] Relay command saved to Realtime DB: ${appState.relayClosed ? 'POWER ON' : 'TRIP CUTOFF'}`);
  }

  updateRelayUIState();
  updateMetricsAndAdvisor();
}

function updateRelayUIState() {
  const statusEl = document.getElementById('relayStatusText');
  const btnEl = document.getElementById('relayToggleBtn');

  if (!statusEl || !btnEl) return;

  if (!appState.relayClosed) {
    statusEl.textContent = "OPEN (POWER CUTOFF)";
    statusEl.className = "text-[11px] font-mono text-red-600 font-bold";
    btnEl.textContent = "RESET RELAY";
    btnEl.className = "bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition";
    appState.baseIrms = 0.05;
    logDemoEvent("SAFETY RELAY TRIPPED! Mains power cut off.");
  } else {
    statusEl.textContent = "CONNECTED (POWER ON)";
    statusEl.className = "text-[11px] font-mono text-emerald-700 font-bold";
    btnEl.textContent = "TRIP RELAY";
    btnEl.className = "bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition";
    appState.baseIrms = 4.35;
    logDemoEvent("Relay re-engaged. Mains power restored.");
  }
}

function appendSensorLogStream(irmsVal) {
  if (appState.hardwareMode === 'live') return; // Skip simulated log stream when live hardware is streaming
  const timeStr = new Date().toTimeString().split(' ')[0];
  const powerW = (parseFloat(irmsVal) * appState.voltage * appState.powerFactor).toFixed(1);
  appendSensorLogCustom(`[${timeStr}] SIMULATION: Power=${powerW}W, Voltage=${Math.round(appState.voltage)}V, Usage=${appState.dailyUnits.toFixed(1)} Units`);
}

function appendSensorLogCustom(lineText) {
  const consoleEl = document.getElementById('sensorLogConsole');
  if (!consoleEl) return;

  const logLine = document.createElement('div');
  logLine.textContent = lineText;
  
  consoleEl.appendChild(logLine);
  if (consoleEl.children.length > 35) {
    consoleEl.removeChild(consoleEl.firstChild);
  }
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

function logDemoEvent(msg) {
  const logEl = document.getElementById('demoLogText');
  if (logEl) {
    const timeStr = new Date().toTimeString().split(' ')[0];
    logEl.textContent = `[${timeStr}] ${msg}`;
  }
}

function updateClock() {
  const now = new Date();
  const timeEl = document.getElementById('liveClock');
  const dateEl = document.getElementById('liveDate');

  if (timeEl) {
    timeEl.textContent = now.toTimeString().split(' ')[0];
  }
  if (dateEl) {
    const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
    dateEl.textContent = now.toLocaleDateString('en-US', options);
  }
}

