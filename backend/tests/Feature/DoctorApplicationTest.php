<?php

namespace Tests\Feature;

use App\Models\Clinician;
use App\Models\DoctorApplication;
use App\Models\User;

class DoctorApplicationTest extends ClinicTestCase
{
    private function payload(array $o = []): array
    {
        return array_merge([
            'name' => 'Dr. New Doc', 'email' => 'newdoc@demo.test', 'phone' => '+1 555 123 4567', 'specialty' => 'Cardiology',
            'qualifications' => 'MD, Board certified', 'license_number' => 'lic-1001', 'experience_years' => 8, 'password' => 'Password123!',
        ], $o);
    }

    public function test_submission_is_pending_and_creates_no_account(): void
    {
        $this->postJson('/api/doctor-applications', $this->payload())->assertCreated();
        $this->assertDatabaseHas('doctor_applications', ['email' => 'newdoc@demo.test', 'status' => 'pending', 'license_number' => 'LIC-1001']);
        $this->assertDatabaseMissing('users', ['email' => 'newdoc@demo.test']);
        $this->postJson('/api/auth/login', ['email' => 'newdoc@demo.test', 'password' => 'Password123!'])->assertStatus(422);
    }

    public function test_duplicate_email_and_license_are_rejected(): void
    {
        $this->postJson('/api/doctor-applications', $this->payload())->assertCreated();
        $this->postJson('/api/doctor-applications', $this->payload(['license_number' => 'OTHER']))->assertStatus(422)->assertJsonValidationErrors('email');
        $this->postJson('/api/doctor-applications', $this->payload(['email' => 'x@demo.test', 'license_number' => ' LIC-1001 ']))->assertStatus(422)->assertJsonValidationErrors('license_number');
        $existing = $this->user('patient');
        $this->postJson('/api/doctor-applications', $this->payload(['email' => $existing->email, 'license_number' => 'Z9']))->assertStatus(422);
    }

    public function test_only_admin_can_review_and_approval_creates_clinician_who_can_log_in(): void
    {
        $this->postJson('/api/doctor-applications', $this->payload())->assertCreated();
        $app = DoctorApplication::first();
        $this->as($this->user('patient'))->getJson('/api/admin/doctor-applications')->assertForbidden();
        $this->as($this->user('clinician'))->postJson("/api/admin/doctor-applications/{$app->id}/approve")->assertForbidden();

        $this->as($this->user('administrator'))->getJson('/api/admin/doctor-applications')->assertOk()->assertJsonMissingPath('0.password');
        $this->postJson("/api/admin/doctor-applications/{$app->id}/approve")->assertOk();
        $this->postJson("/api/admin/doctor-applications/{$app->id}/approve")->assertStatus(409);

        $u = User::where('email', 'newdoc@demo.test')->firstOrFail();
        $this->assertSame('clinician', $u->role);
        $this->assertTrue(Clinician::where('user_id', $u->id)->where('specialty', 'Cardiology')->exists());

        $this->app['auth']->forgetGuards();
        $login = $this->postJson('/api/auth/login', ['email' => 'newdoc@demo.test', 'password' => 'Password123!'])->assertOk();
        $this->assertSame('clinician', $login->json('user.role'));
    }

    public function test_rejection_creates_no_account(): void
    {
        $this->postJson('/api/doctor-applications', $this->payload())->assertCreated();
        $app = DoctorApplication::first();
        $this->as($this->user('administrator'))->postJson("/api/admin/doctor-applications/{$app->id}/reject", ['note' => 'Unverified'])->assertOk();
        $this->assertDatabaseHas('doctor_applications', ['id' => $app->id, 'status' => 'rejected']);
        $this->assertDatabaseMissing('users', ['email' => 'newdoc@demo.test']);
        $this->postJson("/api/admin/doctor-applications/{$app->id}/approve")->assertStatus(409);
    }
}
