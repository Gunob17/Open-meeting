#ifndef TOUCH_H
#define TOUCH_H

#include <Arduino.h>
#include <Wire.h>
#include "config.h"

// CST820 touch controller driver
class TouchController {
public:
    TouchController();

    void begin(int sda = TOUCH_SDA, int scl = TOUCH_SCL, int rst = TOUCH_RST, int intr = TOUCH_INT);
    bool isTouched();
    bool getPoint(int& x, int& y);

private:
    int _sda, _scl, _rst, _int;
    bool _initialized;

    uint8_t readRegister(uint8_t reg);
    void writeRegister(uint8_t reg, uint8_t value);
    void reset();
};

#endif // TOUCH_H
