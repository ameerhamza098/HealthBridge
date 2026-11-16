<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\AppointmentSlot;
use App\Models\Clinician;
use App\Models\User;
use App\Services\Access;
use App\Services\AppointmentService;
use App\Services\Audit;
use Illuminate\Http\Request;

class AppointmentController extends Controller
{
    public function __construct(private AppointmentService $svc) {}

    public static function present(Appointment $a, bool $withHistory = false): array
    {
        $a->loadMissing('slot', 'clinician.user', 'patient');
        $out = [
            'id' => $a->id,
            'status' => $a->status,
            'reason' => $a->reason,
            'patient' => ['id' => $a->patient_id, 'name' => $a->patient->name],
            'clinician' => ['id' => $a->clinician_id, 'name' => $a->clinician->user->name, 'specialty' => $a->clinician->specialty, 'room' => $a->clinician->room],
            'slot' => ['id' => $a->slot_id, 'starts_at' => $a->slot->starts_at->toIso8601String(), 'ends_at' => $a->slot->ends_at->toIso8601String()],
            'rescheduled_from_id' => $a->rescheduled_from_id,
        ];
        if ($withHistory) {
            $out['history'] = $a->history()->with('actor:id,name,role')->get()->map(fn ($h) => [
                'from' => $h->from_status, 'to' => $h->to_status, 'note' => $h->note,
                'actor' => $h->actor ? ['name' => $h->actor->name, 'role' => $h->actor->role] : null,
                'at' => $h->created_at?->toIso8601String(),
            ])->all();
        }
        return $out;
    }

    private function authorizeView(Request $r, Appointment $a): void
    {
        if (! Access::viewAppointment($r->user(), $a)) {
            Audit::log($r->user(), 'denied', 'appointment', $a->id, $a->patient_id);
            abort(403, 'You do not have permission to perform this action.');
        }
    }

    public function index(Request $r)
    {
        $u = $r->user();
        $q = Appointment::with('slot', 'clinician.user', 'patient')->latest('id');
        if ($u->isRole(User::PATIENT)) {
            $q->where('patient_id', $u->id);
        } elseif ($u->isRole(User::CLINICIAN)) {
            $q->where('clinician_id', $u->clinician?->id ?? 0);
        }
        if ($s = $r->query('status')) {
            $q->where('status', $s);
        }
        $items = $q->limit(200)->get();
        Audit::log($u, 'read', 'appointment_list', null, $u->isRole(User::PATIENT) ? $u->id : null, ['count' => $items->count()]);
        return $items->map(fn ($a) => self::present($a));
    }

    public function show(Request $r, Appointment $appointment)
    {
        $this->authorizeView($r, $appointment);
        Audit::log($r->user(), 'read', 'appointment', $appointment->id, $appointment->patient_id);
        return self::present($appointment, true);
    }

    public function store(Request $r)
    {
        $u = $r->user();
        $data = $r->validate([
            'slot_id' => 'required|integer',
            'reason' => 'nullable|string|max:200',
            'patient_id' => 'nullable|integer|exists:users,id',
        ]);
        $patientId = $u->id;
        if ($u->isStaff() && ! empty($data['patient_id'])) {
            $patientId = (int) $data['patient_id']; // staff book on behalf of a patient
            abort_unless(User::where('id', $patientId)->where('role', User::PATIENT)->exists(), 422, 'Invalid patient.');
        } elseif (! $u->isRole(User::PATIENT)) {
            abort(403, 'You do not have permission to perform this action.');
        }
        $a = $this->svc->request($u, $patientId, (int) $data['slot_id'], $data['reason'] ?? null);
        return response()->json(self::present($a, true), 201);
    }

    public function approve(Request $r, Appointment $appointment)
    {
        return $this->change($r, $appointment, 'confirmed', ['receptionist', 'administrator', 'clinician']);
    }

    public function reject(Request $r, Appointment $appointment)
    {
        return $this->change($r, $appointment, 'rejected', ['receptionist', 'administrator']);
    }

    public function cancel(Request $r, Appointment $appointment)
    {
        return $this->change($r, $appointment, 'cancelled', ['patient', 'receptionist', 'administrator', 'clinician']);
    }

    public function complete(Request $r, Appointment $appointment)
    {
        return $this->change($r, $appointment, 'completed', ['clinician', 'receptionist', 'administrator']);
    }

    private function change(Request $r, Appointment $a, string $to, array $roles)
    {
        $this->authorizeView($r, $a);
        if (! in_array($r->user()->role, $roles, true)) {
            Audit::log($r->user(), 'denied', 'appointment', $a->id, $a->patient_id);
            abort(403, 'You do not have permission to perform this action.');
        }
        return self::present($this->svc->transition($r->user(), $a, $to), true);
    }

    public function reschedule(Request $r, Appointment $appointment)
    {
        $this->authorizeView($r, $appointment);
        $data = $r->validate(['slot_id' => 'required|integer']);
        $new = $this->svc->reschedule($r->user(), $appointment, (int) $data['slot_id']);
        return response()->json(self::present($new, true), 201);
    }

    /** Open, future, unbooked slots for the search screen. */
    public function slots(Request $r)
    {
        $data = $r->validate([
            'clinician_id' => 'nullable|integer',
            'from' => 'nullable|date',
            'to' => 'nullable|date',
        ]);
        $from = isset($data['from']) ? \Carbon\Carbon::parse($data['from'])->startOfDay() : now();
        $q = AppointmentSlot::with('clinician.user')
            ->where('status', 'open')
            ->where('starts_at', '>', max($from, now()))
            ->whereDoesntHave('activeAppointment')
            ->orderBy('starts_at')->limit(200);
        if (! empty($data['clinician_id'])) {
            $q->where('clinician_id', $data['clinician_id']);
        }
        if (! empty($data['to'])) {
            $q->where('starts_at', '<=', \Carbon\Carbon::parse($data['to'])->endOfDay());
        }
        return $q->get()->map(fn ($s) => [
            'id' => $s->id, 'starts_at' => $s->starts_at->toIso8601String(), 'ends_at' => $s->ends_at->toIso8601String(),
            'clinician' => ['id' => $s->clinician_id, 'name' => $s->clinician->user->name, 'specialty' => $s->clinician->specialty],
        ]);
    }

    public function clinicians()
    {
        return Clinician::with('user:id,name')->get()->map(fn ($c) => [
            'id' => $c->id, 'name' => $c->user->name, 'specialty' => $c->specialty, 'room' => $c->room,
        ]);
    }
}
