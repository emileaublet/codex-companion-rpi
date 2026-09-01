# Codex Companion ePaper firmware

This firmware targets the Waveshare E-Paper ESP32 Driver Board connected to the
confirmed 2.13-inch B V4 panel in the project setup. The selected
`GxEPD2_213_Z98c` profile uses the SSD1680 controller and 122×250 visible
pixels (128×250 controller width). It drives the panel on the board's remapped
HSPI pins and accepts two 1-bit planes over USB serial: black followed by the
yellow/red color plane.

Protocol:

```text
CCEP/5 8000\n<128×250 black plane followed by 128×250 color plane>
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
