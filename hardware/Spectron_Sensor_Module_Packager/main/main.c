#include <stdio.h>
#include <string.h>
#include <stdint.h>
#include <stdbool.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "driver/spi_master.h"

#include "esp_err.h"
#include "esp_log.h"

#include "protocol.h"
#include "module_config.h"

static const char *TAG = "MOD_PACKAGER";

/* ============================================================
 * SPI flash pins
 * These pins connect to the external flash chip on the sensor module.
 * ============================================================ */

#define PIN_NUM_MISO       5
#define PIN_NUM_MOSI       6
#define PIN_NUM_CLK        4
#define PIN_NUM_CS         7

#define PAGE_SIZE          256
#define SECTOR_SIZE        4096

/* ============================================================
 * template.bin is embedded by CMake:
 *
 * EMBED_FILES "template.bin"
 *
 * Symbol names:
 * _binary_template_bin_start
 * _binary_template_bin_end
 * ============================================================ */

extern const unsigned char template_bin_start[] asm("_binary_template_bin_start");
extern const unsigned char template_bin_end[]   asm("_binary_template_bin_end");

static spi_device_handle_t spi;

/* ============================================================
 * CRC32 software calculation
 * ============================================================ */

static uint32_t crc32_soft(const uint8_t *data, size_t len)
{
    uint32_t crc = 0xFFFFFFFFu;

    for (size_t i = 0; i < len; i++) {
        crc ^= data[i];

        for (int j = 0; j < 8; j++) {
            if (crc & 1u) {
                crc = (crc >> 1) ^ 0xEDB88320u;
            } else {
                crc = crc >> 1;
            }
        }
    }

    return ~crc;
}

/* ============================================================
 * SPI transmit helper
 * ============================================================ */

static esp_err_t spi_tx(const uint8_t *data, size_t len)
{
    if (data == NULL || len == 0) {
        return ESP_ERR_INVALID_ARG;
    }

    spi_transaction_t t = {0};
    t.length = (int)(8 * len);
    t.tx_buffer = data;

    return spi_device_transmit(spi, &t);
}

/* ============================================================
 * Read status register 1
 * Flash command:
 * 0x05 = Read Status Register
 * ============================================================ */

static esp_err_t flash_read_status1(uint8_t *sr1)
{
    if (sr1 == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    uint8_t tx_buf[2] = {0x05, 0x00};
    uint8_t rx_buf[2] = {0};

    spi_transaction_t t = {0};
    t.length = 16;
    t.tx_buffer = tx_buf;
    t.rx_buffer = rx_buf;

    esp_err_t err = spi_device_transmit(spi, &t);

    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Read status failed: %s", esp_err_to_name(err));
        return err;
    }

    *sr1 = rx_buf[1];

    return ESP_OK;
}

/* ============================================================
 * Wait until flash is not busy
 * Status bit 0 = busy bit
 * ============================================================ */

static esp_err_t flash_wait_ready(int timeout_ms)
{
    int elapsed = 0;

    while (elapsed < timeout_ms) {
        uint8_t sr1 = 0;

        esp_err_t err = flash_read_status1(&sr1);

        if (err != ESP_OK) {
            return err;
        }

        if ((sr1 & 0x01) == 0) {
            return ESP_OK;
        }

        vTaskDelay(pdMS_TO_TICKS(10));
        elapsed += 10;
    }

    ESP_LOGE(TAG, "Flash wait-ready timeout");

    return ESP_ERR_TIMEOUT;
}

/* ============================================================
 * Write enable
 * Flash command:
 * 0x06 = Write Enable
 * ============================================================ */

static esp_err_t flash_write_enable(void)
{
    uint8_t cmd = 0x06;
    return spi_tx(&cmd, 1);
}

/* ============================================================
 * Erase one 4KB sector
 * Flash command:
 * 0x20 = Sector Erase
 * ============================================================ */

static esp_err_t flash_sector_erase(uint32_t addr)
{
    uint8_t tx_buf[4] = {
        0x20,
        (uint8_t)((addr >> 16) & 0xFF),
        (uint8_t)((addr >> 8) & 0xFF),
        (uint8_t)(addr & 0xFF)
    };

    esp_err_t err = flash_write_enable();

    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Write enable failed before erase: %s",
                 esp_err_to_name(err));
        return err;
    }

    err = spi_tx(tx_buf, sizeof(tx_buf));

    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Sector erase failed: %s", esp_err_to_name(err));
        return err;
    }

    return flash_wait_ready(3000);
}

/* ============================================================
 * Program one flash page
 * Flash command:
 * 0x02 = Page Program
 * Max page size = 256 bytes
 * ============================================================ */

static esp_err_t flash_page_program(uint32_t addr,
                                    const uint8_t *data,
                                    size_t len)
{
    if (data == NULL || len == 0 || len > PAGE_SIZE) {
        return ESP_ERR_INVALID_ARG;
    }

    uint8_t tx_buf[4 + PAGE_SIZE] = {0};

    tx_buf[0] = 0x02;
    tx_buf[1] = (uint8_t)((addr >> 16) & 0xFF);
    tx_buf[2] = (uint8_t)((addr >> 8) & 0xFF);
    tx_buf[3] = (uint8_t)(addr & 0xFF);

    memcpy(&tx_buf[4], data, len);

    esp_err_t err = flash_write_enable();

    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Write enable failed before program: %s",
                 esp_err_to_name(err));
        return err;
    }

    err = spi_tx(tx_buf, 4 + len);

    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Page program failed: %s", esp_err_to_name(err));
        return err;
    }

    return flash_wait_ready(1000);
}

/* ============================================================
 * Read flash data
 * Flash command:
 * 0x03 = Read Data
 * ============================================================ */

static esp_err_t flash_read_data(uint32_t addr,
                                 uint8_t *data,
                                 size_t len)
{
    if (data == NULL || len == 0 || len > PAGE_SIZE) {
        return ESP_ERR_INVALID_ARG;
    }

    uint8_t tx_buf[4 + PAGE_SIZE] = {0};
    uint8_t rx_buf[4 + PAGE_SIZE] = {0};

    tx_buf[0] = 0x03;
    tx_buf[1] = (uint8_t)((addr >> 16) & 0xFF);
    tx_buf[2] = (uint8_t)((addr >> 8) & 0xFF);
    tx_buf[3] = (uint8_t)(addr & 0xFF);

    spi_transaction_t t = {0};
    t.length = (int)(8 * (4 + len));
    t.tx_buffer = tx_buf;
    t.rx_buffer = rx_buf;

    esp_err_t err = spi_device_transmit(spi, &t);

    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Flash read failed: %s", esp_err_to_name(err));
        return err;
    }

    memcpy(data, &rx_buf[4], len);

    return ESP_OK;
}

/* ============================================================
 * Write a full region to flash
 * It first erases the required 4KB sectors.
 * ============================================================ */

static esp_err_t write_region(uint32_t base_addr,
                              const uint8_t *payload,
                              size_t payload_size)
{
    if (payload == NULL || payload_size == 0) {
        return ESP_ERR_INVALID_ARG;
    }

    size_t sectors = (payload_size + SECTOR_SIZE - 1) / SECTOR_SIZE;

    ESP_LOGI(TAG, "Erasing %u sector(s) from 0x%08lX",
             (unsigned)sectors,
             (unsigned long)base_addr);

    for (size_t i = 0; i < sectors; i++) {
        uint32_t erase_addr = base_addr + (uint32_t)(i * SECTOR_SIZE);

        esp_err_t err = flash_sector_erase(erase_addr);

        if (err != ESP_OK) {
            ESP_LOGE(TAG, "Erase failed at sector %u: %s",
                     (unsigned)i,
                     esp_err_to_name(err));
            return err;
        }
    }

    size_t offset = 0;

    while (offset < payload_size) {
        uint32_t addr = base_addr + (uint32_t)offset;

        size_t page_space = PAGE_SIZE - (addr % PAGE_SIZE);
        size_t chunk = payload_size - offset;

        if (chunk > page_space) {
            chunk = page_space;
        }

        if (chunk > PAGE_SIZE) {
            chunk = PAGE_SIZE;
        }

        esp_err_t err = flash_page_program(
            addr,
            payload + offset,
            chunk
        );

        if (err != ESP_OK) {
            ESP_LOGE(TAG, "Program failed at offset %u: %s",
                     (unsigned)offset,
                     esp_err_to_name(err));
            return err;
        }

        offset += chunk;

        if ((offset % 16384) == 0 || offset == payload_size) {
            ESP_LOGI(TAG, "Written %u / %u bytes",
                     (unsigned)offset,
                     (unsigned)payload_size);
        }
    }

    return ESP_OK;
}

/* ============================================================
 * Verify a written region
 * Reads back from flash and compares byte-by-byte.
 * ============================================================ */

static bool verify_region(uint32_t base_addr,
                          const uint8_t *payload,
                          size_t payload_size)
{
    if (payload == NULL || payload_size == 0) {
        return false;
    }

    uint8_t read_buf[PAGE_SIZE];
    size_t offset = 0;

    while (offset < payload_size) {
        size_t chunk = payload_size - offset;

        if (chunk > PAGE_SIZE) {
            chunk = PAGE_SIZE;
        }

        if (flash_read_data(
                base_addr + (uint32_t)offset,
                read_buf,
                chunk
            ) != ESP_OK) {

            return false;
        }

        if (memcmp(read_buf, payload + offset, chunk) != 0) {
            ESP_LOGE(TAG, "Verify mismatch at offset=%u",
                     (unsigned)offset);
            return false;
        }

        offset += chunk;
    }

    return true;
}

/* ============================================================
 * Init external flash SPI
 * ============================================================ */

static esp_err_t init_module_flash_spi(void)
{
    spi_bus_config_t buscfg = {
        .mosi_io_num = PIN_NUM_MOSI,
        .miso_io_num = PIN_NUM_MISO,
        .sclk_io_num = PIN_NUM_CLK,
        .quadwp_io_num = -1,
        .quadhd_io_num = -1,
        .max_transfer_sz = 4 + PAGE_SIZE
    };

    spi_device_interface_config_t devcfg = {
        .clock_speed_hz = 1000000,
        .mode = 0,
        .spics_io_num = PIN_NUM_CS,
        .queue_size = 1
    };

    ESP_ERROR_CHECK(spi_bus_initialize(SPI2_HOST, &buscfg, SPI_DMA_CH_AUTO));
    ESP_ERROR_CHECK(spi_bus_add_device(SPI2_HOST, &devcfg, &spi));

    ESP_LOGI(TAG, "External module flash SPI initialized");

    return ESP_OK;
}

/* ============================================================
 * Build generalized I2C module header
 * ============================================================ */

static void build_module_header(module_header_t *hdr,
                                uint32_t payload_size,
                                uint32_t payload_crc)
{
    memset(hdr, 0, sizeof(module_header_t));

    hdr->magic = MODULE_HEADER_MAGIC;
    hdr->header_version = MODULE_HEADER_VERSION;

    hdr->sensor_id = MODULE_SENSOR_ID;
    hdr->sensor_type = MODULE_SENSOR_TYPE;

    hdr->bus_type = MODULE_BUS_TYPE;
    hdr->i2c_sda_gpio = MODULE_I2C_SDA_GPIO;
    hdr->i2c_scl_gpio = MODULE_I2C_SCL_GPIO;
    hdr->i2c_addr = MODULE_I2C_ADDR;

    strlcpy(hdr->sensor_name, MODULE_SENSOR_NAME, sizeof(hdr->sensor_name));

    hdr->firmware_addr = MODULE_PAYLOAD_ADDR;
    hdr->firmware_size = payload_size;
    hdr->firmware_crc32 = payload_crc;

    hdr->default_sample_period_ms = MODULE_DEFAULT_SAMPLE_MS;
    hdr->default_threshold_1_x100 = MODULE_DEFAULT_THRESHOLD_1_X100;
    hdr->default_threshold_2_x100 = MODULE_DEFAULT_THRESHOLD_2_X100;

    hdr->flags = 0;
}

/* ============================================================
 * Main
 * ============================================================ */

void app_main(void)
{
    ESP_LOGI(TAG, "====================================");
    ESP_LOGI(TAG, "Generalized I2C Module Packager Started");
    ESP_LOGI(TAG, "====================================");

    const uint8_t *payload = template_bin_start;
    size_t payload_size = (size_t)(template_bin_end - template_bin_start);

    if (payload_size == 0) {
        ESP_LOGE(TAG, "template.bin is empty");
        return;
    }

    uint32_t payload_crc = crc32_soft(payload, payload_size);

    ESP_LOGI(TAG, "template.bin size = %u bytes", (unsigned)payload_size);
    ESP_LOGI(TAG, "template.bin CRC  = 0x%08lX", (unsigned long)payload_crc);

    ESP_ERROR_CHECK(init_module_flash_spi());

    module_header_t hdr;
    build_module_header(&hdr, (uint32_t)payload_size, payload_crc);

    ESP_LOGI(TAG, "Module package details:");
    ESP_LOGI(TAG, "Sensor name  : %s", MODULE_SENSOR_NAME);
    ESP_LOGI(TAG, "Sensor ID    : 0x%08lX", (unsigned long)MODULE_SENSOR_ID);
    ESP_LOGI(TAG, "Sensor type  : %u", MODULE_SENSOR_TYPE);
    ESP_LOGI(TAG, "Bus type     : %u", MODULE_BUS_TYPE);
    ESP_LOGI(TAG, "I2C SDA GPIO : %u", MODULE_I2C_SDA_GPIO);
    ESP_LOGI(TAG, "I2C SCL GPIO : %u", MODULE_I2C_SCL_GPIO);
    ESP_LOGI(TAG, "I2C address  : 0x%02X", MODULE_I2C_ADDR);
    ESP_LOGI(TAG, "Payload addr : 0x%08X", MODULE_PAYLOAD_ADDR);

    ESP_LOGI(TAG, "Writing module header...");
    ESP_ERROR_CHECK(write_region(
        MODULE_HEADER_ADDR,
        (const uint8_t *)&hdr,
        sizeof(hdr)
    ));

    ESP_LOGI(TAG, "Writing template.bin payload...");
    ESP_ERROR_CHECK(write_region(
        MODULE_PAYLOAD_ADDR,
        payload,
        payload_size
    ));

    ESP_LOGI(TAG, "Verifying module header...");
    if (!verify_region(
            MODULE_HEADER_ADDR,
            (const uint8_t *)&hdr,
            sizeof(hdr)
        )) {

        ESP_LOGE(TAG, "Header verification failed");
        return;
    }

    ESP_LOGI(TAG, "Verifying payload...");
    if (!verify_region(
            MODULE_PAYLOAD_ADDR,
            payload,
            payload_size
        )) {

        ESP_LOGE(TAG, "Payload verification failed");
        return;
    }

    ESP_LOGI(TAG, "====================================");
    ESP_LOGI(TAG, "Module flash package written successfully");
    ESP_LOGI(TAG, "Connect this flash/module to the sensor base");
    ESP_LOGI(TAG, "====================================");
}