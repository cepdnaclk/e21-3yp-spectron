#pragma once

#include "protocol.h"

/* ============================================================
 * Sensor module identity
 * Change these when preparing another I2C sensor module.
 * ============================================================ */

#define MODULE_SENSOR_ID        0x00003001u
#define MODULE_SENSOR_TYPE      SENSOR_TYPE_SHT30
#define MODULE_SENSOR_NAME      "SHT30"

/* ============================================================
 * I2C settings
 * These are the I2C pins used by the payload firmware.
 * ============================================================ */

#define MODULE_BUS_TYPE         MODULE_BUS_TYPE_I2C
#define MODULE_I2C_SDA_GPIO     8
#define MODULE_I2C_SCL_GPIO     9
#define MODULE_I2C_ADDR         0x44

/* ============================================================
 * Default configuration
 *
 * For SHT30:
 * threshold_1 = temperature high x100
 * threshold_2 = humidity high x100
 * ============================================================ */

#define MODULE_DEFAULT_SAMPLE_MS        5000
#define MODULE_DEFAULT_THRESHOLD_1_X100 3500
#define MODULE_DEFAULT_THRESHOLD_2_X100 8500

/* ============================================================
 * External module flash layout
 * ============================================================ */

#define MODULE_HEADER_ADDR       0x000000
#define MODULE_PAYLOAD_ADDR      0x001000