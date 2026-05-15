#include <Arduino.h>
#include <ArduinoJson.h>

// Pin Definitions (Updated as requested)
#define TURBIDITY_PIN 33
#define TDS_PIN 32
#define FLOW_SENSOR_PIN 27

#ifndef LED_BUILTIN
#define LED_BUILTIN 2
#endif

// Calibration Constants
const float FLOW_CALIBRATION_FACTOR = 98.0; // 6mm ID sensor
const float VOLTAGE_REF = 3.3;
const int ADC_RESOLUTION = 4095;

// Variables for Flow Calculation
volatile unsigned long pulseCount = 0;
float flowRate = 0.0;
float totalLitres = 0.0;
unsigned long oldTime = 0;

// Interrupt Service Routine
void IRAM_ATTR pulseCounter() {
  pulseCount++;
}

void setup() {
  // Use high baud rate for low latency
  Serial.begin(115200);

  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, HIGH); // Turn on LED to indicate system is live

  pinMode(FLOW_SENSOR_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(FLOW_SENSOR_PIN), pulseCounter, FALLING);

  analogReadResolution(12);
  
  // Initial Boot Message
  Serial.println("{\"status\":\"system_booted\",\"node\":\"government\"}");
}

void loop() {
  // Reduced interval to 500ms for lower latency telemetry
  if ((millis() - oldTime) > 500) {
    unsigned long duration = millis() - oldTime;
    oldTime = millis();

    // 1. Calculate Flow Rate (L/min)
    // Formula: (pulses / duration_ms * 1000) / (calibration_factor)
    // Since FLOW_CALIBRATION_FACTOR is pulses per second per L/min
    detachInterrupt(digitalPinToInterrupt(FLOW_SENSOR_PIN));
    
    flowRate = (pulseCount * 1000.0 / duration) / FLOW_CALIBRATION_FACTOR;
    totalLitres += (flowRate / 60.0) * (duration / 1000.0);
    
    pulseCount = 0;
    attachInterrupt(digitalPinToInterrupt(FLOW_SENSOR_PIN), pulseCounter, FALLING);

    // 2. Read Sensors with updated pins
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

    // Blink LED on every data transmit to show activity
    digitalWrite(LED_BUILTIN, !digitalRead(LED_BUILTIN));
  }
}
