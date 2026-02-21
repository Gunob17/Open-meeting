#ifndef TIMEZONES_H
#define TIMEZONES_H

#include <Arduino.h>

// Timezone structure
struct TimezoneInfo {
    const char* name;           // Display name
    const char* posixString;    // POSIX timezone string with DST rules
};

// Common timezones with automatic DST handling
// Format: "STD offset DST,start/time,end/time"
const TimezoneInfo TIMEZONES[] = {
    {"UTC", "UTC0"},

    // Europe
    {"Europe/London (GMT/BST)", "GMT0BST,M3.5.0/1,M10.5.0"},
    {"Europe/Paris (CET/CEST)", "CET-1CEST,M3.5.0,M10.5.0/3"},
    {"Europe/Berlin (CET/CEST)", "CET-1CEST,M3.5.0,M10.5.0/3"},
    {"Europe/Rome (CET/CEST)", "CET-1CEST,M3.5.0,M10.5.0/3"},
    {"Europe/Athens (EET/EEST)", "EET-2EEST,M3.5.0/3,M10.5.0/4"},
    {"Europe/Helsinki (EET/EEST)", "EET-2EEST,M3.5.0/3,M10.5.0/4"},
    {"Europe/Moscow (MSK)", "MSK-3"},

    // North America
    {"America/New_York (EST/EDT)", "EST5EDT,M3.2.0,M11.1.0"},
    {"America/Chicago (CST/CDT)", "CST6CDT,M3.2.0,M11.1.0"},
    {"America/Denver (MST/MDT)", "MST7MDT,M3.2.0,M11.1.0"},
    {"America/Los_Angeles (PST/PDT)", "PST8PDT,M3.2.0,M11.1.0"},
    {"America/Anchorage (AKST/AKDT)", "AKST9AKDT,M3.2.0,M11.1.0"},
    {"Pacific/Honolulu (HST)", "HST10"},

    // Asia
    {"Asia/Dubai (GST)", "GST-4"},
    {"Asia/Kolkata (IST)", "IST-5:30"},
    {"Asia/Bangkok (ICT)", "ICT-7"},
    {"Asia/Singapore (SGT)", "SGT-8"},
    {"Asia/Hong_Kong (HKT)", "HKT-8"},
    {"Asia/Shanghai (CST)", "CST-8"},
    {"Asia/Tokyo (JST)", "JST-9"},
    {"Asia/Seoul (KST)", "KST-9"},

    // Australia
    {"Australia/Sydney (AEDT/AEST)", "AEST-10AEDT,M10.1.0,M4.1.0/3"},
    {"Australia/Melbourne (AEDT/AEST)", "AEST-10AEDT,M10.1.0,M4.1.0/3"},
    {"Australia/Brisbane (AEST)", "AEST-10"},
    {"Australia/Perth (AWST)", "AWST-8"},

    // Other
    {"Pacific/Auckland (NZDT/NZST)", "NZST-12NZDT,M9.5.0,M4.1.0/3"},
    {"America/Sao_Paulo (BRT/BRST)", "BRT3BRST,M10.3.0/0,M2.3.0/0"},
    {"Africa/Cairo (EET)", "EET-2"},
    {"Africa/Johannesburg (SAST)", "SAST-2"},
};

const int TIMEZONE_COUNT = sizeof(TIMEZONES) / sizeof(TIMEZONES[0]);

// Find timezone by POSIX string
int findTimezoneIndex(const String& posixString) {
    for (int i = 0; i < TIMEZONE_COUNT; i++) {
        if (String(TIMEZONES[i].posixString) == posixString) {
            return i;
        }
    }
    return 0; // Default to UTC
}

#endif // TIMEZONES_H
