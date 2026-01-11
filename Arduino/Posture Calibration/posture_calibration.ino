#include <Wire.h>
#include <math.h>

// =====================
// MMA7660 Accelerometer
// =====================
#define MMA7660_ADDR ((uint8_t)0x4C)

// MMA7660 registers
#define REG_XOUT ((uint8_t)0x00)
#define REG_YOUT ((uint8_t)0x01)
#define REG_ZOUT ((uint8_t)0x02)
#define REG_MODE ((uint8_t)0x07)
#define REG_SR ((uint8_t)0x08)

// =====================
// Grove Button (D2)
// =====================
#define BUTTON_PIN 2

// Calibration params
const uint8_t CALIB_SECONDS = 5;              // sample count (1 per second)
const unsigned long CALIB_INTERVAL_MS = 1000; // 1 second

// Debounce
const unsigned long DEBOUNCE_MS = 35;

// Sensor streaming rate
const unsigned long STREAM_INTERVAL_MS = 50; // 20 Hz (50ms)

// =====================
// I2C Helpers
// =====================
static inline uint8_t read8(uint8_t reg)
{
    Wire.beginTransmission(MMA7660_ADDR);
    Wire.write(reg);
    Wire.endTransmission(false);
    Wire.requestFrom((uint8_t)MMA7660_ADDR, (uint8_t)1);
    if (!Wire.available())
        return 0xFF;
    return Wire.read();
}

static inline void write8(uint8_t reg, uint8_t val)
{
    Wire.beginTransmission(MMA7660_ADDR);
    Wire.write(reg);
    Wire.write(val);
    Wire.endTransmission();
}

// MMA7660 gives 6-bit signed (-32..31) in bits[5:0]
static inline int8_t decode6(uint8_t raw)
{
    raw &= 0x3F;
    if (raw & 0x20)
        raw = raw - 0x40; // sign extend
    return (int8_t)raw;
}

static inline bool readXYZ6(int8_t &x6, int8_t &y6, int8_t &z6)
{
    uint8_t rx = read8(REG_XOUT);
    uint8_t ry = read8(REG_YOUT);
    uint8_t rz = read8(REG_ZOUT);

    if (rx == 0xFF || ry == 0xFF || rz == 0xFF)
        return false;

    x6 = decode6(rx);
    y6 = decode6(ry);
    z6 = decode6(rz);
    return true;
}

static inline float ema(float prev, float cur, float alpha)
{
    return alpha * cur + (1.0f - alpha) * prev;
}

// =====================
// Button (debounced click)
// =====================
// INPUT_PULLUP => pressed = LOW
static inline bool rawPressed()
{
    return digitalRead(BUTTON_PIN) == LOW;
}

bool debouncedPressed = false;
bool lastDebouncedPressed = false;
bool lastRawPressed = false;
unsigned long lastRawChangeMs = 0;

bool pollButtonClick(unsigned long nowMs)
{
    bool raw = rawPressed();

    // track raw changes
    if (raw != lastRawPressed)
    {
        lastRawPressed = raw;
        lastRawChangeMs = nowMs;
    }

    // commit to debounced if stable long enough
    if ((nowMs - lastRawChangeMs) >= DEBOUNCE_MS)
    {
        debouncedPressed = raw;
    }

    // click = rising edge: not pressed -> pressed
    bool click = (!lastDebouncedPressed && debouncedPressed);
    lastDebouncedPressed = debouncedPressed;
    return click;
}

// =====================
// Calibration state
// =====================
bool calibrating = false;
uint8_t calibCount = 0;
float calibSum = 0.0f;

float baselinePitch = 0.0f;
bool baselineValid = false;

unsigned long lastCalibSampleMs = 0;

void startCalibration(unsigned long nowMs)
{
    calibrating = true;
    calibCount = 0;
    calibSum = 0.0f;
    lastCalibSampleMs = nowMs; // start timer now

    Serial.print("{\"event\":\"calibration_start\",\"seconds\":");
    Serial.print(CALIB_SECONDS);
    Serial.print(",\"ts\":");
    Serial.print(nowMs);
    Serial.println("}");
}

void finishCalibration(unsigned long nowMs)
{
    if (calibCount > 0)
    {
        baselinePitch = calibSum / (float)calibCount;
        baselineValid = true;

        Serial.print("{\"event\":\"calibration\",\"baseline_pitch\":");
        Serial.print(baselinePitch, 2);
        Serial.print(",\"samples\":");
        Serial.print(calibCount);
        Serial.print(",\"ts\":");
        Serial.print(nowMs);
        Serial.println("}");
    }
    else
    {
        Serial.print("{\"event\":\"calibration_failed\",\"reason\":\"no_samples\",\"ts\":");
        Serial.print(nowMs);
        Serial.println("}");
    }

    calibrating = false;
}

// =====================
// Setup
// =====================
void setup()
{
    Wire.begin();
    Serial.begin(115200);
    delay(200);

    pinMode(BUTTON_PIN, INPUT_PULLUP);

    // Standby -> set sample rate -> active
    write8(REG_MODE, 0x00);
    write8(REG_SR, 0x00); // fast sample rate (datasheet: 120 Hz)
    write8(REG_MODE, 0x01);

    Serial.println("MMA7660 streaming @ 20Hz. CLICK button (D2) to calibrate for 5 seconds.");
}

// =====================
// Loop (non-blocking)
// =====================
void loop()
{
    const unsigned long nowMs = millis();

    // 1) Detect click frequently (no delay)
    bool clicked = pollButtonClick(nowMs);
    if (clicked && !calibrating)
    {
        startCalibration(nowMs);
    }

    // 2) Read sensor & stream at 20Hz
    static unsigned long lastStreamMs = 0;
    if (nowMs - lastStreamMs >= STREAM_INTERVAL_MS)
    {
        lastStreamMs = nowMs;

        static bool hasPrev = false;
        static float pitchSmoothPrev = 0.0f;
        static float pitchPrev = 0.0f;
        static unsigned long prevMs = 0;

        int8_t x6, y6, z6;
        if (!readXYZ6(x6, y6, z6))
        {
            Serial.print("{\"error\":\"read_failed\",\"ts\":");
            Serial.print(nowMs);
            Serial.println("}");
            return;
        }

        const float COUNTS_PER_G = 21.33f;
        float ax = x6 / COUNTS_PER_G;
        float ay = y6 / COUNTS_PER_G;
        float az = z6 / COUNTS_PER_G;

        float pitch = atan2(-ax, sqrt(ay * ay + az * az)) * 180.0f / PI;
        float roll = atan2(ay, az) * 180.0f / PI;
        float a_mag = sqrt(ax * ax + ay * ay + az * az);

        if (!hasPrev)
        {
            pitchPrev = pitch;
            pitchSmoothPrev = pitch;
            prevMs = nowMs;
            hasPrev = true;
        }

        const float ALPHA = 0.25f;
        float pitch_smooth = ema(pitchSmoothPrev, pitch, ALPHA);
        pitchSmoothPrev = pitch_smooth;

        float dt = (float)(nowMs - prevMs) / 1000.0f;
        if (dt <= 0.0f)
            dt = 0.05f;
        float dpitch = (pitch - pitchPrev) / dt;
        pitchPrev = pitch;
        prevMs = nowMs;

        // 3) Calibration sampling: once per second while calibrating
        if (calibrating && (nowMs - lastCalibSampleMs >= CALIB_INTERVAL_MS))
        {
            lastCalibSampleMs += CALIB_INTERVAL_MS; // keep stable cadence

            calibSum += pitch_smooth;
            calibCount++;

            Serial.print("{\"event\":\"calibration_progress\",\"sample\":");
            Serial.print(calibCount);
            Serial.print(",\"pitch_smooth\":");
            Serial.print(pitch_smooth, 2);
            Serial.print(",\"ts\":");
            Serial.print(nowMs);
            Serial.println("}");

            if (calibCount >= CALIB_SECONDS)
            {
                finishCalibration(nowMs);
            }
        }

        // Normal streaming output
        Serial.print("{\"ax\":");
        Serial.print(ax, 4);
        Serial.print(",\"ay\":");
        Serial.print(ay, 4);
        Serial.print(",\"az\":");
        Serial.print(az, 4);
        Serial.print(",\"pitch\":");
        Serial.print(pitch, 2);
        Serial.print(",\"pitch_smooth\":");
        Serial.print(pitch_smooth, 2);
        Serial.print(",\"roll\":");
        Serial.print(roll, 2);
        Serial.print(",\"a_mag\":");
        Serial.print(a_mag, 4);
        Serial.print(",\"dpitch\":");
        Serial.print(dpitch, 2);

        if (baselineValid)
        {
            Serial.print(",\"baseline_pitch\":");
            Serial.print(baselinePitch, 2);
        }

        Serial.print(",\"ts\":");
        Serial.print(nowMs);
        Serial.println("}");
    }
}
