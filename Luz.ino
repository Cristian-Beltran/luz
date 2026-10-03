#include <Arduino.h>

#include <Wire.h>

#include <math.h>

#include <WiFi.h>

#include <WiFiClientSecure.h>

#include <WebSocketsClient.h>

#include <PubSubClient.h>

#include <Adafruit_MLX90614.h>

#include <Q2HX711.h>

// ============================================================

// MONITOR DE SIGNOS - ESP32

// ============================================================

// Pines definidos:

//   GPIO16 -> CLK sensor presion MPS20N0040D-S / HX710B

//   GPIO17 -> OUT/DOUT sensor presion

//   GPIO18 -> boton inflar

//   GPIO19 -> boton silenciar alarma 30 s

//   GPIO21 -> SDA

//   GPIO22 -> SCL

//   GPIO13 -> LED ON

//   GPIO14 -> LED WiFi

//   GPIO27 -> LED ALARMA

//   GPIO26 -> rele ventilador

//   GPIO25 -> bomba de aire

//   GPIO33 -> buzzer

//   GPIO35 -> ADC PPG/oximetro

//   GPIO34 -> ADC MQ

//

// ========================= PINOUT =========================

constexpr uint8_t PRESSURE_CLK_PIN    = 17;

constexpr uint8_t PRESSURE_DOUT_PIN   = 16;

constexpr uint8_t BUTTON_INFLATE_PIN  = 18;

constexpr uint8_t BUTTON_MUTE_PIN     = 19;

constexpr uint8_t I2C_SDA_PIN         = 21;

constexpr uint8_t I2C_SCL_PIN         = 22;

constexpr uint8_t LED_ON_PIN          = 13;

constexpr uint8_t LED_WIFI_PIN        = 14;

constexpr uint8_t LED_ALARM_PIN       = 27;

constexpr uint8_t FAN_RELAY_PIN       = 26;

constexpr uint8_t AIR_PUMP_PIN        = 25;

constexpr uint8_t BUZZER_PIN          = 33;

constexpr uint8_t PPG_ADC_PIN         = 35;

constexpr uint8_t MQ_ADC_PIN          = 34;

constexpr uint8_t VALVE_FEEDBACK_PIN  = 36;  

constexpr uint8_t AIR_VALVE_PIN       = 32;

// ========================= NIVELES ACTIVOS =========================

// Cambia estos valores solo si tus drivers trabajan invertidos.

constexpr bool PUMP_ACTIVE_HIGH = true;

constexpr bool VALVE_ACTIVE_HIGH = true;

// El rele del ventilador del proyecto anterior era activo en LOW.

constexpr bool FAN_RELAY_ACTIVE_LOW = true;

// ========================= WIFI / MQTT =========================

// WiFi ES OPCIONAL.

// Si WIFI_SSID queda vacio, todo funciona por Serial y localmente.

//const char* WIFI_SSID = "iPhone de Mar";

//const char* WIFI_PASSWORD = "1234marsucha";

const char* WIFI_SSID = "Cordova hogar ext";

const char* WIFI_PASSWORD = "4ndiNicol3";

const char* MQTT_HOST = "server-local.tail9af6ac.ts.net";

constexpr uint16_t MQTT_PORT = 443;
const char* MQTT_WS_PATH = "/";

const char* MQTT_USER = "device";

const char* MQTT_PASS = "esp32";

constexpr uint16_t MQTT_BUFFER_SIZE = 2048;

const char* DEVICE_ID = "esp32-luz-01";

constexpr bool MQTT_SIMULATE_MISSING_VALUES = false;

// ========================= BRIDGE WebSocket -> Client =========================

// PubSubClient necesita una interfaz Client, pero WebSocketsClient no la implementa.

// Esta clase hace de puente entre ambos.

#define WS_RX_BUFFER_SIZE 4096

class WebSocketClientBridge : public Client {

private:

    WebSocketsClient* ws;

    uint8_t rxBuffer[WS_RX_BUFFER_SIZE];

    volatile size_t rxBufferHead = 0;

    volatile size_t rxBufferTail = 0;

    bool _connected = false;

public:

    WebSocketClientBridge() : ws(nullptr) {}

    void setWebSocket(WebSocketsClient* webSocket) { ws = webSocket; }

    void addData(const uint8_t* data, size_t len) {

        for (size_t i = 0; i < len; i++) {

            size_t next = (rxBufferHead + 1) % WS_RX_BUFFER_SIZE;

            if (next != rxBufferTail) {

                rxBuffer[rxBufferHead] = data[i];

                rxBufferHead = next;

            }

        }

    }

    void setConnected(bool c) { _connected = c; }

    int connect(const char* host, uint16_t port) override { return 1; }

    int connect(IPAddress ip, uint16_t port) override { return 1; }

    size_t write(uint8_t b) override {

        return write(&b, 1);

    }

    size_t write(const uint8_t* buf, size_t size) override {

        if (!_connected || !ws) return 0;

        ws->sendBIN(buf, size);

        return size;

    }

    int available() override {

        if (rxBufferHead >= rxBufferTail)

            return rxBufferHead - rxBufferTail;

        return WS_RX_BUFFER_SIZE - rxBufferTail + rxBufferHead;

    }

    int read() override {

        if (rxBufferHead == rxBufferTail) return -1;

        uint8_t b = rxBuffer[rxBufferTail];

        rxBufferTail = (rxBufferTail + 1) % WS_RX_BUFFER_SIZE;

        return b;

    }

    int read(uint8_t* buf, size_t size) override {

        size_t count = 0;

        while (count < size && available()) {

            buf[count++] = read();

        }

        return count;

    }

    int peek() override {

        if (rxBufferHead == rxBufferTail) return -1;

        return rxBuffer[rxBufferTail];

    }

    void flush() override {}

    void stop() override {

        _connected = false;

    }

    uint8_t connected() override {

        return _connected ? 1 : 0;

    }

    operator bool() override {

        return _connected;

    }

};

WebSocketsClient webSocket;

WebSocketClientBridge wsBridge;

PubSubClient mqttClient(wsBridge);

// ========================= SENSORES =========================

Adafruit_MLX90614 mlx;

Q2HX711 pressureSensor(PRESSURE_DOUT_PIN, PRESSURE_CLK_PIN);

bool mlxAvailable = false;

bool pressureSensorAvailable = false;

// ========================= TIEMPOS GENERALES =========================

constexpr unsigned long SERIAL_INTERVAL_MS     = 1000;

constexpr unsigned long MQTT_INTERVAL_MS       = 500;

constexpr unsigned long MQTT_RAW_INTERVAL_MS   = 100;

constexpr unsigned long WIFI_RETRY_MS          = 15000;

constexpr unsigned long MQTT_RETRY_MS          = 5000;

constexpr unsigned long BUTTON_DEBOUNCE_MS     = 80;

constexpr unsigned long ALARM_MUTE_MS          = 30000;

// ============================================================

// TEMPERATURA - MLX90614

// ============================================================

constexpr float TEMP_MIN_C     = 35.0f;

constexpr float TEMP_MAX_C     = 37.8f;

constexpr float FAN_ON_TEMP_C  = 37.5f;

constexpr float FAN_OFF_TEMP_C = 37.0f;

float bodyTemperatureC = NAN;

float ambientTemperatureC = NAN;

bool temperatureValid = false;

bool temperatureAlarm = false;

bool fanOn = false;

// ============================================================

// MQ - DETECCION DE RESPIRACION

// ============================================================

constexpr unsigned long MQ_CALIBRATION_MS      = 5000;

constexpr unsigned long RESPIRATION_TIMEOUT_MS = 12000;

// En este montaje el ADC sube al exhalar. Los umbrales tienen
// histeresis para detectar una respiracion suave sin contar ruido.

constexpr int MQ_BREATH_RISE_ADC        = 12;

constexpr int MQ_BREATH_RELEASE_ADC     = 5;

constexpr int MQ_STRONG_BREATH_RISE_ADC = 35;

uint16_t mqRaw = 0;

float mqFiltered = 0.0f;

float mqBaseline = 0.0f;

int mqDelta = 0;

bool mqCalibrationComplete = false;

bool respirationDetected = false;

bool strongRespirationDetected = false;

bool respirationMissing = false;

bool respirationPulseLatched = false;

float respiratoryRateBpm = 0.0f;

unsigned long mqCalibrationStartMs = 0;

uint64_t mqCalibrationAccumulator = 0;

uint32_t mqCalibrationSamples = 0;

unsigned long lastBreathMs = 0;

unsigned long previousBreathMs = 0;

// ============================================================

// PPG ANALOGICO - FRECUENCIA CARDIACA

// ============================================================

// El sensor/circuito del proyecto anterior solo entrega un ADC.

// Se usa la señal real para:

//   1. detectar dedo

//   2. intentar detectar pulsos

//

// Si el pulso real calculado no es estable, tambien se muestra

// un BPM sano simulado.

constexpr unsigned long PPG_SAMPLE_MS          = 10;

constexpr unsigned long PPG_CALIBRATION_MS     = 2500;

constexpr unsigned long PPG_NO_FINGER_GRACE_MS = 5000;

constexpr unsigned long PPG_FINGER_CONFIRM_MS  = 900;

constexpr unsigned long PPG_FINGER_RELEASE_MS  = 700;

constexpr unsigned long PPG_MIN_ACQUIRE_MS     = 4000;

constexpr int PPG_FINGER_DELTA_ADC = 70;

constexpr float HR_MIN_PEAK_THRESHOLD = 8.0f;

constexpr unsigned long HR_MIN_INTERVAL_MS = 300;

constexpr unsigned long HR_MAX_INTERVAL_MS = 2000;

constexpr float HR_EMA_ALPHA = 0.20f;

constexpr uint8_t HR_REQUIRED_STABLE_BEATS = 3;

int ppgRaw = 0;

int ppgSmoothed = 0;

float ppgNoFingerBaseline = 0.0f;

float hrBaseline = 0.0f;

float ppgAcValue = 0.0f;

float ppgAcAmplitude = 0.0f;

float ppgPeakThreshold = HR_MIN_PEAK_THRESHOLD;

float ppgSignalQualityPercent = 0.0f;

float perfusionIndexPercent = 0.0f;

bool ppgCalibrationComplete = false;

bool fingerDetected = false;

bool pulseLatched = false;

bool realBpmValid = false;

float realBpm = 0.0f;

float bpmOutput = 0.0f;

unsigned long ppgCalibrationStartMs = 0;

uint64_t ppgCalibrationAccumulator = 0;

uint32_t ppgCalibrationSamples = 0;

unsigned long lastPpgSampleMs = 0;

unsigned long lastPulseMs = 0;

unsigned long lastBeatIntervalMs = 0;

unsigned long fingerDetectedSinceMs = 0;

unsigned long fingerCandidateSinceMs = 0;

unsigned long noFingerCandidateSinceMs = 0;

unsigned long ppgCalibrationDoneMs = 0;

int hrBuffer[12] = {0};

int hrBufferIndex = 0;

long hrBufferTotal = 0;

uint8_t stableBeatCount = 0;

float previousPpgAbsAc = 0.0f;

float previousPreviousPpgAbsAc = 0.0f;

// Un solo canal PPG analogico permite pulso, pero no una SpO2 valida.
// SpO2 requiere componentes roja e infrarroja independientes.
bool spo2Available = false;

float oxygenSaturationPercent = 0.0f;

// ============================================================

// PRESION - MPS20N0040D-S + HX710B

// ============================================================

//

// Calibracion inicial basada en la ficha del modulo: 0..40 kPa,
// sensibilidad nominal 50 mV/40 kPa y ADC HX710B de 24 bits.
// El cero se toma con la valvula abierta al arrancar, por lo que se
// obtiene presion manometrica del manguito, no presion atmosferica absoluta.

constexpr float PRESSURE_SENSOR_RANGE_KPA = 40.0f;

constexpr float PRESSURE_SENSOR_FULL_SCALE_MV = 50.0f;

constexpr float HX710_INPUT_FULL_SCALE_MV = 20.0f;

constexpr float HX710_POSITIVE_COUNTS = 8388607.0f;

constexpr float KPA_TO_MMHG = 7.50062f;

constexpr float APPROX_PRESSURE_COUNTS_PER_MMHG =
  HX710_POSITIVE_COUNTS /
  ((HX710_INPUT_FULL_SCALE_MV / PRESSURE_SENSOR_FULL_SCALE_MV) *
   PRESSURE_SENSOR_RANGE_KPA * KPA_TO_MMHG);

constexpr float PRESSURE_TARGET_MMHG  = 165.0f;

constexpr float PRESSURE_MAX_MMHG     = 195.0f;

constexpr float PRESSURE_RELEASE_MMHG = 8.0f;

constexpr float PRESSURE_DEFLATE_END_MMHG = 35.0f;

constexpr unsigned long MAX_INFLATION_TIME_MS = 30000;

constexpr unsigned long PRESSURE_HOLD_MS      = 800;

constexpr unsigned long MAX_DEFLATION_TIME_MS = 60000;

constexpr unsigned long MAX_RELEASE_TIME_MS   = 12000;

constexpr unsigned long PRESSURE_VALVE_PERIOD_MS = 500;

constexpr unsigned long PRESSURE_VALVE_OPEN_MS = 35;

constexpr uint16_t PRESSURE_OSC_MAX_SAMPLES = 320;

constexpr float SYSTOLIC_ENVELOPE_RATIO = 0.55f;

constexpr float DIASTOLIC_ENVELOPE_RATIO = 0.82f;

constexpr long PRESSURE_ADC_MAX_READING = 16777215L;

constexpr long PRESSURE_ADC_SATURATION_MARGIN = 2000L;

long pressureRaw = 0;

long pressureZeroRaw = 0;

float pressureCountsPerMmHg = APPROX_PRESSURE_COUNTS_PER_MMHG;

float cuffPressureMmHg = 0.0f;

float cuffPressureFilteredMmHg = 0.0f;

float lastCuffPeakMmHg = 0.0f;

long pressureDeltaCounts = 0;

float pressureDcMmHg = 0.0f;

float pressureOscillationMmHg = 0.0f;

float pressureOscillationEnvelope = 0.0f;

bool pressureZeroReady = false;

bool pressureFault = false;

bool pressureResultAvailable = false;

int estimatedSystolicMmHg = 0;

int estimatedDiastolicMmHg = 0;

float estimatedMapMmHg = 0.0f;

unsigned long lastPressureMeasuredAtMs = 0;

uint32_t pressureMeasurementSequence = 0;

uint32_t pressureResultSequence = 0;

String pressureTriggerSource = "none";

enum class PressureState {

  IDLE,

  INFLATING,

  HOLDING,

  DEFLATING,

  RELEASING

};

PressureState pressureState = PressureState::IDLE;

unsigned long pressureCycleStartMs = 0;

unsigned long pressureHoldStartMs = 0;

unsigned long pressureReleaseStartMs = 0;

unsigned long pressureDeflationStartMs = 0;

unsigned long lastValvePulseMs = 0;

unsigned long valvePulseOpenUntilMs = 0;

unsigned long inflationLastProgressMs = 0;

float inflationLastProgressMmHg = 0.0f;

struct PressureOscillationPoint {

  float pressureMmHg;

  float amplitudeMmHg;

};

PressureOscillationPoint pressureOscillationSamples[PRESSURE_OSC_MAX_SAMPLES];

uint16_t pressureOscillationSampleCount = 0;

unsigned long pressureNotificationStartMs = 0;

// ============================================================

// ALARMAS

// ============================================================

bool fingerAlarm = false;

bool alarmActive = false;

unsigned long alarmMutedUntilMs = 0;

uint32_t alarmMuteSequence = 0;

String alarmMuteSource = "none";

// ============================================================

// BOTONES

// ============================================================

bool lastInflateButtonState = HIGH;

bool lastMuteButtonState = HIGH;

unsigned long lastInflateDebounceMs = 0;

unsigned long lastMuteDebounceMs = 0;

// ============================================================

// ESTADO GENERAL

// ============================================================

unsigned long lastSerialMs = 0;

unsigned long lastMqttPublishMs = 0;

unsigned long lastMqttRawPublishMs = 0;

unsigned long lastWifiAttemptMs = 0;

unsigned long lastMqttAttemptMs = 0;

// ============================================================

// PROTOTIPOS

// ============================================================

uint16_t readFilteredAdc(uint8_t pin, uint8_t samples = 8);

void updateButtons();

void updateSerialCommands();

void updateMqSensor();

void updateTemperature();

void updatePpg();

void updatePressure();

bool readPressureRaw(long& value, unsigned long timeoutMs = 250);

void capturePressureZero();

void startPressureMeasurement(const char* source = "unknown");

void finishPressureMeasurement();

void beginPressureDeflation();

bool calculateOscillometricPressure();

void abortPressureMeasurement(const char* reason);

void muteAlarm(const char* source);

const char* pressureStateName();

void evaluateAlarms();

void setPump(bool on);

void setValveClosed(bool closed);

void setFan(bool on);

void updateOutputs();

void updateBuzzer();

bool alarmMuted();

void ensureWifi();

void ensureMqtt();

void webSocketEvent(WStype_t type, uint8_t* payload, size_t length);

void mqttCallback(char* topic, byte* payload, unsigned int length);

void publishTelemetry();

void publishRawTelemetry();

float sanitizeMqttNumber(float value, float fallback);

void printTelemetry();

// ============================================================

// SETUP

// ============================================================

void setup() {

  Serial.begin(115200);

  Serial.setTimeout(50);

  delay(300);

  // ---------------- BOTONES ----------------

  pinMode(BUTTON_INFLATE_PIN, INPUT_PULLUP);

  pinMode(BUTTON_MUTE_PIN, INPUT_PULLUP);

  // ---------------- LEDs ----------------

  pinMode(LED_ON_PIN, OUTPUT);

  pinMode(LED_WIFI_PIN, OUTPUT);

  pinMode(LED_ALARM_PIN, OUTPUT);

  // ---------------- ACTUADORES ----------------

  pinMode(FAN_RELAY_PIN, OUTPUT);

  pinMode(AIR_PUMP_PIN, OUTPUT);

  pinMode(AIR_VALVE_PIN, OUTPUT);

  pinMode(BUZZER_PIN, OUTPUT);

  // GPIO36 solo entrada

  pinMode(VALVE_FEEDBACK_PIN, INPUT);

  digitalWrite(LED_ON_PIN, HIGH);

  digitalWrite(LED_WIFI_PIN, LOW);

  digitalWrite(LED_ALARM_PIN, LOW);

  setPump(false);

  setValveClosed(false);

  setFan(false);

  noTone(BUZZER_PIN);

  // ---------------- ADC ----------------

  analogReadResolution(12);

  analogSetPinAttenuation(PPG_ADC_PIN, ADC_11db);

  analogSetPinAttenuation(MQ_ADC_PIN, ADC_11db);

  // ---------------- I2C ----------------

  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);

  Wire.setClock(100000);

  // ---------------- MLX90614 ----------------

  mlxAvailable = mlx.begin();

  if (mlxAvailable) {

    Serial.println("[MLX] OK");

  } else {

    Serial.println("[MLX] No detectado");

  }

  // ---------------- PRESION ----------------

  Serial.println("[PRESION] Modo de calibracion APROXIMADA.");

  Serial.print("[PRESION] Factor = ");

  Serial.print(pressureCountsPerMmHg, 1);

  Serial.println(" cuentas/mmHg");

  Serial.println("[PRESION] Capturando cero...");

  capturePressureZero();

  // ---------------- CALIBRACIONES ADC ----------------

  mqCalibrationStartMs = millis();

  ppgCalibrationStartMs = millis();

  // ---------------- MQTT sobre WSS ----------------

  wsBridge.setWebSocket(&webSocket);

  // WSS publico: wss://server-local.tail9af6ac.ts.net/
  // 443 es implicito en WSS; la libreria requiere recibirlo como argumento.
  webSocket.beginSSL(MQTT_HOST, MQTT_PORT, MQTT_WS_PATH, nullptr, "mqtt");
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);

  // Las credenciales se envian en MQTT CONNECT, no como Basic Auth HTTP.
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(MQTT_BUFFER_SIZE);
  mqttClient.setKeepAlive(30);

  // WiFi no bloqueante

  ensureWifi();

  randomSeed((uint32_t)analogRead(MQ_ADC_PIN) ^ micros());

  Serial.println();

  Serial.println("==========================================");

  Serial.println(" MONITOR DE SIGNOS INICIADO");

  Serial.println("==========================================");

  Serial.println("Boton GPIO18 -> iniciar inflado");

  Serial.println("Boton GPIO19 -> silenciar alarma 30 s");

  Serial.println("PPG: dejar SIN dedo durante 2.5 s al arrancar");

  Serial.println("MQ: calibracion inicial automatica 5 s");

  Serial.println("WiFi: opcional");

  Serial.println();

  Serial.println("Comandos Serial:");

  Serial.println("  status");

  Serial.println("  inflate");

  Serial.println("  mute");

  Serial.println("  pzero");

  Serial.println();

}

// ============================================================

// LOOP

// ============================================================

void loop() {

  updateButtons();

  updateSerialCommands();

  updateMqSensor();

  updateTemperature();

  updatePpg();

  updatePressure();

  evaluateAlarms();

  updateOutputs();

  updateBuzzer();

  ensureWifi();

  // Primero procesa el handshake/reconexion WSS.
  if (WiFi.status() == WL_CONNECTED) {
    webSocket.loop();
  }

  // MQTT solo intenta CONNECT cuando el WebSocket ya esta arriba.
  ensureMqtt();

  if (mqttClient.connected()) {
    mqttClient.loop();
  }

  unsigned long now = millis();

  if (now - lastSerialMs >= SERIAL_INTERVAL_MS) {

    lastSerialMs = now;

    printTelemetry();

  }

  if (now - lastMqttPublishMs >= MQTT_INTERVAL_MS) {

    lastMqttPublishMs = now;

    publishTelemetry();

  }

  if (now - lastMqttRawPublishMs >= MQTT_RAW_INTERVAL_MS) {

    lastMqttRawPublishMs = now;

    publishRawTelemetry();

  }

  delay(1);

}

// ============================================================

// ADC

// ============================================================

uint16_t readFilteredAdc(uint8_t pin, uint8_t samples) {

  uint32_t accumulator = 0;

  for (uint8_t i = 0; i < samples; i++) {

    accumulator += analogRead(pin);

    delayMicroseconds(150);

  }

  return (uint16_t)(accumulator / samples);

}

// ============================================================

// MQ - RESPIRACION

// ============================================================

void updateMqSensor() {
  mqRaw = readFilteredAdc(MQ_ADC_PIN);

  if (mqFiltered <= 0.0f) {
    mqFiltered = (float)mqRaw;
  } else {
    mqFiltered = 0.72f * mqFiltered + 0.28f * (float)mqRaw;
  }

  // Calibracion automatica inicial
  if (!mqCalibrationComplete) {
    mqCalibrationAccumulator += (uint16_t)roundf(mqFiltered);
    mqCalibrationSamples++;
    if (millis() - mqCalibrationStartMs >= MQ_CALIBRATION_MS) {
      if (mqCalibrationSamples > 0) {
        mqBaseline = (float)mqCalibrationAccumulator / (float)mqCalibrationSamples;
      } else {
        mqBaseline = mqFiltered;
      }
      mqCalibrationComplete = true;
      lastBreathMs = millis();
      Serial.print("[MQ] Baseline = ");
      Serial.println(mqBaseline, 1);
    }
    return;
  }

  // El usuario observo que el ADC sube al soplar. La histeresis evita
  // encender/apagar la deteccion alrededor del mismo umbral.
  mqDelta = (int)roundf(mqFiltered - mqBaseline);
  if (!respirationDetected && mqDelta >= MQ_BREATH_RISE_ADC) {
    respirationDetected = true;
  } else if (respirationDetected && mqDelta <= MQ_BREATH_RELEASE_ADC) {
    respirationDetected = false;
  }
  strongRespirationDetected = mqDelta >= MQ_STRONG_BREATH_RISE_ADC;

  if (respirationDetected) {
    unsigned long now = millis();
    lastBreathMs = now;
    // Un flanco por exhalacion evita contar muchas muestras del mismo ciclo.
    if (!respirationPulseLatched) {
      if (previousBreathMs != 0) {
        unsigned long interval = now - previousBreathMs;
        if (interval >= 1000 && interval <= 10000) {
          float instantRate = 60000.0f / (float)interval;
          respiratoryRateBpm = respiratoryRateBpm <= 0.0f
            ? instantRate
            : 0.25f * instantRate + 0.75f * respiratoryRateBpm;
        }
      }
      previousBreathMs = now;
      respirationPulseLatched = true;
    }
  } else {
    respirationPulseLatched = false;
    // Adaptacion lenta solo cuando no hay una exhalacion activa.
    if (abs(mqDelta) < MQ_BREATH_RISE_ADC) {
      mqBaseline = mqBaseline * 0.9995f + mqFiltered * 0.0005f;
    }
  }

  respirationMissing = (millis() - lastBreathMs) >= RESPIRATION_TIMEOUT_MS;
  if (respirationMissing) {
    respiratoryRateBpm = 0.0f;
  }
}

// ============================================================

// MLX90614 - TEMPERATURA

// ============================================================

void updateTemperature() {

  static unsigned long lastTemperatureReadMs = 0;

  if (millis() - lastTemperatureReadMs < 250) {

    return;

  }

  lastTemperatureReadMs = millis();

  if (!mlxAvailable) {

    temperatureValid = false;

    temperatureAlarm = false;

    setFan(false);

    return;

  }

  ambientTemperatureC = mlx.readAmbientTempC();

  bodyTemperatureC = mlx.readObjectTempC();

  temperatureValid =

    !isnan(ambientTemperatureC) &&

    !isnan(bodyTemperatureC) &&

    !isinf(ambientTemperatureC) &&

    !isinf(bodyTemperatureC);

  if (!temperatureValid) {

    temperatureAlarm = false;

    setFan(false);

    return;

  }

  temperatureAlarm =

    bodyTemperatureC < TEMP_MIN_C ||

    bodyTemperatureC > TEMP_MAX_C;

  // Histeresis del ventilador

  if (!fanOn && bodyTemperatureC >= FAN_ON_TEMP_C) {

    setFan(true);

  }

  if (fanOn && bodyTemperatureC <= FAN_OFF_TEMP_C) {

    setFan(false);

  }

}

// ============================================================

// PPG ANALOGICO

// ============================================================

void updatePpg() {
  unsigned long now = millis();
  if (now - lastPpgSampleMs < PPG_SAMPLE_MS) {
    return;
  }
  lastPpgSampleMs = now;
  ppgRaw = analogRead(PPG_ADC_PIN);

  // Promedio movil de 12 muestras
  hrBufferTotal -= hrBuffer[hrBufferIndex];
  hrBuffer[hrBufferIndex] = ppgRaw;
  hrBufferTotal += hrBuffer[hrBufferIndex];
  hrBufferIndex++;
  if (hrBufferIndex >= 12) {
    hrBufferIndex = 0;
  }
  ppgSmoothed = (int)(hrBufferTotal / 12);

  // Calibracion inicial SIN dedo
  if (!ppgCalibrationComplete) {
    ppgCalibrationAccumulator += ppgRaw;
    ppgCalibrationSamples++;
    if (now - ppgCalibrationStartMs >= PPG_CALIBRATION_MS) {
      if (ppgCalibrationSamples > 0) {
        ppgNoFingerBaseline = (float)ppgCalibrationAccumulator / (float)ppgCalibrationSamples;
      } else {
        ppgNoFingerBaseline = ppgRaw;
      }
      hrBaseline = ppgSmoothed;
      ppgCalibrationComplete = true;
      ppgCalibrationDoneMs = now;
      Serial.print("[PPG] Baseline sin dedo = ");
      Serial.println(ppgNoFingerBaseline, 1);
    }
    return;
  }

  // Deteccion de dedo
  int presenceDelta = abs(ppgSmoothed - (int)roundf(ppgNoFingerBaseline));
  bool fingerCandidate = presenceDelta >= PPG_FINGER_DELTA_ADC &&
                         ppgSmoothed > 40 && ppgSmoothed < 4050;

  if (fingerCandidate) {
    noFingerCandidateSinceMs = 0;
    if (fingerCandidateSinceMs == 0) {
      fingerCandidateSinceMs = now;
    }
    if (!fingerDetected && now - fingerCandidateSinceMs >= PPG_FINGER_CONFIRM_MS) {
      fingerDetected = true;
      fingerDetectedSinceMs = now;
      hrBaseline = (float)ppgSmoothed;
      ppgAcAmplitude = 0.0f;
      previousPpgAbsAc = 0.0f;
      previousPreviousPpgAbsAc = 0.0f;
      stableBeatCount = 0;
      realBpmValid = false;
      lastPulseMs = 0;
    }
  } else {
    fingerCandidateSinceMs = 0;
    if (noFingerCandidateSinceMs == 0) {
      noFingerCandidateSinceMs = now;
    }
    if (now - noFingerCandidateSinceMs >= PPG_FINGER_RELEASE_MS) {
      fingerDetected = false;
      realBpmValid = false;
      pulseLatched = false;
      lastPulseMs = 0;
      lastBeatIntervalMs = 0;
      stableBeatCount = 0;
      bpmOutput = 0.0f;
      ppgSignalQualityPercent = 0.0f;
      perfusionIndexPercent = 0.0f;
    }
    // Actualiza lentamente el nivel sin dedo
    if (!fingerDetected) {
      ppgNoFingerBaseline = ppgNoFingerBaseline * 0.9995f +
                            (float)ppgSmoothed * 0.0005f;
    }
  }

  if (!fingerDetected) {
    bpmOutput = 0.0f;
    return;
  }

  // Separacion DC/AC. La componente AC contiene las oscilaciones cardiacas.
  hrBaseline = 0.995f * hrBaseline + 0.005f * (float)ppgSmoothed;
  ppgAcValue = (float)ppgSmoothed - hrBaseline;
  float absAc = fabsf(ppgAcValue);
  ppgAcAmplitude = 0.94f * ppgAcAmplitude + 0.06f * absAc;
  ppgPeakThreshold = constrain(ppgAcAmplitude * 1.35f, HR_MIN_PEAK_THRESHOLD, 120.0f);
  perfusionIndexPercent = hrBaseline > 1.0f
    ? constrain((ppgAcAmplitude / hrBaseline) * 100.0f, 0.0f, 20.0f)
    : 0.0f;
  ppgSignalQualityPercent = constrain(
    ((float)presenceDelta / 250.0f) * 45.0f +
    (ppgAcAmplitude / max(ppgPeakThreshold, 1.0f)) * 55.0f,
    0.0f,
    100.0f
  );

  // Detecta maximos locales de |AC| y aplica periodo refractario. Espera varios
  // intervalos consistentes antes de publicar un BPM, evitando valores al poner el dedo.
  bool localPeak = previousPpgAbsAc > previousPreviousPpgAbsAc &&
                   previousPpgAbsAc >= absAc &&
                   previousPpgAbsAc >= ppgPeakThreshold;
  if (localPeak && (lastPulseMs == 0 || now - lastPulseMs >= HR_MIN_INTERVAL_MS)) {
    if (lastPulseMs != 0) {
      unsigned long interval = now - lastPulseMs;
      if (interval >= HR_MIN_INTERVAL_MS && interval <= HR_MAX_INTERVAL_MS) {
        float instantBpm = 60000.0f / (float)interval;
        bool consistent = lastBeatIntervalMs == 0 ||
                          abs((long)interval - (long)lastBeatIntervalMs) <=
                            (long)(lastBeatIntervalMs * 0.30f);
        if (instantBpm >= 40.0f && instantBpm <= 180.0f && consistent) {
          realBpm = stableBeatCount == 0
            ? instantBpm
            : HR_EMA_ALPHA * instantBpm + (1.0f - HR_EMA_ALPHA) * realBpm;
          if (stableBeatCount < 255) stableBeatCount++;
          lastBeatIntervalMs = interval;
        } else {
          stableBeatCount = 0;
          realBpmValid = false;
          lastBeatIntervalMs = interval;
        }
      }
    }
    lastPulseMs = now;
  }

  previousPreviousPpgAbsAc = previousPpgAbsAc;
  previousPpgAbsAc = absAc;

  if (lastPulseMs != 0 && now - lastPulseMs > HR_MAX_INTERVAL_MS + 500) {
    stableBeatCount = 0;
    realBpmValid = false;
    lastPulseMs = 0;
  }

  realBpmValid = stableBeatCount >= HR_REQUIRED_STABLE_BEATS &&
                 now - fingerDetectedSinceMs >= PPG_MIN_ACQUIRE_MS &&
                 realBpm >= 40.0f && realBpm <= 180.0f;
  bpmOutput = realBpmValid ? realBpm : 0.0f;

  // No se inventa SpO2: este montaje solo entrega un canal optico analogico.
  spo2Available = false;
  oxygenSaturationPercent = 0.0f;
}

// ============================================================

// PRESION

// ============================================================

bool readPressureRaw(long& value, unsigned long timeoutMs) {

  unsigned long start = millis();

  while (!pressureSensor.readyToSend()) {

    if (millis() - start >= timeoutMs) {

      return false;

    }

    delay(1);

  }

  value = pressureSensor.read();

  return true;

}

// ------------------------------------------------------------

// CERO AUTOMATICO

// ------------------------------------------------------------

void capturePressureZero() {

  setPump(false);

  setValveClosed(false);

  delay(500);

  constexpr uint8_t SAMPLE_COUNT = 20;

  int64_t accumulator = 0;

  uint8_t validSamples = 0;

  for (uint8_t i = 0; i < SAMPLE_COUNT; i++) {

    long raw;

    if (readPressureRaw(raw, 500)) {

      accumulator += raw;

      validSamples++;

    }

  }

  if (validSamples == 0) {

    pressureSensorAvailable = false;

    pressureZeroReady = false;

    Serial.println("[PRESION] ERROR: HX710B sin respuesta.");

    return;

  }

  pressureSensorAvailable = true;

  pressureZeroRaw =

    (long)(accumulator / validSamples);

  pressureRaw = pressureZeroRaw;

  cuffPressureMmHg = 0.0f;

  cuffPressureFilteredMmHg = 0.0f;

  pressureZeroReady = true;

  Serial.print("[PRESION] ZERO RAW = ");

  Serial.println(pressureZeroRaw);

}

// ------------------------------------------------------------

// ACTUALIZACION CONTINUA

// ------------------------------------------------------------

void updatePressure() {
  unsigned long now = millis();

  bool newPressureSample = false;

  // No bloqueamos el loop esperando una lectura.
  if (pressureSensor.readyToSend()) {
    pressureRaw = pressureSensor.read();
    pressureSensorAvailable = true;
    newPressureSample = true;
    if (pressureZeroReady) {
      pressureDeltaCounts = labs(pressureRaw - pressureZeroRaw);
      cuffPressureMmHg = max(0.0f, (float)pressureDeltaCounts / pressureCountsPerMmHg);
      cuffPressureFilteredMmHg = 0.82f * cuffPressureFilteredMmHg +
                                 0.18f * cuffPressureMmHg;
      if (pressureState == PressureState::INFLATING &&
          cuffPressureFilteredMmHg > lastCuffPeakMmHg) {
        lastCuffPeakMmHg = cuffPressureFilteredMmHg;
      }
    }
  }

  // INFLANDO
  if (pressureState == PressureState::INFLATING) {
    if (pressureRaw <= PRESSURE_ADC_SATURATION_MARGIN ||
        pressureRaw >= PRESSURE_ADC_MAX_READING - PRESSURE_ADC_SATURATION_MARGIN) {
      abortPressureMeasurement("ADC de presion saturado");
      return;
    }
    if (now - pressureCycleStartMs >= MAX_INFLATION_TIME_MS) {
      abortPressureMeasurement("timeout de inflado");
      return;
    }
    if (cuffPressureFilteredMmHg >= PRESSURE_MAX_MMHG) {
      abortPressureMeasurement("limite maximo alcanzado");
      return;
    }
    // Solo se considera fuga/valvula abierta si tras varios segundos no hubo
    // una subida minima. La subida normal de presion nunca dispara esta alarma.
    if (now - pressureCycleStartMs >= 7000 && cuffPressureFilteredMmHg < 15.0f) {
      abortPressureMeasurement("sin aumento de presion; revisar manguito o valvula");
      return;
    }
    if (cuffPressureFilteredMmHg >= inflationLastProgressMmHg + 3.0f) {
      inflationLastProgressMmHg = cuffPressureFilteredMmHg;
      inflationLastProgressMs = now;
    } else if (cuffPressureFilteredMmHg >= 60.0f &&
               now - inflationLastProgressMs >= 4000) {
      abortPressureMeasurement("presion estancada; bomba detenida por seguridad");
      return;
    }
    if (cuffPressureFilteredMmHg >= PRESSURE_TARGET_MMHG) {
      setPump(false);
      pressureHoldStartMs = now;
      pressureState = PressureState::HOLDING;
      Serial.print("[PRESION] Objetivo alcanzado: ");
      Serial.print(cuffPressureFilteredMmHg, 1);
      Serial.println(" mmHg");
      return;
    }
  }

  if (pressureState == PressureState::HOLDING) {
    if (now - pressureHoldStartMs >= PRESSURE_HOLD_MS) {
      beginPressureDeflation();
      return;
    }
  }

  // Desinflado controlado: abre la valvula en pulsos breves y usa las
  // oscilaciones cardiacas superpuestas a la presion del manguito.
  if (pressureState == PressureState::DEFLATING) {
    if (valvePulseOpenUntilMs != 0 &&
        (int32_t)(valvePulseOpenUntilMs - now) > 0) {
      setValveClosed(false);
    } else {
      if (valvePulseOpenUntilMs != 0) {
        setValveClosed(true);
        valvePulseOpenUntilMs = 0;
      }
      if (now - lastValvePulseMs >= PRESSURE_VALVE_PERIOD_MS) {
        lastValvePulseMs = now;
        valvePulseOpenUntilMs = now + PRESSURE_VALVE_OPEN_MS;
        setValveClosed(false);
      }
    }

    if (newPressureSample) {
      pressureDcMmHg = 0.94f * pressureDcMmHg +
                       0.06f * cuffPressureMmHg;
      pressureOscillationMmHg = cuffPressureMmHg - pressureDcMmHg;
      pressureOscillationEnvelope =
        0.82f * pressureOscillationEnvelope +
        0.18f * fabsf(pressureOscillationMmHg);

      bool awayFromValvePulse = now - lastValvePulseMs >=
                                PRESSURE_VALVE_OPEN_MS + 120;
      if (awayFromValvePulse &&
          now - pressureDeflationStartMs > 1000 &&
          cuffPressureFilteredMmHg <= PRESSURE_TARGET_MMHG &&
          cuffPressureFilteredMmHg >= PRESSURE_DEFLATE_END_MMHG &&
          pressureOscillationSampleCount < PRESSURE_OSC_MAX_SAMPLES) {
        pressureOscillationSamples[pressureOscillationSampleCount++] = {
          cuffPressureFilteredMmHg,
          pressureOscillationEnvelope
        };
      }
    }

    if (cuffPressureFilteredMmHg <= PRESSURE_DEFLATE_END_MMHG) {
      finishPressureMeasurement();
      return;
    }
    if (now - pressureDeflationStartMs >= MAX_DEFLATION_TIME_MS) {
      abortPressureMeasurement("timeout de desinflado controlado");
      return;
    }
  }

  if (pressureState == PressureState::RELEASING) {
    if (cuffPressureFilteredMmHg <= PRESSURE_RELEASE_MMHG ||
        now - pressureReleaseStartMs >= MAX_RELEASE_TIME_MS) {
      pressureState = PressureState::IDLE;
      pressureFault = false;
      setPump(false);
      setValveClosed(false);
      Serial.println("[PRESION] Manguito liberado. Listo.");
    }
  }
}

// ------------------------------------------------------------

// INICIAR MEDICION

// ------------------------------------------------------------

void startPressureMeasurement(const char* source) {

  if (pressureState != PressureState::IDLE) {

    Serial.println("[PRESION] Ya existe un ciclo activo.");

    return;

  }

  if (!pressureZeroReady) {

    Serial.println("[PRESION] Sin cero valido. Reintentando pzero...");

    capturePressureZero();

    if (!pressureZeroReady) {

      Serial.println("[PRESION] No se puede iniciar.");

      return;

    }

  }

  pressureFault = false;

  pressureResultAvailable = false;

  estimatedSystolicMmHg = 0;

  estimatedDiastolicMmHg = 0;

  estimatedMapMmHg = 0.0f;

  pressureTriggerSource = source;

  pressureMeasurementSequence++;

  lastCuffPeakMmHg = 0.0f;

  pressureOscillationSampleCount = 0;

  pressureOscillationMmHg = 0.0f;

  pressureOscillationEnvelope = 0.0f;

  // Cerrar primero la valvula

  setValveClosed(true);

  delay(80);

  // Encender bomba

  setPump(true);

  pressureCycleStartMs = millis();

  inflationLastProgressMs = pressureCycleStartMs;

  inflationLastProgressMmHg = 0.0f;

  pressureState = PressureState::INFLATING;

  Serial.println("[PRESION] VALVULA CERRADA");

  Serial.println("[PRESION] BOMBA ENCENDIDA");

  Serial.println("[PRESION] Inflando...");

}

// ------------------------------------------------------------

// TOMA COMPLETADA

// ------------------------------------------------------------

void finishPressureMeasurement() {
  setPump(false);
  pressureResultAvailable = calculateOscillometricPressure();
  if (pressureResultAvailable) {
    pressureResultSequence++;
    lastPressureMeasuredAtMs = millis();
  }

  Serial.print("[PRESION] Toma terminada. Pico manguito ~= ");
  Serial.print(lastCuffPeakMmHg, 1);
  Serial.println(" mmHg");
  if (pressureResultAvailable) {
    Serial.print("[PRESION] Resultado oscilometrico = ");
    Serial.print(estimatedSystolicMmHg);
    Serial.print("/");
    Serial.print(estimatedDiastolicMmHg);
    Serial.print(" mmHg; MAP=");
    Serial.println(estimatedMapMmHg, 1);
  } else {
    Serial.println("[PRESION] Sin suficientes pulsos para estimar sistolica/diastolica.");
  }
  Serial.println("[PRESION] Abriendo valvula...");
  if (pressureResultAvailable) pressureNotificationStartMs = millis();
  setValveClosed(false);
  pressureReleaseStartMs = millis();
  pressureState = PressureState::RELEASING;
}

void beginPressureDeflation() {
  setPump(false);
  setValveClosed(true);
  pressureDeflationStartMs = millis();
  lastValvePulseMs = pressureDeflationStartMs;
  valvePulseOpenUntilMs = 0;
  pressureDcMmHg = cuffPressureMmHg;
  pressureOscillationMmHg = 0.0f;
  pressureOscillationEnvelope = 0.0f;
  pressureOscillationSampleCount = 0;
  pressureState = PressureState::DEFLATING;
  Serial.println("[PRESION] Desinflado controlado y captura oscilometrica...");
}

bool calculateOscillometricPressure() {
  if (pressureOscillationSampleCount < 30) return false;

  uint16_t mapIndex = 0;
  float maximumEnvelope = 0.0f;
  for (uint16_t i = 2; i + 2 < pressureOscillationSampleCount; i++) {
    float smoothedEnvelope = 0.0f;
    for (int8_t offset = -2; offset <= 2; offset++) {
      smoothedEnvelope += pressureOscillationSamples[i + offset].amplitudeMmHg;
    }
    smoothedEnvelope /= 5.0f;
    float pressure = pressureOscillationSamples[i].pressureMmHg;
    if (pressure >= 50.0f && pressure <= 140.0f &&
        smoothedEnvelope > maximumEnvelope) {
      maximumEnvelope = smoothedEnvelope;
      mapIndex = i;
    }
  }

  if (maximumEnvelope < 0.08f || mapIndex < 3 ||
      mapIndex + 3 >= pressureOscillationSampleCount) {
    return false;
  }

  estimatedMapMmHg = pressureOscillationSamples[mapIndex].pressureMmHg;
  float systolicThreshold = maximumEnvelope * SYSTOLIC_ENVELOPE_RATIO;
  float diastolicThreshold = maximumEnvelope * DIASTOLIC_ENVELOPE_RATIO;
  float systolic = 0.0f;
  float diastolic = 0.0f;

  // Los puntos estan ordenados desde presion alta hacia presion baja.
  for (uint16_t i = 1; i <= mapIndex; i++) {
    float previous = pressureOscillationSamples[i - 1].amplitudeMmHg;
    float current = pressureOscillationSamples[i].amplitudeMmHg;
    if (previous < systolicThreshold && current >= systolicThreshold) {
      systolic = pressureOscillationSamples[i].pressureMmHg;
      break;
    }
  }
  for (uint16_t i = mapIndex + 1; i < pressureOscillationSampleCount; i++) {
    float previous = pressureOscillationSamples[i - 1].amplitudeMmHg;
    float current = pressureOscillationSamples[i].amplitudeMmHg;
    if (previous > diastolicThreshold && current <= diastolicThreshold) {
      diastolic = pressureOscillationSamples[i].pressureMmHg;
      break;
    }
  }

  if (systolic < 80.0f || systolic > 220.0f ||
      diastolic < 40.0f || diastolic > 140.0f ||
      systolic - diastolic < 20.0f ||
      !(systolic > estimatedMapMmHg && estimatedMapMmHg > diastolic)) {
    estimatedSystolicMmHg = 0;
    estimatedDiastolicMmHg = 0;
    estimatedMapMmHg = 0.0f;
    return false;
  }

  estimatedSystolicMmHg = (int)roundf(systolic);
  estimatedDiastolicMmHg = (int)roundf(diastolic);
  return true;
}

// ------------------------------------------------------------

// FALLO DE PRESION

// ------------------------------------------------------------

void abortPressureMeasurement(const char* reason) {

  setPump(false);

  setValveClosed(false);

  pressureFault = true;

  pressureReleaseStartMs = millis();

  pressureState = PressureState::RELEASING;

  Serial.print("[PRESION] ABORTADO: ");

  Serial.println(reason);

}

const char* pressureStateName() {

  switch (pressureState) {

    case PressureState::IDLE: return "IDLE";

    case PressureState::INFLATING: return "INFLATING";

    case PressureState::HOLDING: return "HOLDING";

    case PressureState::DEFLATING: return "DEFLATING";

    case PressureState::RELEASING: return "RELEASING";

  }

  return "UNKNOWN";

}

void muteAlarm(const char* source) {

  if (!alarmActive) {

    Serial.println("[ALARMA] No existe alarma activa.");

    return;

  }

  alarmMutedUntilMs = millis() + ALARM_MUTE_MS;

  alarmMuteSequence++;

  alarmMuteSource = source;

  noTone(BUZZER_PIN);

  Serial.println("[ALARMA] Buzzer silenciado 30 segundos.");

}

// ============================================================

// BOTONES

// ============================================================

void updateButtons() {

  unsigned long now = millis();

  bool inflateButtonState =

    digitalRead(BUTTON_INFLATE_PIN);

  bool muteButtonState =

    digitalRead(BUTTON_MUTE_PIN);

  // ----------------------------------------------------------

  // BOTON INFLAR

  // INPUT_PULLUP -> presionado = LOW

  // ----------------------------------------------------------

  if (lastInflateButtonState == HIGH &&

      inflateButtonState == LOW &&

      now - lastInflateDebounceMs >= BUTTON_DEBOUNCE_MS) {

    lastInflateDebounceMs = now;

    startPressureMeasurement("esp32_button");

  }

  // ----------------------------------------------------------

  // BOTON MUTE

  // ----------------------------------------------------------

  if (lastMuteButtonState == HIGH &&

      muteButtonState == LOW &&

      now - lastMuteDebounceMs >= BUTTON_DEBOUNCE_MS) {

    lastMuteDebounceMs = now;

    muteAlarm("esp32_button");

  }

  lastInflateButtonState =

    inflateButtonState;

  lastMuteButtonState =

    muteButtonState;

}

// ============================================================

// COMANDOS SERIAL

// ============================================================

void updateSerialCommands() {

  if (!Serial.available()) {

    return;

  }

  String command =

    Serial.readStringUntil('\n');

  command.trim();

  command.toLowerCase();

  if (command == "inflate") {

    startPressureMeasurement("serial");

  } else if (command == "mute") {

    muteAlarm("serial");

  } else if (command == "pzero") {

    if (pressureState == PressureState::IDLE) {

      capturePressureZero();

    }

  } else if (command == "status") {

    printTelemetry();

  }

}

// ============================================================

// ALARMAS

// ============================================================

bool alarmMuted() {

  if (alarmMutedUntilMs == 0) {

    return false;

  }

  if ((int32_t)(alarmMutedUntilMs - millis()) > 0) {

    return true;

  }

  alarmMutedUntilMs = 0;

  return false;

}

void evaluateAlarms() {

  // ----------------------------------------------------------

  // PPG:

  // Solo alarma si no hay dedo.

  // Se da un margen despues de la calibracion inicial.

  // ----------------------------------------------------------

  fingerAlarm =

    ppgCalibrationComplete &&

    millis() - ppgCalibrationDoneMs >=

      PPG_NO_FINGER_GRACE_MS &&

    !fingerDetected;

  // ----------------------------------------------------------

  // ALARMA GENERAL

  // ----------------------------------------------------------

  alarmActive =

    respirationMissing ||

    temperatureAlarm ||

    fingerAlarm ||

    pressureFault;

}

// ============================================================

// ACTUADORES

// ============================================================

void setPump(bool on) {

  bool level =

    PUMP_ACTIVE_HIGH ? on : !on;

  digitalWrite(

    AIR_PUMP_PIN,

    level ? HIGH : LOW

  );

}

void setValveClosed(bool closed) {

  bool level =

    VALVE_ACTIVE_HIGH ? closed : !closed;

  digitalWrite(

    AIR_VALVE_PIN,

    level ? HIGH : LOW

  );

}

void setFan(bool on) {

  fanOn = on;

  bool level;

  if (FAN_RELAY_ACTIVE_LOW) {

    level = !on;

  } else {

    level = on;

  }

  digitalWrite(

    FAN_RELAY_PIN,

    level ? HIGH : LOW

  );

}

// ============================================================

// LEDs

// ============================================================

void updateOutputs() {

  // LED sistema encendido

  digitalWrite(

    LED_ON_PIN,

    HIGH

  );

  // LED WiFi

  digitalWrite(

    LED_WIFI_PIN,

    WiFi.status() == WL_CONNECTED

      ? HIGH

      : LOW

  );

  // LED alarma

  // La confirmacion del tensiometro NO usa este LED.

  digitalWrite(

    LED_ALARM_PIN,

    alarmActive

      ? HIGH

      : LOW

  );

}

// ============================================================

// BUZZER

// ============================================================

void updateBuzzer() {

  unsigned long now = millis();

  // ----------------------------------------------------------

  // DOS BEEPS DE TOMA DE PRESION COMPLETADA

  // Tienen prioridad y no representan alarma.

  // ----------------------------------------------------------

  if (pressureNotificationStartMs != 0) {

    unsigned long elapsed =

      now - pressureNotificationStartMs;

    // Primer beep

    if (elapsed < 120) {

      tone(BUZZER_PIN, 2400);

      return;

    }

    // Silencio

    if (elapsed < 280) {

      noTone(BUZZER_PIN);

      return;

    }

    // Segundo beep

    if (elapsed < 400) {

      tone(BUZZER_PIN, 2400);

      return;

    }

    if (elapsed < 550) {

      noTone(BUZZER_PIN);

      return;

    }

    pressureNotificationStartMs = 0;

  }

  // ----------------------------------------------------------

  // ALARMA GENERAL

  // ----------------------------------------------------------

  if (alarmActive &&

      !alarmMuted()) {

    unsigned long phase =

      now % 700;

    if (phase < 220) {

      tone(BUZZER_PIN, 1900);

    } else {

      noTone(BUZZER_PIN);

    }

    return;

  }

  noTone(BUZZER_PIN);

}

// ============================================================

// WIFI

// ============================================================

void ensureWifi() {

  // WiFi deshabilitado voluntariamente

  if (strlen(WIFI_SSID) == 0) {

    return;

  }

  if (WiFi.status() == WL_CONNECTED) {

    return;

  }

  unsigned long now = millis();

  if (lastWifiAttemptMs != 0 &&

      now - lastWifiAttemptMs <

      WIFI_RETRY_MS) {

    return;

  }

  lastWifiAttemptMs = now;

  WiFi.mode(WIFI_STA);

  WiFi.begin(

    WIFI_SSID,

    WIFI_PASSWORD

  );

  Serial.println("[WiFi] Intentando conexion...");

}

// ============================================================

// MQTT

// ============================================================

void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.println("[WSS] Desconectado");
      wsBridge.setConnected(false);
      if (mqttClient.connected()) {
        mqttClient.disconnect();
      }
      break;

    case WStype_CONNECTED:
      Serial.print("[WSS] Conectado: wss://");
      Serial.print(MQTT_HOST);
      Serial.println(MQTT_WS_PATH);
      wsBridge.setConnected(true);
      lastMqttAttemptMs = 0;
      break;

    case WStype_BIN:
      // MQTT via WebSocket usa datos binarios.
      wsBridge.addData(payload, length);
      break;

    case WStype_TEXT:
      Serial.print("[WSS] TEXT inesperado: ");
      for (size_t i = 0; i < length; i++) {
        Serial.print((char)payload[i]);
      }
      Serial.println();
      break;

    case WStype_ERROR:
      Serial.println("[WSS] Error");
      break;

    case WStype_PING:
    case WStype_PONG:
    default:
      break;
  }
}

// ============================================================

// MQTT

// ============================================================

void ensureMqtt() {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  // No iniciar MQTT hasta que el handshake WSS haya terminado.
  if (!wsBridge.connected()) {
    return;
  }

  if (mqttClient.connected()) {
    return;
  }

  unsigned long now = millis();

  if (lastMqttAttemptMs != 0 &&
      now - lastMqttAttemptMs < MQTT_RETRY_MS) {
    return;
  }

  lastMqttAttemptMs = now;

  String clientId = String("luz-") + DEVICE_ID + "-" +
                    String((uint32_t)(ESP.getEfuseMac() & 0xFFFFFFFF), HEX);

  Serial.print("[MQTT] Conectando por WSS a wss://");
  Serial.print(MQTT_HOST);
  Serial.println(MQTT_WS_PATH);

  if (mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASS)) {
    String controlTopic =
      String("luz/device/") +
      DEVICE_ID +
      "/control";

    bool subscribed = mqttClient.subscribe(controlTopic.c_str());

    Serial.println("[MQTT] Conectado.");
    Serial.print("[MQTT] SUB ");
    Serial.print(subscribed ? "OK -> " : "FAILED -> ");
    Serial.println(controlTopic);
  } else {
    Serial.print("[MQTT] Error de conexion, estado: ");
    Serial.println(mqttClient.state());
  }
}

// ============================================================

// MQTT CALLBACK

// ============================================================

void mqttCallback(char* topic, byte* payload, unsigned int length) {

  String expectedTopic =

    String("luz/device/") +

    DEVICE_ID +

    "/control";

  if (String(topic) != expectedTopic) {

    return;

  }

  String message;

  for (unsigned int i = 0; i < length; i++) {

    message += (char)payload[i];

  }

  message.toLowerCase();

  const char* source = "mqtt";

  if (message.indexOf("scheduled") >= 0) source = "scheduled";

  else if (message.indexOf("doctor") >= 0) source = "doctor";

  else if (message.indexOf("public") >= 0) source = "public";

  if (message.indexOf("inflate") >= 0) {

    startPressureMeasurement(source);

  }

  if (message.indexOf("mute") >= 0) {

    muteAlarm(source);

  }

  if (message.indexOf("pzero") >= 0 && pressureState == PressureState::IDLE) {

    capturePressureZero();

  }

}

// ============================================================

// MQTT TELEMETRIA

// ============================================================

void publishTelemetry() {

  if (!mqttClient.connected()) {

    return;

  }

  String topic =

    String("luz/device/") +

    DEVICE_ID +

    "/telemetry";

  float heartRateToSend =

    fingerDetected && bpmOutput > 0.0f

      ? bpmOutput

      : 0.0f;

  float bodyTempToSend =

    temperatureValid

      ? bodyTemperatureC

      : 0.0f;

  float ambientTempToSend =

    temperatureValid

      ? ambientTemperatureC

      : 0.0f;

  String payload;

  payload.reserve(1536);

  payload += "{";

  payload += "\"deviceId\":\"";

  payload += DEVICE_ID;

  payload += "\",";

  payload += "\"ts\":";

  payload += String(millis());

  payload += ",";

  payload += "\"heartRateBpm\":";

  payload += String(heartRateToSend, 1);

  payload += ",";

  payload += "\"oxygenSaturationPercent\":";

  payload += String(oxygenSaturationPercent, 1);

  payload += ",";

  payload += "\"spo2Available\":";

  payload += spo2Available ? "true" : "false";

  payload += ",";

  payload += "\"ppgSignalQualityPercent\":";

  payload += String(ppgSignalQualityPercent, 1);

  payload += ",";

  payload += "\"temperatureC\":";

  payload += String(bodyTempToSend, 1);

  payload += ",";

  payload += "\"ambientTemperatureC\":";

  payload += String(ambientTempToSend, 1);

  payload += ",";

  payload += "\"estimatedSystolicMmHg\":";

  payload += String(estimatedSystolicMmHg);

  payload += ",";

  payload += "\"estimatedDiastolicMmHg\":";

  payload += String(estimatedDiastolicMmHg);

  payload += ",";

  payload += "\"estimatedMapMmHg\":";

  payload += String(estimatedMapMmHg, 1);

  payload += ",";

  payload += "\"fingerDetected\":";

  payload += fingerDetected ? "true" : "false";

  payload += ",";

  payload += "\"monitoringEnabled\":true,";

  payload += "\"calibrationComplete\":";

  payload +=

    (mqCalibrationComplete &&

     ppgCalibrationComplete &&

     pressureZeroReady)

      ? "true"

      : "false";

  payload += ",";

  payload += "\"respirationDetected\":";

  payload += respirationDetected ? "true" : "false";

  payload += ",";

  payload += "\"respirationMissing\":";

  payload += respirationMissing ? "true" : "false";

  payload += ",";

  payload += "\"respiratoryRateBpm\":";

  payload += String(respiratoryRateBpm, 1);

  payload += ",";

  payload += "\"strongRespirationDetected\":";

  payload += strongRespirationDetected ? "true" : "false";

  payload += ",";

  payload += "\"pressureState\":\"";

  payload += pressureStateName();

  payload += "\",";

  payload += "\"cuffPressureMmHg\":";

  payload += String(cuffPressureFilteredMmHg, 1);

  payload += ",";

  payload += "\"pressureTargetMmHg\":";

  payload += String(PRESSURE_TARGET_MMHG, 1);

  payload += ",";

  payload += "\"pressureZeroReady\":";

  payload += pressureZeroReady ? "true" : "false";

  payload += ",";

  payload += "\"pressureFault\":";

  payload += pressureFault ? "true" : "false";

  payload += ",";

  payload += "\"pressureResultAvailable\":";

  payload += pressureResultAvailable ? "true" : "false";

  payload += ",";

  payload += "\"pressureMeasurementSequence\":";

  payload += String(pressureMeasurementSequence);

  payload += ",";

  payload += "\"pressureResultSequence\":";

  payload += String(pressureResultSequence);

  payload += ",";

  payload += "\"pressureTriggerSource\":\"";

  payload += pressureTriggerSource;

  payload += "\",";

  payload += "\"lastPressureMeasuredAtMs\":";

  payload += String(lastPressureMeasuredAtMs);

  payload += ",";

  payload += "\"alarmActive\":";

  payload += alarmActive ? "true" : "false";

  payload += ",";

  payload += "\"alarmMuted\":";

  payload += alarmMuted() ? "true" : "false";

  payload += ",";

  payload += "\"alarmMuteSequence\":";

  payload += String(alarmMuteSequence);

  payload += ",";

  payload += "\"alarmMuteSource\":\"";

  payload += alarmMuteSource;

  payload += "\",";

  payload += "\"temperatureValid\":";

  payload += temperatureValid ? "true" : "false";

  payload += ",";

  payload += "\"temperatureAlarm\":";

  payload += temperatureAlarm ? "true" : "false";

  payload += ",";

  payload += "\"fanOn\":";

  payload += fanOn ? "true" : "false";

  payload += ",";

  payload += "\"warningActive\":";

  payload += alarmActive ? "true" : "false";

  payload += ",";

  payload += "\"alertActive\":";

  payload +=

    (temperatureAlarm || pressureFault)

      ? "true"

      : "false";

  payload += "}";

  bool published =

    mqttClient.publish(

      topic.c_str(),

      payload.c_str(),

      false

    );

  if (!published) {

    Serial.print("[MQTT] Publish FAILED. Bytes=");

    Serial.println(payload.length());

  } else {

    Serial.print("[MQTT] TX ");

    Serial.print(payload.length());

    Serial.print(" bytes -> ");

    Serial.println(topic);

  }

}

float sanitizeMqttNumber(float value, float fallback) {

  if (isnan(value) || isinf(value)) {

    return fallback;

  }

  return value;

}

// ============================================================

// MQTT RAW TELEMETRY (datos crudos de sensores)

// ============================================================

void publishRawTelemetry() {

  if (!mqttClient.connected()) {

    return;

  }

  String topic =

    String("luz/device/") +

    DEVICE_ID +

    "/raw";

  String payload;

  payload.reserve(1280);

  payload += "{";

  payload += "\"deviceId\":\"";

  payload += DEVICE_ID;

  payload += "\",";

  payload += "\"ts\":";

  payload += String(millis());

  payload += ",";

  payload += "\"ppgRaw\":";

  payload += ppgRaw;

  payload += ",";

  payload += "\"ppgSmoothed\":";

  payload += ppgSmoothed;

  payload += ",";

  payload += "\"ppgBaseline\":";

  payload += String(ppgNoFingerBaseline, 1);

  payload += ",";

  payload += "\"hrBaseline\":";

  payload += String(hrBaseline, 1);

  payload += ",";

  payload += "\"ppgAcValue\":";

  payload += String(ppgAcValue, 2);

  payload += ",";

  payload += "\"ppgAcAmplitude\":";

  payload += String(ppgAcAmplitude, 2);

  payload += ",";

  payload += "\"ppgPeakThreshold\":";

  payload += String(ppgPeakThreshold, 2);

  payload += ",";

  payload += "\"ppgSignalQualityPercent\":";

  payload += String(ppgSignalQualityPercent, 1);

  payload += ",";

  payload += "\"perfusionIndexPercent\":";

  payload += String(perfusionIndexPercent, 2);

  payload += ",";

  payload += "\"lastBeatIntervalMs\":";

  payload += String(lastBeatIntervalMs);

  payload += ",";

  payload += "\"stableBeatCount\":";

  payload += String(stableBeatCount);

  payload += ",";

  payload += "\"fingerAcquireMs\":";

  payload += fingerDetected ? String(millis() - fingerDetectedSinceMs) : "0";

  payload += ",";

  payload += "\"mqRaw\":";

  payload += mqRaw;

  payload += ",";

  payload += "\"mqFiltered\":";

  payload += String(mqFiltered, 1);

  payload += ",";

  payload += "\"mqBaseline\":";

  payload += String(mqBaseline, 1);

  payload += ",";

  payload += "\"mqDelta\":";

  payload += mqDelta;

  payload += ",";

  payload += "\"mqBreathThreshold\":";

  payload += String(MQ_BREATH_RISE_ADC);

  payload += ",";

  payload += "\"mqStrongThreshold\":";

  payload += String(MQ_STRONG_BREATH_RISE_ADC);

  payload += ",";

  payload += "\"pressureRaw\":";

  payload += pressureRaw;

  payload += ",";

  payload += "\"pressureZeroRaw\":";

  payload += pressureZeroRaw;

  payload += ",";

  payload += "\"pressureDeltaCounts\":";

  payload += String(pressureDeltaCounts);

  payload += ",";

  payload += "\"pressureCountsPerMmHg\":";

  payload += String(pressureCountsPerMmHg, 2);

  payload += ",";

  payload += "\"cuffPressureRawMmHg\":";

  payload += String(cuffPressureMmHg, 2);

  payload += ",";

  payload += "\"cuffPressureFilteredMmHg\":";

  payload += String(cuffPressureFilteredMmHg, 2);

  payload += ",";

  payload += "\"pressureOscillationMmHg\":";

  payload += String(pressureOscillationMmHg, 3);

  payload += ",";

  payload += "\"pressureOscillationEnvelope\":";

  payload += String(pressureOscillationEnvelope, 3);

  payload += ",";

  payload += "\"pressureOscillationSampleCount\":";

  payload += String(pressureOscillationSampleCount);

  payload += ",";

  payload += "\"realBpm\":";

  payload += String(realBpm, 1);

  payload += ",";

  payload += "\"realBpmValid\":";

  payload += realBpmValid ? "true" : "false";

  payload += ",";

  payload += "\"mlxAmbientC\":";

  payload += mlxAvailable ? String(mlx.readAmbientTempC(), 2) : "null";

  payload += ",";

  payload += "\"mlxObjectC\":";

  payload += mlxAvailable ? String(mlx.readObjectTempC(), 2) : "null";

  payload += "}";

  mqttClient.publish(topic.c_str(), payload.c_str(), false);

}

// ============================================================

// MONITOR SERIAL

// ============================================================

void printTelemetry() {

  Serial.print("TEMP=");

  if (temperatureValid) {

    Serial.print(

      bodyTemperatureC,

      1

    );

    Serial.print("C");

  } else {

    Serial.print("N/A");

  }

  // ----------------------------------------------------------

  // RESPIRACION

  // ----------------------------------------------------------

  Serial.print(" | RESP=");

  if (!mqCalibrationComplete) {

    Serial.print("CAL");

  } else if (respirationMissing) {

    Serial.print("NO");

  } else if (respirationDetected) {

    Serial.print("SI");

  } else {

    Serial.print("ESP");

  }

  Serial.print(" MQ=");

  Serial.print(mqRaw);

  Serial.print(" d=");

  Serial.print(mqDelta);

  // ----------------------------------------------------------

  // PPG

  // ----------------------------------------------------------

  Serial.print(" | DEDO=");

  if (!ppgCalibrationComplete) {

    Serial.print("CAL");

  } else {

    Serial.print(

      fingerDetected

        ? "SI"

        : "NO"

    );

  }

  Serial.print(" PPG=");

  Serial.print(ppgRaw);

  Serial.print(" | BPM=");

  if (fingerDetected) {

    Serial.print(

      bpmOutput,

      1

    );

  } else {

    Serial.print("-");

  }

  Serial.print(" | FR=");

  Serial.print(respiratoryRateBpm, 1);

  Serial.print("rpm");

  // ----------------------------------------------------------

  // PRESION

  // ----------------------------------------------------------

  Serial.print(" | RAW_PRESS=");

  Serial.print(pressureRaw);

  Serial.print(" | ZERO_PRESS=");

  Serial.print(pressureZeroRaw);

  Serial.print(" | CUFF=");

  if (pressureZeroReady) {

    Serial.print(

      cuffPressureFilteredMmHg,

      1

    );

    Serial.print("mmHg");

  } else {

    Serial.print("NO-ZERO");

  }

  Serial.print(" | PSTATE=");

  Serial.print(pressureStateName());

  Serial.print(" | PA=");

  if (pressureResultAvailable) {

    Serial.print(estimatedSystolicMmHg);

    Serial.print("/");

    Serial.print(estimatedDiastolicMmHg);

  } else {

    Serial.print("-");

  }

  // ----------------------------------------------------------

  // ALARMA

  // ----------------------------------------------------------

  Serial.print(" | ALARMA=");

  Serial.print(

    alarmActive

      ? "SI"

      : "NO"

  );

  if (alarmMuted()) {

    Serial.print("(MUTE)");

  }

  // Motivos

  if (alarmActive) {

    Serial.print("[");

    bool first = true;

    if (respirationMissing) {

      Serial.print("RESP");

      first = false;

    }

    if (temperatureAlarm) {

      if (!first) Serial.print(",");

      Serial.print("TEMP");

      first = false;

    }

    if (fingerAlarm) {

      if (!first) Serial.print(",");

      Serial.print("DEDO");

      first = false;

    }

    if (pressureFault) {

      if (!first) Serial.print(",");

      Serial.print("PRESS");

    }

    Serial.print("]");

  }

  // ----------------------------------------------------------

  // WIFI

  // ----------------------------------------------------------

  Serial.print(" | WIFI=");

  Serial.print(

    WiFi.status() == WL_CONNECTED

      ? "OK"

      : "OFF"

  );

  // ----------------------------------------------------------

  // VALVULA FEEDBACK GPIO36

  // ----------------------------------------------------------

  Serial.print(" | VFB=");

  Serial.print(

    digitalRead(

      VALVE_FEEDBACK_PIN

    )

  );

  Serial.println();

}
