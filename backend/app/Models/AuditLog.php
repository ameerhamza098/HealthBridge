<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    public $timestamps = false;
    protected $fillable = ['actor_id', 'actor_role', 'action', 'resource_type', 'resource_id', 'subject_patient_id', 'ip_address', 'meta'];
    protected $casts = ['meta' => 'array', 'created_at' => 'datetime'];

    // Append-only: refuse updates and deletes.
    protected static function booted(): void
    {
        static::updating(fn () => false);
        static::deleting(fn () => false);
    }
}
