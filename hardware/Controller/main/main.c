#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <stdint.h>
#include <time.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"

#include "driver/gpio.h"
#include "driver/uart.h"

#include "esp_event.h"
#include "esp_err.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_netif_ppp.h"
#include "esp_netif_sntp.h"
#include "esp_http_client.h"
#include "esp_wifi.h"
#include "esp_now.h"
#include "nvs_flash.h"

#include "esp_modem_api.h"

#include "lwip/inet.h"
#include "lwip/netdb.h"

#include "protocol.h"

static const char *TAG = "CTRL_REAL";

/* =========================================================
 * Hardcoded uplink identity
 * ========================================================= */
#define DEVICE_ID_STR      "CTRL-REAL-001"
#define SENSOR_TYPE_STR    "temperature_humidity"
#define SENSOR_UID_SUFFIX  "-sensor-temp-01"
#define HUMIDITY_UID_SUFFIX "-humidity"
#define PRESSURE_UID_SUFFIX "-pressure"
#define SENSOR_NAME_STR    "Temperature & Humidity Sensor"

#define TELEMETRY_HOST     "spectron-backend-env.eba-niaes6bi.ap-south-1.elasticbeanstalk.com"
#define TELEMETRY_FALLBACK_IP_COUNT 2
#define CONFIG_PATH        "/api/iot/config"
#define DISCOVERY_PATH     "/api/iot/discover"
#define TELEMETRY_PATH     "/api/iot/upload"
#define IDLE_CHECK_MS      5000
#define CONFIG_POLL_FAST_MS        15000
#define CONFIG_POLL_STABLE_MIN_MS 300000
#define CONFIG_POLL_STABLE_MAX_MS 900000
#define CONFIG_PUSH_RETRY_MS      15000
#define SEND_RETRY_MS      5000
#define TELEMETRY_RETRY_MS 15000
#define DISCOVERY_HTTP_TIMEOUT_MS 12000
#define TELEMETRY_HTTP_TIMEOUT_MS 20000
#define SNTP_TIMEOUT_MS    15000
#define SNTP_RETRY_MS      60000
#define HTTP_TIMEOUT_MS    30000
#define HTTP_MAX_ATTEMPTS  3
#define MIN_VALID_UNIX_TS  1700000000LL

/* =========================================================
 * ESP-NOW / controller config
 * ========================================================= */
#define WIFI_CHANNEL               1
#define MAX_BASES                  8

#define DEFAULT_CFG_SAMPLE_MS      300000
#define DEFAULT_TEMP_HI_X100       3500
#define DEFAULT_HUM_HI_X100        8500

/* =========================================================
 * SIM800 / PPP config
 * ========================================================= */
#define MODEM_UART_NUM             UART_NUM_2
#define MODEM_TX_PIN               17
#define MODEM_RX_PIN               16
#define MODEM_PWRKEY_PIN           25
#define MODEM_RTS_PIN              UART_PIN_NO_CHANGE
#define MODEM_CTS_PIN              UART_PIN_NO_CHANGE
#define MODEM_BAUD_RATE            9600
#define MODEM_APN                  "ppwap"

#define RAW_BUF_SIZE               1024
#define RAW_RX_CHUNK               128
#define HTTP_RESP_BUF_SIZE         2048
#define HTTP_POST_BUF_SIZE         512

/* =========================================================
 * PPP event bits
 * ========================================================= */
static EventGroupHandle_t s_event_group;
#define PPP_CONNECTED_BIT          BIT0
#define PPP_DISCONNECTED_BIT       BIT1

/* =========================================================
 * Controller registry
 * ========================================================= */
typedef struct {
    bool in_use;
    bool base_acked;
    bool module_acked;
    uint8_t mac[6];
    uint32_t base_id;
    uint32_t sensor_id;
    uint8_t sensor_type;
    uint32_t last_seen_ms;
} base_record_t;

typedef struct {
    bool valid;
    bool has_active_config;
    char config_id[64];
    uint32_t sample_period_ms;
    int16_t temp_threshold_hi_x100;
    uint16_t humidity_threshold_hi_x100;
} controller_sensor_config_t;

static base_record_t g_bases[MAX_BASES];
static uint32_t g_seq = 0;

/* =========================================================
 * Latest SHT30 sample cache
 * ========================================================= */
static portMUX_TYPE g_sht_sample_lock = portMUX_INITIALIZER_UNLOCKED;
static bool g_have_latest_sht_sample = false;
static float g_latest_temp_c = 0.0f;
static float g_latest_humidity_rh = 0.0f;
static uint32_t g_latest_sht_rx_ms = 0;

static portMUX_TYPE g_sensor_meta_lock = portMUX_INITIALIZER_UNLOCKED;
static bool g_have_sensor_meta = false;
static bool g_sensor_configured = false;
static bool g_backend_discovered = false;
static uint8_t g_sensor_proto_type = SENSOR_TYPE_NONE;
static uint32_t g_sensor_proto_id = 0;
static char g_sensor_name[MPROTO_SENSOR_NAME_LEN] = "Temperature & Humidity Sensor";

static portMUX_TYPE g_remote_cfg_lock = portMUX_INITIALIZER_UNLOCKED;
static controller_sensor_config_t g_remote_cfg = {0};

/* =========================================================
 * PPP / HTTP globals
 * ========================================================= */
static esp_netif_t *g_ppp_netif = NULL;
static esp_modem_dce_t *g_dce = NULL;

static bool g_time_synced = false;
static bool g_sntp_inited = false;
static uint32_t g_last_sntp_attempt_ms = 0;

/*
 * Startup gate flags
 *
 * Design rule:
 *   1. SIM800/PPP must connect first.
 *   2. ESP-NOW starts only after PPP_GOT_IP.
 *   3. If PPP drops later, ESP-NOW callback ignores incoming packets until PPP returns.
 */
static volatile bool g_ppp_connected = false;
static volatile bool g_espnow_started = false;

static char g_rsp[RAW_BUF_SIZE];
static uint8_t g_rx_chunk[RAW_RX_CHUNK];
static char g_tx_buf[160];
static char g_http_resp[HTTP_RESP_BUF_SIZE];
static char g_http_post_body[HTTP_POST_BUF_SIZE];
static char g_telemetry_ip[16];
static bool g_have_telemetry_ip = false;
static size_t g_fallback_ip_index = 0;
static char g_sensor_uid[64];
static bool g_sensor_uid_ready = false;
static portMUX_TYPE g_config_push_lock = portMUX_INITIALIZER_UNLOCKED;
static uint32_t g_last_config_push_ms = 0;
static bool g_waiting_for_config_ack = false;
static char g_pending_config_id[64];

static bool send_config_set(const uint8_t *mac, uint32_t base_id, uint32_t sensor_id);
static void force_ppp_reconnect(const char *reason);
static const char *sensor_identity_to_backend_type(uint32_t sensor_id, const char *sensor_name, uint8_t sensor_type);
static bool get_sensor_state_snapshot(char *sensor_name,
                                      size_t sensor_name_len,
                                      uint8_t *sensor_type,
                                      uint32_t *sensor_id,
                                      bool *configured,
                                      bool *discovered);

typedef struct {
    char *buf;
    int max_len;
    int cur_len;
} http_resp_ctx_t;

typedef struct {
    esp_err_t err;
    int status_code;
} http_post_result_t;

static void modem_pwrkey_init(void)
{
    const gpio_config_t cfg = {
        .pin_bit_mask = 1ULL << MODEM_PWRKEY_PIN,
        .mode = GPIO_MODE_OUTPUT_OD,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };

    ESP_ERROR_CHECK(gpio_config(&cfg));
    gpio_set_level(MODEM_PWRKEY_PIN, 1);
}

static void modem_pwrkey_pulse(void)
{
    ESP_LOGI(TAG, "Pulsing PWRKEY low on GPIO%d...", MODEM_PWRKEY_PIN);
    gpio_set_level(MODEM_PWRKEY_PIN, 0);
    vTaskDelay(pdMS_TO_TICKS(1200));
    gpio_set_level(MODEM_PWRKEY_PIN, 1);
    ESP_LOGI(TAG, "Waiting for modem boot after PWRKEY pulse...");
    vTaskDelay(pdMS_TO_TICKS(5000));
}

/* =========================================================
 * Helpers
 * ========================================================= */
static uint32_t ms_now(void)
{
    return esp_log_timestamp();
}

static uint32_t ts_now_seconds(void)
{
    time_t now = 0;
    time(&now);
    if ((int64_t)now >= MIN_VALID_UNIX_TS) {
        return (uint32_t)now;
    }

    return 0;
}

static const char *backend_type_uid_token(const char *backend_type)
{
    if (backend_type == NULL || backend_type[0] == '\0') {
        return "sensor";
    }

    if (strcmp(backend_type, "temperature_humidity") == 0) {
        return "temp-humidity";
    }
    if (strcmp(backend_type, "bme280") == 0) {
        return "bme280";
    }
    if (strcmp(backend_type, "bmp280") == 0) {
        return "bmp280";
    }
    if (strcmp(backend_type, "vl53l0x") == 0) {
        return "vl53l0x";
    }
    if (strcmp(backend_type, "pressure") == 0) {
        return "pressure";
    }
    if (strcmp(backend_type, "humidity") == 0) {
        return "humidity";
    }

    return "sensor";
}

static const char *get_backend_sensor_uid(void)
{
    if (g_sensor_uid_ready) {
        return g_sensor_uid;
    }

    uint8_t sensor_type = SENSOR_TYPE_NONE;
    uint32_t sensor_id = 0;
    char sensor_name[MPROTO_SENSOR_NAME_LEN] = {0};
    const char *backend_type = SENSOR_TYPE_STR;
    const char *type_token = NULL;
    size_t used = 0;

    if (get_sensor_state_snapshot(sensor_name, sizeof(sensor_name), &sensor_type, &sensor_id, NULL, NULL)) {
        backend_type = sensor_identity_to_backend_type(sensor_id, sensor_name, sensor_type);
    }
    type_token = backend_type_uid_token(backend_type);

    memset(g_sensor_uid, 0, sizeof(g_sensor_uid));

    for (const char *p = DEVICE_ID_STR; *p != '\0' && used < sizeof(g_sensor_uid) - 1; ++p) {
        char ch = *p;

        if (ch >= 'A' && ch <= 'Z') {
            ch = (char)(ch - 'A' + 'a');
        }

        if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '-') {
            g_sensor_uid[used++] = ch;
        }
    }

    while (used > 0 && g_sensor_uid[0] == '-') {
        memmove(g_sensor_uid, g_sensor_uid + 1, used);
        used--;
    }
    while (used > 0 && g_sensor_uid[used - 1] == '-') {
        g_sensor_uid[--used] = '\0';
    }

    if (used == 0) {
        strlcpy(g_sensor_uid, "sensor", sizeof(g_sensor_uid));
        used = strlen(g_sensor_uid);
    }

    if (used < sizeof(g_sensor_uid) - 1) {
        strlcat(g_sensor_uid, "-sensor-", sizeof(g_sensor_uid));
        strlcat(g_sensor_uid, type_token, sizeof(g_sensor_uid));
    }

    if (sensor_id != 0 && strlen(g_sensor_uid) < sizeof(g_sensor_uid) - 6) {
        char id_suffix[16];
        snprintf(id_suffix, sizeof(id_suffix), "-%04lx", (unsigned long)(sensor_id & 0xFFFFu));
        strlcat(g_sensor_uid, id_suffix, sizeof(g_sensor_uid));
    }

    g_sensor_uid_ready = true;
    return g_sensor_uid;
}

static void get_backend_humidity_sensor_uid(char *buf, size_t buf_len)
{
    strlcpy(buf, get_backend_sensor_uid(), buf_len);
    strlcat(buf, HUMIDITY_UID_SUFFIX, buf_len);
}

static void clear_telemetry_endpoint_cache(void)
{
    g_have_telemetry_ip = false;
    g_telemetry_ip[0] = '\0';
}

static bool use_next_fallback_telemetry_ip(const char *reason)
{
    static const char *fallback_ips[TELEMETRY_FALLBACK_IP_COUNT] = {
        "13.206.7.238",
        "65.1.37.104",
    };

    const char *selected = fallback_ips[g_fallback_ip_index % TELEMETRY_FALLBACK_IP_COUNT];
    g_fallback_ip_index = (g_fallback_ip_index + 1U) % TELEMETRY_FALLBACK_IP_COUNT;

    strlcpy(g_telemetry_ip, selected, sizeof(g_telemetry_ip));
    g_have_telemetry_ip = true;

    ESP_LOGW(TAG,
             "Using fallback backend IP %s (%s)",
             g_telemetry_ip,
             reason ? reason : "fallback");
    return true;
}

static bool resolve_telemetry_endpoint(bool force_refresh)
{
    if (g_have_telemetry_ip && !force_refresh) {
        return true;
    }

    char previous_ip[sizeof(g_telemetry_ip)] = {0};
    bool had_cached_ip = g_have_telemetry_ip;
    if (had_cached_ip) {
        strlcpy(previous_ip, g_telemetry_ip, sizeof(previous_ip));
    }

    struct addrinfo hints = {
        .ai_family = AF_INET,
        .ai_socktype = SOCK_STREAM,
    };
    struct addrinfo *res = NULL;

    int err = getaddrinfo(TELEMETRY_HOST, NULL, &hints, &res);
    if (err != 0 || res == NULL) {
        ESP_LOGW(TAG, "Failed to resolve %s: getaddrinfo=%d", TELEMETRY_HOST, err);
        if (res != NULL) {
            freeaddrinfo(res);
        }
        if (force_refresh) {
            return use_next_fallback_telemetry_ip("DNS refresh failed");
        }
        if (had_cached_ip) {
            strlcpy(g_telemetry_ip, previous_ip, sizeof(g_telemetry_ip));
            g_have_telemetry_ip = true;
            ESP_LOGW(TAG, "Keeping last known backend IP %s despite DNS failure", g_telemetry_ip);
            return true;
        }

        clear_telemetry_endpoint_cache();
        return use_next_fallback_telemetry_ip("initial DNS failed");
    }

    struct sockaddr_in *addr = (struct sockaddr_in *)res->ai_addr;
    if (inet_ntoa_r(addr->sin_addr, g_telemetry_ip, sizeof(g_telemetry_ip)) == NULL) {
        ESP_LOGW(TAG, "Failed to format resolved IPv4 address for %s", TELEMETRY_HOST);
        freeaddrinfo(res);
        if (had_cached_ip) {
            strlcpy(g_telemetry_ip, previous_ip, sizeof(g_telemetry_ip));
            g_have_telemetry_ip = true;
            ESP_LOGW(TAG, "Keeping last known backend IP %s after format failure", g_telemetry_ip);
            return true;
        }

        clear_telemetry_endpoint_cache();
        return false;
    }

    freeaddrinfo(res);

    g_have_telemetry_ip = true;

    ESP_LOGI(TAG, "Telemetry host %s resolved to %s", TELEMETRY_HOST, g_telemetry_ip);
    return true;
}

static const char *sensor_type_to_backend_name(uint8_t sensor_type)
{
    switch (sensor_type) {
        case SENSOR_TYPE_SHT30:
            return SENSOR_TYPE_STR;
        default:
            return "unknown";
    }
}

static const char *sensor_type_to_backend_unit(uint8_t sensor_type)
{
    switch (sensor_type) {
        case SENSOR_TYPE_SHT30:
            return "C/%RH";
        default:
            return "";
    }
}

static const char *normalize_backend_sensor_name(const char *sensor_name)
{
    if (sensor_name == NULL || sensor_name[0] == '\0' || strcmp(sensor_name, "UNKNOWN") == 0) {
        return SENSOR_NAME_STR;
    }

    return sensor_name;
}

static const char *sensor_identity_to_backend_type(uint32_t sensor_id, const char *sensor_name, uint8_t sensor_type)
{
    switch (sensor_id) {
        case 0x00003001u:
            return "temperature_humidity";
        case 0x00002801u:
            return "bme280";
        case 0x00002802u:
            return "bmp280";
        case 0x00005301u:
            return "vl53l0x";
        default:
            break;
    }

    const char *name = sensor_name ? sensor_name : "";
    if (strstr(name, "BME280") != NULL) {
        return "bme280";
    }
    if (strstr(name, "BMP280") != NULL) {
        return "bmp280";
    }
    if (strstr(name, "VL53") != NULL) {
        return "vl53l0x";
    }

    return sensor_type_to_backend_name(sensor_type);
}

static const char *backend_type_primary_unit(const char *backend_type)
{
    if (strcmp(backend_type, "bme280") == 0 || strcmp(backend_type, "bmp280") == 0) {
        return "C";
    }
    if (strcmp(backend_type, "vl53l0x") == 0) {
        return "cm";
    }
    if (strcmp(backend_type, "temperature_humidity") == 0) {
        return "C/%RH";
    }
    return "";
}

static const char *skip_json_ws(const char *p)
{
    while (p && (*p == ' ' || *p == '\t' || *p == '\n' || *p == '\r')) {
        p++;
    }
    return p;
}

static const char *find_json_key_value(const char *json, const char *key)
{
    char pattern[48];

    snprintf(pattern, sizeof(pattern), "\"%s\"", key);
    const char *pos = strstr(json, pattern);
    if (pos == NULL) {
        return NULL;
    }

    pos = strchr(pos, ':');
    if (pos == NULL) {
        return NULL;
    }

    return skip_json_ws(pos + 1);
}

static bool json_extract_string(const char *json, const char *key, char *out, size_t out_len)
{
    const char *value = find_json_key_value(json, key);
    if (value == NULL || *value != '\"') {
        return false;
    }

    value++;
    const char *end = strchr(value, '\"');
    if (end == NULL) {
        return false;
    }

    size_t len = (size_t)(end - value);
    if (len >= out_len) {
        len = out_len - 1;
    }

    memcpy(out, value, len);
    out[len] = '\0';
    return true;
}

static bool json_extract_long(const char *json, const char *key, long *out_value)
{
    const char *value = find_json_key_value(json, key);
    char *end_ptr = NULL;

    if (value == NULL) {
        return false;
    }

    long parsed = strtol(value, &end_ptr, 10);
    if (end_ptr == value) {
        return false;
    }

    *out_value = parsed;
    return true;
}

static void reset_config_push_tracking(void)
{
    portENTER_CRITICAL(&g_config_push_lock);
    g_last_config_push_ms = 0;
    g_waiting_for_config_ack = false;
    g_pending_config_id[0] = '\0';
    portEXIT_CRITICAL(&g_config_push_lock);
}

static bool is_config_retry_due(uint32_t now_ms, bool force)
{
    bool ready = false;

    portENTER_CRITICAL(&g_config_push_lock);
    ready = force ||
            !g_waiting_for_config_ack ||
            g_last_config_push_ms == 0 ||
            (now_ms - g_last_config_push_ms) >= CONFIG_PUSH_RETRY_MS;
    portEXIT_CRITICAL(&g_config_push_lock);

    return ready;
}

static void note_config_push_sent(const char *config_id, uint32_t now_ms)
{
    portENTER_CRITICAL(&g_config_push_lock);
    g_last_config_push_ms = now_ms;
    g_waiting_for_config_ack = true;
    if (config_id && config_id[0] != '\0') {
        strlcpy(g_pending_config_id, config_id, sizeof(g_pending_config_id));
    } else {
        g_pending_config_id[0] = '\0';
    }
    portEXIT_CRITICAL(&g_config_push_lock);
}

static void note_config_ack_result(bool success)
{
    portENTER_CRITICAL(&g_config_push_lock);
    if (success) {
        g_last_config_push_ms = 0;
        g_waiting_for_config_ack = false;
        g_pending_config_id[0] = '\0';
    } else {
        g_waiting_for_config_ack = true;
    }
    portEXIT_CRITICAL(&g_config_push_lock);
}

static void update_sensor_meta(const char *sensor_name, uint8_t sensor_type, uint32_t sensor_id)
{
    portENTER_CRITICAL(&g_sensor_meta_lock);
    bool changed = !g_have_sensor_meta ||
                   g_sensor_proto_type != sensor_type ||
                   g_sensor_proto_id != sensor_id;

    if (sensor_name && sensor_name[0] != '\0') {
        if (!changed && strncmp(g_sensor_name, sensor_name, sizeof(g_sensor_name)) != 0) {
            changed = true;
        }
    }

    if (sensor_name && sensor_name[0] != '\0') {
        strlcpy(g_sensor_name, sensor_name, sizeof(g_sensor_name));
    }
    g_sensor_proto_type = sensor_type;
    g_sensor_proto_id = sensor_id;
    if (changed) {
        g_sensor_configured = false;
        g_backend_discovered = false;
        g_sensor_uid_ready = false;
        g_sensor_uid[0] = '\0';
    }
    g_have_sensor_meta = true;
    portEXIT_CRITICAL(&g_sensor_meta_lock);

    if (changed) {
        reset_config_push_tracking();
    }
}

static void mark_sensor_configured(bool configured)
{
    portENTER_CRITICAL(&g_sensor_meta_lock);
    g_sensor_configured = configured;
    portEXIT_CRITICAL(&g_sensor_meta_lock);
}

static void mark_backend_discovered(void)
{
    portENTER_CRITICAL(&g_sensor_meta_lock);
    g_backend_discovered = true;
    portEXIT_CRITICAL(&g_sensor_meta_lock);
}

static bool get_sensor_state_snapshot(char *sensor_name,
                                      size_t sensor_name_len,
                                      uint8_t *sensor_type,
                                      uint32_t *sensor_id,
                                      bool *configured,
                                      bool *discovered)
{
    bool have_sensor;

    portENTER_CRITICAL(&g_sensor_meta_lock);
    have_sensor = g_have_sensor_meta;
    if (have_sensor) {
        if (sensor_name && sensor_name_len > 0) {
            strlcpy(sensor_name, g_sensor_name, sensor_name_len);
        }
        if (sensor_type) {
            *sensor_type = g_sensor_proto_type;
        }
        if (sensor_id) {
            *sensor_id = g_sensor_proto_id;
        }
    }
    if (configured) {
        *configured = g_sensor_configured;
    }
    if (discovered) {
        *discovered = g_backend_discovered;
    }
    portEXIT_CRITICAL(&g_sensor_meta_lock);

    return have_sensor;
}

static void init_remote_config_defaults(void)
{
    portENTER_CRITICAL(&g_remote_cfg_lock);
    memset(&g_remote_cfg, 0, sizeof(g_remote_cfg));
    g_remote_cfg.valid = true;
    g_remote_cfg.has_active_config = false;
    g_remote_cfg.sample_period_ms = DEFAULT_CFG_SAMPLE_MS;
    g_remote_cfg.temp_threshold_hi_x100 = DEFAULT_TEMP_HI_X100;
    g_remote_cfg.humidity_threshold_hi_x100 = DEFAULT_HUM_HI_X100;
    strlcpy(g_remote_cfg.config_id, "boot-default", sizeof(g_remote_cfg.config_id));
    portEXIT_CRITICAL(&g_remote_cfg_lock);
}

static void get_remote_config_snapshot(controller_sensor_config_t *cfg)
{
    portENTER_CRITICAL(&g_remote_cfg_lock);
    *cfg = g_remote_cfg;
    portEXIT_CRITICAL(&g_remote_cfg_lock);
}

static bool update_remote_config(const char *config_id,
                                 bool has_active_config,
                                 uint32_t sample_period_ms,
                                 int16_t temp_threshold_hi_x100,
                                 uint16_t humidity_threshold_hi_x100)
{
    bool changed = false;

    portENTER_CRITICAL(&g_remote_cfg_lock);

    if (!g_remote_cfg.valid ||
        g_remote_cfg.has_active_config != has_active_config ||
        g_remote_cfg.sample_period_ms != sample_period_ms ||
        g_remote_cfg.temp_threshold_hi_x100 != temp_threshold_hi_x100 ||
        g_remote_cfg.humidity_threshold_hi_x100 != humidity_threshold_hi_x100 ||
        strncmp(g_remote_cfg.config_id, config_id, sizeof(g_remote_cfg.config_id)) != 0) {
        changed = true;
        g_remote_cfg.valid = true;
        g_remote_cfg.has_active_config = has_active_config;
        g_remote_cfg.sample_period_ms = sample_period_ms;
        g_remote_cfg.temp_threshold_hi_x100 = temp_threshold_hi_x100;
        g_remote_cfg.humidity_threshold_hi_x100 = humidity_threshold_hi_x100;
        strlcpy(g_remote_cfg.config_id, config_id, sizeof(g_remote_cfg.config_id));
    }

    portEXIT_CRITICAL(&g_remote_cfg_lock);

    return changed;
}

static void print_mac(const char *label, const uint8_t *mac)
{
    ESP_LOGI(TAG, "%s %02X:%02X:%02X:%02X:%02X:%02X",
             label, mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
}

static int find_base_by_mac(const uint8_t *mac)
{
    for (int i = 0; i < MAX_BASES; i++) {
        if (g_bases[i].in_use && memcmp(g_bases[i].mac, mac, 6) == 0) {
            return i;
        }
    }
    return -1;
}

static int alloc_base_slot(const uint8_t *mac)
{
    int idx = find_base_by_mac(mac);
    if (idx >= 0) {
        return idx;
    }

    for (int i = 0; i < MAX_BASES; i++) {
        if (!g_bases[i].in_use) {
            memset(&g_bases[i], 0, sizeof(g_bases[i]));
            g_bases[i].in_use = true;
            memcpy(g_bases[i].mac, mac, 6);
            return i;
        }
    }

    return -1;
}

static void push_config_to_known_bases(void)
{
    for (int i = 0; i < MAX_BASES; i++) {
        if (!g_bases[i].in_use || g_bases[i].sensor_id == 0) {
            continue;
        }

        send_config_set(g_bases[i].mac, g_bases[i].base_id, g_bases[i].sensor_id);
    }
}

static uint32_t get_config_poll_interval_ms(bool have_sensor_state,
                                            bool backend_discovered,
                                            bool sensor_configured,
                                            const controller_sensor_config_t *cfg)
{
    if (!have_sensor_state || !backend_discovered || cfg == NULL || !cfg->has_active_config || !sensor_configured) {
        return CONFIG_POLL_FAST_MS;
    }

    uint32_t adaptive_ms = cfg->sample_period_ms / 4U;
    if (adaptive_ms < CONFIG_POLL_STABLE_MIN_MS) {
        adaptive_ms = CONFIG_POLL_STABLE_MIN_MS;
    }
    if (adaptive_ms > CONFIG_POLL_STABLE_MAX_MS) {
        adaptive_ms = CONFIG_POLL_STABLE_MAX_MS;
    }

    return adaptive_ms;
}

static bool maybe_push_config_to_base(const uint8_t *mac, uint32_t base_id, uint32_t sensor_id, bool force)
{
    controller_sensor_config_t cfg;
    get_remote_config_snapshot(&cfg);

    if (!cfg.has_active_config) {
        return false;
    }

    uint32_t now_ms = ms_now();
    if (!is_config_retry_due(now_ms, force)) {
        return false;
    }

    if (!send_config_set(mac, base_id, sensor_id)) {
        return false;
    }

    note_config_push_sent(cfg.config_id, now_ms);
    return true;
}

static bool maybe_push_config_to_known_bases(bool force)
{
    controller_sensor_config_t cfg;
    get_remote_config_snapshot(&cfg);

    if (!cfg.has_active_config) {
        return false;
    }

    uint32_t now_ms = ms_now();
    if (!is_config_retry_due(now_ms, force)) {
        return false;
    }

    bool sent = false;
    for (int i = 0; i < MAX_BASES; i++) {
        if (!g_bases[i].in_use || g_bases[i].sensor_id == 0) {
            continue;
        }

        if (send_config_set(g_bases[i].mac, g_bases[i].base_id, g_bases[i].sensor_id)) {
            sent = true;
        }
    }

    if (sent) {
        note_config_push_sent(cfg.config_id, now_ms);
    }

    return sent;
}

static void add_peer_if_needed(const uint8_t *mac)
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
        print_mac("Peer added:", mac);
    } else {
        ESP_LOGE(TAG, "esp_now_add_peer failed: %s", esp_err_to_name(err));
    }
}

static void set_latest_sht_sample(float temp_c, float humidity_rh)
{
    portENTER_CRITICAL(&g_sht_sample_lock);
    g_latest_temp_c = temp_c;
    g_latest_humidity_rh = humidity_rh;
    g_latest_sht_rx_ms = ms_now();
    g_have_latest_sht_sample = true;
    portEXIT_CRITICAL(&g_sht_sample_lock);
}

static void clear_latest_sht_sample(void)
{
    portENTER_CRITICAL(&g_sht_sample_lock);
    g_have_latest_sht_sample = false;
    g_latest_temp_c = 0.0f;
    g_latest_humidity_rh = 0.0f;
    g_latest_sht_rx_ms = 0;
    portEXIT_CRITICAL(&g_sht_sample_lock);
}

static bool get_latest_sht_sample(float *temp_c, float *humidity_rh, uint32_t *rx_ms)
{
    bool ok;

    portENTER_CRITICAL(&g_sht_sample_lock);
    ok = g_have_latest_sht_sample;
    if (ok) {
        *temp_c = g_latest_temp_c;
        *humidity_rh = g_latest_humidity_rh;
        *rx_ms = g_latest_sht_rx_ms;
    }
    portEXIT_CRITICAL(&g_sht_sample_lock);

    return ok;
}

/* =========================================================
 * Time sync
 * ========================================================= */
static bool sync_time_once(void)
{
    time_t now = 0;
    time(&now);

    if ((int64_t)now >= MIN_VALID_UNIX_TS) {
        if (!g_time_synced) {
            ESP_LOGI(TAG, "Time is already valid, epoch=%lld", (long long)now);
        }
        g_time_synced = true;
        return true;
    }

    if (g_time_synced) {
        return true;
    }

    if (!g_sntp_inited) {
        esp_sntp_config_t config = ESP_NETIF_SNTP_DEFAULT_CONFIG("pool.ntp.org");
        esp_netif_sntp_init(&config);
        g_sntp_inited = true;
    }

    uint32_t now_ms = ms_now();
    if (g_last_sntp_attempt_ms != 0 &&
        (now_ms - g_last_sntp_attempt_ms) < SNTP_RETRY_MS) {
        return true;
    }

    g_last_sntp_attempt_ms = now_ms;
    ESP_LOGI(TAG, "Attempting SNTP time sync in background...");

    if (esp_netif_sntp_sync_wait(pdMS_TO_TICKS(SNTP_TIMEOUT_MS)) != ESP_OK) {
        ESP_LOGW(TAG, "SNTP sync timeout; continuing with server-side timestamps and retrying later");
        return true;
    }

    time(&now);
    if ((int64_t)now >= MIN_VALID_UNIX_TS) {
        ESP_LOGI(TAG, "Time synced, epoch=%lld", (long long)now);
        g_time_synced = true;
    } else {
        ESP_LOGW(TAG, "SNTP returned but device time is still not valid; continuing without a local epoch for now");
    }

    return true;
}

/* =========================================================
 * Raw AT helpers
 * ========================================================= */
static void raw_uart_init(void)
{
    const uart_config_t uart_config = {
        .baud_rate = MODEM_BAUD_RATE,
        .data_bits = UART_DATA_8_BITS,
        .parity = UART_PARITY_DISABLE,
        .stop_bits = UART_STOP_BITS_1,
        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
        .source_clk = UART_SCLK_DEFAULT,
    };

    ESP_ERROR_CHECK(uart_driver_install(MODEM_UART_NUM, RAW_BUF_SIZE, 0, 0, NULL, 0));
    ESP_ERROR_CHECK(uart_param_config(MODEM_UART_NUM, &uart_config));
    ESP_ERROR_CHECK(uart_set_pin(
        MODEM_UART_NUM,
        MODEM_TX_PIN,
        MODEM_RX_PIN,
        MODEM_RTS_PIN,
        MODEM_CTS_PIN
    ));
}

static void raw_uart_deinit(void)
{
    uart_driver_delete(MODEM_UART_NUM);
}

static void raw_clear_rsp(void)
{
    memset(g_rsp, 0, sizeof(g_rsp));
}

static bool raw_send_cmd_wait_for(const char *cmd, const char *expect, int timeout_ms)
{
    int elapsed_ms = 0;
    const int poll_ms = 250;
    int used = 0;

    int tx_len = snprintf(g_tx_buf, sizeof(g_tx_buf), "%s\r\n", cmd);
    if (tx_len <= 0 || tx_len >= (int)sizeof(g_tx_buf)) {
        ESP_LOGE(TAG, "Command too long: %s", cmd);
        return false;
    }

    raw_clear_rsp();
    uart_flush_input(MODEM_UART_NUM);
    uart_write_bytes(MODEM_UART_NUM, g_tx_buf, tx_len);

    while (elapsed_ms < timeout_ms) {
        int len = uart_read_bytes(
            MODEM_UART_NUM,
            g_rx_chunk,
            sizeof(g_rx_chunk),
            pdMS_TO_TICKS(poll_ms)
        );
        elapsed_ms += poll_ms;

        if (len <= 0) {
            continue;
        }

        if (used + len >= (int)sizeof(g_rsp)) {
            len = (int)sizeof(g_rsp) - used - 1;
        }
        if (len <= 0) {
            break;
        }

        memcpy(g_rsp + used, g_rx_chunk, len);
        used += len;
        g_rsp[used] = '\0';

        if (strstr(g_rsp, expect) != NULL) {
            ESP_LOGI(TAG, "CMD: %s", cmd);
            ESP_LOGI(TAG, "RSP:\n%s", g_rsp);
            return true;
        }

        if (strstr(g_rsp, "ERROR") != NULL || strstr(g_rsp, "+CME ERROR") != NULL) {
            ESP_LOGI(TAG, "CMD: %s", cmd);
            ESP_LOGI(TAG, "RSP:\n%s", g_rsp);
            return false;
        }
    }

    ESP_LOGI(TAG, "CMD: %s", cmd);
    ESP_LOGI(TAG, "RSP:\n%s", g_rsp);
    return false;
}

static bool raw_modem_prepare(void)
{
    ESP_LOGI(TAG, "Raw AT precheck phase...");

    raw_uart_init();
    vTaskDelay(pdMS_TO_TICKS(3000));

    /*
     * If the ESP32 reset while SIM800 stayed powered, the modem may still be
     * in PPP/data mode. Escape back to AT command mode before the AT checks.
     */
    vTaskDelay(pdMS_TO_TICKS(1200));
    uart_write_bytes(MODEM_UART_NUM, "+++", 3);
    vTaskDelay(pdMS_TO_TICKS(1200));
    uart_write_bytes(MODEM_UART_NUM, "ATH\r\n", 5);
    vTaskDelay(pdMS_TO_TICKS(1000));
    uart_flush_input(MODEM_UART_NUM);

    bool modem_ready = false;
    for (int i = 0; i < 8; i++) {
        if (raw_send_cmd_wait_for("AT", "OK", 2000)) {
            modem_ready = true;
            break;
        }
        vTaskDelay(pdMS_TO_TICKS(1000));
    }

    if (!modem_ready) {
        ESP_LOGE(TAG, "Modem did not respond to AT");
        raw_uart_deinit();
        return false;
    }

    if (!raw_send_cmd_wait_for("ATE0", "OK", 3000)) {
        ESP_LOGE(TAG, "ATE0 failed");
        raw_uart_deinit();
        return false;
    }

    raw_send_cmd_wait_for("AT+CPIN?", "READY", 3000);
    raw_send_cmd_wait_for("AT+CSQ", "OK", 3000);
    raw_send_cmd_wait_for("AT+CREG?", "OK", 3000);
    raw_send_cmd_wait_for("AT+CGREG?", "OK", 3000);

    /*
     * Clean old PDP/GPRS state. These commands are allowed to fail on some
     * networks/modules, so we use them as best-effort cleanup.
     */
    raw_send_cmd_wait_for("ATH", "OK", 3000);
    raw_send_cmd_wait_for("AT+CGACT=0,1", "OK", 8000);
    raw_send_cmd_wait_for("AT+CGATT=1", "OK", 15000);

    bool attached = false;
    for (int i = 0; i < 12; i++) {
        if (raw_send_cmd_wait_for("AT+CGATT?", "+CGATT: 1", 5000)) {
            attached = true;
            break;
        }

        ESP_LOGW(TAG, "GPRS not attached yet, retrying...");
        vTaskDelay(pdMS_TO_TICKS(5000));
    }

    if (!attached) {
        ESP_LOGE(TAG, "CGATT failed");
        raw_uart_deinit();
        return false;
    }

    if (!raw_send_cmd_wait_for("AT+CGDCONT=1,\"IP\",\"" MODEM_APN "\"", "OK", 5000)) {
        ESP_LOGE(TAG, "CGDCONT failed");
        raw_uart_deinit();
        return false;
    }

    ESP_LOGI(TAG, "Raw AT precheck passed");
    raw_uart_deinit();
    return true;
}

/* =========================================================
 * PPP / HTTP
 * ========================================================= */
static void on_ip_event(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data)
{
    if (event_base == IP_EVENT && event_id == IP_EVENT_PPP_GOT_IP) {
        ip_event_got_ip_t *event = (ip_event_got_ip_t *)event_data;
        const esp_netif_ip_info_t *ip_info = &event->ip_info;

        ESP_LOGI(TAG, "PPP got IP");
        ESP_LOGI(TAG, "IP      : " IPSTR, IP2STR(&ip_info->ip));
        ESP_LOGI(TAG, "Netmask : " IPSTR, IP2STR(&ip_info->netmask));
        ESP_LOGI(TAG, "Gateway : " IPSTR, IP2STR(&ip_info->gw));

        g_ppp_connected = true;
        clear_telemetry_endpoint_cache();
        xEventGroupSetBits(s_event_group, PPP_CONNECTED_BIT);
        xEventGroupClearBits(s_event_group, PPP_DISCONNECTED_BIT);
    }

    if (event_base == IP_EVENT && event_id == IP_EVENT_PPP_LOST_IP) {
        ESP_LOGW(TAG, "PPP lost IP");
        g_ppp_connected = false;
        clear_telemetry_endpoint_cache();
        xEventGroupClearBits(s_event_group, PPP_CONNECTED_BIT);
        xEventGroupSetBits(s_event_group, PPP_DISCONNECTED_BIT);
    }
}

static esp_err_t http_event_handler(esp_http_client_event_t *evt)
{
    http_resp_ctx_t *ctx = (http_resp_ctx_t *)evt->user_data;

    if (ctx == NULL) {
        return ESP_OK;
    }

    if (evt->event_id == HTTP_EVENT_ON_DATA && evt->data && evt->data_len > 0) {
        int space_left = ctx->max_len - ctx->cur_len - 1;
        if (space_left > 0) {
            int copy_len = evt->data_len;
            if (copy_len > space_left) {
                copy_len = space_left;
            }

            memcpy(ctx->buf + ctx->cur_len, evt->data, copy_len);
            ctx->cur_len += copy_len;
            ctx->buf[ctx->cur_len] = '\0';
        }
    }

    return ESP_OK;
}

static bool ppp_ensure_connected(void)
{
    EventBits_t bits = xEventGroupGetBits(s_event_group);
    if (bits & PPP_CONNECTED_BIT) {
        return true;
    }

    if (!raw_modem_prepare()) {
        ESP_LOGE(TAG, "Raw modem prepare failed");
        return false;
    }

    if (g_ppp_netif == NULL) {
        esp_netif_config_t netif_config = ESP_NETIF_DEFAULT_PPP();
        g_ppp_netif = esp_netif_new(&netif_config);
        if (g_ppp_netif == NULL) {
            ESP_LOGE(TAG, "Failed to create PPP netif");
            return false;
        }
    }

    if (g_dce == NULL) {
        esp_modem_dte_config_t dte_config = ESP_MODEM_DTE_DEFAULT_CONFIG();
        dte_config.uart_config.tx_io_num = MODEM_TX_PIN;
        dte_config.uart_config.rx_io_num = MODEM_RX_PIN;
        dte_config.uart_config.rts_io_num = MODEM_RTS_PIN;
        dte_config.uart_config.cts_io_num = MODEM_CTS_PIN;
        dte_config.uart_config.baud_rate = MODEM_BAUD_RATE;

        esp_modem_dce_config_t dce_config = ESP_MODEM_DCE_DEFAULT_CONFIG(MODEM_APN);

        ESP_LOGI(TAG, "Creating SIM800 modem object...");
        g_dce = esp_modem_new_dev(
            ESP_MODEM_DCE_SIM800,
            &dte_config,
            &dce_config,
            g_ppp_netif
        );

        if (g_dce == NULL) {
            ESP_LOGE(TAG, "Failed to create modem object");
            return false;
        }
    }

    xEventGroupClearBits(s_event_group, PPP_CONNECTED_BIT | PPP_DISCONNECTED_BIT);

    ESP_LOGI(TAG, "Switching modem to DATA mode...");
    esp_err_t err = esp_modem_set_mode(g_dce, ESP_MODEM_MODE_DATA);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to set modem data mode: %s", esp_err_to_name(err));
        return false;
    }

    EventBits_t wait_bits = xEventGroupWaitBits(
        s_event_group,
        PPP_CONNECTED_BIT,
        pdFALSE,
        pdFALSE,
        pdMS_TO_TICKS(120000)
    );

    if ((wait_bits & PPP_CONNECTED_BIT) == 0) {
        ESP_LOGE(TAG, "PPP did not get IP");
        g_ppp_connected = false;
        return false;
    }

    g_ppp_connected = true;
    return true;
}

static void force_ppp_reconnect(const char *reason)
{
    ESP_LOGW(TAG, "Forcing PPP reconnect: %s", reason ? reason : "unspecified");

    g_ppp_connected = false;
    clear_telemetry_endpoint_cache();
    xEventGroupClearBits(s_event_group, PPP_CONNECTED_BIT);
    xEventGroupSetBits(s_event_group, PPP_DISCONNECTED_BIT);

    if (g_dce != NULL) {
        esp_err_t cmd_err = esp_modem_set_mode(g_dce, ESP_MODEM_MODE_COMMAND);
        if (cmd_err != ESP_OK) {
            ESP_LOGW(TAG, "Failed to switch modem to command mode during reconnect: %s", esp_err_to_name(cmd_err));
        }

        esp_modem_destroy(g_dce);
        g_dce = NULL;
    }

    vTaskDelay(pdMS_TO_TICKS(2000));
}

static http_post_result_t http_post_json_once_with_timeout(const char *path, const char *json_payload, int timeout_ms)
{
    memset(g_http_resp, 0, sizeof(g_http_resp));

    http_resp_ctx_t resp_ctx = {
        .buf = g_http_resp,
        .max_len = sizeof(g_http_resp),
        .cur_len = 0
    };

    bool have_cached_ip = resolve_telemetry_endpoint(false);

    char request_url[128];
    if (have_cached_ip && g_have_telemetry_ip) {
        snprintf(request_url, sizeof(request_url), "http://%s%s", g_telemetry_ip, path);
    } else {
        snprintf(request_url, sizeof(request_url), "http://%s%s", TELEMETRY_HOST, path);
    }

    esp_http_client_config_t config = {
        .url = request_url,
        .method = HTTP_METHOD_POST,
        .timeout_ms = timeout_ms > 0 ? timeout_ms : HTTP_TIMEOUT_MS,
        .event_handler = http_event_handler,
        .user_data = &resp_ctx,
    };

    esp_http_client_handle_t client = esp_http_client_init(&config);
    if (client == NULL) {
        ESP_LOGE(TAG, "Failed to create HTTP client");
        return (http_post_result_t) {
            .err = ESP_FAIL,
            .status_code = 0,
        };
    }

    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_http_client_set_header(client, "Connection", "close");
    if (have_cached_ip && g_have_telemetry_ip) {
        esp_http_client_set_header(client, "Host", TELEMETRY_HOST);
    }
    esp_http_client_set_post_field(client, json_payload, (int)strlen(json_payload));

    ESP_LOGI(TAG, "POST url: %s", request_url);
    ESP_LOGI(TAG, "POST body:\n%s", json_payload);

    esp_err_t err = esp_http_client_perform(client);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "POST failed: %s", esp_err_to_name(err));
        esp_http_client_cleanup(client);
        return (http_post_result_t) {
            .err = err,
            .status_code = 0,
        };
    }

    int status = esp_http_client_get_status_code(client);
    ESP_LOGI(TAG, "POST status = %d", status);

    if (g_http_resp[0] != '\0') {
        ESP_LOGI(TAG, "POST response:\n%s", g_http_resp);
    }

    esp_http_client_cleanup(client);
    return (http_post_result_t) {
        .err = ESP_OK,
        .status_code = status,
    };
}

static http_post_result_t http_post_json_once(const char *path, const char *json_payload)
{
    return http_post_json_once_with_timeout(path, json_payload, HTTP_TIMEOUT_MS);
}

static bool http_post_json(const char *path, const char *json_payload)
{
    http_post_result_t result = {
        .err = ESP_FAIL,
        .status_code = 0,
    };

    for (int attempt = 1; attempt <= HTTP_MAX_ATTEMPTS; attempt++) {
        result = http_post_json_once(path, json_payload);
        if (result.err == ESP_OK && result.status_code >= 200 && result.status_code < 300) {
            return true;
        }

        if (attempt == HTTP_MAX_ATTEMPTS) {
            break;
        }

        if (result.err != ESP_OK) {
            ESP_LOGW(TAG, "HTTP transport failed on attempt %d/%d; refreshing backend IP cache",
                     attempt, HTTP_MAX_ATTEMPTS);
            resolve_telemetry_endpoint(true);
        } else if (result.status_code >= 500) {
            ESP_LOGW(TAG, "Backend returned %d on attempt %d/%d; retrying",
                     result.status_code, attempt, HTTP_MAX_ATTEMPTS);
        } else {
            break;
        }

        ESP_LOGW(TAG, "Retrying POST in %d ms...", SEND_RETRY_MS);
        vTaskDelay(pdMS_TO_TICKS(SEND_RETRY_MS));
    }

    if (result.err != ESP_OK) {
        force_ppp_reconnect("HTTP transport retries exhausted");
    }

    return false;
}

/* =========================================================
 * JSON payload
 * ========================================================= */
static int build_config_pull_json(char *buf, size_t buf_len)
{
    uint8_t sensor_type = SENSOR_TYPE_SHT30;
    uint32_t sensor_id = 0;
    char sensor_name[MPROTO_SENSOR_NAME_LEN] = {0};

    if (!get_sensor_state_snapshot(sensor_name, sizeof(sensor_name), &sensor_type, &sensor_id, NULL, NULL)) {
        sensor_type = SENSOR_TYPE_SHT30;
    }

    return snprintf(
        buf, buf_len,
        "{"
          "\"deviceId\":\"" DEVICE_ID_STR "\","
          "\"sensorId\":\"%s\","
          "\"sensorType\":\"%s\""
        "}",
        get_backend_sensor_uid(),
        sensor_identity_to_backend_type(sensor_id, sensor_name, sensor_type)
    );
}

static int build_payload_json(float temp_value, float humidity_value, char *buf, size_t buf_len)
{
    uint8_t sensor_type = SENSOR_TYPE_SHT30;
    uint32_t sensor_id = 0;
    char sensor_name[MPROTO_SENSOR_NAME_LEN] = {0};
    char sidecar_sensor_uid[80];

    if (!get_sensor_state_snapshot(sensor_name, sizeof(sensor_name), &sensor_type, &sensor_id, NULL, NULL)) {
        return -1;
    }

    const char *backend_type = sensor_identity_to_backend_type(sensor_id, sensor_name, sensor_type);

    if (strcmp(backend_type, "vl53l0x") == 0) {
        return snprintf(
            buf, buf_len,
            "{"
              "\"deviceId\":\"" DEVICE_ID_STR "\","
              "\"ts\":%lu,"
              "\"sensors\":["
                "{"
                  "\"id\":\"%s\","
                  "\"type\":\"vl53l0x\","
                  "\"v\":%.1f"
                "}"
              "]"
            "}",
            (unsigned long)ts_now_seconds(),
            get_backend_sensor_uid(),
            humidity_value
        );
    }

    get_backend_humidity_sensor_uid(sidecar_sensor_uid, sizeof(sidecar_sensor_uid));

    const char *sidecar_type = "humidity";
    if (strcmp(backend_type, "bme280") == 0 || strcmp(backend_type, "bmp280") == 0) {
        strlcpy(sidecar_sensor_uid, get_backend_sensor_uid(), sizeof(sidecar_sensor_uid));
        strlcat(sidecar_sensor_uid, PRESSURE_UID_SUFFIX, sizeof(sidecar_sensor_uid));
        sidecar_type = "pressure";
    }

    return snprintf(
        buf, buf_len,
        "{"
          "\"deviceId\":\"" DEVICE_ID_STR "\","
          "\"ts\":%lu,"
          "\"sensors\":["
            "{"
              "\"id\":\"%s\","
              "\"type\":\"%s\","
              "\"v\":%.1f"
            "},"
            "{"
              "\"id\":\"%s\","
              "\"type\":\"%s\","
              "\"v\":%.1f"
            "}"
          "]"
        "}",
        (unsigned long)ts_now_seconds(),
        get_backend_sensor_uid(),
        backend_type,
        temp_value,
        sidecar_sensor_uid,
        sidecar_type,
        humidity_value
    );
}

static int build_discovery_json(char *buf, size_t buf_len)
{
    char sensor_name[MPROTO_SENSOR_NAME_LEN];
    uint8_t sensor_type = SENSOR_TYPE_NONE;
    uint32_t sensor_id = 0;

    if (!get_sensor_state_snapshot(sensor_name, sizeof(sensor_name), &sensor_type, &sensor_id, NULL, NULL)) {
        return -1;
    }

    const char *backend_type = sensor_identity_to_backend_type(sensor_id, sensor_name, sensor_type);

    if (strcmp(backend_type, "vl53l0x") == 0) {
        return snprintf(
            buf, buf_len,
            "{"
              "\"deviceId\":\"" DEVICE_ID_STR "\","
              "\"ts\":%lu,"
              "\"sensors\":["
                "{"
                  "\"id\":\"%s\","
                  "\"type\":\"vl53l0x\","
                  "\"name\":\"%s\","
                  "\"unit\":\"cm\""
                "}"
              "]"
            "}",
            (unsigned long)ts_now_seconds(),
            get_backend_sensor_uid(),
            normalize_backend_sensor_name(sensor_name)
        );
    }

    const bool pressure_sensor = strcmp(backend_type, "bme280") == 0 || strcmp(backend_type, "bmp280") == 0;
    const char *sidecar_suffix = pressure_sensor ? PRESSURE_UID_SUFFIX : HUMIDITY_UID_SUFFIX;
    const char *sidecar_type = pressure_sensor ? "pressure" : "humidity";
    const char *sidecar_name = pressure_sensor ? "Pressure" : "Humidity";
    const char *sidecar_unit = pressure_sensor ? "kPa" : "%RH";

    return snprintf(
        buf, buf_len,
        "{"
          "\"deviceId\":\"" DEVICE_ID_STR "\","
          "\"ts\":%lu,"
          "\"sensors\":["
            "{"
              "\"id\":\"%s\","
              "\"type\":\"%s\","
              "\"name\":\"%s\","
              "\"unit\":\"%s\""
            "},"
            "{"
              "\"id\":\"%s%s\","
              "\"type\":\"%s\","
              "\"name\":\"%s\","
              "\"unit\":\"%s\""
            "}"
          "]"
        "}",
        (unsigned long)ts_now_seconds(),
        get_backend_sensor_uid(),
        backend_type,
        normalize_backend_sensor_name(sensor_name),
        backend_type_primary_unit(backend_type),
        get_backend_sensor_uid(),
        sidecar_suffix,
        sidecar_type,
        sidecar_name,
        sidecar_unit
    );
}

static bool maybe_refresh_sensor_config(uint32_t min_interval_ms)
{
    static uint32_t last_poll_ms = 0;
    uint32_t now_ms = ms_now();

    if (last_poll_ms != 0 && (now_ms - last_poll_ms) < min_interval_ms) {
        return false;
    }

    last_poll_ms = now_ms;

    if (build_config_pull_json(g_http_post_body, sizeof(g_http_post_body)) <= 0) {
        return false;
    }

    ESP_LOGI(TAG, "Polling backend for current sensor config...");
    if (!http_post_json(CONFIG_PATH, g_http_post_body)) {
        ESP_LOGW(TAG, "Config pull failed; keeping cached device config");
        return false;
    }

    char config_id[64] = {0};
    long sample_period_ms = 0;
    long temp_hi_x100 = 0;
    long humidity_hi_x100 = 0;

    if (!json_extract_string(g_http_resp, "configId", config_id, sizeof(config_id)) ||
        !json_extract_long(g_http_resp, "samplePeriodMs", &sample_period_ms) ||
        !json_extract_long(g_http_resp, "tempThresholdHiX100", &temp_hi_x100) ||
        !json_extract_long(g_http_resp, "humidityThresholdHiX100", &humidity_hi_x100)) {
        ESP_LOGW(TAG, "Config pull response missing required fields");
        return false;
    }

    bool has_active_config = strstr(g_http_resp, "\"hasActiveConfig\":true") != NULL;
    if (sample_period_ms <= 0) {
        sample_period_ms = DEFAULT_CFG_SAMPLE_MS;
    }
    if (temp_hi_x100 == 0) {
        temp_hi_x100 = DEFAULT_TEMP_HI_X100;
    }
    if (humidity_hi_x100 == 0) {
        humidity_hi_x100 = DEFAULT_HUM_HI_X100;
    }
    if (config_id[0] == '\0') {
        strlcpy(config_id, has_active_config ? "active-config" : "default-config", sizeof(config_id));
    }

    bool changed = update_remote_config(
        config_id,
        has_active_config,
        (uint32_t)sample_period_ms,
        (int16_t)temp_hi_x100,
        (uint16_t)humidity_hi_x100
    );

    if (changed) {
        ESP_LOGI(TAG,
                 "Cached device config updated id=%s active=%u sample=%lu temp_hi=%.2f hum_hi=%.2f",
                 config_id,
                 has_active_config ? 1 : 0,
                 (unsigned long)sample_period_ms,
                 temp_hi_x100 / 100.0,
                 humidity_hi_x100 / 100.0);
        reset_config_push_tracking();
        mark_sensor_configured(false);
    }

    return changed;
}

/* =========================================================
 * ESP-NOW init
 * ========================================================= */
static void wifi_init_for_espnow(void)
{
    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_start());
    ESP_ERROR_CHECK(esp_wifi_set_ps(WIFI_PS_NONE));
    ESP_ERROR_CHECK(esp_wifi_set_channel(WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE));
}

static void add_broadcast_peer(void)
{
    uint8_t broadcast[6] = {0xff,0xff,0xff,0xff,0xff,0xff};
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

static void on_data_sent(const wifi_tx_info_t *tx_info, esp_now_send_status_t status)
{
    if (tx_info && tx_info->des_addr) {
        ESP_LOGI(TAG, "SEND to %02X:%02X:%02X:%02X:%02X:%02X status=%s",
                 tx_info->des_addr[0], tx_info->des_addr[1], tx_info->des_addr[2],
                 tx_info->des_addr[3], tx_info->des_addr[4], tx_info->des_addr[5],
                 status == ESP_NOW_SEND_SUCCESS ? "OK" : "FAIL");
    }
}

/* =========================================================
 * ACK / config helpers
 * ========================================================= */
static void send_base_ack(const uint8_t *mac, uint32_t base_id)
{
    mproto_ack_t pl = {0};
    pl.acked_msg_type = MSG_BASE_HELLO;
    pl.status = ACK_STATUS_OK;
    snprintf(pl.detail, sizeof(pl.detail), "base_ack");

    mproto_frame_t f = {0};
    f.msg_type = MSG_BASE_ACK;
    f.payload_len = sizeof(pl);
    f.base_id = base_id;
    f.seq_num = ++g_seq;
    memcpy(f.payload, &pl, sizeof(pl));

    esp_err_t err = esp_now_send(mac, (uint8_t *)&f, sizeof(f));
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "send_base_ack failed: %s", esp_err_to_name(err));
    }
}

static void send_module_ack(const uint8_t *mac, uint32_t base_id, uint32_t sensor_id)
{
    mproto_ack_t pl = {0};
    pl.acked_msg_type = MSG_MODULE_INFO;
    pl.status = ACK_STATUS_OK;
    snprintf(pl.detail, sizeof(pl.detail), "module_ack");

    mproto_frame_t f = {0};
    f.msg_type = MSG_MODULE_ACK;
    f.payload_len = sizeof(pl);
    f.base_id = base_id;
    f.sensor_id = sensor_id;
    f.seq_num = ++g_seq;
    memcpy(f.payload, &pl, sizeof(pl));

    esp_err_t err = esp_now_send(mac, (uint8_t *)&f, sizeof(f));
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "send_module_ack failed: %s", esp_err_to_name(err));
    }
}

static bool send_config_set(const uint8_t *mac, uint32_t base_id, uint32_t sensor_id)
{
    controller_sensor_config_t cfg;
    get_remote_config_snapshot(&cfg);

    mproto_config_set_t pl = {
        .sample_period_ms = cfg.sample_period_ms,
        .temp_threshold_hi_x100 = cfg.temp_threshold_hi_x100,
        .humidity_threshold_hi_x100 = cfg.humidity_threshold_hi_x100,
        .apply_flags = 1
    };

    mproto_frame_t f = {0};
    f.msg_type = MSG_CONFIG_SET;
    f.payload_len = sizeof(pl);
    f.base_id = base_id;
    f.sensor_id = sensor_id;
    f.seq_num = ++g_seq;
    memcpy(f.payload, &pl, sizeof(pl));

    esp_err_t err = esp_now_send(mac, (uint8_t *)&f, sizeof(f));
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "send_config_set failed: %s", esp_err_to_name(err));
        return false;
    } else {
        ESP_LOGI(TAG,
                 "CONFIG_SET sent sample=%lu temp_hi=%.2f hum_hi=%.2f cfg=%s",
                 (unsigned long)pl.sample_period_ms,
                 pl.temp_threshold_hi_x100 / 100.0f,
                 pl.humidity_threshold_hi_x100 / 100.0f,
                 cfg.config_id);
        return true;
    }
}

/* =========================================================
 * Incoming handlers
 * ========================================================= */
static void handle_base_hello(const uint8_t *mac, const mproto_frame_t *f)
{
    if (f->payload_len != sizeof(mproto_base_hello_t)) {
        ESP_LOGW(TAG, "Bad BASE_HELLO payload_len=%u", f->payload_len);
        return;
    }

    mproto_base_hello_t pl;
    memcpy(&pl, f->payload, sizeof(pl));

    int idx = alloc_base_slot(mac);
    if (idx < 0) {
        ESP_LOGE(TAG, "No free base slots");
        return;
    }

    g_bases[idx].base_id = f->base_id;
    g_bases[idx].sensor_type = f->sensor_type;
    g_bases[idx].last_seen_ms = ms_now();
    g_bases[idx].base_acked = true;

    print_mac("BASE_HELLO from", mac);
    ESP_LOGI(TAG, "BASE_HELLO base_id=%lu fw=%u has_module=%u",
             (unsigned long)f->base_id,
             pl.fw_version,
             pl.has_module);

    send_base_ack(mac, f->base_id);
}

static void handle_module_info(const uint8_t *mac, const mproto_frame_t *f)
{
    if (f->payload_len != sizeof(mproto_module_info_t)) {
        ESP_LOGW(TAG, "Bad MODULE_INFO payload_len=%u", f->payload_len);
        return;
    }

    int idx = alloc_base_slot(mac);
    if (idx < 0) {
        ESP_LOGE(TAG, "No free base slots");
        return;
    }

    g_bases[idx].base_id = f->base_id;
    g_bases[idx].sensor_id = f->sensor_id;
    g_bases[idx].sensor_type = f->sensor_type;
    g_bases[idx].last_seen_ms = ms_now();
    g_bases[idx].module_acked = true;

    mproto_module_info_t pl;
    memcpy(&pl, f->payload, sizeof(pl));
    update_sensor_meta(pl.sensor_name, f->sensor_type, f->sensor_id);

    ESP_LOGI(TAG, "MODULE_INFO base_id=%lu sensor_id=%lu sensor_type=%u",
             (unsigned long)f->base_id,
             (unsigned long)f->sensor_id,
             f->sensor_type);

    send_module_ack(mac, f->base_id, f->sensor_id);
}

static void handle_sensor_data(const uint8_t *mac, const mproto_frame_t *f)
{
    if (f->payload_len != sizeof(mproto_sht30_data_t)) {
        ESP_LOGW(TAG, "Bad SENSOR_DATA payload_len=%u", f->payload_len);
        return;
    }

    int idx = alloc_base_slot(mac);
    if (idx < 0) {
        return;
    }

    mproto_sht30_data_t pl;
    memcpy(&pl, f->payload, sizeof(pl));

    g_bases[idx].base_id = f->base_id;
    g_bases[idx].sensor_id = f->sensor_id;
    g_bases[idx].sensor_type = f->sensor_type;
    g_bases[idx].last_seen_ms = ms_now();

    bool sensor_configured = false;
    bool backend_discovered = false;
    if (!get_sensor_state_snapshot(NULL, 0, NULL, NULL, &sensor_configured, &backend_discovered)) {
        ESP_LOGW(TAG, "No MODULE_INFO seen; inferring sensor metadata from SENSOR_DATA");
        update_sensor_meta(SENSOR_NAME_STR, f->sensor_type, f->sensor_id);
        sensor_configured = false;
        backend_discovered = false;
    }

    float temp_c = pl.temperature_c_x100 / 100.0f;
    float humidity_rh = pl.humidity_rh_x100 / 100.0f;

    ESP_LOGI(TAG, "SENSOR_DATA base_id=%lu sensor_id=%lu temp=%.2fC hum=%.2f%% alerts=0x%02X uptime=%lus",
             (unsigned long)f->base_id,
             (unsigned long)f->sensor_id,
             temp_c,
             humidity_rh,
             pl.alert_flags,
             (unsigned long)pl.uptime_s);

    if (!sensor_configured) {
        controller_sensor_config_t cfg;
        get_remote_config_snapshot(&cfg);
        if (!backend_discovered) {
            ESP_LOGI(TAG, "Live sensor detected. Waiting for backend discovery acknowledgement before sending CONFIG_SET");
        } else if (cfg.has_active_config) {
            if (maybe_push_config_to_base(mac, f->base_id, f->sensor_id, false)) {
                ESP_LOGI(TAG, "Sensor wake detected while config is pending; sending CONFIG_SET and waiting for CONFIG_ACK");
            } else {
                ESP_LOGI(TAG, "CONFIG_SET already pending ACK; waiting before retry");
            }
        } else {
            ESP_LOGI(TAG, "Sensor wake detected but no active backend config exists yet; keeping sensor visible as not configured");
        }
    }

    set_latest_sht_sample(temp_c, humidity_rh);
}

static void handle_config_ack(const mproto_frame_t *f)
{
    if (f->payload_len != sizeof(mproto_ack_t)) {
        ESP_LOGW(TAG, "Bad CONFIG_ACK payload_len=%u", f->payload_len);
        return;
    }

    mproto_ack_t pl;
    memcpy(&pl, f->payload, sizeof(pl));

    ESP_LOGI(TAG, "CONFIG_ACK base_id=%lu sensor_id=%lu acked_seq=%lu acked_msg=%u status=%u detail=%s",
             (unsigned long)f->base_id,
             (unsigned long)f->sensor_id,
             (unsigned long)pl.acked_seq_num,
             pl.acked_msg_type,
             pl.status,
             pl.detail);

    mark_sensor_configured(pl.status == ACK_STATUS_OK);
    note_config_ack_result(pl.status == ACK_STATUS_OK);
    if (pl.status == ACK_STATUS_OK) {
        clear_latest_sht_sample();
    }
}

static void on_data_recv(const esp_now_recv_info_t *recv_info, const uint8_t *data, int len)
{
    if (!recv_info || !recv_info->src_addr || !data) {
        return;
    }

    /*
     * Safety gate: the controller must not accept discovery/readings until
     * the SIM800 PPP link is already connected. This prevents ESP-NOW traffic
     * from disturbing the modem connection phase.
     */
    if (!g_ppp_connected || !g_espnow_started) {
        return;
    }

    if (len != sizeof(mproto_frame_t)) {
        ESP_LOGW(TAG, "Unexpected len=%d expected=%d", len, (int)sizeof(mproto_frame_t));
        return;
    }

    add_peer_if_needed(recv_info->src_addr);

    mproto_frame_t f;
    memcpy(&f, data, sizeof(f));

    print_mac("RX FROM:", recv_info->src_addr);
    ESP_LOGI(TAG, "RX type=%u seq=%lu base_id=%lu sensor_id=%lu sensor_type=%u payload_len=%u",
             f.msg_type,
             (unsigned long)f.seq_num,
             (unsigned long)f.base_id,
             (unsigned long)f.sensor_id,
             f.sensor_type,
             f.payload_len);

    switch (f.msg_type) {
        case MSG_BASE_HELLO:
            handle_base_hello(recv_info->src_addr, &f);
            break;
        case MSG_MODULE_INFO:
            handle_module_info(recv_info->src_addr, &f);
            break;
        case MSG_SENSOR_DATA:
            handle_sensor_data(recv_info->src_addr, &f);
            break;
        case MSG_CONFIG_ACK:
            handle_config_ack(&f);
            break;
        default:
            ESP_LOGW(TAG, "Unhandled msg_type=%u", f.msg_type);
            break;
    }
}

/* =========================================================
 * ESP-NOW startup gate
 * ========================================================= */
static bool espnow_start_once(void)
{
    if (g_espnow_started) {
        return true;
    }

    if (!g_ppp_connected) {
        ESP_LOGW(TAG, "ESP-NOW start blocked because PPP is not connected yet");
        return false;
    }

    ESP_LOGI(TAG, "PPP is connected. Starting ESP-NOW now...");

    wifi_init_for_espnow();

    esp_err_t err = esp_now_init();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "esp_now_init failed: %s", esp_err_to_name(err));
        return false;
    }

    ESP_ERROR_CHECK(esp_now_register_send_cb(on_data_sent));
    ESP_ERROR_CHECK(esp_now_register_recv_cb(on_data_recv));
    add_broadcast_peer();

    g_espnow_started = true;
    ESP_LOGI(TAG, "ESP-NOW ready. Controller can now accept sensor broadcasts.");
    return true;
}

/* =========================================================
 * Uploader task
 * ========================================================= */
static void uploader_task(void *arg)
{
    uint32_t last_uploaded_rx_ms = 0;
    uint32_t last_attempted_rx_ms = 0;
    uint32_t last_upload_attempt_ms = 0;
    uint8_t discovery_transport_failures = 0;
    uint8_t upload_transport_failures = 0;

    while (1) {
        if (!ppp_ensure_connected()) {
            ESP_LOGW(TAG, "PPP not ready; retrying...");
            vTaskDelay(pdMS_TO_TICKS(IDLE_CHECK_MS));
            continue;
        }

        if (!sync_time_once()) {
            ESP_LOGW(TAG, "Real time not ready yet; retrying...");
            vTaskDelay(pdMS_TO_TICKS(IDLE_CHECK_MS));
            continue;
        }

        if (!espnow_start_once()) {
            ESP_LOGW(TAG, "ESP-NOW not ready yet; retrying...");
            vTaskDelay(pdMS_TO_TICKS(IDLE_CHECK_MS));
            continue;
        }

        bool sensor_configured = false;
        bool backend_discovered = false;
        bool have_sensor_state = get_sensor_state_snapshot(NULL, 0, NULL, NULL, &sensor_configured, &backend_discovered);
        controller_sensor_config_t remote_cfg;
        get_remote_config_snapshot(&remote_cfg);

        if (!have_sensor_state) {
            ESP_LOGI(TAG, "No live sensor discovered yet; waiting for controller discovery...");
            vTaskDelay(pdMS_TO_TICKS(IDLE_CHECK_MS));
            continue;
        }

        if (!backend_discovered) {
            int discovery_len = build_discovery_json(g_http_post_body, sizeof(g_http_post_body));
            if (discovery_len > 0) {
                ESP_LOGI(TAG, "Sending controller/sensor discovery so the sensor appears as not configured...");
                http_post_result_t discovery_result =
                    http_post_json_once_with_timeout(DISCOVERY_PATH, g_http_post_body, DISCOVERY_HTTP_TIMEOUT_MS);
                if (discovery_result.err == ESP_OK &&
                    discovery_result.status_code >= 200 &&
                    discovery_result.status_code < 300) {
                    discovery_transport_failures = 0;
                    mark_backend_discovered();
                    clear_latest_sht_sample();
                    ESP_LOGI(TAG, "Backend discovery completed");

                    mark_sensor_configured(false);
                    ESP_LOGI(TAG, "Backend discovery acknowledged. Moving to configuration stage before telemetry upload...");
                } else if (discovery_result.err != ESP_OK) {
                    discovery_transport_failures++;
                    ESP_LOGW(TAG,
                             "Discovery transport failed (%u/%d); controller will retry discovery with a fresh loop pass",
                             (unsigned int)discovery_transport_failures,
                             HTTP_MAX_ATTEMPTS);
                    resolve_telemetry_endpoint(true);
                    if (discovery_transport_failures >= HTTP_MAX_ATTEMPTS) {
                        force_ppp_reconnect("Discovery retries exhausted");
                        discovery_transport_failures = 0;
                    }
                } else if (discovery_result.status_code >= 500) {
                    ESP_LOGW(TAG,
                             "Discovery backend returned %d; will retry discovery soon",
                             discovery_result.status_code);
                } else {
                    ESP_LOGW(TAG,
                             "Discovery backend rejected request with status=%d; waiting for the next loop retry",
                             discovery_result.status_code);
                }
            }
            vTaskDelay(pdMS_TO_TICKS(SEND_RETRY_MS));
            continue;
        }

        maybe_refresh_sensor_config(get_config_poll_interval_ms(
            have_sensor_state,
            backend_discovered,
            sensor_configured,
            &remote_cfg
        ));
        get_remote_config_snapshot(&remote_cfg);

        if (!remote_cfg.has_active_config) {
            ESP_LOGI(TAG, "Sensor is discovered in backend and visible as not configured; waiting for an active time configuration before local apply and telemetry upload...");
            vTaskDelay(pdMS_TO_TICKS(IDLE_CHECK_MS));
            continue;
        }

        if (!sensor_configured) {
            if (remote_cfg.has_active_config) {
                maybe_push_config_to_known_bases(false);
                ESP_LOGI(TAG, "Active backend config available, waiting for local CONFIG_ACK before telemetry upload...");
            } else {
                ESP_LOGI(TAG, "Active backend config is not available yet; waiting...");
            }
            vTaskDelay(pdMS_TO_TICKS(IDLE_CHECK_MS));
            continue;
        }

        float temp_value;
        float humidity_value;
        uint32_t rx_ms;

        if (!get_latest_sht_sample(&temp_value, &humidity_value, &rx_ms)) {
            ESP_LOGI(TAG, "No SHT30 sample received yet; waiting...");
            vTaskDelay(pdMS_TO_TICKS(IDLE_CHECK_MS));
            continue;
        }

        if (rx_ms == last_uploaded_rx_ms) {
            vTaskDelay(pdMS_TO_TICKS(IDLE_CHECK_MS));
            continue;
        }

        uint32_t now_ms = ms_now();
        bool have_newer_pending_reading = (rx_ms != last_attempted_rx_ms);
        if (!have_newer_pending_reading &&
            last_upload_attempt_ms != 0 &&
            (now_ms - last_upload_attempt_ms) < TELEMETRY_RETRY_MS) {
            vTaskDelay(pdMS_TO_TICKS(IDLE_CHECK_MS));
            continue;
        }

        int n = build_payload_json(temp_value, humidity_value, g_http_post_body, sizeof(g_http_post_body));
        if (n > 0) {
            if (have_newer_pending_reading) {
                ESP_LOGI(TAG,
                         "Sending latest SHT30 sample temp=%.1f hum=%.1f (rx_ms=%lu)",
                         temp_value,
                         humidity_value,
                         (unsigned long)rx_ms);
            } else {
                ESP_LOGI(TAG,
                         "Retrying latest pending SHT30 sample temp=%.1f hum=%.1f (rx_ms=%lu)",
                         temp_value,
                         humidity_value,
                         (unsigned long)rx_ms);
            }

            last_attempted_rx_ms = rx_ms;
            last_upload_attempt_ms = now_ms;

            http_post_result_t upload_result =
                http_post_json_once_with_timeout(TELEMETRY_PATH, g_http_post_body, TELEMETRY_HTTP_TIMEOUT_MS);
            if (upload_result.err == ESP_OK && upload_result.status_code >= 200 && upload_result.status_code < 300) {
                last_uploaded_rx_ms = rx_ms;
                upload_transport_failures = 0;
            } else if (upload_result.err != ESP_OK) {
                upload_transport_failures++;
                ESP_LOGW(TAG,
                         "Telemetry transport failed for rx_ms=%lu (%u/%d); newer sensor readings may replace this pending retry",
                         (unsigned long)rx_ms,
                         (unsigned int)upload_transport_failures,
                         HTTP_MAX_ATTEMPTS);
                resolve_telemetry_endpoint(true);

                if (upload_transport_failures >= HTTP_MAX_ATTEMPTS) {
                    force_ppp_reconnect("Telemetry upload retries exhausted");
                    upload_transport_failures = 0;
                }
            } else if (upload_result.status_code >= 500) {
                ESP_LOGW(TAG,
                         "Telemetry backend returned %d for rx_ms=%lu; will retry the latest reading later",
                         upload_result.status_code,
                         (unsigned long)rx_ms);
            } else {
                ESP_LOGW(TAG,
                         "Telemetry backend rejected rx_ms=%lu with status=%d; dropping this reading and waiting for a newer sample",
                         (unsigned long)rx_ms,
                         upload_result.status_code);
                last_uploaded_rx_ms = rx_ms;
                upload_transport_failures = 0;
            }
        }

        vTaskDelay(pdMS_TO_TICKS(IDLE_CHECK_MS));
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

    s_event_group = xEventGroupCreate();
    init_remote_config_defaults();

    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, ESP_EVENT_ANY_ID, &on_ip_event, NULL));

    ESP_LOGI(TAG, "Wire SIM PWK to ESP32 GPIO%d for automatic startup", MODEM_PWRKEY_PIN);
    modem_pwrkey_init();
    modem_pwrkey_pulse();

    /*
     * Do NOT start ESP-NOW here.
     * ESP-NOW starts only after SIM800 PPP receives an IP address.
     */
    xTaskCreate(uploader_task, "uploader_task", 8192, NULL, 5, NULL);

    ESP_LOGI(TAG, "Controller booted");
    ESP_LOGI(TAG, "Startup order: SIM800 PPP first, ESP-NOW second");
    ESP_LOGI(TAG, "Hardcoded deviceId=%s", DEVICE_ID_STR);
    ESP_LOGI(TAG, "Derived sensorId=%s", get_backend_sensor_uid());
    ESP_LOGI(TAG, "Sequence: live sensor -> backend discovery -> local CONFIG_ACK -> telemetry upload");
    ESP_LOGI(TAG, "Uploading only the latest temperature and humidity reading pair after each confirmed sensor wake; stale retries are replaced by newer data");

    while (1) {
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}
