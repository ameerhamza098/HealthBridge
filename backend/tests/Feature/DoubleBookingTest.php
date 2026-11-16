<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Services\AppointmentService;
use Illuminate\Database\UniqueConstraintViolationException;
use Laravel\Sanctum\Sanctum;

class DoubleBookingTest extends ClinicTestCase
{
    public function test_second_patient_cannot_book_same_slot(): void
    {
        [, $c] = $this->clinician();
        $slot = $this->slot($c);
        $p1 = $this->patient();
        $p2 = $this->patient();

        $this->as($p1);
        $this->postJson('/api/appointments', ['slot_id' => $slot->id])->assertCreated();

        $this->as($p2);
        $this->postJson('/api/appointments', ['slot_id' => $slot->id])->assertStatus(409);
        $this->assertSame(1, Appointment::where('slot_id', $slot->id)->count());
    }

    public function test_database_constraint_blocks_double_booking_even_if_app_check_is_bypassed(): void
    {
        [, $c] = $this->clinician();
        $slot = $this->slot($c);
        $row = fn ($p) => ['patient_id' => $p->id, 'clinician_id' => $c->id, 'slot_id' => $slot->id,
            'active_slot_id' => $slot->id, 'status' => 'requested'];
        Appointment::create($row($this->patient()));

        $this->expectException(UniqueConstraintViolationException::class);
        Appointment::create($row($this->patient()));
    }

    public function test_cancelled_slot_can_be_rebooked(): void
    {
        [, $c] = $this->clinician();
        $slot = $this->slot($c);
        $p1 = $this->patient();
        $p2 = $this->patient();

        $this->as($p1);
        $id = $this->postJson('/api/appointments', ['slot_id' => $slot->id])->json('id');
        $this->postJson("/api/appointments/$id/cancel")->assertOk()->assertJsonPath('status', 'cancelled');

        $this->as($p2);
        $this->postJson('/api/appointments', ['slot_id' => $slot->id])->assertCreated();
    }

    public function test_slot_search_hides_booked_slots(): void
    {
        [, $c] = $this->clinician();
        $slot = $this->slot($c);
        $p = $this->patient();
        $this->as($p);
        $this->getJson('/api/slots')->assertJsonCount(1);
        app(AppointmentService::class)->request($p, $p->id, $slot->id, null);
        $this->getJson('/api/slots')->assertJsonCount(0);
    }

    public function test_reschedule_releases_old_slot_and_is_atomic(): void
    {
        [, $c] = $this->clinician();
        $s1 = $this->slot($c, 24);
        $s2 = $this->slot($c, 30);
        $p = $this->patient();
        $other = $this->patient();

        $this->as($p);
        $id = $this->postJson('/api/appointments', ['slot_id' => $s1->id])->json('id');
        $this->postJson("/api/appointments/$id/reschedule", ['slot_id' => $s2->id])->assertCreated();
        $this->assertSame('rescheduled', Appointment::find($id)->status);
        $this->assertNull(Appointment::find($id)->active_slot_id);

        // Rescheduling onto a taken slot fails and leaves the appointment intact.
        $new = Appointment::where('rescheduled_from_id', $id)->first();
        $this->as($other);
        $oid = $this->postJson('/api/appointments', ['slot_id' => $s1->id])->json('id');
        $this->as($p);
        $this->postJson("/api/appointments/{$new->id}/reschedule", ['slot_id' => $s1->id])->assertStatus(409);
        $this->assertSame('requested', $new->fresh()->status);
        $this->assertNotNull($oid);
    }

    public function test_patient_cannot_hold_overlapping_appointments(): void
    {
        [, $c1] = $this->clinician();
        [, $c2] = $this->clinician();
        $a = $this->slot($c1, 24);
        $b = $this->slot($c2, 24);
        $p = $this->patient();
        $this->as($p);
        $this->postJson('/api/appointments', ['slot_id' => $a->id])->assertCreated();
        $this->postJson('/api/appointments', ['slot_id' => $b->id])->assertStatus(409);
    }
}
