idf_component_register(
    SRCS "main.c"
    INCLUDE_DIRS "."
    REQUIRES nvs_flash esp_netif esp_wifi esp_event app_update spi_flash driver
)