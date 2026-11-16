<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\AppointmentSlot;
use App\Models\Clinician;
use App\Models\ClinicianAvailability;
use App\Models\User;
use App\Services\Audit;
use App\Services\SlotGenerator;
use Carbon\Carbon;
use Illuminate\Http\Request;

class StaffController extends Controller
{
    /** Daily schedule per clinician, with conflict warnings. */
    public function schedule(Request $r)
    {
        $data = $r->validate(['date' => 'nullable|date', 'clinician_id' => 'nullable|integer']);
        $day = Carbon::parse($data['date'] ?? today());
        $u = $r->user();

        $clinicianId = $data['clinician_id'] ?? null;
        if ($u->isRole(User::CLINICIAN)) {
            $clinicianId = $u->clinician?->id ?? 0; // clinicians see only their own schedule
        }

        $slots = AppointmentSlot::with(['clinician.user', 'activeAppointment.patient'])
            ->whereBetween('starts_at', [$day->copy()->startOfDay(), $day->copy()->endOfDay()])
            ->when($clinicianId, fn ($q) => $q->where('clinician_id', $clinicianId))
            ->orderBy('starts_at')->get();

        // Patients with overlapping active appointments across clinicians.
        $byPatient = [];
        foreach ($slots as $s) {
            if ($s->activeAppointment) {
                $byPatient[$s->activeAppointment->patient_id][] = $s;
            }
        }

        $rows = $slots->map(function ($s) use ($byPatient) {
            $a = $s->activeAppointment;
            $warnings = [];
            if ($a && $s->status === 'blocked') {
                $warnings[] = 'Booked during a period the clinician marked unavailable.';
            }
            if ($a) {
                foreach ($byPatient[$a->patient_id] as $other) {
                    if ($other->id !== $s->id && $other->starts_at < $s->ends_at && $other->ends_at > $s->starts_at) {
                        $warnings[] = 'Patient has an overlapping appointment with another clinician.';
                        break;
                    }
                }
            }
            return [
                'slot_id' => $s->id,
                'starts_at' => $s->starts_at->toIso8601String(),
                'ends_at' => $s->ends_at->toIso8601String(),
                'slot_status' => $s->status,
                'clinician' => ['id' => $s->clinician_id, 'name' => $s->clinician->user->name],
                'appointment' => $a ? ['id' => $a->id, 'status' => $a->status, 'patient_name' => $a->patient->name] : null,
                'warnings' => $warnings,
            ];
        });

        Audit::log($u, 'read', 'schedule', null, null, ['count' => $rows->count()]);
        return ['date' => $day->toDateString(), 'slots' => $rows];
    }

    /** Daily queue: active appointments in time order. */
    public function queue(Request $r)
    {
        $day = Carbon::parse($r->query('date', today()));
        $u = $r->user();
        $q = Appointment::with('slot', 'clinician.user', 'patient')
            ->whereIn('status', ['requested', 'confirmed'])
            ->whereHas('slot', fn ($s) => $s->whereBetween('starts_at', [$day->copy()->startOfDay(), $day->copy()->endOfDay()]));
        if ($u->isRole(User::CLINICIAN)) {
            $q->where('clinician_id', $u->clinician?->id ?? 0);
        }
        $items = $q->get()->sortBy(fn ($a) => $a->slot->starts_at)->values();
        Audit::log($u, 'read', 'queue', null, null, ['count' => $items->count()]);
        return $items->map(fn ($a) => AppointmentController::present($a));
    }

    public function blockSlot(Request $r, AppointmentSlot $slot)
    {
        $u = $r->user();
        if ($u->isRole(User::CLINICIAN) && $slot->clinician_id !== $u->clinician?->id) {
            abort(403, 'You do not have permission to perform this action.');
        }
        $data = $r->validate(['blocked' => 'required|boolean']);
        $slot->update(['status' => $data['blocked'] ? 'blocked' : 'open']);
        Audit::log($u, 'update', 'slot', $slot->id, null, ['status' => $slot->status]);
        return ['id' => $slot->id, 'status' => $slot->status, 'has_booking' => $slot->activeAppointment()->exists()];
    }

    public function availability(Request $r, Clinician $clinician)
    {
        return $clinician->availability()->orderBy('weekday')->get();
    }

    public function setAvailability(Request $r, Clinician $clinician)
    {
        $u = $r->user();
        if ($u->isRole(User::CLINICIAN) && $clinician->id !== $u->clinician?->id) {
            abort(403, 'You do not have permission to perform this action.');
        }
        $data = $r->validate([
            'weekday' => 'required|integer|between:0,6',
            'start_time' => 'required|date_format:H:i',
            'end_time' => 'required|date_format:H:i|after:start_time',
            'slot_minutes' => 'integer|in:15,20,30,45,60',
        ]);
        $rule = ClinicianAvailability::updateOrCreate(
            ['clinician_id' => $clinician->id, 'weekday' => $data['weekday'], 'start_time' => $data['start_time']],
            ['end_time' => $data['end_time'], 'slot_minutes' => $data['slot_minutes'] ?? 30],
        );
        $created = SlotGenerator::generate($clinician);
        Audit::log($u, 'update', 'availability', $rule->id, null, ['clinician_id' => $clinician->id, 'count' => $created]);
        return response()->json(['rule' => $rule, 'slots_created' => $created], 201);
    }
}
