<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    public const PATIENT = 'patient';
    public const CLINICIAN = 'clinician';
    public const RECEPTIONIST = 'receptionist';
    public const ADMIN = 'administrator';
    public const ROLES = [self::PATIENT, self::CLINICIAN, self::RECEPTIONIST, self::ADMIN];

    protected $fillable = ['name', 'email', 'password', 'role', 'is_active'];

    protected $attributes = ['is_active' => true];

    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return ['password' => 'hashed', 'is_active' => 'boolean'];
    }

    public function isRole(string ...$roles): bool
    {
        return in_array($this->role, $roles, true);
    }

    public function isStaff(): bool
    {
        return $this->isRole(self::RECEPTIONIST, self::ADMIN);
    }

    public function clinician(): HasOne
    {
        return $this->hasOne(Clinician::class);
    }

    public function profile(): HasOne
    {
        return $this->hasOne(PatientProfile::class);
    }
}
