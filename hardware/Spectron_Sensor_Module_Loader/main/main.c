#include <stdio.h>
#include <string.h>
#include <stdint.h>
#include <stdbool.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "driver/spi_master.h"

#include "esp_err.h"
#include "esp_log.h"
#include "esp_ota_ops.h"
#include "esp_partition.h"
#include "esp_system.h"

#include "nvs_flash.h"
#include "nvs.h"

#include "protocol.h"

static const char *TAG = "I2C_MOD_LOADER";

/* ============================================================
 * External flash pins
 * These are the flash pins connected to every sensor module.
 * ============================================================ */

#define PIN_NUM_MISO 5
#define PIN_NUM_MOSI 6
#define PIN_NUM_CLK  4
#define PIN_NUM_CS   7

/* ============================================================
 * Flash layout
 * ============================================================ */

#define PAGE_SIZE          256
#define HEADER_ADDR        0x000000
#define MIN_FW_ADDR        0x001000
#define MAX_FW_SIZE        0x140000

/* ============================================================
 * NVS namespace and keys
 * ============================================================ */

#define NVS_NS_MODULE      "module_cfg"

#define NVS_KEY_SENSOR_ID  "sensor_id"
#define NVS_KEY_SENSOR_TYP "sensor_type"
#define NVS_KEY_SENSOR_NM  "sensor_name"

#define NVS_KEY_BUS_TYPE   "bus_type"
#define NVS_KEY_I2C_SDA    "i2c_sda"
#define NVS_KEY_I2C_SCL    "i2c_scl"
#define NVS_KEY_I2C_ADDR   "i2c_addr"

#define NVS_KEY_FW_ADDR    "fw_addr"
#define NVS_KEY_FW_SIZE    "fw_size"
#define NVS_KEY_FW_CRC     "fw_crc"

#define NVS_KEY_SAMPLE_MS  "sample_ms"
#define NVS_KEY_TH1        "th1"
#define NVS_KEY_TH2        "th2"

#define NVS_KEY_OTA_SUB    "ota_sub"

static spi_device_handle_t spi;

/* ============================================================
 * CRC32
 * ============================================================ */

static uint32_t crc32_init(void)
{
    return 0xFFFFFFFFu;
}

static uint32_t crc32_update(uint32_t crc, const uint8_t *data, size_t len)
{
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

    return crc;
}

static uint32_t crc32_final(uint32_t crc)
{
    return ~crc;
}

/* ============================================================
 * Supported I2C sensor type check
 *
 * Loader does not run the sensor driver.
 * It only rejects unknown/invalid module headers.
 * ============================================================ */

static bool is_supported_i2c_sensor(uint16_t sensor_type)
{
    switch (sensor_type) {
        case SENSOR_TYPE_SHT30:
        case SENSOR_TYPE_BH1750:
        case SENSOR_TYPE_BME280:
        case SENSOR_TYPE_VL53L0X:
        case SENSOR_TYPE_BMP280:
        case SENSOR_TYPE_AHT20:
        case SENSOR_TYPE_HTU21D:
        case SENSOR_TYPE_CUSTOM_I2C:
            return true;

        default:
            return false;
    }
}

/* ============================================================
 * SPI flash read helpers
 * ============================================================ */

static esp_err_t flash_read_chunk(uint32_t addr, uint8_t *data, size_t len)
{
    if (data == NULL || len == 0 || len > PAGE_SIZE) {
        return ESP_ERR_INVALID_ARG;
    }

    uint8_t tx_buf[4 + PAGE_SIZE] = {0};
    uint8_t rx_buf[4 + PAGE_SIZE] = {0};

    /*
     * 0x03 = standard SPI flash READ command.
     * Then send 24-bit address.
     */
    tx_buf[0] = 0x03;
    tx_buf[1] = (addr >> 16) & 0xFF;
    tx_buf[2] = (addr >> 8) & 0xFF;
    tx_buf[3] = addr & 0xFF;

    spi_transaction_t t = {0};
    t.length = 8 * (4 + len);
    t.tx_buffer = tx_buf;
    t.rx_buffer = rx_buf;

    esp_err_t err = spi_device_transmit(spi, &t);

    if (err != ESP_OK) {
        ESP_LOGE(TAG, "SPI flash read failed: %s", esp_err_to_name(err));
        return err;
    }

    memcpy(data, &rx_buf[4], len);

    return ESP_OK;
}

static esp_err_t flash_read_exact(uint32_t addr, uint8_t *data, size_t len)
{
    if (data == NULL || len == 0) {
        return ESP_ERR_INVALID_ARG;
    }

    size_t offset = 0;

    while (offset < len) {
        size_t chunk = len - offset;

        if (chunk > PAGE_SIZE) {
            chunk = PAGE_SIZE;
        }

        esp_err_t err = flash_read_chunk(addr + offset, data + offset, chunk);

        if (err != ESP_OK) {
            return err;
        }

        offset += chunk;
    }

    return ESP_OK;
}

/* ============================================================
 * NVS init
 * ============================================================ */

static esp_err_t init_nvs_storage(void)
{
    esp_err_t ret = nvs_flash_init();

    if (ret == ESP_ERR_NVS_NO_FREE_PAGES ||
        ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {

        ESP_LOGW(TAG, "NVS erase required");
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }

    return ret;
}

/* ============================================================
 * External SPI flash init
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
        .clock_speed_hz = 200000,
        .mode = 0,
        .spics_io_num = PIN_NUM_CS,
        .queue_size = 1
    };

    esp_err_t err = spi_bus_initialize(SPI2_HOST, &buscfg, SPI_DMA_CH_AUTO);

    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        ESP_LOGE(TAG, "SPI bus init failed: %s", esp_err_to_name(err));
        return err;
    }

    err = spi_bus_add_device(SPI2_HOST, &devcfg, &spi);

    if (err != ESP_OK) {
        ESP_LOGE(TAG, "SPI device add failed: %s", esp_err_to_name(err));
        return err;
    }

    ESP_LOGI(TAG, "External module flash SPI ready");

    return ESP_OK;
}

/* ============================================================
 * Header validation
 * Generalized for any I2C sensor module.
 * ============================================================ */

static bool validate_module_header(const module_header_t *hdr)
{
    if (hdr == NULL) {
        ESP_LOGE(TAG, "Header is NULL");
        return false;
    }

    if (hdr->magic != MODULE_HEADER_MAGIC) {
        ESP_LOGE(TAG, "Bad header magic: 0x%08lX",
                 (unsigned long)hdr->magic);
        return false;
    }

    if (hdr->header_version != MODULE_HEADER_VERSION) {
        ESP_LOGE(TAG, "Unsupported header version: %u",
                 hdr->header_version);
        return false;
    }

    if (hdr->bus_type != MODULE_BUS_TYPE_I2C) {
        ESP_LOGE(TAG, "Unsupported bus type: %u. Loader accepts I2C only",
                 hdr->bus_type);
        return false;
    }

    if (!is_supported_i2c_sensor(hdr->sensor_type)) {
        ESP_LOGE(TAG, "Unsupported I2C sensor type: %u",
                 hdr->sensor_type);
        return false;
    }

    if (hdr->i2c_addr == 0x00 || hdr->i2c_addr > 0x7F) {
        ESP_LOGE(TAG, "Invalid I2C address: 0x%02X",
                 hdr->i2c_addr);
        return false;
    }

    if (hdr->firmware_addr < MIN_FW_ADDR) {
        ESP_LOGE(TAG, "Firmware address too low: 0x%08lX",
                 (unsigned long)hdr->firmware_addr);
        return false;
    }

    if (hdr->firmware_size == 0 || hdr->firmware_size > MAX_FW_SIZE) {
        ESP_LOGE(TAG, "Invalid firmware size: %lu",
                 (unsigned long)hdr->firmware_size);
        return false;
    }

    if (hdr->default_sample_period_ms == 0) {
        ESP_LOGW(TAG, "Default sample period is 0");
    }

    ESP_LOGI(TAG, "Valid I2C module header found");
    ESP_LOGI(TAG, "Sensor name  : %.*s", MPROTO_SENSOR_NAME_LEN, hdr->sensor_name);
    ESP_LOGI(TAG, "Sensor ID    : %lu", (unsigned long)hdr->sensor_id);
    ESP_LOGI(TAG, "Sensor type  : %u", hdr->sensor_type);
    ESP_LOGI(TAG, "I2C SDA GPIO : %u", hdr->i2c_sda_gpio);
    ESP_LOGI(TAG, "I2C SCL GPIO : %u", hdr->i2c_scl_gpio);
    ESP_LOGI(TAG, "I2C address  : 0x%02X", hdr->i2c_addr);
    ESP_LOGI(TAG, "FW addr      : 0x%08lX", (unsigned long)hdr->firmware_addr);
    ESP_LOGI(TAG, "FW size      : %lu", (unsigned long)hdr->firmware_size);
    ESP_LOGI(TAG, "FW CRC       : 0x%08lX", (unsigned long)hdr->firmware_crc32);

    return true;
}

/* ============================================================
 * Check same firmware already installed
 * ============================================================ */

static bool same_firmware_already_installed(const module_header_t *hdr)
{
    nvs_handle_t nvs;
    esp_err_t err = nvs_open(NVS_NS_MODULE, NVS_READONLY, &nvs);

    if (err != ESP_OK) {
        return false;
    }

    uint32_t saved_sensor_id = 0;
    uint32_t saved_sensor_type = 0;
    uint32_t saved_fw_crc = 0;
    uint32_t saved_fw_size = 0;

    bool same = false;

    if (nvs_get_u32(nvs, NVS_KEY_SENSOR_ID, &saved_sensor_id) == ESP_OK &&
        nvs_get_u32(nvs, NVS_KEY_SENSOR_TYP, &saved_sensor_type) == ESP_OK &&
        nvs_get_u32(nvs, NVS_KEY_FW_CRC, &saved_fw_crc) == ESP_OK &&
        nvs_get_u32(nvs, NVS_KEY_FW_SIZE, &saved_fw_size) == ESP_OK) {

        if (saved_sensor_id == hdr->sensor_id &&
            saved_sensor_type == hdr->sensor_type &&
            saved_fw_crc == hdr->firmware_crc32 &&
            saved_fw_size == hdr->firmware_size) {

            same = true;
        }
    }

    nvs_close(nvs);

    return same;
}

/* ============================================================
 * Get saved OTA subtype
 * ============================================================ */

static bool get_saved_ota_subtype(uint8_t *ota_subtype)
{
    if (ota_subtype == NULL) {
        return false;
    }

    nvs_handle_t nvs;
    esp_err_t err = nvs_open(NVS_NS_MODULE, NVS_READONLY, &nvs);

    if (err != ESP_OK) {
        return false;
    }

    err = nvs_get_u8(nvs, NVS_KEY_OTA_SUB, ota_subtype);
    nvs_close(nvs);

    return err == ESP_OK;
}

/* ============================================================
 * Boot already installed firmware
 * ============================================================ */

static esp_err_t boot_installed_firmware(void)
{
    uint8_t ota_subtype = 0;

    if (!get_saved_ota_subtype(&ota_subtype)) {
        ESP_LOGE(TAG, "No saved OTA subtype found");
        return ESP_FAIL;
    }

    const esp_partition_t *partition = esp_partition_find_first(
        ESP_PARTITION_TYPE_APP,
        (esp_partition_subtype_t)ota_subtype,
        NULL
    );

    if (partition == NULL) {
        ESP_LOGE(TAG, "Saved OTA partition not found");
        return ESP_FAIL;
    }

    ESP_LOGI(TAG, "Booting already installed firmware from %s",
             partition->label);

    esp_err_t err = esp_ota_set_boot_partition(partition);

    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Set boot partition failed: %s", esp_err_to_name(err));
        return err;
    }

    vTaskDelay(pdMS_TO_TICKS(500));
    esp_restart();

    return ESP_OK;
}

/* ============================================================
 * Choose OTA slot
 * ============================================================ */

static const esp_partition_t *choose_update_partition(void)
{
    uint8_t saved_subtype = 0;

    if (get_saved_ota_subtype(&saved_subtype)) {
        esp_partition_subtype_t next_subtype;

        if (saved_subtype == ESP_PARTITION_SUBTYPE_APP_OTA_0) {
            next_subtype = ESP_PARTITION_SUBTYPE_APP_OTA_1;
        } else {
            next_subtype = ESP_PARTITION_SUBTYPE_APP_OTA_0;
        }

        const esp_partition_t *partition = esp_partition_find_first(
            ESP_PARTITION_TYPE_APP,
            next_subtype,
            NULL
        );

        if (partition != NULL) {
            ESP_LOGI(TAG, "Selected alternate OTA partition: %s",
                     partition->label);
            return partition;
        }
    }

    const esp_partition_t *partition = esp_ota_get_next_update_partition(NULL);

    if (partition != NULL) {
        ESP_LOGI(TAG, "Selected default OTA partition: %s",
                 partition->label);
    }

    return partition;
}

/* ============================================================
 * Save metadata to NVS
 * ============================================================ */

static esp_err_t persist_module_meta(
    const module_header_t *hdr,
    const esp_partition_t *installed_partition
)
{
    nvs_handle_t nvs;
    esp_err_t err = nvs_open(NVS_NS_MODULE, NVS_READWRITE, &nvs);

    if (err != ESP_OK) {
        ESP_LOGE(TAG, "NVS open failed: %s", esp_err_to_name(err));
        return err;
    }

    char safe_name[MPROTO_SENSOR_NAME_LEN + 1];
    memcpy(safe_name, hdr->sensor_name, MPROTO_SENSOR_NAME_LEN);
    safe_name[MPROTO_SENSOR_NAME_LEN] = '\0';

    err = nvs_set_u32(nvs, NVS_KEY_SENSOR_ID, hdr->sensor_id);
    if (err != ESP_OK) goto fail;

    err = nvs_set_u32(nvs, NVS_KEY_SENSOR_TYP, hdr->sensor_type);
    if (err != ESP_OK) goto fail;

    err = nvs_set_str(nvs, NVS_KEY_SENSOR_NM, safe_name);
    if (err != ESP_OK) goto fail;

    err = nvs_set_u8(nvs, NVS_KEY_BUS_TYPE, hdr->bus_type);
    if (err != ESP_OK) goto fail;

    err = nvs_set_u8(nvs, NVS_KEY_I2C_SDA, hdr->i2c_sda_gpio);
    if (err != ESP_OK) goto fail;

    err = nvs_set_u8(nvs, NVS_KEY_I2C_SCL, hdr->i2c_scl_gpio);
    if (err != ESP_OK) goto fail;

    err = nvs_set_u8(nvs, NVS_KEY_I2C_ADDR, hdr->i2c_addr);
    if (err != ESP_OK) goto fail;

    err = nvs_set_u32(nvs, NVS_KEY_FW_ADDR, hdr->firmware_addr);
    if (err != ESP_OK) goto fail;

    err = nvs_set_u32(nvs, NVS_KEY_FW_SIZE, hdr->firmware_size);
    if (err != ESP_OK) goto fail;

    err = nvs_set_u32(nvs, NVS_KEY_FW_CRC, hdr->firmware_crc32);
    if (err != ESP_OK) goto fail;

    err = nvs_set_u32(nvs, NVS_KEY_SAMPLE_MS,
                      hdr->default_sample_period_ms);
    if (err != ESP_OK) goto fail;

    err = nvs_set_i16(nvs, NVS_KEY_TH1,
                      hdr->default_threshold_1_x100);
    if (err != ESP_OK) goto fail;

    err = nvs_set_i16(nvs, NVS_KEY_TH2,
                      hdr->default_threshold_2_x100);
    if (err != ESP_OK) goto fail;

    err = nvs_set_u8(nvs, NVS_KEY_OTA_SUB,
                     (uint8_t)installed_partition->subtype);
    if (err != ESP_OK) goto fail;

    err = nvs_commit(nvs);
    if (err != ESP_OK) goto fail;

    nvs_close(nvs);

    ESP_LOGI(TAG, "Module metadata saved to NVS");

    return ESP_OK;

fail:
    ESP_LOGE(TAG, "NVS save failed: %s", esp_err_to_name(err));
    nvs_close(nvs);
    return err;
}

/* ============================================================
 * Install firmware from module flash to OTA
 * ============================================================ */

static esp_err_t install_from_header(const module_header_t *hdr)
{
    const esp_partition_t *update_partition = choose_update_partition();

    if (update_partition == NULL) {
        ESP_LOGE(TAG, "No OTA update partition found");
        return ESP_FAIL;
    }

    ESP_LOGI(TAG, "Installing firmware to %s", update_partition->label);

    esp_ota_handle_t ota_handle = 0;

    esp_err_t err = esp_ota_begin(
        update_partition,
        hdr->firmware_size,
        &ota_handle
    );

    if (err != ESP_OK) {
        ESP_LOGE(TAG, "OTA begin failed: %s", esp_err_to_name(err));
        return err;
    }

    uint8_t buf[PAGE_SIZE];
    uint32_t crc = crc32_init();
    size_t offset = 0;

    while (offset < hdr->firmware_size) {
        size_t chunk = hdr->firmware_size - offset;

        if (chunk > PAGE_SIZE) {
            chunk = PAGE_SIZE;
        }

        err = flash_read_chunk(
            hdr->firmware_addr + offset,
            buf,
            chunk
        );

        if (err != ESP_OK) {
            ESP_LOGE(TAG, "Firmware read from module flash failed");
            esp_ota_abort(ota_handle);
            return err;
        }

        crc = crc32_update(crc, buf, chunk);

        err = esp_ota_write(ota_handle, buf, chunk);

        if (err != ESP_OK) {
            ESP_LOGE(TAG, "OTA write failed: %s", esp_err_to_name(err));
            esp_ota_abort(ota_handle);
            return err;
        }

        offset += chunk;

        if ((offset % 16384) == 0 || offset == hdr->firmware_size) {
            ESP_LOGI(TAG, "OTA progress: %u / %u",
                     (unsigned int)offset,
                     (unsigned int)hdr->firmware_size);
        }
    }

    crc = crc32_final(crc);

    ESP_LOGI(TAG, "CRC header=0x%08lX computed=0x%08lX",
             (unsigned long)hdr->firmware_crc32,
             (unsigned long)crc);

    if (crc != hdr->firmware_crc32) {
        ESP_LOGE(TAG, "Firmware CRC mismatch");
        esp_ota_abort(ota_handle);
        return ESP_FAIL;
    }

    err = esp_ota_end(ota_handle);

    if (err != ESP_OK) {
        ESP_LOGE(TAG, "OTA end failed: %s", esp_err_to_name(err));
        return err;
    }

    err = esp_ota_set_boot_partition(update_partition);

    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Set boot partition failed: %s", esp_err_to_name(err));
        return err;
    }

    err = persist_module_meta(hdr, update_partition);

    if (err != ESP_OK) {
        return err;
    }

    ESP_LOGI(TAG, "Firmware installed successfully");
    ESP_LOGI(TAG, "Restarting into sensor payload firmware");

    vTaskDelay(pdMS_TO_TICKS(1000));
    esp_restart();

    return ESP_OK;
}

/* ============================================================
 * Main
 * ============================================================ */

void app_main(void)
{
    ESP_LOGI(TAG, "====================================");
    ESP_LOGI(TAG, "Generalized I2C Sensor Loader Started");
    ESP_LOGI(TAG, "====================================");

    ESP_ERROR_CHECK(init_nvs_storage());
    ESP_ERROR_CHECK(init_module_flash_spi());

    while (1) {
        module_header_t hdr = {0};

        esp_err_t ret = flash_read_exact(
            HEADER_ADDR,
            (uint8_t *)&hdr,
            sizeof(hdr)
        );

        if (ret != ESP_OK) {
            ESP_LOGE(TAG, "Header read failed: %s", esp_err_to_name(ret));
            vTaskDelay(pdMS_TO_TICKS(1000));
            continue;
        }

        if (!validate_module_header(&hdr)) {
            ESP_LOGE(TAG, "Header validation failed");
            vTaskDelay(pdMS_TO_TICKS(1000));
            continue;
        }

        if (same_firmware_already_installed(&hdr)) {
            ESP_LOGI(TAG, "Same firmware already installed");
            ESP_LOGI(TAG, "Booting existing payload firmware");
            boot_installed_firmware();

            vTaskDelay(pdMS_TO_TICKS(1000));
            continue;
        }

        ESP_LOGI(TAG, "New or changed I2C sensor module detected");
        ESP_LOGI(TAG, "Installing payload firmware from module flash");

        ret = install_from_header(&hdr);

        if (ret != ESP_OK) {
            ESP_LOGE(TAG, "Install failed: %s", esp_err_to_name(ret));
            vTaskDelay(pdMS_TO_TICKS(1000));
            continue;
        }
    }
}