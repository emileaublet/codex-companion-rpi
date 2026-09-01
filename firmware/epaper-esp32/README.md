# Codex Companion ePaper firmware

This firmware targets the Waveshare E-Paper ESP32 Driver Board connected to the
three-color 2.13-inch panel in the project setup. The selected
`GxEPD2_213_Z19c` profile uses the UC8151D controller and 104×212 native
pixels. It drives the panel on the board's remapped HSPI pins and accepts two
one-bit planes over USB serial: black, followed by the red/yellow accent plane.

Protocol:

```text
CCEP/2 5512\n<2756 black bytes followed by 2756 accent-color bytes>
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
