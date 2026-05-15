# BGI Smart Water Grid - USB Telemetry System

This system provides real-time monitoring of water flow and quality (TDS & Turbidity) using an ESP32 and a modern web dashboard.

## System Components

1.  **ESP32 Firmware**: Located in `/firmware/gov_node_esp32/`.
    - Reads pulses from a Flow Sensor.
    - Reads analog data from TDS and Turbidity sensors.
    - Outputs data as JSON over USB Serial (115200 baud).
2.  **React Web Dashboard**: Located in `/dashboard/`.
    - Uses the **Web Serial API** to connect directly to the ESP32.
    - Displays real-time charts and diagnostic data.

## Setup Instructions

### 1. Flash the ESP32
- Open `firmware/gov_node_esp32/gov_node_esp32.ino` in the Arduino IDE.
- Install the **ArduinoJson** library via the Library Manager.
- Select **ESP32 Dev Module** as the board.
- Connect your ESP32 and click **Upload**.

**Pin Connections:**
- **Flow Sensor**: Pin 2
- **TDS Sensor**: Pin 34 (Analog)
- **Turbidity Sensor**: Pin 35 (Analog)

### 2. Run the Dashboard
- Open a terminal in the `/dashboard` directory.
- Run `npm install` (if not already done).
- Run `npm run dev`.
- Open the provided URL (e.g., `http://localhost:5174`) in a browser that supports Web Serial (Chrome, Edge, Opera).
- Click the **Connect Node** button and select your ESP32 from the list.

## Technology Stack
- **Firmware**: C++/Arduino
- **Frontend**: React 19, Vite, Lucide-React (Icons), Recharts (Visualization)
- **Styling**: Premium Glassmorphism CSS
