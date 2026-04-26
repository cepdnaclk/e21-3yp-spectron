#include <stdio.h>
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
#define SENSOR_ID_STR      "SEN-TH-001"
#define SENSOR_TYPE_STR    "temperature_humidity"

#define TELEMETRY_HOST     "spectron-backend-env.eba-niaes6bi.ap-south-1.elasticbeanstalk.com"
#define TELEMETRY_PATH     "/api/iot/upload"
#define TELEMETRY_URL      "http://" TELEMETRY_HOST TELEMETRY_PATH
#define SEND_PERIOD_MS     30000
#define SEND_RETRY_MS      5000
#define HTTP_TIMEOUT_MS    30000
#define HTTP_MAX_ATTEMPTS  3

/* =========================================================
 * ESP-NOW / controller config
 * ========================================================= */
#define WIFI_CHANNEL               1
#define MAX_BASES                  8

#define DEFAULT_CFG_SAMPLE_MS      2000
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

static base_record_t g_bases[MAX_BASES];
static uint32_t g_seq = 0;

/* =========================================================
 * Latest temperature cache
 * ========================================================= */
static portMUX_TYPE g_temp_lock = portMUX_INITIALIZER_UNLOCKED;
static bool g_have_latest_temp = false;
static float g_latest_temp_c = 0.0f;
static uint32_t g_latest_temp_rx_ms = 0;

/* =========================================================
 * PPP / HTTP globals
 * ========================================================= */
static esp_netif_t *g_ppp_netif = NULL;
static esp_modem_dce_t *g_dce = NULL;

static bool g_time_synced = false;
static bool g_sntp_inited = false;

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
static char g_telemetry_url[96];
static bool g_have_telemetry_ip = false;

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
    return (uint32_t)now;
}

static void clear_telemetry_endpoint_cache(void)
{
    g_have_telemetry_ip = false;
    g_telemetry_ip[0] = '\0';
    g_telemetry_url[0] = '\0';
}

static bool resolve_telemetry_endpoint(bool force_refresh)
{
    if (g_have_telemetry_ip && !force_refresh) {
        return true;
    }

    struct addrinfo hints = {
        .ai_family = AF_INET,
        .ai_socktype = SOCK_STREAM,
    };
    struct addrinfo *res = NULL;

    int err = getaddrinfo(TELEMETRY_HOST, NULL, &hints, &res);
    if (err != 0 || res == NULL) {
        ESP_LOGW(TAG, "Failed to resolve %s: getaddrinfo=%d", TELEMETRY_HOST, err);
        clear_telemetry_endpoint_cache();
        if (res != NULL) {
            freeaddrinfo(res);
        }
        return false;
    }

    struct sockaddr_in *addr = (struct sockaddr_in *)res->ai_addr;
    if (inet_ntoa_r(addr->sin_addr, g_telemetry_ip, sizeof(g_telemetry_ip)) == NULL) {
        ESP_LOGW(TAG, "Failed to format resolved IPv4 address for %s", TELEMETRY_HOST);
        freeaddrinfo(res);
        clear_telemetry_endpoint_cache();
        return false;
    }

    freeaddrinfo(res);

    snprintf(g_telemetry_url, sizeof(g_telemetry_url), "http://%s%s", g_telemetry_ip, TELEMETRY_PATH);
    g_have_telemetry_ip = true;

    ESP_LOGI(TAG, "Telemetry host %s resolved to %s", TELEMETRY_HOST, g_telemetry_ip);
    return true;
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

static void set_latest_temp(float temp_c)
{
    portENTER_CRITICAL(&g_temp_lock);
    g_latest_temp_c = temp_c;
    g_latest_temp_rx_ms = ms_now();
    g_have_latest_temp = true;
    portEXIT_CRITICAL(&g_temp_lock);
}

static bool get_latest_temp(float *temp_c, uint32_t *rx_ms)
{
    bool ok;

    portENTER_CRITICAL(&g_temp_lock);
    ok = g_have_latest_temp;
    if (ok) {
        *temp_c = g_latest_temp_c;
        *rx_ms = g_latest_temp_rx_ms;
    }
    portEXIT_CRITICAL(&g_temp_lock);

    return ok;
}

/* =========================================================
 * Time sync
 * ========================================================= */
static bool sync_time_once(void)
{
    if (g_time_synced) {
        return true;
    }

    if (!g_sntp_inited) {
        esp_sntp_config_t config = ESP_NETIF_SNTP_DEFAULT_CONFIG("pool.ntp.org");
        esp_netif_sntp_init(&config);
        g_sntp_inited = true;
    }

    ESP_LOGI(TAG, "Waiting for SNTP time sync...");

    if (esp_netif_sntp_sync_wait(pdMS_TO_TICKS(15000)) != ESP_OK) {
        ESP_LOGW(TAG, "SNTP sync timeout");
        return false;
    }

    time_t now = 0;
    time(&now);
    ESP_LOGI(TAG, "Time synced, epoch=%lld", (long long)now);

    g_time_synced = true;
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

static http_post_result_t http_post_json_once(const char *json_payload)
{
    memset(g_http_resp, 0, sizeof(g_http_resp));

    http_resp_ctx_t resp_ctx = {
        .buf = g_http_resp,
        .max_len = sizeof(g_http_resp),
        .cur_len = 0
    };

    const char *request_url = TELEMETRY_URL;
    if (resolve_telemetry_endpoint(false)) {
        request_url = g_telemetry_url;
    }

    esp_http_client_config_t config = {
        .url = request_url,
        .method = HTTP_METHOD_POST,
        .timeout_ms = HTTP_TIMEOUT_MS,
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

    if (g_have_telemetry_ip) {
        esp_http_client_set_header(client, "Host", TELEMETRY_HOST);
    }
    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_http_client_set_header(client, "Connection", "close");
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

static bool http_post_json(const char *json_payload)
{
    http_post_result_t result = {
        .err = ESP_FAIL,
        .status_code = 0,
    };

    for (int attempt = 1; attempt <= HTTP_MAX_ATTEMPTS; attempt++) {
        result = http_post_json_once(json_payload);
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

    return false;
}

/* =========================================================
 * JSON payload
 * ========================================================= */
static int build_payload_json(float temp_value, char *buf, size_t buf_len)
{
    return snprintf(
        buf, buf_len,
        "{"
          "\"deviceId\":\"" DEVICE_ID_STR "\","
          "\"ts\":%lu,"
          "\"sensors\":["
            "{"
              "\"id\":\"" SENSOR_ID_STR "\","
              "\"type\":\"" SENSOR_TYPE_STR "\","
              "\"v\":%.1f"
            "}"
          "]"
        "}",
        (unsigned long)ts_now_seconds(),
        temp_value
    );
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

static void send_config_set(const uint8_t *mac, uint32_t base_id, uint32_t sensor_id)
{
    mproto_config_set_t pl = {
        .sample_period_ms = DEFAULT_CFG_SAMPLE_MS,
        .temp_threshold_hi_x100 = DEFAULT_TEMP_HI_X100,
        .humidity_threshold_hi_x100 = DEFAULT_HUM_HI_X100,
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

    ESP_LOGI(TAG, "MODULE_INFO base_id=%lu sensor_id=%lu sensor_type=%u",
             (unsigned long)f->base_id,
             (unsigned long)f->sensor_id,
             f->sensor_type);

    send_module_ack(mac, f->base_id, f->sensor_id);
    send_config_set(mac, f->base_id, f->sensor_id);
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

    float temp_c = pl.temperature_c_x100 / 100.0f;

    ESP_LOGI(TAG, "SENSOR_DATA base_id=%lu sensor_id=%lu temp=%.2fC hum=%.2f%% alerts=0x%02X uptime=%lus",
             (unsigned long)f->base_id,
             (unsigned long)f->sensor_id,
             temp_c,
             pl.humidity_rh_x100 / 100.0f,
             pl.alert_flags,
             (unsigned long)pl.uptime_s);

    set_latest_temp(temp_c);
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
    while (1) {
        if (!ppp_ensure_connected()) {
            ESP_LOGW(TAG, "PPP not ready; retrying...");
            vTaskDelay(pdMS_TO_TICKS(5000));
            continue;
        }

        if (!espnow_start_once()) {
            ESP_LOGW(TAG, "ESP-NOW not ready yet; retrying...");
            vTaskDelay(pdMS_TO_TICKS(5000));
            continue;
        }

        if (!sync_time_once()) {
            ESP_LOGW(TAG, "Real time not ready yet; retrying...");
            vTaskDelay(pdMS_TO_TICKS(5000));
            continue;
        }

        float temp_value;
        uint32_t rx_ms;

        if (!get_latest_temp(&temp_value, &rx_ms)) {
            ESP_LOGI(TAG, "No temperature received yet; waiting...");
            vTaskDelay(pdMS_TO_TICKS(5000));
            continue;
        }

        int n = build_payload_json(temp_value, g_http_post_body, sizeof(g_http_post_body));
        if (n > 0) {
            ESP_LOGI(TAG, "Sending latest temperature v=%.1f", temp_value);
            if (!http_post_json(g_http_post_body)) {
                ESP_LOGW(TAG, "POST failed");
            }
        }

        vTaskDelay(pdMS_TO_TICKS(SEND_PERIOD_MS));
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
    ESP_LOGI(TAG, "Hardcoded sensorId=%s", SENSOR_ID_STR);
    ESP_LOGI(TAG, "Uploading only latest temperature every 30 seconds");

    while (1) {
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}
