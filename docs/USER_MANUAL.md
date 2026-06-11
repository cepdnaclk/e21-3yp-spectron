# Spectron User Manual

**Product:** Spectron Standardized Modular IoT Adapter Kit
**Application:** Spectron Web Dashboard
**Document version:** 1.0
**System baseline:** Repository implementation as of June 11, 2026
**Audience:** Account owners, viewers, and Spectron system administrators

## Document Purpose

This manual explains how to use the Spectron web dashboard to register an
account, claim controllers, discover and configure sensors, monitor readings,
manage alerts, export reports, and administer hardware.

The structure follows common user-documentation practice: product overview,
audience and roles, prerequisites, getting started, task instructions, status
and error explanations, troubleshooting, safety information, and document
control. It is informed by ISO/IEC/IEEE 26514 guidance for information for
users, but this document does not claim formal certification or conformance.

## Table of Contents

1. [About Spectron](#1-about-spectron)
2. [Safety and Usage Limitations](#2-safety-and-usage-limitations)
3. [Roles and Permissions](#3-roles-and-permissions)
4. [Requirements and Preparation](#4-requirements-and-preparation)
5. [Getting Started](#5-getting-started)
6. [Dashboard Navigation](#6-dashboard-navigation)
7. [Managing Controllers](#7-managing-controllers)
8. [Discovering and Managing Sensors](#8-discovering-and-managing-sensors)
9. [Configuring a Sensor](#9-configuring-a-sensor)
10. [Live Monitoring](#10-live-monitoring)
11. [Alerts](#11-alerts)
12. [Monitoring Reports](#12-monitoring-reports)
13. [Team and Viewer Accounts](#13-team-and-viewer-accounts)
14. [Profile and Account Security](#14-profile-and-account-security)
15. [System Administrator Operations](#15-system-administrator-operations)
16. [Status Reference](#16-status-reference)
17. [Troubleshooting](#17-troubleshooting)
18. [Maintenance and Good Practice](#18-maintenance-and-good-practice)
19. [Support Information](#19-support-information)
20. [Revision History](#20-revision-history)

## 1. About Spectron

Spectron is a modular IoT monitoring platform. A reusable controller receives
data from attached sensor modules and sends the data through the Spectron
telemetry pipeline to the web dashboard.

The dashboard supports these main activities:

- Claiming an unowned Spectron controller by QR code or controller ID.
- Discovering sensors reported by the controller.
- Giving controllers and sensors meaningful names.
- Choosing what a physical sensor represents in a monitoring use case.
- Selecting a dashboard presentation and alert thresholds.
- Viewing recent readings and interpreted status.
- Acknowledging operational alerts.
- Exporting monitoring data as CSV or PDF.
- Creating read-only viewer accounts.
- Registering controller hardware through the administrator console.

### 1.1 System Flow

```text
Sensor module
    -> Spectron controller
    -> MQTT/Kafka or direct upload path
    -> Spectron backend and database
    -> Spectron web dashboard
```

### 1.2 Three-Layer Sensor Model

Spectron separates sensor setup into three concepts:

| Layer | Meaning | Example |
| --- | --- | --- |
| Physical hardware | What is connected | Ultrasonic distance sensor |
| Interpretation | What the reading means | Fill level percentage |
| Presentation | How users see it | Level card with trend and status |

This allows the same type of physical sensor to support different monitoring
purposes.

## 2. Safety and Usage Limitations

Spectron is a prototype monitoring platform and is not documented in this
repository as a certified safety, medical, billing, or industrial control
system.

- Do not use dashboard alerts as the only protection for hazardous conditions.
- Keep required physical alarms, shutdown systems, and manual inspection
  procedures in place.
- Verify sensor calibration, installation, readable range, and units before
  acting on measurements.
- Treat preview-only analytics as demonstrations. They cannot be activated
  until the required analytics runtime is implemented.
- A missing reading does not prove that the monitored condition is safe.
- Protect controller IDs and administrator credentials from unauthorized use.

## 3. Roles and Permissions

### 3.1 Account Owner

An owner controls a normal Spectron workspace. Owners can:

- View controllers, sensors, monitoring data, and alerts.
- Claim, rename, configure, and release controllers.
- Rename and configure sensors.
- Acknowledge alerts.
- Create viewer accounts.
- Update their profile and password.
- Permanently delete their workspace account.

### 3.2 Viewer

A viewer is a read-oriented member created by an owner. Viewers can:

- View controllers and sensor details.
- View monitoring data and alerts.
- View and update their own profile.

Protected write operations such as pairing, configuration, renaming, releasing
hardware, acknowledging alerts, team management, and account deletion require
owner or administrator permissions.

### 3.3 System Administrator

A system administrator uses the separate Spectron Admin console to:

- Register physical controller IDs.
- Generate and print reusable controller QR labels.
- Review registered, unclaimed, and owned devices.
- Review and create owner accounts.
- Approve or reject owner accounts when such statuses are present.
- Check API and database health.

The Audit page currently describes planned audit events. It is not yet a live,
immutable audit log.

## 4. Requirements and Preparation

### 4.1 User Requirements

- A current desktop or mobile browser.
- JavaScript and browser storage enabled.
- Network access to the deployed Spectron dashboard and API.
- An email address and password.
- For camera scanning, a browser with camera support and permission to use the
  rear-facing camera.

### 4.2 Hardware Requirements

Before sensor data can appear:

- The controller must have a valid ID beginning with `CTRL-`.
- An administrator should register the controller before handoff.
- The controller must be powered.
- Sensor modules must be powered and correctly connected.
- The controller firmware must send discovery and reading payloads to the
  configured backend path.

### 4.3 Recommended Naming

Use names that identify both purpose and location:

```text
Greenhouse West Controller
Water Tank Level
Boiler Room Temperature
Warehouse Occupancy
```

Avoid ambiguous names such as `Sensor 1` when multiple devices are deployed.

## 5. Getting Started

### 5.1 Create an Owner Account

1. Open the Spectron dashboard URL supplied by the deployment administrator.
2. Select **Sign Up**.
3. Enter your name and organization if available.
4. Enter a valid email address.
5. Optionally enter a phone number.
6. Enter a password with at least 6 characters.
7. Re-enter the password.
8. Select **Sign Up**.
9. After the success message, return to **Sign In**.

New self-registered accounts are currently created as active owner accounts.
Email verification is disabled in the current implementation.

### 5.2 Sign In

1. Open the normal **Sign In** page.
2. Enter your email and password.
3. Select **Sign In**.

After successful sign-in, the dashboard opens the **Controllers** page.

### 5.3 Administrator Sign-In

1. From the normal sign-in page, select **Login as Admin**, or open the admin
   sign-in route.
2. Enter an active administrator email and password.
3. Select **Sign In**.

Normal user credentials cannot access the administrator console unless the
account is registered as a system administrator.

### 5.4 Sign Out

On desktop, use **Logout** at the bottom of the navigation panel. On the admin
mobile layout, use the logout icon in the header.

Signing out removes the active dashboard token from browser storage.

## 6. Dashboard Navigation

### 6.1 Normal User Navigation

| Page | Purpose |
| --- | --- |
| Controllers | Add controllers and open controller workspaces |
| Monitoring | View current readings, health, trends, and reports |
| Alerts | Review and acknowledge alert events |
| Team | Create and review viewer accounts; owner only |
| Profile | Manage profile, password, session, and account |

Desktop browsers show a left navigation panel. Smaller screens show bottom
navigation.

### 6.2 Administrator Navigation

| Page | Purpose |
| --- | --- |
| Dashboard | Device totals and recommended operating flow |
| Devices | Review hardware registry and add controllers |
| Users | Manage owner accounts and approvals |
| System Health | Check API, database, and server time |
| Audit | View the planned audit-event scope |

## 7. Managing Controllers

### 7.1 Add a Controller by QR Code

1. Open **Controllers**.
2. Select **Add Controller**.
3. Select **Start Camera Scanner**.
4. Allow camera access when the browser requests permission.
5. Hold the controller QR label inside the scanner area.
6. Confirm that the detected ID begins with `CTRL-`.
7. Select **Add Controller**.

The controller must be unowned. A controller already owned by another account
cannot be claimed.

### 7.2 Add a Controller Manually

1. Open **Controllers** and select **Add Controller**.
2. Enter the controller ID, for example `CTRL-8F2A19`.
3. Select **Add Controller**.

Use manual entry if camera access is unavailable, denied, or unreliable.

### 7.3 Open a Controller Workspace

Select a controller card to open its workspace. The page shows:

- Controller name and hardware ID.
- Controller state.
- Optional purpose and location.
- Discovered sensors.
- Sensor readiness and observation state.
- Physical readable ranges when known.

The sensor list refreshes automatically. When no sensors exist it refreshes
more frequently while waiting for discovery.

### 7.4 Rename a Controller

1. Open the controller workspace.
2. Select the edit icon beside the controller name.
3. Enter a non-empty name.
4. Select the check icon to save.

This operation is available to users with controller-management permission.

### 7.5 Remove a Controller from the Account

1. Open the controller workspace.
2. Select **Remove from my account**.
3. Wait for the controller list to reopen.

Releasing a controller removes its ownership and marks it unclaimed. The
monitoring system definition is preserved so the hardware can be assigned
again later.

## 8. Discovering and Managing Sensors

### 8.1 Discover Sensors

Sensor discovery is automatic after the controller sends a discovery packet.

If the controller is offline:

1. Power the controller.
2. Verify its network or gateway connection.
3. Verify the sensor modules are connected and powered.
4. Wait for the controller workspace to refresh.

If the controller is online but no sensors appear, verify the physical module
connection and that the controller firmware reports its sensor list.

### 8.2 Rename a Sensor

1. Open the controller workspace.
2. Select the edit icon beside the sensor name.
3. Enter a non-empty name.
4. Select the check icon.

### 8.3 Sensor Readiness

| Label | Meaning |
| --- | --- |
| Discovered | Hardware is known, but no live or active configuration is confirmed |
| Live - config optional | The sensor is reporting and can be viewed before configuration |
| Configured | An active sensor configuration exists |

### 8.4 Observation Progress

After configuration, Spectron may show:

| Label | Meaning |
| --- | --- |
| Awaiting Data | No post-configuration reading has arrived |
| Observing | Readings are being collected for later review |
| Ready for Review | Enough readings or observation time are available to review refinements |

The default observation window is 14 days unless a different history window is
entered. Readiness may occur earlier after enough readings are collected.

## 9. Configuring a Sensor

Open a sensor and select **Configure** or **Review Configuration**. The wizard
contains five steps.

### 9.1 Simple and Expert Modes

- **Simple mode** hides optional controls inside expandable sections.
- **Expert mode** exposes reporting and advanced presentation controls.

Both modes save the same layered configuration structure.

### 9.2 Step 1: Sensor Info

1. Review the detected module, sensor family, measured values, readable range,
   accuracy notes, and common uses.
2. Enter a clear **Sensor Name**.
3. Select **Next**.

### 9.3 Step 2: What to Measure

1. Select the observable metric that users need to monitor.
2. Check whether the metric is marked **Available now** or **Preview only**.
3. Select the monitoring purpose.
4. Optionally provide context:
   - Domain
   - Environment type
   - Indoor, outdoor, or mixed exposure
   - Asset or object
   - Observation/history window
   - Country, region/city, and location label
   - Installation notes
5. Select **Next**.

Preview-only metrics can be inspected in the wizard but cannot be activated.

### 9.4 Step 3: Dashboard Style

1. Review the available presentation cards and previews.
2. Select the style that communicates the selected metric clearly.
3. In expert mode, adjust advanced dashboard options when required.
4. Select **Next**.

Common presentation profiles include trend, dual-climate, level, counter,
gauge, and event-timeline views. Available choices depend on the sensor and
metric.

### 9.5 Step 4: Alert Settings

1. Enter the required warning threshold for each displayed alert rule.
2. Optionally enter a critical threshold.
3. Choose a reading flow:
   - **Constant readings per day**
   - **Trigger-based readings**
4. For constant reporting, enter a positive number of reports per day.
5. Review the estimated battery-life value.
6. Select **Next**.

Threshold direction is shown as a lower-bound or upper-bound alert. Confirm
that values use the displayed unit.

### 9.6 Step 5: Final Check

Review:

- Sensor name.
- Selected metric.
- Presentation style.
- Reporting behavior.
- Warning and critical thresholds.
- Monitoring-card preview.

Select **Save and Activate Configuration**. The saved configuration becomes
active immediately and affects subsequent readings and monitoring
interpretation.

### 9.7 Calibration Warning

If the sensor is marked **OVERDUE** for calibration, verify its range and
thresholds before using its readings for decisions or automation.

## 10. Live Monitoring

Open **Monitoring** to view active sensors grouped by controller.

The page:

- Refreshes monitoring data automatically every 5 seconds.
- Shows the last dashboard refresh time.
- Shows controller count.
- Counts live readings that are within range.
- Counts readings that need attention.
- Shows one primary status, current reading, and visual per active sensor.
- Provides a manual **Refresh** action.

### 10.1 Sample Data

If a configured sensor has no recent readings, the dashboard may show a
clearly labeled **Sample Data** preview. Sample data demonstrates the selected
visualization and is not a physical measurement.

### 10.2 Health Interpretation

Monitoring compares current values with the configured thresholds and
presentation profile. Typical states include normal, warning, critical,
offline, or waiting for data.

Keep thresholds current. Incorrect thresholds can produce misleading
interpretations even when the raw sensor value is correct.

## 11. Alerts

Open **Alerts** to review alert events in newest-first order.

Alert types include:

- `THRESHOLD_BREACH`
- `SENSOR_OFFLINE`
- `CONTROLLER_OFFLINE`

Severity levels include:

- `INFO`
- `WARN`
- `CRITICAL`

### 11.1 Acknowledge an Alert

1. Review the alert type, time, severity, and message.
2. Confirm that the underlying condition has been investigated.
3. Select **Acknowledge**.

Acknowledgement records the time and visually reduces the alert emphasis. It
does not change the physical condition or reconfigure the sensor.

## 12. Monitoring Reports

### 12.1 Export a Report

1. Open **Monitoring**.
2. Select **Download Report**.
3. Select one or more controllers.
4. Enter a data window from 1 to 7 days.
5. Select **Download as CSV** or **Download as PDF**.

The CSV export contains controller, controller status, sensor, sensor type,
timestamp, value, and unit. The PDF includes account and monitoring summaries
with sensor sections.

The application report dialog currently limits exports to 7 days.

## 13. Team and Viewer Accounts

The **Team** page is visible to owners.

### 13.1 Create a Viewer

1. Open **Team**.
2. Enter the viewer email.
3. Create a temporary password with at least 6 characters.
4. Optionally enter the viewer name and phone.
5. Select **Create Viewer**.
6. Share the credentials with the intended viewer through an appropriate
   secure channel.

The viewer account is active immediately. The viewer should change the
temporary password after signing in.

### 13.2 Review Workspace Users

The user table shows each member's:

- Name and email.
- Workspace role.
- Account status.
- Creation time.

## 14. Profile and Account Security

Open **Profile** to manage personal account information.

### 14.1 Update Profile Details

1. Enter a first name. This field is required.
2. Optionally enter a last name and phone number.
3. Select **Save changes**.

The email address is displayed but cannot be edited from this page.

### 14.2 Profile Picture

- Upload an image smaller than 1 MB.
- Non-image files are rejected.
- Use the remove action to clear the current picture.

The current implementation stores the uploaded image as profile data through
the API. Use a suitably small image.

### 14.3 Change Password

1. Select **Reset password**.
2. Enter the current password.
3. Enter a new password with at least 8 characters, including a letter and a
   number.
4. Confirm the new password.
5. Select **Update Password**.

### 14.4 Delete the Workspace Account

Account deletion is available only to owners.

1. Open the **Delete Account** section.
2. Select **Delete My Account**.
3. Enter the account email exactly as confirmation.
4. Select the final **Delete My Account** action.

This permanently deletes the owner's account and workspace data, including
controllers, sensors, readings, configurations, and alerts. This operation
cannot be undone.

## 15. System Administrator Operations

### 15.1 Register a Controller

1. Sign in through the administrator page.
2. Open **Devices**.
3. Select **Add Controller**.
4. Optionally enter a unique controller ID beginning with `CTRL-`.
5. Leave the ID empty to generate one automatically.
6. Enter the display name.
7. Optionally enter the location.
8. Optionally enable **Create default sensor placeholders**.
9. Select **Create Device**.

### 15.2 Prepare the Controller Label

After registration:

1. Verify the controller ID and generated QR code.
2. Select **Copy Controller ID** or **Copy Route** if needed.
3. Select **Print QR** to print the reusable label.
4. Attach the label to the matching physical controller.
5. Select **Done**.

The QR payload is the controller ID. Owners scan it through the normal **Add
Controller** flow.

### 15.3 Review Devices

The **Devices** table shows:

- Controller ID and location.
- Display name.
- Status.
- Owner or **Unclaimed**.
- Configured sensor count.
- Last update time.

### 15.4 Manage Owner Accounts

The **Users** page shows pending approvals, active owners, and viewer totals.
Administrators can:

- Create an active owner directly.
- Review owner organization and device counts.
- Approve a pending owner.
- Reject a pending owner.

### 15.5 Check System Health

Open **System Health** to inspect:

- API status.
- Database status.
- Server time.

This is a basic reachability check, not a complete infrastructure or telemetry
pipeline diagnostic.

## 16. Status Reference

### 16.1 Controller Status

| Status | Meaning |
| --- | --- |
| `UNCLAIMED` | Registered by an administrator and available for an owner |
| `PENDING_CONFIG` | Claimed but not fully configured or not yet reporting |
| `ONLINE` | Recently connected or reporting |
| `OFFLINE` | Not currently reporting |
| `PAIRED` | Pairing/ownership state used by parts of the hardware API |

### 16.2 Sensor Status

| Status | Meaning |
| --- | --- |
| `OK` or `live` | Sensor is currently reporting or considered active |
| `OFFLINE` | Sensor is not reporting |
| `ERROR` | A sensor error has been recorded |
| `pending_discovery` | Logical sensor slot exists but physical discovery is pending |

### 16.3 Account Status

| Status | Meaning |
| --- | --- |
| `ACTIVE` | Sign-in is allowed |
| `PENDING_APPROVAL` | Administrator approval is required |
| `REJECTED` | Account request was rejected |
| `DISABLED` | Account access is disabled |

## 17. Troubleshooting

| Problem | Likely cause | Action |
| --- | --- | --- |
| Sign-in fails | Wrong credentials, inactive account, or API unavailable | Re-enter credentials, check account status, and confirm the dashboard can reach the API |
| Session returns to sign-in | Token is missing, invalid, or expired | Sign in again; tokens expire after 24 hours |
| QR scanner does not start | Camera unsupported, denied, in use, or unavailable in the browser context | Grant permission, close other camera apps, or enter the controller ID manually |
| QR code is rejected | Payload does not contain a valid `CTRL-` ID | Use the permanent controller label or type the controller ID |
| Controller cannot be claimed | Controller is unknown or already owned | Ask an administrator to verify registration and ownership |
| Controller shows offline | No recent discovery/config/upload request | Power the controller and verify its network, firmware, and backend URL |
| No sensors appear | No discovery packet or module connection problem | Check module power/wiring and send a discovery packet |
| Sensor shows sample data | No recent reading exists | Verify telemetry upload and sensor IDs |
| Configuration cannot save | Required name, metric, purpose, dashboard, warning threshold, or reports/day is missing | Return through the wizard and complete highlighted fields |
| Preview metric cannot save | Analytics derivation is not implemented | Select a metric marked **Available now** |
| Alerts seem incorrect | Threshold direction, unit, or calibration is wrong | Review the sensor configuration and calibration |
| Report is empty | No readings exist in the chosen 1-7 day window | Select another controller/window and verify telemetry |
| Viewer cannot change hardware | Viewer role is read-oriented | Ask an owner to perform the change |
| Admin page denies access | Account is not an active system administrator | Use an administrator account or contact the deployment operator |

## 18. Maintenance and Good Practice

- Review controller and sensor names after installation changes.
- Confirm units and thresholds whenever a sensor is replaced.
- Recalibrate sensors according to the sensor manufacturer's guidance.
- Investigate offline states instead of only acknowledging related alerts.
- Use viewer accounts instead of sharing owner credentials.
- Change temporary viewer passwords promptly.
- Sign out on shared computers.
- Keep the browser and controller firmware updated through the project's
  controlled release process.
- Recheck alert thresholds after moving a sensor to a new environment.
- Export reports before data is outside the required reporting window.

## 19. Support Information

When reporting a problem, include:

- Your role: owner, viewer, or system administrator.
- The page and action that failed.
- Controller ID and sensor ID, if relevant.
- Approximate date and time.
- Controller, sensor, and account statuses shown in the UI.
- The visible error message.
- Browser name and version.
- Whether the issue also occurs after signing in again.

Project repository:

<https://github.com/cepdnaclk/e21-3yp-spectron-dashboard>

Project website:

<https://cepdnaclk.github.io/e21-3yp-spectron-dashboard/>

Documentation reference:

<https://standards.ieee.org/ieee/26514/7467/>

## 20. Revision History

| Version | Date | Description |
| --- | --- | --- |
| 1.0 | June 11, 2026 | Initial manual based on the implemented web dashboard and Go API |
