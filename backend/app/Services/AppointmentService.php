<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\AppointmentSlot;
use App\Models\AppointmentStatusHistory;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;

class AppointmentService
{
    private const TAKEN = 'That time slot is no longer available. Please choose another.';

    /** Request a slot. Safe under concurrency: row lock + UNIQUE(active_slot_id). */
    public function request(User $actor, int $patientId, int $slotId, ?string $reason): Appointment
    {
        try {
            return DB::transaction(function () use ($actor, $patientId, $slotId, $reason) {
                $slot = $this->lockBookableSlot($slotId);
                $this->assertPatientFree($patientId, $slot);
                $a = Appointment::create([
                    'patient_id' => $patientId, 'clinician_id' => $slot->clinician_id, 'slot_id' => $slot->id,
                    'active_slot_id' => $slot->id, 'status' => 'requested', 'reason' => $reason,
                ]);
                $this->history($a, null, 'requested', $actor, 'Appointment requested');
                Audit::log($actor, 'create', 'appointment', $a->id, $patientId, ['status' => 'requested']);
                Notifier::appointmentEvent($a, 'requested');
                return $a;
            });
        } catch (UniqueConstraintViolationException) {
            abort(409, self::TAKEN);
        }
    }

    public function transition(User $actor, Appointment $a, string $to): Appointment
    {
        return DB::transaction(function () use ($actor, $a, $to) {
            $a = Appointment::lockForUpdate()->findOrFail($a->id);
            $allowed = [
                'requested' => ['confirmed', 'rejected', 'cancelled'],
                'confirmed' => ['cancelled', 'completed'],
            ];
            if (! in_array($to, $allowed[$a->status] ?? [], true)) {
                abort(409, "This appointment cannot change from {$a->status} to {$to}.");
            }
            $this->apply($actor, $a, $to);
            return $a->fresh();
        });
    }

    public function reschedule(User $actor, Appointment $a, int $newSlotId): Appointment
    {
        try {
            return DB::transaction(function () use ($actor, $a, $newSlotId) {
                $old = Appointment::lockForUpdate()->findOrFail($a->id);
                if (! $old->isActive()) {
                    abort(409, 'Only active appointments can be rescheduled.');
                }
                $slot = $this->lockBookableSlot($newSlotId);
                $this->assertPatientFree($old->patient_id, $slot, $old->id);
                $status = $old->status;
                $this->apply($actor, $old, 'rescheduled'); // releases the old slot first
                $new = Appointment::create([
                    'patient_id' => $old->patient_id, 'clinician_id' => $slot->clinician_id, 'slot_id' => $slot->id,
                    'active_slot_id' => $slot->id, 'status' => $status, 'reason' => $old->reason,
                    'rescheduled_from_id' => $old->id,
                ]);
                $this->history($new, null, $status, $actor, 'Rescheduled from appointment #'.$old->id);
                Audit::log($actor, 'create', 'appointment', $new->id, $old->patient_id, ['from' => 'rescheduled', 'status' => $status]);
                return $new;
            });
        } catch (UniqueConstraintViolationException) {
            abort(409, self::TAKEN);
        }
    }

    private function apply(User $actor, Appointment $a, string $to): void
    {
        $from = $a->status;
        $a->status = $to;
        $a->active_slot_id = in_array($to, Appointment::ACTIVE, true) ? $a->slot_id : null;
        $a->save();
        $this->history($a, $from, $to, $actor);
        Audit::log($actor, 'update', 'appointment', $a->id, $a->patient_id, ['from' => $from, 'to' => $to]);
        Notifier::appointmentEvent($a, $to);
    }

    private function history(Appointment $a, ?string $from, string $to, User $actor, ?string $note = null): void
    {
        AppointmentStatusHistory::create([
            'appointment_id' => $a->id, 'from_status' => $from, 'to_status' => $to,
            'actor_id' => $actor->id, 'note' => $note,
        ]);
    }

    private function lockBookableSlot(int $slotId): AppointmentSlot
    {
        $slot = AppointmentSlot::lockForUpdate()->find($slotId);
        if (! $slot || $slot->status !== 'open' || $slot->starts_at->isPast()) {
            abort(409, 'That time slot is not available.');
        }
        if (Appointment::where('active_slot_id', $slot->id)->exists()) {
            abort(409, self::TAKEN);
        }
        return $slot;
    }

    private function assertPatientFree(int $patientId, AppointmentSlot $slot, ?int $ignoreId = null): void
    {
        $clash = Appointment::where('patient_id', $patientId)
            ->whereIn('status', Appointment::ACTIVE)
            ->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))
            ->whereHas('slot', fn ($q) => $q->where('starts_at', '<', $slot->ends_at)->where('ends_at', '>', $slot->starts_at))
            ->exists();
        if ($clash) {
            abort(409, 'You already have an appointment at an overlapping time.');
        }
    }
}
