<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\AuditLog;
use App\Models\ClinicalNote;
use App\Services\AppointmentService;
use Laravel\Sanctum\Sanctum;

class AccessControlTest extends ClinicTestCase
{
    private function setupVisit(bool $consent = true): array
    {
        [$cu, $c] = $this->clinician();
        $p = $this->patient($consent);
        $admin = $this->user('administrator');
        $svc = app(AppointmentService::class);
        $a = $svc->request($p, $p->id, $this->slot($c)->id, 'Check-up');
        $a = $svc->transition($admin, $a, 'confirmed');
        ClinicalNote::create(['appointment_id' => $a->id, 'patient_id' => $p->id, 'clinician_id' => $c->id, 'body' => 'SECRET-DEMO-NOTE']);
        return [$cu, $c, $p, $a];
    }

    public function test_patient_cannot_read_another_patients_appointment_or_notes(): void
    {
        [, , $p, $a] = $this->setupVisit();
        $intruder = $this->patient();
        $this->as($intruder);
        $this->getJson("/api/appointments/{$a->id}")->assertForbidden();
        $this->getJson("/api/patients/{$p->id}/notes")->assertForbidden();
        $this->getJson("/api/patients/{$p->id}/timeline")->assertForbidden();
        $this->postJson("/api/appointments/{$a->id}/cancel")->assertForbidden();
        $this->assertSame('confirmed', $a->fresh()->status);
    }

    public function test_receptionist_and_admin_never_read_notes(): void
    {
        [, , $p] = $this->setupVisit();
        foreach (['receptionist', 'administrator'] as $role) {
            $this->as($this->user($role));
            $this->getJson("/api/patients/{$p->id}/notes")->assertForbidden();
        }
    }

    public function test_receptionist_can_see_timeline_without_notes(): void
    {
        [, , $p] = $this->setupVisit();
        $this->as($this->user('receptionist'));
        $r = $this->getJson("/api/patients/{$p->id}/timeline")->assertOk();
        $this->assertStringNotContainsString('SECRET-DEMO-NOTE', $r->getContent());
    }

    public function test_treating_clinician_reads_notes_only_with_consent(): void
    {
        [$cu, , $p] = $this->setupVisit(true);
        $this->as($cu);
        $this->getJson("/api/patients/{$p->id}/notes")->assertOk()->assertJsonPath('0.body', 'SECRET-DEMO-NOTE');

        $this->as($p);
        $this->putJson('/api/consents', ['type' => 'records_sharing', 'granted' => false])->assertOk();
        $this->as($cu);
        $this->getJson("/api/patients/{$p->id}/notes")->assertForbidden();
    }

    public function test_unrelated_clinician_cannot_read_notes(): void
    {
        [, , $p, $a] = $this->setupVisit();
        [$other] = $this->clinician();
        $this->as($other);
        $this->getJson("/api/patients/{$p->id}/notes")->assertForbidden();
        $this->getJson("/api/appointments/{$a->id}")->assertForbidden();
        $this->postJson("/api/appointments/{$a->id}/notes", ['body' => 'x'])->assertForbidden();
    }

    public function test_patient_cannot_use_staff_or_admin_endpoints(): void
    {
        $p = $this->patient();
        $this->as($p);
        $this->getJson('/api/schedule')->assertForbidden();
        $this->getJson('/api/queue')->assertForbidden();
        $this->getJson('/api/admin/audit-logs')->assertForbidden();
        $this->getJson('/api/admin/users')->assertForbidden();
    }

    public function test_only_admin_reads_audit_logs(): void
    {
        foreach (['receptionist', 'clinician'] as $role) {
            $this->as($this->user($role));
            $this->getJson('/api/admin/audit-logs')->assertForbidden();
        }
        $this->as($this->user('administrator'));
        $this->getJson('/api/admin/audit-logs')->assertOk();
    }

    public function test_unauthenticated_requests_are_rejected(): void
    {
        $this->getJson('/api/appointments')->assertUnauthorized();
        $this->getJson('/api/patients/1/notes')->assertUnauthorized();
    }

    public function test_clinician_writes_note_and_reads_are_audited_without_content(): void
    {
        [$cu, , $p, $a] = $this->setupVisit();
        $this->as($cu);
        $this->postJson("/api/appointments/{$a->id}/notes", ['body' => 'UNIQUE-NOTE-TEXT-42'])->assertCreated();
        $this->getJson("/api/patients/{$p->id}/notes")->assertOk();

        $this->assertTrue(AuditLog::where(['action' => 'create', 'resource_type' => 'clinical_note', 'actor_id' => $cu->id])->exists());
        $read = AuditLog::where(['action' => 'read', 'resource_type' => 'clinical_note', 'actor_id' => $cu->id])->first();
        $this->assertNotNull($read);
        $this->assertSame($p->id, $read->subject_patient_id);
        $this->assertNotNull($read->created_at);
        $this->assertStringNotContainsString('UNIQUE-NOTE-TEXT-42', json_encode(AuditLog::all()->toArray()));
        $this->assertStringNotContainsString('SECRET-DEMO-NOTE', json_encode(AuditLog::all()->toArray()));
    }

    public function test_denied_attempts_are_audited(): void
    {
        [, , $p] = $this->setupVisit();
        $i = $this->patient();
        $this->as($i);
        $this->getJson("/api/patients/{$p->id}/notes")->assertForbidden();
        $this->assertTrue(AuditLog::where(['action' => 'denied', 'actor_id' => $i->id, 'subject_patient_id' => $p->id])->exists());
    }

    public function test_notes_are_encrypted_at_rest(): void
    {
        [, , , $a] = $this->setupVisit();
        $raw = \DB::table('clinical_notes_demo')->where('appointment_id', $a->id)->value('body');
        $this->assertStringNotContainsString('SECRET-DEMO-NOTE', $raw);
    }

    public function test_audit_log_is_append_only(): void
    {
        $this->user('patient');
        $log = AuditLog::create(['action' => 'read', 'resource_type' => 'x']);
        $log->update(['action' => 'tampered']);
        $log->delete();
        $this->assertSame('read', $log->fresh()->action);
    }

    public function test_error_responses_do_not_leak_details(): void
    {
        [, , $p, $a] = $this->setupVisit();
        $this->as($this->patient());
        $r = $this->getJson("/api/appointments/{$a->id}")->assertForbidden();
        $this->assertStringNotContainsString('SECRET', $r->getContent());
        $this->assertStringNotContainsString($p->name, $r->getContent());
        $this->getJson('/api/appointments/99999')->assertNotFound()->assertExactJson(['message' => 'Not found.']);
    }

    public function test_patient_cannot_book_on_behalf_of_other_patient(): void
    {
        [, $c] = $this->clinician();
        $slot = $this->slot($c);
        $victim = $this->patient();
        $attacker = $this->patient();
        $this->as($attacker);
        $id = $this->postJson('/api/appointments', ['slot_id' => $slot->id, 'patient_id' => $victim->id])->assertCreated()->json('id');
        $this->assertSame($attacker->id, Appointment::find($id)->patient_id);
    }
}
