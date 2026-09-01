# Codex Companion ePaper firmware

This firmware targets the Waveshare E-Paper ESP32 Driver Board connected to the
four-color 2.13-inch panel in the project setup. The selected
`GxEPD2_213c_GDEY0213F51` profile uses the JD79661 controller and 122×250
native pixels. It drives the panel on the board's remapped HSPI pins and
accepts a native packed 2-bit frame over USB serial: four pixels per byte,
using the controller's white, black, and yellow values.

Protocol:

```text
CCEP/4 8000\n<128×250 native frame, four packed 2-bit pixels per byte>
```

The USB serial device is normally `/dev/ttyACM0` on Raspberry Pi OS. The Pi
renderer sends only locally rendered, sanitized status pixels; no bridge token
or thread text is sent to the ESP32.

Build and upload with PlatformIO from this directory:

```bash
pio run
pio run --target upload
pio device monitor -b 115200
```

The ESP32 board may need its BOOT button held while upload starts if automatic
bootloader entry is unavailable.
