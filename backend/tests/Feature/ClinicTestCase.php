<?php

namespace Tests\Feature;

use App\Models\AppointmentSlot;
use App\Models\Clinician;
use App\Models\Consent;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

abstract class ClinicTestCase extends TestCase
{
    use RefreshDatabase;

    /** Switch the acting user (resets cached guards so roles do not bleed between calls). */
    protected function as(User $u): static
    {
        $this->app['auth']->forgetGuards();
        \Laravel\Sanctum\Sanctum::actingAs($u);
        return $this;
    }

    protected function user(string $role, array $extra = []): User
    {
        static $n = 0;
        $n++;
        return User::create(array_merge([
            'name' => ucfirst($role)." $n", 'email' => "$role$n@demo.test", 'password' => 'Password123!', 'role' => $role,
        ], $extra));
    }

    protected function patient(bool $consent = true): User
    {
        $u = $this->user('patient');
        foreach (Consent::TYPES as $t) {
            Consent::create(['patient_id' => $u->id, 'type' => $t, 'granted' => $consent]);
        }
        return $u;
    }

    protected function clinician(): array
    {
        $u = $this->user('clinician');
        $c = Clinician::create(['user_id' => $u->id, 'specialty' => 'General', 'room' => 'R1']);
        return [$u, $c];
    }

    protected function slot(Clinician $c, int $hoursAhead = 24, int $minutes = 30): AppointmentSlot
    {
        $start = now()->addHours($hoursAhead)->startOfHour();
        return AppointmentSlot::create([
            'clinician_id' => $c->id, 'starts_at' => $start, 'ends_at' => $start->copy()->addMinutes($minutes), 'status' => 'open',
        ]);
    }
}
