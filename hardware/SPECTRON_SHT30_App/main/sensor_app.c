#include <stdint.h>
#include <stdbool.h>
#include <string.h>
#include <math.h>
#include <limits.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/i2c.h"
#include "esp_err.h"
#include "esp_log.h"
#include "sensor_app.h"
#define I2C_PORT I2C_NUM_0
#define I2C_FREQ_HZ 100000
static uint8_t g_i2c_addr=0;
static bool g_sensor_ready=false;
static bool g_i2c_initialized=false;
static esp_err_t sensor_i2c_init_once(void){
    if(g_i2c_initialized) return ESP_OK;
    i2c_config_t c={.mode=I2C_MODE_MASTER,.sda_io_num=SENSOR_APP_I2C_SDA_GPIO,
        .scl_io_num=SENSOR_APP_I2C_SCL_GPIO,.sda_pullup_en=GPIO_PULLUP_ENABLE,
        .scl_pullup_en=GPIO_PULLUP_ENABLE,.master.clk_speed=I2C_FREQ_HZ,.clk_flags=0};
    esp_err_t e=i2c_param_config(I2C_PORT,&c); if(e!=ESP_OK) return e;
    e=i2c_driver_install(I2C_PORT,c.mode,0,0,0); if(e==ESP_ERR_INVALID_STATE)e=ESP_OK;
    if(e==ESP_OK) g_i2c_initialized=true; return e;
}
static esp_err_t i2c_read_regs8(uint8_t a,uint8_t r,uint8_t*d,size_t n){return i2c_master_write_read_device(I2C_PORT,a,&r,1,d,n,pdMS_TO_TICKS(1000));}
static esp_err_t i2c_write_reg8(uint8_t a,uint8_t r,uint8_t v){uint8_t t[2]={r,v};return i2c_master_write_to_device(I2C_PORT,a,t,2,pdMS_TO_TICKS(1000));}
static esp_err_t i2c_read_u8_reg8(uint8_t a,uint8_t r,uint8_t*v){return i2c_read_regs8(a,r,v,1);}

static const char *TAG="SHT30_APP";
#define SHT30_ADDR_PRIMARY 0x44
#define SHT30_ADDR_SECONDARY 0x45
static uint8_t sht30_crc8(const uint8_t *data, int len)
{
    uint8_t crc = 0xFF;
    for (int i = 0; i < len; i++) {
        crc ^= data[i];
        for (int j = 0; j < 8; j++) {
            if (crc & 0x80) {
                crc = (uint8_t)((crc << 1) ^ 0x31);
            } else {
                crc <<= 1;
            }
        }
    }
    return crc;
}
static esp_err_t sht30_read_from_addr(uint8_t addr, float *temperature_c, float *humidity_rh)
{
    if (temperature_c == NULL || humidity_rh == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    uint8_t cmd[2] = {0x24, 0x00};
    uint8_t rx[6] = {0};
    esp_err_t ret = i2c_master_write_to_device(
        I2C_PORT,
        addr,
        cmd,
        sizeof(cmd),
        pdMS_TO_TICKS(1000)
    );
    if (ret != ESP_OK) {
        return ret;
    }
    vTaskDelay(pdMS_TO_TICKS(25));
    ret = i2c_master_read_from_device(
        I2C_PORT,
        addr,
        rx,
        sizeof(rx),
        pdMS_TO_TICKS(1000)
    );
    if (ret != ESP_OK) {
        return ret;
    }
    if (sht30_crc8(&rx[0], 2) != rx[2]) {
        return ESP_FAIL;
    }
    if (sht30_crc8(&rx[3], 2) != rx[5]) {
        return ESP_FAIL;
    }
    uint16_t raw_t = ((uint16_t)rx[0] << 8) | rx[1];
    uint16_t raw_h = ((uint16_t)rx[3] << 8) | rx[4];
    *temperature_c = -45.0f + 175.0f * ((float)raw_t / 65535.0f);
    *humidity_rh = 100.0f * ((float)raw_h / 65535.0f);
    return ESP_OK;
}
static bool sht30_detect(uint8_t *out_addr)
{
    float t = 0.0f;
    float h = 0.0f;
    if (sht30_read_from_addr(SHT30_ADDR_PRIMARY, &t, &h) == ESP_OK) {
        *out_addr = SHT30_ADDR_PRIMARY;
        return true;
    }
    if (sht30_read_from_addr(SHT30_ADDR_SECONDARY, &t, &h) == ESP_OK) {
        *out_addr = SHT30_ADDR_SECONDARY;
        return true;
    }
    return false;
}
static esp_err_t sht30_read(float *temperature_c, float *humidity_rh)
{
    esp_err_t ret = sht30_read_from_addr(g_i2c_addr, temperature_c, humidity_rh);
    if (ret == ESP_OK) {
        return ESP_OK;
    }
    uint8_t alt_addr = (g_i2c_addr == SHT30_ADDR_PRIMARY)
                       ? SHT30_ADDR_SECONDARY
                       : SHT30_ADDR_PRIMARY;
    ret = sht30_read_from_addr(alt_addr, temperature_c, humidity_rh);
    if (ret == ESP_OK) {
        ESP_LOGW(TAG, "SHT30 moved/found at alternate addr=0x%02X", alt_addr);
        g_i2c_addr = alt_addr;
    }
    return ret;
}

esp_err_t sensor_app_init(void){
    esp_err_t e=sensor_i2c_init_once(); if(e!=ESP_OK){g_sensor_ready=false;return e;}
    uint8_t a=0; if(!sht30_detect(&a)){g_sensor_ready=false;g_i2c_addr=0;return ESP_ERR_NOT_FOUND;}
    g_i2c_addr=a;g_sensor_ready=true;ESP_LOGI(TAG,"SHT30 ready at 0x%02X",a);return ESP_OK;
}
bool sensor_app_ready(void){return g_sensor_ready;}
const char*sensor_app_name(void){return "SHT30";}
uint8_t sensor_app_type(void){return SENSOR_TYPE_SHT30;}
uint8_t sensor_app_i2c_addr(void){return g_i2c_addr;}
esp_err_t sensor_app_read_payload(uint8_t*p,uint16_t*n,int16_t th,uint16_t hh){
    if(!g_sensor_ready||!p||!n)return ESP_ERR_INVALID_STATE;float t=0,h=0;esp_err_t e=sht30_read(&t,&h);if(e!=ESP_OK)return e;
    mproto_sht30_data_t x={.temperature_c_x100=(int16_t)lroundf(t*100),.humidity_rh_x100=(uint16_t)lroundf(h*100),.uptime_s=esp_log_timestamp()/1000};
    if(x.temperature_c_x100>=th)x.alert_flags|=1;if(x.humidity_rh_x100>=hh)x.alert_flags|=2;
    memcpy(p,&x,sizeof(x));*n=sizeof(x);ESP_LOGI(TAG,"temp=%.2fC hum=%.2f%%",t,h);return ESP_OK;
}
