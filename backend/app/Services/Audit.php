<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\User;

/**
 * Append-only audit trail. Meta holds identifiers/status only,
 * never clinical note content, reasons or free text.
 */
class Audit
{
    private const ALLOWED_META = ['status', 'from', 'to', 'count', 'slot_id', 'clinician_id', 'appointment_id', 'path', 'method', 'role'];

    public static function log(?User $actor, string $action, string $type, ?int $id = null, ?int $patientId = null, array $meta = []): void
    {
        AuditLog::create([
            'actor_id' => $actor?->id,
            'actor_role' => $actor?->role,
            'action' => $action,
            'resource_type' => $type,
            'resource_id' => $id,
            'subject_patient_id' => $patientId,
            'ip_address' => request()?->ip(),
            'meta' => array_intersect_key($meta, array_flip(self::ALLOWED_META)) ?: null,
        ]);
    }
}
