#include <Arduino.h>
#include <WiFi.h>
#include <WiFiManager.h>
#include <WebServer.h>
#include <Preferences.h>
#include <TFT_eSPI.h>
#include <HTTPClient.h>
#include <HTTPUpdate.h>
#include <time.h>
#include "config.h"
#include "timezones.h"
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
bool forceRedraw = true;  // Force redraw on next status update (e.g., after loading)
bool safeMode = false;    // Safe mode after boot loop detection
unsigned long lastStatusUpdate = 0;
unsigned long lastPing = 0;
unsigned long lastTouchTime = 0;
unsigned long lastActivityTime = 0;  // For screen timeout
unsigned long lastConnectionRetry = 0;  // For connection retry
unsigned long lastFirmwareCheck = 0;  // For firmware update checks
unsigned long wifiLostTime = 0;       // When WiFi was first lost
int wifiRetryCount = 0;               // WiFi reconnection attempts
int selectedDuration = 0;
RoomStatus currentStatus;
RoomStatus lastStatus;

// Web authentication
String sessionToken = "";
const String SESSION_COOKIE_NAME = "ESPSESSIONID";
String currentSetupPin = SETUP_PIN;  // Current PIN, loaded from preferences or default

// Function declarations
void setupWebServer();
void handleRoot();
void handleSetup();
void handleSaveConfig();
void handleLogin();
void handleLoginPost();
void handleLogout();
bool isAuthenticated();
String maskToken(const String& token);
void loadConfig();
void saveConfig();
void initTimeSync(const String& timezone);
void checkWiFi();
void updateRoomStatus();
void handleTouch();
void performQuickBook(int duration);
void setupRgbLed();
void setLedColor(bool available);
void setLedOff();
void checkScreenTimeout();
void wakeScreen();
bool roomStatusesAreEqual(const RoomStatus& first, const RoomStatus& second);
void checkForFirmwareUpdate();
void performFirmwareUpdate(const String& version);

// Boot loop detection - returns true if device should enter safe mode
bool checkBootLoop() {
    unsigned long now = millis() / 1000;  // seconds since boot (approximate)
    int bootCount = preferences.getInt(PREF_BOOT_COUNT, 0);
    unsigned long lastBootTime = preferences.getULong(PREF_BOOT_TIME, 0);

    // Use a simple heuristic: if we've rebooted BOOT_LOOP_THRESHOLD times
    // and the boot count hasn't been cleared (which happens after stable run),
    // we're probably in a boot loop
    if (bootCount >= BOOT_LOOP_THRESHOLD) {
        Serial.printf("Boot loop detected! (%d rapid reboots)\n", bootCount);
        // Reset counter so next manual reboot starts fresh
        preferences.putInt(PREF_BOOT_COUNT, 0);
        return true;
    }

    // Increment boot counter
    preferences.putInt(PREF_BOOT_COUNT, bootCount + 1);
    preferences.putULong(PREF_BOOT_TIME, now);

    Serial.printf("Boot count: %d/%d\n", bootCount + 1, BOOT_LOOP_THRESHOLD);
    return false;
}

// Call this after device is running stably to reset boot counter
void clearBootCount() {
    preferences.putInt(PREF_BOOT_COUNT, 0);
}

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

    // Initialize preferences
    preferences.begin(PREFS_NAMESPACE, false);

    // Check for boot loop before doing anything that might crash
    safeMode = checkBootLoop();

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

    // In safe mode, skip API calls that might crash
    if (safeMode) {
        Serial.println("SAFE MODE - skipping API init, only web server active");
        Serial.print("Configure at: http://");
        Serial.println(WiFi.localIP());
        ui.showError("Safe mode (boot loop detected)\n\nConfigure at:\nhttp://" + WiFi.localIP().toString());
        return;
    }

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

        // Device booted successfully - clear boot loop counter
        clearBootCount();
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
            // WiFi just dropped - start tracking
            wifiConnected = false;
            wifiLostTime = millis();
            wifiRetryCount = 0;
            webServerRunning = false;
            setLedOff();
            Serial.println("WiFi disconnected - attempting reconnection...");
            ui.showError("WiFi disconnected\n\nReconnecting...");
            WiFi.reconnect();
        } else if (millis() - wifiLostTime > 60000) {
            // WiFi has been down for over 60 seconds - restart
            Serial.println("WiFi down for 60s - restarting");
            ESP.restart();
        } else if (wifiRetryCount < 5 && millis() - wifiLostTime > (unsigned long)(wifiRetryCount + 1) * 10000) {
            // Retry reconnection every 10 seconds, up to 5 times
            wifiRetryCount++;
            Serial.printf("WiFi reconnect attempt %d/5\n", wifiRetryCount);
            WiFi.reconnect();
        }
        delay(100);
        return;
    }

    // WiFi just reconnected after being lost
    if (!wifiConnected) {
        wifiConnected = true;
        wifiRetryCount = 0;
        Serial.println("WiFi reconnected!");
        setupWebServer();
        forceRedraw = true;
        if (deviceConfigured) {
            ui.showLoading("Reconnected! Loading...");
            updateRoomStatus();
        }
    }

    // In safe mode, only handle web server
    if (safeMode) {
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
            forceRedraw = true;  // Force redraw after connection retry
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
    String timezone = preferences.getString(PREF_TIMEZONE, DEFAULT_TIMEZONE);
    currentSetupPin = preferences.getString(PREF_SETUP_PIN, SETUP_PIN);

    Serial.println("Loaded config - API URL: " + apiUrl);
    Serial.print("Loaded config - Token: ");
    Serial.println(token.length() > 0 ? "[present]" : "[empty]");
    Serial.println("Loaded config - Timezone: " + timezone);
    Serial.println("Loaded config - Setup PIN: " + String(currentSetupPin.length() > 0 ? "[set]" : "[default]"));

    apiClient.setApiUrl(apiUrl);
    apiClient.setDeviceToken(token);

    // Set timezone on UI manager for time formatting
    ui.setTimezone(timezone);

    // Initialize NTP time sync with timezone
    if (WiFi.status() == WL_CONNECTED) {
        initTimeSync(timezone);
    }
}

void saveConfig() {
    preferences.putString(PREF_API_URL, apiClient.getApiUrl());
    preferences.putString(PREF_DEVICE_TOKEN, apiClient.getDeviceToken());
    Serial.println("Config saved");
}

void initTimeSync(const String& timezoneStr) {
    Serial.println("Initializing NTP time sync...");
    Serial.println("Timezone: " + timezoneStr);

    // Set timezone with DST rules FIRST
    setenv("TZ", timezoneStr.c_str(), 1);
    tzset();

    // Configure time with NTP servers
    configTime(0, 0, NTP_SERVER1, NTP_SERVER2, NTP_SERVER3);

    // Wait for time to be set with longer timeout
    Serial.print("Waiting for NTP time sync");
    int retries = 0;
    time_t now = 0;
    struct tm timeinfo = {0};

    while (timeinfo.tm_year < (2024 - 1900) && retries < 40) {  // Increased to 20 seconds
        delay(500);
        time(&now);
        localtime_r(&now, &timeinfo);
        Serial.print(".");
        retries++;
    }
    Serial.println();

    if (timeinfo.tm_year >= (2024 - 1900)) {
        Serial.println("NTP time synced successfully!");
        char timeStr[64];
        strftime(timeStr, sizeof(timeStr), "%Y-%m-%d %H:%M:%S %Z", &timeinfo);
        Serial.println("Current time: " + String(timeStr));
    } else {
        Serial.println("Failed to sync NTP time - will retry in background");
    }
}

void handleReset();

// Authentication helper functions
bool isAuthenticated() {
    // Check if the session token matches (from URL parameter or cookie)
    if (sessionToken.length() == 0) {
        Serial.println("Auth check: No session token set");
        return false;  // No active session
    }

    // First check URL parameter (more reliable on ESP32)
    String urlToken = server.arg("session");
    if (urlToken.length() > 0) {
        Serial.println("Auth check - Expected: " + sessionToken);
        Serial.println("Auth check - Received (URL): " + urlToken);
        bool authenticated = urlToken == sessionToken;
        Serial.println("Auth result: " + String(authenticated ? "PASS" : "FAIL"));
        return authenticated;
    }

    // Fallback to cookie check
    String cookie = server.header("Cookie");
    String sessionCookie = SESSION_COOKIE_NAME + "=" + sessionToken;
    Serial.println("Auth check - Expected: " + sessionCookie);
    Serial.println("Auth check - Received (Cookie): " + cookie);
    bool authenticated = cookie.indexOf(sessionCookie) >= 0;
    Serial.println("Auth result: " + String(authenticated ? "PASS" : "FAIL"));

    return authenticated;
}

String generateSessionToken() {
    // Generate a simple random token
    String token = "";
    for (int i = 0; i < 32; i++) {
        token += String(random(0, 16), HEX);
    }
    return token;
}

String maskToken(const String& token) {
    // Show only first 4 and last 4 characters
    if (token.length() <= 8) {
        return "****";
    }
    return token.substring(0, 4) + "..." + token.substring(token.length() - 4);
}

void setupWebServer() {
    if (webServerRunning) {
        return;  // Already running
    }
    server.on("/", handleRoot);
    server.on("/login", HTTP_GET, handleLogin);
    server.on("/login", HTTP_POST, handleLoginPost);
    server.on("/logout", HTTP_POST, handleLogout);
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
    // Check authentication
    if (!isAuthenticated()) {
        server.sendHeader("Location", "/login");
        server.send(303, "text/plain", "Redirecting to login...");
        return;
    }

    String currentTimezone = preferences.getString(PREF_TIMEZONE, DEFAULT_TIMEZONE);
    String currentToken = apiClient.getDeviceToken();
    bool hasToken = currentToken.length() > 0;

    // Get current time info for display
    time_t now;
    struct tm timeinfo;
    time(&now);
    localtime_r(&now, &timeinfo);
    char timeStr[64];
    strftime(timeStr, sizeof(timeStr), "%Y-%m-%d %H:%M:%S %Z", &timeinfo);

    // Check if time is synced (year should be >= 2024)
    bool timeIsSynced = (timeinfo.tm_year >= (2024 - 1900));

    // If time is not synced and WiFi is connected, trigger sync
    if (!timeIsSynced && WiFi.status() == WL_CONNECTED) {
        Serial.println("Time not synced, triggering NTP sync...");
        initTimeSync(currentTimezone);
    }

    // Use chunked transfer to avoid building massive string in heap
    server.setContentLength(CONTENT_LENGTH_UNKNOWN);
    server.send(200, "text/html; charset=UTF-8", "");

    // Send head and styles
    server.sendContent("<!DOCTYPE html><html><head>"
        "<meta charset=\"UTF-8\">"
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
        "<title>Open Meeting Display Setup</title>"
        "<style>"
        "body{font-family:Arial,sans-serif;margin:20px;background:#f3f4f6}"
        ".container{max-width:500px;margin:0 auto;background:#fff;padding:20px;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,.1)}"
        "h1{color:#4f46e5}"
        ".form-group{margin-bottom:15px}"
        "label{display:block;margin-bottom:5px;font-weight:bold}"
        "input[type=text],input[type=password],select{width:100%;padding:10px;border:1px solid #ddd;border-radius:4px;box-sizing:border-box}"
        "button{background:#4f46e5;color:#fff;padding:12px 24px;border:none;border-radius:4px;cursor:pointer;width:100%;font-size:16px}"
        "button:hover{background:#4338ca}"
        ".info{background:#e0e7ff;padding:10px;border-radius:4px;margin-bottom:15px;font-size:14px}"
        ".current{color:#6b7280;font-size:12px;word-break:break-all}"
        ".logout{background:#6b7280;margin-top:10px}"
        ".logout:hover{background:#4b5563}"
        ".masked{font-family:monospace;color:#059669}"
        ".time-display{background:#f0fdf4;color:#166534;padding:8px;border-radius:4px;font-size:13px;margin-bottom:15px;text-align:center;font-family:monospace}"
        ".time-warning{background:#fef3c7;color:#92400e;padding:8px;border-radius:4px;font-size:13px;margin-bottom:15px;text-align:center}"
        "</style></head><body>"
        "<div class=\"container\">"
        "<h1>Open Meeting Display</h1>"
        "<div class=\"info\">Configure this device to connect to your Open Meeting system.</div>");

    // Time display
    if (timeIsSynced) {
        server.sendContent("<div class=\"time-display\">Current time: " + String(timeStr) + "</div>");
    } else {
        server.sendContent("<div class=\"time-warning\">Time not synced - NTP sync in progress...<br><small>Refresh page in a few seconds</small></div>");
    }

    // Form start
    server.sendContent("<form action=\"/save?session=" + sessionToken + "\" method=\"POST\">"
        "<input type=\"hidden\" name=\"session\" value=\"" + sessionToken + "\">"
        "<div class=\"form-group\">"
        "<label>API Server URL</label>"
        "<input type=\"text\" name=\"apiUrl\" placeholder=\"http://your-server:3001\" value=\"" + apiClient.getApiUrl() + "\">"
        "<div class=\"current\">Example: http://192.168.1.100:3001</div>"
        "</div>"
        "<div class=\"form-group\">"
        "<label>Device Token</label>");

    if (hasToken) {
        server.sendContent("<div class=\"current masked\">Current token: " + maskToken(currentToken) + "</div>"
            "<input type=\"password\" name=\"token\" placeholder=\"Enter new token (leave empty to keep current)\">");
    } else {
        server.sendContent("<input type=\"password\" name=\"token\" placeholder=\"Paste token from admin panel\">");
    }

    server.sendContent("<div class=\"current\">Get this from Admin Panel &gt; Rooms &gt; Devices</div>"
        "</div>"
        "<div class=\"form-group\">"
        "<label>Timezone (with automatic DST)</label>"
        "<select name=\"timezone\">");

    // Send timezone options one at a time to avoid heap buildup
    for (int i = 0; i < TIMEZONE_COUNT; i++) {
        String selected = (String(TIMEZONES[i].posixString) == currentTimezone) ? " selected" : "";
        server.sendContent("<option value=\"" + String(TIMEZONES[i].posixString) + "\"" + selected + ">" + String(TIMEZONES[i].name) + "</option>");
    }

    server.sendContent("</select>"
        "<div class=\"current\">Automatically adjusts for daylight saving time</div>"
        "</div>"
        "<div class=\"form-group\">"
        "<label>Setup PIN (optional)</label>"
        "<input type=\"password\" name=\"newpin\" placeholder=\"Enter new PIN (leave empty to keep current)\">"
        "<div class=\"current\">Change the PIN required to access this setup page</div>"
        "</div>"
        "<button type=\"submit\">Save Configuration</button>"
        "</form>");

    // Reset and logout forms
    server.sendContent("<hr style=\"margin:20px 0;border:none;border-top:1px solid #ddd\">"
        "<form action=\"/reset?session=" + sessionToken + "\" method=\"POST\">"
        "<input type=\"hidden\" name=\"session\" value=\"" + sessionToken + "\">"
        "<button type=\"submit\" style=\"background:#ef4444\">Reset WiFi &amp; Config</button>"
        "<div class=\"current\" style=\"margin-top:5px\">This will clear all settings and restart the device</div>"
        "</form>"
        "<form action=\"/logout?session=" + sessionToken + "\" method=\"POST\">"
        "<input type=\"hidden\" name=\"session\" value=\"" + sessionToken + "\">"
        "<button type=\"submit\" class=\"logout\">Logout</button>"
        "</form>"
        "</div></body></html>");

    // End chunked transfer
    server.sendContent("");
}

void handleSetup() {
    // Check authentication before showing setup
    if (!isAuthenticated()) {
        server.sendHeader("Location", "/login");
        server.send(303, "text/plain", "Redirecting to login...");
        return;
    }
    handleRoot();
}

void handleLogin() {
    String html = "<!DOCTYPE html><html><head>";
    html += "<meta charset=\"UTF-8\">";
    html += "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">";
    html += "<title>Device Login</title>";
    html += "<style>";
    html += "body { font-family: Arial, sans-serif; margin: 20px; background: #f3f4f6; display: flex; align-items: center; justify-content: center; min-height: 100vh; }";
    html += ".container { max-width: 400px; width: 100%; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }";
    html += "h1 { color: #4f46e5; text-align: center; margin-bottom: 10px; }";
    html += ".subtitle { text-align: center; color: #6b7280; margin-bottom: 30px; font-size: 14px; }";
    html += ".form-group { margin-bottom: 20px; }";
    html += "label { display: block; margin-bottom: 8px; font-weight: bold; color: #374151; }";
    html += "input[type=password] { width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 6px; box-sizing: border-box; font-size: 16px; }";
    html += "input[type=password]:focus { outline: none; border-color: #4f46e5; }";
    html += "button { background: #4f46e5; color: white; padding: 14px 24px; border: none; border-radius: 6px; cursor: pointer; width: 100%; font-size: 16px; font-weight: bold; }";
    html += "button:hover { background: #4338ca; }";
    html += ".error { background: #fee2e2; color: #991b1b; padding: 12px; border-radius: 6px; margin-bottom: 20px; font-size: 14px; }";
    html += ".info { background: #e0e7ff; color: #3730a3; padding: 12px; border-radius: 6px; margin-top: 20px; font-size: 12px; }";
    html += "</style></head><body>";
    html += "<div class=\"container\">";
    html += "<h1>🔒 Device Setup</h1>";
    html += "<div class=\"subtitle\">Enter PIN to continue</div>";

    // Show error if there's an error parameter
    if (server.hasArg("error")) {
        html += "<div class=\"error\">❌ Invalid PIN. Please try again.</div>";
    }

    html += "<form action=\"/login\" method=\"POST\">";
    html += "<div class=\"form-group\">";
    html += "<label>Setup PIN</label>";
    html += "<input type=\"password\" name=\"pin\" placeholder=\"Enter PIN\" required autofocus>";
    html += "</div>";
    html += "<button type=\"submit\">Login</button>";
    html += "</form>";

    // Only show default PIN if it hasn't been changed
    if (currentSetupPin == SETUP_PIN) {
        html += "<div class=\"info\">💡 Default PIN: " + String(SETUP_PIN) + "<br>Change it after logging in!</div>";
    }

    html += "</div></body></html>";

    server.send(200, "text/html; charset=UTF-8", html);
}

void handleLoginPost() {
    String pin = server.arg("pin");

    if (pin == currentSetupPin) {
        // Generate session token
        sessionToken = generateSessionToken();

        Serial.println("Setup page login successful");
        Serial.println("Session token: " + sessionToken);

        // Build success response with JavaScript redirect including session token
        String html = "<!DOCTYPE html><html><head>";
        html += "<meta charset=\"UTF-8\">";
        html += "<title>Login Successful</title>";
        html += "<style>body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }</style>";
        html += "<script>";
        // Also try to set cookie as backup
        html += "document.cookie = '" + SESSION_COOKIE_NAME + "=" + sessionToken + "; path=/; max-age=3600';";
        // Redirect with session token in URL (more reliable on ESP32)
        html += "setTimeout(function() { window.location.href = '/?session=" + sessionToken + "'; }, 500);";
        html += "</script>";
        html += "</head><body>";
        html += "<h2>✅ Login successful!</h2>";
        html += "<p>Redirecting to setup page...</p>";
        html += "</body></html>";

        server.sendHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        server.send(200, "text/html; charset=UTF-8", html);
    } else {
        // Invalid PIN - redirect back to login with error
        Serial.println("Setup page login failed - invalid PIN");

        String html = R"(
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Login Failed</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; color: #dc2626; }
    </style>
    <script>
        setTimeout(function() {
            window.location.href = '/login?error=1';
        }, 1500);
    </script>
</head>
<body>
    <h2>❌ Invalid PIN</h2>
    <p>Redirecting back to login...</p>
</body>
</html>
)";
        server.send(200, "text/html; charset=UTF-8", html);
    }
}

void handleLogout() {
    // Clear session token
    sessionToken = "";

    Serial.println("Setup page logout");

    // Send HTML with JavaScript to clear cookie and redirect
    String html = "<!DOCTYPE html><html><head>";
    html += "<meta charset=\"UTF-8\">";
    html += "<title>Logging Out</title>";
    html += "<script>";
    html += "document.cookie = '" + SESSION_COOKIE_NAME + "=; path=/; max-age=0';";
    html += "window.location.href = '/login';";
    html += "</script>";
    html += "</head><body><p>Logging out...</p></body></html>";

    server.send(200, "text/html; charset=UTF-8", html);
}

void handleReset() {
    // Check authentication
    if (!isAuthenticated()) {
        server.send(401, "text/plain", "Unauthorized");
        return;
    }

    // Clear all preferences
    preferences.clear();
    apiClient.setApiUrl("");
    apiClient.setDeviceToken("");

    String html = "<!DOCTYPE html><html><head>";
    html += "<meta charset=\"UTF-8\">";
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

    server.send(200, "text/html; charset=UTF-8", html);
    delay(2000);

    // Reset WiFiManager settings and restart
    wifiManager.resetSettings();
    ESP.restart();
}

void handleSaveConfig() {
    // Check authentication
    if (!isAuthenticated()) {
        server.send(401, "text/plain", "Unauthorized");
        return;
    }

    String apiUrl = server.arg("apiUrl");
    String token = server.arg("token");
    String timezone = server.arg("timezone");
    String newPin = server.arg("newpin");

    // Validate API URL is provided
    if (apiUrl.length() == 0) {
        server.send(400, "text/plain", "API URL is required");
        return;
    }

    // If token is empty but we have a current token, keep the current one
    String currentToken = apiClient.getDeviceToken();
    if (token.length() == 0 && currentToken.length() > 0) {
        token = currentToken;
    }

    // Now check if we have a token
    if (token.length() == 0) {
        server.send(400, "text/plain", "Device token is required");
        return;
    }

    // Default to UTC if no timezone provided
    if (timezone.length() == 0) {
        timezone = DEFAULT_TIMEZONE;
    }

    // Update PIN if provided
    if (newPin.length() > 0) {
        if (newPin.length() < 4) {
            server.send(400, "text/plain", "PIN must be at least 4 characters");
            return;
        }
        currentSetupPin = newPin;
        preferences.putString(PREF_SETUP_PIN, newPin);
        Serial.println("Setup PIN updated");
    }

    apiClient.setApiUrl(apiUrl);
    apiClient.setDeviceToken(token);

    // Save timezone preference
    preferences.putString(PREF_TIMEZONE, timezone);
    saveConfig();

    // Set timezone on UI manager for time formatting
    ui.setTimezone(timezone);

    // Update time sync with new timezone
    initTimeSync(timezone);

    String html = R"(
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
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
        <h1>✅ Configuration Saved!</h1>
        <p>The device will now connect to the booking system.</p>
        <p>Redirecting in 3 seconds...</p>
    </div>
</body>
</html>
)";
    server.send(200, "text/html; charset=UTF-8", html);

    setupMode = false;  // Exit setup mode to try new config
    deviceConfigured = true;
    delay(1000);
    ui.showLoading("Connecting to server...");
    forceRedraw = true;  // Force redraw after loading screen
    updateRoomStatus();
}

void updateRoomStatus() {
    currentStatus = apiClient.getRoomStatus();
    lastStatusUpdate = millis();

    if (currentStatus.isValid) {
        setupMode = false;  // Connection successful, exit setup mode
        connectionLost = false;  // Connection restored
        clearBootCount();  // Device is running stably

        // Only redraw if status changed or forced (e.g., coming from loading screen)
        if (forceRedraw || !roomStatusesAreEqual(currentStatus, lastStatus)) {
            Serial.println("Status changed or forced redraw - updating display");
            ui.showRoomStatus(currentStatus);
            forceRedraw = false;
        } else {
            Serial.println("Status unchanged - skipping redraw");
        }

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
                forceRedraw = true;  // Force redraw after manual refresh
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
            forceRedraw = true;  // Force redraw after retry
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
            forceRedraw = true;  // Force redraw after loading screen
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
    forceRedraw = true;  // Force redraw after booking result
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

bool roomStatusesAreEqual(const RoomStatus& first, const RoomStatus& second) {
    // Both must be valid to compare
    if (!first.isValid || !second.isValid) {
        return false;
    }

    // Compare availability
    if (first.isAvailable != second.isAvailable) {
        return false;
    }

    // Compare room name
    if (first.room.name != second.room.name) {
        return false;
    }

 

    // Compare upcoming bookings count
    if (first.upcomingCount != second.upcomingCount) {
        return false;
    }

    // Compare upcoming booking IDs
    for (int i = 0; i < first.upcomingCount && i < 3; i++) {
        if (first.upcomingBookings[i].id != second.upcomingBookings[i].id) {
            return false;
        }
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
