<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\Consent;
use App\Models\Notification;

/**
 * Minimal-payload notifications. The payload is limited to an event code,
 * an appointment id and a generic sentence. No clinician notes, reasons,
 * diagnoses or even clinician names are ever included.
 */
class Notifier
{
    private const MESSAGES = [
        'requested' => 'Your appointment request was received.',
        'confirmed' => 'Your appointment was confirmed. Sign in to view details.',
        'rejected' => 'Your appointment request could not be accommodated. Sign in for details.',
        'cancelled' => 'An appointment was cancelled. Sign in for details.',
        'rescheduled' => 'An appointment was rescheduled. Sign in for details.',
        'completed' => 'Your visit is complete. Sign in to view your timeline.',
    ];

    public static function appointmentEvent(Appointment $a, string $event): void
    {
        if (! Consent::has($a->patient_id, 'notifications')) {
            return;
        }
        Notification::create([
            'user_id' => $a->patient_id,
            'channel' => 'email',
            'type' => 'appointment.'.$event,
            'payload' => [
                'appointment_id' => $a->id,
                'message' => self::MESSAGES[$event] ?? 'There is an update on your appointment.',
            ],
            'sent_at' => now(),
        ]);
    }
}
