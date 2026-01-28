#include "touch.h"

// CST820 register definitions
#define CST820_REG_STATUS     0x00
#define CST820_REG_TOUCH_NUM  0x02
#define CST820_REG_XPOS_H     0x03
#define CST820_REG_XPOS_L     0x04
#define CST820_REG_YPOS_H     0x05
#define CST820_REG_YPOS_L     0x06
#define CST820_REG_CHIP_ID    0xA7
#define CST820_REG_SLEEP      0xE5

TouchController::TouchController() : _initialized(false) {}

void TouchController::begin(int sda, int scl, int rst, int intr) {
    _sda = sda;
    _scl = scl;
    _rst = rst;
    _int = intr;

    // Initialize I2C
    Wire.begin(_sda, _scl);
    Wire.setClock(400000);  // 400kHz I2C

    // Setup interrupt pin
    if (_int >= 0) {
        pinMode(_int, INPUT);
    }

    // Reset touch controller
    reset();

    // Check if touch controller is present
    uint8_t chipId = readRegister(CST820_REG_CHIP_ID);
    Serial.printf("Touch controller chip ID: 0x%02X\n", chipId);

    _initialized = (chipId != 0xFF && chipId != 0x00);

    if (_initialized) {
        Serial.println("Capacitive touch initialized");
    } else {
        Serial.println("Warning: Touch controller not detected");
    }
}

void TouchController::reset() {
    if (_rst >= 0) {
        pinMode(_rst, OUTPUT);
        digitalWrite(_rst, LOW);
        delay(10);
        digitalWrite(_rst, HIGH);
        delay(50);
    }
}

uint8_t TouchController::readRegister(uint8_t reg) {
    Wire.beginTransmission(TOUCH_I2C_ADDR);
    Wire.write(reg);
    if (Wire.endTransmission() != 0) {
        return 0xFF;
    }

    Wire.requestFrom((uint8_t)TOUCH_I2C_ADDR, (uint8_t)1);
    if (Wire.available()) {
        return Wire.read();
    }
    return 0xFF;
}

void TouchController::writeRegister(uint8_t reg, uint8_t value) {
    Wire.beginTransmission(TOUCH_I2C_ADDR);
    Wire.write(reg);
    Wire.write(value);
    Wire.endTransmission();
}

bool TouchController::isTouched() {
    if (!_initialized) {
        return false;
    }

    // Check interrupt pin if available
    if (_int >= 0) {
        return digitalRead(_int) == LOW;
    }

    // Otherwise check touch count register
    uint8_t touchCount = readRegister(CST820_REG_TOUCH_NUM);
    return (touchCount > 0 && touchCount < 6);
}

bool TouchController::getPoint(int& x, int& y) {
    if (!_initialized) {
        return false;
    }

    // Read touch data (6 bytes starting from register 0x02)
    Wire.beginTransmission(TOUCH_I2C_ADDR);
    Wire.write(CST820_REG_TOUCH_NUM);
    if (Wire.endTransmission() != 0) {
        return false;
    }

    Wire.requestFrom((uint8_t)TOUCH_I2C_ADDR, (uint8_t)5);
    if (Wire.available() < 5) {
        return false;
    }

    uint8_t touchCount = Wire.read();
    uint8_t xHigh = Wire.read();
    uint8_t xLow = Wire.read();
    uint8_t yHigh = Wire.read();
    uint8_t yLow = Wire.read();

    if (touchCount == 0 || touchCount > 5) {
        return false;
    }

    // Extract coordinates (CST820 uses 12-bit values)
    int rawX = ((xHigh & 0x0F) << 8) | xLow;
    int rawY = ((yHigh & 0x0F) << 8) | yLow;

    // Map to screen coordinates based on rotation
    // For landscape mode (rotation 1), swap and invert as needed
    #if TFT_ROTATION == 1
        x = rawY;
        y = SCREEN_HEIGHT - rawX;
    #elif TFT_ROTATION == 3
        x = SCREEN_WIDTH - rawY;
        y = rawX;
    #else
        x = rawX;
        y = rawY;
    #endif

    // Clamp to screen bounds
    x = constrain(x, 0, SCREEN_WIDTH - 1);
    y = constrain(y, 0, SCREEN_HEIGHT - 1);

    return true;
}
