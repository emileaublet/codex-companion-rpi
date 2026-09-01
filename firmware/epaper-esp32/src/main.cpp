#include <Arduino.h>
#include <SPI.h>
#include <GxEPD2_4C.h>

// Waveshare E-Paper ESP32 Driver Board mapping.
// The board routes the panel through HSPI with SCK and MOSI remapped.
constexpr int EPD_CS = 15;
constexpr int EPD_DC = 27;
constexpr int EPD_RST = 26;
constexpr int EPD_BUSY = 25;
constexpr int EPD_SCK = 13;
constexpr int EPD_MISO = 12;
constexpr int EPD_MOSI = 14;

constexpr uint16_t FRAME_WIDTH = 122;
constexpr uint16_t FRAME_HEIGHT = 250;
constexpr uint16_t FRAME_BYTES_PER_ROW = (FRAME_WIDTH + 7) / 8;
constexpr uint32_t PLANE_BYTES = FRAME_BYTES_PER_ROW * FRAME_HEIGHT;
constexpr uint32_t FRAME_BYTES = PLANE_BYTES * 2;
constexpr uint32_t FRAME_TIMEOUT_MS = 10000;
constexpr size_t HEADER_CAPACITY = 32;

SPIClass hspi(HSPI);
GxEPD2_4C<GxEPD2_213c_GDEY0213F51, GxEPD2_213c_GDEY0213F51::HEIGHT> display(
    GxEPD2_213c_GDEY0213F51(EPD_CS, EPD_DC, EPD_RST, EPD_BUSY));
uint8_t frame[FRAME_BYTES];

void reply(const char *message) {
  Serial.println(message);
  Serial.flush();
}

void displayFrame() {
  display.init();
  display.setRotation(0);
  display.setFullWindow();
  display.firstPage();
  do {
    display.fillScreen(GxEPD_WHITE);
    display.drawBitmap(0, 0, frame, FRAME_WIDTH, FRAME_HEIGHT, GxEPD_BLACK);
    display.drawBitmap(0, 0, frame + PLANE_BYTES, FRAME_WIDTH, FRAME_HEIGHT, GxEPD_YELLOW);
  } while (display.nextPage());
  display.powerOff();
}

bool readFrame(uint32_t length) {
  if (length != FRAME_BYTES) return false;
  uint32_t received = 0;
  const uint32_t started = millis();
  while (received < FRAME_BYTES) {
    if (Serial.available() > 0) {
      const int byte = Serial.read();
      if (byte >= 0) frame[received++] = static_cast<uint8_t>(byte);
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
  if (strcmp(version, "CCEP/3") != 0 || parsedLength != FRAME_BYTES) return false;
  *length = static_cast<uint32_t>(parsedLength);
  return true;
}

void setup() {
  Serial.begin(115200);
  hspi.begin(EPD_SCK, EPD_MISO, EPD_MOSI, EPD_CS);
  display.epd2.selectSPI(hspi, SPISettings(4000000, MSBFIRST, SPI_MODE0));
  reply("CCEP READY 3 122x250 4C");
}

void loop() {
  static char header[HEADER_CAPACITY];
  static size_t headerLength = 0;

  while (Serial.available() > 0) {
    const int byte = Serial.read();
    if (byte < 0) return;
    if (byte == '\n') {
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
      displayFrame();
      reply("CCEP OK");
      continue;
    }
    if (byte == '\r') continue;
    if (headerLength + 1 >= HEADER_CAPACITY) {
      headerLength = 0;
      reply("CCEP ERR HEADER");
      continue;
    }
    header[headerLength++] = static_cast<char>(byte);
  }
  delay(2);
}
