package com.roleimpact.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;

import org.junit.jupiter.api.Test;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.io.ClassPathResource;

class ProductionConfigurationTest {

    @Test
    void productionProfileUsesPlatformPortAndKeepsDiagnosticsPrivate() throws IOException {
        var resource = new ClassPathResource("application-prod.yml");
        assertThat(resource.exists()).isTrue();

        var propertySource = new YamlPropertySourceLoader()
                .load("production", resource)
                .getFirst();

        assertThat(propertySource.getProperty("server.port")).isEqualTo("${PORT:8080}");
        assertThat(propertySource.getProperty("server.forward-headers-strategy")).isEqualTo("framework");
        assertThat(propertySource.getProperty("server.shutdown")).isEqualTo("graceful");
        assertThat(propertySource.getProperty("bootui.enabled")).isEqualTo(false);
        assertThat(propertySource.getProperty("management.endpoints.web.exposure.include"))
                .isEqualTo("health,info");
        assertThat(propertySource.getProperty("management.endpoint.health.show-details"))
                .isEqualTo("never");
        assertThat(propertySource.getProperty("roleimpact.cors.allowed-origin"))
                .isEqualTo("${CORS_ALLOWED_ORIGIN}");
        assertThat(propertySource.getProperty("spring.datasource.hikari.maximum-pool-size"))
                .isEqualTo("${DB_MAX_POOL_SIZE:5}");
        assertThat(propertySource.getProperty("spring.datasource.hikari.minimum-idle"))
                .isEqualTo("${DB_MIN_IDLE:0}");
    }
}
