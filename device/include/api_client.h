#ifndef API_CLIENT_H
#define API_CLIENT_H

#include <Arduino.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// Booking structure
struct Booking {
    String id;
    String title;
    String startTime;
    String endTime;
    bool isValid;
};

// Room structure
struct Room {
    String id;
    String name;
    int capacity;
    String floor;
    int quickBookDurations[4];  // Up to 4 quick booking durations
    int quickBookDurationCount;
    bool isValid;
};

// Room status structure
struct RoomStatus {
    Room room;
    bool isAvailable;
    Booking currentBooking;
    Booking upcomingBookings[3];
    int upcomingCount;
    bool isValid;
    String errorMessage;
};

// Quick book result
struct QuickBookResult {
    bool success;
    String message;
    Booking booking;
};

// Firmware update info
struct FirmwareInfo {
    String id;
    String version;
    int size;
    String checksum;
    String releaseNotes;
    bool isValid;
};

// Firmware update check result
struct FirmwareUpdateResult {
    bool updateAvailable;
    String currentVersion;
    String latestVersion;
    FirmwareInfo firmware;
};

class ApiClient {
public:
    ApiClient();

    void setApiUrl(const String& url);
    void setDeviceToken(const String& token);

    String getApiUrl() const { return _apiUrl; }
    String getDeviceToken() const { return _deviceToken; }
    bool isConfigured() const { return _apiUrl.length() > 0 && _deviceToken.length() > 0; }

    // API methods
    RoomStatus getRoomStatus();
    QuickBookResult quickBook(const String& title, int durationMinutes);
    bool ping();

    // Firmware update methods
    FirmwareUpdateResult checkForFirmwareUpdate();
    bool reportFirmwareVersion(const String& version);
    String getFirmwareDownloadUrl(const String& version);

private:
    String _apiUrl;
    String _deviceToken;

    String makeRequest(const String& endpoint, const String& method = "GET", const String& body = "");
    Booking parseBooking(JsonObject& obj);
    Room parseRoom(JsonObject& obj);
};

#endif // API_CLIENT_H
