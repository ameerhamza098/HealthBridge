<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Appointment extends Model
{
    public const ACTIVE = ['requested', 'confirmed'];

    protected $fillable = ['patient_id', 'clinician_id', 'slot_id', 'status', 'active_slot_id', 'reason', 'rescheduled_from_id'];

    public function patient(): BelongsTo { return $this->belongsTo(User::class, 'patient_id'); }
    public function clinician(): BelongsTo { return $this->belongsTo(Clinician::class); }
    public function slot(): BelongsTo { return $this->belongsTo(AppointmentSlot::class, 'slot_id'); }
    public function history(): HasMany { return $this->hasMany(AppointmentStatusHistory::class)->orderBy('id'); }

    public function isActive(): bool { return in_array($this->status, self::ACTIVE, true); }
}
