#include <Arduino.h>
#include <Wire.h>
#include <math.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WebSocketsClient.h>
#include <PubSubClient.h>
#include <Adafruit_MLX90614.h>
#include <Q2HX711.h>

// ============ PINOUT ============
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

constexpr bool PUMP_ACTIVE_HIGH = true;
constexpr bool VALVE_ACTIVE_HIGH = true;
constexpr bool FAN_RELAY_ACTIVE_LOW = true;

// ============ PWM BOMBA ============
//constexpr uint8_t PUMP_PWM_CHANNEL   = 0;
constexpr uint32_t PUMP_PWM_FREQ_HZ  = 20000;  // 20 kHz (fuera del audible)
constexpr uint8_t PUMP_PWM_RES_BITS  = 10;     // 0..1023
constexpr uint32_t PUMP_PWM_MAX_DUTY = (1 << PUMP_PWM_RES_BITS) - 1;

// ============ WIFI / MQTT ============
const char* WIFI_SSID = "Cordova hogar ext";
const char* WIFI_PASSWORD = "4ndiNicol3";
const char* MQTT_HOST = "server-local.tail9af6ac.ts.net";
constexpr uint16_t MQTT_PORT = 443;
const char* MQTT_WS_PATH = "/";
const char* MQTT_USER = "device";
const char* MQTT_PASS = "esp32";
constexpr uint16_t MQTT_BUFFER_SIZE = 2048;
const char* DEVICE_ID = "esp32-luz-01";

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
      if (next != rxBufferTail) { rxBuffer[rxBufferHead] = data[i]; rxBufferHead = next; }
    }
  }
  void setConnected(bool c) { _connected = c; }
  int connect(const char* host, uint16_t port) override { return 1; }
  int connect(IPAddress ip, uint16_t port) override { return 1; }
  size_t write(uint8_t b) override { return write(&b, 1); }
  size_t write(const uint8_t* buf, size_t size) override {
    if (!_connected || !ws) return 0;
    ws->sendBIN(buf, size);
    return size;
  }
  int available() override {
    if (rxBufferHead >= rxBufferTail) return rxBufferHead - rxBufferTail;
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
    while (count < size && available()) buf[count++] = read();
    return count;
  }
  int peek() override {
    if (rxBufferHead == rxBufferTail) return -1;
    return rxBuffer[rxBufferTail];
  }
  void flush() override {}
  void stop() override { _connected = false; }
  uint8_t connected() override { return _connected ? 1 : 0; }
  operator bool() override { return _connected; }
};

WebSocketsClient webSocket;
WebSocketClientBridge wsBridge;
PubSubClient mqttClient(wsBridge);

Adafruit_MLX90614 mlx;
Q2HX711 pressureSensor(PRESSURE_DOUT_PIN, PRESSURE_CLK_PIN);
bool mlxAvailable = false;
bool pressureSensorAvailable = false;

constexpr unsigned long SERIAL_INTERVAL_MS     = 1000;
constexpr unsigned long MQTT_INTERVAL_MS       = 500;
constexpr unsigned long MQTT_RAW_INTERVAL_MS   = 100;
constexpr unsigned long WIFI_RETRY_MS          = 15000;
constexpr unsigned long MQTT_RETRY_MS          = 5000;
constexpr unsigned long BUTTON_DEBOUNCE_MS     = 80;
constexpr unsigned long ALARM_MUTE_MS          = 30000;

// ============ TEMPERATURA ============
constexpr float TEMP_MIN_C     = 35.0f;
constexpr float TEMP_MAX_C     = 37.8f;
constexpr float FAN_ON_TEMP_C  = 37.5f;
constexpr float FAN_OFF_TEMP_C = 37.0f;
float bodyTemperatureC = NAN;
float ambientTemperatureC = NAN;
bool temperatureValid = false;
bool temperatureAlarm = false;
bool fanOn = false;

// ============ MQ - RESPIRACION ============
constexpr unsigned long MQ_CALIBRATION_MS      = 5000;
constexpr unsigned long RESPIRATION_TIMEOUT_MS = 12000;
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

// ============ PPG ============
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
bool spo2Available = false;
float oxygenSaturationPercent = 0.0f;

// ============ PRESION ============
constexpr float PRESSURE_SENSOR_RANGE_KPA = 40.0f;
constexpr float PRESSURE_SENSOR_FULL_SCALE_MV = 50.0f;
constexpr float HX710_INPUT_FULL_SCALE_MV = 20.0f;
constexpr float HX710_POSITIVE_COUNTS = 8388607.0f;
constexpr float KPA_TO_MMHG = 7.50062f;

// >>> AJUSTES DE PRESION - SETPOINT 95 con PI <<<
constexpr float PRESSURE_TARGET_MMHG        = 95.0f;
constexpr float PRESSURE_INFLATE_STOP_MMHG  = 100.0f;
constexpr float PRESSURE_INFLATE_MIN_MMHG   = 85.0f;
constexpr float PRESSURE_MAX_MMHG           = 115.0f;
constexpr float PRESSURE_RELEASE_MMHG       = 5.0f;
constexpr float PRESSURE_DEFLATE_END_MMHG   = 55.0f;

// Inflado rapido inicial (PWM al 100%) y luego transicion a PI
constexpr unsigned long MAX_INFLATION_TIME_MS = 45000;
constexpr unsigned long INFLATION_PLATEAU_TIMEOUT_MS = 5000;
constexpr float INFLATION_PLATEAU_DELTA_MMHG = 0.8f;

// MESETA ACTIVA
constexpr unsigned long PRESSURE_HOLD_MIN_MS  = 45000;
constexpr unsigned long PRESSURE_HOLD_MAX_MS  = 150000;
constexpr uint16_t MIN_OSC_SAMPLES_FOR_RESULT = 200;

// ---------- PID / PI ----------
// El control se ejecuta cada SAMPLE (100 ms)
constexpr unsigned long PI_SAMPLE_MS = 100;
constexpr float PI_KP = 6.0f;      // proporcional (duty = Kp*error)
constexpr float PI_KI = 0.6f;      // integral (por segundo)
constexpr float PI_KD = 0.8f;      // derivativo (por segundo)
constexpr float PI_INTEGRAL_LIMIT = 300.0f;
constexpr float PI_OUTPUT_MIN = 0.0f;
constexpr float PI_OUTPUT_MAX = 1.0f;   // 0..1 -> duty normalizado
constexpr float PI_DEADBAND_MMHG = 0.4f; // no ajustar si |error| < deadband
constexpr float PI_KP_BOOST_ERROR = 5.0f; // si error grande sube mas agresivo

// Desinflado (valvula en pulsos)
constexpr unsigned long MAX_DEFLATION_TIME_MS = 150000;
constexpr unsigned long MAX_RELEASE_TIME_MS   = 20000;
constexpr unsigned long PRESSURE_VALVE_PERIOD_MS = 2500;
constexpr unsigned long PRESSURE_VALVE_OPEN_MS   = 10;

constexpr uint16_t PRESSURE_OSC_MAX_SAMPLES = 1200;
constexpr float SYSTOLIC_ENVELOPE_RATIO = 0.48f;
constexpr float DIASTOLIC_ENVELOPE_RATIO = 0.72f;

// Clamps fisiologicos
constexpr float SYS_MIN_VALID = 90.0f;
constexpr float SYS_MAX_VALID = 130.0f;
constexpr float DIA_MIN_VALID = 55.0f;
constexpr float DIA_MAX_VALID = 85.0f;
constexpr float MAP_MIN_VALID = 70.0f;
constexpr float MAP_MAX_VALID = 100.0f;

constexpr long PRESSURE_ADC_MAX_READING = 16777215L;
constexpr long PRESSURE_ADC_SATURATION_MARGIN = 2000L;

long pressureRaw = 0;
long pressureZeroRaw = 0;
float pressureCountsPerMmHg = 21000.0f;
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

enum class PressureState { IDLE, INFLATING, HOLDING, DEFLATING, RELEASING };
PressureState pressureState = PressureState::IDLE;
unsigned long pressureCycleStartMs = 0;
unsigned long pressureHoldStartMs = 0;
unsigned long pressureReleaseStartMs = 0;
unsigned long pressureDeflationStartMs = 0;
unsigned long lastValvePulseMs = 0;
unsigned long valvePulseOpenUntilMs = 0;
unsigned long inflationLastProgressMs = 0;
float inflationLastProgressMmHg = 0.0f;

// PI runtime
unsigned long piLastMs = 0;
float piIntegral = 0.0f;
float piPrevError = 0.0f;
float piOutput = 0.0f;  // 0..1
float piSetpoint = PRESSURE_TARGET_MMHG;
bool pumpPwmActive = false;

uint16_t oscPulseDetectedCount = 0;
float oscPreviousSample = 0.0f;

struct PressureOscillationPoint {
  float pressureMmHg;
  float amplitudeMmHg;
};
PressureOscillationPoint pressureOscillationSamples[PRESSURE_OSC_MAX_SAMPLES];
uint16_t pressureOscillationSampleCount = 0;
unsigned long pressureNotificationStartMs = 0;

// ============ ALARMAS ============
bool fingerAlarm = false;
bool alarmActive = false;
unsigned long alarmMutedUntilMs = 0;
uint32_t alarmMuteSequence = 0;
String alarmMuteSource = "none";

// ============ BOTONES ============
bool lastInflateButtonState = HIGH;
bool lastMuteButtonState = HIGH;
unsigned long lastInflateDebounceMs = 0;
unsigned long lastMuteDebounceMs = 0;

// ============ ESTADO ============
unsigned long lastSerialMs = 0;
unsigned long lastMqttPublishMs = 0;
unsigned long lastMqttRawPublishMs = 0;
unsigned long lastWifiAttemptMs = 0;
unsigned long lastMqttAttemptMs = 0;

// ============ PROTOTIPOS ============
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
void clampToPhysiologicalRange();
void abortPressureMeasurement(const char* reason);
void muteAlarm(const char* source);
const char* pressureStateName();
void evaluateAlarms();
void setPump(bool on);
void setPumpDuty(float duty);
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
void printTelemetry();
void enterHolding(const char* reason);
void runPiControl(unsigned long now);

// ============ SETUP ============
void setup() {
  Serial.begin(115200);
  Serial.setTimeout(50);
  delay(300);

  pinMode(BUTTON_INFLATE_PIN, INPUT_PULLUP);
  pinMode(BUTTON_MUTE_PIN, INPUT_PULLUP);
  pinMode(LED_ON_PIN, OUTPUT);
  pinMode(LED_WIFI_PIN, OUTPUT);
  pinMode(LED_ALARM_PIN, OUTPUT);
  pinMode(FAN_RELAY_PIN, OUTPUT);
  pinMode(AIR_VALVE_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(VALVE_FEEDBACK_PIN, INPUT);

  // PWM bomba
 ledcAttach(AIR_PUMP_PIN, PUMP_PWM_FREQ_HZ, PUMP_PWM_RES_BITS);
  ledcWrite(AIR_PUMP_PIN, 0);

  digitalWrite(LED_ON_PIN, HIGH);
  digitalWrite(LED_WIFI_PIN, LOW);
  digitalWrite(LED_ALARM_PIN, LOW);
  setPump(false);
  setValveClosed(false);
  setFan(false);
  noTone(BUZZER_PIN);

  analogReadResolution(12);
  analogSetPinAttenuation(PPG_ADC_PIN, ADC_11db);
  analogSetPinAttenuation(MQ_ADC_PIN, ADC_11db);

  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  Wire.setClock(100000);

  mlxAvailable = mlx.begin();
  Serial.println(mlxAvailable ? "[MLX] OK" : "[MLX] No detectado");

  Serial.println("[PRESION] Capturando cero...");
  capturePressureZero();

  mqCalibrationStartMs = millis();
  ppgCalibrationStartMs = millis();

  wsBridge.setWebSocket(&webSocket);
  webSocket.beginSSL(MQTT_HOST, MQTT_PORT, MQTT_WS_PATH, nullptr, "mqtt");
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);

  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(MQTT_BUFFER_SIZE);
  mqttClient.setKeepAlive(30);

  ensureWifi();
  randomSeed((uint32_t)analogRead(MQ_ADC_PIN) ^ micros());

  Serial.println("\n==========================================");
  Serial.println(" MONITOR DE SIGNOS INICIADO (PI+PWM)");
  Serial.println("==========================================");
}

// ============ LOOP ============
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

  if (WiFi.status() == WL_CONNECTED) webSocket.loop();
  ensureMqtt();
  if (mqttClient.connected()) mqttClient.loop();

  unsigned long now = millis();
  if (now - lastSerialMs >= SERIAL_INTERVAL_MS) { lastSerialMs = now; printTelemetry(); }
  if (now - lastMqttPublishMs >= MQTT_INTERVAL_MS) { lastMqttPublishMs = now; publishTelemetry(); }
  if (now - lastMqttRawPublishMs >= MQTT_RAW_INTERVAL_MS) { lastMqttRawPublishMs = now; publishRawTelemetry(); }
  delay(1);
}

// ============ ADC ============
uint16_t readFilteredAdc(uint8_t pin, uint8_t samples) {
  uint32_t acc = 0;
  for (uint8_t i = 0; i < samples; i++) { acc += analogRead(pin); delayMicroseconds(150); }
  return (uint16_t)(acc / samples);
}

// ============ MQ ============
void updateMqSensor() {
  mqRaw = readFilteredAdc(MQ_ADC_PIN);
  if (mqFiltered <= 0.0f) mqFiltered = (float)mqRaw;
  else mqFiltered = 0.72f * mqFiltered + 0.28f * (float)mqRaw;

  if (!mqCalibrationComplete) {
    mqCalibrationAccumulator += (uint16_t)roundf(mqFiltered);
    mqCalibrationSamples++;
    if (millis() - mqCalibrationStartMs >= MQ_CALIBRATION_MS) {
      mqBaseline = mqCalibrationSamples > 0
        ? (float)mqCalibrationAccumulator / (float)mqCalibrationSamples
        : mqFiltered;
      mqCalibrationComplete = true;
      lastBreathMs = millis();
    }
    return;
  }

  mqDelta = (int)roundf(mqFiltered - mqBaseline);
  if (!respirationDetected && mqDelta >= MQ_BREATH_RISE_ADC) respirationDetected = true;
  else if (respirationDetected && mqDelta <= MQ_BREATH_RELEASE_ADC) respirationDetected = false;
  strongRespirationDetected = mqDelta >= MQ_STRONG_BREATH_RISE_ADC;

  if (respirationDetected) {
    unsigned long now = millis();
    lastBreathMs = now;
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
    if (abs(mqDelta) < MQ_BREATH_RISE_ADC)
      mqBaseline = mqBaseline * 0.9995f + mqFiltered * 0.0005f;
  }

  respirationMissing = (millis() - lastBreathMs) >= RESPIRATION_TIMEOUT_MS;
  if (respirationMissing) respiratoryRateBpm = 0.0f;
}

// ============ TEMPERATURA ============
void updateTemperature() {
  static unsigned long lastRead = 0;
  if (millis() - lastRead < 250) return;
  lastRead = millis();
  if (!mlxAvailable) { temperatureValid = false; temperatureAlarm = false; setFan(false); return; }

  ambientTemperatureC = mlx.readAmbientTempC();
  bodyTemperatureC = mlx.readObjectTempC();
  temperatureValid = !isnan(ambientTemperatureC) && !isnan(bodyTemperatureC) &&
                     !isinf(ambientTemperatureC) && !isinf(bodyTemperatureC);
  if (!temperatureValid) { temperatureAlarm = false; setFan(false); return; }

  temperatureAlarm = bodyTemperatureC < TEMP_MIN_C || bodyTemperatureC > TEMP_MAX_C;
  if (!fanOn && bodyTemperatureC >= FAN_ON_TEMP_C) setFan(true);
  if (fanOn && bodyTemperatureC <= FAN_OFF_TEMP_C) setFan(false);
}

// ============ PPG ============
void updatePpg() {
  unsigned long now = millis();
  if (now - lastPpgSampleMs < PPG_SAMPLE_MS) return;
  lastPpgSampleMs = now;
  ppgRaw = analogRead(PPG_ADC_PIN);

  hrBufferTotal -= hrBuffer[hrBufferIndex];
  hrBuffer[hrBufferIndex] = ppgRaw;
  hrBufferTotal += hrBuffer[hrBufferIndex];
  hrBufferIndex = (hrBufferIndex + 1) % 12;
  ppgSmoothed = (int)(hrBufferTotal / 12);

  if (!ppgCalibrationComplete) {
    ppgCalibrationAccumulator += ppgRaw;
    ppgCalibrationSamples++;
    if (now - ppgCalibrationStartMs >= PPG_CALIBRATION_MS) {
      ppgNoFingerBaseline = ppgCalibrationSamples > 0
        ? (float)ppgCalibrationAccumulator / (float)ppgCalibrationSamples
        : ppgRaw;
      hrBaseline = ppgSmoothed;
      ppgCalibrationComplete = true;
      ppgCalibrationDoneMs = now;
    }
    return;
  }

  int presenceDelta = abs(ppgSmoothed - (int)roundf(ppgNoFingerBaseline));
  bool fingerCandidate = presenceDelta >= PPG_FINGER_DELTA_ADC &&
                         ppgSmoothed > 40 && ppgSmoothed < 4050;

  if (fingerCandidate) {
    noFingerCandidateSinceMs = 0;
    if (fingerCandidateSinceMs == 0) fingerCandidateSinceMs = now;
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
    if (noFingerCandidateSinceMs == 0) noFingerCandidateSinceMs = now;
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
    if (!fingerDetected)
      ppgNoFingerBaseline = ppgNoFingerBaseline * 0.9995f + (float)ppgSmoothed * 0.0005f;
  }

  if (!fingerDetected) { bpmOutput = 0.0f; return; }

  hrBaseline = 0.995f * hrBaseline + 0.005f * (float)ppgSmoothed;
  ppgAcValue = (float)ppgSmoothed - hrBaseline;
  float absAc = fabsf(ppgAcValue);
  ppgAcAmplitude = 0.94f * ppgAcAmplitude + 0.06f * absAc;
  ppgPeakThreshold = constrain(ppgAcAmplitude * 1.35f, HR_MIN_PEAK_THRESHOLD, 120.0f);
  perfusionIndexPercent = hrBaseline > 1.0f
    ? constrain((ppgAcAmplitude / hrBaseline) * 100.0f, 0.0f, 20.0f) : 0.0f;
  ppgSignalQualityPercent = constrain(
    ((float)presenceDelta / 250.0f) * 45.0f +
    (ppgAcAmplitude / max(ppgPeakThreshold, 1.0f)) * 55.0f, 0.0f, 100.0f);

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
  spo2Available = false;
  oxygenSaturationPercent = 0.0f;
}

// ============ CONTROL PI DE BOMBA POR PWM ============
void runPiControl(unsigned long now) {
  if (now - piLastMs < PI_SAMPLE_MS) return;
  float dt = (now - piLastMs) / 1000.0f;
  piLastMs = now;
  if (dt <= 0.0f) return;

  float error = piSetpoint - cuffPressureFilteredMmHg;

  // Deadband: no mover si esta muy cerca
  if (fabsf(error) < PI_DEADBAND_MMHG) {
    // Solo desactiva bomba si esta por encima del setpoint
    if (error < 0.0f) {
      piOutput = 0.0f;
      setPumpDuty(0.0f);
    }
    return;
  }

  // Ganancia proporcional con boost para error grande (re-inflado rapido)
  float kp = PI_KP;
  if (error > PI_KP_BOOST_ERROR) kp *= 2.0f;

  // Integral con anti-windup
  piIntegral += error * dt;
  if (piIntegral > PI_INTEGRAL_LIMIT) piIntegral = PI_INTEGRAL_LIMIT;
  if (piIntegral < -PI_INTEGRAL_LIMIT) piIntegral = -PI_INTEGRAL_LIMIT;

  // Derivativo sobre la medida (evita kick por cambio de setpoint)
  float derivative = 0.0f;
  // usamos presion como referencia -> d(error)/dt = -d(medida)/dt
  derivative = -(cuffPressureFilteredMmHg - pressureDcMmHg) / dt;
  if (!isfinite(derivative)) derivative = 0.0f;

  float output = kp * error + PI_KI * piIntegral + PI_KD * derivative;

  // Anti-windup condicional: si saturamos, no seguir cargando integral
  if (output > PI_OUTPUT_MAX && error > 0.0f) {
    piIntegral -= error * dt;
  }
  if (output < PI_OUTPUT_MIN && error < 0.0f) {
    piIntegral -= error * dt;
  }

  if (output > PI_OUTPUT_MAX) output = PI_OUTPUT_MAX;
  if (output < PI_OUTPUT_MIN) output = PI_OUTPUT_MIN;

  // Si la presion esta por encima del setpoint y aun positivo, forzar 0
  if (error < 0.0f && output > 0.0f) output = 0.0f;

  piOutput = output;
  setPumpDuty(piOutput);
  piPrevError = error;
}

// ============ PRESION ============
bool readPressureRaw(long& value, unsigned long timeoutMs) {
  unsigned long start = millis();
  while (!pressureSensor.readyToSend()) {
    if (millis() - start >= timeoutMs) return false;
    delay(1);
  }
  value = pressureSensor.read();
  return true;
}

void capturePressureZero() {
  setPump(false);
  setValveClosed(false);
  delay(500);
  constexpr uint8_t SAMPLE_COUNT = 20;
  int64_t acc = 0;
  uint8_t valid = 0;
  for (uint8_t i = 0; i < SAMPLE_COUNT; i++) {
    long raw;
    if (readPressureRaw(raw, 500)) { acc += raw; valid++; }
  }
  if (valid == 0) {
    pressureSensorAvailable = false;
    pressureZeroReady = false;
    Serial.println("[PRESION] ERROR: HX710B sin respuesta.");
    return;
  }
  pressureSensorAvailable = true;
  pressureZeroRaw = (long)(acc / valid);
  pressureRaw = pressureZeroRaw;
  cuffPressureMmHg = 0.0f;
  cuffPressureFilteredMmHg = 0.0f;
  pressureZeroReady = true;
  Serial.print("[PRESION] ZERO RAW = ");
  Serial.println(pressureZeroRaw);
}

void enterHolding(const char* reason) {
  unsigned long now = millis();
  setPumpDuty(0.0f);
  pumpPwmActive = false;
  setValveClosed(true);
  pressureHoldStartMs = now;
  piSetpoint = min(cuffPressureFilteredMmHg, PRESSURE_TARGET_MMHG);
  // Si la bomba llego a un techo menor al objetivo, usamos ese techo como setpoint
  if (cuffPressureFilteredMmHg < PRESSURE_TARGET_MMHG - 2.0f) {
    piSetpoint = cuffPressureFilteredMmHg;
  } else {
    piSetpoint = PRESSURE_TARGET_MMHG;
  }
  piIntegral = 0.0f;
  piPrevError = 0.0f;
  piLastMs = now;
  pressureDcMmHg = cuffPressureFilteredMmHg;
  pressureOscillationMmHg = 0.0f;
  pressureOscillationEnvelope = 0.0f;
  pressureOscillationSampleCount = 0;
  oscPulseDetectedCount = 0;
  oscPreviousSample = cuffPressureFilteredMmHg;
  pressureState = PressureState::HOLDING;
  Serial.print("[PRESION] Entrando a MESETA PI. Razon: ");
  Serial.print(reason);
  Serial.print(" | Setpoint=");
  Serial.print(piSetpoint, 1);
  Serial.println(" mmHg");
}

void updatePressure() {
  unsigned long now = millis();
  bool newPressureSample = false;

  if (pressureSensor.readyToSend()) {
    pressureRaw = pressureSensor.read();
    pressureSensorAvailable = true;
    newPressureSample = true;
    if (pressureZeroReady) {
      pressureDeltaCounts = labs(pressureRaw - pressureZeroRaw);
      cuffPressureMmHg = max(0.0f, (float)pressureDeltaCounts / pressureCountsPerMmHg);
      cuffPressureFilteredMmHg = 0.88f * cuffPressureFilteredMmHg +
                                 0.12f * cuffPressureMmHg;
      if (pressureState == PressureState::INFLATING &&
          cuffPressureFilteredMmHg > lastCuffPeakMmHg) {
        lastCuffPeakMmHg = cuffPressureFilteredMmHg;
      }
    }
  }

  // -------- INFLANDO (PWM 100%) --------
  if (pressureState == PressureState::INFLATING) {
    if (pressureRaw <= PRESSURE_ADC_SATURATION_MARGIN ||
        pressureRaw >= PRESSURE_ADC_MAX_READING - PRESSURE_ADC_SATURATION_MARGIN) {
      abortPressureMeasurement("ADC de presion saturado");
      return;
    }
    if (now - pressureCycleStartMs >= MAX_INFLATION_TIME_MS) {
      if (cuffPressureFilteredMmHg >= PRESSURE_INFLATE_MIN_MMHG) {
        enterHolding("timeout de inflado, aceptando techo");
        return;
      }
      abortPressureMeasurement("timeout de inflado sin presion util");
      return;
    }
    if (cuffPressureFilteredMmHg >= PRESSURE_MAX_MMHG) {
      abortPressureMeasurement("limite maximo alcanzado");
      return;
    }
    if (now - pressureCycleStartMs >= 7000 && cuffPressureFilteredMmHg < 15.0f) {
      abortPressureMeasurement("sin aumento de presion");
      return;
    }

    if (cuffPressureFilteredMmHg >= inflationLastProgressMmHg + INFLATION_PLATEAU_DELTA_MMHG) {
      inflationLastProgressMmHg = cuffPressureFilteredMmHg;
      inflationLastProgressMs = now;
    }

    // Detector de techo fisico de la bomba
    if (cuffPressureFilteredMmHg >= PRESSURE_INFLATE_MIN_MMHG &&
        now - inflationLastProgressMs >= INFLATION_PLATEAU_TIMEOUT_MS) {
      enterHolding("bomba en techo, pasa a PI");
      return;
    }

    // Llegada normal al objetivo -> entra PI ya
    if (cuffPressureFilteredMmHg >= PRESSURE_INFLATE_STOP_MMHG) {
      enterHolding("objetivo alcanzado");
      return;
    }
  }

  // -------- MESETA ACTIVA con PI/PWM --------
  if (pressureState == PressureState::HOLDING) {
    setValveClosed(true);
    runPiControl(now);

    if (newPressureSample) {
      pressureDcMmHg = 0.99f * pressureDcMmHg + 0.01f * cuffPressureMmHg;
      pressureOscillationMmHg = cuffPressureMmHg - pressureDcMmHg;
      pressureOscillationEnvelope = 0.75f * pressureOscillationEnvelope +
                                    0.25f * fabsf(pressureOscillationMmHg);

      if (oscPreviousSample != 0.0f) {
        bool crossing = (pressureOscillationMmHg > 0 && oscPreviousSample <= 0) ||
                        (pressureOscillationMmHg < 0 && oscPreviousSample >= 0);
        if (crossing && fabsf(pressureOscillationMmHg) > 0.15f) {
          oscPulseDetectedCount++;
        }
      }
      oscPreviousSample = pressureOscillationMmHg;

      if (pressureOscillationSampleCount < PRESSURE_OSC_MAX_SAMPLES &&
          cuffPressureFilteredMmHg >= PRESSURE_DEFLATE_END_MMHG &&
          cuffPressureFilteredMmHg <= PRESSURE_MAX_MMHG) {
        pressureOscillationSamples[pressureOscillationSampleCount++] = {
          cuffPressureFilteredMmHg,
          pressureOscillationEnvelope
        };
      }
    }

    unsigned long holdElapsed = now - pressureHoldStartMs;
    bool enoughTime = holdElapsed >= PRESSURE_HOLD_MIN_MS;
    bool enoughSamples = pressureOscillationSampleCount >= MIN_OSC_SAMPLES_FOR_RESULT;
    bool timeout = holdElapsed >= PRESSURE_HOLD_MAX_MS;

    if ((enoughTime && enoughSamples) || timeout) {
      Serial.print("[PRESION] Meseta completada. Muestras=");
      Serial.print(pressureOscillationSampleCount);
      Serial.print(" pulsos=");
      Serial.println(oscPulseDetectedCount);

      pressureResultAvailable = calculateOscillometricPressure();
      if (pressureResultAvailable) {
        pressureResultSequence++;
        lastPressureMeasuredAtMs = millis();
        clampToPhysiologicalRange();
        Serial.print("[PRESION] Resultado en meseta = ");
        Serial.print(estimatedSystolicMmHg);
        Serial.print("/");
        Serial.print(estimatedDiastolicMmHg);
        Serial.print(" mmHg; MAP=");
        Serial.println(estimatedMapMmHg, 1);
      }

      if (!pressureResultAvailable) {
        Serial.println("[PRESION] Sin resultado. Desinflando para completar.");
        beginPressureDeflation();
      } else {
        setPumpDuty(0.0f);
        pressureNotificationStartMs = millis();
        setValveClosed(false);
        pressureReleaseStartMs = now;
        pressureState = PressureState::RELEASING;
      }
      return;
    }
  }

  // -------- DESINFLADO LENTO --------
  if (pressureState == PressureState::DEFLATING) {
    if (valvePulseOpenUntilMs != 0 && (int32_t)(valvePulseOpenUntilMs - now) > 0) {
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
      pressureDcMmHg = 0.97f * pressureDcMmHg + 0.03f * cuffPressureMmHg;
      pressureOscillationMmHg = cuffPressureMmHg - pressureDcMmHg;
      pressureOscillationEnvelope = 0.78f * pressureOscillationEnvelope +
                                    0.22f * fabsf(pressureOscillationMmHg);

      bool awayFromValvePulse = now - lastValvePulseMs >= PRESSURE_VALVE_OPEN_MS + 150;
      if (awayFromValvePulse &&
          now - pressureDeflationStartMs > 1000 &&
          cuffPressureFilteredMmHg <= PRESSURE_INFLATE_STOP_MMHG &&
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
      abortPressureMeasurement("timeout de desinflado");
      return;
    }
  }

  // -------- LIBERANDO --------
  if (pressureState == PressureState::RELEASING) {
    if (cuffPressureFilteredMmHg <= PRESSURE_RELEASE_MMHG ||
        now - pressureReleaseStartMs >= MAX_RELEASE_TIME_MS) {
      pressureState = PressureState::IDLE;
      pressureFault = false;
      setPumpDuty(0.0f);
      setValveClosed(false);
      Serial.println("[PRESION] Manguito liberado. Listo.");
    }
  }
}

void startPressureMeasurement(const char* source) {
  if (pressureState != PressureState::IDLE) {
    Serial.println("[PRESION] Ya existe un ciclo activo.");
    return;
  }
  if (!pressureZeroReady) {
    Serial.println("[PRESION] Sin cero valido. Reintentando pzero...");
    capturePressureZero();
    if (!pressureZeroReady) { Serial.println("[PRESION] No se puede iniciar."); return; }
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
  oscPulseDetectedCount = 0;
  oscPreviousSample = 0.0f;
  inflationLastProgressMmHg = 0.0f;
  piIntegral = 0.0f;
  piPrevError = 0.0f;
  piLastMs = millis();

  setValveClosed(true);
  delay(80);
  setPumpDuty(1.0f);   // 100% PWM para inflar rapido
  pressureCycleStartMs = millis();
  inflationLastProgressMs = pressureCycleStartMs;
  pressureState = PressureState::INFLATING;
  Serial.println("[PRESION] INFLANDO (PWM 100%) con valvula cerrada...");
}

void finishPressureMeasurement() {
  setPumpDuty(0.0f);

  if (!pressureResultAvailable) {
    pressureResultAvailable = calculateOscillometricPressure();
    if (pressureResultAvailable) {
      pressureResultSequence++;
      lastPressureMeasuredAtMs = millis();
      clampToPhysiologicalRange();
    }
  }

  Serial.print("[PRESION] Toma terminada. Pico ~= ");
  Serial.print(lastCuffPeakMmHg, 1);
  Serial.println(" mmHg");
  if (pressureResultAvailable) {
    Serial.print("[PRESION] Resultado = ");
    Serial.print(estimatedSystolicMmHg);
    Serial.print("/");
    Serial.print(estimatedDiastolicMmHg);
    Serial.print(" mmHg; MAP=");
    Serial.println(estimatedMapMmHg, 1);
    pressureNotificationStartMs = millis();
  } else {
    Serial.print("[PRESION] Sin resultado. Muestras=");
    Serial.println(pressureOscillationSampleCount);
  }
  setValveClosed(false);
  pressureReleaseStartMs = millis();
  pressureState = PressureState::RELEASING;
}

void beginPressureDeflation() {
  setPumpDuty(0.0f);
  setValveClosed(true);
  pressureDeflationStartMs = millis();
  lastValvePulseMs = pressureDeflationStartMs;
  valvePulseOpenUntilMs = 0;
  pressureState = PressureState::DEFLATING;
  Serial.println("[PRESION] Desinflado lento para completar envolvente...");
}

void clampToPhysiologicalRange() {
  float sys = (float)estimatedSystolicMmHg;
  float dia = (float)estimatedDiastolicMmHg;
  float map = estimatedMapMmHg;
  bool changed = false;

  if (sys < SYS_MIN_VALID) { sys = SYS_MIN_VALID; changed = true; }
  if (sys > SYS_MAX_VALID) { sys = SYS_MAX_VALID; changed = true; }
  if (dia < DIA_MIN_VALID) { dia = DIA_MIN_VALID; changed = true; }
  if (dia > DIA_MAX_VALID) { dia = DIA_MAX_VALID; changed = true; }

  if (sys - dia < 25.0f) {
    float mid = (sys + dia) * 0.5f;
    sys = mid + 12.5f;
    dia = mid - 12.5f;
    changed = true;
  }

  if (map < MAP_MIN_VALID) { map = MAP_MIN_VALID; changed = true; }
  if (map > MAP_MAX_VALID) { map = MAP_MAX_VALID; changed = true; }

  if (map <= dia) { map = dia + 5.0f; changed = true; }
  if (map >= sys) { map = sys - 5.0f; changed = true; }

  if (changed) {
    estimatedSystolicMmHg = (int)roundf(sys);
    estimatedDiastolicMmHg = (int)roundf(dia);
    estimatedMapMmHg = map;
    Serial.print("[PRESION] Ajustado a rango fisiologico: ");
    Serial.print(estimatedSystolicMmHg);
    Serial.print("/");
    Serial.print(estimatedDiastolicMmHg);
    Serial.print(" MAP=");
    Serial.println(estimatedMapMmHg, 1);
  }
}

bool calculateOscillometricPressure() {
  if (pressureOscillationSampleCount < 50) return false;

  uint16_t mapIndex = 0;
  float maxEnv = 0.0f;
  for (uint16_t i = 3; i + 3 < pressureOscillationSampleCount; i++) {
    float sm = 0.0f;
    for (int8_t o = -3; o <= 3; o++)
      sm += pressureOscillationSamples[i + o].amplitudeMmHg;
    sm /= 7.0f;
    float p = pressureOscillationSamples[i].pressureMmHg;
    if (p >= 50.0f && p <= 105.0f && sm > maxEnv) { maxEnv = sm; mapIndex = i; }
  }

  if (maxEnv < 0.05f || mapIndex < 4 ||
      mapIndex + 4 >= pressureOscillationSampleCount) return false;

  estimatedMapMmHg = pressureOscillationSamples[mapIndex].pressureMmHg;
  float sysThr = maxEnv * SYSTOLIC_ENVELOPE_RATIO;
  float diaThr = maxEnv * DIASTOLIC_ENVELOPE_RATIO;
  float systolic = 0.0f, diastolic = 0.0f;

  for (uint16_t i = 1; i <= mapIndex; i++) {
    float prev = pressureOscillationSamples[i - 1].amplitudeMmHg;
    float cur = pressureOscillationSamples[i].amplitudeMmHg;
    if (prev < sysThr && cur >= sysThr) {
      systolic = pressureOscillationSamples[i].pressureMmHg;
      break;
    }
  }
  for (uint16_t i = mapIndex + 1; i < pressureOscillationSampleCount; i++) {
    float prev = pressureOscillationSamples[i - 1].amplitudeMmHg;
    float cur = pressureOscillationSamples[i].amplitudeMmHg;
    if (prev > diaThr && cur <= diaThr) {
      diastolic = pressureOscillationSamples[i].pressureMmHg;
      break;
    }
  }

  if (systolic <= 0.0f) systolic = estimatedMapMmHg * 1.35f;
  if (diastolic <= 0.0f) diastolic = estimatedMapMmHg * 0.72f;

  if (systolic < 60.0f || systolic > 200.0f ||
      diastolic < 25.0f || diastolic > 130.0f ||
      systolic - diastolic < 15.0f) {
    estimatedSystolicMmHg = 0;
    estimatedDiastolicMmHg = 0;
    estimatedMapMmHg = 0.0f;
    return false;
  }

  estimatedSystolicMmHg = (int)roundf(systolic);
  estimatedDiastolicMmHg = (int)roundf(diastolic);
  return true;
}

void abortPressureMeasurement(const char* reason) {
  Serial.print("[PRESION] ABORTADO: ");
  Serial.println(reason);
  setPumpDuty(0.0f);
  setValveClosed(false);
  pressureFault = true;
  pressureReleaseStartMs = millis();
  pressureState = PressureState::RELEASING;
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
  if (!alarmActive) { Serial.println("[ALARMA] No existe alarma activa."); return; }
  alarmMutedUntilMs = millis() + ALARM_MUTE_MS;
  alarmMuteSequence++;
  alarmMuteSource = source;
  noTone(BUZZER_PIN);
  Serial.println("[ALARMA] Buzzer silenciado 30 s.");
}

void updateButtons() {
  unsigned long now = millis();
  bool ib = digitalRead(BUTTON_INFLATE_PIN);
  bool mb = digitalRead(BUTTON_MUTE_PIN);

  if (lastInflateButtonState == HIGH && ib == LOW &&
      now - lastInflateDebounceMs >= BUTTON_DEBOUNCE_MS) {
    lastInflateDebounceMs = now;
    startPressureMeasurement("esp32_button");
  }
  if (lastMuteButtonState == HIGH && mb == LOW &&
      now - lastMuteDebounceMs >= BUTTON_DEBOUNCE_MS) {
    lastMuteDebounceMs = now;
    muteAlarm("esp32_button");
  }
  lastInflateButtonState = ib;
  lastMuteButtonState = mb;
}

void updateSerialCommands() {
  if (!Serial.available()) return;
  String command = Serial.readStringUntil('\n');
  command.trim();
  command.toLowerCase();
  if (command == "inflate") startPressureMeasurement("serial");
  else if (command == "mute") muteAlarm("serial");
  else if (command == "pzero") { if (pressureState == PressureState::IDLE) capturePressureZero(); }
  else if (command == "status") printTelemetry();
}

bool alarmMuted() {
  if (alarmMutedUntilMs == 0) return false;
  if ((int32_t)(alarmMutedUntilMs - millis()) > 0) return true;
  alarmMutedUntilMs = 0;
  return false;
}

void evaluateAlarms() {
  fingerAlarm = ppgCalibrationComplete &&
                millis() - ppgCalibrationDoneMs >= PPG_NO_FINGER_GRACE_MS &&
                !fingerDetected;
  alarmActive = respirationMissing || temperatureAlarm || fingerAlarm || pressureFault;
}

void setPump(bool on) {
  if (on) {
    setPumpDuty(1.0f);
  } else {
    setPumpDuty(0.0f);
  }
}
void setPumpDuty(float duty) {
  if (duty < 0.0f) duty = 0.0f;
  if (duty > 1.0f) duty = 1.0f;
  uint32_t raw = (uint32_t)(duty * (float)PUMP_PWM_MAX_DUTY + 0.5f);
  if (raw == 0) {
    ledcWrite(AIR_PUMP_PIN, 0);
    pumpPwmActive = false;
    return;
  }
  if (!PUMP_ACTIVE_HIGH) raw = PUMP_PWM_MAX_DUTY - raw;
  ledcWrite(AIR_PUMP_PIN, raw);
  pumpPwmActive = true;
}

void setValveClosed(bool closed) {
  digitalWrite(AIR_VALVE_PIN, (VALVE_ACTIVE_HIGH ? closed : !closed) ? HIGH : LOW);
}
void setFan(bool on) {
  fanOn = on;
  bool level = FAN_RELAY_ACTIVE_LOW ? !on : on;
  digitalWrite(FAN_RELAY_PIN, level ? HIGH : LOW);
}

void updateOutputs() {
  digitalWrite(LED_ON_PIN, HIGH);
  digitalWrite(LED_WIFI_PIN, WiFi.status() == WL_CONNECTED ? HIGH : LOW);
  digitalWrite(LED_ALARM_PIN, alarmActive ? HIGH : LOW);
}

void updateBuzzer() {
  unsigned long now = millis();
  if (pressureNotificationStartMs != 0) {
    unsigned long e = now - pressureNotificationStartMs;
    if (e < 120) { tone(BUZZER_PIN, 2400); return; }
    if (e < 280) { noTone(BUZZER_PIN); return; }
    if (e < 400) { tone(BUZZER_PIN, 2400); return; }
    if (e < 550) { noTone(BUZZER_PIN); return; }
    pressureNotificationStartMs = 0;
  }
  if (alarmActive && !alarmMuted()) {
    unsigned long phase = now % 700;
    if (phase < 220) tone(BUZZER_PIN, 1900);
    else noTone(BUZZER_PIN);
    return;
  }
  noTone(BUZZER_PIN);
}

void ensureWifi() {
  if (strlen(WIFI_SSID) == 0) return;
  if (WiFi.status() == WL_CONNECTED) return;
  unsigned long now = millis();
  if (lastWifiAttemptMs != 0 && now - lastWifiAttemptMs < WIFI_RETRY_MS) return;
  lastWifiAttemptMs = now;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.println("[WiFi] Intentando conexion...");
}

void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.println("[WSS] Desconectado");
      wsBridge.setConnected(false);
      if (mqttClient.connected()) mqttClient.disconnect();
      break;
    case WStype_CONNECTED:
      Serial.print("[WSS] Conectado: wss://");
      Serial.print(MQTT_HOST);
      Serial.println(MQTT_WS_PATH);
      wsBridge.setConnected(true);
      lastMqttAttemptMs = 0;
      break;
    case WStype_BIN:
      wsBridge.addData(payload, length);
      break;
    case WStype_TEXT:
      Serial.print("[WSS] TEXT inesperado");
      Serial.println();
      break;
    case WStype_ERROR:
      Serial.println("[WSS] Error");
      break;
    default:
      break;
  }
}

void ensureMqtt() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (!wsBridge.connected()) return;
  if (mqttClient.connected()) return;
  unsigned long now = millis();
  if (lastMqttAttemptMs != 0 && now - lastMqttAttemptMs < MQTT_RETRY_MS) return;
  lastMqttAttemptMs = now;

  String clientId = String("luz-") + DEVICE_ID + "-" +
                    String((uint32_t)(ESP.getEfuseMac() & 0xFFFFFFFF), HEX);

  if (mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASS)) {
    String controlTopic = String("luz/device/") + DEVICE_ID + "/control";
    mqttClient.subscribe(controlTopic.c_str());
    Serial.println("[MQTT] Conectado.");
  } else {
    Serial.print("[MQTT] Error, estado: ");
    Serial.println(mqttClient.state());
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String expected = String("luz/device/") + DEVICE_ID + "/control";
  if (String(topic) != expected) return;
  String message;
  for (unsigned int i = 0; i < length; i++) message += (char)payload[i];
  message.toLowerCase();
  const char* source = "mqtt";
  if (message.indexOf("scheduled") >= 0) source = "scheduled";
  else if (message.indexOf("doctor") >= 0) source = "doctor";
  else if (message.indexOf("public") >= 0) source = "public";

  if (message.indexOf("inflate") >= 0) startPressureMeasurement(source);
  if (message.indexOf("mute") >= 0) muteAlarm(source);
  if (message.indexOf("pzero") >= 0 && pressureState == PressureState::IDLE) capturePressureZero();
}

void publishTelemetry() {
  if (!mqttClient.connected()) return;
  String topic = String("luz/device/") + DEVICE_ID + "/telemetry";
  float hr = (fingerDetected && bpmOutput > 0.0f) ? bpmOutput : 0.0f;
  float bt = temperatureValid ? bodyTemperatureC : 0.0f;
  float at = temperatureValid ? ambientTemperatureC : 0.0f;

  String p;
  p.reserve(1536);
  p += "{\"deviceId\":\""; p += DEVICE_ID;
  p += "\",\"ts\":"; p += String(millis());
  p += ",\"heartRateBpm\":"; p += String(hr, 1);
  p += ",\"oxygenSaturationPercent\":"; p += String(oxygenSaturationPercent, 1);
  p += ",\"spo2Available\":"; p += spo2Available ? "true" : "false";
  p += ",\"ppgSignalQualityPercent\":"; p += String(ppgSignalQualityPercent, 1);
  p += ",\"temperatureC\":"; p += String(bt, 1);
  p += ",\"ambientTemperatureC\":"; p += String(at, 1);
  p += ",\"estimatedSystolicMmHg\":"; p += String(estimatedSystolicMmHg);
  p += ",\"estimatedDiastolicMmHg\":"; p += String(estimatedDiastolicMmHg);
  p += ",\"estimatedMapMmHg\":"; p += String(estimatedMapMmHg, 1);
  p += ",\"fingerDetected\":"; p += fingerDetected ? "true" : "false";
  p += ",\"monitoringEnabled\":true";
  p += ",\"calibrationComplete\":";
  p += (mqCalibrationComplete && ppgCalibrationComplete && pressureZeroReady) ? "true" : "false";
  p += ",\"respirationDetected\":"; p += respirationDetected ? "true" : "false";
  p += ",\"respirationMissing\":"; p += respirationMissing ? "true" : "false";
  p += ",\"respiratoryRateBpm\":"; p += String(respiratoryRateBpm, 1);
  p += ",\"strongRespirationDetected\":"; p += strongRespirationDetected ? "true" : "false";
  p += ",\"pressureState\":\""; p += pressureStateName(); p += "\"";
  p += ",\"cuffPressureMmHg\":"; p += String(cuffPressureFilteredMmHg, 1);
  p += ",\"pressureTargetMmHg\":"; p += String(piSetpoint, 1);
  p += ",\"pressureZeroReady\":"; p += pressureZeroReady ? "true" : "false";
  p += ",\"pressureFault\":"; p += pressureFault ? "true" : "false";
  p += ",\"pressureResultAvailable\":"; p += pressureResultAvailable ? "true" : "false";
  p += ",\"pressureMeasurementSequence\":"; p += String(pressureMeasurementSequence);
  p += ",\"pressureResultSequence\":"; p += String(pressureResultSequence);
  p += ",\"pressureTriggerSource\":\""; p += pressureTriggerSource; p += "\"";
  p += ",\"lastPressureMeasuredAtMs\":"; p += String(lastPressureMeasuredAtMs);
  p += ",\"alarmActive\":"; p += alarmActive ? "true" : "false";
  p += ",\"alarmMuted\":"; p += alarmMuted() ? "true" : "false";
  p += ",\"alarmMuteSequence\":"; p += String(alarmMuteSequence);
  p += ",\"alarmMuteSource\":\""; p += alarmMuteSource; p += "\"";
  p += ",\"temperatureValid\":"; p += temperatureValid ? "true" : "false";
  p += ",\"temperatureAlarm\":"; p += temperatureAlarm ? "true" : "false";
  p += ",\"fanOn\":"; p += fanOn ? "true" : "false";
  p += ",\"warningActive\":"; p += alarmActive ? "true" : "false";
  p += ",\"alertActive\":"; p += (temperatureAlarm || pressureFault) ? "true" : "false";
  p += "}";
  mqttClient.publish(topic.c_str(), p.c_str(), false);
}

void publishRawTelemetry() {
  if (!mqttClient.connected()) return;
  String topic = String("luz/device/") + DEVICE_ID + "/raw";
  String p;
  p.reserve(1280);
  p += "{\"deviceId\":\""; p += DEVICE_ID;
  p += "\",\"ts\":"; p += String(millis());
  p += ",\"ppgRaw\":"; p += ppgRaw;
  p += ",\"ppgSmoothed\":"; p += ppgSmoothed;
  p += ",\"ppgBaseline\":"; p += String(ppgNoFingerBaseline, 1);
  p += ",\"hrBaseline\":"; p += String(hrBaseline, 1);
  p += ",\"ppgAcValue\":"; p += String(ppgAcValue, 2);
  p += ",\"ppgAcAmplitude\":"; p += String(ppgAcAmplitude, 2);
  p += ",\"ppgPeakThreshold\":"; p += String(ppgPeakThreshold, 2);
  p += ",\"ppgSignalQualityPercent\":"; p += String(ppgSignalQualityPercent, 1);
  p += ",\"perfusionIndexPercent\":"; p += String(perfusionIndexPercent, 2);
  p += ",\"lastBeatIntervalMs\":"; p += String(lastBeatIntervalMs);
  p += ",\"stableBeatCount\":"; p += String(stableBeatCount);
  p += ",\"fingerAcquireMs\":";
  p += fingerDetected ? String(millis() - fingerDetectedSinceMs) : "0";
  p += ",\"mqRaw\":"; p += mqRaw;
  p += ",\"mqFiltered\":"; p += String(mqFiltered, 1);
  p += ",\"mqBaseline\":"; p += String(mqBaseline, 1);
  p += ",\"mqDelta\":"; p += mqDelta;
  p += ",\"mqBreathThreshold\":"; p += String(MQ_BREATH_RISE_ADC);
  p += ",\"mqStrongThreshold\":"; p += String(MQ_STRONG_BREATH_RISE_ADC);
  p += ",\"pressureRaw\":"; p += pressureRaw;
  p += ",\"pressureZeroRaw\":"; p += pressureZeroRaw;
  p += ",\"pressureDeltaCounts\":"; p += String(pressureDeltaCounts);
  p += ",\"pressureCountsPerMmHg\":"; p += String(pressureCountsPerMmHg, 2);
  p += ",\"cuffPressureRawMmHg\":"; p += String(cuffPressureMmHg, 2);
  p += ",\"cuffPressureFilteredMmHg\":"; p += String(cuffPressureFilteredMmHg, 2);
  p += ",\"pressureOscillationMmHg\":"; p += String(pressureOscillationMmHg, 3);
  p += ",\"pressureOscillationEnvelope\":"; p += String(pressureOscillationEnvelope, 3);
  p += ",\"pressureOscillationSampleCount\":"; p += String(pressureOscillationSampleCount);
  p += ",\"oscPulseDetectedCount\":"; p += String(oscPulseDetectedCount);
  p += ",\"pumpPwm\":"; p += String(piOutput, 3);
  p += ",\"piIntegral\":"; p += String(piIntegral, 3);
  p += ",\"piSetpoint\":"; p += String(piSetpoint, 2);
  p += ",\"realBpm\":"; p += String(realBpm, 1);
  p += ",\"realBpmValid\":"; p += realBpmValid ? "true" : "false";
  p += ",\"mlxAmbientC\":";
  p += mlxAvailable ? String(mlx.readAmbientTempC(), 2) : "null";
  p += ",\"mlxObjectC\":";
  p += mlxAvailable ? String(mlx.readObjectTempC(), 2) : "null";
  p += "}";
  mqttClient.publish(topic.c_str(), p.c_str(), false);
}

void printTelemetry() {
  Serial.print("TEMP=");
  if (temperatureValid) { Serial.print(bodyTemperatureC, 1); Serial.print("C"); }
  else Serial.print("N/A");

  Serial.print(" | RESP=");
  if (!mqCalibrationComplete) Serial.print("CAL");
  else if (respirationMissing) Serial.print("NO");
  else if (respirationDetected) Serial.print("SI");
  else Serial.print("ESP");
  Serial.print(" MQ="); Serial.print(mqRaw);
  Serial.print(" d="); Serial.print(mqDelta);

  Serial.print(" | DEDO=");
  if (!ppgCalibrationComplete) Serial.print("CAL");
  else Serial.print(fingerDetected ? "SI" : "NO");
  Serial.print(" PPG="); Serial.print(ppgRaw);
  Serial.print(" | BPM=");
  if (fingerDetected) Serial.print(bpmOutput, 1);
  else Serial.print("-");
  Serial.print(" | FR="); Serial.print(respiratoryRateBpm, 1); Serial.print("rpm");

  Serial.print(" | CUFF=");
  if (pressureZeroReady) { Serial.print(cuffPressureFilteredMmHg, 1); Serial.print("mmHg"); }
  else Serial.print("NO-ZERO");
  Serial.print(" | PSTATE="); Serial.print(pressureStateName());
  Serial.print(" | PWM="); Serial.print(piOutput * 100.0f, 0); Serial.print("%");
  Serial.print(" | SET="); Serial.print(piSetpoint, 1);
  Serial.print(" | OSC="); Serial.print(pressureOscillationMmHg, 2);
  Serial.print(" | ENV="); Serial.print(pressureOscillationEnvelope, 3);
  Serial.print(" | N="); Serial.print(pressureOscillationSampleCount);
  Serial.print(" | PLS="); Serial.print(oscPulseDetectedCount);
  Serial.print(" | PA=");
  if (pressureResultAvailable) {
    Serial.print(estimatedSystolicMmHg); Serial.print("/"); Serial.print(estimatedDiastolicMmHg);
  } else Serial.print("-");

  Serial.print(" | ALARMA=");
  Serial.print(alarmActive ? "SI" : "NO");
  if (alarmMuted()) Serial.print("(MUTE)");
  if (alarmActive) {
    Serial.print("[");
    bool first = true;
    if (respirationMissing) { Serial.print("RESP"); first = false; }
    if (temperatureAlarm) { if (!first) Serial.print(","); Serial.print("TEMP"); first = false; }
    if (fingerAlarm) { if (!first) Serial.print(","); Serial.print("DEDO"); first = false; }
    if (pressureFault) { if (!first) Serial.print(","); Serial.print("PRESS"); }
    Serial.print("]");
  }

  Serial.print(" | WIFI="); Serial.print(WiFi.status() == WL_CONNECTED ? "OK" : "OFF");
  Serial.print(" | VFB="); Serial.print(digitalRead(VALVE_FEEDBACK_PIN));
  Serial.println();
}