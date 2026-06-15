package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"

	"spectron-backend/internal/config"
	"spectron-backend/internal/iot"
)

// RegisterRoutes wires all HTTP routes for the API.
func RegisterRoutes(r chi.Router, db *pgxpool.Pool, allowedOrigins []string, rawReadingsPublisher iot.RawReadingsPublisher, emailConfig config.EmailConfig) {
	if len(allowedOrigins) == 0 {
		allowedOrigins = []string{
			"http://localhost:3000",
			"http://localhost:3001",
			"http://localhost:3002",
			"http://127.0.0.1:3000",
			"http://127.0.0.1:3001",
			"http://127.0.0.1:3002",
			"https://localhost",
			"capacitor://localhost",
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
	authHandler := NewAuthHandler(db, emailConfig)
	controllerHandler := NewControllerHandler(db)
	sensorHandler := NewSensorHandler(db)
	alertHandler := NewAlertHandler(db)
	dashboardHandler := NewDashboardHandler(db)
	ingestHandler := NewIngestHandler(db, rawReadingsPublisher)

	// Public routes
	r.Post("/auth/register", authHandler.Register)
	r.Post("/auth/login", authHandler.Login)
	r.Post("/auth/admin/login", authHandler.AdminLogin)
	r.Post("/auth/verify-email", authHandler.VerifyEmail)
	r.Post("/auth/resend-verification", authHandler.ResendVerification)
	r.Post("/api/iot/discover", ingestHandler.Discover)
	r.Post("/api/iot/config", ingestHandler.Config)
	r.Post("/api/iot/upload", ingestHandler.Upload)

	// Protected routes
	r.Route("/", func(r chi.Router) {
		r.Use(AuthMiddleware)

		// Auth
		r.Get("/auth/me", authHandler.Me)
		r.Patch("/auth/me", authHandler.UpdateProfile)
		r.With(RequireAccountRole(db, "OWNER")).Delete("/auth/me", authHandler.DeleteAccount)
		r.Post("/auth/change-password", authHandler.ChangePassword)
		r.With(RequireAccountRole(db, "OWNER")).Get("/users", authHandler.ListUsers)
		r.With(RequireAccountRole(db, "OWNER")).Post("/users/viewers", authHandler.CreateViewer)
		r.With(RequireAccountRole(db, "OWNER")).Delete("/users/viewers/{userId}", authHandler.DeleteViewer)

		// Controllers
		r.Route("/controllers", func(r chi.Router) {
			r.Get("/", controllerHandler.List)
			r.Get("/{id}", controllerHandler.Get)
			r.With(RequireAccountRole(db, "OWNER", "ADMIN")).Patch("/{id}", controllerHandler.Update)
		})

		r.Route("/api/controllers", func(r chi.Router) {
			r.With(RequireAccountRole(db, "OWNER", "ADMIN")).Post("/pair", controllerHandler.PairAPI)
			r.Get("/my", controllerHandler.MyControllersAPI)
			r.With(RequireAccountRole(db, "OWNER", "ADMIN")).Patch("/{controllerId}", controllerHandler.UpdateHardwareControllerAPI)
			r.With(RequireAccountRole(db, "OWNER", "ADMIN")).Put("/{controllerId}", controllerHandler.UpdateHardwareControllerAPI)
			r.Get("/{controllerId}/sensors", controllerHandler.ControllerSensorsAPI)
			r.With(RequireAccountRole(db, "OWNER", "ADMIN")).Delete("/{controllerId}/claim", controllerHandler.ReleaseControllerAPI)
			r.With(RequireAccountRole(db, "OWNER", "ADMIN")).Delete("/{controllerId}/sensors/{sensorId}", controllerHandler.DeleteHardwareSensorAPI)
			r.With(RequireAccountRole(db, "OWNER", "ADMIN")).Patch("/{controllerId}/sensors/{sensorId}", controllerHandler.UpdateHardwareSensorAPI)
			r.With(RequireAccountRole(db, "OWNER", "ADMIN")).Put("/{controllerId}/sensors/{sensorId}", controllerHandler.UpdateHardwareSensorAPI)
			r.With(RequireAccountRole(db, "OWNER", "ADMIN")).Post("/{controllerId}/sensors/{sensorId}/ai-suggest-config", controllerHandler.AISuggestHardwareSensorConfigAPI)
			r.With(RequireAccountRole(db, "OWNER", "ADMIN")).Post("/{controllerId}/sensors/{sensorId}/config", controllerHandler.SaveSensorConfigAPI)
			r.Get("/{controllerId}/sensors/{sensorId}/config", controllerHandler.GetSensorConfigAPI)
		})

		r.Route("/api/systems", func(r chi.Router) {
			r.Get("/my", controllerHandler.MySystemsAPI)
		})

		r.Route("/api/admin", func(r chi.Router) {
			r.Use(RequireSystemAdmin(db))
			r.Get("/overview", controllerHandler.AdminOverviewAPI)
			r.Get("/devices", controllerHandler.AdminDevicesAPI)
			r.Post("/devices", controllerHandler.AdminCreateDeviceAPI)
			r.Get("/users", controllerHandler.AdminUsersAPI)
			r.Get("/owners", authHandler.AdminListOwners)
			r.Post("/owners", authHandler.AdminCreateOwner)
			r.Patch("/owners/{userId}/approve", authHandler.AdminApproveOwner)
			r.Patch("/owners/{userId}/reject", authHandler.AdminRejectOwner)
			r.Get("/system", controllerHandler.AdminSystemHealthAPI)
		})

		// Sensors
		r.Route("/controllers/{controllerId}/sensors", func(r chi.Router) {
			r.Get("/", sensorHandler.List)
		})
		r.Route("/sensors", func(r chi.Router) {
			r.Get("/{id}", sensorHandler.Get)
			r.Get("/{id}/attendance", sensorHandler.GetAttendanceState)
			r.With(RequireAccountRole(db, "OWNER", "ADMIN")).Post("/{id}/attendance/reset", sensorHandler.ResetAttendance)
			// TODO: Learning phase endpoints - implementation pending
			// r.Get("/{id}/learning-phase", sensorHandler.GetLearningPhaseStatus)
			// r.Post("/{id}/learning-phase/suggestions", sensorHandler.GetLearningPhaseSuggestions)
			// r.With(RequireAccountRole(db, "OWNER", "ADMIN")).Post("/{id}/learning-phase/apply", sensorHandler.ApplyLearningPhaseSuggestions)
			r.With(RequireAccountRole(db, "OWNER", "ADMIN")).Post("/{id}/ai-suggest-config", sensorHandler.AISuggestConfig)
			r.With(RequireAccountRole(db, "OWNER", "ADMIN")).Post("/{id}/config", sensorHandler.SaveConfig)
		})

		// Dashboard
		r.Get("/dashboard/overview", dashboardHandler.Overview)
		r.Get("/controllers/{id}/dashboard", dashboardHandler.ControllerDashboard)
		r.Get("/sensors/{id}/readings", dashboardHandler.GetReadings)

		// Alerts
		r.Route("/alerts", func(r chi.Router) {
			r.Get("/", alertHandler.List)
			r.With(RequireAccountRole(db, "OWNER", "ADMIN")).Post("/{id}/ack", alertHandler.Acknowledge)
			r.With(RequireAccountRole(db, "OWNER", "ADMIN")).Post("/{id}/apply-recommendation", alertHandler.ApplyRecommendation)
		})
	})
}
