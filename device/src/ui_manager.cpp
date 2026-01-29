#include "ui_manager.h"

UIManager::UIManager(TFT_eSPI& tft, TouchController& touch)
    : _tft(tft), _touch(touch), _currentState(UI_LOADING), _buttonCount(0) {
    _tokenInput = "";
    _apiUrlInput = "";
}

void UIManager::begin() {
    _tft.init();
    _tft.setRotation(TFT_ROTATION);
    _tft.fillScreen(COLOR_BG);

    // Turn on backlight
    #ifdef TFT_BL
    pinMode(TFT_BL, OUTPUT);
    digitalWrite(TFT_BL, HIGH);
    #endif
}

void UIManager::setBacklight(bool on) {
    #ifdef TFT_BL
    digitalWrite(TFT_BL, on ? HIGH : LOW);
    #endif
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
    return _touch.isTouched();
}

bool UIManager::getTouchPoint(int& x, int& y) {
    return _touch.getPoint(x, y);
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
    // Minimal top bar
    _tft.fillRect(0, 0, SCREEN_WIDTH, 3, bgColor);
    _tft.setTextColor(COLOR_TEXT);
    _tft.setTextDatum(TL_DATUM);
    _tft.drawString(title, 12, 12, 4);
}

void UIManager::drawButton(int x, int y, int w, int h, const String& label, uint16_t bgColor, uint16_t textColor) {
    _tft.fillRoundRect(x, y, w, h, 8, bgColor);
    _tft.setTextColor(textColor);
    _tft.setTextDatum(MC_DATUM);
    _tft.drawString(label, x + w/2, y + h/2, 2);
}

void UIManager::drawCard(int x, int y, int w, int h, uint16_t bgColor) {
    _tft.fillRoundRect(x, y, w, h, 6, bgColor);
}

void UIManager::drawCenteredText(const String& text, int y, uint8_t font) {
    _tft.setTextDatum(MC_DATUM);
    _tft.drawString(text, SCREEN_WIDTH / 2, y, font);
}

String UIManager::formatTime(const String& isoTime) {
    int tIndex = isoTime.indexOf('T');
    if (tIndex == -1) return isoTime;
    String timePart = isoTime.substring(tIndex + 1, tIndex + 6);
    return timePart;
}

String UIManager::formatTimeRange(const String& start, const String& end) {
    return formatTime(start) + " - " + formatTime(end);
}

void UIManager::drawBookingCard(int y, const Booking& booking, bool isCurrent) {
    uint16_t cardColor = isCurrent ? 0x3000 : COLOR_CARD_BG;
    uint16_t accentColor = isCurrent ? COLOR_DANGER : COLOR_ACCENT;

    // Card with left accent bar
    drawCard(12, y, SCREEN_WIDTH - 24, 42, cardColor);
    _tft.fillRect(12, y, 4, 42, accentColor);

    _tft.setTextColor(COLOR_TEXT);
    _tft.setTextDatum(TL_DATUM);

    String title = booking.title;
    if (title.length() > 28) {
        title = title.substring(0, 25) + "...";
    }
    _tft.drawString(title, 24, y + 8, 2);

    _tft.setTextColor(COLOR_TEXT_MUTED);
    _tft.drawString(formatTimeRange(booking.startTime, booking.endTime), 24, y + 26, 1);
}

void UIManager::drawStatusIndicator(bool available) {
    // Not used in new design
}

// ============== Screen Drawing Functions ==============

void UIManager::showStartupScreen() {
    _currentState = UI_LOADING;
    clearButtons();

    _tft.fillScreen(COLOR_BG);

    // Logo/title area
    _tft.setTextColor(COLOR_PRIMARY);
    _tft.setTextDatum(MC_DATUM);
    _tft.drawString("MEETING ROOM", SCREEN_WIDTH/2, 30, 4);
    _tft.setTextColor(COLOR_TEXT_MUTED);
    _tft.drawString("Display Setup", SCREEN_WIDTH/2, 55, 2);

    // Instructions card
    drawCard(12, 75, SCREEN_WIDTH - 24, 130, COLOR_CARD_BG);

    _tft.setTextColor(COLOR_TEXT);
    _tft.setTextDatum(TL_DATUM);
    int y = 85;
    int x = 24;

    _tft.drawString("1. Connect to WiFi:", x, y, 2);
    _tft.setTextColor(COLOR_ACCENT);
    _tft.drawString("MeetingRoom-Setup", x + 130, y, 2);
    y += 22;

    _tft.setTextColor(COLOR_TEXT_MUTED);
    _tft.drawString("Password: setup1234", x, y, 1);
    y += 20;

    _tft.setTextColor(COLOR_TEXT);
    _tft.drawString("2. Open browser:", x, y, 2);
    y += 18;
    _tft.setTextColor(COLOR_ACCENT);
    _tft.drawString("http://192.168.4.1", x, y, 2);
    y += 22;

    _tft.setTextColor(COLOR_TEXT);
    _tft.drawString("3. Configure WiFi & Token", x, y, 2);

    _tft.setTextColor(COLOR_WARNING);
    _tft.setTextDatum(MC_DATUM);
    _tft.drawString("Initializing...", SCREEN_WIDTH/2, 220, 2);
}

void UIManager::showWiFiSetup(const String& apName, const String& apPassword) {
    _currentState = UI_WIFI_SETUP;
    clearButtons();

    _tft.fillScreen(COLOR_BG);

    // Status indicator
    _tft.fillCircle(SCREEN_WIDTH/2, 50, 25, COLOR_WARNING);
    _tft.setTextColor(COLOR_TEXT_DARK);
    _tft.setTextDatum(MC_DATUM);
    _tft.drawString("!", SCREEN_WIDTH/2, 50, 4);

    _tft.setTextColor(COLOR_TEXT);
    _tft.drawString("WiFi Setup Required", SCREEN_WIDTH/2, 95, 2);

    // Info card
    drawCard(12, 115, SCREEN_WIDTH - 24, 90, COLOR_CARD_BG);

    _tft.setTextColor(COLOR_TEXT_MUTED);
    _tft.setTextDatum(TL_DATUM);
    _tft.drawString("Connect to network:", 24, 125, 1);

    _tft.setTextColor(COLOR_ACCENT);
    _tft.setTextDatum(MC_DATUM);
    _tft.drawString(apName, SCREEN_WIDTH/2, 150, 4);

    _tft.setTextColor(COLOR_TEXT_MUTED);
    _tft.drawString("Password: " + apPassword, SCREEN_WIDTH/2, 180, 2);

    _tft.setTextColor(COLOR_TEXT);
    _tft.drawString("Then visit 192.168.4.1", SCREEN_WIDTH/2, 220, 2);
}

void UIManager::showTokenSetup(const String& ipAddress) {
    _currentState = UI_TOKEN_SETUP;
    clearButtons();

    _tft.fillScreen(COLOR_BG);

    // Success indicator
    _tft.fillCircle(SCREEN_WIDTH/2, 45, 22, COLOR_SUCCESS);
    _tft.setTextColor(COLOR_TEXT);
    _tft.setTextDatum(MC_DATUM);
    _tft.drawString("OK", SCREEN_WIDTH/2, 45, 2);

    _tft.setTextColor(COLOR_TEXT);
    _tft.drawString("WiFi Connected", SCREEN_WIDTH/2, 85, 2);

    // URL card
    drawCard(12, 105, SCREEN_WIDTH - 24, 55, COLOR_CARD_BG);
    _tft.setTextColor(COLOR_TEXT_MUTED);
    _tft.drawString("Configure at:", SCREEN_WIDTH/2, 118, 1);
    _tft.setTextColor(COLOR_ACCENT);
    _tft.drawString("http://" + ipAddress, SCREEN_WIDTH/2, 142, 4);

    // Instructions
    _tft.setTextColor(COLOR_TEXT_MUTED);
    _tft.drawString("Enter API URL and device token", SCREEN_WIDTH/2, 180, 1);
    _tft.drawString("from Admin > Rooms > Devices", SCREEN_WIDTH/2, 195, 1);
}

void UIManager::showRoomStatus(const RoomStatus& status) {
    _currentState = UI_ROOM_STATUS;
    clearButtons();

    _tft.fillScreen(COLOR_BG);

    // Room name - top left
    _tft.setTextColor(COLOR_TEXT);
    _tft.setTextDatum(TL_DATUM);
    _tft.drawString(status.room.name, 12, 10, 4);

    // Large status indicator
    int statusY = 50;
    if (status.isAvailable) {
        // Available - large green area
        _tft.fillRoundRect(12, statusY, SCREEN_WIDTH - 24, 70, 8, COLOR_SUCCESS);
        _tft.setTextColor(COLOR_TEXT);
        _tft.setTextDatum(MC_DATUM);
        _tft.drawString("AVAILABLE", SCREEN_WIDTH/2, statusY + 28, 4);
        _tft.setTextColor(0xBFFF);  // Light green tint
        _tft.drawString("Tap to book", SCREEN_WIDTH/2, statusY + 52, 2);
        addButton(12, statusY, SCREEN_WIDTH - 24, 70, "Book");
        statusY += 80;
    } else {
        // Occupied - large red area
        _tft.fillRoundRect(12, statusY, SCREEN_WIDTH - 24, 70, 8, COLOR_DANGER);
        _tft.setTextColor(COLOR_TEXT);
        _tft.setTextDatum(MC_DATUM);
        _tft.drawString("OCCUPIED", SCREEN_WIDTH/2, statusY + 22, 4);

        if (status.currentBooking.isValid) {
            String endTime = formatTime(status.currentBooking.endTime);
            _tft.setTextColor(0xFDB6);  // Light red tint
            _tft.drawString("Until " + endTime, SCREEN_WIDTH/2, statusY + 50, 2);
        }
        statusY += 80;
    }

    // Upcoming bookings
    if (status.upcomingCount > 0) {
        _tft.setTextColor(COLOR_TEXT_MUTED);
        _tft.setTextDatum(TL_DATUM);
        _tft.drawString("NEXT", 12, statusY, 1);
        statusY += 14;

        for (int i = 0; i < status.upcomingCount && statusY < SCREEN_HEIGHT - 35; i++) {
            if (status.upcomingBookings[i].isValid) {
                drawBookingCard(statusY, status.upcomingBookings[i], false);
                statusY += 46;
            }
        }
    }

    // Refresh button - bottom right, minimal
    _tft.fillCircle(SCREEN_WIDTH - 25, SCREEN_HEIGHT - 20, 15, COLOR_CARD_BG);
    _tft.setTextColor(COLOR_TEXT_MUTED);
    _tft.setTextDatum(MC_DATUM);
    _tft.drawString("R", SCREEN_WIDTH - 25, SCREEN_HEIGHT - 20, 2);
    addButton(SCREEN_WIDTH - 40, SCREEN_HEIGHT - 35, 30, 30, "Refresh");
}

void UIManager::showQuickBookMenu() {
    _currentState = UI_QUICK_BOOK;
    clearButtons();

    _tft.fillScreen(COLOR_BG);

    _tft.setTextColor(COLOR_TEXT);
    _tft.setTextDatum(TL_DATUM);
    _tft.drawString("Quick Book", 12, 12, 4);

    _tft.setTextColor(COLOR_TEXT_MUTED);
    _tft.drawString("Select duration", 12, 45, 2);

    int btnWidth = 145;
    int btnHeight = 50;
    int gap = 10;
    int startX = 12;
    int startY = 75;

    // Duration buttons - 2x2 grid
    drawButton(startX, startY, btnWidth, btnHeight, "15 min", COLOR_CARD_BG, COLOR_TEXT);
    addButton(startX, startY, btnWidth, btnHeight, "15");

    drawButton(startX + btnWidth + gap, startY, btnWidth, btnHeight, "30 min", COLOR_CARD_BG, COLOR_TEXT);
    addButton(startX + btnWidth + gap, startY, btnWidth, btnHeight, "30");

    drawButton(startX, startY + btnHeight + gap, btnWidth, btnHeight, "45 min", COLOR_CARD_BG, COLOR_TEXT);
    addButton(startX, startY + btnHeight + gap, btnWidth, btnHeight, "45");

    drawButton(startX + btnWidth + gap, startY + btnHeight + gap, btnWidth, btnHeight, "60 min", COLOR_CARD_BG, COLOR_TEXT);
    addButton(startX + btnWidth + gap, startY + btnHeight + gap, btnWidth, btnHeight, "60");

    // Cancel button
    drawButton(12, SCREEN_HEIGHT - 45, SCREEN_WIDTH - 24, 38, "Cancel", COLOR_DANGER, COLOR_TEXT);
    addButton(12, SCREEN_HEIGHT - 45, SCREEN_WIDTH - 24, 38, "Cancel");
}

void UIManager::showBookingConfirm(int duration) {
    _currentState = UI_BOOKING_CONFIRM;
    clearButtons();

    _tft.fillScreen(COLOR_BG);

    _tft.setTextColor(COLOR_TEXT);
    _tft.setTextDatum(TL_DATUM);
    _tft.drawString("Confirm Booking", 12, 12, 4);

    // Duration display
    drawCard(12, 55, SCREEN_WIDTH - 24, 70, COLOR_CARD_BG);
    _tft.setTextColor(COLOR_TEXT_MUTED);
    _tft.setTextDatum(MC_DATUM);
    _tft.drawString("Duration", SCREEN_WIDTH/2, 72, 2);
    _tft.setTextColor(COLOR_SUCCESS);
    _tft.drawString(String(duration) + " minutes", SCREEN_WIDTH/2, 100, 4);

    _tft.setTextColor(COLOR_TEXT_MUTED);
    _tft.drawString("Starts immediately", SCREEN_WIDTH/2, 145, 2);

    // Buttons
    int btnY = SCREEN_HEIGHT - 55;
    drawButton(12, btnY, 145, 45, "Cancel", COLOR_CARD_BG, COLOR_TEXT);
    addButton(12, btnY, 145, 45, "Cancel");

    drawButton(163, btnY, 145, 45, "Confirm", COLOR_SUCCESS, COLOR_TEXT);
    addButton(163, btnY, 145, 45, "Confirm");
}

void UIManager::showBookingResult(bool success, const String& message) {
    clearButtons();

    _tft.fillScreen(COLOR_BG);

    // Result indicator
    uint16_t indicatorColor = success ? COLOR_SUCCESS : COLOR_DANGER;
    _tft.fillCircle(SCREEN_WIDTH/2, 70, 35, indicatorColor);
    _tft.setTextColor(COLOR_TEXT);
    _tft.setTextDatum(MC_DATUM);
    _tft.drawString(success ? "OK" : "!", SCREEN_WIDTH/2, 70, 4);

    _tft.setTextColor(COLOR_TEXT);
    _tft.drawString(success ? "Booked!" : "Error", SCREEN_WIDTH/2, 125, 4);

    // Message
    _tft.setTextColor(COLOR_TEXT_MUTED);
    int y = 160;
    String msg = message;
    while (msg.length() > 0 && y < 200) {
        int maxChars = 35;
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
        y += 20;
    }

    drawButton(SCREEN_WIDTH/2 - 60, SCREEN_HEIGHT - 50, 120, 40, "OK", COLOR_PRIMARY, COLOR_TEXT);
    addButton(SCREEN_WIDTH/2 - 60, SCREEN_HEIGHT - 50, 120, 40, "OK");
}

void UIManager::showError(const String& message) {
    _currentState = UI_ERROR;
    clearButtons();

    _tft.fillScreen(COLOR_BG);

    // Error indicator
    _tft.fillCircle(SCREEN_WIDTH/2, 70, 35, COLOR_DANGER);
    _tft.setTextColor(COLOR_TEXT);
    _tft.setTextDatum(MC_DATUM);
    _tft.drawString("!", SCREEN_WIDTH/2, 70, 4);

    _tft.setTextColor(COLOR_TEXT);
    _tft.drawString("Error", SCREEN_WIDTH/2, 125, 4);

    // Message
    _tft.setTextColor(COLOR_TEXT_MUTED);
    int y = 160;
    String msg = message;
    while (msg.length() > 0 && y < 200) {
        int maxChars = 35;
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
        y += 20;
    }

    drawButton(SCREEN_WIDTH/2 - 60, SCREEN_HEIGHT - 50, 120, 40, "Retry", COLOR_PRIMARY, COLOR_TEXT);
    addButton(SCREEN_WIDTH/2 - 60, SCREEN_HEIGHT - 50, 120, 40, "Retry");
}

void UIManager::showLoading(const String& message) {
    _currentState = UI_LOADING;
    clearButtons();

    _tft.fillScreen(COLOR_BG);

    // Loading spinner area
    _tft.drawCircle(SCREEN_WIDTH/2, SCREEN_HEIGHT/2 - 20, 25, COLOR_PRIMARY);
    _tft.drawCircle(SCREEN_WIDTH/2, SCREEN_HEIGHT/2 - 20, 20, COLOR_CARD_BG);

    // Spinner dot
    _tft.fillCircle(SCREEN_WIDTH/2, SCREEN_HEIGHT/2 - 45, 5, COLOR_ACCENT);

    _tft.setTextColor(COLOR_TEXT);
    _tft.setTextDatum(MC_DATUM);
    _tft.drawString(message, SCREEN_WIDTH/2, SCREEN_HEIGHT/2 + 30, 2);
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
