package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"

	"spectron-backend/internal/iot"
)

// RegisterRoutes wires all HTTP routes for the API.
func RegisterRoutes(r chi.Router, db *pgxpool.Pool, allowedOrigins []string, rawReadingsPublisher iot.RawReadingsPublisher) {
	if len(allowedOrigins) == 0 {
		allowedOrigins = []string{
			"http://localhost:3000",
			"http://localhost:3001",
			"http://127.0.0.1:3000",
			"http://127.0.0.1:3001",
		}
	}

	// CORS middleware
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   allowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Basic health check
	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	r.Get("/", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"service":"spectron-backend","status":"ok","health":"./healthz"}`))
	})
	r.Get("/favicon.ico", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})

	// Initialize handlers
	authHandler := NewAuthHandler(db)
	controllerHandler := NewControllerHandler(db)
	sensorHandler := NewSensorHandler(db)
	alertHandler := NewAlertHandler(db)
	dashboardHandler := NewDashboardHandler(db)
	ingestHandler := NewIngestHandler(db, rawReadingsPublisher)

	// Public routes
	r.Post("/auth/register", authHandler.Register)
	r.Post("/auth/login", authHandler.Login)
	r.Post("/api/iot/discover", ingestHandler.Discover)
	r.Post("/api/iot/config", ingestHandler.Config)
	r.Post("/api/iot/upload", ingestHandler.Upload)

	// Protected routes
	r.Route("/", func(r chi.Router) {
		r.Use(AuthMiddleware)

		// Auth
		r.Get("/auth/me", authHandler.Me)
		r.Patch("/auth/me", authHandler.UpdateProfile)
		r.Delete("/auth/me", authHandler.DeleteAccount)
		r.Post("/auth/change-password", authHandler.ChangePassword)
		r.Get("/users", authHandler.ListUsers)

		// Controllers
		r.Route("/controllers", func(r chi.Router) {
			r.Get("/", controllerHandler.List)
			r.Post("/pair", controllerHandler.Pair)
			r.Get("/{id}", controllerHandler.Get)
			r.Patch("/{id}", controllerHandler.Update)
		})

		// Sensors
		r.Route("/controllers/{controllerId}/sensors", func(r chi.Router) {
			r.Get("/", sensorHandler.List)
		})
		r.Route("/sensors", func(r chi.Router) {
			r.Get("/{id}", sensorHandler.Get)
			r.Post("/{id}/ai-suggest-config", sensorHandler.AISuggestConfig)
			r.Post("/{id}/config", sensorHandler.SaveConfig)
		})

		// Dashboard
		r.Get("/dashboard/overview", dashboardHandler.Overview)
		r.Get("/controllers/{id}/dashboard", dashboardHandler.ControllerDashboard)
		r.Get("/sensors/{id}/readings", dashboardHandler.GetReadings)

		// Alerts
		r.Route("/alerts", func(r chi.Router) {
			r.Get("/", alertHandler.List)
			r.Post("/{id}/ack", alertHandler.Acknowledge)
		})
	})
}
