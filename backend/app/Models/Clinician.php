<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Clinician extends Model
{
    protected $fillable = ['user_id', 'specialty', 'room'];

    public function user(): BelongsTo { return $this->belongsTo(User::class); }
    public function availability(): HasMany { return $this->hasMany(ClinicianAvailability::class); }
    public function slots(): HasMany { return $this->hasMany(AppointmentSlot::class); }
}
