#include <stdio.h>
#include <string.h>
#include <stdbool.h>
#include <stdint.h>
#include <ctype.h>

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
#include "esp_http_client.h"
#include "esp_crt_bundle.h"

#include "esp_modem_api.h"

#define MODEM_UART_NUM        UART_NUM_2
#define MODEM_TX_PIN          17
#define MODEM_RX_PIN          16
#define MODEM_PWRKEY_PIN      25
#define MODEM_RTS_PIN         UART_PIN_NO_CHANGE
#define MODEM_CTS_PIN         UART_PIN_NO_CHANGE
#define MODEM_DEFAULT_BAUD    9600

#define MODEM_APN             "ppwap"

#define RAW_BUF_SIZE          1024
#define RAW_RX_CHUNK          128
#define HTTP_RESP_BUF_SIZE    4096

#define HTTPS_GET_URL         "https://httpbin.org/get"
#define HTTPS_POST_URL        "https://httpbin.org/post"

static const char *TAG = "PPP_HTTPS_FULL";
static int s_detected_baud = MODEM_DEFAULT_BAUD;

/* Event bits */
static EventGroupHandle_t s_event_group;
#define PPP_CONNECTED_BIT     BIT0
#define PPP_DISCONNECTED_BIT  BIT1

/* Raw UART buffers */
static char g_rsp[RAW_BUF_SIZE];
static uint8_t g_rx_chunk[RAW_RX_CHUNK];
static char g_tx_buf[160];

typedef struct {
  int baud_rate;
  bool got_bytes;
  bool got_ok;
  bool got_error;
  bool echo_only;
  bool saw_unsolicited;
  char last_rsp[RAW_BUF_SIZE];
} uart_probe_result_t;

static const int s_probe_bauds[] = {9600, 115200, 57600, 38400, 19200, 4800};

/* HTTPS response buffer */
static char g_http_resp[HTTP_RESP_BUF_SIZE];

/* Response context for HTTP event handler */
typedef struct {
  char *buf;
  int max_len;
  int cur_len;
} http_resp_ctx_t;

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

/* ---------------------------------
   Raw UART phase
   --------------------------------- */
static void raw_uart_init(int baud_rate)
{
  const uart_config_t uart_config = {
    .baud_rate = baud_rate,
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

static void raw_save_last_rsp(char *dst, size_t dst_len)
{
  if (dst_len == 0) {
    return;
  }

  strlcpy(dst, g_rsp, dst_len);
}

static void raw_log_rsp(const char *label)
{
  ESP_LOGI(TAG, "%s\n%s", label, g_rsp);
  if (g_rsp[0] != '\0') {
    ESP_LOG_BUFFER_HEXDUMP(TAG, g_rsp, strlen(g_rsp), ESP_LOG_INFO);
  }
}

static bool raw_rsp_is_echo_only(const char *rsp)
{
  char compact[16];
  size_t used = 0;

  for (size_t i = 0; rsp[i] != '\0' && used + 1 < sizeof(compact); i++) {
    unsigned char ch = (unsigned char)rsp[i];
    if (!isspace(ch)) {
      compact[used++] = (char)toupper(ch);
    }
  }
  compact[used] = '\0';

  return (strcmp(compact, "AT") == 0 ||
          strcmp(compact, "ATOK") == 0);
}

static int raw_collect_for_ms(int timeout_ms)
{
  const int poll_ms = 250;
  int elapsed_ms = 0;
  int used = 0;

  raw_clear_rsp();
  uart_flush_input(MODEM_UART_NUM);

  while (elapsed_ms < timeout_ms) {
    int len = uart_read_bytes(MODEM_UART_NUM,
                              g_rx_chunk,
                              sizeof(g_rx_chunk),
                              pdMS_TO_TICKS(poll_ms));
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
  }

  return used;
}

static bool raw_send_text_wait_for(const char *tx_text,
                                   const char *display_cmd,
                                   const char *expect,
                                   int timeout_ms,
                                   bool *got_any_bytes,
                                   bool *got_error)
{
  int tx_len = snprintf(g_tx_buf, sizeof(g_tx_buf), "%s", tx_text);
  if (tx_len <= 0 || tx_len >= (int)sizeof(g_tx_buf)) {
    ESP_LOGE(TAG, "Command too long: %s", display_cmd);
    return false;
  }

  if (got_any_bytes) {
    *got_any_bytes = false;
  }
  if (got_error) {
    *got_error = false;
  }

  raw_clear_rsp();
  uart_flush_input(MODEM_UART_NUM);
  uart_write_bytes(MODEM_UART_NUM, g_tx_buf, tx_len);

  int used = raw_collect_for_ms(timeout_ms);

  ESP_LOGI(TAG, "CMD: %s", display_cmd);
  raw_log_rsp("RSP:");

  if (got_any_bytes) {
    *got_any_bytes = (used > 0);
  }

  if (strstr(g_rsp, "ERROR") != NULL || strstr(g_rsp, "+CME ERROR") != NULL) {
    if (got_error) {
      *got_error = true;
    }
    return false;
  }

  if (expect == NULL) {
    return (used > 0);
  }

  if (strstr(g_rsp, expect) != NULL) {
    return true;
  }

  return false;
}

static void raw_log_idle_uart_capture(int baud_rate)
{
  int used = raw_collect_for_ms(1500);
  if (used > 0) {
    ESP_LOGW(TAG, "Baud %d produced unsolicited UART bytes before AT", baud_rate);
    raw_log_rsp("UNSOLICITED:");
  }
}

static bool raw_try_sync_at_baud(int baud_rate, uart_probe_result_t *result)
{
  bool got_any_bytes = false;
  bool got_error = false;

  memset(result, 0, sizeof(*result));
  result->baud_rate = baud_rate;

  ESP_LOGI(TAG, "=== UART probe at %d baud ===", baud_rate);

  raw_uart_init(baud_rate);

  vTaskDelay(pdMS_TO_TICKS(2500));
  raw_log_idle_uart_capture(baud_rate);
  result->saw_unsolicited = (g_rsp[0] != '\0');

  vTaskDelay(pdMS_TO_TICKS(1200));
  uart_write_bytes(MODEM_UART_NUM, "+++", 3);
  vTaskDelay(pdMS_TO_TICKS(1200));
  uart_write_bytes(MODEM_UART_NUM, "ATH\r", 4);
  vTaskDelay(pdMS_TO_TICKS(600));
  raw_collect_for_ms(600);

  for (int i = 0; i < 3; i++) {
    if (raw_send_text_wait_for("AT\r", "AT<CR>", "OK", 2000, &got_any_bytes, &got_error)) {
      result->got_ok = true;
      break;
    }
    result->got_bytes = result->got_bytes || got_any_bytes;
    result->got_error = result->got_error || got_error;
    result->echo_only = result->echo_only || raw_rsp_is_echo_only(g_rsp);
    raw_save_last_rsp(result->last_rsp, sizeof(result->last_rsp));
    vTaskDelay(pdMS_TO_TICKS(1000));
  }

  if (!result->got_ok) {
    for (int i = 0; i < 2; i++) {
      if (raw_send_text_wait_for("AT\r\n", "AT<CR><LF>", "OK", 2000, &got_any_bytes, &got_error)) {
        result->got_ok = true;
        break;
      }
      result->got_bytes = result->got_bytes || got_any_bytes;
      result->got_error = result->got_error || got_error;
      result->echo_only = result->echo_only || raw_rsp_is_echo_only(g_rsp);
      raw_save_last_rsp(result->last_rsp, sizeof(result->last_rsp));
      vTaskDelay(pdMS_TO_TICKS(1000));
    }
  }

  if (result->got_ok) {
    ESP_LOGI(TAG, "Probe success at %d baud", baud_rate);
  } else if (result->echo_only) {
    ESP_LOGW(TAG, "Probe at %d baud saw echo-only response", baud_rate);
  } else if (result->got_bytes) {
    ESP_LOGW(TAG, "Probe at %d baud saw bytes but no OK/ERROR", baud_rate);
  } else {
    ESP_LOGW(TAG, "Probe at %d baud saw no UART response", baud_rate);
  }

  raw_uart_deinit();
  return result->got_ok;
}

static int raw_probe_modem_baud(void)
{
  int echo_only_count = 0;
  int bytes_no_ok_count = 0;

  ESP_LOGI(TAG, "Raw modem diagnostic phase...");

  for (size_t i = 0; i < sizeof(s_probe_bauds) / sizeof(s_probe_bauds[0]); i++) {
    uart_probe_result_t result;

    if (raw_try_sync_at_baud(s_probe_bauds[i], &result)) {
      return result.baud_rate;
    }

    if (result.echo_only) {
      echo_only_count++;
    } else if (result.got_bytes) {
      bytes_no_ok_count++;
    }
  }

  if (echo_only_count > 0) {
    ESP_LOGE(TAG,
             "All baud probes failed, but at least one baud showed echo-only bytes. "
             "That usually means the module hears UART traffic but is not fully started, "
             "is stuck in a bad power state, or the modem core is damaged.");
  } else if (bytes_no_ok_count > 0) {
    ESP_LOGE(TAG,
             "All baud probes failed, but some baud rates produced bytes without OK. "
             "That points to baud mismatch, logic-level issues, or a badly damaged UART path.");
  } else {
    ESP_LOGE(TAG,
             "All baud probes failed with no useful UART response. "
             "That points to missing power, missing common ground, wrong wiring, or a dead module.");
  }

  return -1;
}

static bool raw_modem_prepare(void)
{
  s_detected_baud = raw_probe_modem_baud();
  if (s_detected_baud <= 0) {
    return false;
  }

  raw_uart_init(s_detected_baud);

  if (!raw_send_text_wait_for("ATE0\r", "ATE0<CR>", "OK", 3000, NULL, NULL)) {
    ESP_LOGE(TAG, "ATE0 failed at detected baud %d", s_detected_baud);
    raw_uart_deinit();
    return false;
  }

  if (!raw_send_text_wait_for("ATI\r", "ATI<CR>", "OK", 3000, NULL, NULL)) {
    ESP_LOGW(TAG, "ATI did not return OK, continuing anyway");
  }

  if (!raw_send_text_wait_for("AT+CPIN?\r", "AT+CPIN?<CR>", "OK", 5000, NULL, NULL)) {
    ESP_LOGW(TAG, "CPIN query did not return OK");
  }

  if (!raw_send_text_wait_for("AT+CSQ\r", "AT+CSQ<CR>", "OK", 5000, NULL, NULL)) {
    ESP_LOGW(TAG, "CSQ query did not return OK");
  }

  if (!raw_send_text_wait_for("AT+CREG?\r", "AT+CREG?<CR>", "OK", 5000, NULL, NULL)) {
    ESP_LOGW(TAG, "CREG query did not return OK");
  }

  if (!raw_send_text_wait_for("AT+CGATT?\r", "AT+CGATT?<CR>", "+CGATT: 1", 5000, NULL, NULL)) {
    ESP_LOGE(TAG, "CGATT failed");
    raw_uart_deinit();
    return false;
  }

  snprintf(g_tx_buf, sizeof(g_tx_buf), "AT+CGDCONT=1,\"IP\",\"%s\"\r", MODEM_APN);
  if (!raw_send_text_wait_for(g_tx_buf, "AT+CGDCONT=<APN><CR>", "OK", 5000, NULL, NULL)) {
    ESP_LOGE(TAG, "CGDCONT failed");
    raw_uart_deinit();
    return false;
  }

  ESP_LOGI(TAG, "Raw AT precheck passed");
  raw_uart_deinit();
  return true;
}

/* ---------------------------------
   PPP event handling
   --------------------------------- */
static void on_ip_event(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data)
{
  if (event_base == IP_EVENT && event_id == IP_EVENT_PPP_GOT_IP) {
    ip_event_got_ip_t *event = (ip_event_got_ip_t *)event_data;
    const esp_netif_ip_info_t *ip_info = &event->ip_info;

    ESP_LOGI(TAG, "PPP got IP");
    ESP_LOGI(TAG, "IP      : " IPSTR, IP2STR(&ip_info->ip));
    ESP_LOGI(TAG, "Netmask : " IPSTR, IP2STR(&ip_info->netmask));
    ESP_LOGI(TAG, "Gateway : " IPSTR, IP2STR(&ip_info->gw));

    xEventGroupSetBits(s_event_group, PPP_CONNECTED_BIT);
  }

  if (event_base == IP_EVENT && event_id == IP_EVENT_PPP_LOST_IP) {
    ESP_LOGW(TAG, "PPP lost IP");
    xEventGroupSetBits(s_event_group, PPP_DISCONNECTED_BIT);
  }
}

/* ---------------------------------
   HTTP response event handler
   --------------------------------- */
static esp_err_t http_event_handler(esp_http_client_event_t *evt)
{
  http_resp_ctx_t *ctx = (http_resp_ctx_t *)evt->user_data;

  if (ctx == NULL) {
    return ESP_OK;
  }

  switch (evt->event_id) {
    case HTTP_EVENT_ON_DATA:
      if (evt->data && evt->data_len > 0) {
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
      break;

    default:
      break;
  }

  return ESP_OK;
}

/* ---------------------------------
   HTTPS GET
   --------------------------------- */
static bool https_get_test(void)
{
  memset(g_http_resp, 0, sizeof(g_http_resp));

  http_resp_ctx_t resp_ctx = {
    .buf = g_http_resp,
    .max_len = sizeof(g_http_resp),
    .cur_len = 0
  };

  esp_http_client_config_t config = {
    .url = HTTPS_GET_URL,
    .method = HTTP_METHOD_GET,
    .timeout_ms = 20000,
    .crt_bundle_attach = esp_crt_bundle_attach,
    .event_handler = http_event_handler,
    .user_data = &resp_ctx,
  };

  esp_http_client_handle_t client = esp_http_client_init(&config);
  if (client == NULL) {
    ESP_LOGE(TAG, "Failed to create HTTPS GET client");
    return false;
  }

  ESP_LOGI(TAG, "Sending HTTPS GET...");
  esp_err_t err = esp_http_client_perform(client);
  if (err != ESP_OK) {
    ESP_LOGE(TAG, "HTTPS GET failed: %s", esp_err_to_name(err));
    esp_http_client_cleanup(client);
    return false;
  }

  int status_code = esp_http_client_get_status_code(client);
  int content_length = esp_http_client_get_content_length(client);

  ESP_LOGI(TAG, "HTTPS GET status = %d", status_code);
  ESP_LOGI(TAG, "HTTPS GET response length = %d", content_length);
  ESP_LOGI(TAG, "HTTPS GET response body:\n%s", g_http_resp);

  esp_http_client_cleanup(client);
  return (status_code == 200);
}

/* ---------------------------------
   HTTPS POST
   --------------------------------- */
static bool https_post_test(void)
{
  const char *json_payload =
    "{\"device_id\":\"gateway_01\",\"temp\":29.5,\"gas\":120,\"battery\":3.95}";

  memset(g_http_resp, 0, sizeof(g_http_resp));

  http_resp_ctx_t resp_ctx = {
    .buf = g_http_resp,
    .max_len = sizeof(g_http_resp),
    .cur_len = 0
  };

  esp_http_client_config_t config = {
    .url = HTTPS_POST_URL,
    .method = HTTP_METHOD_POST,
    .timeout_ms = 20000,
    .crt_bundle_attach = esp_crt_bundle_attach,
    .event_handler = http_event_handler,
    .user_data = &resp_ctx,
  };

  esp_http_client_handle_t client = esp_http_client_init(&config);
  if (client == NULL) {
    ESP_LOGE(TAG, "Failed to create HTTPS POST client");
    return false;
  }

  esp_http_client_set_header(client, "Content-Type", "application/json");
  esp_http_client_set_post_field(client, json_payload, strlen(json_payload));

  ESP_LOGI(TAG, "Sending HTTPS POST...");
  esp_err_t err = esp_http_client_perform(client);
  if (err != ESP_OK) {
    ESP_LOGE(TAG, "HTTPS POST failed: %s", esp_err_to_name(err));
    esp_http_client_cleanup(client);
    return false;
  }

  int status_code = esp_http_client_get_status_code(client);
  int content_length = esp_http_client_get_content_length(client);

  ESP_LOGI(TAG, "HTTPS POST status = %d", status_code);
  ESP_LOGI(TAG, "HTTPS POST response length = %d", content_length);
  ESP_LOGI(TAG, "HTTPS POST response body:\n%s", g_http_resp);

  esp_http_client_cleanup(client);
  return (status_code == 200);
}

/* ---------------------------------
   Main
   --------------------------------- */
void app_main(void)
{
  ESP_LOGI(TAG, "PPP + HTTPS full test starting...");
  ESP_LOGI(TAG, "Wire SIM PWK to ESP32 GPIO%d for automatic startup", MODEM_PWRKEY_PIN);

  modem_pwrkey_init();
  modem_pwrkey_pulse();

  if (!raw_modem_prepare()) {
    ESP_LOGE(TAG, "Raw modem prepare failed");
    while (1) {
      vTaskDelay(pdMS_TO_TICKS(5000));
    }
  }

  s_event_group = xEventGroupCreate();

  ESP_ERROR_CHECK(esp_netif_init());
  ESP_ERROR_CHECK(esp_event_loop_create_default());
  ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, ESP_EVENT_ANY_ID, &on_ip_event, NULL));

  esp_netif_config_t netif_config = ESP_NETIF_DEFAULT_PPP();
  esp_netif_t *ppp_netif = esp_netif_new(&netif_config);
  if (ppp_netif == NULL) {
    ESP_LOGE(TAG, "Failed to create PPP netif");
    while (1) {
      vTaskDelay(pdMS_TO_TICKS(5000));
    }
  }

  esp_modem_dte_config_t dte_config = ESP_MODEM_DTE_DEFAULT_CONFIG();
  dte_config.uart_config.tx_io_num = MODEM_TX_PIN;
  dte_config.uart_config.rx_io_num = MODEM_RX_PIN;
  dte_config.uart_config.rts_io_num = MODEM_RTS_PIN;
  dte_config.uart_config.cts_io_num = MODEM_CTS_PIN;
  dte_config.uart_config.baud_rate = s_detected_baud;

  esp_modem_dce_config_t dce_config = ESP_MODEM_DCE_DEFAULT_CONFIG(MODEM_APN);

  ESP_LOGI(TAG, "Creating SIM800 modem object...");
  esp_modem_dce_t *dce = esp_modem_new_dev(
    ESP_MODEM_DCE_SIM800,
    &dte_config,
    &dce_config,
    ppp_netif
  );

  if (dce == NULL) {
    ESP_LOGE(TAG, "Failed to create modem object");
    while (1) {
      vTaskDelay(pdMS_TO_TICKS(5000));
    }
  }

  vTaskDelay(pdMS_TO_TICKS(1000));

  ESP_LOGI(TAG, "Switching modem to DATA mode...");
  esp_err_t err = esp_modem_set_mode(dce, ESP_MODEM_MODE_DATA);
  if (err != ESP_OK) {
    ESP_LOGE(TAG, "Failed to set modem data mode: %s", esp_err_to_name(err));
    while (1) {
      vTaskDelay(pdMS_TO_TICKS(5000));
    }
  }

  ESP_LOGI(TAG, "Waiting for PPP IP...");
  EventBits_t bits = xEventGroupWaitBits(
    s_event_group,
    PPP_CONNECTED_BIT,
    pdFALSE,
    pdFALSE,
    pdMS_TO_TICKS(60000)
  );

  if (bits & PPP_CONNECTED_BIT) {
    ESP_LOGI(TAG, "PPP is up, starting HTTPS GET...");
    if (https_get_test()) {
      ESP_LOGI(TAG, "HTTPS GET passed");
    } else {
      ESP_LOGE(TAG, "HTTPS GET failed");
    }

    ESP_LOGI(TAG, "Starting HTTPS POST...");
    if (https_post_test()) {
      ESP_LOGI(TAG, "HTTPS POST passed");
    } else {
      ESP_LOGE(TAG, "HTTPS POST failed");
    }
  } else {
    ESP_LOGE(TAG, "PPP connection timeout");
  }

  while (1) {
    vTaskDelay(pdMS_TO_TICKS(1000));
  }
}
