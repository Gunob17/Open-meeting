#include "ui_manager.h"

UIManager::UIManager(TFT_eSPI& tft) : _tft(tft), _currentState(UI_LOADING), _buttonCount(0) {
    _tokenInput = "";
    _apiUrlInput = "";
}

void UIManager::begin() {
    _tft.init();
    _tft.setRotation(TFT_ROTATION);
    _tft.fillScreen(COLOR_BG);

    // Initialize touch
    uint16_t calData[5] = {TOUCH_MIN_X, TOUCH_MAX_X, TOUCH_MIN_Y, TOUCH_MAX_Y, 1};
    _tft.setTouch(calData);
}

void UIManager::setRotation(uint8_t rotation) {
    _tft.setRotation(rotation);
}

void UIManager::clearButtons() {
    _buttonCount = 0;
}

void UIManager::addButton(int x, int y, int w, int h, const String& label, uint16_t bgColor, uint16_t textColor) {
    if (_buttonCount < 8) {
        _buttons[_buttonCount] = {x, y, w, h, label, bgColor, textColor, true};
        _buttonCount++;
    }
}

bool UIManager::isTouched() {
    return _tft.getTouch(nullptr, nullptr);
}

bool UIManager::getTouchPoint(int& x, int& y) {
    uint16_t tx, ty;
    if (_tft.getTouch(&tx, &ty)) {
        x = tx;
        y = ty;
        return true;
    }
    return false;
}

int UIManager::checkButtonPress(int touchX, int touchY) {
    for (int i = 0; i < _buttonCount; i++) {
        Button& btn = _buttons[i];
        if (btn.visible &&
            touchX >= btn.x && touchX <= btn.x + btn.w &&
            touchY >= btn.y && touchY <= btn.y + btn.h) {
            return i;
        }
    }
    return -1;
}

void UIManager::drawHeader(const String& title, uint16_t bgColor) {
    _tft.fillRect(0, 0, SCREEN_WIDTH, 40, bgColor);
    _tft.setTextColor(COLOR_TEXT);
    _tft.setTextDatum(MC_DATUM);
    _tft.setTextSize(1);
    _tft.drawString(title, SCREEN_WIDTH / 2, 20, 4);
}

void UIManager::drawButton(int x, int y, int w, int h, const String& label, uint16_t bgColor, uint16_t textColor) {
    _tft.fillRoundRect(x, y, w, h, 5, bgColor);
    _tft.setTextColor(textColor);
    _tft.setTextDatum(MC_DATUM);
    _tft.drawString(label, x + w/2, y + h/2, 2);
}

void UIManager::drawCard(int x, int y, int w, int h, uint16_t bgColor) {
    _tft.fillRoundRect(x, y, w, h, 8, bgColor);
}

void UIManager::drawCenteredText(const String& text, int y, uint8_t font) {
    _tft.setTextDatum(MC_DATUM);
    _tft.drawString(text, SCREEN_WIDTH / 2, y, font);
}

String UIManager::formatTime(const String& isoTime) {
    // Parse ISO time string and extract HH:MM
    int tIndex = isoTime.indexOf('T');
    if (tIndex == -1) return isoTime;

    String timePart = isoTime.substring(tIndex + 1, tIndex + 6);
    return timePart;
}

String UIManager::formatTimeRange(const String& start, const String& end) {
    return formatTime(start) + " - " + formatTime(end);
}

void UIManager::drawBookingCard(int y, const Booking& booking, bool isCurrent) {
    uint16_t cardColor = isCurrent ? 0x4000 : COLOR_CARD_BG;  // Dark red or dark gray

    drawCard(10, y, SCREEN_WIDTH - 20, 45, cardColor);

    _tft.setTextColor(COLOR_TEXT);
    _tft.setTextDatum(TL_DATUM);

    // Title (truncate if too long)
    String title = booking.title;
    if (title.length() > 25) {
        title = title.substring(0, 22) + "...";
    }
    _tft.drawString(title, 20, y + 8, 2);

    // Time
    _tft.setTextColor(COLOR_TEXT_MUTED);
    _tft.drawString(formatTimeRange(booking.startTime, booking.endTime), 20, y + 28, 1);
}

void UIManager::drawStatusIndicator(bool available) {
    uint16_t color = available ? COLOR_AVAILABLE : COLOR_OCCUPIED;
    _tft.fillCircle(SCREEN_WIDTH - 30, 20, 12, color);
}

// ============== Screen Drawing Functions ==============

void UIManager::showWiFiSetup(const String& apName, const String& apPassword) {
    _currentState = UI_WIFI_SETUP;
    clearButtons();

    _tft.fillScreen(COLOR_BG);
    drawHeader("WiFi Setup", COLOR_WARNING);

    _tft.setTextColor(COLOR_TEXT);
    _tft.setTextDatum(MC_DATUM);

    _tft.drawString("Connect to WiFi network:", SCREEN_WIDTH/2, 70, 2);

    _tft.setTextColor(COLOR_PRIMARY);
    _tft.drawString(apName, SCREEN_WIDTH/2, 100, 4);

    _tft.setTextColor(COLOR_TEXT_MUTED);
    _tft.drawString("Password: " + apPassword, SCREEN_WIDTH/2, 135, 2);

    _tft.drawString("Then open browser and go to:", SCREEN_WIDTH/2, 170, 2);

    _tft.setTextColor(COLOR_SUCCESS);
    _tft.drawString("192.168.4.1", SCREEN_WIDTH/2, 200, 4);
}

void UIManager::showTokenSetup(const String& currentToken) {
    _currentState = UI_TOKEN_SETUP;
    clearButtons();

    _tft.fillScreen(COLOR_BG);
    drawHeader("Device Setup", COLOR_PRIMARY);

    _tft.setTextColor(COLOR_TEXT);
    _tft.setTextDatum(MC_DATUM);

    _tft.drawString("Enter device token from", SCREEN_WIDTH/2, 60, 2);
    _tft.drawString("admin panel", SCREEN_WIDTH/2, 80, 2);

    // Token input field
    drawCard(20, 100, SCREEN_WIDTH - 40, 40, COLOR_CARD_BG);
    _tft.setTextColor(COLOR_TEXT);
    _tft.setTextDatum(ML_DATUM);

    String displayToken = currentToken.length() > 0 ? currentToken : "Paste token here...";
    if (displayToken.length() > 30) {
        displayToken = displayToken.substring(0, 27) + "...";
    }
    _tft.drawString(displayToken, 30, 120, 2);

    _tft.setTextColor(COLOR_TEXT_MUTED);
    _tft.setTextDatum(MC_DATUM);
    _tft.drawString("Use web interface to enter token", SCREEN_WIDTH/2, 160, 1);
    _tft.drawString("Go to: 192.168.4.1/setup", SCREEN_WIDTH/2, 175, 2);

    // Buttons
    drawButton(20, 200, 130, 35, "Clear", COLOR_DANGER, COLOR_TEXT);
    addButton(20, 200, 130, 35, "Clear", COLOR_DANGER, COLOR_TEXT);

    drawButton(170, 200, 130, 35, "Save", COLOR_SUCCESS, COLOR_TEXT);
    addButton(170, 200, 130, 35, "Save", COLOR_SUCCESS, COLOR_TEXT);
}

void UIManager::showRoomStatus(const RoomStatus& status) {
    _currentState = UI_ROOM_STATUS;
    clearButtons();

    _tft.fillScreen(COLOR_BG);

    // Header with room name and status
    uint16_t headerColor = status.isAvailable ? COLOR_SUCCESS : COLOR_DANGER;
    drawHeader(status.room.name, headerColor);
    drawStatusIndicator(status.isAvailable);

    int yPos = 50;

    // Current status
    _tft.setTextColor(COLOR_TEXT);
    _tft.setTextDatum(TL_DATUM);

    if (status.isAvailable) {
        _tft.setTextColor(COLOR_SUCCESS);
        _tft.setTextDatum(MC_DATUM);
        _tft.drawString("AVAILABLE", SCREEN_WIDTH/2, yPos + 10, 4);
        yPos += 40;

        // Quick book button
        drawButton(20, yPos, SCREEN_WIDTH - 40, 40, "Book Now", COLOR_PRIMARY, COLOR_TEXT);
        addButton(20, yPos, SCREEN_WIDTH - 40, 40, "Book Now");
        yPos += 50;
    } else {
        _tft.setTextColor(COLOR_DANGER);
        _tft.setTextDatum(MC_DATUM);
        _tft.drawString("OCCUPIED", SCREEN_WIDTH/2, yPos + 5, 4);
        yPos += 30;

        // Show current booking
        if (status.currentBooking.isValid) {
            drawBookingCard(yPos, status.currentBooking, true);
            yPos += 55;
        }
    }

    // Upcoming bookings
    if (status.upcomingCount > 0) {
        _tft.setTextColor(COLOR_TEXT_MUTED);
        _tft.setTextDatum(TL_DATUM);
        _tft.drawString("Upcoming:", 15, yPos, 1);
        yPos += 15;

        for (int i = 0; i < status.upcomingCount && yPos < SCREEN_HEIGHT - 50; i++) {
            if (status.upcomingBookings[i].isValid) {
                drawBookingCard(yPos, status.upcomingBookings[i], false);
                yPos += 50;
            }
        }
    }

    // Refresh button at bottom
    drawButton(SCREEN_WIDTH - 70, SCREEN_HEIGHT - 35, 60, 30, "Refresh", COLOR_CARD_BG, COLOR_TEXT);
    addButton(SCREEN_WIDTH - 70, SCREEN_HEIGHT - 35, 60, 30, "Refresh");
}

void UIManager::showQuickBookMenu() {
    _currentState = UI_QUICK_BOOK;
    clearButtons();

    _tft.fillScreen(COLOR_BG);
    drawHeader("Quick Book", COLOR_PRIMARY);

    _tft.setTextColor(COLOR_TEXT);
    _tft.setTextDatum(MC_DATUM);
    _tft.drawString("Select duration:", SCREEN_WIDTH/2, 55, 2);

    int btnWidth = 140;
    int btnHeight = 45;
    int gap = 10;
    int startX = (SCREEN_WIDTH - btnWidth * 2 - gap) / 2;
    int startY = 80;

    // 15 minutes
    drawButton(startX, startY, btnWidth, btnHeight, "15 min", COLOR_SUCCESS, COLOR_TEXT);
    addButton(startX, startY, btnWidth, btnHeight, "15");

    // 30 minutes
    drawButton(startX + btnWidth + gap, startY, btnWidth, btnHeight, "30 min", COLOR_SUCCESS, COLOR_TEXT);
    addButton(startX + btnWidth + gap, startY, btnWidth, btnHeight, "30");

    // 45 minutes
    drawButton(startX, startY + btnHeight + gap, btnWidth, btnHeight, "45 min", COLOR_WARNING, COLOR_TEXT);
    addButton(startX, startY + btnHeight + gap, btnWidth, btnHeight, "45");

    // 60 minutes
    drawButton(startX + btnWidth + gap, startY + btnHeight + gap, btnWidth, btnHeight, "60 min", COLOR_WARNING, COLOR_TEXT);
    addButton(startX + btnWidth + gap, startY + btnHeight + gap, btnWidth, btnHeight, "60");

    // Cancel button
    drawButton(SCREEN_WIDTH/2 - 70, 200, 140, 35, "Cancel", COLOR_DANGER, COLOR_TEXT);
    addButton(SCREEN_WIDTH/2 - 70, 200, 140, 35, "Cancel");
}

void UIManager::showBookingConfirm(int duration) {
    _currentState = UI_BOOKING_CONFIRM;
    clearButtons();

    _tft.fillScreen(COLOR_BG);
    drawHeader("Confirm Booking", COLOR_PRIMARY);

    _tft.setTextColor(COLOR_TEXT);
    _tft.setTextDatum(MC_DATUM);

    _tft.drawString("Book room for", SCREEN_WIDTH/2, 70, 2);
    _tft.setTextColor(COLOR_SUCCESS);
    _tft.drawString(String(duration) + " minutes?", SCREEN_WIDTH/2, 100, 4);

    _tft.setTextColor(COLOR_TEXT_MUTED);
    _tft.drawString("Booking starts immediately", SCREEN_WIDTH/2, 140, 2);

    // Buttons
    drawButton(30, 180, 120, 45, "Cancel", COLOR_DANGER, COLOR_TEXT);
    addButton(30, 180, 120, 45, "Cancel");

    drawButton(170, 180, 120, 45, "Confirm", COLOR_SUCCESS, COLOR_TEXT);
    addButton(170, 180, 120, 45, "Confirm");
}

void UIManager::showBookingResult(bool success, const String& message) {
    clearButtons();

    _tft.fillScreen(COLOR_BG);

    if (success) {
        drawHeader("Booked!", COLOR_SUCCESS);
        _tft.setTextColor(COLOR_SUCCESS);
    } else {
        drawHeader("Error", COLOR_DANGER);
        _tft.setTextColor(COLOR_DANGER);
    }

    _tft.setTextDatum(MC_DATUM);

    // Word wrap message
    int y = 100;
    String msg = message;
    while (msg.length() > 0 && y < 180) {
        int maxChars = 30;
        String line = msg.substring(0, min((int)msg.length(), maxChars));
        if (msg.length() > maxChars) {
            int lastSpace = line.lastIndexOf(' ');
            if (lastSpace > 0) {
                line = msg.substring(0, lastSpace);
                msg = msg.substring(lastSpace + 1);
            } else {
                msg = msg.substring(maxChars);
            }
        } else {
            msg = "";
        }
        _tft.drawString(line, SCREEN_WIDTH/2, y, 2);
        y += 25;
    }

    drawButton(SCREEN_WIDTH/2 - 60, 200, 120, 35, "OK", COLOR_PRIMARY, COLOR_TEXT);
    addButton(SCREEN_WIDTH/2 - 60, 200, 120, 35, "OK");
}

void UIManager::showError(const String& message) {
    _currentState = UI_ERROR;
    clearButtons();

    _tft.fillScreen(COLOR_BG);
    drawHeader("Error", COLOR_DANGER);

    _tft.setTextColor(COLOR_TEXT);
    _tft.setTextDatum(MC_DATUM);

    // Word wrap
    int y = 90;
    String msg = message;
    while (msg.length() > 0 && y < 170) {
        int maxChars = 28;
        String line = msg.substring(0, min((int)msg.length(), maxChars));
        if (msg.length() > maxChars) {
            int lastSpace = line.lastIndexOf(' ');
            if (lastSpace > 0) {
                line = msg.substring(0, lastSpace);
                msg = msg.substring(lastSpace + 1);
            } else {
                msg = msg.substring(maxChars);
            }
        } else {
            msg = "";
        }
        _tft.drawString(line, SCREEN_WIDTH/2, y, 2);
        y += 22;
    }

    drawButton(SCREEN_WIDTH/2 - 60, 200, 120, 35, "Retry", COLOR_PRIMARY, COLOR_TEXT);
    addButton(SCREEN_WIDTH/2 - 60, 200, 120, 35, "Retry");
}

void UIManager::showLoading(const String& message) {
    _currentState = UI_LOADING;
    clearButtons();

    _tft.fillScreen(COLOR_BG);

    _tft.setTextColor(COLOR_TEXT);
    _tft.setTextDatum(MC_DATUM);
    _tft.drawString(message, SCREEN_WIDTH/2, SCREEN_HEIGHT/2, 2);

    // Simple loading animation dots
    _tft.fillCircle(SCREEN_WIDTH/2 - 20, SCREEN_HEIGHT/2 + 30, 5, COLOR_PRIMARY);
    _tft.fillCircle(SCREEN_WIDTH/2, SCREEN_HEIGHT/2 + 30, 5, COLOR_PRIMARY);
    _tft.fillCircle(SCREEN_WIDTH/2 + 20, SCREEN_HEIGHT/2 + 30, 5, COLOR_PRIMARY);
}

void UIManager::showConnecting() {
    showLoading("Connecting to WiFi...");
}

void UIManager::handleTokenInput(char c) {
    if (c == '\b' && _tokenInput.length() > 0) {
        _tokenInput = _tokenInput.substring(0, _tokenInput.length() - 1);
    } else if (c >= 32 && c <= 126 && _tokenInput.length() < 64) {
        _tokenInput += c;
    }
}
