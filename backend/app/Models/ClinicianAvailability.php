<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ClinicianAvailability extends Model
{
    protected $table = 'clinician_availability';
    protected $fillable = ['clinician_id', 'weekday', 'start_time', 'end_time', 'slot_minutes'];
}
