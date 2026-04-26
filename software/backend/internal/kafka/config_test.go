package kafka

import "testing"

func TestValidateKafkaSecurityConfigAllowsPlainKafka(t *testing.T) {
	err := ValidateKafkaSecurityConfig(KafkaConfig{
		TLSEnabled:  false,
		MTLSEnabled: false,
	})
	if err != nil {
		t.Fatalf("expected plain Kafka config to be valid: %v", err)
	}
}

func TestValidateKafkaSecurityConfigRejectsMTLSWithoutTLS(t *testing.T) {
	err := ValidateKafkaSecurityConfig(KafkaConfig{
		TLSEnabled:  false,
		MTLSEnabled: true,
	})
	if err == nil {
		t.Fatal("expected mTLS without TLS to be invalid")
	}
}

func TestValidateKafkaSecurityConfigRequiresCAWhenTLSEnabled(t *testing.T) {
	err := ValidateKafkaSecurityConfig(KafkaConfig{
		TLSEnabled: true,
	})
	if err == nil {
		t.Fatal("expected TLS config without CA path to be invalid")
	}
}
