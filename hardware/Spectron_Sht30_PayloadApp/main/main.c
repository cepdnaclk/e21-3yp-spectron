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
#include "esp_log.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_now.h"
#include "esp_mac.h"
#include "esp_netif.h"
#include "nvs_flash.h"
#include "nvs.h"

#include "protocol.h"

static const char *TAG = "BASE_PAYLOAD";

#define BASE_ID                     0x0000B001u
#define WIFI_CHANNEL                1

// Discovery/module handshake still runs every 2 seconds
#define DISCOVERY_PERIOD_MS         2000

// Sensor data sending period: 1 minute
#define DEFAULT_SAMPLE_PERIOD_MS    60000
#define MIN_SAMPLE_PERIOD_MS        60000

#define I2C_PORT                    I2C_NUM_0
#define DEFAULT_I2C_SDA_GPIO        6
#define DEFAULT_I2C_SCL_GPIO        7
#define DEFAULT_I2C_ADDR            0x44

#define NVS_NS_MODULE               "module_cfg"
#define NVS_KEY_SAMPLE_MS           "sample_ms"
#define NVS_KEY_TEMP_HI             "temp_hi"
#define NVS_KEY_HUM_HI              "hum_hi"
#define NVS_KEY_SENSOR_ID           "sensor_id"
#define NVS_KEY_SENSOR_TYPE         "sensor_type"
#define NVS_KEY_SENSOR_NAME         "sensor_name"
#define NVS_KEY_FW_CRC              "fw_crc"
#define NVS_KEY_I2C_SDA             "i2c_sda"
#define NVS_KEY_I2C_SCL             "i2c_scl"
#define NVS_KEY_I2C_ADDR            "i2c_addr"

static bool g_base_acked = false;
static bool g_module_acked = false;

static uint8_t g_ctrl_mac[6] = {0};

static uint32_t g_seq = 0;
static uint32_t g_sample_period_ms = DEFAULT_SAMPLE_PERIOD_MS;
static uint32_t g_sensor_id = 0;
static uint32_t g_module_crc32 = 0;

static uint8_t g_sensor_type = SENSOR_TYPE_NONE;
static uint8_t g_i2c_sda_gpio = DEFAULT_I2C_SDA_GPIO;
static uint8_t g_i2c_scl_gpio = DEFAULT_I2C_SCL_GPIO;
static uint8_t g_i2c_addr = DEFAULT_I2C_ADDR;

static char g_sensor_name[MPROTO_SENSOR_NAME_LEN] = {0};

static int16_t g_temp_hi_x100 = 3500;
static uint16_t g_hum_hi_x100 = 8500;

static void print_mac(const char *label, const uint8_t *mac)
{
    ESP_LOGI(TAG, "%s %02X:%02X:%02X:%02X:%02X:%02X",
             label,
             mac[0], mac[1], mac[2],
             mac[3], mac[4], mac[5]);
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

static esp_err_t nvs_read_module_meta(void)
{
    nvs_handle_t nvs;
    esp_err_t err = nvs_open(NVS_NS_MODULE, NVS_READONLY, &nvs);

    if (err != ESP_OK) {
        return err;
    }

    size_t name_len = sizeof(g_sensor_name);
    uint32_t tmp = 0;

    if (nvs_get_u32(nvs, NVS_KEY_SENSOR_ID, &g_sensor_id) != ESP_OK) {
        g_sensor_id = 0;
    }

    if (nvs_get_u32(nvs, NVS_KEY_SENSOR_TYPE, &tmp) == ESP_OK) {
        g_sensor_type = (uint8_t)tmp;
    } else {
        g_sensor_type = SENSOR_TYPE_NONE;
    }

    if (nvs_get_u32(nvs, NVS_KEY_FW_CRC, &g_module_crc32) != ESP_OK) {
        g_module_crc32 = 0;
    }

    if (nvs_get_str(nvs, NVS_KEY_SENSOR_NAME, g_sensor_name, &name_len) != ESP_OK) {
        strlcpy(g_sensor_name, "UNKNOWN", sizeof(g_sensor_name));
    }

    /*
     * Read old NVS value first, but then force 1-minute sending.
     * This prevents old stored values such as 2000 ms or 5000 ms from being used.
     */
    if (nvs_get_u32(nvs, NVS_KEY_SAMPLE_MS, &g_sample_period_ms) != ESP_OK) {
        g_sample_period_ms = DEFAULT_SAMPLE_PERIOD_MS;
    }

    g_sample_period_ms = DEFAULT_SAMPLE_PERIOD_MS;

    if (nvs_get_i16(nvs, NVS_KEY_TEMP_HI, &g_temp_hi_x100) != ESP_OK) {
        g_temp_hi_x100 = 3500;
    }

    if (nvs_get_u16(nvs, NVS_KEY_HUM_HI, &g_hum_hi_x100) != ESP_OK) {
        g_hum_hi_x100 = 8500;
    }

    if (nvs_get_u8(nvs, NVS_KEY_I2C_SDA, &g_i2c_sda_gpio) != ESP_OK) {
        g_i2c_sda_gpio = DEFAULT_I2C_SDA_GPIO;
    }

    if (nvs_get_u8(nvs, NVS_KEY_I2C_SCL, &g_i2c_scl_gpio) != ESP_OK) {
        g_i2c_scl_gpio = DEFAULT_I2C_SCL_GPIO;
    }

    if (nvs_get_u8(nvs, NVS_KEY_I2C_ADDR, &g_i2c_addr) != ESP_OK) {
        g_i2c_addr = DEFAULT_I2C_ADDR;
    }

    /*
     * Force the current lab wiring for now so stale NVS values from older
     * payload builds cannot keep the SHT30 on the wrong pins.
     */
    g_i2c_sda_gpio = DEFAULT_I2C_SDA_GPIO;
    g_i2c_scl_gpio = DEFAULT_I2C_SCL_GPIO;
    g_i2c_addr = DEFAULT_I2C_ADDR;

    nvs_close(nvs);

    ESP_LOGI(TAG,
             "Loaded module meta sensor_id=%lu name=%s type=%u crc=0x%08lX sda=%u scl=%u addr=0x%02X period=%lu",
             (unsigned long)g_sensor_id,
             g_sensor_name,
             g_sensor_type,
             (unsigned long)g_module_crc32,
             g_i2c_sda_gpio,
             g_i2c_scl_gpio,
             g_i2c_addr,
             (unsigned long)g_sample_period_ms);

    return ESP_OK;
}

static esp_err_t save_runtime_cfg(void)
{
    nvs_handle_t nvs;
    esp_err_t err = nvs_open(NVS_NS_MODULE, NVS_READWRITE, &nvs);

    if (err != ESP_OK) {
        return err;
    }

    err = nvs_set_u32(nvs, NVS_KEY_SAMPLE_MS, g_sample_period_ms);
    if (err != ESP_OK) {
        nvs_close(nvs);
        return err;
    }

    err = nvs_set_i16(nvs, NVS_KEY_TEMP_HI, g_temp_hi_x100);
    if (err != ESP_OK) {
        nvs_close(nvs);
        return err;
    }

    err = nvs_set_u16(nvs, NVS_KEY_HUM_HI, g_hum_hi_x100);
    if (err != ESP_OK) {
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
        .master.clk_speed = 100000,
        .clk_flags = 0
    };

    ESP_ERROR_CHECK(i2c_param_config(I2C_PORT, &conf));

    return i2c_driver_install(I2C_PORT, conf.mode, 0, 0, 0);
}

static esp_err_t sht30_read(float *temperature_c, float *humidity_rh)
{
    uint8_t cmd[2] = {0x24, 0x00};
    uint8_t rx[6] = {0};

    esp_err_t ret = i2c_master_write_to_device(
        I2C_PORT,
        g_i2c_addr,
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
        g_i2c_addr,
        rx,
        sizeof(rx),
        pdMS_TO_TICKS(100)
    );

    if (ret != ESP_OK) {
        return ret;
    }

    if (sht30_crc8(&rx[0], 2) != rx[2]) {
        ESP_LOGW(TAG,
                 "SHT30 CRC fail (temp) raw=%02X %02X %02X %02X %02X %02X",
                 rx[0], rx[1], rx[2], rx[3], rx[4], rx[5]);
        return ESP_FAIL;
    }

    if (sht30_crc8(&rx[3], 2) != rx[5]) {
        ESP_LOGW(TAG,
                 "SHT30 CRC fail (hum) raw=%02X %02X %02X %02X %02X %02X",
                 rx[0], rx[1], rx[2], rx[3], rx[4], rx[5]);
        return ESP_FAIL;
    }

    uint16_t raw_t = ((uint16_t)rx[0] << 8) | rx[1];
    uint16_t raw_h = ((uint16_t)rx[3] << 8) | rx[4];

    *temperature_c = -45.0f + 175.0f * ((float)raw_t / 65535.0f);
    *humidity_rh   = 100.0f * ((float)raw_h / 65535.0f);

    return ESP_OK;
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
    pl.fw_version = 1;
    pl.has_module = (g_sensor_type != SENSOR_TYPE_NONE);

    uint8_t broadcast[6] = {
        0xff, 0xff, 0xff,
        0xff, 0xff, 0xff
    };

    mproto_frame_t f = {0};

    f.msg_type = MSG_BASE_HELLO;
    f.base_id = BASE_ID;
    f.payload_len = sizeof(pl);
    f.seq_num = ++g_seq;

    memcpy(f.payload, &pl, sizeof(pl));

    esp_err_t err = esp_now_send(broadcast, (uint8_t *)&f, sizeof(f));

    if (err != ESP_OK) {
        ESP_LOGE(TAG, "send_base_hello failed: %s", esp_err_to_name(err));
    } else {
        ESP_LOGI(TAG,
                 "BASE_HELLO sent base_id=%lu seq=%lu has_module=%u",
                 (unsigned long)BASE_ID,
                 (unsigned long)f.seq_num,
                 pl.has_module);
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
                 "MODULE_INFO sent sensor_id=%lu name=%s seq=%lu period=%lu",
                 (unsigned long)g_sensor_id,
                 g_sensor_name,
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

static void send_sensor_data(void)
{
    if (!g_module_acked) {
        return;
    }

    float t = 0.0f;
    float h = 0.0f;

    esp_err_t ret = sht30_read(&t, &h);

    if (ret != ESP_OK) {
        ESP_LOGW(TAG,
                 "Skipping data send due to sensor read failure: %s",
                 esp_err_to_name(ret));
        return;
    }

    mproto_sht30_data_t pl = {
        .temperature_c_x100 = (int16_t)lroundf(t * 100.0f),
        .humidity_rh_x100 = (uint16_t)lroundf(h * 100.0f),
        .uptime_s = esp_log_timestamp() / 1000
    };

    if (pl.temperature_c_x100 >= g_temp_hi_x100) {
        pl.alert_flags |= 0x01;
    }

    if (pl.humidity_rh_x100 >= g_hum_hi_x100) {
        pl.alert_flags |= 0x02;
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
    } else {
        ESP_LOGI(TAG,
                 "SENSOR_DATA sent seq=%lu temp=%.2f hum=%.2f alerts=0x%02X next_send_after=%lu_ms",
                 (unsigned long)f.seq_num,
                 t,
                 h,
                 pl.alert_flags,
                 (unsigned long)g_sample_period_ms);
    }
}

static void on_data_recv(const esp_now_recv_info_t *recv_info, const uint8_t *data, int len)
{
    if (!recv_info || !recv_info->src_addr || !data) {
        return;
    }

    if (len != sizeof(mproto_frame_t)) {
        ESP_LOGW(TAG,
                 "Unexpected len=%d expected=%d",
                 len,
                 (int)sizeof(mproto_frame_t));
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

            ESP_LOGI(TAG,
                     "BASE_ACK received for base_id=%lu",
                     (unsigned long)BASE_ID);
            break;

        case MSG_MODULE_ACK:
            memcpy(g_ctrl_mac, recv_info->src_addr, 6);
            add_controller_peer_if_needed(recv_info->src_addr);

            g_module_acked = true;

            ESP_LOGI(TAG,
                     "MODULE_ACK received sensor_id=%lu",
                     (unsigned long)g_sensor_id);
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

                /*
                 * Force 1-minute sensor sending.
                 * For now, ignore sample_period_ms from controller.
                 */
                g_sample_period_ms = DEFAULT_SAMPLE_PERIOD_MS;

                g_temp_hi_x100 = pl.temp_threshold_hi_x100;
                g_hum_hi_x100 = pl.humidity_threshold_hi_x100;

                esp_err_t err = save_runtime_cfg();

                if (err != ESP_OK) {
                    ESP_LOGW(TAG,
                             "save_runtime_cfg failed: %s",
                             esp_err_to_name(err));
                    send_config_ack(f.seq_num, ACK_STATUS_APPLY_FAIL, "nvs_fail");
                } else {
                    ESP_LOGI(TAG,
                             "CONFIG applied fixed_period=%lu temp_hi=%.2f hum_hi=%.2f",
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

    if (ret == ESP_ERR_NVS_NO_FREE_PAGES ||
        ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }

    ESP_ERROR_CHECK(ret);

    ESP_ERROR_CHECK(nvs_read_module_meta());
    ESP_ERROR_CHECK(i2c_master_init_dynamic());

    wifi_init_for_espnow();

    ESP_ERROR_CHECK(esp_now_init());
    ESP_ERROR_CHECK(esp_now_register_send_cb(on_data_sent));
    ESP_ERROR_CHECK(esp_now_register_recv_cb(on_data_recv));

    add_broadcast_peer();

    ESP_LOGI(TAG,
             "Base payload ready base_id=%lu sensor_id=%lu sensor_name=%s send_period=%lu_ms",
             (unsigned long)BASE_ID,
             (unsigned long)g_sensor_id,
             g_sensor_name,
             (unsigned long)g_sample_period_ms);

    while (1) {
        if (!g_base_acked) {
            send_base_hello();
            vTaskDelay(pdMS_TO_TICKS(DISCOVERY_PERIOD_MS));
        } else if (!g_module_acked) {
            send_module_info();
            vTaskDelay(pdMS_TO_TICKS(DISCOVERY_PERIOD_MS));
        } else {
            send_sensor_data();

            /*
             * Final delay between SENSOR_DATA packets.
             * This is fixed to 60000 ms = 1 minute.
             */
            vTaskDelay(pdMS_TO_TICKS(g_sample_period_ms));
        }
    }
}
