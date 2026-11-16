<?php

namespace Database\Seeders;

use App\Models\Appointment;
use App\Models\ClinicalNote;
use App\Models\Clinician;
use App\Models\ClinicianAvailability;
use App\Models\Consent;
use App\Models\PatientProfile;
use App\Models\User;
use App\Services\AppointmentService;
use App\Services\SlotGenerator;
use Illuminate\Database\Seeder;

/** SYNTHETIC DATA ONLY. Every person, email and note here is fictional. */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $pw = 'Password123!';
        $admin = User::create(['name' => 'Ada Admin (demo)', 'email' => 'admin@demo.test', 'password' => $pw, 'role' => 'administrator']);
        User::create(['name' => 'Rita Reception (demo)', 'email' => 'reception@demo.test', 'password' => $pw, 'role' => 'receptionist']);

        $clinicians = [];
        foreach ([['Dr. Cleo Carter (demo)', 'clinician1@demo.test', 'General Practice', 'R1'],
                  ['Dr. Omar Okafor (demo)', 'clinician2@demo.test', 'Paediatrics', 'R2']] as [$n, $e, $s, $room]) {
            $u = User::create(['name' => $n, 'email' => $e, 'password' => $pw, 'role' => 'clinician']);
            $c = Clinician::create(['user_id' => $u->id, 'specialty' => $s, 'room' => $room]);
            foreach ([1, 2, 3, 4, 5] as $wd) {
                ClinicianAvailability::create(['clinician_id' => $c->id, 'weekday' => $wd, 'start_time' => '09:00', 'end_time' => '12:00', 'slot_minutes' => 30]);
                ClinicianAvailability::create(['clinician_id' => $c->id, 'weekday' => $wd, 'start_time' => '13:00', 'end_time' => '16:00', 'slot_minutes' => 30]);
            }
            SlotGenerator::generate($c, 21);
            $clinicians[] = $c;
        }

        $patients = [];
        foreach ([['Pat Patient (demo)', 'patient1@demo.test', true], ['Sam Sample (demo)', 'patient2@demo.test', false]] as [$n, $e, $consent]) {
            $u = User::create(['name' => $n, 'email' => $e, 'password' => $pw, 'role' => 'patient']);
            PatientProfile::create(['user_id' => $u->id, 'date_of_birth_demo' => '1990-01-01', 'phone_demo' => '000-0000']);
            foreach (Consent::TYPES as $t) {
                Consent::create(['patient_id' => $u->id, 'type' => $t, 'granted' => $consent, 'granted_at' => $consent ? now() : null]);
            }
            $patients[] = $u;
        }

        // One confirmed appointment with a demo note, one pending request.
        $svc = app(AppointmentService::class);
        $slots = $clinicians[0]->slots()->where('starts_at', '>', now())->orderBy('starts_at')->limit(3)->get();
        if ($slots->count() >= 2) {
            $a = $svc->request($patients[0], $patients[0]->id, $slots[0]->id, 'Routine check-up (demo)');
            $a = $svc->transition($admin, $a, 'confirmed');
            ClinicalNote::create([
                'appointment_id' => $a->id, 'patient_id' => $patients[0]->id, 'clinician_id' => $a->clinician_id,
                'body' => 'DEMO NOTE: Fictional follow-up in two weeks. Not real medical data.',
            ]);
            $svc->request($patients[1], $patients[1]->id, $slots[1]->id, 'Question about schedule (demo)');
        }
    }
}
