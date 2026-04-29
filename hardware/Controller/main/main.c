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
#define MAX_TRACKED_SENSORS        40
#define SENSOR_OFFLINE_MS          90000

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
    uint8_t mac[6];
    uint32_t base_id;
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

typedef struct {
    bool in_use;
    uint8_t mac[6];
    uint32_t base_id;
    uint32_t sensor_id;
    uint8_t sensor_type;
    char sensor_name[MPROTO_SENSOR_NAME_LEN];

    bool have_module_info;
    bool backend_discovered;
    bool configured;
    uint32_t last_seen_ms;

    controller_sensor_config_t remote_cfg;
    uint32_t last_config_poll_ms;
    uint32_t last_config_push_ms;
    bool waiting_for_config_ack;
    char pending_config_id[64];

    bool have_latest_sample;
    float latest_temp_c;
    float latest_humidity_rh;
    uint32_t latest_rx_ms;
    uint32_t last_uploaded_rx_ms;
    uint32_t last_attempted_rx_ms;
    uint32_t last_upload_attempt_ms;
    uint8_t discovery_transport_failures;
    uint8_t upload_transport_failures;

    char backend_sensor_uid[96];
    bool backend_sensor_uid_ready;
} controller_sensor_state_t;

static base_record_t g_bases[MAX_BASES];
static controller_sensor_state_t g_sensor_states[MAX_TRACKED_SENSORS];
static uint32_t g_seq = 0;
static portMUX_TYPE g_sensor_state_lock = portMUX_INITIALIZER_UNLOCKED;

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

static bool send_config_set(const uint8_t *mac, uint32_t base_id, uint32_t sensor_id);
static void force_ppp_reconnect(const char *reason);
static const char *sensor_identity_to_backend_type(uint32_t sensor_id, const char *sensor_name, uint8_t sensor_type);

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
            return "temperature_humidity";
        case SENSOR_TYPE_BME280:
            return "bme280";
        case SENSOR_TYPE_BMP280:
            return "bmp280";
        case SENSOR_TYPE_VL53L0X:
            return "vl53l0x";
        default:
            return "unknown";
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
    switch (sensor_type) {
        case SENSOR_TYPE_BME280:
            return "bme280";
        case SENSOR_TYPE_BMP280:
            return "bmp280";
        case SENSOR_TYPE_VL53L0X:
            return "vl53l0x";
        case SENSOR_TYPE_SHT30:
            return "temperature_humidity";
        default:
            break;
    }

    switch (sensor_id & 0xFFFFFF00u) {
        case 0x00002800u:
            return "bme280";
        case 0x00002900u:
            return "bmp280";
        case 0x00003000u:
            return "temperature_humidity";
        case 0x00005300u:
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

static void init_remote_config_defaults(controller_sensor_config_t *cfg)
{
    memset(cfg, 0, sizeof(*cfg));
    cfg->valid = true;
    cfg->has_active_config = false;
    cfg->sample_period_ms = DEFAULT_CFG_SAMPLE_MS;
    cfg->temp_threshold_hi_x100 = DEFAULT_TEMP_HI_X100;
    cfg->humidity_threshold_hi_x100 = DEFAULT_HUM_HI_X100;
    strlcpy(cfg->config_id, "boot-default", sizeof(cfg->config_id));
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

static uint32_t get_config_poll_interval_ms(const controller_sensor_config_t *cfg, bool backend_discovered, bool sensor_configured)
{
    if (cfg == NULL || !backend_discovered || !cfg->has_active_config || !sensor_configured) {
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

static int find_sensor_state_idx(const uint8_t *mac, uint32_t sensor_id)
{
    for (int i = 0; i < MAX_TRACKED_SENSORS; i++) {
        if (g_sensor_states[i].in_use &&
            g_sensor_states[i].sensor_id == sensor_id &&
            memcmp(g_sensor_states[i].mac, mac, 6) == 0) {
            return i;
        }
    }
    return -1;
}

static int alloc_sensor_state_idx(const uint8_t *mac,
                                  uint32_t base_id,
                                  uint32_t sensor_id,
                                  uint8_t sensor_type,
                                  const char *sensor_name)
{
    int free_idx = -1;
    int reclaim_idx = -1;
    uint32_t now_ms = ms_now();

    portENTER_CRITICAL(&g_sensor_state_lock);
    for (int i = 0; i < MAX_TRACKED_SENSORS; i++) {
        if (g_sensor_states[i].in_use &&
            g_sensor_states[i].sensor_id == sensor_id &&
            memcmp(g_sensor_states[i].mac, mac, 6) == 0) {
            g_sensor_states[i].base_id = base_id;
            g_sensor_states[i].sensor_type = sensor_type;
            g_sensor_states[i].last_seen_ms = ms_now();
            if (sensor_name && sensor_name[0] != '\0') {
                strlcpy(g_sensor_states[i].sensor_name, sensor_name, sizeof(g_sensor_states[i].sensor_name));
            }
            portEXIT_CRITICAL(&g_sensor_state_lock);
            return i;
        }

        if (!g_sensor_states[i].in_use && free_idx < 0) {
            free_idx = i;
        } else if (g_sensor_states[i].in_use &&
                   reclaim_idx < 0 &&
                   g_sensor_states[i].last_seen_ms != 0 &&
                   (now_ms - g_sensor_states[i].last_seen_ms) > SENSOR_OFFLINE_MS) {
            reclaim_idx = i;
        }
    }

    if (free_idx < 0 && reclaim_idx >= 0) {
        free_idx = reclaim_idx;
    }

    if (free_idx >= 0) {
        memset(&g_sensor_states[free_idx], 0, sizeof(g_sensor_states[free_idx]));
        g_sensor_states[free_idx].in_use = true;
        memcpy(g_sensor_states[free_idx].mac, mac, 6);
        g_sensor_states[free_idx].base_id = base_id;
        g_sensor_states[free_idx].sensor_id = sensor_id;
        g_sensor_states[free_idx].sensor_type = sensor_type;
        g_sensor_states[free_idx].last_seen_ms = ms_now();
        init_remote_config_defaults(&g_sensor_states[free_idx].remote_cfg);
        if (sensor_name && sensor_name[0] != '\0') {
            strlcpy(g_sensor_states[free_idx].sensor_name, sensor_name, sizeof(g_sensor_states[free_idx].sensor_name));
        } else {
            strlcpy(g_sensor_states[free_idx].sensor_name, SENSOR_NAME_STR, sizeof(g_sensor_states[free_idx].sensor_name));
        }
    }
    portEXIT_CRITICAL(&g_sensor_state_lock);

    return free_idx;
}

static bool get_sensor_snapshot(int idx, controller_sensor_state_t *out)
{
    if (idx < 0 || idx >= MAX_TRACKED_SENSORS || out == NULL) {
        return false;
    }

    portENTER_CRITICAL(&g_sensor_state_lock);
    if (!g_sensor_states[idx].in_use) {
        portEXIT_CRITICAL(&g_sensor_state_lock);
        return false;
    }
    *out = g_sensor_states[idx];
    portEXIT_CRITICAL(&g_sensor_state_lock);
    return true;
}

static bool is_sensor_online(const controller_sensor_state_t *sensor, uint32_t now_ms)
{
    return sensor != NULL &&
           sensor->in_use &&
           sensor->last_seen_ms != 0 &&
           (now_ms - sensor->last_seen_ms) <= SENSOR_OFFLINE_MS;
}

static void make_backend_sensor_uid(const controller_sensor_state_t *sensor, char *buf, size_t buf_len)
{
    char device_token[48] = {0};
    size_t used = 0;

    if (sensor == NULL || buf == NULL || buf_len == 0) {
        return;
    }

    for (const char *p = DEVICE_ID_STR; *p != '\0' && used < sizeof(device_token) - 1; ++p) {
        char ch = *p;
        if (ch >= 'A' && ch <= 'Z') {
            ch = (char)(ch - 'A' + 'a');
        }
        if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '-') {
            device_token[used++] = ch;
        }
    }
    if (used == 0) {
        strlcpy(device_token, "controller", sizeof(device_token));
    }

    snprintf(buf,
             buf_len,
             "%s-base-%02x%02x%02x%02x%02x%02x-sensor-%s-%04lx",
             device_token,
             sensor->mac[0],
             sensor->mac[1],
             sensor->mac[2],
             sensor->mac[3],
             sensor->mac[4],
             sensor->mac[5],
             backend_type_uid_token(sensor_identity_to_backend_type(sensor->sensor_id, sensor->sensor_name, sensor->sensor_type)),
             (unsigned long)(sensor->sensor_id & 0xFFFFu));
}

static void make_backend_sidecar_uid(const controller_sensor_state_t *sensor,
                                     const char *suffix,
                                     char *buf,
                                     size_t buf_len)
{
    make_backend_sensor_uid(sensor, buf, buf_len);
    strlcat(buf, suffix, buf_len);
}

static bool update_sensor_remote_config(int idx,
                                        const char *config_id,
                                        bool has_active_config,
                                        uint32_t sample_period_ms,
                                        int16_t temp_threshold_hi_x100,
                                        uint16_t humidity_threshold_hi_x100)
{
    bool changed = false;

    portENTER_CRITICAL(&g_sensor_state_lock);
    if (!g_sensor_states[idx].in_use ||
        !g_sensor_states[idx].remote_cfg.valid ||
        g_sensor_states[idx].remote_cfg.has_active_config != has_active_config ||
        g_sensor_states[idx].remote_cfg.sample_period_ms != sample_period_ms ||
        g_sensor_states[idx].remote_cfg.temp_threshold_hi_x100 != temp_threshold_hi_x100 ||
        g_sensor_states[idx].remote_cfg.humidity_threshold_hi_x100 != humidity_threshold_hi_x100 ||
        strncmp(g_sensor_states[idx].remote_cfg.config_id, config_id, sizeof(g_sensor_states[idx].remote_cfg.config_id)) != 0) {
        changed = true;
        g_sensor_states[idx].remote_cfg.valid = true;
        g_sensor_states[idx].remote_cfg.has_active_config = has_active_config;
        g_sensor_states[idx].remote_cfg.sample_period_ms = sample_period_ms;
        g_sensor_states[idx].remote_cfg.temp_threshold_hi_x100 = temp_threshold_hi_x100;
        g_sensor_states[idx].remote_cfg.humidity_threshold_hi_x100 = humidity_threshold_hi_x100;
        strlcpy(g_sensor_states[idx].remote_cfg.config_id, config_id, sizeof(g_sensor_states[idx].remote_cfg.config_id));
    }
    portEXIT_CRITICAL(&g_sensor_state_lock);

    return changed;
}

static void note_config_push_sent_for_sensor(int idx, const char *config_id, uint32_t now_ms)
{
    portENTER_CRITICAL(&g_sensor_state_lock);
    if (g_sensor_states[idx].in_use) {
        g_sensor_states[idx].last_config_push_ms = now_ms;
        g_sensor_states[idx].waiting_for_config_ack = true;
        if (config_id && config_id[0] != '\0') {
            strlcpy(g_sensor_states[idx].pending_config_id, config_id, sizeof(g_sensor_states[idx].pending_config_id));
        } else {
            g_sensor_states[idx].pending_config_id[0] = '\0';
        }
    }
    portEXIT_CRITICAL(&g_sensor_state_lock);
}

static bool is_config_retry_due_for_sensor(const controller_sensor_state_t *sensor, uint32_t now_ms, bool force)
{
    return force ||
           !sensor->waiting_for_config_ack ||
           sensor->last_config_push_ms == 0 ||
           (now_ms - sensor->last_config_push_ms) >= CONFIG_PUSH_RETRY_MS;
}

static void note_config_ack_result_for_sensor(int idx, bool success)
{
    portENTER_CRITICAL(&g_sensor_state_lock);
    if (g_sensor_states[idx].in_use) {
        if (success) {
            g_sensor_states[idx].configured = true;
            g_sensor_states[idx].waiting_for_config_ack = false;
            g_sensor_states[idx].last_config_push_ms = 0;
            g_sensor_states[idx].pending_config_id[0] = '\0';
        } else {
            g_sensor_states[idx].configured = false;
            g_sensor_states[idx].waiting_for_config_ack = true;
        }
        g_sensor_states[idx].have_latest_sample = false;
        g_sensor_states[idx].latest_rx_ms = 0;
    }
    portEXIT_CRITICAL(&g_sensor_state_lock);
}

static void mark_sensor_backend_discovered(int idx)
{
    portENTER_CRITICAL(&g_sensor_state_lock);
    if (g_sensor_states[idx].in_use) {
        g_sensor_states[idx].backend_discovered = true;
        g_sensor_states[idx].configured = false;
        g_sensor_states[idx].have_latest_sample = false;
        g_sensor_states[idx].latest_rx_ms = 0;
        g_sensor_states[idx].discovery_transport_failures = 0;
    }
    portEXIT_CRITICAL(&g_sensor_state_lock);
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
static int build_config_pull_json(const controller_sensor_state_t *sensor, char *buf, size_t buf_len)
{
    char sensor_uid[96];

    if (sensor == NULL || !sensor->in_use) {
        return -1;
    }

    make_backend_sensor_uid(sensor, sensor_uid, sizeof(sensor_uid));

    return snprintf(
        buf, buf_len,
        "{"
          "\"deviceId\":\"" DEVICE_ID_STR "\","
          "\"sensorId\":\"%s\","
          "\"sensorType\":\"%s\""
        "}",
        sensor_uid,
        sensor_identity_to_backend_type(sensor->sensor_id, sensor->sensor_name, sensor->sensor_type)
    );
}

static int build_payload_json(const controller_sensor_state_t *sensor,
                              float temp_value,
                              float humidity_value,
                              char *buf,
                              size_t buf_len)
{
    char sensor_uid[96];
    char sidecar_sensor_uid[112];
    const char *backend_type;

    if (sensor == NULL || !sensor->in_use) {
        return -1;
    }

    make_backend_sensor_uid(sensor, sensor_uid, sizeof(sensor_uid));
    backend_type = sensor_identity_to_backend_type(sensor->sensor_id, sensor->sensor_name, sensor->sensor_type);

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
            sensor_uid,
            humidity_value
        );
    }

    if (strcmp(backend_type, "bme280") == 0 || strcmp(backend_type, "bmp280") == 0) {
        make_backend_sidecar_uid(sensor, PRESSURE_UID_SUFFIX, sidecar_sensor_uid, sizeof(sidecar_sensor_uid));
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
                  "\"type\":\"pressure\","
                  "\"v\":%.1f"
                "}"
              "]"
            "}",
            (unsigned long)ts_now_seconds(),
            sensor_uid,
            backend_type,
            temp_value,
            sidecar_sensor_uid,
            humidity_value
        );
    }

    make_backend_sidecar_uid(sensor, HUMIDITY_UID_SUFFIX, sidecar_sensor_uid, sizeof(sidecar_sensor_uid));
    return snprintf(
        buf, buf_len,
        "{"
          "\"deviceId\":\"" DEVICE_ID_STR "\","
          "\"ts\":%lu,"
          "\"sensors\":["
            "{"
              "\"id\":\"%s\","
              "\"type\":\"temperature_humidity\","
              "\"v\":%.1f"
            "},"
            "{"
              "\"id\":\"%s\","
              "\"type\":\"humidity\","
              "\"v\":%.1f"
            "}"
          "]"
        "}",
        (unsigned long)ts_now_seconds(),
        sensor_uid,
        temp_value,
        sidecar_sensor_uid,
        humidity_value
    );
}

static int build_discovery_json(const controller_sensor_state_t *sensor, char *buf, size_t buf_len)
{
    char sensor_uid[96];
    char sidecar_sensor_uid[112];
    const char *backend_type;

    if (sensor == NULL || !sensor->in_use) {
        return -1;
    }

    make_backend_sensor_uid(sensor, sensor_uid, sizeof(sensor_uid));
    backend_type = sensor_identity_to_backend_type(sensor->sensor_id, sensor->sensor_name, sensor->sensor_type);

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
            sensor_uid,
            normalize_backend_sensor_name(sensor->sensor_name)
        );
    }

    if (strcmp(backend_type, "bme280") == 0 || strcmp(backend_type, "bmp280") == 0) {
        make_backend_sidecar_uid(sensor, PRESSURE_UID_SUFFIX, sidecar_sensor_uid, sizeof(sidecar_sensor_uid));
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
                  "\"id\":\"%s\","
                  "\"type\":\"pressure\","
                  "\"name\":\"Pressure\","
                  "\"unit\":\"kPa\""
                "}"
              "]"
            "}",
            (unsigned long)ts_now_seconds(),
            sensor_uid,
            backend_type,
            normalize_backend_sensor_name(sensor->sensor_name),
            backend_type_primary_unit(backend_type),
            sidecar_sensor_uid
        );
    }

    make_backend_sidecar_uid(sensor, HUMIDITY_UID_SUFFIX, sidecar_sensor_uid, sizeof(sidecar_sensor_uid));
    return snprintf(
        buf, buf_len,
        "{"
          "\"deviceId\":\"" DEVICE_ID_STR "\","
          "\"ts\":%lu,"
          "\"sensors\":["
            "{"
              "\"id\":\"%s\","
              "\"type\":\"temperature_humidity\","
              "\"name\":\"%s\","
              "\"unit\":\"C/%RH\""
            "},"
            "{"
              "\"id\":\"%s\","
              "\"type\":\"humidity\","
              "\"name\":\"Humidity\","
              "\"unit\":\"%RH\""
            "}"
          "]"
        "}",
        (unsigned long)ts_now_seconds(),
        sensor_uid,
        normalize_backend_sensor_name(sensor->sensor_name),
        sidecar_sensor_uid
    );
}

static bool maybe_refresh_sensor_config(int idx, const controller_sensor_state_t *sensor)
{
    uint32_t now_ms = ms_now();
    uint32_t min_interval_ms = get_config_poll_interval_ms(&sensor->remote_cfg, sensor->backend_discovered, sensor->configured);

    if (sensor->last_config_poll_ms != 0 && (now_ms - sensor->last_config_poll_ms) < min_interval_ms) {
        return false;
    }

    if (build_config_pull_json(sensor, g_http_post_body, sizeof(g_http_post_body)) <= 0) {
        return false;
    }

    portENTER_CRITICAL(&g_sensor_state_lock);
    if (g_sensor_states[idx].in_use) {
        g_sensor_states[idx].last_config_poll_ms = now_ms;
    }
    portEXIT_CRITICAL(&g_sensor_state_lock);

    ESP_LOGI(TAG, "Polling backend for sensor_id=%lu current config...", (unsigned long)sensor->sensor_id);
    if (!http_post_json(CONFIG_PATH, g_http_post_body)) {
        ESP_LOGW(TAG, "Config pull failed for sensor_id=%lu; keeping cached config", (unsigned long)sensor->sensor_id);
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
        ESP_LOGW(TAG, "Config pull response missing required fields for sensor_id=%lu",
                 (unsigned long)sensor->sensor_id);
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

    bool changed = update_sensor_remote_config(
        idx,
        config_id,
        has_active_config,
        (uint32_t)sample_period_ms,
        (int16_t)temp_hi_x100,
        (uint16_t)humidity_hi_x100
    );

    if (changed) {
        ESP_LOGI(TAG,
                 "Cached config updated for sensor_id=%lu id=%s active=%u sample=%lu temp_hi=%.2f hum_hi=%.2f",
                 (unsigned long)sensor->sensor_id,
                 config_id,
                 has_active_config ? 1 : 0,
                 (unsigned long)sample_period_ms,
                 temp_hi_x100 / 100.0,
                 humidity_hi_x100 / 100.0);
        portENTER_CRITICAL(&g_sensor_state_lock);
        if (g_sensor_states[idx].in_use) {
            g_sensor_states[idx].configured = false;
            g_sensor_states[idx].waiting_for_config_ack = false;
            g_sensor_states[idx].last_config_push_ms = 0;
            g_sensor_states[idx].pending_config_id[0] = '\0';
        }
        portEXIT_CRITICAL(&g_sensor_state_lock);
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
    int sensor_idx = find_sensor_state_idx(mac, sensor_id);
    controller_sensor_state_t sensor;

    if (!get_sensor_snapshot(sensor_idx, &sensor)) {
        ESP_LOGW(TAG, "send_config_set skipped because sensor state is missing for sensor_id=%lu",
                 (unsigned long)sensor_id);
        return false;
    }

    controller_sensor_config_t cfg = sensor.remote_cfg;
    if (!cfg.has_active_config) {
        return false;
    }

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

    int base_idx = alloc_base_slot(mac);
    if (base_idx < 0) {
        ESP_LOGE(TAG, "No free base slots");
        return;
    }

    g_bases[base_idx].base_id = f->base_id;
    g_bases[base_idx].last_seen_ms = ms_now();

    mproto_module_info_t pl;
    memcpy(&pl, f->payload, sizeof(pl));

    int sensor_idx = alloc_sensor_state_idx(mac, f->base_id, f->sensor_id, f->sensor_type, pl.sensor_name);
    if (sensor_idx < 0) {
        ESP_LOGE(TAG, "No free sensor slots");
        return;
    }

    portENTER_CRITICAL(&g_sensor_state_lock);
    if (g_sensor_states[sensor_idx].in_use) {
        g_sensor_states[sensor_idx].have_module_info = true;
        g_sensor_states[sensor_idx].configured = false;
        g_sensor_states[sensor_idx].last_seen_ms = ms_now();
    }
    portEXIT_CRITICAL(&g_sensor_state_lock);

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

    int base_idx = alloc_base_slot(mac);
    if (base_idx < 0) {
        return;
    }

    mproto_sht30_data_t pl;
    memcpy(&pl, f->payload, sizeof(pl));

    g_bases[base_idx].base_id = f->base_id;
    g_bases[base_idx].last_seen_ms = ms_now();

    int sensor_idx = alloc_sensor_state_idx(mac, f->base_id, f->sensor_id, f->sensor_type, SENSOR_NAME_STR);
    if (sensor_idx < 0) {
        ESP_LOGE(TAG, "No free sensor slots");
        return;
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

    controller_sensor_state_t sensor;
    if (!get_sensor_snapshot(sensor_idx, &sensor)) {
        return;
    }

    portENTER_CRITICAL(&g_sensor_state_lock);
    if (g_sensor_states[sensor_idx].in_use) {
        g_sensor_states[sensor_idx].latest_temp_c = temp_c;
        g_sensor_states[sensor_idx].latest_humidity_rh = humidity_rh;
        g_sensor_states[sensor_idx].latest_rx_ms = ms_now();
        g_sensor_states[sensor_idx].have_latest_sample = true;
        g_sensor_states[sensor_idx].last_seen_ms = ms_now();
    }
    portEXIT_CRITICAL(&g_sensor_state_lock);

    if (!sensor.configured) {
        if (!sensor.backend_discovered) {
            ESP_LOGI(TAG, "Live sensor detected. Waiting for backend discovery acknowledgement before sending CONFIG_SET");
        } else if (sensor.remote_cfg.has_active_config) {
            if (is_config_retry_due_for_sensor(&sensor, ms_now(), false) && send_config_set(mac, f->base_id, f->sensor_id)) {
                note_config_push_sent_for_sensor(sensor_idx, sensor.remote_cfg.config_id, ms_now());
                ESP_LOGI(TAG, "Sensor wake detected while config is pending; sending CONFIG_SET and waiting for CONFIG_ACK");
            } else {
                ESP_LOGI(TAG, "CONFIG_SET already pending ACK; waiting before retry");
            }
        } else {
            ESP_LOGI(TAG, "Sensor wake detected but no active backend config exists yet; keeping sensor visible as not configured");
        }
    }
}

static void handle_config_ack(const uint8_t *mac, const mproto_frame_t *f)
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

    int sensor_idx = find_sensor_state_idx(mac, f->sensor_id);
    if (sensor_idx >= 0) {
        note_config_ack_result_for_sensor(sensor_idx, pl.status == ACK_STATUS_OK);
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
            handle_config_ack(recv_info->src_addr, &f);
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

        uint32_t now_ms = ms_now();
        bool have_online_sensor = false;
        bool action_taken = false;

        for (int idx = 0; idx < MAX_TRACKED_SENSORS; idx++) {
            controller_sensor_state_t sensor;
            if (!get_sensor_snapshot(idx, &sensor) || !is_sensor_online(&sensor, now_ms)) {
                continue;
            }

            have_online_sensor = true;

            if (!sensor.backend_discovered) {
                int discovery_len = build_discovery_json(&sensor, g_http_post_body, sizeof(g_http_post_body));
                if (discovery_len <= 0) {
                    continue;
                }

                ESP_LOGI(TAG,
                         "Sending controller/sensor discovery for sensor_id=%lu name=%s",
                         (unsigned long)sensor.sensor_id,
                         sensor.sensor_name);

                http_post_result_t discovery_result =
                    http_post_json_once_with_timeout(DISCOVERY_PATH, g_http_post_body, DISCOVERY_HTTP_TIMEOUT_MS);

                if (discovery_result.err == ESP_OK &&
                    discovery_result.status_code >= 200 &&
                    discovery_result.status_code < 300) {
                    mark_sensor_backend_discovered(idx);
                    ESP_LOGI(TAG, "Backend discovery completed for sensor_id=%lu", (unsigned long)sensor.sensor_id);
                    portENTER_CRITICAL(&g_sensor_state_lock);
                    if (g_sensor_states[idx].in_use) {
                        g_sensor_states[idx].discovery_transport_failures = 0;
                    }
                    portEXIT_CRITICAL(&g_sensor_state_lock);
                } else if (discovery_result.err != ESP_OK) {
                    portENTER_CRITICAL(&g_sensor_state_lock);
                    if (g_sensor_states[idx].in_use) {
                        g_sensor_states[idx].discovery_transport_failures++;
                        ESP_LOGW(TAG,
                                 "Discovery transport failed for sensor_id=%lu (%u/%d)",
                                 (unsigned long)sensor.sensor_id,
                                 (unsigned int)g_sensor_states[idx].discovery_transport_failures,
                                 HTTP_MAX_ATTEMPTS);
                        if (g_sensor_states[idx].discovery_transport_failures >= HTTP_MAX_ATTEMPTS) {
                            g_sensor_states[idx].discovery_transport_failures = 0;
                            portEXIT_CRITICAL(&g_sensor_state_lock);
                            force_ppp_reconnect("Discovery retries exhausted");
                            action_taken = true;
                            break;
                        }
                    }
                    portEXIT_CRITICAL(&g_sensor_state_lock);
                    resolve_telemetry_endpoint(true);
                } else if (discovery_result.status_code >= 500) {
                    ESP_LOGW(TAG,
                             "Discovery backend returned %d for sensor_id=%lu; will retry",
                             discovery_result.status_code,
                             (unsigned long)sensor.sensor_id);
                } else {
                    ESP_LOGW(TAG,
                             "Discovery backend rejected sensor_id=%lu with status=%d",
                             (unsigned long)sensor.sensor_id,
                             discovery_result.status_code);
                }

                action_taken = true;
                break;
            }
        }

        if (!have_online_sensor) {
            ESP_LOGI(TAG, "No live sensor discovered yet; waiting for controller discovery...");
            vTaskDelay(pdMS_TO_TICKS(IDLE_CHECK_MS));
            continue;
        }

        if (action_taken) {
            vTaskDelay(pdMS_TO_TICKS(SEND_RETRY_MS));
            continue;
        }

        for (int idx = 0; idx < MAX_TRACKED_SENSORS; idx++) {
            controller_sensor_state_t sensor;
            if (!get_sensor_snapshot(idx, &sensor) || !is_sensor_online(&sensor, now_ms) || !sensor.backend_discovered) {
                continue;
            }

            maybe_refresh_sensor_config(idx, &sensor);
            if (!get_sensor_snapshot(idx, &sensor)) {
                continue;
            }

            if (!sensor.remote_cfg.has_active_config) {
                continue;
            }

            if (!sensor.configured) {
                if (is_config_retry_due_for_sensor(&sensor, now_ms, false) &&
                    send_config_set(sensor.mac, sensor.base_id, sensor.sensor_id)) {
                    note_config_push_sent_for_sensor(idx, sensor.remote_cfg.config_id, now_ms);
                    ESP_LOGI(TAG,
                             "Active backend config available; waiting for CONFIG_ACK on sensor_id=%lu",
                             (unsigned long)sensor.sensor_id);
                    action_taken = true;
                    break;
                }
            }
        }

        if (action_taken) {
            vTaskDelay(pdMS_TO_TICKS(IDLE_CHECK_MS));
            continue;
        }

        for (int idx = 0; idx < MAX_TRACKED_SENSORS; idx++) {
            controller_sensor_state_t sensor;
            if (!get_sensor_snapshot(idx, &sensor) ||
                !is_sensor_online(&sensor, now_ms) ||
                !sensor.backend_discovered ||
                !sensor.configured ||
                !sensor.have_latest_sample) {
                continue;
            }

            if (sensor.latest_rx_ms == sensor.last_uploaded_rx_ms) {
                continue;
            }

            bool have_newer_pending_reading = (sensor.latest_rx_ms != sensor.last_attempted_rx_ms);
            if (!have_newer_pending_reading &&
                sensor.last_upload_attempt_ms != 0 &&
                (now_ms - sensor.last_upload_attempt_ms) < TELEMETRY_RETRY_MS) {
                continue;
            }

            int n = build_payload_json(&sensor,
                                       sensor.latest_temp_c,
                                       sensor.latest_humidity_rh,
                                       g_http_post_body,
                                       sizeof(g_http_post_body));
            if (n <= 0) {
                continue;
            }

            if (have_newer_pending_reading) {
                ESP_LOGI(TAG,
                         "Sending latest sample sensor_id=%lu temp=%.1f hum=%.1f (rx_ms=%lu)",
                         (unsigned long)sensor.sensor_id,
                         sensor.latest_temp_c,
                         sensor.latest_humidity_rh,
                         (unsigned long)sensor.latest_rx_ms);
            } else {
                ESP_LOGI(TAG,
                         "Retrying latest pending sample sensor_id=%lu temp=%.1f hum=%.1f (rx_ms=%lu)",
                         (unsigned long)sensor.sensor_id,
                         sensor.latest_temp_c,
                         sensor.latest_humidity_rh,
                         (unsigned long)sensor.latest_rx_ms);
            }

            portENTER_CRITICAL(&g_sensor_state_lock);
            if (g_sensor_states[idx].in_use) {
                g_sensor_states[idx].last_attempted_rx_ms = sensor.latest_rx_ms;
                g_sensor_states[idx].last_upload_attempt_ms = now_ms;
            }
            portEXIT_CRITICAL(&g_sensor_state_lock);

            http_post_result_t upload_result =
                http_post_json_once_with_timeout(TELEMETRY_PATH, g_http_post_body, TELEMETRY_HTTP_TIMEOUT_MS);
            if (upload_result.err == ESP_OK && upload_result.status_code >= 200 && upload_result.status_code < 300) {
                portENTER_CRITICAL(&g_sensor_state_lock);
                if (g_sensor_states[idx].in_use) {
                    g_sensor_states[idx].last_uploaded_rx_ms = sensor.latest_rx_ms;
                    g_sensor_states[idx].upload_transport_failures = 0;
                }
                portEXIT_CRITICAL(&g_sensor_state_lock);
            } else if (upload_result.err != ESP_OK) {
                bool reconnect_needed = false;
                portENTER_CRITICAL(&g_sensor_state_lock);
                if (g_sensor_states[idx].in_use) {
                    g_sensor_states[idx].upload_transport_failures++;
                    ESP_LOGW(TAG,
                             "Telemetry transport failed sensor_id=%lu (%u/%d); newer readings may replace this retry",
                             (unsigned long)sensor.sensor_id,
                             (unsigned int)g_sensor_states[idx].upload_transport_failures,
                             HTTP_MAX_ATTEMPTS);
                    if (g_sensor_states[idx].upload_transport_failures >= HTTP_MAX_ATTEMPTS) {
                        g_sensor_states[idx].upload_transport_failures = 0;
                        reconnect_needed = true;
                    }
                }
                portEXIT_CRITICAL(&g_sensor_state_lock);
                resolve_telemetry_endpoint(true);

                if (reconnect_needed) {
                    force_ppp_reconnect("Telemetry upload retries exhausted");
                }
            } else if (upload_result.status_code >= 500) {
                ESP_LOGW(TAG,
                         "Telemetry backend returned %d for sensor_id=%lu rx_ms=%lu; will retry later",
                         upload_result.status_code,
                         (unsigned long)sensor.sensor_id,
                         (unsigned long)sensor.latest_rx_ms);
            } else {
                ESP_LOGW(TAG,
                         "Telemetry backend rejected sensor_id=%lu rx_ms=%lu with status=%d; dropping this reading",
                         (unsigned long)sensor.sensor_id,
                         (unsigned long)sensor.latest_rx_ms,
                         upload_result.status_code);
                portENTER_CRITICAL(&g_sensor_state_lock);
                if (g_sensor_states[idx].in_use) {
                    g_sensor_states[idx].last_uploaded_rx_ms = sensor.latest_rx_ms;
                    g_sensor_states[idx].upload_transport_failures = 0;
                }
                portEXIT_CRITICAL(&g_sensor_state_lock);
            }

            action_taken = true;
            break;
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
    ESP_LOGI(TAG, "Sequence: per-sensor live data -> backend discovery -> per-sensor CONFIG_ACK -> per-sensor telemetry upload");
    ESP_LOGI(TAG, "Controller now tracks independent discovery/config/upload state for each payload sensor slot");

    while (1) {
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}
