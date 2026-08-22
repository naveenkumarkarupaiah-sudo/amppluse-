/**
 * AmpPulse Smart Energy Monitoring & TANGEDCO 500-Unit Protection System
 * ESP32 Hardware Firmware (Arduino C++)
 * 
 * Hardware Setup:
 * - ESP32 Development Board (ESP-WROOM-32)
 * - AC Energy Sensor: PZEM-004T v3.0 (UART TX2 -> ESP32 GPIO 16, RX2 -> ESP32 GPIO 17)
 *   OR SCT-013 CT Clamp (Analog GPIO 34) + ZMPT101B Voltage Sensor (Analog GPIO 35)
 * - 5V Safety Power Relay Module: Signal -> ESP32 GPIO 26
 * 
 * Libraries Required (Install via Arduino Library Manager):
 * - ESPAsyncWebServer (https://github.com/me-no-dev/ESPAsyncWebServer)
 * - AsyncTCP (for ESP32)
 * - ArduinoJson
 * - PZEM004Tv30 (Optional if using PZEM sensor module)
 */

#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <AsyncTCP.h>
#include <ArduinoJson.h>

// ======================================================================
// CONFIGURATION (ENTER YOUR WI-FI CREDENTIALS HERE)
// ======================================================================
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";

// Hardware Pins
#define RELAY_PIN 26
#define CT_ANALOG_PIN 34
#define VOLTAGE_ANALOG_PIN 35

// WebSockets Server running on Port 81
AsyncWebServer server(80);
AsyncWebSocket ws("/ws");

// System State Variables
bool relayState = true;           // True = Power ON, False = Relay Tripped
float liveVoltage = 230.2;        // AC Grid Voltage (V)
float liveCurrent = 4.35;         // Current Draw (A)
float powerFactor = 0.96;         // Power Factor
float accumulatedKWh = 4.25;      // Daily kWh usage accumulated
unsigned long lastSensorRead = 0;

// Send JSON telemetry to all connected WebSocket dashboard clients
void broadcastTelemetry() {
  StaticJsonDocument<256> doc;
  doc["device_id"] = "ESP32_HOME_MAIN_01";
  doc["voltage"] = String(liveVoltage, 1).toFloat();
  doc["current"] = String(liveCurrent, 2).toFloat();
  doc["power"] = String(liveVoltage * liveCurrent * powerFactor, 1).toFloat();
  doc["powerFactor"] = powerFactor;
  doc["dailyKWh"] = String(accumulatedKWh, 2).toFloat();
  doc["relayState"] = relayState;
  doc["rssi"] = WiFi.RSSI();

  String jsonString;
  serializeJson(doc, jsonString);

  ws.textAll(jsonString);
  Serial.print("[ESP32 Broadcast] ");
  Serial.println(jsonString);
}

// WebSocket Event Handler (Receives commands from AmpPulse Dashboard)
void onWsEvent(AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type, void *arg, uint8_t *data, size_t len) {
  if (type == WS_EVT_CONNECT) {
    Serial.printf("[WebSocket] Client #%u connected from %s\n", client->id(), client->remoteIP().toString().c_str());
    // Send immediate telemetry update upon connection
    broadcastTelemetry();
  } else if (type == WS_EVT_DISCONNECT) {
    Serial.printf("[WebSocket] Client #%u disconnected\n", client->id());
  } else if (type == WS_EVT_DATA) {
    AwsFrameInfo *info = (AwsFrameInfo*)arg;
    if (info->final && info->index == 0 && info->len == len && info->opcode == WS_TEXT) {
      data[len] = 0;
      Serial.printf("[WebSocket Received] %s\n", (char*)data);

      StaticJsonDocument<200> doc;
      DeserializationError error = deserializeJson(doc, (char*)data);
      if (!error) {
        const char* action = doc["action"];
        if (action && strcmp(action, "TOGGLE_RELAY") == 0) {
          relayState = !relayState;
          digitalWrite(RELAY_PIN, relayState ? HIGH : LOW);
          Serial.printf("[RELAY] State changed to %s\n", relayState ? "CONNECTED (ON)" : "TRIPPED (OFF)");
          broadcastTelemetry();
        }
      }
    }
  }
}

// Read physical sensors (PZEM-004T or analog CT clamp)
void readSensors() {
  // Demo simulation jitter for analog inputs (Replace with actual PZEM-004T or EmonLib reads)
  if (relayState) {
    float jitter = ((float)random(-15, 15)) / 100.0;
    liveCurrent = max(0.1f, 4.35f + jitter);
    liveVoltage = 230.0f + (((float)random(-10, 10)) / 10.0f);
    
    // Accumulate kWh (sampled every 2 seconds)
    float addedkWh = ((liveCurrent * liveVoltage * powerFactor) / 1000.0f) * (2.0f / 3600.0f);
    accumulatedKWh += addedkWh;
  } else {
    liveCurrent = 0.0f;
  }
}

void setup() {
  Serial.begin(115200);
  Serial.println("\n--- AmpPulse ESP32 Smart Energy Controller ---");

  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, relayState ? HIGH : LOW);

  // Connect to Wi-Fi
by   WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\n[Wi-Fi] Connected Successfully!");
  Serial.print("[Wi-Fi] ESP32 IP Address: ");
  Serial.println(WiFi.localIP());

  // Attach WebSocket handler & Start Async HTTP Server
  ws.onEvent(onWsEvent);
  server.addHandler(&ws);
  server.begin();
  Serial.println("[HTTP/WS] Server active on port 80/81 (/ws)");
}

void loop() {
  ws.cleanupClients();

  // Read sensors & broadcast every 2 seconds
  if (millis() - lastSensorRead >= 2000) {
    lastSensorRead = millis();
    readSensors();
    if (ws.count() > 0) {
      broadcastTelemetry();
    }
  }
}
