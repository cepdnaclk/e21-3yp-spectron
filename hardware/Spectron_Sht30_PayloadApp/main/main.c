#include <stdio.h>
#include <stdint.h>
#include <stdbool.h>
#include <string.h>
#include <math.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "driver/gpio.h"
#include "driver/i2c.h"

#include "esp_err.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_netif.h"
#include "esp_now.h"
#include "esp_sleep.h"
#include "esp_wifi.h"
#include "nvs.h"
#include "nvs_flash.h"

#include "protocol.h"

/*
 * ============================================================
 * AUTO I2C PAYLOAD - CONTROLLER COMPATIBLE VERSION
 * ============================================================
 *
 * Supports:
 *   1. SHT30
 *   2. BME280
 *   3. BMP280
 *   4. GY-530 / VL53L0X
 *
 * Controller compatibility:
 *   - The controller protocol stays unchanged.
 *   - This payload still sends mproto_sht30_data_t.
 *   - Non-SHT30 sensors are encoded into the legacy temp/humidity fields.
 *
 * Encoding:
 *   SHT30:
 *     temperature_c_x100 = temperature
 *     humidity_rh_x100   = humidity
 *
 *   BME280 / BMP280:
 *     temperature_c_x100 = temperature
 *     humidity_rh_x100   = pressure in kPa x100
 *
 *   VL53L0X:
 *     temperature_c_x100 = 0
 *     humidity_rh_x100   = distance in cm x100
 */

static const char *TAG = "BASE_PAYLOAD";

#define BASE_ID                         0x0000B001u
#define WIFI_CHANNEL                    1

#define DISCOVERY_PERIOD_MS             2000
#define DEFAULT_SAMPLE_PERIOD_MS        300000
#define MIN_SAMPLE_PERIOD_MS            10000
#define SENSOR_RESCAN_PERIOD_MS         10000
#define WAKE_SESSION_TIMEOUT_MS         30000
#define TX_FLUSH_DELAY_MS               1000

/*
 * Lab/debug mode:
 * keep the ESP32-C3 awake on USB and emit readings every 10 seconds
 * after config is received so controller/backend behavior is easy to verify.
 */
#define LAB_DEBUG_DISABLE_DEEP_SLEEP    1
#define LAB_DEBUG_SEND_INTERVAL_MS      10000

#define I2C_PORT                        I2C_NUM_0
#define I2C_FREQ_HZ                     100000
#define DEFAULT_I2C_SDA_GPIO            6
#define DEFAULT_I2C_SCL_GPIO            7
#define DEFAULT_I2C_ADDR                0x44

#define CONTROLLER_COMPAT_SENSOR_TYPE   1

#define DETECTED_SENSOR_NONE            0
#define DETECTED_SENSOR_SHT30           1
#define DETECTED_SENSOR_BME280          2
#define DETECTED_SENSOR_BMP280          3
#define DETECTED_SENSOR_VL53L0X         4

#define SHT30_ADDR_1                    0x44
#define SHT30_ADDR_2                    0x45
#define BME_BMP280_ADDR_1               0x76
#define BME_BMP280_ADDR_2               0x77
#define VL53L0X_ADDR                    0x29

#define BME280_REG_ID                   0xD0
#define BME280_REG_CTRL_HUM             0xF2
#define BME280_REG_CTRL_MEAS            0xF4
#define BME280_REG_CONFIG               0xF5
#define BME280_REG_PRESS_MSB            0xF7

#define BME280_CHIP_ID                  0x60
#define BMP280_CHIP_ID                  0x58

#define VL53_REG_SYSRANGE_START         0x00
#define VL53_REG_SYSTEM_INTERRUPT_CLEAR 0x0B
#define VL53_REG_RESULT_INTERRUPT_STATUS 0x13
#define VL53_REG_RESULT_RANGE_STATUS    0x14
#define VL53_REG_IDENTIFICATION_MODEL_ID 0xC0

#define NVS_NS_MODULE                   "module_cfg"
#define NVS_KEY_SAMPLE_MS               "sample_ms"
#define NVS_KEY_TEMP_HI                 "temp_hi"
#define NVS_KEY_HUM_HI                  "hum_hi"
#define NVS_KEY_SENSOR_ID               "sensor_id"
#define NVS_KEY_SENSOR_TYPE             "sensor_type"
#define NVS_KEY_SENSOR_KIND             "sensor_kind"
#define NVS_KEY_SENSOR_NAME             "sensor_name"
#define NVS_KEY_FW_CRC                  "fw_crc"
#define NVS_KEY_I2C_SDA                 "i2c_sda"
#define NVS_KEY_I2C_SCL                 "i2c_scl"
#define NVS_KEY_I2C_ADDR                "i2c_addr"
#define DEFAULT_SENSOR_NAME             "Temperature & Humidity Sensor"

static bool g_base_acked = false;
static bool g_module_acked = false;
static bool g_config_received = false;
static bool g_sensor_changed = false;

static uint8_t g_ctrl_mac[6] = {0};

static uint32_t g_seq = 0;
static uint32_t g_sample_period_ms = DEFAULT_SAMPLE_PERIOD_MS;
static uint32_t g_sensor_id = 0;
static uint32_t g_module_crc32 = 0;

/*
 * g_sensor_type is controller-facing.
 * Keep this compatible with the existing controller firmware.
 */
static uint8_t g_sensor_type = SENSOR_TYPE_NONE;

/*
 * g_detected_sensor_kind is internal to the payload.
 */
static uint8_t g_detected_sensor_kind = DETECTED_SENSOR_NONE;
static uint8_t g_previous_sensor_kind = DETECTED_SENSOR_NONE;

static uint8_t g_i2c_sda_gpio = DEFAULT_I2C_SDA_GPIO;
static uint8_t g_i2c_scl_gpio = DEFAULT_I2C_SCL_GPIO;
static uint8_t g_i2c_addr = DEFAULT_I2C_ADDR;
static uint8_t g_previous_i2c_addr = 0x00;

static char g_sensor_name[MPROTO_SENSOR_NAME_LEN] = DEFAULT_SENSOR_NAME;
static char g_previous_sensor_name[MPROTO_SENSOR_NAME_LEN] = "None";

static int16_t g_temp_hi_x100 = 3500;
static uint16_t g_hum_hi_x100 = 8500;

static uint8_t g_vl53_stop_variable = 0;

typedef struct {
    uint16_t dig_T1;
    int16_t  dig_T2;
    int16_t  dig_T3;

    uint16_t dig_P1;
    int16_t  dig_P2;
    int16_t  dig_P3;
    int16_t  dig_P4;
    int16_t  dig_P5;
    int16_t  dig_P6;
    int16_t  dig_P7;
    int16_t  dig_P8;
    int16_t  dig_P9;

    uint8_t  dig_H1;
    int16_t  dig_H2;
    uint8_t  dig_H3;
    int16_t  dig_H4;
    int16_t  dig_H5;
    int8_t   dig_H6;

    int32_t  t_fine;
    bool     has_humidity;
} bme280_calib_t;

static bme280_calib_t g_bme_calib = {0};

static uint32_t get_effective_send_interval_ms(void)
{
#if LAB_DEBUG_DISABLE_DEEP_SLEEP
    return LAB_DEBUG_SEND_INTERVAL_MS;
#else
    return g_sample_period_ms;
#endif
}

static void print_mac(const char *label, const uint8_t *mac)
{
    ESP_LOGI(TAG,
             "%s %02X:%02X:%02X:%02X:%02X:%02X",
             label,
             mac[0], mac[1], mac[2],
             mac[3], mac[4], mac[5]);
}

static void remember_current_sensor_as_previous(void)
{
    g_previous_sensor_kind = g_detected_sensor_kind;
    g_previous_i2c_addr = g_i2c_addr;
    strlcpy(g_previous_sensor_name, g_sensor_name, sizeof(g_previous_sensor_name));
}

static void set_sensor_identity(uint8_t detected_kind, uint8_t addr, const char *name)
{
    g_detected_sensor_kind = detected_kind;
    g_i2c_addr = addr;

    if (detected_kind == DETECTED_SENSOR_NONE) {
        g_sensor_type = SENSOR_TYPE_NONE;
        g_sensor_id = 0;
    } else {
        g_sensor_type = CONTROLLER_COMPAT_SENSOR_TYPE;

        switch (detected_kind) {
            case DETECTED_SENSOR_SHT30:
                g_sensor_id = 0x00003001u;
                break;
            case DETECTED_SENSOR_BME280:
                g_sensor_id = 0x00002801u;
                break;
            case DETECTED_SENSOR_BMP280:
                g_sensor_id = 0x00002802u;
                break;
            case DETECTED_SENSOR_VL53L0X:
                g_sensor_id = 0x00005301u;
                break;
            default:
                g_sensor_id = 0;
                break;
        }
    }

    strlcpy(g_sensor_name, name, sizeof(g_sensor_name));

    ESP_LOGI(TAG,
             "Detected sensor kind=%u controller_type=%u id=%lu addr=0x%02X name=%s",
             g_detected_sensor_kind,
             g_sensor_type,
             (unsigned long)g_sensor_id,
             g_i2c_addr,
             g_sensor_name);
}

static esp_err_t load_nvs_state(void)
{
    nvs_handle_t nvs;
    esp_err_t err = nvs_open(NVS_NS_MODULE, NVS_READONLY, &nvs);
    bool have_saved_runtime_cfg = false;
    uint32_t tmp = 0;
    size_t previous_name_len = sizeof(g_previous_sensor_name);

    g_sensor_id = 0;
    g_sensor_type = SENSOR_TYPE_NONE;
    g_module_crc32 = 0;
    g_sample_period_ms = DEFAULT_SAMPLE_PERIOD_MS;
    g_temp_hi_x100 = 3500;
    g_hum_hi_x100 = 8500;
    g_i2c_sda_gpio = DEFAULT_I2C_SDA_GPIO;
    g_i2c_scl_gpio = DEFAULT_I2C_SCL_GPIO;
    g_i2c_addr = DEFAULT_I2C_ADDR;
    g_previous_sensor_kind = DETECTED_SENSOR_NONE;
    g_previous_i2c_addr = 0x00;
    strlcpy(g_sensor_name, DEFAULT_SENSOR_NAME, sizeof(g_sensor_name));
    strlcpy(g_previous_sensor_name, "None", sizeof(g_previous_sensor_name));

    if (err != ESP_OK) {
        ESP_LOGW(TAG, "No existing NVS module state. Using defaults.");
        g_config_received = false;
        return ESP_OK;
    }

    if (nvs_get_u32(nvs, NVS_KEY_SENSOR_ID, &g_sensor_id) != ESP_OK) {
        g_sensor_id = 0;
    }

    if (nvs_get_u32(nvs, NVS_KEY_SENSOR_TYPE, &tmp) == ESP_OK) {
        g_sensor_type = (uint8_t)tmp;
    } else {
        g_sensor_type = SENSOR_TYPE_NONE;
    }

    if (nvs_get_u32(nvs, NVS_KEY_SENSOR_KIND, &tmp) == ESP_OK) {
        g_previous_sensor_kind = (uint8_t)tmp;
    }

    if (nvs_get_u32(nvs, NVS_KEY_FW_CRC, &g_module_crc32) != ESP_OK) {
        g_module_crc32 = 0;
    }

    if (nvs_get_str(nvs, NVS_KEY_SENSOR_NAME, g_previous_sensor_name, &previous_name_len) != ESP_OK) {
        strlcpy(g_previous_sensor_name, "Unknown", sizeof(g_previous_sensor_name));
    }

    if (nvs_get_u32(nvs, NVS_KEY_SAMPLE_MS, &g_sample_period_ms) == ESP_OK) {
        have_saved_runtime_cfg = true;
    } else {
        g_sample_period_ms = DEFAULT_SAMPLE_PERIOD_MS;
    }

    if (g_sample_period_ms < MIN_SAMPLE_PERIOD_MS) {
        g_sample_period_ms = MIN_SAMPLE_PERIOD_MS;
    }

    if (nvs_get_i16(nvs, NVS_KEY_TEMP_HI, &g_temp_hi_x100) != ESP_OK) {
        g_temp_hi_x100 = 3500;
    }

    if (nvs_get_u16(nvs, NVS_KEY_HUM_HI, &g_hum_hi_x100) != ESP_OK) {
        g_hum_hi_x100 = 8500;
    }

    if (nvs_get_u8(nvs, NVS_KEY_I2C_ADDR, &g_previous_i2c_addr) != ESP_OK) {
        g_previous_i2c_addr = 0x00;
    }

    /*
     * Keep the payload on the lab wiring for now so stale NVS pin values
     * from older firmware cannot move the bus onto the wrong GPIOs.
     */
    g_i2c_sda_gpio = DEFAULT_I2C_SDA_GPIO;
    g_i2c_scl_gpio = DEFAULT_I2C_SCL_GPIO;
    g_i2c_addr = DEFAULT_I2C_ADDR;

    nvs_close(nvs);

    ESP_LOGI(TAG,
             "Previous sensor from NVS: kind=%u addr=0x%02X name=%s",
             g_previous_sensor_kind,
             g_previous_i2c_addr,
             g_previous_sensor_name);
    ESP_LOGI(TAG,
             "Runtime config loaded: sample_ms=%lu temp_hi=%.2f hum_hi=%.2f",
             (unsigned long)g_sample_period_ms,
             g_temp_hi_x100 / 100.0f,
             g_hum_hi_x100 / 100.0f);

    g_config_received = have_saved_runtime_cfg;
    if (g_config_received) {
        ESP_LOGI(TAG, "Using persisted runtime config from NVS for this wake session");
    }

    return ESP_OK;
}

static esp_err_t save_current_sensor_to_nvs(void)
{
    nvs_handle_t nvs;
    esp_err_t err = nvs_open(NVS_NS_MODULE, NVS_READWRITE, &nvs);

    if (err != ESP_OK) {
        ESP_LOGE(TAG, "NVS open failed while saving sensor: %s", esp_err_to_name(err));
        return err;
    }

    if ((err = nvs_set_u32(nvs, NVS_KEY_SENSOR_ID, g_sensor_id)) != ESP_OK) {
        goto done;
    }
    if ((err = nvs_set_u32(nvs, NVS_KEY_SENSOR_TYPE, g_sensor_type)) != ESP_OK) {
        goto done;
    }
    if ((err = nvs_set_u32(nvs, NVS_KEY_SENSOR_KIND, g_detected_sensor_kind)) != ESP_OK) {
        goto done;
    }
    if ((err = nvs_set_u32(nvs, NVS_KEY_FW_CRC, g_module_crc32)) != ESP_OK) {
        goto done;
    }
    if ((err = nvs_set_u8(nvs, NVS_KEY_I2C_SDA, g_i2c_sda_gpio)) != ESP_OK) {
        goto done;
    }
    if ((err = nvs_set_u8(nvs, NVS_KEY_I2C_SCL, g_i2c_scl_gpio)) != ESP_OK) {
        goto done;
    }
    if ((err = nvs_set_u8(nvs, NVS_KEY_I2C_ADDR, g_i2c_addr)) != ESP_OK) {
        goto done;
    }
    if ((err = nvs_set_str(nvs, NVS_KEY_SENSOR_NAME, g_sensor_name)) != ESP_OK) {
        goto done;
    }

    err = nvs_commit(nvs);

done:
    nvs_close(nvs);

    if (err == ESP_OK) {
        remember_current_sensor_as_previous();
        ESP_LOGI(TAG,
                 "Saved current sensor to NVS: kind=%u type=%u id=%lu addr=0x%02X name=%s",
                 g_detected_sensor_kind,
                 g_sensor_type,
                 (unsigned long)g_sensor_id,
                 g_i2c_addr,
                 g_sensor_name);
    } else {
        ESP_LOGE(TAG, "Saving sensor to NVS failed: %s", esp_err_to_name(err));
    }

    return err;
}

static void compare_sensor_with_nvs_and_save_if_needed(void)
{
    bool changed =
        g_previous_sensor_kind != g_detected_sensor_kind ||
        g_previous_i2c_addr != g_i2c_addr ||
        strcmp(g_previous_sensor_name, g_sensor_name) != 0;

    if (changed) {
        ESP_LOGW(TAG,
                 "SENSOR CHANGED: old_kind=%u old_addr=0x%02X old_name=%s -> new_kind=%u new_addr=0x%02X new_name=%s",
                 g_previous_sensor_kind,
                 g_previous_i2c_addr,
                 g_previous_sensor_name,
                 g_detected_sensor_kind,
                 g_i2c_addr,
                 g_sensor_name);

        g_sensor_changed = true;
        g_config_received = false;
        save_current_sensor_to_nvs();
    } else {
        ESP_LOGI(TAG, "Same sensor as previous boot");
        g_sensor_changed = false;
    }
}

static esp_err_t save_runtime_cfg(void)
{
    nvs_handle_t nvs;
    esp_err_t err = nvs_open(NVS_NS_MODULE, NVS_READWRITE, &nvs);

    if (err != ESP_OK) {
        return err;
    }

    if ((err = nvs_set_u32(nvs, NVS_KEY_SAMPLE_MS, g_sample_period_ms)) != ESP_OK) {
        nvs_close(nvs);
        return err;
    }

    if ((err = nvs_set_i16(nvs, NVS_KEY_TEMP_HI, g_temp_hi_x100)) != ESP_OK) {
        nvs_close(nvs);
        return err;
    }

    if ((err = nvs_set_u16(nvs, NVS_KEY_HUM_HI, g_hum_hi_x100)) != ESP_OK) {
        nvs_close(nvs);
        return err;
    }

    err = nvs_commit(nvs);
    nvs_close(nvs);
    return err;
}

static esp_err_t i2c_master_init_dynamic(void)
{
    i2c_config_t conf = {
        .mode = I2C_MODE_MASTER,
        .sda_io_num = g_i2c_sda_gpio,
        .scl_io_num = g_i2c_scl_gpio,
        .sda_pullup_en = GPIO_PULLUP_ENABLE,
        .scl_pullup_en = GPIO_PULLUP_ENABLE,
        .master.clk_speed = I2C_FREQ_HZ,
        .clk_flags = 0
    };

    ESP_ERROR_CHECK(i2c_param_config(I2C_PORT, &conf));
    return i2c_driver_install(I2C_PORT, conf.mode, 0, 0, 0);
}

static esp_err_t i2c_write_u8(uint8_t addr, uint8_t reg, uint8_t value)
{
    uint8_t data[2] = {reg, value};
    return i2c_master_write_to_device(
        I2C_PORT,
        addr,
        data,
        sizeof(data),
        pdMS_TO_TICKS(100)
    );
}

static esp_err_t i2c_read_u8(uint8_t addr, uint8_t reg, uint8_t *value)
{
    return i2c_master_write_read_device(
        I2C_PORT,
        addr,
        &reg,
        1,
        value,
        1,
        pdMS_TO_TICKS(100)
    );
}

static esp_err_t i2c_read_bytes(uint8_t addr, uint8_t reg, uint8_t *buf, size_t len)
{
    return i2c_master_write_read_device(
        I2C_PORT,
        addr,
        &reg,
        1,
        buf,
        len,
        pdMS_TO_TICKS(100)
    );
}

static uint8_t sht30_crc8(const uint8_t *data, int len)
{
    uint8_t crc = 0xFF;

    for (int i = 0; i < len; i++) {
        crc ^= data[i];

        for (int j = 0; j < 8; j++) {
            if (crc & 0x80) {
                crc = (crc << 1) ^ 0x31;
            } else {
                crc <<= 1;
            }
        }
    }

    return crc;
}

static esp_err_t sht30_read_at(uint8_t addr, float *temperature_c, float *humidity_rh)
{
    uint8_t cmd[2] = {0x24, 0x00};
    uint8_t rx[6] = {0};

    esp_err_t ret = i2c_master_write_to_device(
        I2C_PORT,
        addr,
        cmd,
        sizeof(cmd),
        pdMS_TO_TICKS(100)
    );
    if (ret != ESP_OK) {
        return ret;
    }

    vTaskDelay(pdMS_TO_TICKS(50));

    ret = i2c_master_read_from_device(
        I2C_PORT,
        addr,
        rx,
        sizeof(rx),
        pdMS_TO_TICKS(100)
    );
    if (ret != ESP_OK) {
        return ret;
    }

    if (sht30_crc8(&rx[0], 2) != rx[2]) {
        ESP_LOGW(TAG,
                 "SHT30 CRC fail temperature raw=%02X %02X %02X %02X %02X %02X",
                 rx[0], rx[1], rx[2], rx[3], rx[4], rx[5]);
        return ESP_FAIL;
    }

    if (sht30_crc8(&rx[3], 2) != rx[5]) {
        ESP_LOGW(TAG,
                 "SHT30 CRC fail humidity raw=%02X %02X %02X %02X %02X %02X",
                 rx[0], rx[1], rx[2], rx[3], rx[4], rx[5]);
        return ESP_FAIL;
    }

    uint16_t raw_t = ((uint16_t)rx[0] << 8) | rx[1];
    uint16_t raw_h = ((uint16_t)rx[3] << 8) | rx[4];

    *temperature_c = -45.0f + 175.0f * ((float)raw_t / 65535.0f);
    *humidity_rh = 100.0f * ((float)raw_h / 65535.0f);
    return ESP_OK;
}

static bool sht30_detect(uint8_t *detected_addr)
{
    float t = 0.0f;
    float h = 0.0f;

    if (sht30_read_at(SHT30_ADDR_1, &t, &h) == ESP_OK) {
        *detected_addr = SHT30_ADDR_1;
        return true;
    }

    if (sht30_read_at(SHT30_ADDR_2, &t, &h) == ESP_OK) {
        *detected_addr = SHT30_ADDR_2;
        return true;
    }

    return false;
}

static uint16_t read_u16_le(const uint8_t *buf)
{
    return (uint16_t)buf[0] | ((uint16_t)buf[1] << 8);
}

static int16_t read_s16_le(const uint8_t *buf)
{
    return (int16_t)read_u16_le(buf);
}

static esp_err_t bme280_read_calibration(uint8_t addr, bool has_humidity)
{
    uint8_t buf[24] = {0};
    esp_err_t ret = i2c_read_bytes(addr, 0x88, buf, sizeof(buf));

    if (ret != ESP_OK) {
        return ret;
    }

    g_bme_calib.dig_T1 = read_u16_le(&buf[0]);
    g_bme_calib.dig_T2 = read_s16_le(&buf[2]);
    g_bme_calib.dig_T3 = read_s16_le(&buf[4]);
    g_bme_calib.dig_P1 = read_u16_le(&buf[6]);
    g_bme_calib.dig_P2 = read_s16_le(&buf[8]);
    g_bme_calib.dig_P3 = read_s16_le(&buf[10]);
    g_bme_calib.dig_P4 = read_s16_le(&buf[12]);
    g_bme_calib.dig_P5 = read_s16_le(&buf[14]);
    g_bme_calib.dig_P6 = read_s16_le(&buf[16]);
    g_bme_calib.dig_P7 = read_s16_le(&buf[18]);
    g_bme_calib.dig_P8 = read_s16_le(&buf[20]);
    g_bme_calib.dig_P9 = read_s16_le(&buf[22]);
    g_bme_calib.has_humidity = has_humidity;

    if (has_humidity) {
        uint8_t h1 = 0;
        uint8_t hbuf[7] = {0};

        ret = i2c_read_u8(addr, 0xA1, &h1);
        if (ret != ESP_OK) {
            return ret;
        }

        ret = i2c_read_bytes(addr, 0xE1, hbuf, sizeof(hbuf));
        if (ret != ESP_OK) {
            return ret;
        }

        g_bme_calib.dig_H1 = h1;
        g_bme_calib.dig_H2 = read_s16_le(&hbuf[0]);
        g_bme_calib.dig_H3 = hbuf[2];
        g_bme_calib.dig_H4 = (int16_t)((((int16_t)hbuf[3]) << 4) | (hbuf[4] & 0x0F));
        g_bme_calib.dig_H5 = (int16_t)((((int16_t)hbuf[5]) << 4) | (hbuf[4] >> 4));
        g_bme_calib.dig_H6 = (int8_t)hbuf[6];
    }

    return ESP_OK;
}

static esp_err_t bme280_configure(uint8_t addr, bool has_humidity)
{
    esp_err_t ret;

    if (has_humidity) {
        ret = i2c_write_u8(addr, BME280_REG_CTRL_HUM, 0x01);
        if (ret != ESP_OK) {
            return ret;
        }
    }

    ret = i2c_write_u8(addr, BME280_REG_CONFIG, 0x00);
    if (ret != ESP_OK) {
        return ret;
    }

    ret = i2c_write_u8(addr, BME280_REG_CTRL_MEAS, 0x27);
    if (ret != ESP_OK) {
        return ret;
    }

    vTaskDelay(pdMS_TO_TICKS(100));
    return bme280_read_calibration(addr, has_humidity);
}

static int32_t bme280_compensate_temperature(int32_t adc_T)
{
    int32_t var1;
    int32_t var2;
    int32_t temp;

    var1 = ((((adc_T >> 3) - ((int32_t)g_bme_calib.dig_T1 << 1))) *
            ((int32_t)g_bme_calib.dig_T2)) >> 11;
    var2 = (((((adc_T >> 4) - ((int32_t)g_bme_calib.dig_T1)) *
              ((adc_T >> 4) - ((int32_t)g_bme_calib.dig_T1))) >> 12) *
            ((int32_t)g_bme_calib.dig_T3)) >> 14;

    g_bme_calib.t_fine = var1 + var2;
    temp = (g_bme_calib.t_fine * 5 + 128) >> 8;
    return temp;
}

static uint32_t bme280_compensate_pressure(int32_t adc_P)
{
    int64_t var1;
    int64_t var2;
    int64_t p;

    var1 = ((int64_t)g_bme_calib.t_fine) - 128000;
    var2 = var1 * var1 * (int64_t)g_bme_calib.dig_P6;
    var2 = var2 + ((var1 * (int64_t)g_bme_calib.dig_P5) << 17);
    var2 = var2 + (((int64_t)g_bme_calib.dig_P4) << 35);
    var1 = ((var1 * var1 * (int64_t)g_bme_calib.dig_P3) >> 8) +
           ((var1 * (int64_t)g_bme_calib.dig_P2) << 12);
    var1 = (((((int64_t)1) << 47) + var1)) * ((int64_t)g_bme_calib.dig_P1) >> 33;

    if (var1 == 0) {
        return 0;
    }

    p = 1048576 - adc_P;
    p = (((p << 31) - var2) * 3125) / var1;
    var1 = (((int64_t)g_bme_calib.dig_P9) * (p >> 13) * (p >> 13)) >> 25;
    var2 = (((int64_t)g_bme_calib.dig_P8) * p) >> 19;
    p = ((p + var1 + var2) >> 8) + (((int64_t)g_bme_calib.dig_P7) << 4);

    return (uint32_t)(p / 256);
}

static uint32_t bme280_compensate_humidity(int32_t adc_H)
{
    int32_t v_x1_u32r;

    v_x1_u32r = g_bme_calib.t_fine - ((int32_t)76800);
    v_x1_u32r = (((((adc_H << 14) -
                    (((int32_t)g_bme_calib.dig_H4) << 20) -
                    (((int32_t)g_bme_calib.dig_H5) * v_x1_u32r)) +
                   ((int32_t)16384)) >> 15) *
                 (((((((v_x1_u32r * ((int32_t)g_bme_calib.dig_H6)) >> 10) *
                      (((v_x1_u32r * ((int32_t)g_bme_calib.dig_H3)) >> 11) +
                       ((int32_t)32768))) >> 10) +
                    ((int32_t)2097152)) *
                   ((int32_t)g_bme_calib.dig_H2) +
                   8192) >> 14));

    v_x1_u32r = v_x1_u32r -
                (((((v_x1_u32r >> 15) * (v_x1_u32r >> 15)) >> 7) *
                  ((int32_t)g_bme_calib.dig_H1)) >> 4);

    if (v_x1_u32r < 0) {
        v_x1_u32r = 0;
    }
    if (v_x1_u32r > 419430400) {
        v_x1_u32r = 419430400;
    }

    return (uint32_t)(((uint32_t)(v_x1_u32r >> 12) * 100U) / 1024U);
}

static esp_err_t bme_bmp280_read(uint8_t addr,
                                 int16_t *temperature_c_x100,
                                 uint32_t *pressure_pa,
                                 uint16_t *humidity_rh_x100)
{
    uint8_t data[8] = {0};
    size_t len = g_bme_calib.has_humidity ? 8 : 6;
    esp_err_t ret = i2c_read_bytes(addr, BME280_REG_PRESS_MSB, data, len);

    if (ret != ESP_OK) {
        return ret;
    }

    int32_t adc_P = ((int32_t)data[0] << 12) |
                    ((int32_t)data[1] << 4) |
                    ((int32_t)data[2] >> 4);
    int32_t adc_T = ((int32_t)data[3] << 12) |
                    ((int32_t)data[4] << 4) |
                    ((int32_t)data[5] >> 4);

    *temperature_c_x100 = (int16_t)bme280_compensate_temperature(adc_T);
    *pressure_pa = bme280_compensate_pressure(adc_P);

    if (g_bme_calib.has_humidity) {
        int32_t adc_H = ((int32_t)data[6] << 8) | data[7];
        *humidity_rh_x100 = (uint16_t)bme280_compensate_humidity(adc_H);
    } else {
        *humidity_rh_x100 = 0xFFFF;
    }

    return ESP_OK;
}

static bool bme_bmp280_detect(uint8_t *detected_addr, uint8_t *detected_kind)
{
    uint8_t addresses[2] = {BME_BMP280_ADDR_1, BME_BMP280_ADDR_2};

    for (int i = 0; i < 2; i++) {
        uint8_t addr = addresses[i];
        uint8_t chip_id = 0;

        if (i2c_read_u8(addr, BME280_REG_ID, &chip_id) != ESP_OK) {
            continue;
        }

        if (chip_id == BME280_CHIP_ID) {
            if (bme280_configure(addr, true) == ESP_OK) {
                *detected_addr = addr;
                *detected_kind = DETECTED_SENSOR_BME280;
                return true;
            }
        } else if (chip_id == BMP280_CHIP_ID) {
            if (bme280_configure(addr, false) == ESP_OK) {
                *detected_addr = addr;
                *detected_kind = DETECTED_SENSOR_BMP280;
                return true;
            }
        }
    }

    return false;
}

static esp_err_t vl53l0x_init(uint8_t addr)
{
    uint8_t model_id = 0;
    esp_err_t ret = i2c_read_u8(addr, VL53_REG_IDENTIFICATION_MODEL_ID, &model_id);

    if (ret != ESP_OK) {
        return ret;
    }
    if (model_id != 0xEE) {
        ESP_LOGW(TAG, "VL53L0X wrong model id: 0x%02X", model_id);
        return ESP_FAIL;
    }

    if ((ret = i2c_write_u8(addr, 0x88, 0x00)) != ESP_OK) return ret;
    if ((ret = i2c_write_u8(addr, 0x80, 0x01)) != ESP_OK) return ret;
    if ((ret = i2c_write_u8(addr, 0xFF, 0x01)) != ESP_OK) return ret;
    if ((ret = i2c_write_u8(addr, 0x00, 0x00)) != ESP_OK) return ret;

    ret = i2c_read_u8(addr, 0x91, &g_vl53_stop_variable);
    if (ret != ESP_OK) {
        return ret;
    }

    if ((ret = i2c_write_u8(addr, 0x00, 0x01)) != ESP_OK) return ret;
    if ((ret = i2c_write_u8(addr, 0xFF, 0x00)) != ESP_OK) return ret;
    if ((ret = i2c_write_u8(addr, 0x80, 0x00)) != ESP_OK) return ret;
    if ((ret = i2c_write_u8(addr, 0x0A, 0x04)) != ESP_OK) return ret;
    if ((ret = i2c_write_u8(addr, VL53_REG_SYSTEM_INTERRUPT_CLEAR, 0x01)) != ESP_OK) return ret;

    ESP_LOGI(TAG, "VL53L0X initialized stop_variable=0x%02X", g_vl53_stop_variable);
    return ESP_OK;
}

static esp_err_t vl53l0x_read_mm(uint8_t addr, uint16_t *distance_mm, uint8_t *range_status)
{
    esp_err_t ret;

    if ((ret = i2c_write_u8(addr, 0x80, 0x01)) != ESP_OK) return ret;
    if ((ret = i2c_write_u8(addr, 0xFF, 0x01)) != ESP_OK) return ret;
    if ((ret = i2c_write_u8(addr, 0x00, 0x00)) != ESP_OK) return ret;
    if ((ret = i2c_write_u8(addr, 0x91, g_vl53_stop_variable)) != ESP_OK) return ret;
    if ((ret = i2c_write_u8(addr, 0x00, 0x01)) != ESP_OK) return ret;
    if ((ret = i2c_write_u8(addr, 0xFF, 0x00)) != ESP_OK) return ret;
    if ((ret = i2c_write_u8(addr, 0x80, 0x00)) != ESP_OK) return ret;

    ret = i2c_write_u8(addr, VL53_REG_SYSRANGE_START, 0x01);
    if (ret != ESP_OK) {
        return ret;
    }

    uint8_t interrupt_status = 0;
    int timeout_ms = 0;
    while (timeout_ms < 500) {
        ret = i2c_read_u8(addr, VL53_REG_RESULT_INTERRUPT_STATUS, &interrupt_status);
        if (ret != ESP_OK) {
            return ret;
        }
        if (interrupt_status & 0x07) {
            break;
        }

        vTaskDelay(pdMS_TO_TICKS(10));
        timeout_ms += 10;
    }

    if (!(interrupt_status & 0x07)) {
        ESP_LOGW(TAG, "VL53L0X range timeout");
        return ESP_ERR_TIMEOUT;
    }

    uint8_t data[12] = {0};
    ret = i2c_read_bytes(addr, VL53_REG_RESULT_RANGE_STATUS, data, sizeof(data));
    if (ret != ESP_OK) {
        return ret;
    }

    *range_status = data[0] & 0x78;
    *distance_mm = ((uint16_t)data[10] << 8) | data[11];

    return i2c_write_u8(addr, VL53_REG_SYSTEM_INTERRUPT_CLEAR, 0x01);
}

static bool vl53l0x_detect(uint8_t *detected_addr)
{
    uint8_t model_id = 0;

    if (i2c_read_u8(VL53L0X_ADDR, VL53_REG_IDENTIFICATION_MODEL_ID, &model_id) != ESP_OK) {
        return false;
    }
    if (model_id != 0xEE) {
        return false;
    }
    if (vl53l0x_init(VL53L0X_ADDR) != ESP_OK) {
        return false;
    }

    *detected_addr = VL53L0X_ADDR;
    return true;
}

static void detect_connected_sensor(void)
{
    uint8_t addr = 0;
    uint8_t detected_kind = DETECTED_SENSOR_NONE;

    ESP_LOGI(TAG, "Scanning known I2C sensors on SDA=%d SCL=%d",
             g_i2c_sda_gpio,
             g_i2c_scl_gpio);

    if (sht30_detect(&addr)) {
        set_sensor_identity(DETECTED_SENSOR_SHT30, addr, "SHT30 Temperature Humidity");
        return;
    }

    if (bme_bmp280_detect(&addr, &detected_kind)) {
        if (detected_kind == DETECTED_SENSOR_BME280) {
            set_sensor_identity(DETECTED_SENSOR_BME280, addr, "BME280 Temp Hum Pressure");
        } else {
            set_sensor_identity(DETECTED_SENSOR_BMP280, addr, "BMP280 Temp Pressure");
        }
        return;
    }

    if (vl53l0x_detect(&addr)) {
        set_sensor_identity(DETECTED_SENSOR_VL53L0X, addr, "VL53L0X Laser Distance");
        return;
    }

    set_sensor_identity(DETECTED_SENSOR_NONE, 0x00, "No Sensor");
    ESP_LOGW(TAG, "No supported I2C sensor detected");
}

static void wifi_init_for_espnow(void)
{
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_start());
    ESP_ERROR_CHECK(esp_wifi_set_ps(WIFI_PS_NONE));
    ESP_ERROR_CHECK(esp_wifi_set_channel(WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE));
}

static void add_broadcast_peer(void)
{
    uint8_t broadcast[6] = {
        0xff, 0xff, 0xff,
        0xff, 0xff, 0xff
    };
    esp_now_peer_info_t peer = {0};

    memcpy(peer.peer_addr, broadcast, 6);
    peer.channel = 0;
    peer.ifidx = WIFI_IF_STA;
    peer.encrypt = false;

    esp_err_t err = esp_now_add_peer(&peer);
    if (err == ESP_OK || err == ESP_ERR_ESPNOW_EXIST) {
        ESP_LOGI(TAG, "Broadcast peer ready");
    } else {
        ESP_ERROR_CHECK(err);
    }
}

static void add_controller_peer_if_needed(const uint8_t *mac)
{
    if (esp_now_is_peer_exist(mac)) {
        return;
    }

    esp_now_peer_info_t peer = {0};
    memcpy(peer.peer_addr, mac, 6);
    peer.channel = 0;
    peer.ifidx = WIFI_IF_STA;
    peer.encrypt = false;

    esp_err_t err = esp_now_add_peer(&peer);
    if (err == ESP_OK || err == ESP_ERR_ESPNOW_EXIST) {
        print_mac("Controller peer added:", mac);
    } else {
        ESP_LOGE(TAG, "add_controller_peer failed: %s", esp_err_to_name(err));
    }
}

static void on_data_sent(const wifi_tx_info_t *tx_info, esp_now_send_status_t status)
{
    if (tx_info && tx_info->des_addr) {
        ESP_LOGI(TAG,
                 "SEND to %02X:%02X:%02X:%02X:%02X:%02X status=%s",
                 tx_info->des_addr[0],
                 tx_info->des_addr[1],
                 tx_info->des_addr[2],
                 tx_info->des_addr[3],
                 tx_info->des_addr[4],
                 tx_info->des_addr[5],
                 status == ESP_NOW_SEND_SUCCESS ? "OK" : "FAIL");
    }
}

static void send_base_hello(void)
{
    uint8_t my_mac[6];
    ESP_ERROR_CHECK(esp_read_mac(my_mac, ESP_MAC_WIFI_STA));

    mproto_base_hello_t pl = {0};
    memcpy(pl.base_mac, my_mac, 6);
    pl.fw_version = 3;
    pl.has_module = (g_sensor_type != SENSOR_TYPE_NONE);

    uint8_t broadcast[6] = {
        0xff, 0xff, 0xff,
        0xff, 0xff, 0xff
    };

    mproto_frame_t f = {0};
    f.msg_type = MSG_BASE_HELLO;
    f.base_id = BASE_ID;
    f.sensor_type = g_sensor_type;
    f.sensor_id = g_sensor_id;
    f.payload_len = sizeof(pl);
    f.seq_num = ++g_seq;

    memcpy(f.payload, &pl, sizeof(pl));

    esp_err_t err = esp_now_send(broadcast, (uint8_t *)&f, sizeof(f));
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "send_base_hello failed: %s", esp_err_to_name(err));
    } else {
        ESP_LOGI(TAG,
                 "BASE_HELLO sent base_id=%lu seq=%lu has_module=%u sensor=%s changed=%u",
                 (unsigned long)BASE_ID,
                 (unsigned long)f.seq_num,
                 pl.has_module,
                 g_sensor_name,
                 g_sensor_changed);
    }
}

static void send_module_info(void)
{
    if (!g_base_acked || g_sensor_type == SENSOR_TYPE_NONE) {
        return;
    }

    mproto_module_info_t pl = {0};
    strlcpy(pl.sensor_name, g_sensor_name, sizeof(pl.sensor_name));
    pl.module_crc32 = g_module_crc32;
    pl.sample_period_ms = g_sample_period_ms;
    pl.temp_threshold_hi_x100 = g_temp_hi_x100;
    pl.humidity_threshold_hi_x100 = g_hum_hi_x100;
    pl.i2c_sda_gpio = g_i2c_sda_gpio;
    pl.i2c_scl_gpio = g_i2c_scl_gpio;
    pl.i2c_addr = g_i2c_addr;

    mproto_frame_t f = {0};
    f.msg_type = MSG_MODULE_INFO;
    f.sensor_type = g_sensor_type;
    f.base_id = BASE_ID;
    f.sensor_id = g_sensor_id;
    f.payload_len = sizeof(pl);
    f.seq_num = ++g_seq;

    memcpy(f.payload, &pl, sizeof(pl));

    esp_err_t err = esp_now_send(g_ctrl_mac, (uint8_t *)&f, sizeof(f));
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "send_module_info failed: %s", esp_err_to_name(err));
    } else {
        ESP_LOGI(TAG,
                 "MODULE_INFO sent id=%lu type=%u kind=%u name=%s addr=0x%02X changed=%u seq=%lu period=%lu",
                 (unsigned long)g_sensor_id,
                 g_sensor_type,
                 g_detected_sensor_kind,
                 g_sensor_name,
                 g_i2c_addr,
                 g_sensor_changed,
                 (unsigned long)f.seq_num,
                 (unsigned long)g_sample_period_ms);
    }
}

static void send_config_ack(uint32_t acked_seq, uint8_t status, const char *detail)
{
    if (!g_base_acked) {
        return;
    }

    mproto_ack_t pl = {
        .acked_seq_num = acked_seq,
        .acked_msg_type = MSG_CONFIG_SET,
        .status = status
    };
    strlcpy(pl.detail, detail, sizeof(pl.detail));

    mproto_frame_t f = {0};
    f.msg_type = MSG_CONFIG_ACK;
    f.sensor_type = g_sensor_type;
    f.base_id = BASE_ID;
    f.sensor_id = g_sensor_id;
    f.payload_len = sizeof(pl);
    f.seq_num = ++g_seq;

    memcpy(f.payload, &pl, sizeof(pl));

    esp_err_t err = esp_now_send(g_ctrl_mac, (uint8_t *)&f, sizeof(f));
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "send_config_ack failed: %s", esp_err_to_name(err));
    } else {
        ESP_LOGI(TAG,
                 "CONFIG_ACK sent acked_seq=%lu status=%u detail=%s",
                 (unsigned long)acked_seq,
                 status,
                 pl.detail);
    }
}

static void enter_timed_deep_sleep(const char *reason, uint32_t sleep_ms)
{
    if (sleep_ms < MIN_SAMPLE_PERIOD_MS) {
        sleep_ms = MIN_SAMPLE_PERIOD_MS;
    }

    ESP_LOGI(TAG,
             "Entering deep sleep for %lu ms (%s)",
             (unsigned long)sleep_ms,
             reason ? reason : "scheduled");

    esp_now_deinit();
    esp_wifi_stop();
    i2c_driver_delete(I2C_PORT);
    esp_sleep_enable_timer_wakeup((uint64_t)sleep_ms * 1000ULL);
    esp_deep_sleep_start();
}

static bool send_sensor_data(void)
{
    if (!g_module_acked) {
        return false;
    }

    if (g_sensor_type == SENSOR_TYPE_NONE || g_detected_sensor_kind == DETECTED_SENSOR_NONE) {
        ESP_LOGW(TAG, "No valid sensor connected. Data not sent.");
        return false;
    }

    mproto_sht30_data_t pl = {0};
    pl.uptime_s = esp_log_timestamp() / 1000;
    pl.alert_flags = 0;

    switch (g_detected_sensor_kind) {
        case DETECTED_SENSOR_SHT30: {
            float t = 0.0f;
            float h = 0.0f;

            esp_err_t ret = sht30_read_at(g_i2c_addr, &t, &h);
            if (ret != ESP_OK) {
                ESP_LOGW(TAG, "SHT30 read failed: %s", esp_err_to_name(ret));
                return false;
            }

            pl.temperature_c_x100 = (int16_t)lroundf(t * 100.0f);
            pl.humidity_rh_x100 = (uint16_t)lroundf(h * 100.0f);

            if (pl.temperature_c_x100 >= g_temp_hi_x100) {
                pl.alert_flags |= 0x01;
            }
            if (pl.humidity_rh_x100 >= g_hum_hi_x100) {
                pl.alert_flags |= 0x02;
            }

            ESP_LOGI(TAG, "Prepared SHT30 data: temp=%.2fC hum=%.2f%%", t, h);
            break;
        }

        case DETECTED_SENSOR_BME280:
        case DETECTED_SENSOR_BMP280: {
            int16_t temperature_c_x100 = 0;
            uint32_t pressure_pa = 0;
            uint16_t humidity_rh_x100 = 0xFFFF;

            esp_err_t ret = bme_bmp280_read(
                g_i2c_addr,
                &temperature_c_x100,
                &pressure_pa,
                &humidity_rh_x100
            );
            if (ret != ESP_OK) {
                ESP_LOGW(TAG, "BME/BMP280 read failed: %s", esp_err_to_name(ret));
                return false;
            }

            float pressure_kpa = pressure_pa / 1000.0f;
            pl.temperature_c_x100 = temperature_c_x100;
            pl.humidity_rh_x100 = (uint16_t)lroundf(pressure_kpa * 100.0f);

            if (pl.temperature_c_x100 >= g_temp_hi_x100) {
                pl.alert_flags |= 0x01;
            }

            ESP_LOGI(TAG,
                     "Prepared BME/BMP280 data: temp=%.2fC pressure=%luPa pressure=%.2fkPa encoded_humidity_field=%u",
                     temperature_c_x100 / 100.0f,
                     (unsigned long)pressure_pa,
                     pressure_kpa,
                     pl.humidity_rh_x100);
            break;
        }

        case DETECTED_SENSOR_VL53L0X: {
            uint16_t distance_mm = 0;
            uint8_t range_status = 0;

            esp_err_t ret = vl53l0x_read_mm(g_i2c_addr, &distance_mm, &range_status);
            if (ret != ESP_OK) {
                ESP_LOGW(TAG, "VL53L0X read failed: %s", esp_err_to_name(ret));
                return false;
            }

            float distance_cm = distance_mm / 10.0f;
            pl.temperature_c_x100 = 0;
            pl.humidity_rh_x100 = (uint16_t)lroundf(distance_cm * 100.0f);
            pl.alert_flags = range_status;

            ESP_LOGI(TAG,
                     "Prepared VL53L0X data: distance=%umm distance=%.2fcm encoded_humidity_field=%u status=0x%02X",
                     distance_mm,
                     distance_cm,
                     pl.humidity_rh_x100,
                     range_status);
            break;
        }

        default:
            ESP_LOGW(TAG, "Unsupported detected sensor kind=%u", g_detected_sensor_kind);
            return false;
    }

    mproto_frame_t f = {0};
    f.msg_type = MSG_SENSOR_DATA;
    f.sensor_type = g_sensor_type;
    f.base_id = BASE_ID;
    f.sensor_id = g_sensor_id;
    f.payload_len = sizeof(pl);
    f.seq_num = ++g_seq;

    memcpy(f.payload, &pl, sizeof(pl));

    esp_err_t err = esp_now_send(g_ctrl_mac, (uint8_t *)&f, sizeof(f));
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "send_sensor_data failed: %s", esp_err_to_name(err));
        return false;
    }

    ESP_LOGI(TAG,
             "SENSOR_DATA sent seq=%lu sensor=%s kind=%u temp_field=%d humidity_field=%u alerts=0x%02X next=%lu_ms",
             (unsigned long)f.seq_num,
             g_sensor_name,
             g_detected_sensor_kind,
             pl.temperature_c_x100,
             pl.humidity_rh_x100,
             pl.alert_flags,
             (unsigned long)get_effective_send_interval_ms());
    return true;
}

static void on_data_recv(const esp_now_recv_info_t *recv_info, const uint8_t *data, int len)
{
    if (!recv_info || !recv_info->src_addr || !data) {
        return;
    }

    if (len != sizeof(mproto_frame_t)) {
        ESP_LOGW(TAG, "Unexpected len=%d expected=%d", len, (int)sizeof(mproto_frame_t));
        return;
    }

    mproto_frame_t f;
    memcpy(&f, data, sizeof(f));

    print_mac("RX FROM:", recv_info->src_addr);
    ESP_LOGI(TAG,
             "RX type=%u seq=%lu base_id=%lu sensor_id=%lu payload_len=%u",
             f.msg_type,
             (unsigned long)f.seq_num,
             (unsigned long)f.base_id,
             (unsigned long)f.sensor_id,
             f.payload_len);

    switch (f.msg_type) {
        case MSG_BASE_ACK:
            memcpy(g_ctrl_mac, recv_info->src_addr, 6);
            add_controller_peer_if_needed(recv_info->src_addr);
            g_base_acked = true;
            ESP_LOGI(TAG, "BASE_ACK received for base_id=%lu", (unsigned long)BASE_ID);
            break;

        case MSG_MODULE_ACK:
            memcpy(g_ctrl_mac, recv_info->src_addr, 6);
            add_controller_peer_if_needed(recv_info->src_addr);
            g_module_acked = true;
            ESP_LOGI(TAG,
                     "MODULE_ACK received sensor_id=%lu sensor=%s",
                     (unsigned long)g_sensor_id,
                     g_sensor_name);
            break;

        case MSG_CONFIG_SET:
            if (f.base_id != BASE_ID || f.sensor_id != g_sensor_id) {
                send_config_ack(f.seq_num, ACK_STATUS_BAD_TARGET, "bad_target");
                return;
            }

            if (f.payload_len != sizeof(mproto_config_set_t)) {
                send_config_ack(f.seq_num, ACK_STATUS_BAD_PAYLOAD, "bad_payload");
                return;
            }

            {
                mproto_config_set_t pl;
                memcpy(&pl, f.payload, sizeof(pl));

                g_sample_period_ms = pl.sample_period_ms;
                if (g_sample_period_ms < MIN_SAMPLE_PERIOD_MS) {
                    g_sample_period_ms = MIN_SAMPLE_PERIOD_MS;
                }

                g_temp_hi_x100 = pl.temp_threshold_hi_x100;
                g_hum_hi_x100 = pl.humidity_threshold_hi_x100;

                esp_err_t err = save_runtime_cfg();
                if (err != ESP_OK) {
                    ESP_LOGW(TAG,
                             "save_runtime_cfg failed: %s",
                             esp_err_to_name(err));
                    send_config_ack(f.seq_num, ACK_STATUS_APPLY_FAIL, "nvs_fail");
                } else {
                    g_config_received = true;
                    ESP_LOGI(TAG,
                             "CONFIG applied and saved: period=%lu temp_hi=%.2f hum_hi=%.2f",
                             (unsigned long)g_sample_period_ms,
                             g_temp_hi_x100 / 100.0f,
                             g_hum_hi_x100 / 100.0f);
                    send_config_ack(f.seq_num, ACK_STATUS_OK, "applied");
                }
            }
            break;

        default:
            ESP_LOGW(TAG, "Unhandled msg_type=%u", f.msg_type);
            break;
    }
}

void app_main(void)
{
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    ESP_ERROR_CHECK(load_nvs_state());
    ESP_ERROR_CHECK(i2c_master_init_dynamic());

    detect_connected_sensor();
    compare_sensor_with_nvs_and_save_if_needed();

    wifi_init_for_espnow();

    ESP_ERROR_CHECK(esp_now_init());
    ESP_ERROR_CHECK(esp_now_register_send_cb(on_data_sent));
    ESP_ERROR_CHECK(esp_now_register_recv_cb(on_data_recv));

    add_broadcast_peer();

    ESP_LOGI(TAG,
             "AUTO I2C PAYLOAD ready base_id=%lu sensor_id=%lu type=%u kind=%u name=%s addr=0x%02X changed=%u period=%lu_ms",
             (unsigned long)BASE_ID,
             (unsigned long)g_sensor_id,
             g_sensor_type,
             g_detected_sensor_kind,
             g_sensor_name,
             g_i2c_addr,
             g_sensor_changed,
             (unsigned long)g_sample_period_ms);

#if LAB_DEBUG_DISABLE_DEEP_SLEEP
    ESP_LOGW(TAG,
             "LAB DEBUG MODE: deep sleep disabled, forcing runtime send interval to %lu ms",
             (unsigned long)get_effective_send_interval_ms());
#endif

    uint32_t wake_session_started_ms = esp_log_timestamp();
    uint32_t last_sample_ms = 0;
    uint32_t last_rescan_ms = esp_log_timestamp();

    while (1) {
#if !LAB_DEBUG_DISABLE_DEEP_SLEEP
        if ((esp_log_timestamp() - wake_session_started_ms) >= WAKE_SESSION_TIMEOUT_MS) {
            ESP_LOGW(TAG, "Wake session timed out before reading was sent");
            enter_timed_deep_sleep("session_timeout", g_sample_period_ms);
        }
#endif

        uint32_t now_ms = esp_log_timestamp();

        if ((now_ms - last_rescan_ms) >= SENSOR_RESCAN_PERIOD_MS) {
            uint8_t old_kind = g_detected_sensor_kind;
            uint8_t old_addr = g_i2c_addr;
            uint32_t old_id = g_sensor_id;

            detect_connected_sensor();

            if (old_kind != g_detected_sensor_kind ||
                old_addr != g_i2c_addr ||
                old_id != g_sensor_id) {
                ESP_LOGW(TAG,
                         "Runtime sensor change detected: old_kind=%u old_addr=0x%02X old_id=%lu -> new_kind=%u new_addr=0x%02X new_id=%lu",
                         old_kind,
                         old_addr,
                         (unsigned long)old_id,
                         g_detected_sensor_kind,
                         g_i2c_addr,
                         (unsigned long)g_sensor_id);

                compare_sensor_with_nvs_and_save_if_needed();
                g_base_acked = false;
                g_module_acked = false;
                memset(g_ctrl_mac, 0, sizeof(g_ctrl_mac));
                last_sample_ms = 0;
            }

            last_rescan_ms = now_ms;
        }

        if (!g_base_acked) {
            send_base_hello();
            vTaskDelay(pdMS_TO_TICKS(DISCOVERY_PERIOD_MS));
            continue;
        }

        if (!g_module_acked) {
            send_module_info();
            vTaskDelay(pdMS_TO_TICKS(DISCOVERY_PERIOD_MS));
            continue;
        }

        if (!g_config_received) {
            send_module_info();
            vTaskDelay(pdMS_TO_TICKS(DISCOVERY_PERIOD_MS));
            continue;
        }

        if ((now_ms - last_sample_ms) >= get_effective_send_interval_ms()) {
            if (send_sensor_data()) {
                last_sample_ms = now_ms;
                vTaskDelay(pdMS_TO_TICKS(TX_FLUSH_DELAY_MS));
#if LAB_DEBUG_DISABLE_DEEP_SLEEP
                ESP_LOGI(TAG,
                         "LAB DEBUG MODE: staying awake and waiting %lu ms before next sample",
                         (unsigned long)get_effective_send_interval_ms());
                vTaskDelay(pdMS_TO_TICKS(get_effective_send_interval_ms()));
#else
                enter_timed_deep_sleep("sample_sent", g_sample_period_ms);
#endif
                continue;
            }
        }

        vTaskDelay(pdMS_TO_TICKS(500));
    }
}
