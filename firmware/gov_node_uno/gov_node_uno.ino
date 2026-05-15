#include <Arduino.h>
#include <ArduinoJson.h>

// Pin Definitions for Arduino Uno
#define FLOW_SENSOR_PIN 2    // Pin 2 supports interrupts on Uno
#define TDS_PIN A0           // Analog A0
#define TURBIDITY_PIN A1     // Analog A1

// Calibration Constants
const float FLOW_CALIBRATION_FACTOR = 98.0; // 6mm ID sensor
const float VOLTAGE_REF = 5.0;              // Uno is 5V
const int ADC_RESOLUTION = 1023;            // Uno is 10-bit

// Variables for Flow Calculation
volatile unsigned long pulseCount = 0;
float flowRate = 0.0;
float totalLitres = 0.0;
unsigned long oldTime = 0;

// Interrupt Service Routine
void pulseCounter() {
  pulseCount++;
}

void setup() {
  Serial.begin(115200);

  pinMode(FLOW_SENSOR_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(FLOW_SENSOR_PIN), pulseCounter, FALLING);

  Serial.println("{\"status\":\"system_booted\",\"node\":\"government_uno\"}");
}

void loop() {
  if ((millis() - oldTime) > 500) {
    unsigned long duration = millis() - oldTime;
    oldTime = millis();

    // 1. Calculate Flow Rate
    detachInterrupt(digitalPinToInterrupt(FLOW_SENSOR_PIN));
    flowRate = (pulseCount * 1000.0 / duration) / FLOW_CALIBRATION_FACTOR;
    totalLitres += (flowRate / 60.0) * (duration / 1000.0);
    pulseCount = 0;
    attachInterrupt(digitalPinToInterrupt(FLOW_SENSOR_PIN), pulseCounter, FALLING);

    // 2. Read Sensors (Uno has 6 analog pins, so we can read both!)
    int tdsRaw = analogRead(TDS_PIN);
    float tdsVoltage = tdsRaw * (VOLTAGE_REF / ADC_RESOLUTION);
    float tdsValue = (133.42 * pow(tdsVoltage, 3) - 255.86 * pow(tdsVoltage, 2) + 857.39 * tdsVoltage) * 0.5;

    int turbidityRaw = analogRead(TURBIDITY_PIN);
    float turbidityVoltage = turbidityRaw * (VOLTAGE_REF / ADC_RESOLUTION);
    float turbidityValue = -1120.4 * pow(turbidityVoltage, 2) + 5742.3 * turbidityVoltage - 4353.8;
    if (turbidityValue < 0) turbidityValue = 0;

    // 3. Send Data as JSON
    StaticJsonDocument<256> doc;
    doc["node"] = "government";
    doc["flow"] = flowRate;
    doc["tds"] = tdsValue;
    doc["turbidity"] = turbidityValue;
    doc["total_flow"] = totalLitres;
    doc["timestamp"] = millis();

    serializeJson(doc, Serial);
    Serial.println();
  }
}
