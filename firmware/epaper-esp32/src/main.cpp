#include <Arduino.h>
#include <SPI.h>

// Waveshare E-Paper ESP32 Driver Board mapping.
constexpr int EPD_CS = 15;
constexpr int EPD_DC = 27;
constexpr int EPD_RST = 26;
constexpr int EPD_BUSY = 25;
constexpr int EPD_SCK = 13;
constexpr int EPD_MISO = 12;
constexpr int EPD_MOSI = 14;

// Confirmed Waveshare "2.13 B V4" panel: 122 visible pixels, 250 rows,
// with a 128-pixel controller row padded to 16 bytes.
constexpr uint16_t FRAME_HEIGHT = 250;
constexpr uint16_t FRAME_BYTES_PER_ROW = 16;
constexpr uint32_t FRAME_PLANE_BYTES = FRAME_BYTES_PER_ROW * FRAME_HEIGHT;
constexpr uint32_t FRAME_BYTES = FRAME_PLANE_BYTES * 2;
constexpr uint32_t FRAME_TIMEOUT_MS = 10000;
constexpr uint32_t DISPLAY_TIMEOUT_MS = 30000;
constexpr size_t HEADER_CAPACITY = 32;

SPIClass hspi(HSPI);
SPISettings epdSpiSettings(4000000, MSBFIRST, SPI_MODE0);
uint8_t frame[FRAME_BYTES];

void reply(const char *message) {
  Serial.println(message);
  Serial.flush();
}

void epdTransfer(uint8_t value) {
  digitalWrite(EPD_CS, LOW);
  hspi.transfer(value);
  digitalWrite(EPD_CS, HIGH);
}

void epdCommand(uint8_t command) {
  digitalWrite(EPD_DC, LOW);
  epdTransfer(command);
}

void epdData(uint8_t value) {
  digitalWrite(EPD_DC, HIGH);
  epdTransfer(value);
}

void epdReset() {
  // Match the known-good Waveshare WiFi loader timings.
  digitalWrite(EPD_RST, HIGH);
  delay(200);
  digitalWrite(EPD_RST, LOW);
  delay(5);
  digitalWrite(EPD_RST, HIGH);
  delay(200);
}

bool waitUntilIdle(uint32_t timeoutMs = DISPLAY_TIMEOUT_MS) {
  const uint32_t started = millis();
  while (digitalRead(EPD_BUSY) == HIGH) {
    if (millis() - started > timeoutMs) return false;
    delay(10);
  }
  return true;
}

void epdData1(uint8_t command, uint8_t value) {
  epdCommand(command);
  epdData(value);
}

void epdData2(uint8_t command, uint8_t first, uint8_t second) {
  epdCommand(command);
  epdData(first);
  epdData(second);
}

void epdData3(uint8_t command, uint8_t first, uint8_t second, uint8_t third) {
  epdCommand(command);
  epdData(first);
  epdData(second);
  epdData(third);
}

bool epdInitBv4() {
  epdReset();
  if (!waitUntilIdle()) return false;

  epdCommand(0x12); // SWRESET
  if (!waitUntilIdle()) return false;

  epdData3(0x01, 0xf9, 0x00, 0x00); // DRIVER_OUTPUT_CONTROL
  epdData1(0x11, 0x03);              // DATA_ENTRY_MODE
  epdData2(0x44, 0x00, 0x0f);        // RAM X start/end
  epdCommand(0x45);                  // RAM Y start/end
  epdData(0x00);
  epdData(0x00);
  epdData(0x00);
  epdData(0xf9);
  epdData1(0x4e, 0x00);               // RAM X counter
  epdData2(0x4f, 0x00, 0x00);         // RAM Y counter
  epdData1(0x3c, 0x05);               // BORDER_WAVEFORM
  epdData1(0x18, 0x80);               // TEMPERATURE_SENSOR
  epdData2(0x21, 0x80, 0x80);         // DISPLAY_UPDATE_CONTROL
  return waitUntilIdle();
}

void writePlane(uint8_t command, const uint8_t *plane) {
  epdCommand(command);
  for (uint32_t index = 0; index < FRAME_PLANE_BYTES; index += 1) {
    epdData(plane[index]);
  }
}

bool displayFrame() {
  // This is intentionally the same sequence as the working official
  // 2.13 B V4 utility: initialize, write 0x24 black, write 0x26 yellow,
  // then activate the display.
  if (!epdInitBv4()) return false;
  writePlane(0x24, frame);
  writePlane(0x26, frame + FRAME_PLANE_BYTES);
  epdCommand(0x20); // DISPLAY_REFRESH
  if (!waitUntilIdle()) return false;
  epdData1(0x10, 0x01); // DEEP_SLEEP_MODE
  return true;
}

bool readFrame(uint32_t length) {
  if (length != FRAME_BYTES) return false;
  uint32_t received = 0;
  const uint32_t started = millis();
  while (received < FRAME_BYTES) {
    if (Serial.available() > 0) {
      const int value = Serial.read();
      if (value >= 0) frame[received++] = static_cast<uint8_t>(value);
      continue;
    }
    if (millis() - started > FRAME_TIMEOUT_MS) return false;
    delay(1);
  }
  return true;
}

bool parseHeader(char *header, uint32_t *length) {
  unsigned long parsedLength = 0;
  char version[8] = {0};
  if (sscanf(header, "%7s %lu", version, &parsedLength) != 2) return false;
  if (strcmp(version, "CCEP/5") != 0 || parsedLength != FRAME_BYTES) return false;
  *length = static_cast<uint32_t>(parsedLength);
  return true;
}

void setup() {
  Serial.begin(115200);
  pinMode(EPD_BUSY, INPUT);
  pinMode(EPD_RST, OUTPUT);
  pinMode(EPD_DC, OUTPUT);
  pinMode(EPD_CS, OUTPUT);
  digitalWrite(EPD_CS, HIGH);
  digitalWrite(EPD_DC, HIGH);
  hspi.begin(EPD_SCK, EPD_MISO, EPD_MOSI, EPD_CS);
  reply("CCEP READY 5 122x250 2-PLANE");
}

void loop() {
  static char header[HEADER_CAPACITY];
  static size_t headerLength = 0;

  while (Serial.available() > 0) {
    const int value = Serial.read();
    if (value < 0) return;
    if (value == '\n') {
      header[headerLength] = '\0';
      headerLength = 0;
      uint32_t length = 0;
      if (!parseHeader(header, &length)) {
        reply("CCEP ERR HEADER");
        continue;
      }
      if (!readFrame(length)) {
        reply("CCEP ERR FRAME");
        continue;
      }
      hspi.beginTransaction(epdSpiSettings);
      const bool displayed = displayFrame();
      hspi.endTransaction();
      if (!displayed) {
        reply("CCEP ERR DISPLAY");
        continue;
      }
      reply("CCEP OK");
      continue;
    }
    if (value == '\r') continue;
    if (headerLength + 1 >= HEADER_CAPACITY) {
      headerLength = 0;
      reply("CCEP ERR HEADER");
      continue;
    }
    header[headerLength++] = static_cast<char>(value);
  }
  delay(2);
}
