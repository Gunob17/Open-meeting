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

// Colors (RGB565) - Modern muted palette
#define COLOR_BG          0x1082  // Dark blue-gray (#18181b)
#define COLOR_PRIMARY     0x4A69  // Muted indigo (#4f46e5)
#define COLOR_SUCCESS     0x2D8A  // Muted teal (#2dd4bf -> softer green)
#define COLOR_DANGER      0xD186  // Muted coral (#ef4444 -> softer red)
#define COLOR_WARNING     0xDC80  // Muted amber (#f59e0b -> softer orange)
#define COLOR_TEXT        0xE71C  // Off-white (#e4e4e7)
#define COLOR_TEXT_DARK   0x1082  // Dark (#18181b)
#define COLOR_TEXT_MUTED  0x8C51  // Gray (#9ca3af)
#define COLOR_CARD_BG     0x2124  // Darker card (#27272a)
#define COLOR_AVAILABLE   0x2D8A  // Muted teal (same as success)
#define COLOR_OCCUPIED    0xD186  // Muted coral (same as danger)

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
