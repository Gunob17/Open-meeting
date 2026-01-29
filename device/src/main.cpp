#include <Arduino.h>
#include <WiFi.h>
#include <WiFiManager.h>
#include <WebServer.h>
#include <Preferences.h>
#include <TFT_eSPI.h>
#include "config.h"
#include "api_client.h"
#include "ui_manager.h"
#include "touch.h"

// Global objects
TFT_eSPI tft = TFT_eSPI();
TouchController touch;
UIManager ui(tft, touch);
ApiClient apiClient;
Preferences preferences;
WebServer server(80);
WiFiManager wifiManager;

// State variables
bool wifiConnected = false;
bool deviceConfigured = false;
bool webServerRunning = false;
unsigned long lastStatusUpdate = 0;
unsigned long lastPing = 0;
unsigned long lastTouchTime = 0;
int selectedDuration = 0;
RoomStatus currentStatus;

// Function declarations
void setupWebServer();
void handleRoot();
void handleSetup();
void handleSaveConfig();
void loadConfig();
void saveConfig();
void checkWiFi();
void updateRoomStatus();
void handleTouch();
void performQuickBook(int duration);

void setup() {
    Serial.begin(115200);
    Serial.println("\n\nMeeting Room Display Starting...");

    // Initialize capacitive touch controller
    touch.begin(TOUCH_SDA, TOUCH_SCL, TOUCH_RST, TOUCH_INT);

    // Initialize display
    ui.begin();

    // Show startup screen with instructions
    ui.showStartupScreen();
    delay(2000);  // Show instructions for 2 seconds

    // Initialize preferences
    preferences.begin(PREFS_NAMESPACE, false);

    // Load saved configuration
    loadConfig();

    // Set up WiFi Manager
    ui.showConnecting();

    // Configure WiFiManager
    wifiManager.setConfigPortalTimeout(180);  // 3 minute timeout for config portal
    wifiManager.setConnectTimeout(30);  // 30 second connection timeout
    wifiManager.setAPCallback([](WiFiManager* mgr) {
        Serial.println("Entered config portal");
        ui.showWiFiSetup(WIFI_AP_NAME, WIFI_AP_PASSWORD);
    });

    wifiManager.setSaveConfigCallback([]() {
        Serial.println("WiFi config saved, will restart...");
    });

    // Try to connect to WiFi (blocking call)
    Serial.println("Attempting WiFi connection...");
    bool connected = wifiManager.autoConnect(WIFI_AP_NAME, WIFI_AP_PASSWORD);

    if (!connected) {
        Serial.println("Failed to connect to WiFi, starting AP mode");
        ui.showWiFiSetup(WIFI_AP_NAME, WIFI_AP_PASSWORD);
        // WiFiManager will handle the config portal
        return;
    }

    // Connected to WiFi
    Serial.println("Connected to WiFi!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
    wifiConnected = true;

    // Start our own web server for device configuration
    setupWebServer();

    // Check if device is configured with API token
    if (apiClient.isConfigured()) {
        deviceConfigured = true;
        ui.showLoading("Loading room status...");
        updateRoomStatus();
    } else {
        // Show setup instructions with IP address
        Serial.println("Device not configured - showing setup screen");
        Serial.print("Configure at: http://");
        Serial.println(WiFi.localIP());
        ui.showTokenSetup(WiFi.localIP().toString());
    }
}

void loop() {
    // Handle web server requests
    if (webServerRunning) {
        server.handleClient();
    }

    // Check WiFi connection
    if (WiFi.status() != WL_CONNECTED) {
        if (wifiConnected) {
            wifiConnected = false;
            webServerRunning = false;
            ui.showError("WiFi disconnected. Restarting...");
            delay(3000);
            ESP.restart();
        }
        delay(100);
        return;
    }

    // If not configured, wait for config via web interface
    if (!deviceConfigured) {
        // Check if configured via web interface
        if (apiClient.isConfigured()) {
            deviceConfigured = true;
            ui.showLoading("Loading room status...");
            updateRoomStatus();
        }
        delay(100);
        return;
    }

    // Handle touch input
    handleTouch();

    // Periodic status update
    if (millis() - lastStatusUpdate > STATUS_POLL_INTERVAL) {
        updateRoomStatus();
    }

    // Periodic ping
    if (millis() - lastPing > PING_INTERVAL) {
        if (!apiClient.ping()) {
            Serial.println("Ping failed");
        }
        lastPing = millis();
    }

    delay(50);
}

void loadConfig() {
    String apiUrl = preferences.getString(PREF_API_URL, "");
    String token = preferences.getString(PREF_DEVICE_TOKEN, "");

    Serial.println("Loaded config - API URL: " + apiUrl);
    Serial.print("Loaded config - Token: ");
    Serial.println(token.length() > 0 ? "[present]" : "[empty]");

    apiClient.setApiUrl(apiUrl);
    apiClient.setDeviceToken(token);
}

void saveConfig() {
    preferences.putString(PREF_API_URL, apiClient.getApiUrl());
    preferences.putString(PREF_DEVICE_TOKEN, apiClient.getDeviceToken());
    Serial.println("Config saved");
}

void setupWebServer() {
    if (webServerRunning) {
        return;  // Already running
    }
    server.on("/", handleRoot);
    server.on("/setup", HTTP_GET, handleSetup);
    server.on("/save", HTTP_POST, handleSaveConfig);
    server.begin();
    webServerRunning = true;
    Serial.println("Web server started on port 80");
    Serial.print("Access at: http://");
    Serial.println(WiFi.localIP());
}

void handleRoot() {
    String html = R"(
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Meeting Room Display Setup</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f3f4f6; }
        .container { max-width: 500px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        h1 { color: #4f46e5; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        input[type="text"] { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
        button { background: #4f46e5; color: white; padding: 12px 24px; border: none; border-radius: 4px; cursor: pointer; width: 100%; font-size: 16px; }
        button:hover { background: #4338ca; }
        .info { background: #e0e7ff; padding: 10px; border-radius: 4px; margin-bottom: 15px; font-size: 14px; }
        .current { color: #6b7280; font-size: 12px; word-break: break-all; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Meeting Room Display</h1>
        <div class="info">
            Configure this device to connect to your meeting room booking system.
        </div>
        <form action="/save" method="POST">
            <div class="form-group">
                <label>API Server URL</label>
                <input type="text" name="apiUrl" placeholder="http://your-server:3001" value=")" + apiClient.getApiUrl() + R"(">
                <div class="current">Example: http://192.168.1.100:3001</div>
            </div>
            <div class="form-group">
                <label>Device Token</label>
                <input type="text" name="token" placeholder="Paste token from admin panel" value=")" + apiClient.getDeviceToken() + R"(">
                <div class="current">Get this from Admin Panel > Rooms > Devices</div>
            </div>
            <button type="submit">Save Configuration</button>
        </form>
    </div>
</body>
</html>
)";
    server.send(200, "text/html", html);
}

void handleSetup() {
    handleRoot();
}

void handleSaveConfig() {
    String apiUrl = server.arg("apiUrl");
    String token = server.arg("token");

    if (apiUrl.length() > 0 && token.length() > 0) {
        apiClient.setApiUrl(apiUrl);
        apiClient.setDeviceToken(token);
        saveConfig();

        String html = R"(
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Configuration Saved</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f3f4f6; text-align: center; }
        .container { max-width: 500px; margin: 50px auto; background: white; padding: 30px; border-radius: 8px; }
        h1 { color: #10b981; }
        p { color: #4b5563; }
    </style>
    <meta http-equiv="refresh" content="3;url=/">
</head>
<body>
    <div class="container">
        <h1>Configuration Saved!</h1>
        <p>The device will now connect to the booking system.</p>
        <p>Redirecting in 3 seconds...</p>
    </div>
</body>
</html>
)";
        server.send(200, "text/html", html);

        deviceConfigured = true;
        delay(1000);
        ui.showLoading("Connecting to server...");
        updateRoomStatus();
    } else {
        server.send(400, "text/plain", "API URL and Token are required");
    }
}

void updateRoomStatus() {
    currentStatus = apiClient.getRoomStatus();
    lastStatusUpdate = millis();

    if (currentStatus.isValid) {
        ui.showRoomStatus(currentStatus);
    } else {
        ui.showError(currentStatus.errorMessage.length() > 0 ?
                     currentStatus.errorMessage : "Failed to get room status");
    }
}

void handleTouch() {
    int touchX, touchY;

    if (!ui.getTouchPoint(touchX, touchY)) {
        return;
    }

    // Debounce
    if (millis() - lastTouchTime < 300) {
        return;
    }
    lastTouchTime = millis();

    int buttonIndex = ui.checkButtonPress(touchX, touchY);
    if (buttonIndex < 0) {
        return;
    }

    Serial.println("Button pressed: " + String(buttonIndex));

    UIState currentState = ui.getState();

    switch (currentState) {
        case UI_ROOM_STATUS:
            if (buttonIndex == 0 && currentStatus.isAvailable) {
                // Book Now button
                ui.showQuickBookMenu();
            } else if (buttonIndex == 1 || (buttonIndex == 0 && !currentStatus.isAvailable)) {
                // Refresh button
                ui.showLoading("Refreshing...");
                updateRoomStatus();
            }
            break;

        case UI_QUICK_BOOK:
            switch (buttonIndex) {
                case 0: selectedDuration = 15; break;
                case 1: selectedDuration = 30; break;
                case 2: selectedDuration = 45; break;
                case 3: selectedDuration = 60; break;
                case 4:  // Cancel
                    ui.showRoomStatus(currentStatus);
                    return;
            }
            ui.showBookingConfirm(selectedDuration);
            break;

        case UI_BOOKING_CONFIRM:
            if (buttonIndex == 0) {
                // Cancel
                ui.showQuickBookMenu();
            } else if (buttonIndex == 1) {
                // Confirm
                performQuickBook(selectedDuration);
            }
            break;

        case UI_ERROR:
            // Retry button
            ui.showLoading("Retrying...");
            updateRoomStatus();
            break;

        case UI_TOKEN_SETUP:
            if (buttonIndex == 0) {
                // Clear
                apiClient.setDeviceToken("");
                ui.showTokenSetup("");
            } else if (buttonIndex == 1) {
                // Save - handled by web interface
            }
            break;

        default:
            // For booking result, any button returns to status
            ui.showLoading("Loading...");
            updateRoomStatus();
            break;
    }
}

void performQuickBook(int duration) {
    ui.showLoading("Booking room...");

    String title = "Quick Booking";
    QuickBookResult result = apiClient.quickBook(title, duration);

    ui.showBookingResult(result.success, result.message);

    // Auto-return to status after 3 seconds
    delay(3000);
    updateRoomStatus();
}
