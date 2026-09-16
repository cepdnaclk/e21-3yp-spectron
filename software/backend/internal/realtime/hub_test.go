package realtime

import "testing"

func TestClientMatchesScopeAndAccount(t *testing.T) {
	client := &Client{scope: "customer", accountID: "acct-1"}

	if !client.matches(Event{Scope: "customer", AccountID: "acct-1"}) {
		t.Fatal("expected matching customer event to pass")
	}
	if client.matches(Event{Scope: "customer", AccountID: "acct-2"}) {
		t.Fatal("expected different customer account to fail")
	}
	if client.matches(Event{Scope: "admin"}) {
		t.Fatal("expected admin scope to fail for customer client")
	}
}

func TestClientAllowsUnscopedCustomerBroadcast(t *testing.T) {
	client := &Client{scope: "customer", accountID: "acct-1"}
	if !client.matches(Event{Scope: "customer"}) {
		t.Fatal("expected customer broadcast without account to pass")
	}
}
