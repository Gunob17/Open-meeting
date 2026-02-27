#include "api_client.h"
#include "config.h"

ApiClient::ApiClient() : _apiUrl(""), _deviceToken("") {}

void ApiClient::setApiUrl(const String& url) {
    _apiUrl = url;
    // Remove trailing slash if present
    if (_apiUrl.endsWith("/")) {
        _apiUrl = _apiUrl.substring(0, _apiUrl.length() - 1);
    }
}

void ApiClient::setDeviceToken(const String& token) {
    _deviceToken = token;
}

String ApiClient::makeRequest(const String& endpoint, const String& method, const String& body) {
    if (_apiUrl.length() == 0 || _deviceToken.length() == 0) {
        return "";
    }

    HTTPClient http;
    WiFiClientSecure secureClient;
    String url = _apiUrl + "/api/device" + endpoint;

    Serial.println("API Request: " + method + " " + url);

    if (url.startsWith("https")) {
        secureClient.setInsecure(); // Skip cert verification for self-signed/proxy setups
        http.begin(secureClient, url);
    } else {
        http.begin(url);
    }
    http.setTimeout(API_TIMEOUT);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Device-Token", _deviceToken);

    int httpCode;
    if (method == "GET") {
        httpCode = http.GET();
    } else if (method == "POST") {
        httpCode = http.POST(body);
    } else {
        http.end();
        return "";
    }

    String response = "";
    if (httpCode > 0) {
        response = http.getString();
        Serial.println("Response code: " + String(httpCode));
        Serial.println("Response: " + response);
    } else {
        Serial.println("HTTP Error: " + http.errorToString(httpCode));
    }

    http.end();
    return (httpCode >= 200 && httpCode < 300) ? response : "";
}

Booking ApiClient::parseBooking(JsonObject& obj) {
    Booking booking;
    booking.isValid = false;

    if (obj.isNull()) {
        return booking;
    }

    booking.id = obj["id"].as<String>();
    booking.title = obj["title"].as<String>();
    booking.startTime = obj["startTime"].as<String>();
    booking.endTime = obj["endTime"].as<String>();
    booking.isDeviceBooking = obj["isDeviceBooking"] | false;
    booking.isValid = booking.id.length() > 0;

    return booking;
}

Room ApiClient::parseRoom(JsonObject& obj) {
    Room room;
    room.isValid = false;
    room.quickBookDurationCount = 0;

    // Default durations
    int defaultDurations[] = {30, 60, 90, 120};
    for (int i = 0; i < 4; i++) {
        room.quickBookDurations[i] = defaultDurations[i];
    }
    room.quickBookDurationCount = 4;

    if (obj.isNull()) {
        return room;
    }

    room.id = obj["id"].as<String>();
    room.name = obj["name"].as<String>();
    room.capacity = obj["capacity"] | 0;
    room.floor = obj["floor"].as<String>();
    room.isValid = room.id.length() > 0;

    // Parse quickBookDurations if present
    if (!obj["quickBookDurations"].isNull()) {
        JsonArray durationsArr = obj["quickBookDurations"];
        room.quickBookDurationCount = 0;
        for (int i = 0; i < 4 && i < durationsArr.size(); i++) {
            room.quickBookDurations[i] = durationsArr[i] | 30;
            room.quickBookDurationCount++;
        }
    }

    return room;
}

RoomStatus ApiClient::getRoomStatus() {
    RoomStatus status;
    status.isValid = false;
    status.upcomingCount = 0;

    String response = makeRequest("/status", "GET");
    if (response.length() == 0) {
        status.errorMessage = "Failed to connect to server";
        return status;
    }

    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, response);

    if (error) {
        Serial.println("JSON parse error: " + String(error.c_str()));
        status.errorMessage = "Invalid response from server";
        return status;
    }

    // Check for error response
    if (!doc["error"].isNull()) {
        status.errorMessage = doc["error"].as<String>();
        return status;
    }

    // Parse room
    JsonObject roomObj = doc["room"];
    status.room = parseRoom(roomObj);

    // Parse availability
    status.isAvailable = doc["isAvailable"] | false;

    // Parse current booking
    if (!doc["currentBooking"].isNull()) {
        JsonObject currentObj = doc["currentBooking"];
        status.currentBooking = parseBooking(currentObj);
    } else {
        status.currentBooking.isValid = false;
    }

    // Parse upcoming bookings
    JsonArray upcomingArr = doc["upcomingBookings"];
    status.upcomingCount = 0;
    for (int i = 0; i < 3 && i < upcomingArr.size(); i++) {
        JsonObject bookingObj = upcomingArr[i];
        status.upcomingBookings[i] = parseBooking(bookingObj);
        if (status.upcomingBookings[i].isValid) {
            status.upcomingCount++;
        }
    }

    status.isValid = status.room.isValid;
    return status;
}

QuickBookResult ApiClient::quickBook(const String& title, int durationMinutes) {
    QuickBookResult result;
    result.success = false;

    JsonDocument doc;
    doc["title"] = title;
    doc["durationMinutes"] = durationMinutes;

    String body;
    serializeJson(doc, body);

    String response = makeRequest("/quick-book", "POST", body);
    if (response.length() == 0) {
        result.message = "Failed to connect to server";
        return result;
    }

    JsonDocument responseDoc;
    DeserializationError error = deserializeJson(responseDoc, response);

    if (error) {
        result.message = "Invalid response from server";
        return result;
    }

    // Check for error
    if (!responseDoc["error"].isNull()) {
        result.message = responseDoc["error"].as<String>();
        return result;
    }

    // Parse successful booking
    result.success = true;
    result.message = "Room booked successfully!";

    result.booking.id = responseDoc["id"].as<String>();
    result.booking.title = responseDoc["title"].as<String>();
    result.booking.startTime = responseDoc["startTime"].as<String>();
    result.booking.endTime = responseDoc["endTime"].as<String>();
    result.booking.isValid = true;

    return result;
}

EndMeetingResult ApiClient::endMeeting() {
    EndMeetingResult result;
    result.success = false;

    String response = makeRequest("/end-meeting", "POST", "{}");
    if (response.length() == 0) {
        result.message = "Failed to connect to server";
        return result;
    }

    JsonDocument responseDoc;
    DeserializationError error = deserializeJson(responseDoc, response);

    if (error) {
        result.message = "Invalid response from server";
        return result;
    }

    if (!responseDoc["error"].isNull()) {
        result.message = responseDoc["error"].as<String>();
        return result;
    }

    result.success = true;
    result.message = "Meeting ended";
    return result;
}

bool ApiClient::ping() {
    String response = makeRequest("/ping", "GET");
    if (response.length() == 0) {
        return false;
    }

    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, response);
    if (error) {
        return false;
    }

    return doc["status"] == "ok";
}

FirmwareUpdateResult ApiClient::checkForFirmwareUpdate() {
    FirmwareUpdateResult result;
    result.updateAvailable = false;
    result.firmware.isValid = false;

    String response = makeRequest("/firmware/check", "GET");
    if (response.length() == 0) {
        Serial.println("Firmware check: No response from server");
        return result;
    }

    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, response);

    if (error) {
        Serial.println("Firmware check: JSON parse error");
        return result;
    }

    result.updateAvailable = doc["updateAvailable"] | false;
    result.currentVersion = doc["currentVersion"].as<String>();
    result.latestVersion = doc["latestVersion"].as<String>();

    if (result.updateAvailable && !doc["latestFirmware"].isNull()) {
        JsonObject fw = doc["latestFirmware"];
        result.firmware.id = fw["id"].as<String>();
        result.firmware.version = fw["version"].as<String>();
        result.firmware.size = fw["size"] | 0;
        result.firmware.checksum = fw["checksum"].as<String>();
        result.firmware.releaseNotes = fw["releaseNotes"].as<String>();
        result.firmware.isValid = true;

        Serial.println("Firmware update available: v" + result.firmware.version);
        Serial.println("  Size: " + String(result.firmware.size) + " bytes");
    } else {
        Serial.println("No firmware update available");
    }

    return result;
}

bool ApiClient::reportFirmwareVersion(const String& version) {
    JsonDocument doc;
    doc["version"] = version;

    String body;
    serializeJson(doc, body);

    String response = makeRequest("/firmware/report", "POST", body);
    if (response.length() == 0) {
        return false;
    }

    JsonDocument responseDoc;
    DeserializationError error = deserializeJson(responseDoc, response);
    if (error) {
        return false;
    }

    return responseDoc["success"] | false;
}

String ApiClient::getFirmwareDownloadUrl(const String& version) {
    return _apiUrl + "/api/device/firmware/download/" + version;
}
