#include <Wire.h>
#include <ArduinoJson.h>

// ========================= HARDWARE PINS =========================
#define RELAY_PIN D3
#define EMERGENCY_BUTTON_PIN D7
#define FLOW_SENSOR_PIN D6
#define EMERGENCY_LED_PIN D5

// MPU6050 I2C pins: SDA = D2, SCL = D1

// ========================= NODE CONFIG =========================
#define NODE_ID "Ramesh" // Consumer 1

// ========================= VARIABLES =========================
// Flow Sensor
volatile int pulseCount = 0;
float flowRate = 0.0;
float totalLitres = 0.0;
unsigned long oldTime = 0;
const float FLOW_CALIBRATION = 7.5; // Flow sensor calibration factor

// Valve & Limits
bool valveState = true;
float waterLimit = 0.0; // 0 means unlimited or controlled by Gov
bool emergencyMode = false;
const float EMERGENCY_LIMIT = 0.5; // 0.5 Litres for fast demo

// Tamper (MPU6050 simplified I2C reading)
const int MPU_ADDR = 0x68;
int16_t AcX, AcY, AcZ;
bool isTampered = false;

// Button Debounce
unsigned long lastButtonPress = 0;

void ICACHE_RAM_ATTR pulseCounter() {
  pulseCount++;
}

void setup() {
  Serial.begin(115200);
  Wire.begin(D2, D1);

  // Initialize Pins
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(EMERGENCY_LED_PIN, OUTPUT);
  pinMode(EMERGENCY_BUTTON_PIN, INPUT_PULLUP);
  pinMode(FLOW_SENSOR_PIN, INPUT_PULLUP);
  
  digitalWrite(RELAY_PIN, LOW); // Relay ON (Valve Open)
  digitalWrite(EMERGENCY_LED_PIN, LOW); // LED OFF

  // Attach flow sensor interrupt
  attachInterrupt(digitalPinToInterrupt(FLOW_SENSOR_PIN), pulseCounter, FALLING);

  // Initialize MPU6050
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B); // PWR_MGMT_1 register
  Wire.write(0);    // Wake up
  Wire.endTransmission(true);

  // Initial read to set baseline
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B); // Start with register 0x3B (ACCEL_XOUT_H)
  Wire.endTransmission(false);
  Wire.requestFrom(MPU_ADDR, 6, true);
  if (Wire.available() == 6) {
    AcX = Wire.read() << 8 | Wire.read();
    AcY = Wire.read() << 8 | Wire.read();
    AcZ = Wire.read() << 8 | Wire.read();
  }

  oldTime = millis();
}

void loop() {
  unsigned long currentTime = millis();

  // 1. Process Serial Commands from Dashboard
  if (Serial.available() > 0) {
    String command = Serial.readStringUntil('\n');
    command.trim();
    if (command == "VALVE_ON") {
      valveState = true;
      digitalWrite(RELAY_PIN, LOW); // Assume LOW is ON for Relay
    } else if (command == "VALVE_OFF") {
      valveState = false;
      digitalWrite(RELAY_PIN, HIGH);
    } else if (command == "RESET_TAMPER") {
      isTampered = false;
      valveState = true;
      digitalWrite(RELAY_PIN, LOW);
    } else if (command == "RESET_FLOW") {
      totalLitres = 0.0;
    } else if (command == "TRIGGER_SOS") {
      if (!emergencyMode && !isTampered) {
        emergencyMode = true;
        waterLimit = totalLitres + EMERGENCY_LIMIT;
        valveState = true;
        digitalWrite(RELAY_PIN, LOW);
        digitalWrite(EMERGENCY_LED_PIN, HIGH);
      }
    }
  }

  // 2. Emergency Button Logic
  if (digitalRead(EMERGENCY_BUTTON_PIN) == LOW && (currentTime - lastButtonPress > 1000)) {
    lastButtonPress = currentTime;
    if (!emergencyMode && !isTampered) {
      emergencyMode = true;
      waterLimit = totalLitres + EMERGENCY_LIMIT;
      valveState = true;
      digitalWrite(RELAY_PIN, LOW);
      digitalWrite(EMERGENCY_LED_PIN, HIGH);
    }
  }

  // 3. Water Limit Logic (Emergency or Gov set limit)
  if (emergencyMode && totalLitres >= waterLimit) {
    emergencyMode = false;
    valveState = false;
    digitalWrite(RELAY_PIN, HIGH); // Turn off valve
    digitalWrite(EMERGENCY_LED_PIN, LOW);
  }

  // 4. Read Flow Sensor (Every 500ms)
  if ((currentTime - oldTime) > 500) {
    detachInterrupt(digitalPinToInterrupt(FLOW_SENSOR_PIN));
    flowRate = ((1000.0 / (currentTime - oldTime)) * pulseCount) / FLOW_CALIBRATION;
    oldTime = currentTime;
    totalLitres += (flowRate / 60.0);
    pulseCount = 0;
    attachInterrupt(digitalPinToInterrupt(FLOW_SENSOR_PIN), pulseCounter, FALLING);

    // 5. Tamper Detection via MPU6050
    Wire.beginTransmission(MPU_ADDR);
    Wire.write(0x3B);
    Wire.endTransmission(false);
    Wire.requestFrom(MPU_ADDR, 6, true);
    if (Wire.available() == 6) {
      int16_t newAcX = Wire.read() << 8 | Wire.read();
      int16_t newAcY = Wire.read() << 8 | Wire.read();
      int16_t newAcZ = Wire.read() << 8 | Wire.read();

      // Highly sensitive shake/tilt detection for quick demo
      if (abs(newAcX - AcX) > 2000 || abs(newAcY - AcY) > 2000 || abs(newAcZ - AcZ) > 2000) {
        isTampered = true;
        valveState = false;
        digitalWrite(RELAY_PIN, HIGH); // Auto shutoff on tamper
      }
      
      // Update baseline slowly to account for drift but trigger on sudden movement
      AcX = newAcX;
      AcY = newAcY;
      AcZ = newAcZ;
    }

    // 6. Output JSON to Serial
    StaticJsonDocument<200> doc;
    doc["node"] = NODE_ID;
    doc["flow"] = flowRate;
    doc["total_flow"] = totalLitres;
    doc["valve"] = valveState;
    doc["tamper"] = isTampered;
    doc["emergency"] = emergencyMode;
    
    serializeJson(doc, Serial);
    Serial.println();
  }
}
