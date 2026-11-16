<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Consent extends Model
{
    public const TYPES = ['records_sharing', 'notifications'];

    protected $fillable = ['patient_id', 'type', 'granted', 'granted_at', 'revoked_at'];
    protected $casts = ['granted' => 'boolean', 'granted_at' => 'datetime', 'revoked_at' => 'datetime'];

    public static function has(int $patientId, string $type): bool
    {
        return static::where(['patient_id' => $patientId, 'type' => $type, 'granted' => true])->exists();
    }
}
