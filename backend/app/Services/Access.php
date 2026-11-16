<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\Consent;
use App\Models\User;

/** Central least-privilege rules, used by every endpoint (not only the UI). */
class Access
{
    public static function viewAppointment(User $u, Appointment $a): bool
    {
        return match ($u->role) {
            User::PATIENT => $a->patient_id === $u->id,
            User::CLINICIAN => $u->clinician && $a->clinician_id === $u->clinician->id,
            User::RECEPTIONIST, User::ADMIN => true,
            default => false,
        };
    }

    /** Clinician has a confirmed/completed appointment with the patient. */
    public static function treats(User $u, int $patientId): bool
    {
        return $u->clinician && Appointment::where('patient_id', $patientId)
            ->where('clinician_id', $u->clinician->id)
            ->whereIn('status', ['confirmed', 'completed'])->exists();
    }

    /**
     * Clinical notes: the patient themself, or a treating clinician WITH the
     * patient's records_sharing consent. Receptionists and admins never.
     */
    public static function readNotes(User $u, int $patientId): bool
    {
        if ($u->isRole(User::PATIENT)) {
            return $u->id === $patientId;
        }
        return $u->isRole(User::CLINICIAN)
            && self::treats($u, $patientId)
            && Consent::has($patientId, 'records_sharing');
    }

    public static function writeNote(User $u, Appointment $a): bool
    {
        return $u->isRole(User::CLINICIAN)
            && $u->clinician && $a->clinician_id === $u->clinician->id
            && in_array($a->status, ['confirmed', 'completed'], true)
            && Consent::has($a->patient_id, 'records_sharing');
    }

    /** Appointment-only timeline (no notes). */
    public static function viewTimeline(User $u, int $patientId): bool
    {
        return match ($u->role) {
            User::PATIENT => $u->id === $patientId,
            User::CLINICIAN => self::treats($u, $patientId),
            User::RECEPTIONIST, User::ADMIN => true,
            default => false,
        };
    }
}
