#pragma once

#include <stdint.h>

/* ============================================================
 * Common protocol limits
 * ============================================================ */

#define MPROTO_MAX_PAYLOAD     200
#define MPROTO_SENSOR_NAME_LEN 32

/* ============================================================
 * Module header constants
 * ============================================================ */

#define MODULE_HEADER_MAGIC    0x534D4F44u   /* "SMOD" */
#define MODULE_HEADER_VERSION  1

/* ============================================================
 * Bus type
 * ============================================================ */

#define MODULE_BUS_TYPE_NONE   0
#define MODULE_BUS_TYPE_I2C    1

/* ============================================================
 * I2C sensor types
 * ============================================================ */

#define SENSOR_TYPE_NONE       0
#define SENSOR_TYPE_SHT30      1
#define SENSOR_TYPE_BH1750     2
#define SENSOR_TYPE_BME280     3
#define SENSOR_TYPE_VL53L0X    4
#define SENSOR_TYPE_BMP280     5
#define SENSOR_TYPE_AHT20      6
#define SENSOR_TYPE_HTU21D     7
#define SENSOR_TYPE_CUSTOM_I2C 100

/* ============================================================
 * Message types
 * ============================================================ */

#define MSG_BASE_HELLO     1
#define MSG_BASE_ACK       2
#define MSG_MODULE_INFO    3
#define MSG_MODULE_ACK     4
#define MSG_SENSOR_DATA    5
#define MSG_CONFIG_SET     6
#define MSG_CONFIG_ACK     7
#define MSG_HEARTBEAT      8

/* ============================================================
 * ACK status
 * ============================================================ */

#define ACK_STATUS_OK          1
#define ACK_STATUS_BAD_PAYLOAD 2
#define ACK_STATUS_BAD_TARGET  3
#define ACK_STATUS_APPLY_FAIL  4

/* ============================================================
 * Generic ESP-NOW frame
 * ============================================================ */

typedef struct __attribute__((packed)) {
    uint8_t  msg_type;
    uint8_t  sensor_type;
    uint16_t payload_len;
    uint32_t seq_num;
    uint32_t base_id;
    uint32_t sensor_id;
    uint8_t  flags;
    uint8_t  reserved[3];
    uint8_t  payload[MPROTO_MAX_PAYLOAD];
} mproto_frame_t;

/* ============================================================
 * Base hello
 * ============================================================ */

typedef struct __attribute__((packed)) {
    uint8_t  base_mac[6];
    uint16_t fw_version;
    uint8_t  has_module;
    uint8_t  reserved;
} mproto_base_hello_t;

/* ============================================================
 * Module info
 *
 * Keep the old field names because your existing controller/payload
 * code already uses these names.
 * ============================================================ */

typedef struct __attribute__((packed)) {
    char     sensor_name[MPROTO_SENSOR_NAME_LEN];
    uint32_t module_crc32;
    uint32_t sample_period_ms;

    int16_t  temp_threshold_hi_x100;
    uint16_t humidity_threshold_hi_x100;

    uint8_t  i2c_sda_gpio;
    uint8_t  i2c_scl_gpio;
    uint8_t  i2c_addr;
    uint8_t  reserved;
} mproto_module_info_t;

/* ============================================================
 * Existing SHT30-style payload
 *
 * We keep this for compatibility with your current controller code.
 * For BME/BMP/VL53, you are temporarily reusing these fields.
 * ============================================================ */

typedef struct __attribute__((packed)) {
    int16_t  temperature_c_x100;
    uint16_t humidity_rh_x100;
    uint8_t  alert_flags;
    uint8_t  reserved[3];
    uint32_t uptime_s;
} mproto_sht30_data_t;

/* ============================================================
 * Config packet
 *
 * Keep old field names because your current payload code uses:
 * temp_threshold_hi_x100 and humidity_threshold_hi_x100.
 * ============================================================ */

typedef struct __attribute__((packed)) {
    uint32_t sample_period_ms;
    int16_t  temp_threshold_hi_x100;
    uint16_t humidity_threshold_hi_x100;
    uint8_t  apply_flags;
    uint8_t  reserved[3];
} mproto_config_set_t;

/* ============================================================
 * ACK packet
 * ============================================================ */

typedef struct __attribute__((packed)) {
    uint32_t acked_seq_num;
    uint8_t  acked_msg_type;
    uint8_t  status;
    char     detail[22];
} mproto_ack_t;

/* ============================================================
 * Generalized I2C module header stored in external flash
 *
 * External flash layout:
 *   0x000000 -> module_header_t
 *   0x001000 -> payload firmware .bin
 *
 * IMPORTANT:
 * This structure must be identical in:
 *   - base loader
 *   - module packager
 *   - sensor payload
 * ============================================================ */

typedef struct __attribute__((packed)) {
    uint32_t magic;
    uint16_t header_version;
    uint16_t sensor_type;

    uint8_t  bus_type;
    uint8_t  i2c_sda_gpio;
    uint8_t  i2c_scl_gpio;
    uint8_t  i2c_addr;

    uint32_t firmware_addr;
    uint32_t firmware_size;
    uint32_t firmware_crc32;

    uint32_t sensor_id;
    char     sensor_name[MPROTO_SENSOR_NAME_LEN];

    uint32_t default_sample_period_ms;
    int16_t  default_threshold_1_x100;
    int16_t  default_threshold_2_x100;

    uint32_t flags;

    uint8_t  reserved[184];
} module_header_t;