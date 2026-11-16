<?php

namespace Tests\Feature;

use App\Models\ClinicalNote;
use App\Models\Notification;
use App\Services\AppointmentService;
use Laravel\Sanctum\Sanctum;

class NotificationLeakageTest extends ClinicTestCase
{
    public function test_notifications_contain_no_note_or_reason_content(): void
    {
        [, $c] = $this->clinician();
        $p = $this->patient(true);
        $admin = $this->user('administrator');
        $svc = app(AppointmentService::class);

        $a = $svc->request($p, $p->id, $this->slot($c)->id, 'REASON-TEXT-XYZ');
        ClinicalNote::create(['appointment_id' => $a->id, 'patient_id' => $p->id, 'clinician_id' => $c->id, 'body' => 'NOTE-TEXT-ABC']);
        $svc->transition($admin, $a, 'confirmed');
        $svc->transition($admin, $a->fresh(), 'completed');

        $all = json_encode(Notification::all()->toArray());
        $this->assertGreaterThanOrEqual(3, Notification::count());
        foreach (['NOTE-TEXT-ABC', 'REASON-TEXT-XYZ', $p->name, $c->user->name] as $secret) {
            $this->assertStringNotContainsString($secret, $all);
        }
        foreach (Notification::all() as $n) {
            $this->assertEqualsCanonicalizing(['appointment_id', 'message'], array_keys($n->payload));
        }
    }

    public function test_no_notifications_without_consent(): void
    {
        [, $c] = $this->clinician();
        $p = $this->patient(false);
        app(AppointmentService::class)->request($p, $p->id, $this->slot($c)->id, null);
        $this->assertSame(0, Notification::count());
    }

    public function test_patient_sees_only_own_notifications(): void
    {
        [, $c] = $this->clinician();
        $p1 = $this->patient();
        $p2 = $this->patient();
        app(AppointmentService::class)->request($p1, $p1->id, $this->slot($c)->id, null);
        $this->as($p2);
        $this->getJson('/api/notifications')->assertOk()->assertJsonCount(0);
        $this->as($p1);
        $this->getJson('/api/notifications')->assertOk()->assertJsonCount(1);
    }

    public function test_validation_error_does_not_echo_note_body(): void
    {
        [$cu, $c] = $this->clinician();
        $p = $this->patient();
        $admin = $this->user('administrator');
        $svc = app(AppointmentService::class);
        $a = $svc->transition($admin, $svc->request($p, $p->id, $this->slot($c)->id, null), 'confirmed');
        $this->as($cu);
        $r = $this->postJson("/api/appointments/{$a->id}/notes", ['body' => str_repeat('LEAKME', 500)]);
        $r->assertStatus(422);
        $this->assertStringNotContainsString('LEAKME', $r->getContent());
    }

    public function test_faq_refuses_private_record_questions_and_falls_back(): void
    {
        $this->postJson('/api/faq', ['question' => 'What do my notes say about my diagnosis?'])
            ->assertOk()->assertJsonPath('source', 'fallback');
        $this->postJson('/api/faq', ['question' => 'What is the meaning of life?'])
            ->assertOk()->assertJsonPath('source', 'fallback');
        $this->postJson('/api/faq', ['question' => 'How do I cancel an appointment?'])
            ->assertOk()->assertJsonPath('source', 'faq');
    }
}
