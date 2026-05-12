idf_component_register(
    SRCS "main.c"
    INCLUDE_DIRS "."
    REQUIRES spi_flash driver esp_wifi esp_event app_update esp_netif driver nvs_flash
    EMBED_FILES "template.bin"
)