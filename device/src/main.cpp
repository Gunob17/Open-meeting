#include <Arduino.h>
#include <WiFi.h>
#include <WiFiManager.h>
#include <WebServer.h>
#include <Preferences.h>
#include <TFT_eSPI.h>
#include <HTTPClient.h>
#include <HTTPUpdate.h>
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
bool setupMode = false;  // True when showing setup screen after connection failure
bool screenOn = true;    // Track screen backlight state
bool connectionLost = false;  // Track if we lost connection to server
unsigned long lastStatusUpdate = 0;
unsigned long lastPing = 0;
unsigned long lastTouchTime = 0;
unsigned long lastActivityTime = 0;  // For screen timeout
unsigned long lastConnectionRetry = 0;  // For connection retry
unsigned long lastFirmwareCheck = 0;  // For firmware update checks
int selectedDuration = 0;
RoomStatus currentStatus;
RoomStatus lastStatus;

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
void setupRgbLed();
void setLedColor(bool available);
void setLedOff();
void checkScreenTimeout();
void wakeScreen();
bool roomStatusesAreEqual(RoomStatus first, RoomStatus secound);
void checkForFirmwareUpdate();
void performFirmwareUpdate(const String& version);

void setup() {
    Serial.begin(115200);
    Serial.println("\n\nOpen Meeting Display Starting...");

    // Initialize RGB LED
    setupRgbLed();
    setLedOff();  // Start with LED off

    // Initialize capacitive touch controller
    touch.begin(TOUCH_SDA, TOUCH_SCL, TOUCH_RST, TOUCH_INT);

    // Initialize display
    ui.begin();
    lastActivityTime = millis();  // Initialize activity timer

    // Show startup screen with instructions
    //ui.showStartupScreen();
    //delay(2000);  // Show instructions for 2 seconds

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

        // Report firmware version on startup
        Serial.println("Reporting firmware version: " + String(FIRMWARE_VERSION));
        apiClient.reportFirmwareVersion(FIRMWARE_VERSION);

        // Initial firmware check on startup
        lastFirmwareCheck = millis();
        checkForFirmwareUpdate();

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
            setLedOff();
            ui.showError("WiFi disconnected. Restarting...");
            delay(3000);
            ESP.restart();
        }
        delay(100);
        return;
    }

    // If in setup mode, just wait for config via web interface
    if (setupMode) {
        setLedOff();  // No LED color during setup
        delay(100);
        return;
    }

    // If not configured, wait for config via web interface
    if (!deviceConfigured) {
        setLedOff();
        delay(100);
        return;
    }

    // Handle touch input
    handleTouch();

    // Check screen timeout
    checkScreenTimeout();

    // If connection was lost, retry every 30 seconds
    if (connectionLost) {
        if (millis() - lastConnectionRetry > CONNECTION_RETRY_INTERVAL) {
            Serial.println("Retrying server connection...");
            updateRoomStatus();
            lastConnectionRetry = millis();
        }
        delay(50);
        return;
    }

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

    // Periodic firmware update check
    if (millis() - lastFirmwareCheck > FIRMWARE_CHECK_INTERVAL) {
        checkForFirmwareUpdate();
        lastFirmwareCheck = millis();
    }

    delay(50);
}

void loadConfig() {
    String apiUrl = preferences.getString(PREF_API_URL, "");
    String token = preferences.getString(PREF_DEVICE_TOKEN, "");
    int tzOffset = preferences.getInt(PREF_TIMEZONE_OFFSET, DEFAULT_TIMEZONE_OFFSET);

    Serial.println("Loaded config - API URL: " + apiUrl);
    Serial.print("Loaded config - Token: ");
    Serial.println(token.length() > 0 ? "[present]" : "[empty]");
    Serial.println("Loaded config - Timezone: UTC" + String(tzOffset >= 0 ? "+" : "") + String(tzOffset));

    apiClient.setApiUrl(apiUrl);
    apiClient.setDeviceToken(token);
    apiClient.setTimezoneOffset(tzOffset);
    ui.setTimezoneOffset(tzOffset);
}

void saveConfig() {
    preferences.putString(PREF_API_URL, apiClient.getApiUrl());
    preferences.putString(PREF_DEVICE_TOKEN, apiClient.getDeviceToken());
    preferences.putInt(PREF_TIMEZONE_OFFSET, apiClient.getTimezoneOffset());
    Serial.println("Config saved");
}

void handleReset();

void setupWebServer() {
    if (webServerRunning) {
        return;  // Already running
    }
    server.on("/", handleRoot);
    server.on("/setup", HTTP_GET, handleSetup);
    server.on("/save", HTTP_POST, handleSaveConfig);
    server.on("/reset", HTTP_POST, handleReset);
    server.begin();
    webServerRunning = true;
    Serial.println("Web server started on port 80");
    Serial.print("Access at: http://");
    Serial.println(WiFi.localIP());
}

void handleRoot() {
    int currentTz = apiClient.getTimezoneOffset();

    String html = "<!DOCTYPE html><html><head>";
    html += "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">";
    html += "<title>Open Meeting Display Setup</title>";
    html += "<style>";
    html += "body { font-family: Arial, sans-serif; margin: 20px; background: #f3f4f6; }";
    html += ".container { max-width: 500px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }";
    html += "h1 { color: #4f46e5; }";
    html += ".form-group { margin-bottom: 15px; }";
    html += "label { display: block; margin-bottom: 5px; font-weight: bold; }";
    html += "input[type=text], select { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }";
    html += "button { background: #4f46e5; color: white; padding: 12px 24px; border: none; border-radius: 4px; cursor: pointer; width: 100%; font-size: 16px; }";
    html += "button:hover { background: #4338ca; }";
    html += ".info { background: #e0e7ff; padding: 10px; border-radius: 4px; margin-bottom: 15px; font-size: 14px; }";
    html += ".current { color: #6b7280; font-size: 12px; word-break: break-all; }";
    html += "</style></head><body>";
    html += "<div class=\"container\">";
    html += "<h1>Open Meeting Display</h1>";
    html += "<div class=\"info\">Configure this device to connect to your Open Meeting system.</div>";
    html += "<form action=\"/save\" method=\"POST\">";
    html += "<div class=\"form-group\">";
    html += "<label>API Server URL</label>";
    html += "<input type=\"text\" name=\"apiUrl\" placeholder=\"http://your-server:3001\" value=\"" + apiClient.getApiUrl() + "\">";
    html += "<div class=\"current\">Example: http://192.168.1.100:3001</div>";
    html += "</div>";
    html += "<div class=\"form-group\">";
    html += "<label>Device Token</label>";
    html += "<input type=\"text\" name=\"token\" placeholder=\"Paste token from admin panel\" value=\"" + apiClient.getDeviceToken() + "\">";
    html += "<div class=\"current\">Get this from Admin Panel &gt; Rooms &gt; Devices</div>";
    html += "</div>";
    html += "<div class=\"form-group\">";
    html += "<label>Timezone</label>";
    html += "<select name=\"timezone\">";
    for (int tz = -12; tz <= 14; tz++) {
        String selected = (tz == currentTz) ? " selected" : "";
        String label = "UTC" + String(tz >= 0 ? "+" : "") + String(tz);
        html += "<option value=\"" + String(tz) + "\"" + selected + ">" + label + "</option>";
    }
    html += "</select>";
    html += "<div class=\"current\">Select your local timezone</div>";
    html += "</div>";
    html += "<button type=\"submit\">Save Configuration</button>";
    html += "</form>";
    html += "<hr style=\"margin: 20px 0; border: none; border-top: 1px solid #ddd;\">";
    html += "<form action=\"/reset\" method=\"POST\">";
    html += "<button type=\"submit\" style=\"background: #ef4444;\">Reset WiFi &amp; Config</button>";
    html += "<div class=\"current\" style=\"margin-top: 5px;\">This will clear all settings and restart the device</div>";
    html += "</form>";
    html += "</div></body></html>";

    server.send(200, "text/html", html);
}

void handleSetup() {
    handleRoot();
}

void handleReset() {
    // Clear all preferences
    preferences.clear();
    apiClient.setApiUrl("");
    apiClient.setDeviceToken("");

    String html = "<!DOCTYPE html><html><head>";
    html += "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">";
    html += "<title>Reset Complete</title>";
    html += "<style>body { font-family: Arial, sans-serif; margin: 20px; background: #f3f4f6; text-align: center; }";
    html += ".container { max-width: 500px; margin: 50px auto; background: white; padding: 30px; border-radius: 8px; }";
    html += "h1 { color: #ef4444; }</style></head><body>";
    html += "<div class=\"container\">";
    html += "<h1>Reset Complete</h1>";
    html += "<p>Device will restart and enter WiFi setup mode.</p>";
    html += "<p>Connect to: <strong>MeetingRoom-Setup</strong></p>";
    html += "</div></body></html>";

    server.send(200, "text/html", html);
    delay(2000);

    // Reset WiFiManager settings and restart
    wifiManager.resetSettings();
    ESP.restart();
}

void handleSaveConfig() {
    String apiUrl = server.arg("apiUrl");
    String token = server.arg("token");
    String tzStr = server.arg("timezone");
    int timezone = tzStr.length() > 0 ? tzStr.toInt() : 0;

    if (apiUrl.length() > 0 && token.length() > 0) {
        apiClient.setApiUrl(apiUrl);
        apiClient.setDeviceToken(token);
        apiClient.setTimezoneOffset(timezone);
        ui.setTimezoneOffset(timezone);
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

        setupMode = false;  // Exit setup mode to try new config
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
        setupMode = false;  // Connection successful, exit setup mode
        connectionLost = false;  // Connection restored
        // Always show room status to ensure we exit loading screens
        // The UI will handle avoiding unnecessary redraws internally
        ui.showRoomStatus(currentStatus);
        lastStatus = currentStatus;
        // Update LED based on room availability
        setLedColor(currentStatus.isAvailable);
    } else {
        // Check if this is a first-time setup (no config) or connection lost
        if (!apiClient.isConfigured()) {
            // Device has no config at all - show setup screen
            deviceConfigured = false;
            setupMode = true;
            setLedOff();
            Serial.println("Device not configured - showing setup screen");
            Serial.print("Configure at: http://");
            Serial.println(WiFi.localIP());
            ui.showTokenSetup(WiFi.localIP().toString());
        } else {
            // Device is configured but can't reach server - show error and retry
            connectionLost = true;
            lastConnectionRetry = millis();
            setLedOff();
            String errorMsg = currentStatus.errorMessage.length() > 0 ?
                             currentStatus.errorMessage : "Cannot reach server";
            errorMsg += "\n\nRetrying in 30s...";
            Serial.println("Connection lost - will retry in 30 seconds");
            ui.showError(errorMsg);
        }
    }
}

void handleTouch() {
    int touchX, touchY;

    if (!ui.getTouchPoint(touchX, touchY)) {
        return;
    }

    // Any touch wakes the screen and resets activity timer
    lastActivityTime = millis();

    // If screen was off, wake it up first
    if (!screenOn) {
        wakeScreen();
        // Debounce - don't process this touch as a button press
        lastTouchTime = millis();
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
                ui.showQuickBookMenu(currentStatus);
            } else if (buttonIndex == 1 || (buttonIndex == 0 && !currentStatus.isAvailable)) {
                // Refresh button
                ui.showLoading("Refreshing...");
                updateRoomStatus();
            }
            break;

        case UI_QUICK_BOOK:
            // Button indices 0-3 are duration buttons, 4 is cancel
            if (buttonIndex >= 0 && buttonIndex < ui.getQuickBookDurationCount()) {
                selectedDuration = ui.getQuickBookDuration(buttonIndex);
                ui.showBookingConfirm(selectedDuration);
            } else if (buttonIndex == ui.getQuickBookDurationCount()) {
                // Cancel button (after duration buttons)
                ui.showRoomStatus(currentStatus);
            }
            break;

        case UI_BOOKING_CONFIRM:
            if (buttonIndex == 0) {
                // Cancel - go back to quick book menu
                ui.showQuickBookMenu(currentStatus);
            } else if (buttonIndex == 1) {
                // Confirm
                performQuickBook(selectedDuration);
            }
            break;

        case UI_ERROR:
            // Retry button - immediately try to reconnect
            connectionLost = false;  // Reset connection lost flag
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

// RGB LED functions (active LOW on CYD boards)
// RGB LED functions using PWM for brightness control (active LOW on CYD boards)
void setupRgbLed() {
    // Set up PWM channels for each LED color
    ledcSetup(LED_RED_CHANNEL, LED_PWM_FREQ, LED_PWM_RESOLUTION);
    ledcSetup(LED_GREEN_CHANNEL, LED_PWM_FREQ, LED_PWM_RESOLUTION);
    ledcSetup(LED_BLUE_CHANNEL, LED_PWM_FREQ, LED_PWM_RESOLUTION);

    // Attach pins to PWM channels
    ledcAttachPin(LED_RED_PIN, LED_RED_CHANNEL);
    ledcAttachPin(LED_GREEN_PIN, LED_GREEN_CHANNEL);
    ledcAttachPin(LED_BLUE_PIN, LED_BLUE_CHANNEL);

    // Turn all off (255 = off for active LOW)
    ledcWrite(LED_RED_CHANNEL, 255);
    ledcWrite(LED_GREEN_CHANNEL, 255);
    ledcWrite(LED_BLUE_CHANNEL, 255);
}

void setLedColor(bool available) {
    if (available) {
        // Green for available (at reduced 75% brightness)
        ledcWrite(LED_RED_CHANNEL, 255);              // Off
        ledcWrite(LED_GREEN_CHANNEL, LED_BRIGHTNESS); // On at 75% brightness
        ledcWrite(LED_BLUE_CHANNEL, 255);             // Off
    } else {
        // Red for occupied (at reduced 75% brightness)
        ledcWrite(LED_RED_CHANNEL, LED_BRIGHTNESS);   // On at 75% brightness
        ledcWrite(LED_GREEN_CHANNEL, 255);            // Off
        ledcWrite(LED_BLUE_CHANNEL, 255);             // Off
    }
}

void setLedOff() {
    ledcWrite(LED_RED_CHANNEL, 255);
    ledcWrite(LED_GREEN_CHANNEL, 255);
    ledcWrite(LED_BLUE_CHANNEL, 255);
}

// Screen timeout functions
void checkScreenTimeout() {
    if (!screenOn) {
        return;  // Already off
    }

    if (millis() - lastActivityTime > SCREEN_TIMEOUT_MS) {
        // Turn off backlight but keep LED showing status
        screenOn = false;
        ui.setBacklight(false);
        Serial.println("Screen timeout - backlight off");
    }
}

void wakeScreen() {
    if (!screenOn) {
        screenOn = true;
        ui.setBacklight(true);
        Serial.println("Screen wake - backlight on");
        // Refresh the display
        if (currentStatus.isValid) {
            ui.showRoomStatus(currentStatus);
        }
    }
    lastActivityTime = millis();
}

bool roomStatusesAreEqual(RoomStatus first, RoomStatus secound){

    if (first.isAvailable != secound.isValid){
        return false;
    }
    else if(first.upcomingCount != secound.upcomingCount){
        return false;
    }
    else if(first.room.name != secound.room.name){
        return false;
    }
    else if(first.upcomingBookings[0].id != secound.upcomingBookings[0].id
        || first.upcomingBookings[1].id != secound.upcomingBookings[1].id
        || first.upcomingBookings[2].id != secound.upcomingBookings[2].id ){
            return false;
        }
    return true;

}

// Firmware OTA update functions
void checkForFirmwareUpdate() {
    Serial.println("Checking for firmware updates...");
    Serial.println("Current version: " + String(FIRMWARE_VERSION));

    // Report current version to server
    apiClient.reportFirmwareVersion(FIRMWARE_VERSION);

    // Check if update is available
    FirmwareUpdateResult result = apiClient.checkForFirmwareUpdate();

    if (result.updateAvailable && result.firmware.isValid) {
        Serial.println("Firmware update available!");
        Serial.println("  Current: " + String(FIRMWARE_VERSION));
        Serial.println("  New: " + result.firmware.version);
        Serial.println("  Size: " + String(result.firmware.size) + " bytes");

        // Perform the update
        performFirmwareUpdate(result.firmware.version);
    } else {
        Serial.println("No firmware update available");
    }
}

void performFirmwareUpdate(const String& version) {
    Serial.println("Starting firmware update to version " + version);

    // Show update screen
    ui.showLoading("Updating firmware...\nv" + String(FIRMWARE_VERSION) + " -> v" + version + "\n\nDo not power off!");

    // Turn LED blue during update
    ledcWrite(LED_RED_CHANNEL, 255);
    ledcWrite(LED_GREEN_CHANNEL, 255);
    ledcWrite(LED_BLUE_CHANNEL, LED_BRIGHTNESS);

    // Get the download URL
    String updateUrl = apiClient.getFirmwareDownloadUrl(version);
    Serial.println("Download URL: " + updateUrl);

    // Configure HTTP client for update with authentication header
    WiFiClient client;
    HTTPClient http;
    http.begin(client, updateUrl);
    http.addHeader("X-Device-Token", apiClient.getDeviceToken());

    // Set up HTTPUpdate callbacks
    httpUpdate.onStart([]() {
        Serial.println("OTA Update Started");
    });

    httpUpdate.onEnd([]() {
        Serial.println("OTA Update Complete");
    });

    httpUpdate.onProgress([](int cur, int total) {
        Serial.printf("OTA Progress: %d%%\n", (cur * 100) / total);
    });

    httpUpdate.onError([](int error) {
        Serial.printf("OTA Error[%d]: %s\n", error, httpUpdate.getLastErrorString().c_str());
    });

    // Perform the update with the authenticated HTTP client
    httpUpdate.rebootOnUpdate(false);  // We'll handle reboot ourselves

    t_httpUpdate_return ret = httpUpdate.update(http);

    switch (ret) {
        case HTTP_UPDATE_FAILED:
            Serial.printf("HTTP_UPDATE_FAILED Error (%d): %s\n",
                         httpUpdate.getLastError(),
                         httpUpdate.getLastErrorString().c_str());
            ui.showError("Update failed!\n\n" + httpUpdate.getLastErrorString());
            setLedOff();
            delay(5000);
            // Return to normal operation
            if (currentStatus.isValid) {
                ui.showRoomStatus(currentStatus);
                setLedColor(currentStatus.isAvailable);
            }
            break;

        case HTTP_UPDATE_NO_UPDATES:
            Serial.println("HTTP_UPDATE_NO_UPDATES");
            ui.showError("No update available");
            delay(3000);
            if (currentStatus.isValid) {
                ui.showRoomStatus(currentStatus);
                setLedColor(currentStatus.isAvailable);
            }
            break;

        case HTTP_UPDATE_OK:
            Serial.println("HTTP_UPDATE_OK - Rebooting...");
            ui.showLoading("Update complete!\n\nRebooting...");
            delay(2000);
            ESP.restart();
            break;
    }
}
