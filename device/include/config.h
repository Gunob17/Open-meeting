#ifndef CONFIG_H
#define CONFIG_H

// Display settings
#define SCREEN_WIDTH 320
#define SCREEN_HEIGHT 240
#define TFT_ROTATION 1  // Landscape mode

// Capacitive touch I2C pins (CST820/GT911)
#ifndef TOUCH_SDA
#define TOUCH_SDA 33
#endif
#ifndef TOUCH_SCL
#define TOUCH_SCL 32
#endif
#ifndef TOUCH_INT
#define TOUCH_INT 21
#endif
#ifndef TOUCH_RST
#define TOUCH_RST 25
#endif

// Touch I2C address (CST820 uses 0x15)
#define TOUCH_I2C_ADDR 0x15

// Colors (RGB565) - Clean modern palette
#define COLOR_BG          0x10A2  // Near black (#1a1a2e)
#define COLOR_PRIMARY     0x2A7F  // Deep blue (#2563eb)
#define COLOR_SUCCESS     0x0684  // Emerald (#059669)
#define COLOR_DANGER      0xC904  // Rose (#dc2626)
#define COLOR_WARNING     0xFBE0  // Amber (#fbbf24)
#define COLOR_TEXT        0xFFFF  // White
#define COLOR_TEXT_DARK   0x0000  // Black
#define COLOR_TEXT_MUTED  0x6B4D  // Slate gray (#6b7280)
#define COLOR_CARD_BG     0x18E3  // Charcoal (#16213e)
#define COLOR_AVAILABLE   0x0684  // Emerald (same as success)
#define COLOR_OCCUPIED    0xC904  // Rose (same as danger)
#define COLOR_ACCENT      0x4C7F  // Sky blue (#38bdf8)

// API settings
#define API_TIMEOUT 10000        // 10 seconds
#define STATUS_POLL_INTERVAL 30000  // 30 seconds
#define PING_INTERVAL 60000      // 1 minute

// Quick booking durations (minutes)
#define QUICK_BOOK_15 15
#define QUICK_BOOK_30 30
#define QUICK_BOOK_45 45
#define QUICK_BOOK_60 60

// WiFi AP settings for setup
#define WIFI_AP_NAME "MeetingRoom-Setup"
#define WIFI_AP_PASSWORD "setup1234"

// Preferences namespace
#define PREFS_NAMESPACE "meetingroom"
#define PREF_API_URL "api_url"
#define PREF_DEVICE_TOKEN "device_token"
#define PREF_TIMEZONE_OFFSET "tz_offset"

// Default timezone offset in hours (0 = UTC)
#define DEFAULT_TIMEZONE_OFFSET 0

// RGB LED pins (active LOW on CYD boards)
#define LED_RED_PIN 4
#define LED_GREEN_PIN 16
#define LED_BLUE_PIN 17

// LED brightness (0-255, but inverted for active LOW)
// 75% brightness = 25% duty cycle for active LOW = 64
#define LED_BRIGHTNESS 64

// PWM settings for LED brightness control
#define LED_PWM_FREQ 5000
#define LED_PWM_RESOLUTION 8
#define LED_RED_CHANNEL 0
#define LED_GREEN_CHANNEL 1
#define LED_BLUE_CHANNEL 2

// Screen timeout (turn off backlight after inactivity)
#define SCREEN_TIMEOUT_MS 120000  // 2 minutes

// Connection retry interval when server is unreachable
#define CONNECTION_RETRY_INTERVAL 30000  // 30 seconds

// Firmware/OTA update settings
#define FIRMWARE_CHECK_INTERVAL 300000   // 5 minutes - how often to check for updates
#define FIRMWARE_VERSION "1.0.0"         // Current firmware version - update this with each release

#endif // CONFIG_H
