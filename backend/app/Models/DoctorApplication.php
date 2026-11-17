<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DoctorApplication extends Model
{
    public const PENDING = 'pending';
    public const APPROVED = 'approved';
    public const REJECTED = 'rejected';

    protected $fillable = ['name', 'email', 'phone', 'specialty', 'qualifications', 'license_number', 'experience_years', 'password', 'status'];

    protected $hidden = ['password'];

    protected function casts(): array
    {
        return ['password' => 'hashed', 'reviewed_at' => 'datetime'];
    }
}
