# Riverside Demo Clinic: Appointment & Records Coordination Platform

NexBuild Project 02. A privacy-conscious appointment platform for a **fictional clinic**.
**Synthetic data only.** Never enter real personal or medical information.

- `backend/`: Laravel API (Sanctum token auth, MySQL or SQLite, audit logging)
- `frontend/`: React + TypeScript (Vite) single-page app

## Setup

Requirements: PHP 8.3+, Composer, Node 20+, MySQL 8 (or SQLite for a zero-config demo).

```bash
# Backend
cd backend
composer install
cp .env.example .env && php artisan key:generate   # .env already exists if you used this checkout
# SQLite works out of the box. For MySQL edit DB_* in .env.
php artisan migrate:fresh --seed
php artisan serve                                  # http://127.0.0.1:8000

# Frontend (second terminal)
cd frontend
npm install
npm run dev                                        # http://localhost:5173 (proxies /api)
```

Demo accounts (password `Password123!`): `patient1@demo.test` (consents given),
`patient2@demo.test` (no consent), `reception@demo.test`, `clinician1@demo.test`, `admin@demo.test`.

Tests: `cd backend && php artisan test` (25 tests).
Health check: `GET /up`. Slots for the next 3 weeks are generated from weekly availability by the seeder
(and whenever availability is saved).

## Architecture

```
React SPA ──Bearer token──▶ Laravel API ──▶ MySQL
   (route guards only          │  EnsureRole middleware  (route-level role gate)
    hide screens)              │  Access service         (object-level rules, every endpoint)
                               │  AppointmentService     (transactions, locking, state machine)
                               │  Audit / Notifier       (append-only log, minimal payloads)
```

Tables: `users`, `patient_profiles_demo`, `clinicians`, `clinician_availability`, `appointment_slots`,
`appointments`, `appointment_status_history`, `clinical_notes_demo`, `consents`, `audit_logs`, `notifications`.

### Preventing double-booking
1. Booking runs in a DB transaction and takes a row lock on the slot (`lockForUpdate`).
2. `appointments.active_slot_id` equals the slot id while an appointment is requested/confirmed and is `NULL`
   once it is cancelled/rejected/rescheduled/completed. A **UNIQUE index** on it is the database-level guarantee:
   even if application checks are bypassed, the second insert fails and the API returns a safe `409`.
3. A patient also cannot hold two overlapping active appointments.
4. Rescheduling releases the old slot and takes the new one in a single transaction; failure leaves the original intact.

### Appointment workflow
`requested → confirmed → completed`, or `requested/confirmed → cancelled`, `requested → rejected`,
`requested/confirmed → rescheduled` (a new linked appointment is created). Every change writes a row in
`appointment_status_history` and an audit entry.

## Access matrix

| Resource / action | Patient | Clinician | Receptionist | Administrator |
|---|---|---|---|---|
| Register / sign in | ✔ (self-register is patient only) | ✔ | ✔ | ✔ |
| Search open slots, clinician list | ✔ | ✔ | ✔ | ✔ |
| Request appointment | own | ✘ | for a patient | for a patient |
| View an appointment + status history | own | own patients' (assigned to them) | all | all |
| Approve | ✘ | own | ✔ | ✔ |
| Reject | ✘ | ✘ | ✔ | ✔ |
| Cancel / reschedule | own | own (cancel) | ✔ | ✔ |
| Complete | ✘ | own | ✔ | ✔ |
| Schedule view, daily queue | ✘ | own only | all | all |
| Block/unblock slot, edit availability | ✘ | own | ✔ (block) | ✔ |
| Appointment timeline (no notes) | own | patients with a confirmed/completed visit, own encounters only | ✔ | ✔ |
| **Clinical notes: read** | own | treating clinician **and** patient `records_sharing` consent | ✘ | ✘ |
| **Clinical notes: write** | ✘ | own appointment, confirmed/completed, with consent | ✘ | ✘ |
| Manage own consents / notifications | ✔ | ✘ | ✘ | ✘ |
| Audit log, user management | ✘ | ✘ | ✘ | ✔ |

Administrators deliberately **cannot** read clinical notes (least privilege). Role checks run in the API
(`EnsureRole` + `Access`), not only in the UI.

## Audited events
Actor id/role, action, resource, subject patient, IP and timestamp are recorded for: login / failed login,
appointment create/read/update (with from→to status), appointment list reads, timeline reads, **clinical note
reads and writes**, schedule/queue reads, consent changes, slot/availability changes, user changes, and every
**denied** access attempt. `audit_logs` is append-only at the model level, and `meta` is a whitelist of identifiers
and statuses, so note text, reasons and names never enter the log.

## Privacy and security notes
- **Notifications** carry only an event code, appointment id and a generic sentence. No notes, reasons, names or
  clinician details, and none are created unless the patient consented to notifications.
- **Notes encrypted at rest** (Laravel `encrypted` cast).
- **Errors are generic**: 403 "You do not have permission…", 404 "Not found.", 500 "Something went wrong.".
  No model names, ids, SQL or submitted values are echoed; validation does not echo input; `dontFlash` covers note bodies.
- Forged ids (another patient's appointment/timeline/notes, `patient_id` in a booking body) are rejected or ignored.
- Login errors are identical for unknown account/wrong password; auth endpoints are rate-limited; deactivating a user revokes tokens.
- Tokens are kept in `sessionStorage` in the SPA (cleared when the tab closes). For production prefer an httpOnly-cookie SPA flow
  and HTTPS, and add real key management for `APP_KEY`.
- Known limits of this demo: no email transport (notifications are stored records with `sent_at`), no MFA,
  single clinic/timezone (UTC), no automated browser tests.

## Bonus: policy FAQ assistant
`POST /api/faq` answers only from an approved static FAQ. It refuses questions about notes/diagnoses/records
and returns a safe fallback for unsupported questions. If `ANTHROPIC_API_KEY` is set, the server asks the model using
**only** the approved FAQ text (no patient data is ever sent). Tests cover fallback and refusal.

## Automated tests (`backend/tests/Feature`)
- `DoubleBookingTest`: same-slot conflict (API and raw DB constraint), rebooking after cancel, slot search, atomic reschedule, patient overlap.
- `AccessControlTest`: cross-user access, role matrix, consent gating, audit content, encryption, append-only log, generic errors, forged `patient_id`.
- `NotificationLeakageTest`: payload minimality, consent, isolation, validation-error non-echo, FAQ fallback.
