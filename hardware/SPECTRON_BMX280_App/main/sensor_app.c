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

static const char *TAG="BMX280_APP";
#define BMX280_ADDR_PRIMARY 0x76
#define BMX280_ADDR_SECONDARY 0x77
#define BMX280_REG_CHIP_ID 0xD0
#define BMP280_CHIP_ID 0x58
#define BME280_CHIP_ID 0x60
static bool g_has_humidity=false;
typedef struct {
    uint16_t dig_T1;
    int16_t dig_T2;
    int16_t dig_T3;
    uint16_t dig_P1;
    int16_t dig_P2;
    int16_t dig_P3;
    int16_t dig_P4;
    int16_t dig_P5;
    int16_t dig_P6;
    int16_t dig_P7;
    int16_t dig_P8;
    int16_t dig_P9;
    uint8_t dig_H1;
    int16_t dig_H2;
    uint8_t dig_H3;
    int16_t dig_H4;
    int16_t dig_H5;
    int8_t dig_H6;
    int32_t t_fine;
    bool valid;
    bool has_humidity;
    uint8_t chip_id;
} bmx280_calib_t;
static bmx280_calib_t g_bmx280_calib = {0};
static uint16_t u16_le(const uint8_t *p)
{
    return (uint16_t)p[0] | ((uint16_t)p[1] << 8);
}
static int16_t s16_le(const uint8_t *p)
{
    return (int16_t)u16_le(p);
}
static int16_t sign_extend_12(uint16_t v)
{
    if (v & 0x0800u) {
        v |= 0xF000u;
    }
    return (int16_t)v;
}
static esp_err_t bmx280_read_calibration(uint8_t addr, bool has_humidity)
{
    uint8_t buf1[26] = {0};
    esp_err_t ret = i2c_read_regs8(addr, 0x88, buf1, sizeof(buf1));
    if (ret != ESP_OK) {
        ESP_LOGW(TAG,
                 "BMX280 calibration T/P read failed addr=0x%02X: %s",
                 addr,
                 esp_err_to_name(ret));
        return ret;
    }
    memset(&g_bmx280_calib, 0, sizeof(g_bmx280_calib));
    g_bmx280_calib.dig_T1 = u16_le(&buf1[0]);
    g_bmx280_calib.dig_T2 = s16_le(&buf1[2]);
    g_bmx280_calib.dig_T3 = s16_le(&buf1[4]);
    g_bmx280_calib.dig_P1 = u16_le(&buf1[6]);
    g_bmx280_calib.dig_P2 = s16_le(&buf1[8]);
    g_bmx280_calib.dig_P3 = s16_le(&buf1[10]);
    g_bmx280_calib.dig_P4 = s16_le(&buf1[12]);
    g_bmx280_calib.dig_P5 = s16_le(&buf1[14]);
    g_bmx280_calib.dig_P6 = s16_le(&buf1[16]);
    g_bmx280_calib.dig_P7 = s16_le(&buf1[18]);
    g_bmx280_calib.dig_P8 = s16_le(&buf1[20]);
    g_bmx280_calib.dig_P9 = s16_le(&buf1[22]);
    g_bmx280_calib.dig_H1 = buf1[25];
    g_bmx280_calib.has_humidity = has_humidity;
    if (has_humidity) {
        uint8_t buf2[7] = {0};
        ret = i2c_read_regs8(addr, 0xE1, buf2, sizeof(buf2));
        if (ret != ESP_OK) {
            ESP_LOGW(TAG,
                     "BME280 humidity calibration read failed addr=0x%02X: %s",
                     addr,
                     esp_err_to_name(ret));
            return ret;
        }
        g_bmx280_calib.dig_H2 = s16_le(&buf2[0]);
        g_bmx280_calib.dig_H3 = buf2[2];
        g_bmx280_calib.dig_H4 = sign_extend_12(((uint16_t)buf2[3] << 4) | (buf2[4] & 0x0F));
        g_bmx280_calib.dig_H5 = sign_extend_12(((uint16_t)buf2[5] << 4) | (buf2[4] >> 4));
        g_bmx280_calib.dig_H6 = (int8_t)buf2[6];
    }
    g_bmx280_calib.valid = true;
    return ESP_OK;
}
static esp_err_t bmx280_init_at_addr(uint8_t addr, bool *out_has_humidity)
{
    uint8_t chip_id = 0;
    esp_err_t ret = i2c_read_u8_reg8(addr, BMX280_REG_CHIP_ID, &chip_id);
    if (ret != ESP_OK) {
        ESP_LOGW(TAG,
                 "BMX280 probe failed addr=0x%02X: %s",
                 addr,
                 esp_err_to_name(ret));
        return ret;
    }
    ESP_LOGI(TAG,
             "BMX280 candidate addr=0x%02X chip_id=0x%02X",
             addr,
             chip_id);
    bool has_humidity = false;
    if (chip_id == BME280_CHIP_ID) {
        has_humidity = true;
    } else if (chip_id == BMP280_CHIP_ID) {
        has_humidity = false;
    } else {
        return ESP_FAIL;
    }
    /* Soft reset. */
    ret = i2c_write_reg8(addr, 0xE0, 0xB6);
    if (ret != ESP_OK) {
        return ret;
    }
    vTaskDelay(pdMS_TO_TICKS(10));
    ret = bmx280_read_calibration(addr, has_humidity);
    if (ret != ESP_OK) {
        return ret;
    }
    g_bmx280_calib.chip_id = chip_id;
    if (has_humidity) {
        /* BME280 only: humidity oversampling x1. Must be written before ctrl_meas. */
        ret = i2c_write_reg8(addr, 0xF2, 0x01);
        if (ret != ESP_OK) {
            return ret;
        }
    }
    /* config: standby 1000 ms, filter off. */
    ret = i2c_write_reg8(addr, 0xF5, 0xA0);
    if (ret != ESP_OK) {
        return ret;
    }
    /* ctrl_meas: temp x1, pressure x1, normal mode. */
    ret = i2c_write_reg8(addr, 0xF4, 0x27);
    if (ret != ESP_OK) {
        return ret;
    }
    vTaskDelay(pdMS_TO_TICKS(100));
    if (out_has_humidity != NULL) {
        *out_has_humidity = has_humidity;
    }
    ESP_LOGI(TAG,
             "%s initialized at addr=0x%02X",
             has_humidity ? "BME280" : "BMP280",
             addr);
    return ESP_OK;
}
static bool bmx280_detect(uint8_t *out_addr, bool *out_has_humidity)
{
    bool has_humidity = false;
    if (bmx280_init_at_addr(BMX280_ADDR_PRIMARY, &has_humidity) == ESP_OK) {
        if (out_addr != NULL) {
            *out_addr = BMX280_ADDR_PRIMARY;
        }
        if (out_has_humidity != NULL) {
            *out_has_humidity = has_humidity;
        }
        return true;
    }
    if (bmx280_init_at_addr(BMX280_ADDR_SECONDARY, &has_humidity) == ESP_OK) {
        if (out_addr != NULL) {
            *out_addr = BMX280_ADDR_SECONDARY;
        }
        if (out_has_humidity != NULL) {
            *out_has_humidity = has_humidity;
        }
        return true;
    }
    return false;
}
static int32_t bmx280_compensate_temperature_x100(int32_t adc_T)
{
    int32_t var1 = ((((adc_T >> 3) - ((int32_t)g_bmx280_calib.dig_T1 << 1))) *
                    ((int32_t)g_bmx280_calib.dig_T2)) >> 11;
    int32_t var2 = (((((adc_T >> 4) - ((int32_t)g_bmx280_calib.dig_T1)) *
                      ((adc_T >> 4) - ((int32_t)g_bmx280_calib.dig_T1))) >> 12) *
                    ((int32_t)g_bmx280_calib.dig_T3)) >> 14;
    g_bmx280_calib.t_fine = var1 + var2;
    return (g_bmx280_calib.t_fine * 5 + 128) >> 8;
}
static uint32_t bmx280_compensate_pressure_pa(int32_t adc_P)
{
    int64_t var1 = ((int64_t)g_bmx280_calib.t_fine) - 128000;
    int64_t var2 = var1 * var1 * (int64_t)g_bmx280_calib.dig_P6;
    var2 = var2 + ((var1 * (int64_t)g_bmx280_calib.dig_P5) << 17);
    var2 = var2 + (((int64_t)g_bmx280_calib.dig_P4) << 35);
    var1 = ((var1 * var1 * (int64_t)g_bmx280_calib.dig_P3) >> 8) +
           ((var1 * (int64_t)g_bmx280_calib.dig_P2) << 12);
    var1 = (((((int64_t)1) << 47) + var1)) *
           ((int64_t)g_bmx280_calib.dig_P1) >> 33;
    if (var1 == 0) {
        return 0;
    }
    int64_t p = 1048576 - adc_P;
    p = (((p << 31) - var2) * 3125) / var1;
    var1 = (((int64_t)g_bmx280_calib.dig_P9) * (p >> 13) * (p >> 13)) >> 25;
    var2 = (((int64_t)g_bmx280_calib.dig_P8) * p) >> 19;
    p = ((p + var1 + var2) >> 8) + (((int64_t)g_bmx280_calib.dig_P7) << 4);
    return (uint32_t)(p / 256);
}
static uint32_t bmx280_compensate_humidity_x100(int32_t adc_H)
{
    int32_t v_x1_u32r = g_bmx280_calib.t_fine - 76800;
    v_x1_u32r = (((((adc_H << 14) - (((int32_t)g_bmx280_calib.dig_H4) << 20) -
                    (((int32_t)g_bmx280_calib.dig_H5) * v_x1_u32r)) + 16384) >> 15) *
                  (((((((v_x1_u32r * ((int32_t)g_bmx280_calib.dig_H6)) >> 10) *
                       (((v_x1_u32r * ((int32_t)g_bmx280_calib.dig_H3)) >> 11) + 32768)) >> 10) +
                     2097152) * ((int32_t)g_bmx280_calib.dig_H2) + 8192) >> 14));
    v_x1_u32r = v_x1_u32r -
                (((((v_x1_u32r >> 15) * (v_x1_u32r >> 15)) >> 7) *
                  ((int32_t)g_bmx280_calib.dig_H1)) >> 4);
    if (v_x1_u32r < 0) {
        v_x1_u32r = 0;
    }
    if (v_x1_u32r > 419430400) {
        v_x1_u32r = 419430400;
    }
    uint32_t h_q10 = (uint32_t)(v_x1_u32r >> 12);
    return (h_q10 * 100u + 512u) / 1024u;
}
static esp_err_t bmx280_read(uint32_t *pressure_pa,
                             int16_t *temperature_c_x100,
                             uint16_t *humidity_rh_x100)
{
    if (!g_bmx280_calib.valid || pressure_pa == NULL ||
        temperature_c_x100 == NULL || humidity_rh_x100 == NULL) {
        return ESP_ERR_INVALID_STATE;
    }
    uint8_t rx[8] = {0};
    size_t read_len = g_bmx280_calib.has_humidity ? 8 : 6;
    esp_err_t ret = i2c_read_regs8(g_i2c_addr, 0xF7, rx, read_len);
    if (ret != ESP_OK) {
        return ret;
    }
    int32_t adc_P = (((int32_t)rx[0] << 12) | ((int32_t)rx[1] << 4) | ((int32_t)rx[2] >> 4));
    int32_t adc_T = (((int32_t)rx[3] << 12) | ((int32_t)rx[4] << 4) | ((int32_t)rx[5] >> 4));
    int32_t temp_x100 = bmx280_compensate_temperature_x100(adc_T);
    uint32_t press_pa = bmx280_compensate_pressure_pa(adc_P);
    uint32_t hum_x100 = 0;
    if (g_bmx280_calib.has_humidity) {
        int32_t adc_H = (((int32_t)rx[6] << 8) | rx[7]);
        hum_x100 = bmx280_compensate_humidity_x100(adc_H);
    }
    if (temp_x100 < INT16_MIN) {
        temp_x100 = INT16_MIN;
    }
    if (temp_x100 > INT16_MAX) {
        temp_x100 = INT16_MAX;
    }
    if (hum_x100 > 10000) {
        hum_x100 = 10000;
    }
    *temperature_c_x100 = (int16_t)temp_x100;
    *pressure_pa = press_pa;
    *humidity_rh_x100 = (uint16_t)hum_x100;
    return ESP_OK;
}

esp_err_t sensor_app_init(void){
    esp_err_t e=sensor_i2c_init_once();if(e!=ESP_OK){g_sensor_ready=false;return e;}uint8_t a=0;bool h=false;
    if(!bmx280_detect(&a,&h)){g_sensor_ready=false;g_i2c_addr=0;return ESP_ERR_NOT_FOUND;}
    g_i2c_addr=a;g_has_humidity=h;g_sensor_ready=true;ESP_LOGI(TAG,"%s ready at 0x%02X",h?"BME280":"BMP280",a);return ESP_OK;
}
bool sensor_app_ready(void){return g_sensor_ready;}
const char*sensor_app_name(void){return g_has_humidity?"BME280":"BMP280";}
uint8_t sensor_app_type(void){return SENSOR_TYPE_PRESSURE;}
uint8_t sensor_app_i2c_addr(void){return g_i2c_addr;}
esp_err_t sensor_app_read_payload(uint8_t*p,uint16_t*n,int16_t th,uint16_t hh){
    if(!g_sensor_ready||!p||!n)return ESP_ERR_INVALID_STATE;uint32_t pa=0;int16_t tc=0;uint16_t rh=0;esp_err_t e=bmx280_read(&pa,&tc,&rh);if(e!=ESP_OK)return e;
    if(g_has_humidity){mproto_bme280_data_t x={.pressure_pa=pa,.temperature_c_x100=tc,.humidity_rh_x100=rh,.uptime_s=esp_log_timestamp()/1000};if(tc>=th)x.alert_flags|=1;if(rh>=hh)x.alert_flags|=2;memcpy(p,&x,sizeof(x));*n=sizeof(x);ESP_LOGI(TAG,"BME280 %.2fhPa %.2fC %.2f%%",pa/100.0f,tc/100.0f,rh/100.0f);}else{mproto_pressure_data_t x={.pressure_pa=pa,.temperature_c_x100=tc,.uptime_s=esp_log_timestamp()/1000};if(tc>=th)x.alert_flags|=1;memcpy(p,&x,sizeof(x));*n=sizeof(x);ESP_LOGI(TAG,"BMP280 %.2fhPa %.2fC",pa/100.0f,tc/100.0f);}return ESP_OK;
}
