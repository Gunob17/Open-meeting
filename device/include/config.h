#ifndef CONFIG_H
#define CONFIG_H

// Display settings
#define SCREEN_WIDTH 320
#define SCREEN_HEIGHT 240
#define TFT_ROTATION 1  // Landscape mode

// Touch calibration (adjust for your specific display)
#define TOUCH_MIN_X 300
#define TOUCH_MAX_X 3800
#define TOUCH_MIN_Y 300
#define TOUCH_MAX_Y 3800

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
