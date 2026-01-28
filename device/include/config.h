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

// Colors (RGB565)
#define COLOR_BG          0x0000  // Black
#define COLOR_PRIMARY     0x4A49  // Indigo (similar to #4f46e5)
#define COLOR_SUCCESS     0x07E0  // Green
#define COLOR_DANGER      0xF800  // Red
#define COLOR_WARNING     0xFD20  // Orange
#define COLOR_TEXT        0xFFFF  // White
#define COLOR_TEXT_DARK   0x0000  // Black
#define COLOR_TEXT_MUTED  0x7BEF  // Gray
#define COLOR_CARD_BG     0x2104  // Dark gray
#define COLOR_AVAILABLE   0x07E0  // Green
#define COLOR_OCCUPIED    0xF800  // Red

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

#endif // CONFIG_H
