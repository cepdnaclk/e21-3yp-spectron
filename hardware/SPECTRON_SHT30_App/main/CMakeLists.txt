idf_component_register(SRCS "main.c" "sensor_app.c" INCLUDE_DIRS "." REQUIRES driver esp_wifi esp_event esp_netif nvs_flash)
