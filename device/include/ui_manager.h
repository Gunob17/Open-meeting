#ifndef UI_MANAGER_H
#define UI_MANAGER_H

#include <Arduino.h>
#include <TFT_eSPI.h>
#include "config.h"
#include "api_client.h"

// UI States
enum UIState {
    UI_WIFI_SETUP,
    UI_TOKEN_SETUP,
    UI_ROOM_STATUS,
    UI_QUICK_BOOK,
    UI_BOOKING_CONFIRM,
    UI_ERROR,
    UI_LOADING
};

// Button structure
struct Button {
    int x, y, w, h;
    String label;
    uint16_t bgColor;
    uint16_t textColor;
    bool visible;
};

class UIManager {
public:
    UIManager(TFT_eSPI& tft);

    void begin();
    void setRotation(uint8_t rotation);

    // Screen drawing functions
    void showWiFiSetup(const String& apName, const String& apPassword);
    void showTokenSetup(const String& currentToken);
    void showRoomStatus(const RoomStatus& status);
    void showQuickBookMenu();
    void showBookingConfirm(int duration);
    void showBookingResult(bool success, const String& message);
    void showError(const String& message);
    void showLoading(const String& message);
    void showConnecting();

    // Touch handling
    bool isTouched();
    bool getTouchPoint(int& x, int& y);

    // Button handling
    int checkButtonPress(int touchX, int touchY);

    // Get current state
    UIState getState() const { return _currentState; }

    // Input handling for token setup
    void handleTokenInput(char c);
    String getTokenInput() const { return _tokenInput; }
    void clearTokenInput() { _tokenInput = ""; }

private:
    TFT_eSPI& _tft;
    UIState _currentState;
    Button _buttons[8];
    int _buttonCount;
    String _tokenInput;
    String _apiUrlInput;

    // Drawing helpers
    void drawHeader(const String& title, uint16_t bgColor = COLOR_PRIMARY);
    void drawButton(int x, int y, int w, int h, const String& label, uint16_t bgColor, uint16_t textColor);
    void drawCard(int x, int y, int w, int h, uint16_t bgColor);
    void drawCenteredText(const String& text, int y, uint8_t font = 2);
    void drawBookingCard(int y, const Booking& booking, bool isCurrent = false);
    void drawStatusIndicator(bool available);

    void clearButtons();
    void addButton(int x, int y, int w, int h, const String& label, uint16_t bgColor = COLOR_PRIMARY, uint16_t textColor = COLOR_TEXT);

    // Time formatting
    String formatTime(const String& isoTime);
    String formatTimeRange(const String& start, const String& end);
};

#endif // UI_MANAGER_H
