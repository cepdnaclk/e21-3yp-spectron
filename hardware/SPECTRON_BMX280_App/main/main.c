#include <stdint.h>
#include <stdbool.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "driver/gpio.h"
#include "esp_err.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_netif.h"
#include "esp_now.h"
#include "esp_wifi.h"
#include "nvs.h"
#include "nvs_flash.h"
#include "protocol.h"
#include "sensor_app.h"
static const char *TAG="BMX280_MODULE";
#define BASE_ID 0x0000B002u
#define ESPNOW_DEFAULT_CHANNEL 1
#define ESPNOW_MIN_CHANNEL 1
#define ESPNOW_MAX_CHANNEL 13
#define DISCOVERY_CHANNEL_DWELL_MS 350
#define MODULE_INFO_RETRY_MS 2000
#define HEARTBEAT_PERIOD_MS 10000
#define LINK_LOSS_TIMEOUT_MS 35000
#define LINK_FAILURE_THRESHOLD 3
#define ESPNOW_RX_QUEUE_LENGTH 8
#define MAIN_LOOP_TICK_MS 100
#define SENSOR_REDETECT_PERIOD_MS 5000
#define DIAGNOSTICS_PERIOD_MS 60000
#define DEFAULT_SAMPLE_PERIOD_MS 60000
#define MIN_SAMPLE_PERIOD_MS 5000
#define LED_SENSOR_CONNECTED_PIN 4
#define LED_DATA_SEND_PIN 5
#define DATA_LED_BLINK_MS 80
#define NVS_NS_MODULE "bmx280_cfg"
#define NVS_KEY_SAMPLE_MS "sample_ms"
#define NVS_KEY_TEMP_HI "temp_hi"
#define NVS_KEY_HUM_HI "hum_hi"
typedef struct{uint8_t src_mac[6];mproto_frame_t frame;}espnow_rx_item_t;
static volatile bool g_base_acked=false,g_module_acked=false,g_link_reset_requested=false;
static volatile uint32_t g_unicast_failure_count=0,g_last_unicast_success_ms=0,g_rx_queue_drop_count=0;
static uint8_t g_ctrl_mac[6]={0},g_current_channel=1,g_next_scan_channel=1;
static uint32_t g_seq=0,g_last_discovery_ms=0,g_last_module_info_ms=0,g_last_heartbeat_ms=0,g_last_data_ms=0,g_last_sensor_detect_ms=0,g_last_diagnostics_ms=0;
static QueueHandle_t g_espnow_rx_queue=NULL;
static uint32_t g_sample_period_ms=DEFAULT_SAMPLE_PERIOD_MS,g_sensor_id=0,g_module_crc32=0;
static int16_t g_temp_hi_x100=3500;static uint16_t g_hum_hi_x100=8500;
static uint32_t ms_now(void){return esp_log_timestamp();}
static bool mac_zero(const uint8_t*m){static const uint8_t z[6]={0};return !m||memcmp(m,z,6)==0;}
static bool mac_bcast(const uint8_t*m){static const uint8_t b[6]={255,255,255,255,255,255};return m&&memcmp(m,b,6)==0;}
static uint32_t sensor_id_make(uint8_t t,uint8_t a){uint8_t m[6]={0};esp_read_mac(m,ESP_MAC_WIFI_STA);uint32_t x=2166136261u;for(int i=0;i<6;i++){x^=m[i];x*=16777619u;}x^=t;x*=16777619u;x^=a;x*=16777619u;return 0x30000000u|(x&0x00FFFFFFu);}
static void leds_init(void){gpio_config_t c={.pin_bit_mask=(1ULL<<4)|(1ULL<<5),.mode=GPIO_MODE_OUTPUT,.pull_up_en=0,.pull_down_en=0,.intr_type=GPIO_INTR_DISABLE};ESP_ERROR_CHECK(gpio_config(&c));gpio_set_level(4,0);gpio_set_level(5,0);}
static void sensor_led(bool on){gpio_set_level(4,on?1:0);}static void blink(void){gpio_set_level(5,1);vTaskDelay(pdMS_TO_TICKS(DATA_LED_BLINK_MS));gpio_set_level(5,0);}
static void nvs_load(void){nvs_handle_t h;if(nvs_open(NVS_NS_MODULE,NVS_READONLY,&h)!=ESP_OK)return;uint32_t p=0;if(nvs_get_u32(h,NVS_KEY_SAMPLE_MS,&p)==ESP_OK&&p>=MIN_SAMPLE_PERIOD_MS)g_sample_period_ms=p;nvs_get_i16(h,NVS_KEY_TEMP_HI,&g_temp_hi_x100);nvs_get_u16(h,NVS_KEY_HUM_HI,&g_hum_hi_x100);nvs_close(h);}
static esp_err_t nvs_save(void){nvs_handle_t h;esp_err_t e=nvs_open(NVS_NS_MODULE,NVS_READWRITE,&h);if(e!=ESP_OK)return e;e=nvs_set_u32(h,NVS_KEY_SAMPLE_MS,g_sample_period_ms);if(e==ESP_OK)e=nvs_set_i16(h,NVS_KEY_TEMP_HI,g_temp_hi_x100);if(e==ESP_OK)e=nvs_set_u16(h,NVS_KEY_HUM_HI,g_hum_hi_x100);if(e==ESP_OK)e=nvs_commit(h);nvs_close(h);return e;}
static esp_err_t channel_set(uint8_t c){if(c<1||c>13)return ESP_ERR_INVALID_ARG;esp_err_t e=esp_wifi_set_channel(c,WIFI_SECOND_CHAN_NONE);if(e==ESP_OK)g_current_channel=c;return e;}
static void wifi_init(void){ESP_ERROR_CHECK(esp_netif_init());ESP_ERROR_CHECK(esp_event_loop_create_default());wifi_init_config_t c=WIFI_INIT_CONFIG_DEFAULT();ESP_ERROR_CHECK(esp_wifi_init(&c));ESP_ERROR_CHECK(esp_wifi_set_storage(WIFI_STORAGE_RAM));ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));ESP_ERROR_CHECK(esp_wifi_start());ESP_ERROR_CHECK(esp_wifi_set_ps(WIFI_PS_NONE));ESP_ERROR_CHECK(channel_set(1));}
static void bcast_peer(void){uint8_t b[6]={255,255,255,255,255,255};esp_now_peer_info_t p={0};memcpy(p.peer_addr,b,6);p.channel=0;p.ifidx=WIFI_IF_STA;p.encrypt=false;esp_err_t e=esp_now_add_peer(&p);if(e!=ESP_OK&&e!=ESP_ERR_ESPNOW_EXIST)ESP_ERROR_CHECK(e);}
static bool ctrl_peer(const uint8_t*m){if(esp_now_is_peer_exist(m))return true;esp_now_peer_info_t p={0};memcpy(p.peer_addr,m,6);p.channel=0;p.ifidx=WIFI_IF_STA;p.encrypt=false;esp_err_t e=esp_now_add_peer(&p);return e==ESP_OK||e==ESP_ERR_ESPNOW_EXIST;}
static void link_reset(const char*r){ESP_LOGW(TAG,"link reset: %s",r);if(!mac_zero(g_ctrl_mac)&&esp_now_is_peer_exist(g_ctrl_mac))esp_now_del_peer(g_ctrl_mac);memset(g_ctrl_mac,0,6);g_base_acked=g_module_acked=false;g_link_reset_requested=false;g_unicast_failure_count=0;g_last_unicast_success_ms=0;g_next_scan_channel=1;g_last_discovery_ms=g_last_module_info_ms=0;channel_set(1);}
static void sent_cb(const wifi_tx_info_t*i,esp_now_send_status_t s){if(!i||!i->des_addr||mac_bcast(i->des_addr))return;if(s==ESP_NOW_SEND_SUCCESS){g_last_unicast_success_ms=ms_now();g_unicast_failure_count=0;}else if(++g_unicast_failure_count>=LINK_FAILURE_THRESHOLD)g_link_reset_requested=true;}
static void hello(void){uint8_t mac[6]={0};esp_read_mac(mac,ESP_MAC_WIFI_STA);mproto_base_hello_t p={0};memcpy(p.base_mac,mac,6);p.fw_version=3;p.has_module=sensor_app_ready();mproto_frame_t f={0};f.msg_type=MSG_BASE_HELLO;f.sensor_type=sensor_app_ready()?sensor_app_type():SENSOR_TYPE_NONE;f.base_id=BASE_ID;f.sensor_id=sensor_app_ready()?g_sensor_id:0;f.payload_len=sizeof(p);f.seq_num=++g_seq;memcpy(f.payload,&p,sizeof(p));uint8_t b[6]={255,255,255,255,255,255};esp_now_send(b,(uint8_t*)&f,sizeof(f));ESP_LOGI(TAG,"HELLO ch=%u app=%s",g_current_channel,sensor_app_name());}
static void module_info(void){if(!g_base_acked||!sensor_app_ready())return;mproto_module_info_t p={0};strlcpy(p.sensor_name,sensor_app_name(),sizeof(p.sensor_name));p.module_crc32=g_module_crc32;p.sample_period_ms=g_sample_period_ms;p.temp_threshold_hi_x100=g_temp_hi_x100;p.humidity_threshold_hi_x100=g_hum_hi_x100;p.i2c_sda_gpio=6;p.i2c_scl_gpio=7;p.i2c_addr=sensor_app_i2c_addr();mproto_frame_t f={0};f.msg_type=MSG_MODULE_INFO;f.sensor_type=sensor_app_type();f.base_id=BASE_ID;f.sensor_id=g_sensor_id;f.payload_len=sizeof(p);f.seq_num=++g_seq;memcpy(f.payload,&p,sizeof(p));esp_now_send(g_ctrl_mac,(uint8_t*)&f,sizeof(f));}
static void config_ack(uint32_t q,uint8_t s,const char*d){mproto_ack_t p={.acked_seq_num=q,.acked_msg_type=MSG_CONFIG_SET,.status=s};strlcpy(p.detail,d,sizeof(p.detail));mproto_frame_t f={0};f.msg_type=MSG_CONFIG_ACK;f.sensor_type=sensor_app_type();f.base_id=BASE_ID;f.sensor_id=g_sensor_id;f.payload_len=sizeof(p);f.seq_num=++g_seq;memcpy(f.payload,&p,sizeof(p));esp_now_send(g_ctrl_mac,(uint8_t*)&f,sizeof(f));}
static void data_send(void){if(!g_module_acked||!sensor_app_ready())return;mproto_frame_t f={0};uint16_t n=0;esp_err_t e=sensor_app_read_payload(f.payload,&n,g_temp_hi_x100,g_hum_hi_x100);if(e!=ESP_OK){ESP_LOGW(TAG,"read failed: %s",esp_err_to_name(e));return;}f.msg_type=MSG_SENSOR_DATA;f.sensor_type=sensor_app_type();f.base_id=BASE_ID;f.sensor_id=g_sensor_id;f.payload_len=n;f.seq_num=++g_seq;e=esp_now_send(g_ctrl_mac,(uint8_t*)&f,sizeof(f));if(e==ESP_OK){blink();ESP_LOGI(TAG,"DATA app=%s seq=%lu",sensor_app_name(),(unsigned long)f.seq_num);}}
static void heartbeat(void){if(!g_module_acked||mac_zero(g_ctrl_mac))return;mproto_frame_t f={0};f.msg_type=MSG_HEARTBEAT;f.sensor_type=sensor_app_type();f.base_id=BASE_ID;f.sensor_id=g_sensor_id;f.seq_num=++g_seq;esp_now_send(g_ctrl_mac,(uint8_t*)&f,sizeof(f));}
static bool ack_ok(const mproto_frame_t*f,uint8_t t,bool sid){if(!f||f->payload_len!=sizeof(mproto_ack_t)||f->base_id!=BASE_ID||(sid&&f->sensor_id!=g_sensor_id))return false;mproto_ack_t a;memcpy(&a,f->payload,sizeof(a));return a.status==ACK_STATUS_OK&&a.acked_msg_type==t&&a.acked_seq_num;}
static void process(const espnow_rx_item_t*i){const mproto_frame_t*f=&i->frame;if(f->msg_type==MSG_BASE_ACK){if(!ack_ok(f,MSG_BASE_HELLO,false))return;memcpy(g_ctrl_mac,i->src_mac,6);if(!ctrl_peer(g_ctrl_mac)){link_reset("peer");return;}g_base_acked=true;g_module_acked=false;g_last_unicast_success_ms=ms_now();g_last_module_info_ms=0;ESP_LOGI(TAG,"BASE_ACK ch=%u",g_current_channel);}else if(f->msg_type==MSG_MODULE_ACK){if(!g_base_acked||memcmp(g_ctrl_mac,i->src_mac,6)||!ack_ok(f,MSG_MODULE_INFO,true))return;g_module_acked=true;g_last_unicast_success_ms=ms_now();g_last_heartbeat_ms=0;g_last_data_ms=ms_now()-g_sample_period_ms;ESP_LOGI(TAG,"MODULE_ACK %s",sensor_app_name());}else if(f->msg_type==MSG_CONFIG_SET){if(!g_base_acked||memcmp(g_ctrl_mac,i->src_mac,6))return;if(f->base_id!=BASE_ID||f->sensor_id!=g_sensor_id){config_ack(f->seq_num,ACK_STATUS_BAD_TARGET,"bad_target");return;}if(f->payload_len!=sizeof(mproto_config_set_t)){config_ack(f->seq_num,ACK_STATUS_BAD_PAYLOAD,"bad_payload");return;}mproto_config_set_t p;memcpy(&p,f->payload,sizeof(p));g_sample_period_ms=p.sample_period_ms>=MIN_SAMPLE_PERIOD_MS?p.sample_period_ms:MIN_SAMPLE_PERIOD_MS;g_temp_hi_x100=p.temp_threshold_hi_x100;g_hum_hi_x100=p.humidity_threshold_hi_x100;if(nvs_save()==ESP_OK)config_ack(f->seq_num,ACK_STATUS_OK,"applied");else config_ack(f->seq_num,ACK_STATUS_APPLY_FAIL,"nvs_fail");}}
static void recv_cb(const esp_now_recv_info_t*r,const uint8_t*d,int n){if(!r||!r->src_addr||!d||n!=sizeof(mproto_frame_t)||!g_espnow_rx_queue)return;espnow_rx_item_t i={0};memcpy(i.src_mac,r->src_addr,6);memcpy(&i.frame,d,sizeof(i.frame));if(xQueueSend(g_espnow_rx_queue,&i,0)!=pdTRUE)g_rx_queue_drop_count++;}
static void rx_task(void*a){(void)a;espnow_rx_item_t i;while(1)if(xQueueReceive(g_espnow_rx_queue,&i,portMAX_DELAY)==pdTRUE)process(&i);}
static void discovery(void){uint8_t c=g_next_scan_channel;if(channel_set(c)==ESP_OK)hello();if(++g_next_scan_channel>13)g_next_scan_channel=1;}
static bool ensure_sensor(void){if(sensor_app_ready())return true;if(sensor_app_init()!=ESP_OK){sensor_led(false);return false;}g_sensor_id=sensor_id_make(sensor_app_type(),sensor_app_i2c_addr());sensor_led(true);link_reset("sensor ready");return true;}
void app_main(void){esp_err_t e=nvs_flash_init();if(e==ESP_ERR_NVS_NO_FREE_PAGES||e==ESP_ERR_NVS_NEW_VERSION_FOUND){ESP_ERROR_CHECK(nvs_flash_erase());e=nvs_flash_init();}ESP_ERROR_CHECK(e);leds_init();nvs_load();if(sensor_app_init()==ESP_OK){g_sensor_id=sensor_id_make(sensor_app_type(),sensor_app_i2c_addr());sensor_led(true);}wifi_init();g_espnow_rx_queue=xQueueCreate(ESPNOW_RX_QUEUE_LENGTH,sizeof(espnow_rx_item_t));ESP_ERROR_CHECK(esp_now_init());ESP_ERROR_CHECK(esp_now_register_send_cb(sent_cb));ESP_ERROR_CHECK(esp_now_register_recv_cb(recv_cb));bcast_peer();xTaskCreate(rx_task,"espnow_rx",4096,NULL,5,NULL);ESP_LOGI(TAG,"%s app ready; default/active=%u/%lu ms",sensor_app_name(),DEFAULT_SAMPLE_PERIOD_MS,(unsigned long)g_sample_period_ms);link_reset("startup");while(1){uint32_t now=ms_now();if(g_link_reset_requested)link_reset("tx failures");if(!sensor_app_ready()&&(uint32_t)(now-g_last_sensor_detect_ms)>=SENSOR_REDETECT_PERIOD_MS){g_last_sensor_detect_ms=now;ensure_sensor();}if(!g_base_acked){if((uint32_t)(now-g_last_discovery_ms)>=DISCOVERY_CHANNEL_DWELL_MS){g_last_discovery_ms=now;discovery();}}else if(!g_module_acked){if(sensor_app_ready()&&(uint32_t)(now-g_last_module_info_ms)>=MODULE_INFO_RETRY_MS){g_last_module_info_ms=now;module_info();}}else{if(g_last_unicast_success_ms&&(uint32_t)(now-g_last_unicast_success_ms)>=LINK_LOSS_TIMEOUT_MS){link_reset("timeout");continue;}if((uint32_t)(now-g_last_heartbeat_ms)>=HEARTBEAT_PERIOD_MS){g_last_heartbeat_ms=now;heartbeat();}if((uint32_t)(now-g_last_data_ms)>=g_sample_period_ms){g_last_data_ms=now;data_send();}}if((uint32_t)(now-g_last_diagnostics_ms)>=DIAGNOSTICS_PERIOD_MS){g_last_diagnostics_ms=now;ESP_LOGI(TAG,"STATUS app=%s ch=%u ready=%d base=%d module=%d sample=%lu",sensor_app_name(),g_current_channel,sensor_app_ready(),g_base_acked,g_module_acked,(unsigned long)g_sample_period_ms);}vTaskDelay(pdMS_TO_TICKS(MAIN_LOOP_TICK_MS));}}
