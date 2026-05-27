#include <Wire.h>
#include <math.h>
#include <Adafruit_MLX90614.h>
#include "MAX30105.h"
#include "heartRate.h"
#include "spo2_algorithm.h"
#include <WiFi.h>
#include <PubSubClient.h>

// ESP32 NodeMCU compacto
// Ajusta estos pines si tu placa usa otro mapeo.
constexpr uint8_t I2C_SDA_PIN = 21;
constexpr uint8_t I2C_SCL_PIN = 22;
constexpr uint8_t MQ_SENSOR_PIN = 34;        // ADC solo entrada
constexpr uint8_t PRESSURE_SENSOR_PIN = 35;  // ADC solo entrada
constexpr uint8_t BUZZER_PIN = 27;
constexpr uint8_t VIBRATOR_PIN = 26;
constexpr uint8_t FAN_RELAY_PIN = 25;
constexpr uint8_t LED_OK_PIN = 14;
constexpr uint8_t LED_WARNING_PIN = 33;
constexpr uint8_t LED_ALERT_PIN = 13;

constexpr unsigned long SERIAL_INTERVAL_MS = 500;
constexpr unsigned long BUZZER_TOGGLE_MS = 200;
constexpr unsigned long STATUS_BLINK_MS = 300;
constexpr unsigned long CALIBRATION_TIME_MS = 5000;
constexpr uint8_t MLX90614_I2C_ADDRESS = 0x5A;

const char* WIFI_SSID = "Cordova hogar ext";
const char* WIFI_PASSWORD = "4ndiNicol3";
const char* MQTT_HOST = "broker.hivemq.com";
constexpr uint16_t MQTT_PORT = 1883;
constexpr uint16_t MQTT_BUFFER_SIZE = 1024;
const char* DEVICE_ID = "esp32-luz-01";

// Parametros del MAX30105
constexpr uint16_t MAX30105_BRIGHTNESS = 60;
constexpr uint8_t MAX30105_SAMPLE_AVERAGE = 4;
constexpr uint8_t MAX30105_LED_MODE = 2;
constexpr uint16_t MAX30105_SAMPLE_RATE = 100;
constexpr uint16_t MAX30105_PULSE_WIDTH = 411;
constexpr uint16_t MAX30105_ADC_RANGE = 4096;
constexpr int32_t MAX30105_BUFFER_SIZE = 100;
constexpr float MIN_VALID_HEART_RATE_BPM = 45.0f;
constexpr float MAX_VALID_HEART_RATE_BPM = 160.0f;
constexpr int32_t MIN_VALID_SPO2 = 80;
constexpr int32_t MAX_VALID_SPO2 = 100;
constexpr uint32_t MIN_FINGER_IR = 50000;
constexpr uint32_t MAX_FINGER_IR = 150000;
constexpr float HEART_RATE_SMOOTHING = 0.25f;
constexpr float SPO2_SMOOTHING = 0.30f;
constexpr float MAX_HEART_RATE_STEP_BPM = 15.0f;
constexpr int32_t MAX_SPO2_STEP = 3;

// ADC
constexpr float ADC_REFERENCE_V = 3.3f;
constexpr uint16_t ADC_RESOLUTION = 4095;
constexpr uint8_t ANALOG_FILTER_SAMPLES = 8;

// MQ usado como respiracion: al exhalar el ADC baja respecto a la base.
constexpr int16_t MQ_BREATH_DETECTED_DROP_ADC = 60;
constexpr int16_t MQ_BREATH_STRONG_DROP_ADC = 140;
constexpr unsigned long RESPIRATION_TIMEOUT_MS = 12000;

// Presion analogica amplificada
// Se usa una base calibrada y luego se observan variaciones pequenas alrededor de esa base.
constexpr float PRESSURE_SENSOR_GAIN = 1.0f;
constexpr float PRESSURE_ZERO_OFFSET_V = 0.0f;
constexpr int16_t PRESSURE_CUFF_DETECTED_DELTA_ADC = 8;
constexpr int16_t PRESSURE_CUFF_STRONG_DELTA_ADC = 16;
constexpr int16_t PRESSURE_CUFF_RELEASE_DELTA_ADC = 4;
constexpr int16_t PRESSURE_ESTIMATE_MIN_DELTA_ADC = 8;
constexpr int16_t PRESSURE_ESTIMATE_MAX_DELTA_ADC = 26;
constexpr int16_t SYSTOLIC_MIN_MMHG = 118;
constexpr int16_t SYSTOLIC_MAX_MMHG = 124;
constexpr int16_t DIASTOLIC_MIN_MMHG = 76;
constexpr int16_t DIASTOLIC_MAX_MMHG = 82;
constexpr float PRESSURE_ESTIMATE_SMOOTHING = 0.15f;
constexpr float TEMPERATURE_FAN_ON_C = 36.0f;
constexpr float TEMPERATURE_FAN_OFF_C = 35.5f;
constexpr float TEMPERATURE_WARNING_C = 37.5f;
constexpr float TEMPERATURE_ALERT_C = 38.5f;

MAX30105 particleSensor;
Adafruit_MLX90614 mlx = Adafruit_MLX90614();
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

uint32_t irBuffer[MAX30105_BUFFER_SIZE];
uint32_t redBuffer[MAX30105_BUFFER_SIZE];

float heartRateBpm = 0.0f;
float spo2Filtered = 0.0f;
int32_t spo2 = 0;
bool validHeartRate = false;
bool validSpO2 = false;
bool fingerDetected = false;
bool max30105Available = false;
uint32_t lastIrValue = 0;
int32_t max30105SamplesStored = 0;
int32_t max30105NewSamples = 0;

uint16_t mqRawAdc = 0;
float mqVoltage = 0.0f;
int16_t mqRespirationDeltaAdc = 0;
bool respirationDetected = false;
bool strongRespirationDetected = false;

uint16_t pressureRawAdc = 0;
float pressureVoltage = 0.0f;
int16_t pressurePulseDeltaAdc = 0;
bool pressurePulseDetected = false;
bool pressurePulseStrongDetected = false;
bool pressureCuffDetected = false;
bool pressureCuffStrongDetected = false;
bool pressureMeasurementActive = false;
int16_t estimatedSystolicMmHg = 0;
int16_t estimatedDiastolicMmHg = 0;
float bodyTemperatureC = 0.0f;
float ambientTemperatureC = 0.0f;
bool temperatureSensorAvailable = false;
bool temperatureWarningDetected = false;
bool temperatureAlertDetected = false;
bool fanRelayActive = false;
bool temperatureReadingValid = false;

bool warningActive = false;
bool alertActive = false;
bool buzzerState = false;
bool monitoringEnabled = false;
bool calibrationStarted = false;
bool calibrationComplete = false;
bool respirationMissing = false;

unsigned long lastSerialPrintMs = 0;
unsigned long lastBuzzerToggleMs = 0;
unsigned long calibrationStartMs = 0;
unsigned long lastRespirationDetectedMs = 0;
uint32_t mqCalibrationAccumulator = 0;
uint32_t pressureCalibrationAccumulator = 0;
uint32_t calibrationSamples = 0;
uint16_t mqBaselineAdc = 0;
uint16_t pressureBaselineAdc = 0;

void initializeAnalogInputs();
void scanI2CDevices();
void initializeMax30105();
void initializeTemperatureSensor();
void updateCalibration();
void updateMax30105();
void updateGasSensor();
void updatePressureSensor();
void updateTemperatureSensor();
void evaluateAlerts();
void updateOutputs();
void printTelemetry();
void beginCalibration();
uint16_t readFilteredAdc(uint8_t pin);
float adcToVoltage(uint16_t rawAdc);
void ensureWifi();
void ensureMqtt();
void onMqttMessage(char* topic, byte* payload, unsigned int length);
void publishTelemetryMqtt();
float sanitizeNumber(float value);
void resetMonitoringCycle();

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(VIBRATOR_PIN, OUTPUT);
  pinMode(FAN_RELAY_PIN, OUTPUT);
  pinMode(LED_OK_PIN, OUTPUT);
  pinMode(LED_WARNING_PIN, OUTPUT);
  pinMode(LED_ALERT_PIN, OUTPUT);

  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(VIBRATOR_PIN, LOW);
  digitalWrite(FAN_RELAY_PIN, HIGH);
  digitalWrite(LED_OK_PIN, LOW);
  digitalWrite(LED_WARNING_PIN, LOW);
  digitalWrite(LED_ALERT_PIN, LOW);

  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  Wire.setClock(100000);
  scanI2CDevices();
  initializeAnalogInputs();
  initializeMax30105();
  initializeTemperatureSensor();
  mqttClient.setBufferSize(MQTT_BUFFER_SIZE);
  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(onMqttMessage);
  ensureWifi();
  ensureMqtt();

  Serial.println("Sistema Luz iniciado en ESP32 NodeMCU compacto");
}

void loop() {
  updateGasSensor();
  updatePressureSensor();
  updateTemperatureSensor();
  updateMax30105();
  updateCalibration();
  evaluateAlerts();
  updateOutputs();
  ensureWifi();
  ensureMqtt();
  mqttClient.loop();

  if (millis() - lastSerialPrintMs >= SERIAL_INTERVAL_MS) {
    lastSerialPrintMs = millis();
    printTelemetry();
    publishTelemetryMqtt();
  }
}

void initializeAnalogInputs() {
  analogReadResolution(12);
  analogSetPinAttenuation(MQ_SENSOR_PIN, ADC_11db);
  analogSetPinAttenuation(PRESSURE_SENSOR_PIN, ADC_11db);
}

void scanI2CDevices() {
  Serial.println("Escaneo I2C:");

  uint8_t devicesFound = 0;
  for (uint8_t address = 1; address < 127; address++) {
    Wire.beginTransmission(address);
    uint8_t error = Wire.endTransmission();

    if (error == 0) {
      Serial.print(" - 0x");
      if (address < 16) {
        Serial.print("0");
      }
      Serial.println(address, HEX);
      devicesFound++;
    }
  }

  if (devicesFound == 0) {
    Serial.println(" - sin dispositivos");
  }
}

void initializeMax30105() {
  if (!particleSensor.begin(Wire, I2C_SPEED_STANDARD)) {
    Serial.println("No se detecto el MAX30105. Verifica cableado y alimentacion.");
    max30105Available = false;
    return;
  }

  particleSensor.setup(
    MAX30105_BRIGHTNESS,
    MAX30105_SAMPLE_AVERAGE,
    MAX30105_LED_MODE,
    MAX30105_SAMPLE_RATE,
    MAX30105_PULSE_WIDTH,
    MAX30105_ADC_RANGE
  );

  particleSensor.setPulseAmplitudeRed(0x1F);
  particleSensor.setPulseAmplitudeIR(0x1F);
  particleSensor.setPulseAmplitudeGreen(0);

  max30105Available = true;
  Serial.println("MAX30105 inicializado correctamente.");
}

void initializeTemperatureSensor() {
  Wire.beginTransmission(MLX90614_I2C_ADDRESS);
  uint8_t mlxError = Wire.endTransmission();

  if (mlxError != 0) {
    Serial.print("MLX90614 no responde en 0x5A. Codigo I2C: ");
    Serial.println(mlxError);
    temperatureSensorAvailable = false;
    return;
  }

  if (!mlx.begin()) {
    Serial.println("No se detecto el MLX90614. Verifica cableado y alimentacion.");
    temperatureSensorAvailable = false;
    return;
  }

  temperatureSensorAvailable = true;
  Serial.println("MLX90614 inicializado correctamente.");
}

void updateGasSensor() {
  mqRawAdc = readFilteredAdc(MQ_SENSOR_PIN);
  mqVoltage = adcToVoltage(mqRawAdc);

  if (!calibrationComplete) {
    mqRespirationDeltaAdc = 0;
    respirationDetected = false;
    strongRespirationDetected = false;
    return;
  }

  mqRespirationDeltaAdc = static_cast<int16_t>(mqBaselineAdc) - static_cast<int16_t>(mqRawAdc);
  respirationDetected = mqRespirationDeltaAdc >= MQ_BREATH_DETECTED_DROP_ADC;
  strongRespirationDetected = mqRespirationDeltaAdc >= MQ_BREATH_STRONG_DROP_ADC;

  if (respirationDetected) {
    lastRespirationDetectedMs = millis();
  }
}

void updatePressureSensor() {
  pressureRawAdc = readFilteredAdc(PRESSURE_SENSOR_PIN);
  pressureVoltage =
    (adcToVoltage(pressureRawAdc) - PRESSURE_ZERO_OFFSET_V) * PRESSURE_SENSOR_GAIN;

  if (!calibrationComplete) {
    pressurePulseDeltaAdc = 0;
    pressurePulseDetected = false;
    pressurePulseStrongDetected = false;
    pressureCuffDetected = false;
    pressureCuffStrongDetected = false;
    pressureMeasurementActive = false;
    estimatedSystolicMmHg = 0;
    estimatedDiastolicMmHg = 0;
    return;
  }

  pressurePulseDeltaAdc =
    static_cast<int16_t>(pressureRawAdc) - static_cast<int16_t>(pressureBaselineAdc);
  pressureCuffDetected = pressurePulseDeltaAdc >= PRESSURE_CUFF_DETECTED_DELTA_ADC;
  pressureCuffStrongDetected = pressurePulseDeltaAdc >= PRESSURE_CUFF_STRONG_DELTA_ADC;
  if (!pressureMeasurementActive && pressureCuffDetected) {
    pressureMeasurementActive = true;
  } else if (pressureMeasurementActive &&
             pressurePulseDeltaAdc <= PRESSURE_CUFF_RELEASE_DELTA_ADC) {
    pressureMeasurementActive = false;
    estimatedSystolicMmHg = 0;
    estimatedDiastolicMmHg = 0;
  }

  if (pressureMeasurementActive) {
    int16_t clampedDelta = pressurePulseDeltaAdc;
    if (clampedDelta < PRESSURE_ESTIMATE_MIN_DELTA_ADC) {
      clampedDelta = PRESSURE_ESTIMATE_MIN_DELTA_ADC;
    } else if (clampedDelta > PRESSURE_ESTIMATE_MAX_DELTA_ADC) {
      clampedDelta = PRESSURE_ESTIMATE_MAX_DELTA_ADC;
    }

    float ratio =
      static_cast<float>(clampedDelta - PRESSURE_ESTIMATE_MIN_DELTA_ADC) /
      static_cast<float>(PRESSURE_ESTIMATE_MAX_DELTA_ADC - PRESSURE_ESTIMATE_MIN_DELTA_ADC);
    int16_t targetSystolic =
      static_cast<int16_t>(
        SYSTOLIC_MIN_MMHG + ratio * (SYSTOLIC_MAX_MMHG - SYSTOLIC_MIN_MMHG) + 0.5f);
    int16_t targetDiastolic =
      static_cast<int16_t>(
        DIASTOLIC_MIN_MMHG + ratio * (DIASTOLIC_MAX_MMHG - DIASTOLIC_MIN_MMHG) + 0.5f);

    if (estimatedSystolicMmHg == 0 || estimatedDiastolicMmHg == 0) {
      estimatedSystolicMmHg = targetSystolic;
      estimatedDiastolicMmHg = targetDiastolic;
    } else {
      estimatedSystolicMmHg = static_cast<int16_t>(
        estimatedSystolicMmHg +
        (targetSystolic - estimatedSystolicMmHg) * PRESSURE_ESTIMATE_SMOOTHING + 0.5f);
      estimatedDiastolicMmHg = static_cast<int16_t>(
        estimatedDiastolicMmHg +
        (targetDiastolic - estimatedDiastolicMmHg) * PRESSURE_ESTIMATE_SMOOTHING + 0.5f);
    }
  }

  pressurePulseDetected = false;
  pressurePulseStrongDetected = false;
}

void updateTemperatureSensor() {
  if (!temperatureSensorAvailable) {
    bodyTemperatureC = 0.0f;
    ambientTemperatureC = 0.0f;
    temperatureWarningDetected = false;
    temperatureAlertDetected = false;
    temperatureReadingValid = false;
    return;
  }

  ambientTemperatureC = mlx.readAmbientTempC();
  bodyTemperatureC = mlx.readObjectTempC();

  if (isnan(ambientTemperatureC) || isnan(bodyTemperatureC)) {
    Serial.println("MLX90614 responde pero entrega NaN.");
    temperatureWarningDetected = false;
    temperatureAlertDetected = false;
    temperatureReadingValid = false;
    return;
  }

  temperatureReadingValid = true;
  temperatureWarningDetected = bodyTemperatureC >= TEMPERATURE_WARNING_C;
  temperatureAlertDetected = bodyTemperatureC >= TEMPERATURE_ALERT_C;
}

void updateCalibration() {
  if (!calibrationStarted || calibrationComplete) {
    return;
  }

  mqCalibrationAccumulator += mqRawAdc;
  pressureCalibrationAccumulator += pressureRawAdc;
  calibrationSamples++;

  if (millis() - calibrationStartMs < CALIBRATION_TIME_MS) {
    return;
  }

  if (calibrationSamples > 0) {
    mqBaselineAdc = static_cast<uint16_t>(mqCalibrationAccumulator / calibrationSamples);
    pressureBaselineAdc =
      static_cast<uint16_t>(pressureCalibrationAccumulator / calibrationSamples);
  }

  calibrationComplete = true;
  lastRespirationDetectedMs = millis();
  respirationMissing = false;
  Serial.print("Base MQ: ");
  Serial.print(mqBaselineAdc);
  Serial.print("  Base Pres: ");
  Serial.println(pressureBaselineAdc);
}

void beginCalibration() {
  calibrationStarted = true;
  calibrationComplete = false;
  calibrationStartMs = millis();
  mqCalibrationAccumulator = 0;
  pressureCalibrationAccumulator = 0;
  calibrationSamples = 0;
  mqBaselineAdc = 0;
  pressureBaselineAdc = 0;
  respirationMissing = false;
  lastRespirationDetectedMs = 0;
  pressureMeasurementActive = false;
  estimatedSystolicMmHg = 0;
  estimatedDiastolicMmHg = 0;
  Serial.println("Dedo detectado. Iniciando calibracion de respiracion y presion.");
}

void resetMonitoringCycle() {
  calibrationStarted = false;
  calibrationComplete = false;
  mqRespirationDeltaAdc = 0;
  pressurePulseDeltaAdc = 0;
  respirationDetected = false;
  strongRespirationDetected = false;
  respirationMissing = false;
  lastRespirationDetectedMs = 0;
  pressurePulseDetected = false;
  pressurePulseStrongDetected = false;
  pressureCuffDetected = false;
  pressureCuffStrongDetected = false;
  pressureMeasurementActive = false;
  estimatedSystolicMmHg = 0;
  estimatedDiastolicMmHg = 0;
  validHeartRate = false;
  validSpO2 = false;
  warningActive = false;
  alertActive = false;
  buzzerState = false;
  digitalWrite(BUZZER_PIN, LOW);
}

void updateMax30105() {
  if (!max30105Available) {
    validHeartRate = false;
    validSpO2 = false;
    fingerDetected = false;
    return;
  }

  particleSensor.check();

  while (particleSensor.available()) {
    uint32_t redValue = particleSensor.getRed();
    uint32_t irValue = particleSensor.getIR();
    lastIrValue = irValue;

    if (max30105SamplesStored < MAX30105_BUFFER_SIZE) {
      redBuffer[max30105SamplesStored] = redValue;
      irBuffer[max30105SamplesStored] = irValue;
      max30105SamplesStored++;
    } else {
      for (int32_t i = 0; i < MAX30105_BUFFER_SIZE - 1; i++) {
        redBuffer[i] = redBuffer[i + 1];
        irBuffer[i] = irBuffer[i + 1];
      }
      redBuffer[MAX30105_BUFFER_SIZE - 1] = redValue;
      irBuffer[MAX30105_BUFFER_SIZE - 1] = irValue;
    }

    max30105NewSamples++;
    particleSensor.nextSample();
  }

  if (max30105SamplesStored < MAX30105_BUFFER_SIZE || max30105NewSamples < 25) {
    return;
  }

  int8_t spo2Valid = 0;
  int8_t heartRateFromAlgoValid = 0;
  int32_t heartRateFromAlgo = 0;

  maxim_heart_rate_and_oxygen_saturation(
    irBuffer,
    MAX30105_BUFFER_SIZE,
    redBuffer,
    &spo2,
    &spo2Valid,
    &heartRateFromAlgo,
    &heartRateFromAlgoValid
  );

  uint64_t irAccumulator = 0;
  for (int32_t i = 0; i < MAX30105_BUFFER_SIZE; i++) {
    irAccumulator += irBuffer[i];
  }

  uint32_t averageIr = irAccumulator / MAX30105_BUFFER_SIZE;
  fingerDetected = averageIr >= MIN_FINGER_IR && averageIr <= MAX_FINGER_IR;

  if (!monitoringEnabled) {
    resetMonitoringCycle();
  } else if (fingerDetected && !calibrationStarted) {
    beginCalibration();
  } else if (!fingerDetected && calibrationStarted) {
    resetMonitoringCycle();
  }

  if (fingerDetected &&
      heartRateFromAlgoValid == 1 &&
      heartRateFromAlgo >= MIN_VALID_HEART_RATE_BPM &&
      heartRateFromAlgo <= MAX_VALID_HEART_RATE_BPM) {
    float newHeartRate = static_cast<float>(heartRateFromAlgo);

    if (!validHeartRate) {
      heartRateBpm = newHeartRate;
      validHeartRate = true;
    } else if (fabs(newHeartRate - heartRateBpm) <= MAX_HEART_RATE_STEP_BPM) {
      heartRateBpm =
        heartRateBpm + ((newHeartRate - heartRateBpm) * HEART_RATE_SMOOTHING);
    }
  } else if (!fingerDetected) {
    validHeartRate = false;
  }

  if (fingerDetected &&
      spo2Valid == 1 &&
      spo2 >= MIN_VALID_SPO2 &&
      spo2 <= MAX_VALID_SPO2) {
    if (!validSpO2) {
      spo2Filtered = static_cast<float>(spo2);
      validSpO2 = true;
    } else if (abs(spo2 - static_cast<int32_t>(spo2Filtered)) <= MAX_SPO2_STEP) {
      spo2Filtered =
        spo2Filtered + ((static_cast<float>(spo2) - spo2Filtered) * SPO2_SMOOTHING);
    }
  } else if (!fingerDetected) {
    validSpO2 = false;
  }

  max30105NewSamples = 0;
}

void evaluateAlerts() {
  if (!monitoringEnabled) {
    warningActive = false;
    alertActive = false;
    return;
  }

  if (!calibrationComplete) {
    warningActive = false;
    alertActive = false;
    return;
  }

  respirationMissing =
    lastRespirationDetectedMs > 0 &&
    (millis() - lastRespirationDetectedMs >= RESPIRATION_TIMEOUT_MS);

  warningActive =
    temperatureWarningDetected ||
    !validHeartRate ||
    respirationMissing;
  alertActive =
    temperatureAlertDetected;

  if (alertActive) {
    warningActive = true;
  }
}

void updateOutputs() {
  bool blinkOn = ((millis() / STATUS_BLINK_MS) % 2) == 0;
  bool greenOn = monitoringEnabled && !alertActive && !warningActive;
  bool yellowOn = false;

  if (!monitoringEnabled) {
    yellowOn = blinkOn;
  } else if (calibrationStarted && !calibrationComplete) {
    greenOn = true;
  } else if (warningActive && !alertActive) {
    yellowOn = true;
    greenOn = false;
  }

  digitalWrite(LED_OK_PIN, greenOn ? HIGH : LOW);
  digitalWrite(LED_WARNING_PIN, yellowOn ? HIGH : LOW);
  digitalWrite(LED_ALERT_PIN, alertActive ? HIGH : LOW);

  digitalWrite(VIBRATOR_PIN, alertActive ? HIGH : LOW);
  fanRelayActive = monitoringEnabled;
  digitalWrite(FAN_RELAY_PIN, fanRelayActive ? LOW : HIGH);

  if (alertActive) {
    if (millis() - lastBuzzerToggleMs >= BUZZER_TOGGLE_MS) {
      lastBuzzerToggleMs = millis();
      buzzerState = !buzzerState;
      digitalWrite(BUZZER_PIN, buzzerState ? HIGH : LOW);
    }
  } else {
    digitalWrite(BUZZER_PIN, LOW);
    buzzerState = false;
  }
}

void printTelemetry() {
  if (!monitoringEnabled) {
    Serial.println("Estado: Monitoreo detenido. Inicie desde la app.");
    Serial.println();
    return;
  }

  if (!fingerDetected) {
    Serial.println("Estado: Monitoreo iniciado. Coloque el dedo para comenzar.");
    Serial.println();
    return;
  }

  if (!calibrationComplete) {
    Serial.print("Estado: Calibrando sensores | Tiempo=");
    Serial.print((millis() - calibrationStartMs) / 1000.0f, 1);
    Serial.println(" s");
    Serial.println();
    return;
  }

  Serial.print("Pulso: ");
  if (validHeartRate && heartRateBpm > 0.0f) {
    Serial.print(heartRateBpm, 1);
    Serial.println(" bpm");
  } else {
    Serial.println("Sin lectura");
  }

  Serial.print("Temperatura: ");
  if (temperatureSensorAvailable && temperatureReadingValid) {
    Serial.print(bodyTemperatureC, 1);
    Serial.println(" C");
  } else {
    Serial.println("Sin lectura");
  }

  Serial.print("Respiracion: ");
  if (respirationDetected) {
    Serial.println("Detectada");
  } else if (respirationMissing) {
    Serial.println("No detectada");
  } else {
    Serial.println("En observacion");
  }

  Serial.print("Presion: ");
  if (pressureMeasurementActive) {
    Serial.print("Midiendo ");
    Serial.print(estimatedSystolicMmHg);
    Serial.print("/");
    Serial.print(estimatedDiastolicMmHg);
    Serial.println(" mmHg");
  } else {
    Serial.println("Sin medicion");
  }

  Serial.print("Alertas: ");
  bool hasAlertMessage = false;
  if (!validHeartRate) {
    Serial.print("Pulso fuera de rango ");
    hasAlertMessage = true;
  }
  if (respirationMissing) {
    Serial.print("Sin respiracion ");
    hasAlertMessage = true;
  }
  if (temperatureAlertDetected) {
    Serial.print("Temperatura alta ");
    hasAlertMessage = true;
  } else if (temperatureWarningDetected) {
    Serial.print("Temperatura elevada ");
    hasAlertMessage = true;
  }
  if (!hasAlertMessage) {
    Serial.print("Ninguna");
  }
  Serial.println();
  Serial.println();

}

void ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) return;

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < 10000) {
    delay(250);
  }
}

void ensureMqtt() {
  if (mqttClient.connected()) return;

  if (WiFi.status() != WL_CONNECTED) return;

  String clientId = String("luz-") + DEVICE_ID;
  if (mqttClient.connect(clientId.c_str())) {
    String controlTopic = String("luz/device/") + DEVICE_ID + "/control";
    mqttClient.subscribe(controlTopic.c_str());
  }
}

void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  String topicName(topic);
  String expectedTopic = String("luz/device/") + DEVICE_ID + "/control";
  if (topicName != expectedTopic) return;

  String message;
  for (unsigned int i = 0; i < length; i++) {
    message += static_cast<char>(payload[i]);
  }
  message.toLowerCase();

  if (message.indexOf("start") >= 0) {
    monitoringEnabled = true;
    resetMonitoringCycle();
    Serial.println("Monitoreo iniciado desde backend. Esperando dedo.");
  } else if (message.indexOf("stop") >= 0) {
    monitoringEnabled = false;
    resetMonitoringCycle();
    Serial.println("Monitoreo detenido desde backend.");
  }
}

void publishTelemetryMqtt() {
  if (!mqttClient.connected()) return;

  String topic = String("luz/device/") + DEVICE_ID + "/telemetry";
  float safeHeartRate = sanitizeNumber(validHeartRate ? heartRateBpm : 0.0f);
  float safeSpo2 = sanitizeNumber(validSpO2 ? spo2Filtered : 0.0f);
  float safeBodyTemp = sanitizeNumber(bodyTemperatureC);
  float safeAmbientTemp = sanitizeNumber(ambientTemperatureC);
  String payload = "{";
  payload += "\"deviceId\":\"" + String(DEVICE_ID) + "\",";
  payload += "\"ts\":" + String(millis()) + ",";
  payload += "\"heartRateBpm\":" + String(safeHeartRate, 1) + ",";
  payload += "\"spo2\":" + String(safeSpo2, 1) + ",";
  payload += "\"temperatureC\":" + String(safeBodyTemp, 1) + ",";
  payload += "\"ambientTemperatureC\":" + String(safeAmbientTemp, 1) + ",";
  payload += "\"estimatedSystolicMmHg\":" + String(estimatedSystolicMmHg) + ",";
  payload += "\"estimatedDiastolicMmHg\":" + String(estimatedDiastolicMmHg) + ",";
  payload += "\"fingerDetected\":" + String(fingerDetected ? "true" : "false") + ",";
  payload += "\"monitoringEnabled\":" + String(monitoringEnabled ? "true" : "false") + ",";
  payload += "\"calibrationComplete\":" + String(calibrationComplete ? "true" : "false") + ",";
  payload += "\"respirationDetected\":" + String(respirationDetected ? "true" : "false") + ",";
  payload += "\"respirationMissing\":" + String(respirationMissing ? "true" : "false") + ",";
  payload += "\"warningActive\":" + String(warningActive ? "true" : "false") + ",";
  payload += "\"alertActive\":" + String(alertActive ? "true" : "false");
  payload += "}";

  bool published = mqttClient.publish(topic.c_str(), payload.c_str(), false);
  if (!published) {
    Serial.print("MQTT publish failed. Payload size: ");
    Serial.println(payload.length());
  }
}

float sanitizeNumber(float value) {
  if (isnan(value) || isinf(value)) return 0.0f;
  return value;
}

uint16_t readFilteredAdc(uint8_t pin) {
  uint32_t accumulator = 0;

  for (uint8_t i = 0; i < ANALOG_FILTER_SAMPLES; i++) {
    accumulator += analogRead(pin);
    delayMicroseconds(250);
  }

  return static_cast<uint16_t>(accumulator / ANALOG_FILTER_SAMPLES);
}

float adcToVoltage(uint16_t rawAdc) {
  return (static_cast<float>(rawAdc) / ADC_RESOLUTION) * ADC_REFERENCE_V;
}
