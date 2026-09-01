# Codex Companion ePaper firmware

This firmware targets the Waveshare E-Paper ESP32 Driver Board connected to the
black-and-white 2.13-inch `GDEM0213B74`-family panel shown in the project
setup. It drives the panel on the board's remapped HSPI pins and accepts a
250×122 monochrome frame over USB serial.

Protocol:

```text
CCEP/1 4000\n<4000 bytes, one MSB-first bitmap row at a time>
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
