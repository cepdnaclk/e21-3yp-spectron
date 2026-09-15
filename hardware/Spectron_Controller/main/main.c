#include <inttypes.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <sys/time.h>
#include <time.h>
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "freertos/queue.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "driver/uart.h"
#include "cJSON.h"
#include "esp_crt_bundle.h"
#include "esp_err.h"
#include "esp_event.h"
#include "esp_http_client.h"
#include "esp_log.h"
#include "esp_modem_api.h"
#include "esp_netif.h"
#include "esp_netif_ppp.h"
#include "esp_netif_sntp.h"
#include "esp_now.h"
#include "esp_wifi.h"
#include "nvs.h"
#include "nvs_flash.h"
#include "protocol.h"

static const char *TAG = "CTRL_REAL";

#define MODULE_NAME_SHT30   "SHT30"
#define MODULE_NAME_BME280  "BME280"
#define MODULE_NAME_BMP280  "BMP280"
#define MODULE_NAME_VL53L0X "VL53L0X"

#define DEVICE_ID_STR "CTRL-REAL-001"
#define BACKEND_BASE_URL "https://spectroniot.xyz"
#define DISCOVER_URL      BACKEND_BASE_URL "/api/iot/discover"
#define SENSOR_CONFIG_URL BACKEND_BASE_URL "/api/iot/config"
#define TELEMETRY_URL     BACKEND_BASE_URL "/api/iot/upload"
#define BACKEND_PROBE_URL BACKEND_BASE_URL "/"
#define ENABLE_BACKEND_WIFI_CONFIG 0
#define WIFI_HTTP_TIMEOUT_MS       30000
#define PPP_HTTP_TIMEOUT_MS        120000
#define HTTP_RETRY_DELAY_MS        10000
#define BACKEND_CONFIG_POLL_MS     300000
#define BACKEND_SYNC_RETRY_MS      15000
#define CONFIG_ACK_TIMEOUT_MS       15000
#define BACKEND_SAMPLE_MIN_MS      1000
#define WIFI_BACKGROUND_RETRY_MS   60000
#define NETWORK_LOOP_DELAY_MS      1000
#define ENABLE_SNTP_FOR_TLS_TIME   1
#define CONFIG_ID_MAX_LEN          128

#define SENSOR_CONFIG_NVS_NAMESPACE "sensor_cloud"
#define VALID_TIME_EPOCH    1704067200LL
#define SNTP_SYNC_WAIT_MS   30000
#define SNTP_RETRY_DELAY_MS 5000
#define ESPNOW_DEFAULT_CHANNEL    1
#define ESPNOW_RX_QUEUE_LENGTH    16
#define ESPNOW_TX_QUEUE_LENGTH    12
#define ESPNOW_SEND_TIMEOUT_MS    1200
#define ESPNOW_SEND_RETRY_MS      200
#define ESPNOW_SEND_MAX_RETRIES   3
#define MAX_SENSOR_MODULES        8
#define WIFI_SSID_MAX_LEN              32
#define WIFI_PASSWORD_MAX_LEN          64
#define WIFI_CONNECT_ATTEMPTS          3
#define WIFI_ATTEMPT_TIMEOUT_MS        12000
#define WIFI_RETRY_DELAY_MS            1500
#define WIFI_SCAN_MAX_RESULTS          20

#define NETWORK_NVS_NAMESPACE "spectron_net"
#define NVS_ACTIVE_VALID_KEY  "a_valid"
#define NVS_ACTIVE_SSID_KEY   "a_ssid"
#define NVS_ACTIVE_PASS_KEY   "a_pass"
#define NVS_ACTIVE_REV_KEY    "a_rev"
#define NVS_PENDING_VALID_KEY "p_valid"
#define NVS_PENDING_SSID_KEY  "p_ssid"
#define NVS_PENDING_PASS_KEY  "p_pass"
#define NVS_PENDING_REV_KEY   "p_rev"
#define NVS_FAILED_REV_KEY    "fail_rev"

/*

 SIM800C / PPP configuration

 */

#define MODEM_UART_NUM  UART_NUM_2
#define MODEM_TX_PIN    17
#define MODEM_RX_PIN    16
#define MODEM_RTS_PIN   UART_PIN_NO_CHANGE
#define MODEM_CTS_PIN   UART_PIN_NO_CHANGE
#define MODEM_BAUD_RATE 9600
#define MODEM_APN       "mobitel"
#define MODEM_USE_GPIO15_PWRKEY 1
#define MODEM_PWRKEY_PIN        15
#define MODEM_PWRKEY_HOLD_MS    1200
#define MODEM_BOOT_WAIT_MS              7000
#define MODEM_REGISTRATION_ATTEMPTS     12
#define MODEM_REGISTRATION_DELAY_MS     3000
#define MODEM_ATTACH_ATTEMPTS           8
#define MODEM_ATTACH_RETRY_DELAY_MS     3000
#define PPP_CONNECT_TIMEOUT_MS          60000
#define PPP_RETRY_INTERVAL_MS           15000
#define PPP_COMMAND_RECOVERY_WAIT_MS    1500

/*
Status output and buffers
 */

#define STATUS_BULB_PIN         13
#define STATUS_BULB_ACTIVE_HIGH 1
#define RAW_BUF_SIZE       1024
#define RAW_RX_CHUNK       128
#define HTTP_RESP_BUF_SIZE 2048
#define HTTP_POST_BUF_SIZE 4096

/*
 Upload buffering
 */

#define CLOUD_SENSOR_ID_LEN   48
#define MAX_METRICS_PER_BATCH 3
#define UPLOAD_QUEUE_LENGTH   128

/*
  Event bits
*/

#define WIFI_GOT_IP_BIT        BIT0
#define WIFI_DISCONNECTED_BIT  BIT1
#define PPP_CONNECTED_BIT      BIT2
#define PPP_DISCONNECTED_BIT   BIT3

static EventGroupHandle_t g_event_group;

/*
 Types
 */

typedef enum {

    NETWORK_MODE_NONE = 0,

    NETWORK_MODE_WIFI,

    NETWORK_MODE_SIM800,

} network_mode_t;

typedef struct {

    bool valid;

    char ssid[WIFI_SSID_MAX_LEN + 1];

    char password[WIFI_PASSWORD_MAX_LEN + 1];

    uint32_t revision;

} stored_wifi_config_t;

typedef enum {

    SENSOR_MODULE_UNKNOWN = 0,

    SENSOR_MODULE_SHT30,

    SENSOR_MODULE_BME280,

    SENSOR_MODULE_BMP280,

    SENSOR_MODULE_VL53L0X,

} sensor_module_kind_t;

typedef struct {

    bool in_use;

    uint8_t mac[6];

    uint32_t base_id;

    uint32_t sensor_id;

    uint8_t sensor_type;

    sensor_module_kind_t module_kind;

    uint32_t last_seen_ms;

    bool has_last_sensor_seq;

    uint32_t last_sensor_seq;

    bool module_info_valid;

    char sensor_name[MPROTO_SENSOR_NAME_LEN + 1];

    uint32_t module_sample_period_ms;

    int16_t module_temp_threshold_hi_x100;

    uint16_t module_humidity_threshold_hi_x100;

   
    char applied_config_id[CONFIG_ID_MAX_LEN];

    bool config_apply_pending;

    uint32_t pending_config_seq;

    uint32_t pending_config_started_ms;

    char pending_config_id[CONFIG_ID_MAX_LEN];

    uint32_t pending_sample_period_ms;

    int16_t pending_temp_threshold_hi_x100;

    uint16_t pending_humidity_threshold_hi_x100;

} sensor_module_record_t;

typedef struct {

    uint8_t src_mac[6];

    mproto_frame_t frame;

} espnow_rx_item_t;

typedef struct {

    uint8_t dest_mac[6];

    mproto_frame_t frame;

} espnow_tx_item_t;

typedef enum {

    METRIC_TEMPERATURE = 0,

    METRIC_HUMIDITY,

    METRIC_PRESSURE,

    METRIC_DISTANCE,

} metric_kind_t;

typedef struct {

    uint32_t base_id;

    uint32_t sensor_id;

    uint8_t sensor_type;

    uint8_t metric_kind;

    uint8_t decimals;

    float value;

} pending_metric_t;

typedef struct {

    uint32_t rx_ms;

    int64_t timestamp;

    uint8_t metric_count;

    pending_metric_t metrics[MAX_METRICS_PER_BATCH];

} upload_batch_t;

typedef struct {

    char *buf;

    int max_len;

    int cur_len;

} http_resp_ctx_t;

/* 
Global state
*/

static esp_netif_t *g_wifi_netif = NULL;

static esp_netif_t *g_ppp_netif = NULL;

static esp_modem_dce_t *g_dce = NULL;

static volatile bool g_wifi_connected = false;

static volatile bool g_ppp_connected = false;

static volatile bool g_ppp_should_be_active = false;

static volatile bool g_espnow_started = false;

static volatile uint8_t g_current_radio_channel = ESPNOW_DEFAULT_CHANNEL;

static volatile bool g_network_fault_requested = false;

static volatile network_mode_t g_active_network = NETWORK_MODE_NONE;

static volatile bool g_time_synced = false;

static bool g_sntp_inited = false;

static size_t g_sntp_server_index = 0;

static stored_wifi_config_t g_active_wifi_config = {0};

static stored_wifi_config_t g_pending_wifi_config = {0};

static uint32_t g_failed_wifi_revision = 0;

static sensor_module_record_t g_modules[MAX_SENSOR_MODULES] = {0};

static uint32_t g_seq = 0;

static QueueHandle_t g_espnow_rx_queue = NULL;

static QueueHandle_t g_espnow_tx_queue = NULL;

static QueueHandle_t g_upload_queue = NULL;

static SemaphoreHandle_t g_espnow_send_done = NULL;

static SemaphoreHandle_t g_network_mutex = NULL;

static SemaphoreHandle_t g_registry_mutex = NULL;

static volatile bool g_backend_sync_requested = true;

static volatile bool g_backend_ready_for_upload = false;

static volatile bool g_backend_transport_failure = false;

static volatile esp_now_send_status_t g_last_espnow_send_status = ESP_NOW_SEND_FAIL;

static volatile uint32_t g_rx_frame_count = 0;

static volatile uint32_t g_rx_invalid_count = 0;

static volatile uint32_t g_rx_duplicate_count = 0;

static volatile uint32_t g_rx_queue_drop_count = 0;

static volatile uint32_t g_tx_success_count = 0;

static volatile uint32_t g_tx_failure_count = 0;

static volatile uint32_t g_upload_success_count = 0;

static volatile uint32_t g_upload_failure_count = 0;

static volatile uint32_t g_upload_rejected_count = 0;

static volatile uint32_t g_upload_queue_overflow_count = 0;

static const char *const g_sntp_servers[] = {

    "time.google.com",

    "time.cloudflare.com",

    "pool.ntp.org",

};

#define SNTP_SERVER_COUNT (sizeof(g_sntp_servers) / sizeof(g_sntp_servers[0]))

static char g_rsp[RAW_BUF_SIZE];

static uint8_t g_rx_chunk[RAW_RX_CHUNK];

static char g_tx_buf[160];

static char g_http_post_body[HTTP_POST_BUF_SIZE];

/*
Forward declarations
 */

static void on_data_sent(const wifi_tx_info_t *tx_info, esp_now_send_status_t status);

static void on_data_recv(const esp_now_recv_info_t *recv_info, const uint8_t *data, int len);

/* 
Basic helpers
*/

static uint32_t ms_now(void) {

    return esp_log_timestamp();

}

static int64_t ts_now_seconds(void) {

    time_t now = 0;

    time(&now);

    return (int64_t)now;

}

static bool system_time_is_valid(void) {

    return ts_now_seconds() >= VALID_TIME_EPOCH;

}

static bool network_is_available(void) {

    return g_wifi_connected || g_ppp_connected;

}

static void network_lock(void) {

    if (g_network_mutex != NULL) {

        xSemaphoreTakeRecursive(g_network_mutex, portMAX_DELAY);

    }

}

static void network_unlock(void) {

    if (g_network_mutex != NULL) {

        xSemaphoreGiveRecursive(g_network_mutex);

    }

}

static void registry_lock(void) {

    if (g_registry_mutex != NULL) {

        xSemaphoreTake(g_registry_mutex, portMAX_DELAY);

    }

}

static void registry_unlock(void) {

    if (g_registry_mutex != NULL) {

        xSemaphoreGive(g_registry_mutex);

    }

}

static uint32_t next_seq(void) {

    uint32_t seq;

    registry_lock();

    seq = ++g_seq;

    registry_unlock();

    return seq;

}

static void log_utc_time(const char *label, time_t now) {

    struct tm utc_tm = {0};

    char time_buf[40] = {0};

    gmtime_r(&now, &utc_tm);

    strftime(time_buf, sizeof(time_buf), "%Y-%m-%d %H:%M:%S UTC", &utc_tm);

    ESP_LOGI(TAG, "%s epoch=%lld time=%s", label, (long long)now, time_buf);

}

static void print_mac(const char *label, const uint8_t *mac) {

    ESP_LOGI(TAG,

             "%s %02X:%02X:%02X:%02X:%02X:%02X",

             label,

             mac[0],

             mac[1],

             mac[2],

             mac[3],

             mac[4],

             mac[5]);

}

static sensor_module_kind_t classify_sensor_module(uint8_t sensor_type,
                                                        const char *sensor_name) {

    if (sensor_name == NULL) {

        return SENSOR_MODULE_UNKNOWN;

    }

    if (sensor_type == SENSOR_TYPE_SHT30 && strcmp(sensor_name, MODULE_NAME_SHT30) == 0) {

        return SENSOR_MODULE_SHT30;

    }

    if (sensor_type == SENSOR_TYPE_PRESSURE) {

        if (strcmp(sensor_name, MODULE_NAME_BME280) == 0) {

            return SENSOR_MODULE_BME280;

        }

        if (strcmp(sensor_name, MODULE_NAME_BMP280) == 0) {

            return SENSOR_MODULE_BMP280;

        }

        return SENSOR_MODULE_UNKNOWN;

    }

    if (sensor_type == SENSOR_TYPE_VL53 && strcmp(sensor_name, MODULE_NAME_VL53L0X) == 0) {

        return SENSOR_MODULE_VL53L0X;

    }

    return SENSOR_MODULE_UNKNOWN;

}

static const char *sensor_module_kind_name(sensor_module_kind_t kind) {

    switch (kind) {

        case SENSOR_MODULE_SHT30:

            return MODULE_NAME_SHT30;

        case SENSOR_MODULE_BME280:

            return MODULE_NAME_BME280;

        case SENSOR_MODULE_BMP280:

            return MODULE_NAME_BMP280;

        case SENSOR_MODULE_VL53L0X:

            return MODULE_NAME_VL53L0X;

        default:

            return "UNKNOWN";

    }

}

static const char *network_mode_name(network_mode_t mode) {

    switch (mode) {

        case NETWORK_MODE_WIFI:

            return "Wi-Fi";

        case NETWORK_MODE_SIM800:

            return "SIM800C";

        default:

            return "none";

    }

}

static void set_active_network(network_mode_t mode) {

    if (g_active_network != mode) {

        g_active_network = mode;

        ESP_LOGI(TAG, "Active internet connection: %s", network_mode_name(mode));

    }

}

static void make_physical_sensor_id(char *buf, size_t buf_len, uint32_t sensor_id) {

    /* sensor_id is generated by the sensor base from permanent hardware identity. */

    snprintf(buf, buf_len, "SEN-%08" PRIX32, sensor_id);

}

static void make_upload_sensor_id(char *buf,

                                  size_t buf_len,

                                  uint32_t sensor_id,

                                  uint8_t sensor_type,

                                  metric_kind_t metric_kind) {

    char physical_id[CLOUD_SENSOR_ID_LEN];

    make_physical_sensor_id(physical_id, sizeof(physical_id), sensor_id);

    /* Keep the physical sensor ID as the primary reading ID. Composite sensors

     * use stable suffixes for additional measurements, matching the backend example. */

    if (sensor_type == SENSOR_TYPE_SHT30) {

        if (metric_kind == METRIC_HUMIDITY) {

            snprintf(buf, buf_len, "%s-H", physical_id);

        } else {

            snprintf(buf, buf_len, "%s", physical_id);

        }

        return;

    }

    if (sensor_type == SENSOR_TYPE_PRESSURE) {

        if (metric_kind == METRIC_TEMPERATURE) {

            snprintf(buf, buf_len, "%s-T", physical_id);

        } else if (metric_kind == METRIC_HUMIDITY) {

            snprintf(buf, buf_len, "%s-H", physical_id);

        } else {

            snprintf(buf, buf_len, "%s", physical_id);

        }

        return;

    }

    snprintf(buf, buf_len, "%s", physical_id);

}

static const char *backend_sensor_type_name(uint8_t sensor_type) {

    switch (sensor_type) {

        case SENSOR_TYPE_SHT30:

            return "temperature_humidity";

        case SENSOR_TYPE_PRESSURE:

            return "pressure";

        case SENSOR_TYPE_VL53:

            return "distance";

        default:

            return "unknown";

    }

}

static const char *backend_sensor_unit(uint8_t sensor_type) {

    switch (sensor_type) {

        case SENSOR_TYPE_SHT30:

            return "C";

        case SENSOR_TYPE_PRESSURE:

            return "hPa";

        case SENSOR_TYPE_VL53:

            return "mm";

        default:

            return "";

    }

}

static const char *metric_name(metric_kind_t kind) {

    switch (kind) {

        case METRIC_TEMPERATURE:

            return "temperature";

        case METRIC_HUMIDITY:

            return "humidity";

        case METRIC_PRESSURE:

            return "pressure";

        case METRIC_DISTANCE:

            return "distance";

        default:

            return "unknown";

    }

}

/* 
Status bulb
*/

static void status_bulb_init(void) {

    gpio_config_t config = {

        .pin_bit_mask = (1ULL << STATUS_BULB_PIN),

        .mode = GPIO_MODE_OUTPUT,

        .pull_up_en = GPIO_PULLUP_DISABLE,

        .pull_down_en = GPIO_PULLDOWN_DISABLE,

        .intr_type = GPIO_INTR_DISABLE,

    };

    ESP_ERROR_CHECK(gpio_config(&config));

}

static void status_bulb_set(bool on) {

#if STATUS_BULB_ACTIVE_HIGH

    gpio_set_level(STATUS_BULB_PIN, on ? 1 : 0);

#else

    gpio_set_level(STATUS_BULB_PIN, on ? 0 : 1);

#endif

}

static void status_task(void *arg) {

    bool blink_state = false;

    while (true) {

        if (g_wifi_connected) {

            status_bulb_set(true);

            vTaskDelay(pdMS_TO_TICKS(500));

            continue;

        }

        if (g_ppp_connected) {

            blink_state = !blink_state;

            status_bulb_set(blink_state);

            vTaskDelay(pdMS_TO_TICKS(1000));

            continue;

        }

        status_bulb_set(false);

        vTaskDelay(pdMS_TO_TICKS(500));

    }

}

/* 
Per-sensor cloud configId storage
  */

static void sensor_config_nvs_key(uint32_t sensor_id, char *key, size_t key_len) {

    snprintf(key, key_len, "c%08" PRIx32, sensor_id);

}

static bool load_sensor_config_id(uint32_t sensor_id, char *config_id, size_t config_id_len) {

    if (config_id == NULL || config_id_len == 0) {

        return false;

    }

    config_id[0] = '\0';

    nvs_handle_t handle;

    if (nvs_open(SENSOR_CONFIG_NVS_NAMESPACE, NVS_READONLY, &handle) != ESP_OK) {

        return false;

    }

    char key[12];

    sensor_config_nvs_key(sensor_id, key, sizeof(key));

    size_t len = config_id_len;

    esp_err_t err = nvs_get_str(handle, key, config_id, &len);

    nvs_close(handle);

    return err == ESP_OK && config_id[0] != '\0';

}

static bool save_sensor_config_id(uint32_t sensor_id, const char *config_id) {

    if (config_id == NULL || config_id[0] == '\0') {

        return false;

    }

    nvs_handle_t handle;

    esp_err_t err = nvs_open(SENSOR_CONFIG_NVS_NAMESPACE, NVS_READWRITE, &handle);

    if (err != ESP_OK) {

        return false;

    }

    char key[12];

    sensor_config_nvs_key(sensor_id, key, sizeof(key));

    err = nvs_set_str(handle, key, config_id);

    if (err == ESP_OK) {

        err = nvs_commit(handle);

    }

    nvs_close(handle);

    return err == ESP_OK;

}

/*
 NVS Wi-Fi credential storage
*/

static bool wifi_config_is_valid(const stored_wifi_config_t *config) {

    if (config == NULL || !config->valid) {

        return false;

    }

    size_t ssid_len = strnlen(config->ssid, sizeof(config->ssid));

    size_t password_len = strnlen(config->password, sizeof(config->password));

    if (ssid_len == 0 || ssid_len > WIFI_SSID_MAX_LEN) {

        return false;

    }

    if (password_len > WIFI_PASSWORD_MAX_LEN) {

        return false;

    }

    /* Empty password is allowed for an open network. */

    if (password_len > 0 && password_len < 8) {

        return false;

    }

    return true;

}

static bool wifi_load_slot(const char *valid_key,

                           const char *ssid_key,

                           const char *pass_key,

                           const char *revision_key,

                           stored_wifi_config_t *config) {

    if (config == NULL) {

        return false;

    }

    memset(config, 0, sizeof(*config));

    nvs_handle_t handle;

    esp_err_t err = nvs_open(NETWORK_NVS_NAMESPACE, NVS_READONLY, &handle);

    if (err != ESP_OK) {

        return false;

    }

    uint8_t valid = 0;

    size_t ssid_len = sizeof(config->ssid);

    size_t password_len = sizeof(config->password);

    err = nvs_get_u8(handle, valid_key, &valid);

    if (err != ESP_OK || valid == 0) {

        nvs_close(handle);

        return false;

    }

    err = nvs_get_str(handle, ssid_key, config->ssid, &ssid_len);

    if (err == ESP_OK) {

        err = nvs_get_str(handle, pass_key, config->password, &password_len);

    }

    if (err == ESP_OK) {

        err = nvs_get_u32(handle, revision_key, &config->revision);

    }

    nvs_close(handle);

    if (err != ESP_OK) {

        memset(config, 0, sizeof(*config));

        return false;

    }

    config->valid = true;

    if (!wifi_config_is_valid(config)) {

        memset(config, 0, sizeof(*config));

        return false;

    }

    return true;

}

static bool wifi_save_slot(const char *valid_key,

                           const char *ssid_key,

                           const char *pass_key,

                           const char *revision_key,

                           const stored_wifi_config_t *config) {

    if (!wifi_config_is_valid(config)) {

        return false;

    }

    nvs_handle_t handle;

    esp_err_t err = nvs_open(NETWORK_NVS_NAMESPACE, NVS_READWRITE, &handle);

    if (err != ESP_OK) {

        ESP_LOGE(TAG, "NVS open failed: %s", esp_err_to_name(err));

        return false;

    }

    err = nvs_set_str(handle, ssid_key, config->ssid);

    if (err == ESP_OK) {

        err = nvs_set_str(handle, pass_key, config->password);

    }

    if (err == ESP_OK) {

        err = nvs_set_u32(handle, revision_key, config->revision);

    }

    if (err == ESP_OK) {

        err = nvs_set_u8(handle, valid_key, 1);

    }

    if (err == ESP_OK) {

        err = nvs_commit(handle);

    }

    nvs_close(handle);

    if (err != ESP_OK) {

        ESP_LOGE(TAG, "NVS Wi-Fi save failed: %s", esp_err_to_name(err));

        return false;

    }

    return true;

}

static bool wifi_clear_slot(const char *valid_key,

                            const char *ssid_key,

                            const char *pass_key,

                            const char *revision_key) {

    nvs_handle_t handle;

    esp_err_t err = nvs_open(NETWORK_NVS_NAMESPACE, NVS_READWRITE, &handle);

    if (err != ESP_OK) {

        return false;

    }

    nvs_erase_key(handle, valid_key);

    nvs_erase_key(handle, ssid_key);

    nvs_erase_key(handle, pass_key);

    nvs_erase_key(handle, revision_key);

    err = nvs_commit(handle);

    nvs_close(handle);

    return err == ESP_OK;

}

static bool wifi_load_active_config(stored_wifi_config_t *config) {

    return wifi_load_slot(NVS_ACTIVE_VALID_KEY,

                          NVS_ACTIVE_SSID_KEY,

                          NVS_ACTIVE_PASS_KEY,

                          NVS_ACTIVE_REV_KEY,

                          config);

}

static bool wifi_save_active_config(const stored_wifi_config_t *config) {

    return wifi_save_slot(NVS_ACTIVE_VALID_KEY,

                          NVS_ACTIVE_SSID_KEY,

                          NVS_ACTIVE_PASS_KEY,

                          NVS_ACTIVE_REV_KEY,

                          config);

}

static bool wifi_load_pending_config(stored_wifi_config_t *config) {

    return wifi_load_slot(NVS_PENDING_VALID_KEY,

                          NVS_PENDING_SSID_KEY,

                          NVS_PENDING_PASS_KEY,

                          NVS_PENDING_REV_KEY,

                          config);

}

static bool wifi_save_pending_config(const stored_wifi_config_t *config) {

    return wifi_save_slot(NVS_PENDING_VALID_KEY,

                          NVS_PENDING_SSID_KEY,

                          NVS_PENDING_PASS_KEY,

                          NVS_PENDING_REV_KEY,

                          config);

}

static bool wifi_clear_pending_config(void) {

    memset(&g_pending_wifi_config, 0, sizeof(g_pending_wifi_config));

    return wifi_clear_slot(NVS_PENDING_VALID_KEY,

                           NVS_PENDING_SSID_KEY,

                           NVS_PENDING_PASS_KEY,

                           NVS_PENDING_REV_KEY);

}

static bool wifi_load_failed_revision(uint32_t *revision) {

    if (revision == NULL) {

        return false;

    }

    *revision = 0;

    nvs_handle_t handle;

    esp_err_t err = nvs_open(NETWORK_NVS_NAMESPACE, NVS_READONLY, &handle);

    if (err != ESP_OK) {

        return false;

    }

    err = nvs_get_u32(handle, NVS_FAILED_REV_KEY, revision);

    nvs_close(handle);

    return err == ESP_OK;

}

static bool wifi_save_failed_revision(uint32_t revision) {

    nvs_handle_t handle;

    esp_err_t err = nvs_open(NETWORK_NVS_NAMESPACE, NVS_READWRITE, &handle);

    if (err != ESP_OK) {

        return false;

    }

    err = nvs_set_u32(handle, NVS_FAILED_REV_KEY, revision);

    if (err == ESP_OK) {

        err = nvs_commit(handle);

    }

    nvs_close(handle);

    if (err == ESP_OK) {

        g_failed_wifi_revision = revision;

        return true;

    }

    return false;

}

/* 
Wi-Fi and IP events
*/

static void wifi_return_to_default_espnow_channel_locked(void) {

    esp_wifi_disconnect();

    vTaskDelay(pdMS_TO_TICKS(100));

    esp_err_t err = esp_wifi_set_channel(ESPNOW_DEFAULT_CHANNEL, WIFI_SECOND_CHAN_NONE);

    if (err != ESP_OK) {

        ESP_LOGW(TAG,

                 "Failed to restore default ESP-NOW channel %d: %s",

                 ESPNOW_DEFAULT_CHANNEL,

                 esp_err_to_name(err));

        return;

    }

    g_current_radio_channel = ESPNOW_DEFAULT_CHANNEL;

    ESP_LOGI(TAG,

             "Controller radio returned to default ESP-NOW channel %u",

             g_current_radio_channel);

}

static const char *wifi_disconnect_reason_name(uint8_t reason) {

    switch (reason) {

        case 15:

            return "4WAY_HANDSHAKE_TIMEOUT";

        case 36:

            return "ASSOC_LEAVE";

        case 200:

            return "BEACON_TIMEOUT";

        case 201:

            return "NO_AP_FOUND";

        case 202:

            return "AUTH_FAIL";

        case 203:

            return "ASSOC_FAIL";

        case 204:

            return "HANDSHAKE_TIMEOUT";

        case 205:

            return "CONNECTION_FAIL";

        default:

            return "OTHER";

    }

}

static void wifi_event_handler(void *arg,

                               esp_event_base_t event_base,

                               int32_t event_id,

                               void *event_data) {

    if (event_base != WIFI_EVENT) {

        return;

    }

    if (event_id == WIFI_EVENT_STA_DISCONNECTED) {

        const wifi_event_sta_disconnected_t *event =

            (const wifi_event_sta_disconnected_t *)event_data;

        uint8_t reason = event != NULL ? event->reason : 0;

        ESP_LOGW(TAG,

                 "Wi-Fi disconnected: reason=%u (%s)",

                 reason,

                 wifi_disconnect_reason_name(reason));

        g_wifi_connected = false;

        if (g_active_network == NETWORK_MODE_WIFI) {

            g_backend_ready_for_upload = false;

            g_backend_sync_requested = true;

        }

        xEventGroupClearBits(g_event_group, WIFI_GOT_IP_BIT);

        xEventGroupSetBits(g_event_group, WIFI_DISCONNECTED_BIT);

    }

}

static void ip_event_handler(void *arg,

                             esp_event_base_t event_base,

                             int32_t event_id,

                             void *event_data) {

    if (event_base != IP_EVENT) {

        return;

    }

    if (event_id == IP_EVENT_STA_GOT_IP) {

        ip_event_got_ip_t *event = (ip_event_got_ip_t *)event_data;

        uint8_t primary_channel = 0;

        wifi_second_chan_t secondary_channel = WIFI_SECOND_CHAN_NONE;

        esp_err_t channel_err = esp_wifi_get_channel(&primary_channel, &secondary_channel);

        if (channel_err == ESP_OK && primary_channel != 0) {

            g_current_radio_channel = primary_channel;

        } else {

            ESP_LOGW(TAG,

                     "Unable to read the connected Wi-Fi channel: %s",

                     esp_err_to_name(channel_err));

        }

        g_wifi_connected = true;

        xEventGroupClearBits(g_event_group, WIFI_DISCONNECTED_BIT);

        xEventGroupSetBits(g_event_group, WIFI_GOT_IP_BIT);

        ESP_LOGI(TAG, "Wi-Fi got IP: " IPSTR, IP2STR(&event->ip_info.ip));

        ESP_LOGI(TAG,

                 "Controller Wi-Fi and ESP-NOW now share radio channel %u",

                 g_current_radio_channel);

        g_backend_ready_for_upload = false;

        g_backend_sync_requested = true;

        return;

    }

    if (event_id == IP_EVENT_PPP_GOT_IP) {

        if (!g_ppp_should_be_active) {

            ESP_LOGW(TAG, "Ignoring a stale PPP connected event");

            return;

        }

        ip_event_got_ip_t *event = (ip_event_got_ip_t *)event_data;

        g_ppp_connected = true;

        xEventGroupClearBits(g_event_group, PPP_DISCONNECTED_BIT);

        xEventGroupSetBits(g_event_group, PPP_CONNECTED_BIT);

        ESP_LOGI(TAG, "PPP got IP: " IPSTR, IP2STR(&event->ip_info.ip));

        ESP_LOGI(TAG, "PPP gateway: " IPSTR, IP2STR(&event->ip_info.gw));

        g_backend_ready_for_upload = false;

        g_backend_sync_requested = true;

        return;

    }

    if (event_id == IP_EVENT_PPP_LOST_IP) {

        g_ppp_connected = false;

        if (g_active_network == NETWORK_MODE_SIM800) {

            g_backend_ready_for_upload = false;

            g_backend_sync_requested = true;

        }

        xEventGroupClearBits(g_event_group, PPP_CONNECTED_BIT);

        xEventGroupSetBits(g_event_group, PPP_DISCONNECTED_BIT);

        ESP_LOGW(TAG, "PPP lost IP");

    }

}

static bool wifi_init_for_station_and_espnow(void) {

    g_wifi_netif = esp_netif_create_default_wifi_sta();

    if (g_wifi_netif == NULL) {

        ESP_LOGE(TAG, "Failed to create Wi-Fi station netif");

        return false;

    }

    wifi_init_config_t config = WIFI_INIT_CONFIG_DEFAULT();

    ESP_ERROR_CHECK(esp_wifi_init(&config));

    ESP_ERROR_CHECK(esp_wifi_set_storage(WIFI_STORAGE_RAM));

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));

    ESP_ERROR_CHECK(esp_wifi_start());

    ESP_ERROR_CHECK(esp_wifi_set_ps(WIFI_PS_NONE));

    ESP_ERROR_CHECK(

        esp_wifi_set_channel(ESPNOW_DEFAULT_CHANNEL, WIFI_SECOND_CHAN_NONE));

    g_current_radio_channel = ESPNOW_DEFAULT_CHANNEL;

    ESP_LOGI(TAG,

             "Wi-Fi/ESP-NOW radio initialized on default channel %u; station Wi-Fi will "

             "scan all 2.4 GHz channels",

             g_current_radio_channel);

    return true;

}

static bool wifi_connect_with_config(const stored_wifi_config_t *config) {

    if (!wifi_config_is_valid(config)) {

        return false;

    }

    network_lock();

    wifi_config_t wifi_config = {0};

    size_t ssid_len = strnlen(config->ssid, sizeof(config->ssid));

    size_t password_len = strnlen(config->password, sizeof(config->password));

    memcpy(wifi_config.sta.ssid, config->ssid, ssid_len);

    memcpy(wifi_config.sta.password, config->password, password_len);

    wifi_config.sta.scan_method = WIFI_ALL_CHANNEL_SCAN;

    wifi_config.sta.sort_method = WIFI_CONNECT_AP_BY_SIGNAL;

    wifi_config.sta.channel = 0;

    wifi_config.sta.bssid_set = false;

    wifi_config.sta.threshold.authmode = WIFI_AUTH_OPEN;

    wifi_config.sta.pmf_cfg.capable = true;

    wifi_config.sta.pmf_cfg.required = false;

    g_wifi_connected = false;

    esp_wifi_disconnect();

    vTaskDelay(pdMS_TO_TICKS(100));

    esp_err_t err = esp_wifi_set_config(WIFI_IF_STA, &wifi_config);

    if (err != ESP_OK) {

        ESP_LOGE(TAG, "esp_wifi_set_config failed: %s", esp_err_to_name(err));

        wifi_return_to_default_espnow_channel_locked();

        network_unlock();

        return false;

    }

    ESP_LOGI(TAG,

             "Trying Wi-Fi SSID '%s' across all 2.4 GHz channels, revision=%lu",

             config->ssid,

             (unsigned long)config->revision);

    for (int attempt = 1; attempt <= WIFI_CONNECT_ATTEMPTS; attempt++) {

        xEventGroupClearBits(g_event_group, WIFI_GOT_IP_BIT | WIFI_DISCONNECTED_BIT);

        err = esp_wifi_connect();

        if (err != ESP_OK) {

            ESP_LOGW(TAG,

                     "Wi-Fi connect start failed on attempt %d: %s",

                     attempt,

                     esp_err_to_name(err));

            vTaskDelay(pdMS_TO_TICKS(WIFI_RETRY_DELAY_MS));

            continue;

        }

        EventBits_t bits = xEventGroupWaitBits(g_event_group,

                                               WIFI_GOT_IP_BIT | WIFI_DISCONNECTED_BIT,

                                               pdTRUE,

                                               pdFALSE,

                                               pdMS_TO_TICKS(WIFI_ATTEMPT_TIMEOUT_MS));

        if ((bits & WIFI_GOT_IP_BIT) != 0 && g_wifi_connected) {

            ESP_LOGI(TAG, "Wi-Fi connected to '%s'", config->ssid);

            network_unlock();

            return true;

        }

        ESP_LOGW(TAG, "Wi-Fi attempt %d/%d failed", attempt, WIFI_CONNECT_ATTEMPTS);

        vTaskDelay(pdMS_TO_TICKS(WIFI_RETRY_DELAY_MS));

    }

    g_wifi_connected = false;

    wifi_return_to_default_espnow_channel_locked();

    network_unlock();

    return false;

}

static void wifi_disconnect_and_restore_espnow_channel(void) {

    network_lock();

    g_wifi_connected = false;

    wifi_return_to_default_espnow_channel_locked();

    network_unlock();

}

/* 
 ESP-NOW registry and peers
*/

static int find_module_by_mac(const uint8_t *mac) {

    for (int i = 0; i < MAX_SENSOR_MODULES; i++) {

        if (g_modules[i].in_use && memcmp(g_modules[i].mac, mac, 6) == 0) {

            return i;

        }

    }

    return -1;

}

static int alloc_module_slot(const uint8_t *mac) {

    int index = find_module_by_mac(mac);

    if (index >= 0) {

        return index;

    }

    for (int i = 0; i < MAX_SENSOR_MODULES; i++) {

        if (!g_modules[i].in_use) {

            memset(&g_modules[i], 0, sizeof(g_modules[i]));

            g_modules[i].in_use = true;

            memcpy(g_modules[i].mac, mac, 6);

            return i;

        }

    }

    return -1;

}

static void update_module_record(const uint8_t *mac, const mproto_frame_t *frame) {

    registry_lock();

    int index = alloc_module_slot(mac);

    if (index < 0) {

        registry_unlock();

        ESP_LOGE(TAG, "No free sensor-module registry slots");

        return;

    }

    g_modules[index].base_id = frame->base_id;

    g_modules[index].sensor_id = frame->sensor_id;

    g_modules[index].sensor_type = frame->sensor_type;

    g_modules[index].last_seen_ms = ms_now();

    registry_unlock();

}

static sensor_module_kind_t get_module_kind_by_mac(const uint8_t *mac) {

    sensor_module_kind_t kind = SENSOR_MODULE_UNKNOWN;

    registry_lock();

    int index = find_module_by_mac(mac);

    if (index >= 0 && g_modules[index].module_info_valid) {

        kind = g_modules[index].module_kind;

    }

    registry_unlock();

    return kind;

}

static bool sensor_frame_is_duplicate(const uint8_t *mac, const mproto_frame_t *frame) {

    registry_lock();

    int index = alloc_module_slot(mac);

    if (index < 0) {

        registry_unlock();

        ESP_LOGE(TAG, "No free sensor-module registry slots for duplicate detection");

        return false;

    }

    sensor_module_record_t *record = &g_modules[index];

    if (record->has_last_sensor_seq && record->last_sensor_seq == frame->seq_num) {

        registry_unlock();

        g_rx_duplicate_count++;

        ESP_LOGW(TAG,

                 "Duplicate SENSOR_DATA ignored base_id=%lu sensor_id=%lu seq=%lu",

                 (unsigned long)frame->base_id,

                 (unsigned long)frame->sensor_id,

                 (unsigned long)frame->seq_num);

        return true;

    }

    record->has_last_sensor_seq = true;

    record->last_sensor_seq = frame->seq_num;

    registry_unlock();

    return false;

}

static bool add_peer_if_needed(const uint8_t *mac) {

    if (esp_now_is_peer_exist(mac)) {

        return true;

    }

    esp_now_peer_info_t peer = {0};

    memcpy(peer.peer_addr, mac, 6);

    peer.channel = 0;

    peer.ifidx = WIFI_IF_STA;

    peer.encrypt = false;

    esp_err_t err = esp_now_add_peer(&peer);

    if (err == ESP_OK || err == ESP_ERR_ESPNOW_EXIST) {

        print_mac("ESP-NOW peer ready:", mac);

        return true;

    }

    ESP_LOGE(TAG, "esp_now_add_peer failed: %s", esp_err_to_name(err));

    return false;

}

static void add_broadcast_peer(void) {

    const uint8_t broadcast[6] = {0xff, 0xff, 0xff, 0xff, 0xff, 0xff};

    esp_now_peer_info_t peer = {0};

    memcpy(peer.peer_addr, broadcast, sizeof(broadcast));

    peer.channel = 0;

    peer.ifidx = WIFI_IF_STA;

    peer.encrypt = false;

    esp_err_t err = esp_now_add_peer(&peer);

    if (err != ESP_OK && err != ESP_ERR_ESPNOW_EXIST) {

        ESP_ERROR_CHECK(err);

    }

}

static bool espnow_init(void) {

    esp_err_t err = esp_now_init();

    if (err != ESP_OK) {

        ESP_LOGE(TAG, "esp_now_init failed: %s", esp_err_to_name(err));

        return false;

    }

    ESP_ERROR_CHECK(esp_now_register_send_cb(on_data_sent));

    ESP_ERROR_CHECK(esp_now_register_recv_cb(on_data_recv));

    add_broadcast_peer();

    g_espnow_started = true;

    ESP_LOGI(TAG, "ESP-NOW ready independently of internet connectivity");

    return true;

}

/* 
 ESP-NOW TX queue
 */

static bool queue_espnow_frame(const uint8_t *dest_mac, const mproto_frame_t *frame) {

    if (dest_mac == NULL || frame == NULL || g_espnow_tx_queue == NULL) {

        return false;

    }

    espnow_tx_item_t item = {0};

    memcpy(item.dest_mac, dest_mac, 6);

    item.frame = *frame;

    if (xQueueSend(g_espnow_tx_queue, &item, 0) != pdTRUE) {

        ESP_LOGW(TAG, "ESP-NOW TX queue full; dropping msg_type=%u", frame->msg_type);

        return false;

    }

    return true;

}

static void send_base_ack(const uint8_t *mac, uint32_t base_id, uint32_t acked_seq) {

    mproto_ack_t payload = {0};

    payload.acked_seq_num = acked_seq;

    payload.acked_msg_type = MSG_BASE_HELLO;

    payload.status = ACK_STATUS_OK;

    snprintf(payload.detail, sizeof(payload.detail), "base_ack");

    mproto_frame_t frame = {0};

    frame.msg_type = MSG_BASE_ACK;

    frame.payload_len = sizeof(payload);

    frame.base_id = base_id;

    frame.seq_num = next_seq();

    memcpy(frame.payload, &payload, sizeof(payload));

    queue_espnow_frame(mac, &frame);

}

static void send_module_ack(const uint8_t *mac,

                            uint32_t base_id,

                            uint32_t sensor_id,

                            uint32_t acked_seq) {

    mproto_ack_t payload = {0};

    payload.acked_seq_num = acked_seq;

    payload.acked_msg_type = MSG_MODULE_INFO;

    payload.status = ACK_STATUS_OK;

    snprintf(payload.detail, sizeof(payload.detail), "module_ack");

    mproto_frame_t frame = {0};

    frame.msg_type = MSG_MODULE_ACK;

    frame.payload_len = sizeof(payload);

    frame.base_id = base_id;

    frame.sensor_id = sensor_id;

    frame.seq_num = next_seq();

    memcpy(frame.payload, &payload, sizeof(payload));

    queue_espnow_frame(mac, &frame);

}

static bool send_sensor_config(const sensor_module_record_t *sensor,

                               const char *config_id,

                               uint32_t sample_period_ms,

                               int16_t temp_threshold_hi_x100,

                               uint16_t humidity_threshold_hi_x100) {

    if (sensor == NULL || config_id == NULL || config_id[0] == '\0') {

        return false;

    }

    mproto_config_set_t payload = {0};

    payload.sample_period_ms = sample_period_ms < BACKEND_SAMPLE_MIN_MS

                                   ? BACKEND_SAMPLE_MIN_MS

                                   : sample_period_ms;

    payload.temp_threshold_hi_x100 = temp_threshold_hi_x100;

    payload.humidity_threshold_hi_x100 = humidity_threshold_hi_x100;

    payload.apply_flags = 0;

    mproto_frame_t frame = {0};

    frame.msg_type = MSG_CONFIG_SET;

    frame.sensor_type = sensor->sensor_type;

    frame.payload_len = sizeof(payload);

    frame.base_id = sensor->base_id;

    frame.sensor_id = sensor->sensor_id;

    frame.seq_num = next_seq();

    memcpy(frame.payload, &payload, sizeof(payload));

    bool tracked = false;

    registry_lock();

    int index = find_module_by_mac(sensor->mac);

    if (index >= 0 && g_modules[index].sensor_id == sensor->sensor_id) {

        sensor_module_record_t *record = &g_modules[index];

        record->config_apply_pending = true;

        record->pending_config_seq = frame.seq_num;

        record->pending_config_started_ms = ms_now();

        strlcpy(record->pending_config_id, config_id, sizeof(record->pending_config_id));

        record->pending_sample_period_ms = payload.sample_period_ms;

        record->pending_temp_threshold_hi_x100 = payload.temp_threshold_hi_x100;

        record->pending_humidity_threshold_hi_x100 = payload.humidity_threshold_hi_x100;

        tracked = true;

    }

    registry_unlock();

    if (!tracked) {

        return false;

    }

    if (!queue_espnow_frame(sensor->mac, &frame)) {

        registry_lock();

        index = find_module_by_mac(sensor->mac);

        if (index >= 0 && g_modules[index].pending_config_seq == frame.seq_num) {

            g_modules[index].config_apply_pending = false;

            g_modules[index].pending_config_id[0] = '\0';

        }

        registry_unlock();

        return false;

    }

    ESP_LOGI(TAG,

             "CONFIG_SET queued sensor_id=%lu configId=%s sample_ms=%lu temp_hi=%d hum_hi=%u seq=%lu",

             (unsigned long)sensor->sensor_id,

             config_id,

             (unsigned long)payload.sample_period_ms,

             (int)payload.temp_threshold_hi_x100,

             (unsigned int)payload.humidity_threshold_hi_x100,

             (unsigned long)frame.seq_num);

    return true;

}

static void handle_config_ack(const uint8_t *mac, const mproto_frame_t *frame) {

    if (frame->payload_len != sizeof(mproto_ack_t)) {

        ESP_LOGW(TAG, "Bad CONFIG_ACK payload_len=%u", frame->payload_len);

        return;

    }

    mproto_ack_t ack;

    memcpy(&ack, frame->payload, sizeof(ack));

    if (ack.acked_msg_type != MSG_CONFIG_SET) {

        ESP_LOGW(TAG, "CONFIG_ACK references unexpected msg_type=%u", ack.acked_msg_type);

        return;

    }

    uint32_t sensor_id = 0;

    char config_id[CONFIG_ID_MAX_LEN] = {0};

    bool applied = false;

    registry_lock();

    int index = find_module_by_mac(mac);

    if (index >= 0) {

        sensor_module_record_t *record = &g_modules[index];

        sensor_id = record->sensor_id;

        if (record->config_apply_pending && record->pending_config_seq == ack.acked_seq_num) {

            if (ack.status == ACK_STATUS_OK) {

                strlcpy(record->applied_config_id,

                        record->pending_config_id,

                        sizeof(record->applied_config_id));

                strlcpy(config_id, record->pending_config_id, sizeof(config_id));

                record->module_sample_period_ms = record->pending_sample_period_ms;

                record->module_temp_threshold_hi_x100 = record->pending_temp_threshold_hi_x100;

                record->module_humidity_threshold_hi_x100 =

                    record->pending_humidity_threshold_hi_x100;

                applied = true;

            }

            record->config_apply_pending = false;

            record->pending_config_id[0] = '\0';

        }

    }

    registry_unlock();

    if (applied) {

        if (!save_sensor_config_id(sensor_id, config_id)) {

            ESP_LOGW(TAG, "Could not persist configId for sensor_id=%lu",

                     (unsigned long)sensor_id);

        }

        ESP_LOGI(TAG, "CONFIG applied sensor_id=%lu configId=%s",

                 (unsigned long)sensor_id, config_id);

    } else {

        ESP_LOGW(TAG,

                 "CONFIG_ACK failed/unmatched sensor_id=%lu acked_seq=%lu status=%u detail=%.*s",

                 (unsigned long)sensor_id,

                 (unsigned long)ack.acked_seq_num,

                 ack.status,

                 (int)sizeof(ack.detail),

                 ack.detail);

        g_backend_sync_requested = true;

    }

}

static void on_data_sent(const wifi_tx_info_t *tx_info, esp_now_send_status_t status) {

    g_last_espnow_send_status = status;

    if (tx_info != NULL && tx_info->des_addr != NULL) {

        ESP_LOGI(TAG,

                 "ESP-NOW SEND %02X:%02X:%02X:%02X:%02X:%02X status=%s",

                 tx_info->des_addr[0],

                 tx_info->des_addr[1],

                 tx_info->des_addr[2],

                 tx_info->des_addr[3],

                 tx_info->des_addr[4],

                 tx_info->des_addr[5],

                 status == ESP_NOW_SEND_SUCCESS ? "OK" : "FAIL");

    }

    if (g_espnow_send_done != NULL) {

        xSemaphoreGive(g_espnow_send_done);

    }

}

static void espnow_tx_task(void *arg) {

    espnow_tx_item_t item;

    while (true) {

        if (xQueueReceive(g_espnow_tx_queue, &item, portMAX_DELAY) != pdTRUE) {

            continue;

        }

        if (!add_peer_if_needed(item.dest_mac)) {

            g_tx_failure_count++;

            continue;

        }

        bool sent = false;

        for (int attempt = 1; attempt <= ESPNOW_SEND_MAX_RETRIES; attempt++) {

            while (xSemaphoreTake(g_espnow_send_done, 0) == pdTRUE) {

            }

            g_last_espnow_send_status = ESP_NOW_SEND_FAIL;

            esp_err_t err = esp_now_send(item.dest_mac,

                                         (const uint8_t *)&item.frame,

                                         sizeof(item.frame));

            if (err != ESP_OK) {

                ESP_LOGW(TAG,

                         "esp_now_send failed for msg_type=%u attempt=%d: %s",

                         item.frame.msg_type,

                         attempt,

                         esp_err_to_name(err));

            } else if (xSemaphoreTake(g_espnow_send_done,

                                      pdMS_TO_TICKS(ESPNOW_SEND_TIMEOUT_MS)) == pdTRUE &&

                       g_last_espnow_send_status == ESP_NOW_SEND_SUCCESS) {

                sent = true;

                break;

            } else {

                ESP_LOGW(TAG,

                         "ESP-NOW send timeout/failure msg_type=%u attempt=%d",

                         item.frame.msg_type,

                         attempt);

            }

            vTaskDelay(pdMS_TO_TICKS(ESPNOW_SEND_RETRY_MS));

        }

        if (sent) {

            g_tx_success_count++;

        } else {

            g_tx_failure_count++;

        }

    }

}

/* 
 Upload queue
*/

static void upload_batch_init(upload_batch_t *batch) {

    memset(batch, 0, sizeof(*batch));

    batch->rx_ms = ms_now();

    batch->timestamp = system_time_is_valid() ? ts_now_seconds() : 0;

}

static bool upload_batch_add_metric(upload_batch_t *batch,

                                    uint32_t base_id,

                                    uint32_t sensor_id,

                                    uint8_t sensor_type,

                                    metric_kind_t metric_kind,

                                    float value,

                                    uint8_t decimals) {

    if (batch == NULL || batch->metric_count >= MAX_METRICS_PER_BATCH) {

        return false;

    }

    pending_metric_t *entry = &batch->metrics[batch->metric_count];

    entry->base_id = base_id;

    entry->sensor_id = sensor_id;

    entry->sensor_type = sensor_type;

    entry->metric_kind = (uint8_t)metric_kind;

    entry->value = value;

    entry->decimals = decimals;

    batch->metric_count++;

    return true;

}

static void queue_upload_batch(const upload_batch_t *batch) {

    if (batch == NULL || batch->metric_count == 0 || g_upload_queue == NULL) {

        return;

    }

    if (xQueueSend(g_upload_queue, batch, 0) == pdTRUE) {

        return;

    }

    upload_batch_t dropped;

    if (xQueueReceive(g_upload_queue, &dropped, 0) == pdTRUE) {

        g_upload_queue_overflow_count++;

        if (g_upload_queue_overflow_count == 1 ||

            (g_upload_queue_overflow_count % 16U) == 0) {

            ESP_LOGW(TAG,

                     "Upload queue full; dropped oldest batch, overflow_count=%lu",

                     (unsigned long)g_upload_queue_overflow_count);

        }

        xQueueSend(g_upload_queue, batch, 0);

    }

}

/* 
 Incoming ESP-NOW frame handlers
 */

static void handle_base_hello(const uint8_t *mac, const mproto_frame_t *frame) {

    if (frame->payload_len != sizeof(mproto_base_hello_t)) {

        ESP_LOGW(TAG, "Bad BASE_HELLO payload_len=%u", frame->payload_len);

        return;

    }

    mproto_base_hello_t payload;

    memcpy(&payload, frame->payload, sizeof(payload));

    update_module_record(mac, frame);

    registry_lock();

    int base_index = find_module_by_mac(mac);

    if (base_index >= 0) {

      
        g_modules[base_index].has_last_sensor_seq = false;

        g_modules[base_index].module_info_valid = false;

        g_modules[base_index].module_kind = SENSOR_MODULE_UNKNOWN;

        g_modules[base_index].sensor_name[0] = '\0';

        g_modules[base_index].config_apply_pending = false;

        g_modules[base_index].pending_config_id[0] = '\0';

    }

    registry_unlock();

    print_mac("BASE_HELLO from", mac);

    ESP_LOGI(TAG,

             "BASE_HELLO base_id=%lu fw=%u has_module=%u sensor_type=%u",

             (unsigned long)frame->base_id,

             payload.fw_version,

             payload.has_module,

             frame->sensor_type);

    send_base_ack(mac, frame->base_id, frame->seq_num);

}

static void handle_module_info(const uint8_t *mac, const mproto_frame_t *frame) {

    if (frame->payload_len != sizeof(mproto_module_info_t)) {

        ESP_LOGW(TAG, "Bad MODULE_INFO payload_len=%u", frame->payload_len);

        return;

    }

    mproto_module_info_t payload;

    memcpy(&payload, frame->payload, sizeof(payload));

    char module_name[MPROTO_SENSOR_NAME_LEN + 1] = {0};

    memcpy(module_name, payload.sensor_name, MPROTO_SENSOR_NAME_LEN);

    module_name[MPROTO_SENSOR_NAME_LEN] = '\0';

    sensor_module_kind_t module_kind =

        classify_sensor_module(frame->sensor_type, module_name);

    if (module_kind == SENSOR_MODULE_UNKNOWN) {

        ESP_LOGE(TAG,

                 "Rejecting unsupported/mismatched sensor app: sensor_type=%u name='%s'. "

                 "Expected SHT30, BME280/BMP280, or VL53L0X",

                 frame->sensor_type,

                 module_name);

        return;

    }

    update_module_record(mac, frame);

    registry_lock();

    int index = find_module_by_mac(mac);

    if (index >= 0) {

        sensor_module_record_t *record = &g_modules[index];

        record->base_id = frame->base_id;

        record->sensor_id = frame->sensor_id;

        record->sensor_type = frame->sensor_type;

        record->module_kind = module_kind;

        record->module_info_valid = true;

        strlcpy(record->sensor_name, module_name, sizeof(record->sensor_name));

        record->module_sample_period_ms = payload.sample_period_ms;

        record->module_temp_threshold_hi_x100 = payload.temp_threshold_hi_x100;

        record->module_humidity_threshold_hi_x100 = payload.humidity_threshold_hi_x100;

        record->applied_config_id[0] = '\0';

        load_sensor_config_id(frame->sensor_id,

                              record->applied_config_id,

                              sizeof(record->applied_config_id));

    }

    registry_unlock();

    ESP_LOGI(TAG,

             "MODULE_INFO accepted app=%s base_id=%lu sensor_id=%lu sensor_type=%u "

             "sample_ms=%lu i2c=0x%02X sda=%u scl=%u",

             sensor_module_kind_name(module_kind),

             (unsigned long)frame->base_id,

             (unsigned long)frame->sensor_id,

             frame->sensor_type,

             (unsigned long)payload.sample_period_ms,

             payload.i2c_addr,

             payload.i2c_sda_gpio,

             payload.i2c_scl_gpio);

    send_module_ack(mac, frame->base_id, frame->sensor_id, frame->seq_num);

    g_backend_ready_for_upload = false;

    g_backend_sync_requested = true;

}

static void handle_sht30_data(const uint8_t *mac, const mproto_frame_t *frame) {

    if (get_module_kind_by_mac(mac) != SENSOR_MODULE_SHT30) {

        ESP_LOGW(TAG, "SHT30 data received before a valid SHT30 MODULE_INFO");

        return;

    }

    if (frame->payload_len != sizeof(mproto_sht30_data_t)) {

        ESP_LOGW(TAG,

                 "Bad SHT30 payload_len=%u expected=%u",

                 frame->payload_len,

                 (unsigned int)sizeof(mproto_sht30_data_t));

        return;

    }

    mproto_sht30_data_t payload;

    memcpy(&payload, frame->payload, sizeof(payload));

    update_module_record(mac, frame);

    float temperature_c = payload.temperature_c_x100 / 100.0f;

    float humidity_rh = payload.humidity_rh_x100 / 100.0f;

    ESP_LOGI(TAG,

             "SHT30 DATA base_id=%lu sensor_id=%lu temp=%.2fC hum=%.2f%% alerts=0x%02X",

             (unsigned long)frame->base_id,

             (unsigned long)frame->sensor_id,

             temperature_c,

             humidity_rh,

             payload.alert_flags);

    upload_batch_t batch;

    upload_batch_init(&batch);

    upload_batch_add_metric(&batch,

                            frame->base_id,

                            frame->sensor_id,

                            frame->sensor_type,

                            METRIC_TEMPERATURE,

                            temperature_c,

                            2);

    upload_batch_add_metric(&batch,

                            frame->base_id,

                            frame->sensor_id,

                            frame->sensor_type,

                            METRIC_HUMIDITY,

                            humidity_rh,

                            2);

    queue_upload_batch(&batch);

}

static void handle_vl53_data(const uint8_t *mac, const mproto_frame_t *frame) {

    if (get_module_kind_by_mac(mac) != SENSOR_MODULE_VL53L0X) {

        ESP_LOGW(TAG, "VL53L0X data received before a valid VL53L0X MODULE_INFO");

        return;

    }

    if (frame->payload_len != sizeof(mproto_vl53_data_t)) {

        ESP_LOGW(TAG,

                 "Bad VL53 payload_len=%u expected=%u",

                 frame->payload_len,

                 (unsigned int)sizeof(mproto_vl53_data_t));

        return;

    }

    mproto_vl53_data_t payload;

    memcpy(&payload, frame->payload, sizeof(payload));

    update_module_record(mac, frame);

    bool valid = payload.range_status == 0 && payload.distance_mm != UINT16_MAX &&

                 payload.distance_mm < 8190;

    if (!valid) {

        ESP_LOGW(TAG,

                 "VL53 invalid reading sensor_id=%lu distance=%u status=%u",

                 (unsigned long)frame->sensor_id,

                 payload.distance_mm,

                 payload.range_status);

        return;

    }

    ESP_LOGI(TAG,

             "VL53 DATA base_id=%lu sensor_id=%lu distance=%u mm alerts=0x%02X",

             (unsigned long)frame->base_id,

             (unsigned long)frame->sensor_id,

             payload.distance_mm,

             payload.alert_flags);

    upload_batch_t batch;

    upload_batch_init(&batch);

    upload_batch_add_metric(&batch,

                            frame->base_id,

                            frame->sensor_id,

                            frame->sensor_type,

                            METRIC_DISTANCE,

                            (float)payload.distance_mm,

                            0);

    queue_upload_batch(&batch);

}

static void handle_pressure_data(const uint8_t *mac, const mproto_frame_t *frame) {

    sensor_module_kind_t module_kind = get_module_kind_by_mac(mac);

    if (module_kind != SENSOR_MODULE_BME280 &&
        module_kind != SENSOR_MODULE_BMP280) {

        ESP_LOGW(TAG,

                 "PRESSURE/BMX280 data received before a valid BME280/BMP280 MODULE_INFO; "
                 "sensor_id=%lu payload_len=%u",

                 (unsigned long)frame->sensor_id,

                 frame->payload_len);

        return;

    }

    update_module_record(mac, frame);

    upload_batch_t batch;

    upload_batch_init(&batch);

    if (module_kind == SENSOR_MODULE_BME280) {

        if (frame->payload_len != sizeof(mproto_bme280_data_t)) {

            ESP_LOGE(TAG,

                     "BME280 app sent wrong payload_len=%u expected=%u",

                     frame->payload_len,

                     (unsigned int)sizeof(mproto_bme280_data_t));

            return;

        }

        mproto_bme280_data_t payload;

        memcpy(&payload, frame->payload, sizeof(payload));

        float pressure_hpa = payload.pressure_pa / 100.0f;

        float temperature_c = payload.temperature_c_x100 / 100.0f;

        float humidity_rh = payload.humidity_rh_x100 / 100.0f;

        ESP_LOGI(TAG,

                 "BME280 DATA base_id=%lu sensor_id=%lu pressure=%.2f hPa "
                 "temp=%.2fC hum=%.2f%% alerts=0x%02X",

                 (unsigned long)frame->base_id,

                 (unsigned long)frame->sensor_id,

                 pressure_hpa,

                 temperature_c,

                 humidity_rh,

                 payload.alert_flags);

        upload_batch_add_metric(&batch, frame->base_id, frame->sensor_id,
                                frame->sensor_type, METRIC_PRESSURE,
                                pressure_hpa, 2);

        upload_batch_add_metric(&batch, frame->base_id, frame->sensor_id,
                                frame->sensor_type, METRIC_TEMPERATURE,
                                temperature_c, 2);

        upload_batch_add_metric(&batch, frame->base_id, frame->sensor_id,
                                frame->sensor_type, METRIC_HUMIDITY,
                                humidity_rh, 2);

        queue_upload_batch(&batch);

        return;

    }

    if (frame->payload_len != sizeof(mproto_pressure_data_t)) {

        ESP_LOGE(TAG,

                 "BMP280 app sent wrong payload_len=%u expected=%u",

                 frame->payload_len,

                 (unsigned int)sizeof(mproto_pressure_data_t));

        return;

    }

    mproto_pressure_data_t payload;

    memcpy(&payload, frame->payload, sizeof(payload));

    float pressure_hpa = payload.pressure_pa / 100.0f;

    float temperature_c = payload.temperature_c_x100 / 100.0f;

    ESP_LOGI(TAG,

             "BMP280 DATA base_id=%lu sensor_id=%lu pressure=%.2f hPa "
             "temp=%.2fC alerts=0x%02X",

             (unsigned long)frame->base_id,

             (unsigned long)frame->sensor_id,

             pressure_hpa,

             temperature_c,

             payload.alert_flags);

    upload_batch_add_metric(&batch, frame->base_id, frame->sensor_id,
                            frame->sensor_type, METRIC_PRESSURE,
                            pressure_hpa, 2);

    upload_batch_add_metric(&batch, frame->base_id, frame->sensor_id,
                            frame->sensor_type, METRIC_TEMPERATURE,
                            temperature_c, 2);

    queue_upload_batch(&batch);

}

static void handle_sensor_data(const uint8_t *mac, const mproto_frame_t *frame) {

    switch (frame->sensor_type) {

        case SENSOR_TYPE_SHT30:

            handle_sht30_data(mac, frame);

            break;

        case SENSOR_TYPE_PRESSURE:

            handle_pressure_data(mac, frame);

            break;

        case SENSOR_TYPE_VL53:

            handle_vl53_data(mac, frame);

            break;

        default:

            ESP_LOGW(TAG, "Unsupported sensor_type=%u", frame->sensor_type);

            break;

    }

}

static void handle_heartbeat(const uint8_t *mac, const mproto_frame_t *frame) {

    update_module_record(mac, frame);

    ESP_LOGI(TAG,

             "HEARTBEAT base_id=%lu sensor_id=%lu sensor_type=%u seq=%lu",

             (unsigned long)frame->base_id,

             (unsigned long)frame->sensor_id,

             frame->sensor_type,

             (unsigned long)frame->seq_num);

}

static void process_espnow_frame(const espnow_rx_item_t *item) {

    const mproto_frame_t *frame = &item->frame;

    if (frame->payload_len > MPROTO_MAX_PAYLOAD) {

        g_rx_invalid_count++;

        ESP_LOGW(TAG, "Invalid payload_len=%u", frame->payload_len);

        return;

    }

    add_peer_if_needed(item->src_mac);

    g_rx_frame_count++;

    ESP_LOGI(TAG,

             "RX type=%u seq=%lu base_id=%lu sensor_id=%lu sensor_type=%u payload_len=%u",

             frame->msg_type,

             (unsigned long)frame->seq_num,

             (unsigned long)frame->base_id,

             (unsigned long)frame->sensor_id,

             frame->sensor_type,

             frame->payload_len);

    switch (frame->msg_type) {

        case MSG_BASE_HELLO:

            handle_base_hello(item->src_mac, frame);

            break;

        case MSG_MODULE_INFO:

            handle_module_info(item->src_mac, frame);

            break;

        case MSG_SENSOR_DATA:

            if (!sensor_frame_is_duplicate(item->src_mac, frame)) {

                handle_sensor_data(item->src_mac, frame);

            }

            break;

        case MSG_HEARTBEAT:

            handle_heartbeat(item->src_mac, frame);

            break;

        case MSG_CONFIG_ACK:

            handle_config_ack(item->src_mac, frame);

            break;

        default:

            ESP_LOGW(TAG, "Unhandled msg_type=%u", frame->msg_type);

            break;

    }

}

static void on_data_recv(const esp_now_recv_info_t *recv_info, const uint8_t *data, int len) {

    if (!g_espnow_started || recv_info == NULL || recv_info->src_addr == NULL || data == NULL) {

        return;

    }

    if (len != sizeof(mproto_frame_t)) {

        g_rx_invalid_count++;

        return;

    }

    espnow_rx_item_t item = {0};

    memcpy(item.src_mac, recv_info->src_addr, 6);

    memcpy(&item.frame, data, sizeof(item.frame));

    if (xQueueSend(g_espnow_rx_queue, &item, 0) != pdTRUE) {

        g_rx_queue_drop_count++;

    }

}

static void espnow_rx_task(void *arg) {

    espnow_rx_item_t item;

    while (true) {

        if (xQueueReceive(g_espnow_rx_queue, &item, portMAX_DELAY) == pdTRUE) {

            process_espnow_frame(&item);

        }

    }

}

/* 
SIM800C power control and raw AT preparation
*/

#if MODEM_USE_GPIO15_PWRKEY

static void modem_pwrkey_init(void) {

    gpio_config_t config = {

        .pin_bit_mask = (1ULL << MODEM_PWRKEY_PIN),

        .mode = GPIO_MODE_OUTPUT_OD,

        .pull_up_en = GPIO_PULLUP_DISABLE,

        .pull_down_en = GPIO_PULLDOWN_DISABLE,

        .intr_type = GPIO_INTR_DISABLE,

    };

    ESP_ERROR_CHECK(gpio_config(&config));

    gpio_set_level(MODEM_PWRKEY_PIN, 1);

}

static void modem_pwrkey_pulse(void) {

    ESP_LOGI(TAG, "Pulsing SIM800C PWRKEY on GPIO%d", MODEM_PWRKEY_PIN);

    modem_pwrkey_init();

    vTaskDelay(pdMS_TO_TICKS(200));

    gpio_set_level(MODEM_PWRKEY_PIN, 0);

    vTaskDelay(pdMS_TO_TICKS(MODEM_PWRKEY_HOLD_MS));

    gpio_set_level(MODEM_PWRKEY_PIN, 1);

    vTaskDelay(pdMS_TO_TICKS(MODEM_BOOT_WAIT_MS));

}

#endif

static bool raw_uart_init(void) {

    const uart_config_t uart_config = {

        .baud_rate = MODEM_BAUD_RATE,

        .data_bits = UART_DATA_8_BITS,

        .parity = UART_PARITY_DISABLE,

        .stop_bits = UART_STOP_BITS_1,

        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,

        .source_clk = UART_SCLK_DEFAULT,

    };

    esp_err_t err = uart_driver_install(MODEM_UART_NUM, RAW_BUF_SIZE, 0, 0, NULL, 0);

    if (err != ESP_OK) {

        ESP_LOGE(TAG, "uart_driver_install failed: %s", esp_err_to_name(err));

        return false;

    }

    err = uart_param_config(MODEM_UART_NUM, &uart_config);

    if (err == ESP_OK) {

        err = uart_set_pin(MODEM_UART_NUM,

                           MODEM_TX_PIN,

                           MODEM_RX_PIN,

                           MODEM_RTS_PIN,

                           MODEM_CTS_PIN);

    }

    if (err != ESP_OK) {

        ESP_LOGE(TAG, "Raw UART configuration failed: %s", esp_err_to_name(err));

        uart_driver_delete(MODEM_UART_NUM);

        return false;

    }

    return true;

}

static void raw_uart_deinit(void) {

    esp_err_t err = uart_driver_delete(MODEM_UART_NUM);

    if (err != ESP_OK) {

        ESP_LOGW(TAG, "uart_driver_delete returned: %s", esp_err_to_name(err));

    }

}

static bool raw_send_cmd_wait_for(const char *command, const char *expected, int timeout_ms) {

    const int poll_ms = 250;

    int elapsed_ms = 0;

    int used = 0;

    int tx_len = snprintf(g_tx_buf, sizeof(g_tx_buf), "%s\r\n", command);

    if (tx_len <= 0 || tx_len >= (int)sizeof(g_tx_buf)) {

        return false;

    }

    memset(g_rsp, 0, sizeof(g_rsp));

    uart_flush_input(MODEM_UART_NUM);

    uart_write_bytes(MODEM_UART_NUM, g_tx_buf, tx_len);

    while (elapsed_ms < timeout_ms) {

        int length = uart_read_bytes(MODEM_UART_NUM,

                                     g_rx_chunk,

                                     sizeof(g_rx_chunk),

                                     pdMS_TO_TICKS(poll_ms));

        elapsed_ms += poll_ms;

        if (length <= 0) {

            continue;

        }

        if (used + length >= (int)sizeof(g_rsp)) {

            length = (int)sizeof(g_rsp) - used - 1;

        }

        if (length <= 0) {

            break;

        }

        memcpy(g_rsp + used, g_rx_chunk, length);

        used += length;

        g_rsp[used] = '\0';

        if (strstr(g_rsp, expected) != NULL) {

            return true;

        }

        if (strstr(g_rsp, "ERROR") != NULL || strstr(g_rsp, "+CME ERROR") != NULL) {

            return false;

        }

    }

    return false;

}

static bool raw_wait_for_at(int attempts) {

    for (int i = 0; i < attempts; i++) {

        if (raw_send_cmd_wait_for("AT", "OK", 2000)) {

            return true;

        }

        vTaskDelay(pdMS_TO_TICKS(1000));

    }

    return false;

}

static bool raw_network_registered(void) {

    for (int attempt = 1; attempt <= MODEM_REGISTRATION_ATTEMPTS; attempt++) {

        raw_send_cmd_wait_for("AT+CSQ", "OK", 3000);

        bool creg_ok = raw_send_cmd_wait_for("AT+CREG?", "OK", 3000);

        bool circuit_registered = creg_ok &&

                                  (strstr(g_rsp, "+CREG: 0,1") != NULL ||

                                   strstr(g_rsp, "+CREG: 0,5") != NULL);

        bool cgreg_ok = raw_send_cmd_wait_for("AT+CGREG?", "OK", 3000);

        bool packet_registered = cgreg_ok &&

                                 (strstr(g_rsp, "+CGREG: 0,1") != NULL ||

                                  strstr(g_rsp, "+CGREG: 0,5") != NULL);

        if (circuit_registered && packet_registered) {

            ESP_LOGI(TAG,

                     "SIM800C registered on attempt %d/%d",

                     attempt,

                     MODEM_REGISTRATION_ATTEMPTS);

            return true;

        }

        ESP_LOGW(TAG,

                 "SIM800C is not registered yet, attempt %d/%d",

                 attempt,

                 MODEM_REGISTRATION_ATTEMPTS);

        vTaskDelay(pdMS_TO_TICKS(MODEM_REGISTRATION_DELAY_MS));

    }

    return false;

}

static bool raw_modem_prepare(void) {

    ESP_LOGI(TAG, "Starting SIM800C raw AT precheck");

    if (!raw_uart_init()) {

        return false;

    }

    vTaskDelay(pdMS_TO_TICKS(1500));

    bool modem_ready = raw_wait_for_at(4);

#if MODEM_USE_GPIO15_PWRKEY

    if (!modem_ready) {

        modem_pwrkey_pulse();

        modem_ready = raw_wait_for_at(8);

    }

#endif

    if (!modem_ready) {

        ESP_LOGE(TAG, "SIM800C did not respond to AT commands");

        raw_uart_deinit();

        return false;

    }

    raw_send_cmd_wait_for("ATE0", "OK", 3000);

    raw_send_cmd_wait_for("AT+CMEE=2", "OK", 3000);

    if (!raw_send_cmd_wait_for("AT+CPIN?", "+CPIN: READY", 5000)) {

        ESP_LOGE(TAG, "SIM is not ready");

        raw_uart_deinit();

        return false;

    }

    if (!raw_network_registered()) {

        ESP_LOGE(TAG, "SIM800C network registration failed");

        raw_uart_deinit();

        return false;

    }

    bool attached = false;

    for (int attempt = 1; attempt <= MODEM_ATTACH_ATTEMPTS; attempt++) {

        if (raw_send_cmd_wait_for("AT+CGATT?", "+CGATT: 1", 5000)) {

            attached = true;

            break;

        }

        ESP_LOGW(TAG,

                 "SIM800C packet attach pending, attempt %d/%d",

                 attempt,

                 MODEM_ATTACH_ATTEMPTS);

        vTaskDelay(pdMS_TO_TICKS(MODEM_ATTACH_RETRY_DELAY_MS));

    }

    if (!attached ||

        !raw_send_cmd_wait_for("AT+CGDCONT=1,\"IP\",\"" MODEM_APN "\"", "OK", 5000)) {

        ESP_LOGE(TAG, "SIM800C packet-data preparation failed");

        raw_uart_deinit();

        return false;

    }

    raw_uart_deinit();

    ESP_LOGI(TAG, "SIM800C raw AT precheck passed");

    return true;

}

/*
PPP management
*/

static bool ppp_ensure_connected(void) {

    if (g_ppp_connected) {

        return true;

    }

   

    if (g_dce == NULL && !raw_modem_prepare()) {

        return false;

    }

    if (g_wifi_connected) {

        ESP_LOGI(TAG, "Wi-Fi became available while SIM800C was preparing; PPP skipped");

        return false;

    }

    network_lock();

    if (g_ppp_connected) {

        network_unlock();

        return true;

    }

    if (g_dce == NULL) {

        if (g_ppp_netif == NULL) {

            esp_netif_config_t netif_config = ESP_NETIF_DEFAULT_PPP();

            g_ppp_netif = esp_netif_new(&netif_config);

            if (g_ppp_netif == NULL) {

                ESP_LOGE(TAG, "Failed to create PPP netif");

                network_unlock();

                return false;

            }

        }

        esp_modem_dte_config_t dte_config = ESP_MODEM_DTE_DEFAULT_CONFIG();

        dte_config.uart_config.tx_io_num = MODEM_TX_PIN;

        dte_config.uart_config.rx_io_num = MODEM_RX_PIN;

        dte_config.uart_config.rts_io_num = MODEM_RTS_PIN;

        dte_config.uart_config.cts_io_num = MODEM_CTS_PIN;

        dte_config.uart_config.baud_rate = MODEM_BAUD_RATE;

        esp_modem_dce_config_t dce_config = ESP_MODEM_DCE_DEFAULT_CONFIG(MODEM_APN);

        g_dce = esp_modem_new_dev(ESP_MODEM_DCE_SIM800,

                                  &dte_config,

                                  &dce_config,

                                  g_ppp_netif);

        if (g_dce == NULL) {

            ESP_LOGE(TAG, "Failed to create SIM800C modem object");

            network_unlock();

            return false;

        }

    } else {

        esp_err_t command_err = esp_modem_set_mode(g_dce, ESP_MODEM_MODE_COMMAND);

        if (command_err != ESP_OK) {

            ESP_LOGW(TAG,

                     "Could not restore SIM800C command mode before PPP: %s",

                     esp_err_to_name(command_err));

        }

        vTaskDelay(pdMS_TO_TICKS(PPP_COMMAND_RECOVERY_WAIT_MS));

    }

    xEventGroupClearBits(g_event_group, PPP_CONNECTED_BIT | PPP_DISCONNECTED_BIT);

    g_ppp_should_be_active = true;

    ESP_LOGI(TAG, "Starting SIM800C PPP fallback");

    esp_err_t err = esp_modem_set_mode(g_dce, ESP_MODEM_MODE_DATA);

    if (err != ESP_OK) {

        ESP_LOGE(TAG, "Failed to enter PPP data mode: %s", esp_err_to_name(err));

        g_ppp_should_be_active = false;

        network_unlock();

        return false;

    }

    EventBits_t bits = xEventGroupWaitBits(g_event_group,

                                           PPP_CONNECTED_BIT,

                                           pdFALSE,

                                           pdFALSE,

                                           pdMS_TO_TICKS(PPP_CONNECT_TIMEOUT_MS));

    if ((bits & PPP_CONNECTED_BIT) == 0) {

        ESP_LOGE(TAG, "PPP did not obtain an IP address");

        g_ppp_should_be_active = false;

        g_ppp_connected = false;

        esp_err_t recovery_err = esp_modem_set_mode(g_dce, ESP_MODEM_MODE_COMMAND);

        if (recovery_err != ESP_OK) {

            ESP_LOGW(TAG,

                     "PPP timeout recovery could not restore command mode: %s",

                     esp_err_to_name(recovery_err));

        }

        xEventGroupClearBits(g_event_group, PPP_CONNECTED_BIT);

        network_unlock();

        return false;

    }

    err = esp_netif_set_default_netif(g_ppp_netif);

    if (err != ESP_OK) {

        ESP_LOGE(TAG, "Failed to select PPP as default netif: %s", esp_err_to_name(err));

        g_ppp_should_be_active = false;

        g_ppp_connected = false;

        esp_modem_set_mode(g_dce, ESP_MODEM_MODE_COMMAND);

        network_unlock();

        return false;

    }

    set_active_network(NETWORK_MODE_SIM800);

    network_unlock();

    return true;

}

static void ppp_disconnect(void) {

    network_lock();

    bool was_active = g_ppp_should_be_active || g_ppp_connected;

    g_ppp_should_be_active = false;

    if (g_dce != NULL && was_active) {

        ESP_LOGI(TAG, "Stopping SIM800C PPP because Wi-Fi is active");

        esp_err_t err = esp_modem_set_mode(g_dce, ESP_MODEM_MODE_COMMAND);

        if (err != ESP_OK) {

            ESP_LOGW(TAG, "Failed to stop PPP cleanly: %s", esp_err_to_name(err));

        }

    }

    g_ppp_connected = false;

    xEventGroupClearBits(g_event_group, PPP_CONNECTED_BIT);

    network_unlock();

}

static bool activate_wifi_connection(void) {

    if (!g_wifi_connected || g_wifi_netif == NULL) {

        return false;

    }

    network_lock();

    esp_err_t err = esp_netif_set_default_netif(g_wifi_netif);

    if (err != ESP_OK) {

        ESP_LOGW(TAG, "Failed to set Wi-Fi as default: %s", esp_err_to_name(err));

        network_unlock();

        return false;

    }

    set_active_network(NETWORK_MODE_WIFI);

    network_unlock();

    ppp_disconnect();

    return true;

}

static bool activate_ppp_connection(void) {

    if (!g_ppp_connected || g_ppp_netif == NULL) {

        return false;

    }

    network_lock();

    esp_err_t err = esp_netif_set_default_netif(g_ppp_netif);

    if (err != ESP_OK) {

        ESP_LOGW(TAG, "Failed to set PPP as default: %s", esp_err_to_name(err));

        network_unlock();

        return false;

    }

    set_active_network(NETWORK_MODE_SIM800);

    network_unlock();

    return true;

}

static bool select_active_default_netif_locked(void) {

    if (g_active_network == NETWORK_MODE_WIFI && g_wifi_connected && g_wifi_netif != NULL) {

        return esp_netif_set_default_netif(g_wifi_netif) == ESP_OK;

    }

    if (g_active_network == NETWORK_MODE_SIM800 && g_ppp_connected && g_ppp_netif != NULL) {

        return esp_netif_set_default_netif(g_ppp_netif) == ESP_OK;

    }

    if (g_wifi_connected && g_wifi_netif != NULL) {

        return esp_netif_set_default_netif(g_wifi_netif) == ESP_OK;

    }

    if (g_ppp_connected && g_ppp_netif != NULL) {

        return esp_netif_set_default_netif(g_ppp_netif) == ESP_OK;

    }

    return false;

}

/* 
SNTP
 */

static void sntp_sync_notification_cb(struct timeval *tv) {

    if (tv == NULL || (int64_t)tv->tv_sec < VALID_TIME_EPOCH) {

        return;

    }

    g_time_synced = true;

    log_utc_time("SNTP synchronized:", tv->tv_sec);

}

static bool start_sntp_for_current_server(void) {

    if (g_sntp_inited) {

        return true;

    }

    esp_sntp_config_t config = ESP_NETIF_SNTP_DEFAULT_CONFIG(

        g_sntp_servers[g_sntp_server_index]);

    config.wait_for_sync = true;

    config.start = true;

    config.smooth_sync = false;

    config.sync_cb = sntp_sync_notification_cb;

    esp_err_t err = esp_netif_sntp_init(&config);

    if (err != ESP_OK) {

        ESP_LOGW(TAG, "SNTP init failed: %s", esp_err_to_name(err));

        return false;

    }

    g_sntp_inited = true;

    return true;

}

static void rotate_sntp_server(void) {

    if (g_sntp_inited) {

        esp_netif_sntp_deinit();

        g_sntp_inited = false;

    }

    g_sntp_server_index = (g_sntp_server_index + 1) % SNTP_SERVER_COUNT;

}

static bool sync_time_once(void) {

    if (system_time_is_valid()) {

        g_time_synced = true;

        return true;

    }

    if (!network_is_available()) {

        return false;

    }

    network_lock();

    bool route_ready = select_active_default_netif_locked();

    network_unlock();

    if (!route_ready || !start_sntp_for_current_server()) {

        rotate_sntp_server();

        return false;

    }

    ESP_LOGI(TAG,

             "Synchronizing UTC through %s using %s",

             network_mode_name(g_active_network),

             g_sntp_servers[g_sntp_server_index]);

    esp_err_t err = esp_netif_sntp_sync_wait(pdMS_TO_TICKS(SNTP_SYNC_WAIT_MS));

    if (err == ESP_OK && system_time_is_valid()) {

        g_time_synced = true;

        log_utc_time("System time ready:", (time_t)ts_now_seconds());

        return true;

    }

    rotate_sntp_server();

    return false;

}

/* 
 * HTTP helper
 */

static esp_err_t http_event_handler(esp_http_client_event_t *event) {

    http_resp_ctx_t *context = (http_resp_ctx_t *)event->user_data;

    if (context == NULL || event->event_id != HTTP_EVENT_ON_DATA || event->data == NULL ||

        event->data_len <= 0) {

        return ESP_OK;

    }

    int available = context->max_len - context->cur_len - 1;

    if (available <= 0) {

        return ESP_OK;

    }

    int copy_len = event->data_len < available ? event->data_len : available;

    memcpy(context->buf + context->cur_len, event->data, copy_len);

    context->cur_len += copy_len;

    context->buf[context->cur_len] = '\0';

    return ESP_OK;

}

static bool http_request(esp_http_client_method_t method,

                         const char *url,

                         const char *json_body,

                         esp_netif_t *forced_netif,

                         char *response_buf,

                         size_t response_buf_len,

                         int *status_out) {

    if (url == NULL) {

        return false;

    }

    network_lock();

    if (forced_netif != NULL) {

        if (esp_netif_set_default_netif(forced_netif) != ESP_OK) {

            network_unlock();

            return false;

        }

    } else if (!select_active_default_netif_locked()) {

        network_unlock();

        return false;

    }

    http_resp_ctx_t response = {0};

    http_resp_ctx_t *response_ptr = NULL;

    if (response_buf != NULL && response_buf_len > 0) {

        memset(response_buf, 0, response_buf_len);

        response.buf = response_buf;

        response.max_len = (int)response_buf_len;

        response.cur_len = 0;

        response_ptr = &response;

    }

    esp_http_client_config_t config = {

        .url = url,

        .method = method,

        .timeout_ms = (forced_netif == g_ppp_netif ||

                       (forced_netif == NULL && g_active_network == NETWORK_MODE_SIM800))

                          ? PPP_HTTP_TIMEOUT_MS

                          : WIFI_HTTP_TIMEOUT_MS,

        .event_handler = http_event_handler,

        .user_data = response_ptr,

        .crt_bundle_attach = esp_crt_bundle_attach,

        .keep_alive_enable = false,

    };

    esp_http_client_handle_t client = esp_http_client_init(&config);

    if (client == NULL) {

        network_unlock();

        return false;

    }

    esp_http_client_set_header(client, "Accept", "application/json");

    /* The public ingestion route requires no bearer token. */

    if (json_body != NULL) {

        esp_http_client_set_header(client, "Content-Type", "application/json");

        esp_http_client_set_post_field(client, json_body, (int)strlen(json_body));

    }

    esp_err_t err = esp_http_client_perform(client);

    int status = esp_http_client_get_status_code(client);

    if (status_out != NULL) {

        *status_out = status;

    }

    if (err != ESP_OK) {

        ESP_LOGW(TAG,

                 "HTTP request failed method=%d status=%d url=%s error=%s",

                 method,

                 status,

                 url,

                 esp_err_to_name(err));

    } else {

        ESP_LOGI(TAG, "HTTP response method=%d status=%d url=%s", method, status, url);

    }

    esp_http_client_cleanup(client);

    network_unlock();

    return err == ESP_OK;

}

static bool verify_backend_over_wifi(void) {

#if ENABLE_SNTP_FOR_TLS_TIME

    if (!system_time_is_valid()) {

        ESP_LOGI(TAG,

                 "Wi-Fi has IP but TLS clock is not ready; deferring HTTPS backend verification");

        return true;

    }

#endif

    int status = 0;

    bool transport_ok = http_request(HTTP_METHOD_GET,

                                     BACKEND_PROBE_URL,

                                     NULL,

                                     g_wifi_netif,

                                     NULL,

                                     0,

                                     &status);

    if (!transport_ok || status < 200 || status >= 500) {

        ESP_LOGW(TAG,

                 "Wi-Fi obtained an IP but backend verification failed, HTTP status=%d",

                 status);

        return false;

    }

    ESP_LOGI(TAG, "Wi-Fi backend probe completed with HTTP status %d", status);

    return true;

}

/*
 Backend Wi-Fi configuration
 */

static bool report_wifi_config_status(uint32_t revision,

                                      const char *status_text,

                                      const char *reason) {



    (void)revision;

    (void)status_text;

    (void)reason;

    return true;

}

static bool ensure_fallback_network(void) {

    if (g_wifi_connected) {

        return activate_wifi_connection();

    }

    if (g_ppp_connected) {

        return activate_ppp_connection();

    }

    if (ppp_ensure_connected()) {

        return activate_ppp_connection();

    }

    set_active_network(NETWORK_MODE_NONE);

    return false;

}

static bool apply_pending_wifi_config(const stored_wifi_config_t *pending) {

    if (!wifi_config_is_valid(pending)) {

        return false;

    }

    stored_wifi_config_t candidate = *pending;

    pending = &candidate;

    stored_wifi_config_t previous = g_active_wifi_config;

    bool had_previous = wifi_config_is_valid(&previous);

    if (!wifi_save_pending_config(pending)) {

        report_wifi_config_status(pending->revision, "failed", "storage_error");

        return false;

    }

    g_pending_wifi_config = *pending;

    report_wifi_config_status(pending->revision, "applying", NULL);

    bool connected = wifi_connect_with_config(pending);

    bool backend_ready = connected && verify_backend_over_wifi();

    bool active_saved = backend_ready && wifi_save_active_config(pending);

    if (active_saved) {

        g_active_wifi_config = *pending;

        wifi_clear_pending_config();

        activate_wifi_connection();

        report_wifi_config_status(pending->revision, "applied", NULL);

        ESP_LOGI(TAG,

                 "Wi-Fi revision %lu promoted to active configuration",

                 (unsigned long)pending->revision);

        return true;

    }

    ESP_LOGW(TAG,

             "Wi-Fi revision %lu failed; restoring previous network",

             (unsigned long)pending->revision);

    wifi_save_failed_revision(pending->revision);

    wifi_clear_pending_config();

    wifi_disconnect_and_restore_espnow_channel();

    bool restored = false;

    if (had_previous && wifi_connect_with_config(&previous)) {

        g_active_wifi_config = previous;

        restored = activate_wifi_connection();

    }

    if (!restored) {

        ensure_fallback_network();

    }

    const char *failure_reason = "wifi_connection_failed";

    if (connected && !backend_ready) {

        failure_reason = "backend_unreachable";

    } else if (backend_ready && !active_saved) {

        failure_reason = "storage_error";

    }

    report_wifi_config_status(pending->revision, "failed", failure_reason);

    return false;

}

/* 
 * Backend sensor discovery and configuration
 */

static int snapshot_registered_sensors(sensor_module_record_t *out, int max_count) {

    if (out == NULL || max_count <= 0) {

        return 0;

    }

    int count = 0;

    registry_lock();

    for (int i = 0; i < MAX_SENSOR_MODULES && count < max_count; i++) {

        if (g_modules[i].in_use && g_modules[i].module_info_valid &&

            g_modules[i].sensor_id != 0 && g_modules[i].sensor_type != SENSOR_TYPE_NONE) {

            out[count++] = g_modules[i];

        }

    }

    registry_unlock();

    return count;

}

static bool backend_register_discovered_sensors(sensor_module_record_t *sensors, int sensor_count) {

    if (sensors == NULL || sensor_count <= 0 || !network_is_available()) {

        return false;

    }

    cJSON *root = cJSON_CreateObject();

    cJSON *array = cJSON_CreateArray();

    if (root == NULL || array == NULL) {

        cJSON_Delete(root);

        cJSON_Delete(array);

        return false;

    }

    cJSON_AddStringToObject(root, "deviceId", DEVICE_ID_STR);

    if (system_time_is_valid()) {

        cJSON_AddNumberToObject(root, "ts", (double)ts_now_seconds());

    }

    cJSON_AddItemToObject(root, "sensors", array);

    for (int i = 0; i < sensor_count; i++) {

        char sensor_id[CLOUD_SENSOR_ID_LEN];

        make_physical_sensor_id(sensor_id, sizeof(sensor_id), sensors[i].sensor_id);

        cJSON *item = cJSON_CreateObject();

        if (item == NULL) {

            cJSON_Delete(root);

            return false;

        }

        cJSON_AddStringToObject(item, "id", sensor_id);

        cJSON_AddStringToObject(item, "type", backend_sensor_type_name(sensors[i].sensor_type));

        cJSON_AddStringToObject(item,

                               "name",

                               sensors[i].sensor_name[0] ? sensors[i].sensor_name : "Sensor");

        cJSON_AddStringToObject(item, "unit", backend_sensor_unit(sensors[i].sensor_type));

        cJSON_AddItemToArray(array, item);

    }

    char *body = cJSON_PrintUnformatted(root);

    cJSON_Delete(root);

    if (body == NULL) {

        return false;

    }

    int status = 0;

    char response_body[HTTP_RESP_BUF_SIZE] = {0};

    bool transport_ok = http_request(HTTP_METHOD_POST,

                                     DISCOVER_URL,

                                     body,

                                     NULL,

                                     response_body,

                                     sizeof(response_body),

                                     &status);

    cJSON_free(body);

    if (!transport_ok) {

        g_backend_transport_failure = true;

        return false;

    }

    if (status == 404) {

        ESP_LOGE(TAG,

                 "Discovery returned 404: controller '%s' is unknown. Pair it in the SPECTRON app first",

                 DEVICE_ID_STR);

        return false;

    }

    if (status < 200 || status >= 300) {

        ESP_LOGW(TAG, "Sensor discovery failed with HTTP %d", status);

        return false;

    }

    ESP_LOGI(TAG, "Registered %d discovered sensor(s) with SPECTRON", sensor_count);

    return true;

}

static bool backend_pull_sensor_config(const sensor_module_record_t *sensor) {

    if (sensor == NULL || !network_is_available()) {

        return false;

    }

    char sensor_id[CLOUD_SENSOR_ID_LEN];

    make_physical_sensor_id(sensor_id, sizeof(sensor_id), sensor->sensor_id);

    cJSON *root = cJSON_CreateObject();

    if (root == NULL) {

        return false;

    }

    cJSON_AddStringToObject(root, "deviceId", DEVICE_ID_STR);

    cJSON_AddStringToObject(root, "sensorId", sensor_id);

    cJSON_AddStringToObject(root, "sensorType", backend_sensor_type_name(sensor->sensor_type));

    char *body = cJSON_PrintUnformatted(root);

    cJSON_Delete(root);

    if (body == NULL) {

        return false;

    }

    int status = 0;

    char response_body[HTTP_RESP_BUF_SIZE] = {0};

    bool transport_ok = http_request(HTTP_METHOD_POST,

                                     SENSOR_CONFIG_URL,

                                     body,

                                     NULL,

                                     response_body,

                                     sizeof(response_body),

                                     &status);

    cJSON_free(body);

    if (!transport_ok) {

        g_backend_transport_failure = true;

        return false;

    }

    if (status == 404) {

        ESP_LOGE(TAG,

                 "Config returned 404 for controller=%s sensor=%s; ensure discovery/pairing completed",

                 DEVICE_ID_STR,

                 sensor_id);

        return false;

    }

    if (status < 200 || status >= 300) {

        ESP_LOGW(TAG, "Config pull failed sensor=%s HTTP=%d", sensor_id, status);

        return false;

    }

    cJSON *response = cJSON_Parse(response_body);

    if (response == NULL) {

        ESP_LOGW(TAG, "Config response for %s is not valid JSON", sensor_id);

        return false;

    }

    cJSON *ok_item = cJSON_GetObjectItemCaseSensitive(response, "ok");

    cJSON *config_id_item = cJSON_GetObjectItemCaseSensitive(response, "configId");

    cJSON *sample_item = cJSON_GetObjectItemCaseSensitive(response, "samplePeriodMs");

    if (!cJSON_IsTrue(ok_item) || !cJSON_IsString(config_id_item) ||

        config_id_item->valuestring == NULL || !cJSON_IsNumber(sample_item)) {

        ESP_LOGW(TAG, "Config response for %s is missing ok/configId/samplePeriodMs", sensor_id);

        cJSON_Delete(response);

        return false;

    }

    uint32_t sample_period_ms = (uint32_t)sample_item->valuedouble;

    if (sample_period_ms < BACKEND_SAMPLE_MIN_MS) {

        ESP_LOGW(TAG,

                 "Cloud samplePeriodMs=%lu below minimum; clamping to %u ms",

                 (unsigned long)sample_period_ms,

                 BACKEND_SAMPLE_MIN_MS);

        sample_period_ms = BACKEND_SAMPLE_MIN_MS;

    }

    int16_t temp_hi = sensor->module_temp_threshold_hi_x100;

    uint16_t hum_hi = sensor->module_humidity_threshold_hi_x100;

    cJSON *temp_item = cJSON_GetObjectItemCaseSensitive(response, "tempThresholdHiX100");

    cJSON *hum_item = cJSON_GetObjectItemCaseSensitive(response, "humidityThresholdHiX100");

    if (cJSON_IsNumber(temp_item)) {

        double v = temp_item->valuedouble;

        if (v < INT16_MIN) v = INT16_MIN;

        if (v > INT16_MAX) v = INT16_MAX;

        temp_hi = (int16_t)v;

    }

    if (cJSON_IsNumber(hum_item)) {

        double v = hum_item->valuedouble;

        if (v < 0) v = 0;

        if (v > UINT16_MAX) v = UINT16_MAX;

        hum_hi = (uint16_t)v;

    }

    const char *config_id = config_id_item->valuestring;

    bool id_changed = strcmp(config_id, sensor->applied_config_id) != 0;

    bool values_changed = sample_period_ms != sensor->module_sample_period_ms ||

                          temp_hi != sensor->module_temp_threshold_hi_x100 ||

                          hum_hi != sensor->module_humidity_threshold_hi_x100;

    bool pending_fresh = sensor->config_apply_pending &&

                         (uint32_t)(ms_now() - sensor->pending_config_started_ms) <

                             CONFIG_ACK_TIMEOUT_MS;

    bool already_pending = pending_fresh &&

                           strcmp(config_id, sensor->pending_config_id) == 0;

    cJSON *active_item = cJSON_GetObjectItemCaseSensitive(response, "hasActiveConfig");

    ESP_LOGI(TAG,

             "Config sensor=%s configId=%s active=%d sample_ms=%lu temp_hi=%d hum_hi=%u",

             sensor_id,

             config_id,

             cJSON_IsTrue(active_item),

             (unsigned long)sample_period_ms,

             (int)temp_hi,

             (unsigned int)hum_hi);

    bool result = true;

    if ((id_changed || values_changed) && !already_pending) {

        result = send_sensor_config(sensor, config_id, sample_period_ms, temp_hi, hum_hi);

    }

    cJSON_Delete(response);

    return result;

}

static void expire_stale_pending_configs(void) {

    uint32_t now = ms_now();

    bool expired_any = false;

    registry_lock();

    for (int i = 0; i < MAX_SENSOR_MODULES; i++) {

        sensor_module_record_t *record = &g_modules[i];

        if (record->in_use && record->config_apply_pending &&

            (uint32_t)(now - record->pending_config_started_ms) >= CONFIG_ACK_TIMEOUT_MS) {

            ESP_LOGW(TAG,

                     "CONFIG_ACK timeout sensor_id=%lu configId=%s; scheduling retry",

                     (unsigned long)record->sensor_id,

                     record->pending_config_id);

            record->config_apply_pending = false;

            record->pending_config_id[0] = '\0';

            expired_any = true;

        }

    }

    registry_unlock();

    if (expired_any) {

        g_backend_sync_requested = true;

    }

}

static void backend_sync_task(void *arg) {

    uint32_t last_success_ms = 0;

    uint32_t last_attempt_ms = 0;

    int consecutive_transport_failures = 0;

    while (true) {

        expire_stale_pending_configs();

        if (!network_is_available()) {

            vTaskDelay(pdMS_TO_TICKS(1000));

            continue;

        }

#if ENABLE_SNTP_FOR_TLS_TIME

        /* HTTPS certificate validation needs a sane system clock. */

        if (!system_time_is_valid()) {

            vTaskDelay(pdMS_TO_TICKS(1000));

            continue;

        }

#endif

        uint32_t now = ms_now();

        bool periodic_due = (uint32_t)(now - last_success_ms) >= BACKEND_CONFIG_POLL_MS;

        bool requested = g_backend_sync_requested;

        if (!requested && !periodic_due) {

            vTaskDelay(pdMS_TO_TICKS(1000));

            continue;

        }

        if ((uint32_t)(now - last_attempt_ms) < BACKEND_SYNC_RETRY_MS && last_attempt_ms != 0) {

            vTaskDelay(pdMS_TO_TICKS(1000));

            continue;

        }

        last_attempt_ms = now;

        sensor_module_record_t sensors[MAX_SENSOR_MODULES] = {0};

        int sensor_count = snapshot_registered_sensors(sensors, MAX_SENSOR_MODULES);

        if (sensor_count <= 0) {

            /* MODULE_INFO will request another sync when a sensor appears. */

            g_backend_ready_for_upload = false;

            g_backend_sync_requested = false;

            vTaskDelay(pdMS_TO_TICKS(1000));

            continue;

        }

        g_backend_transport_failure = false;

        bool discover_ok = backend_register_discovered_sensors(sensors, sensor_count);

        bool configs_ok = discover_ok;

        if (discover_ok) {

            for (int i = 0; i < sensor_count; i++) {

                if (!backend_pull_sensor_config(&sensors[i])) {

                    configs_ok = false;

                }

            }

        }

        if (g_backend_transport_failure) {

            consecutive_transport_failures++;

            if (consecutive_transport_failures >= 3) {

                ESP_LOGW(TAG,

                         "Backend synchronization failed at transport level 3 times; requesting network failover");

                g_network_fault_requested = true;

                consecutive_transport_failures = 0;

            }

        } else if (discover_ok && configs_ok) {

            consecutive_transport_failures = 0;

        }

        if (discover_ok && configs_ok) {

            last_success_ms = ms_now();

            g_backend_ready_for_upload = true;

            g_backend_sync_requested = false;

        } else {

            g_backend_ready_for_upload = false;

            g_backend_sync_requested = true;

        }

        vTaskDelay(pdMS_TO_TICKS(1000));

    }

}

/*
 * Telemetry JSON and uploader
 */

static int64_t upload_batch_timestamp(const upload_batch_t *batch) {

    if (batch->timestamp >= VALID_TIME_EPOCH) {

        return batch->timestamp;

    }

    int64_t now = ts_now_seconds();

    if (now < VALID_TIME_EPOCH) {

        return 0;

    }

    uint32_t age_ms = ms_now() - batch->rx_ms;

    return now - (int64_t)(age_ms / 1000U);

}

static int build_payload_json(const upload_batch_t *batch, char *buf, size_t buf_len) {

    if (batch == NULL || buf == NULL || buf_len == 0 || batch->metric_count == 0) {

        return -1;

    }

    int64_t timestamp = upload_batch_timestamp(batch);

    size_t used = 0;

#define APPEND_JSON(...)                                                                           \

    do {                                                                                           \

        int written = snprintf(buf + used, buf_len - used, __VA_ARGS__);                           \

        if (written < 0 || (size_t)written >= (buf_len - used)) {                                  \

            return -1;                                                                             \

        }                                                                                          \

        used += (size_t)written;                                                                   \

    } while (0)

    if (timestamp >= VALID_TIME_EPOCH) {

        APPEND_JSON("{\"deviceId\":\"" DEVICE_ID_STR "\",\"ts\":%" PRId64 ",\"sensors\":[",

                    timestamp);

    } else {

        /* ts is optional according to the backend contract. */

        APPEND_JSON("{\"deviceId\":\"" DEVICE_ID_STR "\",\"sensors\":[");

    }

    for (uint8_t i = 0; i < batch->metric_count; i++) {

        const pending_metric_t *metric = &batch->metrics[i];

        metric_kind_t kind = (metric_kind_t)metric->metric_kind;

        const char *name = metric_name(kind);

        char sensor_id[CLOUD_SENSOR_ID_LEN];

        make_upload_sensor_id(sensor_id,

                              sizeof(sensor_id),

                              metric->sensor_id,

                              metric->sensor_type,

                              kind);

        APPEND_JSON("%s{\"id\":\"%s\",\"type\":\"%s\",\"v\":%.*f}",

                    i == 0 ? "" : ",",

                    sensor_id,

                    name,

                    metric->decimals,

                    metric->value);

    }

    APPEND_JSON("]}");

#undef APPEND_JSON

    return (int)used;

}

static bool upload_response_accepts(const char *response_body) {

    if (response_body == NULL || response_body[0] == '\0') {

        return true;

    }

    cJSON *root = cJSON_Parse(response_body);

    if (root == NULL) {

        ESP_LOGW(TAG, "Upload returned non-JSON body; accepting HTTP success");

        return true;

    }

    cJSON *ok = cJSON_GetObjectItemCaseSensitive(root, "ok");

    cJSON *persisted = cJSON_GetObjectItemCaseSensitive(root, "persisted");

    bool accepted = (!cJSON_IsBool(ok) || cJSON_IsTrue(ok)) &&

                    (!cJSON_IsBool(persisted) || cJSON_IsTrue(persisted));

    cJSON_Delete(root);

    return accepted;

}

static void uploader_task(void *arg) {

    int consecutive_transport_failures = 0;

    bool has_inflight_batch = false;

    upload_batch_t batch = {0};

    while (true) {

        if (!network_is_available() || !g_backend_ready_for_upload) {

            vTaskDelay(pdMS_TO_TICKS(1000));

            continue;

        }

        if (!has_inflight_batch) {

            if (xQueueReceive(g_upload_queue, &batch, pdMS_TO_TICKS(1000)) != pdTRUE) {

                continue;

            }

            has_inflight_batch = true;

        }

        int length = build_payload_json(&batch,

                                        g_http_post_body,

                                        sizeof(g_http_post_body));

        if (length <= 0) {

            ESP_LOGW(TAG, "Dropping an invalid telemetry batch");

            memset(&batch, 0, sizeof(batch));

            has_inflight_batch = false;

            g_upload_rejected_count++;

            continue;

        }

        int http_status = 0;

        char response_body[HTTP_RESP_BUF_SIZE] = {0};

        bool transport_ok = http_request(HTTP_METHOD_POST,

                                         TELEMETRY_URL,

                                         g_http_post_body,

                                         NULL,

                                         response_body,

                                         sizeof(response_body),

                                         &http_status);

        if (transport_ok && http_status >= 200 && http_status < 300 &&

            upload_response_accepts(response_body)) {

            g_upload_success_count++;

            consecutive_transport_failures = 0;

            ESP_LOGI(TAG,

                     "Telemetry uploaded: metrics=%u pending_batches=%u",

                     batch.metric_count,

                     (unsigned int)uxQueueMessagesWaiting(g_upload_queue));

            memset(&batch, 0, sizeof(batch));

            has_inflight_batch = false;

            continue;

        }

        if (transport_ok && http_status >= 200 && http_status < 300) {

            ESP_LOGW(TAG, "Backend returned HTTP %d but ok/persisted was false; retaining batch",

                     http_status);

            g_upload_failure_count++;

            vTaskDelay(pdMS_TO_TICKS(HTTP_RETRY_DELAY_MS));

            continue;

        }

        if (transport_ok && http_status == 404) {

            ESP_LOGE(TAG,

                     "Backend returned 404. Controller '%s' may not be paired yet; retaining batch",

                     DEVICE_ID_STR);

            g_upload_failure_count++;

            g_backend_sync_requested = true;

            vTaskDelay(pdMS_TO_TICKS(HTTP_RETRY_DELAY_MS));

            continue;

        }

        if (transport_ok && (http_status == 401 || http_status == 403)) {

            ESP_LOGE(TAG,

                     "Public upload route returned HTTP %d; check cloud-side protection or routing. "

                     "No Authorization header is sent. Retaining the batch",

                     http_status);

            g_upload_failure_count++;

            vTaskDelay(pdMS_TO_TICKS(HTTP_RETRY_DELAY_MS));

            continue;

        }

        if (transport_ok && http_status >= 400 && http_status < 500 && http_status != 408 &&

            http_status != 425 && http_status != 429) {

            ESP_LOGE(TAG,

                     "Backend rejected telemetry with HTTP %d; dropping this batch",

                     http_status);

            g_upload_rejected_count++;

            consecutive_transport_failures = 0;

            memset(&batch, 0, sizeof(batch));

            has_inflight_batch = false;

            continue;

        }

        g_upload_failure_count++;

        consecutive_transport_failures++;

        ESP_LOGW(TAG,

                 "Telemetry upload failed status=%d failures=%d",

                 http_status,

                 consecutive_transport_failures);

        if (!transport_ok && consecutive_transport_failures >= 3) {

            g_network_fault_requested = true;

            consecutive_transport_failures = 0;

        }

        /* Keep the in-flight batch in RAM and retry it after connectivity recovers. */

        vTaskDelay(pdMS_TO_TICKS(HTTP_RETRY_DELAY_MS));

    }

}

/* 
 * Network manager
 */

static void handle_requested_network_recovery(void) {

    if (!g_network_fault_requested) {

        return;

    }

    g_network_fault_requested = false;

    ESP_LOGW(TAG, "Recovering active network after repeated transport failures");

    if (g_active_network == NETWORK_MODE_WIFI) {

        wifi_disconnect_and_restore_espnow_channel();

    } else if (g_active_network == NETWORK_MODE_SIM800) {

        ppp_disconnect();

    }

    set_active_network(NETWORK_MODE_NONE);

}

static void network_manager_task(void *arg) {

    bool initial_connection_attempted = false;

    uint32_t last_wifi_retry_ms = 0;

    uint32_t last_ppp_retry_ms = 0;

#if ENABLE_SNTP_FOR_TLS_TIME

    uint32_t last_sntp_attempt_ms = 0;

#endif

    bool has_active = wifi_load_active_config(&g_active_wifi_config);

    bool has_pending = wifi_load_pending_config(&g_pending_wifi_config);

    wifi_load_failed_revision(&g_failed_wifi_revision);

    if (has_pending &&

        (g_pending_wifi_config.revision <= g_active_wifi_config.revision ||

         g_pending_wifi_config.revision <= g_failed_wifi_revision)) {

        ESP_LOGW(TAG, "Removing obsolete pending Wi-Fi revision %lu",

                 (unsigned long)g_pending_wifi_config.revision);

        wifi_clear_pending_config();

        has_pending = false;

    }

    if (has_active) {

        ESP_LOGI(TAG,

                 "Loaded active Wi-Fi SSID '%s', revision=%lu",

                 g_active_wifi_config.ssid,

                 (unsigned long)g_active_wifi_config.revision);

    } else {

        ESP_LOGI(TAG, "No active Wi-Fi credentials stored; SIM800C will provide setup connectivity");

    }

    if (has_pending) {

        ESP_LOGI(TAG,

                 "Found pending Wi-Fi SSID '%s', revision=%lu",

                 g_pending_wifi_config.ssid,

                 (unsigned long)g_pending_wifi_config.revision);

    }

    while (true) {

        handle_requested_network_recovery();

        if (!initial_connection_attempted) {

            initial_connection_attempted = true;

            if (has_pending &&

                g_pending_wifi_config.revision > g_active_wifi_config.revision &&

                g_pending_wifi_config.revision > g_failed_wifi_revision) {

                apply_pending_wifi_config(&g_pending_wifi_config);

            } else if (has_active && wifi_connect_with_config(&g_active_wifi_config)) {

                activate_wifi_connection();

            } else {

                last_ppp_retry_ms = ms_now();

                ensure_fallback_network();

            }

            last_wifi_retry_ms = ms_now();

        }

        if (g_active_network == NETWORK_MODE_WIFI && !g_wifi_connected) {

            ESP_LOGW(TAG, "Wi-Fi connection was lost; attempting reconnection before SIM fallback");

            set_active_network(NETWORK_MODE_NONE);

            last_wifi_retry_ms = ms_now();

            if (wifi_config_is_valid(&g_active_wifi_config) &&

                wifi_connect_with_config(&g_active_wifi_config)) {

                activate_wifi_connection();

            } else {

                last_ppp_retry_ms = ms_now();

                ensure_fallback_network();

            }

        }

        if (g_active_network == NETWORK_MODE_SIM800 && !g_ppp_connected) {

            set_active_network(NETWORK_MODE_NONE);

        }

        if (g_wifi_connected) {

            activate_wifi_connection();

        } else if (!g_ppp_connected) {

            if (wifi_config_is_valid(&g_active_wifi_config) &&

                (uint32_t)(ms_now() - last_wifi_retry_ms) >= WIFI_BACKGROUND_RETRY_MS) {

                last_wifi_retry_ms = ms_now();

                if (wifi_connect_with_config(&g_active_wifi_config)) {

                    activate_wifi_connection();

                }

            }

            if (!g_wifi_connected &&

                (uint32_t)(ms_now() - last_ppp_retry_ms) >= PPP_RETRY_INTERVAL_MS) {

                last_ppp_retry_ms = ms_now();

                ensure_fallback_network();

            }

        } else {

            activate_ppp_connection();

            if (wifi_config_is_valid(&g_active_wifi_config) &&

                (uint32_t)(ms_now() - last_wifi_retry_ms) >= WIFI_BACKGROUND_RETRY_MS) {

                last_wifi_retry_ms = ms_now();

                if (wifi_connect_with_config(&g_active_wifi_config)) {

                    activate_wifi_connection();

                } else {

                    activate_ppp_connection();

                }

            }

        }

#if ENABLE_SNTP_FOR_TLS_TIME

        if (network_is_available() && !g_time_synced &&

            (uint32_t)(ms_now() - last_sntp_attempt_ms) >= SNTP_RETRY_DELAY_MS) {

            last_sntp_attempt_ms = ms_now();

            sync_time_once();

        }

#endif

        vTaskDelay(pdMS_TO_TICKS(NETWORK_LOOP_DELAY_MS));

    }

}

/* 
 * Diagnostics
*/

static void diagnostics_task(void *arg) {

    while (true) {

        vTaskDelay(pdMS_TO_TICKS(60000));

        ESP_LOGI(TAG,

                 "STATUS network=%s channel=%u wifi=%d ppp=%d tls_time=%d RX=%lu invalid=%lu "

                 "duplicate=%lu rx_drop=%lu TX_OK=%lu TX_FAIL=%lu upload_pending=%u "

                 "upload_ok=%lu upload_fail=%lu upload_rejected=%lu upload_overflow=%lu",

                 network_mode_name(g_active_network),

                 g_current_radio_channel,

                 g_wifi_connected,

                 g_ppp_connected,

                 g_time_synced,

                 (unsigned long)g_rx_frame_count,

                 (unsigned long)g_rx_invalid_count,

                 (unsigned long)g_rx_duplicate_count,

                 (unsigned long)g_rx_queue_drop_count,

                 (unsigned long)g_tx_success_count,

                 (unsigned long)g_tx_failure_count,

                 (unsigned int)uxQueueMessagesWaiting(g_upload_queue),

                 (unsigned long)g_upload_success_count,

                 (unsigned long)g_upload_failure_count,

                 (unsigned long)g_upload_rejected_count,

                 (unsigned long)g_upload_queue_overflow_count);

    }

}

static void create_task_or_abort(TaskFunction_t task_function,

                                 const char *task_name,

                                 uint32_t stack_depth,

                                 UBaseType_t priority) {

    BaseType_t result = xTaskCreate(task_function,

                                    task_name,

                                    stack_depth,

                                    NULL,

                                    priority,

                                    NULL);

    if (result != pdPASS) {

        ESP_LOGE(TAG, "Failed to create task '%s'", task_name);

        ESP_ERROR_CHECK(ESP_ERR_NO_MEM);

    }

}

/* 
 * Main
 */

void app_main(void) {

    esp_err_t err = nvs_flash_init();

    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {

        ESP_ERROR_CHECK(nvs_flash_erase());

        err = nvs_flash_init();

    }

    ESP_ERROR_CHECK(err);

    status_bulb_init();

    status_bulb_set(false);

#if MODEM_USE_GPIO15_PWRKEY

    modem_pwrkey_init();

#endif

    g_event_group = xEventGroupCreate();

    g_espnow_rx_queue = xQueueCreate(ESPNOW_RX_QUEUE_LENGTH, sizeof(espnow_rx_item_t));

    g_espnow_tx_queue = xQueueCreate(ESPNOW_TX_QUEUE_LENGTH, sizeof(espnow_tx_item_t));

    g_upload_queue = xQueueCreate(UPLOAD_QUEUE_LENGTH, sizeof(upload_batch_t));

    g_espnow_send_done = xSemaphoreCreateBinary();

    g_network_mutex = xSemaphoreCreateRecursiveMutex();

    g_registry_mutex = xSemaphoreCreateMutex();

    if (g_event_group == NULL || g_espnow_rx_queue == NULL || g_espnow_tx_queue == NULL ||

        g_upload_queue == NULL || g_espnow_send_done == NULL || g_network_mutex == NULL ||

        g_registry_mutex == NULL) {

        ESP_LOGE(TAG, "Failed to allocate controller queues or synchronization objects");

        return;

    }

    ESP_ERROR_CHECK(esp_netif_init());

    ESP_ERROR_CHECK(esp_event_loop_create_default());

    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT,

                                               ESP_EVENT_ANY_ID,

                                               wifi_event_handler,

                                               NULL));

    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT,

                                               ESP_EVENT_ANY_ID,

                                               ip_event_handler,

                                               NULL));

    if (!wifi_init_for_station_and_espnow() || !espnow_init()) {

        ESP_LOGE(TAG, "ESP-NOW initialization failed");

        return;

    }

    create_task_or_abort(espnow_rx_task, "espnow_rx", 6144, 6);

    create_task_or_abort(espnow_tx_task, "espnow_tx", 4096, 6);

    create_task_or_abort(network_manager_task, "network_manager", 12288, 5);

    create_task_or_abort(backend_sync_task, "backend_sync", 10240, 4);

    create_task_or_abort(uploader_task, "uploader", 8192, 4);

    create_task_or_abort(status_task, "status", 2048, 2);

    create_task_or_abort(diagnostics_task, "diagnostics", 3072, 2);

    ESP_LOGI(TAG, "Controller booted: %s", DEVICE_ID_STR);

    ESP_LOGI(TAG,

             "ESP-NOW starts on channel %d and follows the active Wi-Fi channel",

             ESPNOW_DEFAULT_CHANNEL);

    ESP_LOGI(TAG, "Internet priority: saved Wi-Fi first, SIM800C fallback second");

    ESP_LOGI(TAG,

             "Sensor bases must scan channels and lock to the channel where BASE_ACK is received");

    ESP_LOGI(TAG, "Wi-Fi credentials are loaded from local NVS/manual provisioning");

    ESP_LOGI(TAG, "Sensor CONFIG_SET transmission is enabled from cloud /api/iot/config");

#if ENABLE_SNTP_FOR_TLS_TIME

    ESP_LOGI(TAG, "SNTP establishes the HTTPS/TLS clock and timestamps readings when available");

#endif

    ESP_LOGI(TAG, "Backend authentication: none in the supplied controller API contract");

    ESP_LOGI(TAG, "Discovery URL: %s", DISCOVER_URL);

    ESP_LOGI(TAG, "Sensor config URL: %s", SENSOR_CONFIG_URL);

    ESP_LOGI(TAG, "Telemetry URL: %s", TELEMETRY_URL);

}
