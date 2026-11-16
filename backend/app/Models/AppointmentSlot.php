<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class AppointmentSlot extends Model
{
    protected $fillable = ['clinician_id', 'starts_at', 'ends_at', 'status'];
    protected $casts = ['starts_at' => 'datetime', 'ends_at' => 'datetime'];

    public function clinician(): BelongsTo { return $this->belongsTo(Clinician::class); }

    public function activeAppointment(): HasOne
    {
        return $this->hasOne(Appointment::class, 'active_slot_id');
    }
}
