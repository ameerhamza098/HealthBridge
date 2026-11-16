<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PatientProfile extends Model
{
    protected $table = 'patient_profiles_demo';
    protected $fillable = ['user_id', 'date_of_birth_demo', 'phone_demo'];
}
