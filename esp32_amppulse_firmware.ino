/**
 * ============================================================
 *  AmpPulse — Smart Energy Monitor
 *  ESP32 Firmware: Firebase + I2C 16x2 LCD Edition
 * ============================================================
 *
 *  WIRING GUIDE
 *  ---------------------------------------------------------
 *  I2C LCD 16x2 (PCF8574 backpack)
 *    VCC  -> ESP32 3.3V  (or 5V if LCD backlight is dim)
 *    GND  -> ESP32 GND
 *    SDA  -> ESP32 GPIO 21
 *    SCL  -> ESP32 GPIO 22
 *
 *  Safety Relay Module (5V active-HIGH)
 *    Signal -> ESP32 GPIO 26
 *    VCC    -> ESP32 VIN (5V)
 *    GND    -> ESP32 GND
 *
 *  PZEM-004T v3 Energy Sensor (optional - currently simulated)
 *    TX -> ESP32 GPIO 16 (RX2)
 *    RX -> ESP32 GPIO 17 (TX2)
 *    VCC -> 5V, GND -> GND
 *
 *  LIBRARIES TO INSTALL (Arduino IDE -> Manage Libraries)
 *  ---------------------------------------------------------
 *  1. "Firebase ESP Client"   by Mobizt
 *  2. "LiquidCrystal I2C"     by Frank de Brabander
 *  3. "ArduinoJson"           by Benoit Blanchon
 * ============================================================
 */

// ============================================================
//  USER CONFIGURATION - EDIT THESE VALUES
// ============================================================
#define WIFI_SSID        "YOUR_WIFI_SSID"
#define WIFI_PASSWORD    "YOUR_WIFI_PASSWORD"
#define FIREBASE_HOST    "amppulse-651f2-default-rtdb.firebaseio.com"
#define FIREBASE_AUTH    "YOUR_DATABASE_SECRET"

// LCD I2C address - try 0x27 first, if blank screen try 0x3F
#define LCD_I2C_ADDR     0x27
#define LCD_COLS         16
#define LCD_ROWS         2

// Intervals
#define TELEMETRY_MS     5000    // Push to Firebase every 5 seconds
#define LCD_ROTATE_MS    3000    // Change LCD screen every 3 seconds

// ============================================================
//  INCLUDES
// ============================================================
#include <WiFi.h>
#include <FirebaseESP32.h>
#include <addons/TokenHelper.h>
#include <addons/RTDBHelper.h>
#include <LiquidCrystal_I2C.h>
#include <ArduinoJson.h>

// ============================================================
//  PIN DEFINITIONS
// ============================================================
#define RELAY_PIN        26    // Safety relay signal pin
#define PZEM_RX_PIN      16    // ESP32 RX2 <- PZEM TX
#define PZEM_TX_PIN      17    // ESP32 TX2 -> PZEM RX

// ============================================================
//  OBJECTS
// ============================================================
LiquidCrystal_I2C lcd(LCD_I2C_ADDR, LCD_COLS, LCD_ROWS);

FirebaseData   fbdo;
FirebaseData   fbStream;
FirebaseAuth   auth;
FirebaseConfig fbConfig;

// ============================================================
//  SYSTEM STATE
// ============================================================
bool  relayState    = true;
float liveVoltage   = 230.0;
float liveCurrent   = 4.35;
float powerFactor   = 0.96;
float livePower     = 0.0;
float dailyKWh      = 4.25;
float cycleKWh      = 342.5;
int   lcdScreen     = 0;
bool  firebaseReady = false;
bool  wifiConnected = false;

unsigned long lastTelemetry = 0;
unsigned long lastLcdRotate = 0;

// ============================================================
//  CUSTOM LCD CHARACTERS
// ============================================================
byte boltChar[8] = {
  0b00100, 0b01000, 0b11110, 0b00100,
  0b01111, 0b00010, 0b00100, 0b00000
};
byte wifiChar[8] = {
  0b00000, 0b01110, 0b10001, 0b00100,
  0b01010, 0b00000, 0b00100, 0b00000
};
byte degChar[8] = {
  0b01100, 0b10010, 0b10010, 0b01100,
  0b00000, 0b00000, 0b00000, 0b00000
};

// ============================================================
//  SENSOR READING
//  To use real PZEM-004T, replace the jitter block with:
//    #include <PZEM004Tv30.h>
//    PZEM004Tv30 pzem(Serial2, PZEM_RX_PIN, PZEM_TX_PIN);
//    liveVoltage = pzem.voltage();
//    liveCurrent = pzem.current();
//    powerFactor = pzem.pf();
//    dailyKWh    = pzem.energy();
// ============================================================
void readSensors() {
  if (!relayState) {
    liveCurrent = 0.0f;
    livePower   = 0.0f;
    return;
  }

  // Simulated sensor jitter
  float iJitter = ((float)random(-15, 15)) / 100.0f;
  float vJitter = ((float)random(-10, 10)) / 10.0f;

  liveCurrent = max(0.1f, 4.35f + iJitter);
  liveVoltage = 230.0f + vJitter;
  livePower   = liveVoltage * liveCurrent * powerFactor;

  float addedKWh = (livePower / 1000.0f) * ((float)TELEMETRY_MS / 3600000.0f);
  dailyKWh += addedKWh;
  cycleKWh += addedKWh;
}

// ============================================================
//  LCD SCREENS (5 rotating screens)
// ============================================================
void updateLCD() {
  lcd.clear();

  switch (lcdScreen) {

    case 0:  // Voltage
      lcd.setCursor(0, 0);
      lcd.write(0);  // bolt icon
      lcd.print(" VOLTAGE");
      lcd.setCursor(0, 1);
      lcd.print("  ");
      lcd.print(liveVoltage, 1);
      lcd.print(" V AC   ");
      break;

    case 1:  // Current
      lcd.setCursor(0, 0);
      lcd.write(0);
      lcd.print(" CURRENT");
      lcd.setCursor(0, 1);
      lcd.print("  ");
      lcd.print(liveCurrent, 2);
      lcd.print(" A      ");
      break;

    case 2:  // Power
      lcd.setCursor(0, 0);
      lcd.write(0);
      lcd.print(" POWER");
      lcd.setCursor(0, 1);
      lcd.print("  ");
      lcd.print(livePower, 1);
      lcd.print(" W    ");
      break;

    case 3:  // kWh usage
      lcd.setCursor(0, 0);
      lcd.print("Today:");
      lcd.print(dailyKWh, 3);
      lcd.print("kWh");
      lcd.setCursor(0, 1);
      lcd.print("Cycle:");
      lcd.print(cycleKWh, 1);
      lcd.print(" kWh");
      break;

    case 4:  // Status
      lcd.setCursor(0, 0);
      lcd.print("Relay:");
      lcd.print(relayState ? "ON SAFE " : "OFF TRIP");
      lcd.setCursor(0, 1);
      lcd.write(1);  // wifi icon
      lcd.print(wifiConnected ? " Cloud OK" : " No WiFi ");
      break;
  }
}

void rotateLCDScreen() {
  lcdScreen = (lcdScreen + 1) % 5;
  updateLCD();
}

// ============================================================
//  FIREBASE PUSH
// ============================================================
void pushToFirebase() {
  if (!firebaseReady || !Firebase.ready()) {
    Serial.println("[Firebase] Not ready - skipping push.");
    return;
  }

  long tsNow = (long)millis();

  // 1. Live snapshot (overwrite)
  FirebaseJson liveJson;
  liveJson.set("device_id",   "ESP32_HOME_MAIN_01");
  liveJson.set("voltage",     liveVoltage);
  liveJson.set("current",     liveCurrent);
  liveJson.set("power",       livePower);
  liveJson.set("powerFactor", powerFactor);
  liveJson.set("dailyKWh",    dailyKWh);
  liveJson.set("cycleKWh",    cycleKWh);
  liveJson.set("relayState",  relayState);
  liveJson.set("rssi",        (int)WiFi.RSSI());
  liveJson.set("timestamp",   tsNow);

  if (Firebase.setJSON(fbdo, "/sensor_readings", liveJson)) {
    Serial.printf("[Firebase] OK Live: P=%.1fW V=%.1fV I=%.2fA\n",
                  livePower, liveVoltage, liveCurrent);
  } else {
    Serial.printf("[Firebase] FAIL Live: %s\n", fbdo.errorReason().c_str());
  }

  // 2. History log (append)
  FirebaseJson histJson;
  histJson.set("voltage",    liveVoltage);
  histJson.set("current",    liveCurrent);
  histJson.set("power",      livePower);
  histJson.set("dailyKWh",   dailyKWh);
  histJson.set("cycleKWh",   cycleKWh);
  histJson.set("relayState", relayState);
  histJson.set("timestamp",  tsNow);

  if (Firebase.pushJSON(fbdo, "/sensor_history", histJson)) {
    Serial.println("[Firebase] OK History appended.");
  } else {
    Serial.printf("[Firebase] FAIL History: %s\n", fbdo.errorReason().c_str());
  }
}

// ============================================================
//  FIREBASE STREAM: Relay command from dashboard
// ============================================================
void streamCallback(StreamData data) {
  if (data.dataType() == "json") {
    FirebaseJson &json = data.jsonObject();
    FirebaseJsonData actionData, stateData;
    json.get(actionData, "action");
    json.get(stateData,  "state");

    if (actionData.success && actionData.stringValue == "TOGGLE_RELAY") {
      relayState = stateData.success ? stateData.boolValue : !relayState;
      digitalWrite(RELAY_PIN, relayState ? HIGH : LOW);
      Serial.printf("[RELAY] %s via dashboard\n",
                    relayState ? "ON" : "OFF");

      // Show relay status on LCD for 2s
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Dashboard CMD:  ");
      lcd.setCursor(0, 1);
      lcd.print("Relay: ");
      lcd.print(relayState ? "ON  SAFE" : "OFF TRIP");
      delay(2000);
    }
  }
}

void streamTimeoutCallback(bool timeout) {
  if (timeout) Serial.println("[Stream] Timeout - reconnecting...");
}

// ============================================================
//  SETUP
// ============================================================
void setup() {
  Serial.begin(115200);
  Serial.println("\n=== AmpPulse ESP32 | Firebase + LCD Edition ===");

  // Relay
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, HIGH);

  // LCD Init
  lcd.init();
  lcd.backlight();
  lcd.createChar(0, boltChar);
  lcd.createChar(1, wifiChar);
  lcd.createChar(2, degChar);

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("  AmpPulse v1.0 ");
  lcd.setCursor(0, 1);
  lcd.print(" Smart Meter... ");
  delay(1500);

  // WiFi Connect
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("WiFi Connecting ");
  lcd.setCursor(0, 1);
  lcd.print(WIFI_SSID);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("[Wi-Fi] Connecting");

  int retries = 0;
  while (WiFi.status() != WL_CONNECTED && retries < 30) {
    delay(500);
    Serial.print(".");
    retries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println("\n[Wi-Fi] Connected!");
    Serial.print("[Wi-Fi] IP: ");
    Serial.println(WiFi.localIP());
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi Connected! ");
    lcd.setCursor(0, 1);
    lcd.print(WiFi.localIP());
    delay(2000);
  } else {
    Serial.println("\n[Wi-Fi] FAILED. Check credentials.");
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi FAILED!    ");
    lcd.setCursor(0, 1);
    lcd.print("Check SSID/PASS ");
    delay(3000);
  }

  // Firebase Init
  if (wifiConnected) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Firebase Init...");

    fbConfig.host                        = FIREBASE_HOST;
    fbConfig.signer.tokens.legacy_token = FIREBASE_AUTH;
    fbConfig.token_status_callback      = tokenStatusCallback;

    Firebase.begin(&fbConfig, &auth);
    Firebase.reconnectWiFi(true);
    Firebase.setReadTimeout(fbdo, 1000 * 60);
    Firebase.setwriteSizeLimit(fbdo, "tiny");

    if (!Firebase.beginStream(fbStream, "/sensor_readings/command")) {
      Serial.printf("[Stream] Begin failed: %s\n", fbStream.errorReason().c_str());
    }
    Firebase.setStreamCallback(fbStream, streamCallback, streamTimeoutCallback);

    firebaseReady = true;
    Serial.println("[Firebase] Ready!");

    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Firebase Ready! ");
    lcd.setCursor(0, 1);
    lcd.print("amppulse-651f2  ");
    delay(2000);
  }

  // First read + LCD
  readSensors();
  updateLCD();
  Serial.println("[System] Running. Pushing every 5s, LCD rotating every 3s.");
}

// ============================================================
//  LOOP
// ============================================================
void loop() {
  unsigned long now = millis();

  // Push sensor data to Firebase every 5s
  if (now - lastTelemetry >= TELEMETRY_MS) {
    lastTelemetry = now;
    readSensors();
    pushToFirebase();
  }

  // Rotate LCD screen every 3s
  if (now - lastLcdRotate >= LCD_ROTATE_MS) {
    lastLcdRotate = now;
    rotateLCDScreen();
  }
}
