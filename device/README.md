# Open Meeting Display - ESP32 CYD Firmware

Firmware for ESP32-2432S028 (CYD - Cheap Yellow Display) 2.8" TFT with touch screen to display meeting room status and allow quick bookings.

## Features

- **WiFi Setup**: Captive portal for initial WiFi configuration
- **Device Linking**: Web interface to enter API URL and device token
- **Room Status Display**: Shows current availability and next 3 bookings
- **Quick Booking**: Book the room for 15/30/45/60 minutes with touch interface
- **Auto-refresh**: Polls server every 30 seconds for status updates

## Hardware Requirements

- ESP32-2432S028 (CYD 2.8") or compatible ESP32 with ILI9341 display
- The board should have:
  - 2.8" TFT display (320x240, ILI9341 driver)
  - Capacitive touch screen
  - ESP32 microcontroller

## Software Requirements

- [PlatformIO](https://platformio.org/) (recommended)
- Or Arduino IDE with ESP32 board support

## Installation

### Using PlatformIO (Recommended)

1. Install PlatformIO IDE or CLI
2. Open the `device` folder as a PlatformIO project
3. Connect your ESP32 CYD via USB
4. Build and upload:
   ```bash
   pio run -t upload
   ```

### Using Arduino IDE

1. Install ESP32 board support
2. Install required libraries:
   - TFT_eSPI by Bodmer
   - ArduinoJson by Benoit Blanchon
   - WiFiManager by tzapu
3. Configure TFT_eSPI for your display (see User_Setup.h configuration below)
4. Open `src/main.cpp` and upload

## TFT_eSPI Configuration

If using Arduino IDE, create or modify `User_Setup.h` in the TFT_eSPI library:

```cpp
#define ILI9341_2_DRIVER
#define TFT_WIDTH  240
#define TFT_HEIGHT 320
#define TFT_MISO 12
#define TFT_MOSI 13
#define TFT_SCLK 14
#define TFT_CS   15
#define TFT_DC   2
#define TFT_RST  -1
#define TFT_BL   21
#define TOUCH_CS 33
#define SPI_FREQUENCY  55000000
#define SPI_READ_FREQUENCY  20000000
#define SPI_TOUCH_FREQUENCY  2500000
```

## First Time Setup

1. **Power on the device** - It will create a WiFi access point

2. **Connect to WiFi**:
   - Connect your phone/computer to: `MeetingRoom-Setup`
   - Password: `setup1234`
   - A captive portal should open automatically

3. **Configure WiFi**:
   - Select your WiFi network
   - Enter the password
   - Enter your API server URL (e.g., `http://192.168.1.100:3001`)
   - Enter the device token from the admin panel

4. **Get Device Token**:
   - Go to admin panel > Manage Rooms
   - Click "Devices" for the room you want to link
   - Click "Add Device" and give it a name
   - Copy the generated token

5. **Device Ready**:
   - Once configured, the device will show the room status
   - Touch "Book Now" when available to make quick bookings

## Re-configuration

If you need to change settings after initial setup:

1. Connect to the same WiFi network as the device
2. Find the device's IP address (shown in serial monitor or router)
3. Open `http://<device-ip>/` in a browser
4. Update API URL or device token as needed

To reset WiFi settings completely, the device needs to be reset via serial commands or re-flashing.

## Display Layout

### Room Available
```
┌─────────────────────────────────┐
│  Room Name                    🟢│
├─────────────────────────────────┤
│                                 │
│          AVAILABLE              │
│                                 │
│    ┌─────────────────────┐      │
│    │     Book Now        │      │
│    └─────────────────────┘      │
│                                 │
│  Upcoming:                      │
│  ┌─────────────────────────┐    │
│  │ Meeting Title           │    │
│  │ 10:00 - 11:00          │    │
│  └─────────────────────────┘    │
│                        [Refresh]│
└─────────────────────────────────┘
```

### Room Occupied
```
┌─────────────────────────────────┐
│  Room Name                    🔴│
├─────────────────────────────────┤
│                                 │
│          OCCUPIED               │
│                                 │
│  ┌─────────────────────────┐    │
│  │ Current Meeting         │    │
│  │ 09:00 - 10:00          │    │
│  └─────────────────────────┘    │
│                                 │
│  Upcoming:                      │
│  ┌─────────────────────────┐    │
│  │ Next Meeting            │    │
│  │ 10:30 - 11:30          │    │
│  └─────────────────────────┘    │
│                        [Refresh]│
└─────────────────────────────────┘
```

## Troubleshooting

### Display shows "WiFi disconnected"
- Check your WiFi router is working
- Move device closer to the router
- Reset and reconfigure WiFi

### Display shows "Failed to connect to server"
- Verify the API URL is correct
- Ensure the server is running
- Check firewall settings

### Touch not responding correctly
- The touch calibration values in `config.h` may need adjustment
- Modify `TOUCH_MIN_X`, `TOUCH_MAX_X`, `TOUCH_MIN_Y`, `TOUCH_MAX_Y`

### Can't find the setup WiFi network
- Ensure device is powered properly
- Check serial monitor for error messages
- Try power cycling the device

## API Endpoints Used

The device communicates with these backend endpoints:

- `GET /api/device/status` - Get room status and upcoming bookings
- `POST /api/device/quick-book` - Create a quick booking
- `GET /api/device/ping` - Health check

All requests include the `X-Device-Token` header for authentication.

## License

Part of the Open Meeting project.
