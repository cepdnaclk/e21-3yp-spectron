#pragma once
#include <stdbool.h>
#include <stdint.h>
#include "esp_err.h"
#include "protocol.h"
#define SENSOR_APP_I2C_SDA_GPIO 6
#define SENSOR_APP_I2C_SCL_GPIO 7
esp_err_t sensor_app_init(void);
bool sensor_app_ready(void);
const char *sensor_app_name(void);
uint8_t sensor_app_type(void);
uint8_t sensor_app_i2c_addr(void);
esp_err_t sensor_app_read_payload(uint8_t *payload, uint16_t *payload_len,
                                  int16_t temp_hi_x100, uint16_t hum_hi_x100);
