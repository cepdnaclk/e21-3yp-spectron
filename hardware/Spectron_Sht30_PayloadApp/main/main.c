#include <math.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

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
 * AUTO I2C PAYLOAD - MULTI SENSOR CONTROLLER COMPATIBLE VERSION
 * ============================================================
 *
 * Design:
 *   - The ESP-NOW frame format stays legacy-compatible.
 *   - Each detected I2C sensor is advertised as its own logical module.
 *   - The payload can keep several sensors active at once and send one
 *     SENSOR_DATA frame per sensor using that sensor's unique sensor_id.
 *
 * Encoding remains legacy-shaped for the controller:
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

#define WIFI_CHANNEL                    1

#define DISCOVERY_PERIOD_MS             2000
#define DEFAULT_SAMPLE_PERIOD_MS        300000
#define MIN_SAMPLE_PERIOD_MS            10000
#define SENSOR_RESCAN_PERIOD_MS         10000
#define WAKE_SESSION_TIMEOUT_MS         30000
#define TX_FLUSH_DELAY_MS               1000

#define LAB_DEBUG_DISABLE_DEEP_SLEEP    1
#define LAB_DEBUG_SEND_INTERVAL_MS      10000

#define MAX_PAYLOAD_SENSORS             5

#define I2C_PORT                        I2C_NUM_0
#define I2C_FREQ_HZ                     100000
#if CONFIG_IDF_TARGET_ESP32
#define DEFAULT_I2C_SDA_GPIO            21
#define DEFAULT_I2C_SCL_GPIO            22
#elif CONFIG_IDF_TARGET_ESP32C3
#define DEFAULT_I2C_SDA_GPIO            6
#define DEFAULT_I2C_SCL_GPIO            7
#else
#define DEFAULT_I2C_SDA_GPIO            6
#define DEFAULT_I2C_SCL_GPIO            7
#endif

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

#define DETECTED_SENSOR_NONE            0
#define DETECTED_SENSOR_SHT30           1
#define DETECTED_SENSOR_BME280          2
#define DETECTED_SENSOR_BMP280          3
#define DETECTED_SENSOR_VL53L0X         4

#define SENSOR_ID_PREFIX_SHT30          0x00003000u
#define SENSOR_ID_PREFIX_BME280         0x00002800u
#define SENSOR_ID_PREFIX_BMP280         0x00002900u
#define SENSOR_ID_PREFIX_VL53L0X        0x00005300u

#define NVS_NS_MODULE                   "module_cfg"
#define NVS_KEY_SENSOR_CFG_VERSION      1u

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

typedef struct {
    uint32_t version;
    uint32_t sensor_id;
    uint32_t sample_period_ms;
    int16_t  temp_hi_x100;
    uint16_t hum_hi_x100;
} sensor_cfg_blob_t;

typedef struct {
    bool     in_use;
    uint8_t  detected_kind;
    uint8_t  sensor_type;
    uint8_t  i2c_addr;
    uint32_t sensor_id;
    char     sensor_name[MPROTO_SENSOR_NAME_LEN];

    bool     module_acked;
    bool     config_received;
    uint32_t module_crc32;
    uint32_t last_sample_ms;

    uint32_t sample_period_ms;
    int16_t  temp_hi_x100;
    uint16_t hum_hi_x100;

    bme280_calib_t bme_calib;
    uint8_t        vl53_stop_variable;
} payload_sensor_t;

static bool g_base_acked = false;
static bool g_inventory_changed = false;
static uint8_t g_ctrl_mac[6] = {0};
static uint32_t g_seq = 0;
static uint8_t g_i2c_sda_gpio = DEFAULT_I2C_SDA_GPIO;
static uint8_t g_i2c_scl_gpio = DEFAULT_I2C_SCL_GPIO;

static payload_sensor_t g_sensors[MAX_PAYLOAD_SENSORS];
static size_t g_sensor_count = 0;
static size_t g_next_module_idx = 0;
static size_t g_next_data_idx = 0;

static uint32_t get_runtime_base_id(void)
{
    uint8_t mac[6] = {0};
    ESP_ERROR_CHECK(esp_read_mac(mac, ESP_MAC_WIFI_STA));
    return 0xB0000000u |
           ((uint32_t)mac[2] << 16) |
           ((uint32_t)mac[4] << 8) |
           (uint32_t)mac[5];
}

static uint32_t get_effective_send_interval_ms(const payload_sensor_t *sensor)
{
#if LAB_DEBUG_DISABLE_DEEP_SLEEP
    (void)sensor;
    return LAB_DEBUG_SEND_INTERVAL_MS;
#else
    return sensor->sample_period_ms;
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

static uint32_t make_sensor_id(uint8_t detected_kind, uint8_t addr)
{
    switch (detected_kind) {
        case DETECTED_SENSOR_SHT30:
            return SENSOR_ID_PREFIX_SHT30 | addr;
        case DETECTED_SENSOR_BME280:
            return SENSOR_ID_PREFIX_BME280 | addr;
        case DETECTED_SENSOR_BMP280:
            return SENSOR_ID_PREFIX_BMP280 | addr;
        case DETECTED_SENSOR_VL53L0X:
            return SENSOR_ID_PREFIX_VL53L0X | addr;
        default:
            return 0;
    }
}

static uint8_t sensor_kind_to_protocol_type(uint8_t detected_kind)
{
    switch (detected_kind) {
        case DETECTED_SENSOR_SHT30:
            return SENSOR_TYPE_SHT30;
        case DETECTED_SENSOR_BME280:
            return SENSOR_TYPE_BME280;
        case DETECTED_SENSOR_BMP280:
            return SENSOR_TYPE_BMP280;
        case DETECTED_SENSOR_VL53L0X:
            return SENSOR_TYPE_VL53L0X;
        default:
            return SENSOR_TYPE_NONE;
    }
}

static void build_sensor_name(uint8_t detected_kind, uint8_t addr, char *buf, size_t buf_len)
{
    switch (detected_kind) {
        case DETECTED_SENSOR_SHT30:
            snprintf(buf, buf_len, "SHT30 Temperature Humidity 0x%02X", addr);
            break;
        case DETECTED_SENSOR_BME280:
            snprintf(buf, buf_len, "BME280 Temp Hum Pressure 0x%02X", addr);
            break;
        case DETECTED_SENSOR_BMP280:
            snprintf(buf, buf_len, "BMP280 Temp Pressure 0x%02X", addr);
            break;
        case DETECTED_SENSOR_VL53L0X:
            snprintf(buf, buf_len, "VL53L0X Laser Distance 0x%02X", addr);
            break;
        default:
            strlcpy(buf, "Unknown Sensor", buf_len);
            break;
    }
}

static void reset_runtime_cfg(payload_sensor_t *sensor)
{
    sensor->sample_period_ms = DEFAULT_SAMPLE_PERIOD_MS;
    sensor->temp_hi_x100 = 3500;
    sensor->hum_hi_x100 = 8500;
    sensor->config_received = false;
}

static void make_sensor_cfg_key(uint32_t sensor_id, char *buf, size_t buf_len)
{
    snprintf(buf, buf_len, "cfg_%04lx", (unsigned long)(sensor_id & 0xFFFFu));
}

static void load_sensor_runtime_cfg(payload_sensor_t *sensor)
{
    nvs_handle_t nvs;
    char key[16];
    sensor_cfg_blob_t blob = {0};
    size_t blob_len = sizeof(blob);

    reset_runtime_cfg(sensor);
    make_sensor_cfg_key(sensor->sensor_id, key, sizeof(key));

    if (nvs_open(NVS_NS_MODULE, NVS_READONLY, &nvs) != ESP_OK) {
        return;
    }

    if (nvs_get_blob(nvs, key, &blob, &blob_len) == ESP_OK &&
        blob_len == sizeof(blob) &&
        blob.version == NVS_KEY_SENSOR_CFG_VERSION &&
        blob.sensor_id == sensor->sensor_id) {
        sensor->sample_period_ms = blob.sample_period_ms;
        if (sensor->sample_period_ms < MIN_SAMPLE_PERIOD_MS) {
            sensor->sample_period_ms = MIN_SAMPLE_PERIOD_MS;
        }
        sensor->temp_hi_x100 = blob.temp_hi_x100;
        sensor->hum_hi_x100 = blob.hum_hi_x100;
        sensor->config_received = true;
        ESP_LOGI(TAG,
                 "Loaded runtime cfg for sensor_id=%lu sample=%lu temp_hi=%.2f hum_hi=%.2f",
                 (unsigned long)sensor->sensor_id,
                 (unsigned long)sensor->sample_period_ms,
                 sensor->temp_hi_x100 / 100.0f,
                 sensor->hum_hi_x100 / 100.0f);
    }

    nvs_close(nvs);
}

static esp_err_t save_sensor_runtime_cfg(const payload_sensor_t *sensor)
{
    nvs_handle_t nvs;
    char key[16];
    sensor_cfg_blob_t blob = {
        .version = NVS_KEY_SENSOR_CFG_VERSION,
        .sensor_id = sensor->sensor_id,
        .sample_period_ms = sensor->sample_period_ms,
        .temp_hi_x100 = sensor->temp_hi_x100,
        .hum_hi_x100 = sensor->hum_hi_x100,
    };

    esp_err_t err = nvs_open(NVS_NS_MODULE, NVS_READWRITE, &nvs);
    if (err != ESP_OK) {
        return err;
    }

    make_sensor_cfg_key(sensor->sensor_id, key, sizeof(key));
    err = nvs_set_blob(nvs, key, &blob, sizeof(blob));
    if (err == ESP_OK) {
        err = nvs_commit(nvs);
    }

    nvs_close(nvs);
    return err;
}

static esp_err_t i2c_master_init_dynamic(void)
{
    ESP_LOGI(TAG,
             "Initializing I2C on SDA=%d SCL=%d for target %s",
             g_i2c_sda_gpio,
             g_i2c_scl_gpio,
             CONFIG_IDF_TARGET);

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
    return i2c_master_write_to_device(I2C_PORT, addr, data, sizeof(data), pdMS_TO_TICKS(100));
}

static esp_err_t i2c_read_u8(uint8_t addr, uint8_t reg, uint8_t *value)
{
    return i2c_master_write_read_device(I2C_PORT, addr, &reg, 1, value, 1, pdMS_TO_TICKS(100));
}

static esp_err_t i2c_read_bytes(uint8_t addr, uint8_t reg, uint8_t *buf, size_t len)
{
    return i2c_master_write_read_device(I2C_PORT, addr, &reg, 1, buf, len, pdMS_TO_TICKS(100));
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

    esp_err_t ret = i2c_master_write_to_device(I2C_PORT, addr, cmd, sizeof(cmd), pdMS_TO_TICKS(100));
    if (ret != ESP_OK) {
        return ret;
    }

    vTaskDelay(pdMS_TO_TICKS(50));

    ret = i2c_master_read_from_device(I2C_PORT, addr, rx, sizeof(rx), pdMS_TO_TICKS(100));
    if (ret != ESP_OK) {
        return ret;
    }

    if (sht30_crc8(&rx[0], 2) != rx[2] || sht30_crc8(&rx[3], 2) != rx[5]) {
        return ESP_FAIL;
    }

    uint16_t raw_t = ((uint16_t)rx[0] << 8) | rx[1];
    uint16_t raw_h = ((uint16_t)rx[3] << 8) | rx[4];

    *temperature_c = -45.0f + 175.0f * ((float)raw_t / 65535.0f);
    *humidity_rh = 100.0f * ((float)raw_h / 65535.0f);
    return ESP_OK;
}

static uint16_t read_u16_le(const uint8_t *buf)
{
    return (uint16_t)buf[0] | ((uint16_t)buf[1] << 8);
}

static int16_t read_s16_le(const uint8_t *buf)
{
    return (int16_t)read_u16_le(buf);
}

static esp_err_t bme280_read_calibration(payload_sensor_t *sensor, bool has_humidity)
{
    uint8_t buf[24] = {0};
    esp_err_t ret = i2c_read_bytes(sensor->i2c_addr, 0x88, buf, sizeof(buf));
    if (ret != ESP_OK) {
        return ret;
    }

    sensor->bme_calib.dig_T1 = read_u16_le(&buf[0]);
    sensor->bme_calib.dig_T2 = read_s16_le(&buf[2]);
    sensor->bme_calib.dig_T3 = read_s16_le(&buf[4]);
    sensor->bme_calib.dig_P1 = read_u16_le(&buf[6]);
    sensor->bme_calib.dig_P2 = read_s16_le(&buf[8]);
    sensor->bme_calib.dig_P3 = read_s16_le(&buf[10]);
    sensor->bme_calib.dig_P4 = read_s16_le(&buf[12]);
    sensor->bme_calib.dig_P5 = read_s16_le(&buf[14]);
    sensor->bme_calib.dig_P6 = read_s16_le(&buf[16]);
    sensor->bme_calib.dig_P7 = read_s16_le(&buf[18]);
    sensor->bme_calib.dig_P8 = read_s16_le(&buf[20]);
    sensor->bme_calib.dig_P9 = read_s16_le(&buf[22]);
    sensor->bme_calib.has_humidity = has_humidity;

    if (has_humidity) {
        uint8_t h1 = 0;
        uint8_t hbuf[7] = {0};

        ret = i2c_read_u8(sensor->i2c_addr, 0xA1, &h1);
        if (ret != ESP_OK) {
            return ret;
        }

        ret = i2c_read_bytes(sensor->i2c_addr, 0xE1, hbuf, sizeof(hbuf));
        if (ret != ESP_OK) {
            return ret;
        }

        sensor->bme_calib.dig_H1 = h1;
        sensor->bme_calib.dig_H2 = read_s16_le(&hbuf[0]);
        sensor->bme_calib.dig_H3 = hbuf[2];
        sensor->bme_calib.dig_H4 = (int16_t)((((int16_t)hbuf[3]) << 4) | (hbuf[4] & 0x0F));
        sensor->bme_calib.dig_H5 = (int16_t)((((int16_t)hbuf[5]) << 4) | (hbuf[4] >> 4));
        sensor->bme_calib.dig_H6 = (int8_t)hbuf[6];
    }

    return ESP_OK;
}

static esp_err_t bme280_configure_sensor(payload_sensor_t *sensor, bool has_humidity)
{
    esp_err_t ret;

    if (has_humidity) {
        ret = i2c_write_u8(sensor->i2c_addr, BME280_REG_CTRL_HUM, 0x01);
        if (ret != ESP_OK) {
            return ret;
        }
    }

    ret = i2c_write_u8(sensor->i2c_addr, BME280_REG_CONFIG, 0x00);
    if (ret != ESP_OK) {
        return ret;
    }

    ret = i2c_write_u8(sensor->i2c_addr, BME280_REG_CTRL_MEAS, 0x27);
    if (ret != ESP_OK) {
        return ret;
    }

    vTaskDelay(pdMS_TO_TICKS(100));
    return bme280_read_calibration(sensor, has_humidity);
}

static int32_t bme280_compensate_temperature(payload_sensor_t *sensor, int32_t adc_T)
{
    int32_t var1;
    int32_t var2;

    var1 = ((((adc_T >> 3) - ((int32_t)sensor->bme_calib.dig_T1 << 1))) *
            ((int32_t)sensor->bme_calib.dig_T2)) >> 11;
    var2 = (((((adc_T >> 4) - ((int32_t)sensor->bme_calib.dig_T1)) *
              ((adc_T >> 4) - ((int32_t)sensor->bme_calib.dig_T1))) >> 12) *
            ((int32_t)sensor->bme_calib.dig_T3)) >> 14;

    sensor->bme_calib.t_fine = var1 + var2;
    return (sensor->bme_calib.t_fine * 5 + 128) >> 8;
}

static uint32_t bme280_compensate_pressure(payload_sensor_t *sensor, int32_t adc_P)
{
    int64_t var1;
    int64_t var2;
    int64_t p;

    var1 = ((int64_t)sensor->bme_calib.t_fine) - 128000;
    var2 = var1 * var1 * (int64_t)sensor->bme_calib.dig_P6;
    var2 = var2 + ((var1 * (int64_t)sensor->bme_calib.dig_P5) << 17);
    var2 = var2 + (((int64_t)sensor->bme_calib.dig_P4) << 35);
    var1 = ((var1 * var1 * (int64_t)sensor->bme_calib.dig_P3) >> 8) +
           ((var1 * (int64_t)sensor->bme_calib.dig_P2) << 12);
    var1 = (((((int64_t)1) << 47) + var1)) * ((int64_t)sensor->bme_calib.dig_P1) >> 33;

    if (var1 == 0) {
        return 0;
    }

    p = 1048576 - adc_P;
    p = (((p << 31) - var2) * 3125) / var1;
    var1 = (((int64_t)sensor->bme_calib.dig_P9) * (p >> 13) * (p >> 13)) >> 25;
    var2 = (((int64_t)sensor->bme_calib.dig_P8) * p) >> 19;
    p = ((p + var1 + var2) >> 8) + (((int64_t)sensor->bme_calib.dig_P7) << 4);

    return (uint32_t)(p / 256);
}

static uint32_t bme280_compensate_humidity(payload_sensor_t *sensor, int32_t adc_H)
{
    int32_t v_x1_u32r;

    v_x1_u32r = sensor->bme_calib.t_fine - ((int32_t)76800);
    v_x1_u32r = (((((adc_H << 14) -
                    (((int32_t)sensor->bme_calib.dig_H4) << 20) -
                    (((int32_t)sensor->bme_calib.dig_H5) * v_x1_u32r)) +
                   ((int32_t)16384)) >> 15) *
                 (((((((v_x1_u32r * ((int32_t)sensor->bme_calib.dig_H6)) >> 10) *
                      (((v_x1_u32r * ((int32_t)sensor->bme_calib.dig_H3)) >> 11) +
                       ((int32_t)32768))) >> 10) +
                    ((int32_t)2097152)) *
                   ((int32_t)sensor->bme_calib.dig_H2) +
                   8192) >> 14));

    v_x1_u32r = v_x1_u32r -
                (((((v_x1_u32r >> 15) * (v_x1_u32r >> 15)) >> 7) *
                  ((int32_t)sensor->bme_calib.dig_H1)) >> 4);

    if (v_x1_u32r < 0) {
        v_x1_u32r = 0;
    }
    if (v_x1_u32r > 419430400) {
        v_x1_u32r = 419430400;
    }

    return (uint32_t)(((uint32_t)(v_x1_u32r >> 12) * 100U) / 1024U);
}

static esp_err_t bme_bmp280_read(payload_sensor_t *sensor,
                                 int16_t *temperature_c_x100,
                                 uint32_t *pressure_pa,
                                 uint16_t *humidity_rh_x100)
{
    uint8_t data[8] = {0};
    size_t len = sensor->bme_calib.has_humidity ? 8 : 6;
    esp_err_t ret = i2c_read_bytes(sensor->i2c_addr, BME280_REG_PRESS_MSB, data, len);
    if (ret != ESP_OK) {
        return ret;
    }

    int32_t adc_P = ((int32_t)data[0] << 12) |
                    ((int32_t)data[1] << 4) |
                    ((int32_t)data[2] >> 4);
    int32_t adc_T = ((int32_t)data[3] << 12) |
                    ((int32_t)data[4] << 4) |
                    ((int32_t)data[5] >> 4);

    *temperature_c_x100 = (int16_t)bme280_compensate_temperature(sensor, adc_T);
    *pressure_pa = bme280_compensate_pressure(sensor, adc_P);

    if (sensor->bme_calib.has_humidity) {
        int32_t adc_H = ((int32_t)data[6] << 8) | data[7];
        *humidity_rh_x100 = (uint16_t)bme280_compensate_humidity(sensor, adc_H);
    } else {
        *humidity_rh_x100 = 0xFFFF;
    }

    return ESP_OK;
}

static esp_err_t vl53l0x_init_sensor(payload_sensor_t *sensor)
{
    uint8_t model_id = 0;
    esp_err_t ret = i2c_read_u8(sensor->i2c_addr, VL53_REG_IDENTIFICATION_MODEL_ID, &model_id);
    if (ret != ESP_OK) {
        return ret;
    }
    if (model_id != 0xEE) {
        return ESP_FAIL;
    }

    if ((ret = i2c_write_u8(sensor->i2c_addr, 0x88, 0x00)) != ESP_OK) return ret;
    if ((ret = i2c_write_u8(sensor->i2c_addr, 0x80, 0x01)) != ESP_OK) return ret;
    if ((ret = i2c_write_u8(sensor->i2c_addr, 0xFF, 0x01)) != ESP_OK) return ret;
    if ((ret = i2c_write_u8(sensor->i2c_addr, 0x00, 0x00)) != ESP_OK) return ret;

    ret = i2c_read_u8(sensor->i2c_addr, 0x91, &sensor->vl53_stop_variable);
    if (ret != ESP_OK) {
        return ret;
    }

    if ((ret = i2c_write_u8(sensor->i2c_addr, 0x00, 0x01)) != ESP_OK) return ret;
    if ((ret = i2c_write_u8(sensor->i2c_addr, 0xFF, 0x00)) != ESP_OK) return ret;
    if ((ret = i2c_write_u8(sensor->i2c_addr, 0x80, 0x00)) != ESP_OK) return ret;
    if ((ret = i2c_write_u8(sensor->i2c_addr, 0x0A, 0x04)) != ESP_OK) return ret;
    return i2c_write_u8(sensor->i2c_addr, VL53_REG_SYSTEM_INTERRUPT_CLEAR, 0x01);
}

static esp_err_t vl53l0x_read_mm(payload_sensor_t *sensor, uint16_t *distance_mm, uint8_t *range_status)
{
    esp_err_t ret;

    if ((ret = i2c_write_u8(sensor->i2c_addr, 0x80, 0x01)) != ESP_OK) return ret;
    if ((ret = i2c_write_u8(sensor->i2c_addr, 0xFF, 0x01)) != ESP_OK) return ret;
    if ((ret = i2c_write_u8(sensor->i2c_addr, 0x00, 0x00)) != ESP_OK) return ret;
    if ((ret = i2c_write_u8(sensor->i2c_addr, 0x91, sensor->vl53_stop_variable)) != ESP_OK) return ret;
    if ((ret = i2c_write_u8(sensor->i2c_addr, 0x00, 0x01)) != ESP_OK) return ret;
    if ((ret = i2c_write_u8(sensor->i2c_addr, 0xFF, 0x00)) != ESP_OK) return ret;
    if ((ret = i2c_write_u8(sensor->i2c_addr, 0x80, 0x00)) != ESP_OK) return ret;

    ret = i2c_write_u8(sensor->i2c_addr, VL53_REG_SYSRANGE_START, 0x01);
    if (ret != ESP_OK) {
        return ret;
    }

    uint8_t interrupt_status = 0;
    int timeout_ms = 0;
    while (timeout_ms < 500) {
        ret = i2c_read_u8(sensor->i2c_addr, VL53_REG_RESULT_INTERRUPT_STATUS, &interrupt_status);
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
        return ESP_ERR_TIMEOUT;
    }

    uint8_t data[12] = {0};
    ret = i2c_read_bytes(sensor->i2c_addr, VL53_REG_RESULT_RANGE_STATUS, data, sizeof(data));
    if (ret != ESP_OK) {
        return ret;
    }

    *range_status = data[0] & 0x78;
    *distance_mm = ((uint16_t)data[10] << 8) | data[11];
    return i2c_write_u8(sensor->i2c_addr, VL53_REG_SYSTEM_INTERRUPT_CLEAR, 0x01);
}

static void init_sensor_record(payload_sensor_t *sensor, uint8_t detected_kind, uint8_t addr)
{
    memset(sensor, 0, sizeof(*sensor));
    sensor->in_use = true;
    sensor->detected_kind = detected_kind;
    sensor->sensor_type = sensor_kind_to_protocol_type(detected_kind);
    sensor->i2c_addr = addr;
    sensor->sensor_id = make_sensor_id(detected_kind, addr);
    build_sensor_name(detected_kind, addr, sensor->sensor_name, sizeof(sensor->sensor_name));
    reset_runtime_cfg(sensor);
}

static bool append_sensor(payload_sensor_t *inventory, size_t *count, const payload_sensor_t *candidate)
{
    if (*count >= MAX_PAYLOAD_SENSORS) {
        ESP_LOGW(TAG, "Sensor inventory full, dropping sensor_id=%lu", (unsigned long)candidate->sensor_id);
        return false;
    }

    inventory[*count] = *candidate;
    (*count)++;
    return true;
}

static void detect_connected_sensors(payload_sensor_t *inventory, size_t *count)
{
    *count = 0;
    ESP_LOGI(TAG, "Scanning known I2C sensors on SDA=%d SCL=%d", g_i2c_sda_gpio, g_i2c_scl_gpio);

    const uint8_t sht30_addresses[2] = {SHT30_ADDR_1, SHT30_ADDR_2};
    for (size_t i = 0; i < 2; i++) {
        float t = 0.0f;
        float h = 0.0f;
        if (sht30_read_at(sht30_addresses[i], &t, &h) == ESP_OK) {
            payload_sensor_t sensor;
            init_sensor_record(&sensor, DETECTED_SENSOR_SHT30, sht30_addresses[i]);
            append_sensor(inventory, count, &sensor);
        }
    }

    const uint8_t bme_addresses[2] = {BME_BMP280_ADDR_1, BME_BMP280_ADDR_2};
    for (size_t i = 0; i < 2; i++) {
        uint8_t chip_id = 0;
        if (i2c_read_u8(bme_addresses[i], BME280_REG_ID, &chip_id) != ESP_OK) {
            continue;
        }

        payload_sensor_t sensor;
        if (chip_id == BME280_CHIP_ID) {
            init_sensor_record(&sensor, DETECTED_SENSOR_BME280, bme_addresses[i]);
            if (bme280_configure_sensor(&sensor, true) == ESP_OK) {
                append_sensor(inventory, count, &sensor);
            }
        } else if (chip_id == BMP280_CHIP_ID) {
            init_sensor_record(&sensor, DETECTED_SENSOR_BMP280, bme_addresses[i]);
            if (bme280_configure_sensor(&sensor, false) == ESP_OK) {
                append_sensor(inventory, count, &sensor);
            }
        }
    }

    uint8_t vl53_model_id = 0;
    if (i2c_read_u8(VL53L0X_ADDR, VL53_REG_IDENTIFICATION_MODEL_ID, &vl53_model_id) == ESP_OK &&
        vl53_model_id == 0xEE) {
        payload_sensor_t sensor;
        init_sensor_record(&sensor, DETECTED_SENSOR_VL53L0X, VL53L0X_ADDR);
        if (vl53l0x_init_sensor(&sensor) == ESP_OK) {
            append_sensor(inventory, count, &sensor);
        }
    }

    if (*count == 0) {
        ESP_LOGW(TAG, "No supported I2C sensors detected");
    }
}

static int find_sensor_index_by_id(const payload_sensor_t *inventory, size_t count, uint32_t sensor_id)
{
    for (size_t i = 0; i < count; i++) {
        if (inventory[i].in_use && inventory[i].sensor_id == sensor_id) {
            return (int)i;
        }
    }

    return -1;
}

static payload_sensor_t *find_sensor_by_id(uint32_t sensor_id)
{
    int idx = find_sensor_index_by_id(g_sensors, g_sensor_count, sensor_id);
    if (idx < 0) {
        return NULL;
    }

    return &g_sensors[idx];
}

static bool inventories_equal(const payload_sensor_t *a, size_t count_a,
                              const payload_sensor_t *b, size_t count_b)
{
    if (count_a != count_b) {
        return false;
    }

    for (size_t i = 0; i < count_a; i++) {
        if (a[i].sensor_id != b[i].sensor_id ||
            a[i].detected_kind != b[i].detected_kind ||
            a[i].i2c_addr != b[i].i2c_addr ||
            strcmp(a[i].sensor_name, b[i].sensor_name) != 0) {
            return false;
        }
    }

    return true;
}

static void describe_inventory_change(const payload_sensor_t *old_inventory,
                                      size_t old_count,
                                      const payload_sensor_t *new_inventory,
                                      size_t new_count)
{
    for (size_t i = 0; i < old_count; i++) {
        if (find_sensor_index_by_id(new_inventory, new_count, old_inventory[i].sensor_id) < 0) {
            ESP_LOGW(TAG,
                     "Sensor removed sensor_id=%lu name=%s addr=0x%02X",
                     (unsigned long)old_inventory[i].sensor_id,
                     old_inventory[i].sensor_name,
                     old_inventory[i].i2c_addr);
        }
    }

    for (size_t i = 0; i < new_count; i++) {
        if (find_sensor_index_by_id(old_inventory, old_count, new_inventory[i].sensor_id) < 0) {
            ESP_LOGW(TAG,
                     "Sensor added sensor_id=%lu name=%s addr=0x%02X",
                     (unsigned long)new_inventory[i].sensor_id,
                     new_inventory[i].sensor_name,
                     new_inventory[i].i2c_addr);
        }
    }
}

static void merge_detected_inventory(const payload_sensor_t *detected, size_t detected_count)
{
    payload_sensor_t merged[MAX_PAYLOAD_SENSORS];
    bool inventory_changed = !inventories_equal(g_sensors, g_sensor_count, detected, detected_count);

    memset(merged, 0, sizeof(merged));

    for (size_t i = 0; i < detected_count; i++) {
        merged[i] = detected[i];

        int old_idx = find_sensor_index_by_id(g_sensors, g_sensor_count, detected[i].sensor_id);
        if (old_idx >= 0) {
            merged[i].module_acked = g_sensors[old_idx].module_acked;
            merged[i].config_received = g_sensors[old_idx].config_received;
            merged[i].module_crc32 = g_sensors[old_idx].module_crc32;
            merged[i].last_sample_ms = g_sensors[old_idx].last_sample_ms;
            merged[i].sample_period_ms = g_sensors[old_idx].sample_period_ms;
            merged[i].temp_hi_x100 = g_sensors[old_idx].temp_hi_x100;
            merged[i].hum_hi_x100 = g_sensors[old_idx].hum_hi_x100;
        } else {
            load_sensor_runtime_cfg(&merged[i]);
        }
    }

    if (inventory_changed) {
        describe_inventory_change(g_sensors, g_sensor_count, detected, detected_count);
    }

    memcpy(g_sensors, merged, sizeof(merged));
    g_sensor_count = detected_count;
    g_inventory_changed = inventory_changed;

    if (inventory_changed) {
        g_base_acked = false;
        memset(g_ctrl_mac, 0, sizeof(g_ctrl_mac));
        g_next_module_idx = 0;
        g_next_data_idx = 0;

        for (size_t i = 0; i < g_sensor_count; i++) {
            g_sensors[i].module_acked = false;
            g_sensors[i].last_sample_ms = 0;
        }
    }
}

static void rescan_sensor_inventory(void)
{
    payload_sensor_t detected[MAX_PAYLOAD_SENSORS];
    size_t detected_count = 0;

    memset(detected, 0, sizeof(detected));
    detect_connected_sensors(detected, &detected_count);
    merge_detected_inventory(detected, detected_count);
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
    uint8_t broadcast[6] = {0xff, 0xff, 0xff, 0xff, 0xff, 0xff};
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
    uint8_t broadcast[6] = {0xff, 0xff, 0xff, 0xff, 0xff, 0xff};
    mproto_base_hello_t pl = {0};
    mproto_frame_t f = {0};

    ESP_ERROR_CHECK(esp_read_mac(my_mac, ESP_MAC_WIFI_STA));

    memcpy(pl.base_mac, my_mac, 6);
    pl.fw_version = 4;
    pl.has_module = g_sensor_count > 0;

    f.msg_type = MSG_BASE_HELLO;
    f.base_id = get_runtime_base_id();
    f.sensor_type = SENSOR_TYPE_NONE;
    f.sensor_id = 0;
    f.payload_len = sizeof(pl);
    f.seq_num = ++g_seq;
    memcpy(f.payload, &pl, sizeof(pl));

    esp_err_t err = esp_now_send(broadcast, (uint8_t *)&f, sizeof(f));
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "send_base_hello failed: %s", esp_err_to_name(err));
    } else {
        ESP_LOGI(TAG,
                 "BASE_HELLO sent base_id=%lu seq=%lu sensors=%u changed=%u",
                 (unsigned long)f.base_id,
                 (unsigned long)f.seq_num,
                 (unsigned int)g_sensor_count,
                 g_inventory_changed ? 1 : 0);
    }
}

static bool send_module_info(payload_sensor_t *sensor)
{
    if (!g_base_acked || sensor == NULL || !sensor->in_use) {
        return false;
    }

    mproto_module_info_t pl = {0};
    mproto_frame_t f = {0};

    strlcpy(pl.sensor_name, sensor->sensor_name, sizeof(pl.sensor_name));
    pl.module_crc32 = sensor->module_crc32;
    pl.sample_period_ms = sensor->sample_period_ms;
    pl.temp_threshold_hi_x100 = sensor->temp_hi_x100;
    pl.humidity_threshold_hi_x100 = sensor->hum_hi_x100;
    pl.i2c_sda_gpio = g_i2c_sda_gpio;
    pl.i2c_scl_gpio = g_i2c_scl_gpio;
    pl.i2c_addr = sensor->i2c_addr;

    f.msg_type = MSG_MODULE_INFO;
    f.sensor_type = sensor->sensor_type;
    f.base_id = get_runtime_base_id();
    f.sensor_id = sensor->sensor_id;
    f.payload_len = sizeof(pl);
    f.seq_num = ++g_seq;
    memcpy(f.payload, &pl, sizeof(pl));

    esp_err_t err = esp_now_send(g_ctrl_mac, (uint8_t *)&f, sizeof(f));
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "send_module_info failed for sensor_id=%lu: %s",
                 (unsigned long)sensor->sensor_id, esp_err_to_name(err));
        return false;
    }

    ESP_LOGI(TAG,
             "MODULE_INFO sent sensor_id=%lu type=%u kind=%u name=%s addr=0x%02X cfg=%u seq=%lu",
             (unsigned long)sensor->sensor_id,
             sensor->sensor_type,
             sensor->detected_kind,
             sensor->sensor_name,
             sensor->i2c_addr,
             sensor->config_received ? 1 : 0,
             (unsigned long)f.seq_num);
    return true;
}

static void send_config_ack(payload_sensor_t *sensor, uint32_t acked_seq, uint8_t status, const char *detail)
{
    if (!g_base_acked || sensor == NULL) {
        return;
    }

    mproto_ack_t pl = {
        .acked_seq_num = acked_seq,
        .acked_msg_type = MSG_CONFIG_SET,
        .status = status
    };
    mproto_frame_t f = {0};

    strlcpy(pl.detail, detail, sizeof(pl.detail));

    f.msg_type = MSG_CONFIG_ACK;
    f.sensor_type = sensor->sensor_type;
    f.base_id = get_runtime_base_id();
    f.sensor_id = sensor->sensor_id;
    f.payload_len = sizeof(pl);
    f.seq_num = ++g_seq;
    memcpy(f.payload, &pl, sizeof(pl));

    esp_err_t err = esp_now_send(g_ctrl_mac, (uint8_t *)&f, sizeof(f));
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "send_config_ack failed for sensor_id=%lu: %s",
                 (unsigned long)sensor->sensor_id, esp_err_to_name(err));
    } else {
        ESP_LOGI(TAG,
                 "CONFIG_ACK sent sensor_id=%lu acked_seq=%lu status=%u detail=%s",
                 (unsigned long)sensor->sensor_id,
                 (unsigned long)acked_seq,
                 status,
                 pl.detail);
    }
}

static bool populate_sensor_payload(payload_sensor_t *sensor, mproto_sht30_data_t *pl)
{
    if (sensor == NULL || pl == NULL) {
        return false;
    }

    memset(pl, 0, sizeof(*pl));
    pl->uptime_s = esp_log_timestamp() / 1000;

    switch (sensor->detected_kind) {
        case DETECTED_SENSOR_SHT30: {
            float t = 0.0f;
            float h = 0.0f;
            if (sht30_read_at(sensor->i2c_addr, &t, &h) != ESP_OK) {
                return false;
            }

            pl->temperature_c_x100 = (int16_t)lroundf(t * 100.0f);
            pl->humidity_rh_x100 = (uint16_t)lroundf(h * 100.0f);

            if (pl->temperature_c_x100 >= sensor->temp_hi_x100) {
                pl->alert_flags |= 0x01;
            }
            if (pl->humidity_rh_x100 >= sensor->hum_hi_x100) {
                pl->alert_flags |= 0x02;
            }
            break;
        }

        case DETECTED_SENSOR_BME280:
        case DETECTED_SENSOR_BMP280: {
            int16_t temperature_c_x100 = 0;
            uint32_t pressure_pa = 0;
            uint16_t humidity_rh_x100 = 0xFFFF;

            if (bme_bmp280_read(sensor, &temperature_c_x100, &pressure_pa, &humidity_rh_x100) != ESP_OK) {
                return false;
            }

            pl->temperature_c_x100 = temperature_c_x100;
            pl->humidity_rh_x100 = (uint16_t)lroundf((pressure_pa / 1000.0f) * 100.0f);

            if (pl->temperature_c_x100 >= sensor->temp_hi_x100) {
                pl->alert_flags |= 0x01;
            }
            if (pl->humidity_rh_x100 >= sensor->hum_hi_x100) {
                pl->alert_flags |= 0x02;
            }
            break;
        }

        case DETECTED_SENSOR_VL53L0X: {
            uint16_t distance_mm = 0;
            uint8_t range_status = 0;

            if (vl53l0x_read_mm(sensor, &distance_mm, &range_status) != ESP_OK) {
                return false;
            }

            pl->temperature_c_x100 = 0;
            pl->humidity_rh_x100 = (uint16_t)lroundf((distance_mm / 10.0f) * 100.0f);
            pl->alert_flags = range_status;
            if (pl->humidity_rh_x100 >= sensor->hum_hi_x100) {
                pl->alert_flags |= 0x02;
            }
            break;
        }

        default:
            return false;
    }

    return true;
}

static bool send_sensor_data(payload_sensor_t *sensor)
{
    if (!g_base_acked || sensor == NULL || !sensor->in_use || !sensor->module_acked || !sensor->config_received) {
        return false;
    }

    mproto_sht30_data_t pl = {0};
    mproto_frame_t f = {0};

    if (!populate_sensor_payload(sensor, &pl)) {
        ESP_LOGW(TAG, "Sensor read failed for sensor_id=%lu", (unsigned long)sensor->sensor_id);
        return false;
    }

    f.msg_type = MSG_SENSOR_DATA;
    f.sensor_type = sensor->sensor_type;
    f.base_id = get_runtime_base_id();
    f.sensor_id = sensor->sensor_id;
    f.payload_len = sizeof(pl);
    f.seq_num = ++g_seq;
    memcpy(f.payload, &pl, sizeof(pl));

    esp_err_t err = esp_now_send(g_ctrl_mac, (uint8_t *)&f, sizeof(f));
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "send_sensor_data failed for sensor_id=%lu: %s",
                 (unsigned long)sensor->sensor_id, esp_err_to_name(err));
        return false;
    }

    ESP_LOGI(TAG,
             "SENSOR_DATA sent seq=%lu sensor_id=%lu name=%s temp_field=%d humidity_field=%u alerts=0x%02X next=%lu_ms",
             (unsigned long)f.seq_num,
             (unsigned long)sensor->sensor_id,
             sensor->sensor_name,
             pl.temperature_c_x100,
             pl.humidity_rh_x100,
             pl.alert_flags,
             (unsigned long)get_effective_send_interval_ms(sensor));
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
            ESP_LOGI(TAG, "BASE_ACK received for base_id=%lu", (unsigned long)get_runtime_base_id());
            break;

        case MSG_MODULE_ACK: {
            payload_sensor_t *sensor = find_sensor_by_id(f.sensor_id);
            memcpy(g_ctrl_mac, recv_info->src_addr, 6);
            add_controller_peer_if_needed(recv_info->src_addr);
            if (sensor != NULL) {
                sensor->module_acked = true;
                ESP_LOGI(TAG,
                         "MODULE_ACK received sensor_id=%lu sensor=%s",
                         (unsigned long)sensor->sensor_id,
                         sensor->sensor_name);
            }
            break;
        }

        case MSG_CONFIG_SET: {
            payload_sensor_t *sensor = find_sensor_by_id(f.sensor_id);
            if (f.base_id != get_runtime_base_id() || sensor == NULL) {
                if (sensor != NULL) {
                    send_config_ack(sensor, f.seq_num, ACK_STATUS_BAD_TARGET, "bad_target");
                }
                return;
            }

            if (f.payload_len != sizeof(mproto_config_set_t)) {
                send_config_ack(sensor, f.seq_num, ACK_STATUS_BAD_PAYLOAD, "bad_payload");
                return;
            }

            mproto_config_set_t pl;
            memcpy(&pl, f.payload, sizeof(pl));

            sensor->sample_period_ms = pl.sample_period_ms;
            if (sensor->sample_period_ms < MIN_SAMPLE_PERIOD_MS) {
                sensor->sample_period_ms = MIN_SAMPLE_PERIOD_MS;
            }
            sensor->temp_hi_x100 = pl.temp_threshold_hi_x100;
            sensor->hum_hi_x100 = pl.humidity_threshold_hi_x100;

            esp_err_t err = save_sensor_runtime_cfg(sensor);
            if (err != ESP_OK) {
                send_config_ack(sensor, f.seq_num, ACK_STATUS_APPLY_FAIL, "nvs_fail");
            } else {
                sensor->config_received = true;
                ESP_LOGI(TAG,
                         "CONFIG applied sensor_id=%lu period=%lu temp_hi=%.2f hum_hi=%.2f",
                         (unsigned long)sensor->sensor_id,
                         (unsigned long)sensor->sample_period_ms,
                         sensor->temp_hi_x100 / 100.0f,
                         sensor->hum_hi_x100 / 100.0f);
                send_config_ack(sensor, f.seq_num, ACK_STATUS_OK, "applied");
            }
            break;
        }

        default:
            ESP_LOGW(TAG, "Unhandled msg_type=%u", f.msg_type);
            break;
    }
}

static payload_sensor_t *select_next_module_sensor(void)
{
    if (g_sensor_count == 0) {
        return NULL;
    }

    for (size_t offset = 0; offset < g_sensor_count; offset++) {
        size_t idx = (g_next_module_idx + offset) % g_sensor_count;
        payload_sensor_t *sensor = &g_sensors[idx];
        if (!sensor->in_use) {
            continue;
        }
        /*
         * After controller ACKs MODULE_INFO, stop re-sending it every cycle.
         * The controller already owns per-sensor state and can retry CONFIG_SET
         * independently, so repeated MODULE_INFO only creates extra traffic
         * when another sensor is waiting on backend discovery.
         */
        if (!sensor->module_acked) {
            g_next_module_idx = (idx + 1U) % g_sensor_count;
            return sensor;
        }
    }

    return NULL;
}

static payload_sensor_t *select_next_due_sensor(uint32_t now_ms)
{
    if (g_sensor_count == 0) {
        return NULL;
    }

    for (size_t offset = 0; offset < g_sensor_count; offset++) {
        size_t idx = (g_next_data_idx + offset) % g_sensor_count;
        payload_sensor_t *sensor = &g_sensors[idx];
        uint32_t interval_ms;

        if (!sensor->in_use || !sensor->module_acked || !sensor->config_received) {
            continue;
        }

        interval_ms = get_effective_send_interval_ms(sensor);
        if ((now_ms - sensor->last_sample_ms) < interval_ms) {
            continue;
        }

        g_next_data_idx = (idx + 1U) % g_sensor_count;
        return sensor;
    }

    return NULL;
}

static bool any_due_sensor_remaining(uint32_t now_ms)
{
    for (size_t i = 0; i < g_sensor_count; i++) {
        payload_sensor_t *sensor = &g_sensors[i];
        if (!sensor->in_use || !sensor->module_acked || !sensor->config_received) {
            continue;
        }
        if ((now_ms - sensor->last_sample_ms) >= get_effective_send_interval_ms(sensor)) {
            return true;
        }
    }

    return false;
}

static uint32_t compute_next_sleep_ms(uint32_t now_ms)
{
    uint32_t next_sleep_ms = DEFAULT_SAMPLE_PERIOD_MS;
    bool found = false;

    for (size_t i = 0; i < g_sensor_count; i++) {
        payload_sensor_t *sensor = &g_sensors[i];
        if (!sensor->in_use || !sensor->module_acked || !sensor->config_received) {
            continue;
        }

        uint32_t interval_ms = get_effective_send_interval_ms(sensor);
        uint32_t elapsed_ms = now_ms - sensor->last_sample_ms;
        uint32_t remaining_ms = (elapsed_ms >= interval_ms) ? 0U : (interval_ms - elapsed_ms);

        if (!found || remaining_ms < next_sleep_ms) {
            next_sleep_ms = remaining_ms;
            found = true;
        }
    }

    if (!found || next_sleep_ms < MIN_SAMPLE_PERIOD_MS) {
        return MIN_SAMPLE_PERIOD_MS;
    }

    return next_sleep_ms;
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

void app_main(void)
{
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    ESP_ERROR_CHECK(i2c_master_init_dynamic());
    rescan_sensor_inventory();

    wifi_init_for_espnow();
    ESP_ERROR_CHECK(esp_now_init());
    ESP_ERROR_CHECK(esp_now_register_send_cb(on_data_sent));
    ESP_ERROR_CHECK(esp_now_register_recv_cb(on_data_recv));
    add_broadcast_peer();

    ESP_LOGI(TAG,
             "AUTO I2C PAYLOAD ready base_id=%lu sensors=%u changed=%u",
             (unsigned long)get_runtime_base_id(),
             (unsigned int)g_sensor_count,
             g_inventory_changed ? 1 : 0);

#if LAB_DEBUG_DISABLE_DEEP_SLEEP
    ESP_LOGW(TAG,
             "LAB DEBUG MODE: deep sleep disabled, forcing runtime send interval to %lu ms",
             (unsigned long)LAB_DEBUG_SEND_INTERVAL_MS);
#endif

    uint32_t wake_session_started_ms = esp_log_timestamp();
    uint32_t last_rescan_ms = esp_log_timestamp();

    while (1) {
#if !LAB_DEBUG_DISABLE_DEEP_SLEEP
        if ((esp_log_timestamp() - wake_session_started_ms) >= WAKE_SESSION_TIMEOUT_MS) {
            ESP_LOGW(TAG, "Wake session timed out before any configured reading was sent");
            enter_timed_deep_sleep("session_timeout", DEFAULT_SAMPLE_PERIOD_MS);
        }
#endif

        uint32_t now_ms = esp_log_timestamp();

        if ((now_ms - last_rescan_ms) >= SENSOR_RESCAN_PERIOD_MS) {
            rescan_sensor_inventory();
            last_rescan_ms = now_ms;
        }

        if (!g_base_acked) {
            send_base_hello();
            vTaskDelay(pdMS_TO_TICKS(DISCOVERY_PERIOD_MS));
            continue;
        }

        payload_sensor_t *module_sensor = select_next_module_sensor();
        if (module_sensor != NULL) {
            send_module_info(module_sensor);
            vTaskDelay(pdMS_TO_TICKS(DISCOVERY_PERIOD_MS));
            continue;
        }

        payload_sensor_t *data_sensor = select_next_due_sensor(now_ms);
        if (data_sensor != NULL) {
            if (send_sensor_data(data_sensor)) {
                data_sensor->last_sample_ms = now_ms;
                vTaskDelay(pdMS_TO_TICKS(TX_FLUSH_DELAY_MS));
#if LAB_DEBUG_DISABLE_DEEP_SLEEP
                ESP_LOGI(TAG,
                         "LAB DEBUG MODE: staying awake; next sample for sensor_id=%lu after %lu ms",
                         (unsigned long)data_sensor->sensor_id,
                         (unsigned long)get_effective_send_interval_ms(data_sensor));
#else
                if (!any_due_sensor_remaining(now_ms)) {
                    enter_timed_deep_sleep("sample_batch_sent", compute_next_sleep_ms(now_ms));
                }
#endif
                continue;
            }
        }

        vTaskDelay(pdMS_TO_TICKS(500));
    }
}
