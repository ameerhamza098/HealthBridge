<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('patient_profiles_demo', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $t->date('date_of_birth_demo')->nullable();
            $t->string('phone_demo', 30)->nullable();
            $t->timestamps();
        });

        Schema::create('clinicians', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $t->string('specialty', 80);
            $t->string('room', 20)->nullable();
            $t->timestamps();
        });

        Schema::create('clinician_availability', function (Blueprint $t) {
            $t->id();
            $t->foreignId('clinician_id')->constrained()->cascadeOnDelete();
            $t->unsignedTinyInteger('weekday'); // 0=Sun..6=Sat
            $t->time('start_time');
            $t->time('end_time');
            $t->unsignedSmallInteger('slot_minutes')->default(30);
            $t->timestamps();
            $t->unique(['clinician_id', 'weekday', 'start_time']);
        });

        Schema::create('appointment_slots', function (Blueprint $t) {
            $t->id();
            $t->foreignId('clinician_id')->constrained()->cascadeOnDelete();
            $t->dateTime('starts_at');
            $t->dateTime('ends_at');
            $t->string('status', 10)->default('open'); // open | blocked
            $t->timestamps();
            // A clinician can have only one slot per start time.
            $t->unique(['clinician_id', 'starts_at']);
            $t->index('starts_at');
        });

        Schema::create('appointments', function (Blueprint $t) {
            $t->id();
            $t->foreignId('patient_id')->constrained('users')->cascadeOnDelete();
            $t->foreignId('clinician_id')->constrained();
            $t->foreignId('slot_id')->constrained('appointment_slots');
            // requested | confirmed | rejected | cancelled | rescheduled | completed
            $t->string('status', 15)->index();
            // Equals slot_id while the appointment holds the slot, NULL otherwise.
            // The UNIQUE index is the database-level double-booking guard.
            $t->unsignedBigInteger('active_slot_id')->nullable()->unique();
            $t->string('reason', 200)->nullable(); // synthetic, non-clinical
            $t->foreignId('rescheduled_from_id')->nullable()->constrained('appointments');
            $t->timestamps();
            $t->index(['patient_id', 'status']);
        });

        Schema::create('appointment_status_history', function (Blueprint $t) {
            $t->id();
            $t->foreignId('appointment_id')->constrained()->cascadeOnDelete();
            $t->string('from_status', 15)->nullable();
            $t->string('to_status', 15);
            $t->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $t->string('note', 200)->nullable(); // system text only, never clinical
            $t->timestamp('created_at')->useCurrent();
        });

        Schema::create('clinical_notes_demo', function (Blueprint $t) {
            $t->id();
            $t->foreignId('appointment_id')->constrained()->cascadeOnDelete();
            $t->foreignId('patient_id')->constrained('users')->cascadeOnDelete();
            $t->foreignId('clinician_id')->constrained();
            $t->text('body'); // encrypted at rest (model cast)
            $t->timestamps();
            $t->index(['patient_id', 'clinician_id']);
        });

        Schema::create('consents', function (Blueprint $t) {
            $t->id();
            $t->foreignId('patient_id')->constrained('users')->cascadeOnDelete();
            $t->string('type', 30); // records_sharing | notifications
            $t->boolean('granted')->default(false);
            $t->timestamp('granted_at')->nullable();
            $t->timestamp('revoked_at')->nullable();
            $t->timestamps();
            $t->unique(['patient_id', 'type']);
        });

        Schema::create('audit_logs', function (Blueprint $t) {
            $t->id();
            $t->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $t->string('actor_role', 20)->nullable();
            $t->string('action', 40)->index();
            $t->string('resource_type', 40)->index();
            $t->unsignedBigInteger('resource_id')->nullable();
            $t->unsignedBigInteger('subject_patient_id')->nullable()->index();
            $t->string('ip_address', 45)->nullable();
            $t->json('meta')->nullable(); // ids/status only; never note content
            $t->timestamp('created_at')->useCurrent()->index();
        });

        Schema::create('notifications', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('channel', 10)->default('email');
            $t->string('type', 40);
            $t->json('payload'); // minimal: appointment id + generic text
            $t->timestamp('sent_at')->nullable();
            $t->timestamp('read_at')->nullable();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['notifications', 'audit_logs', 'consents', 'clinical_notes_demo', 'appointment_status_history',
                  'appointments', 'appointment_slots', 'clinician_availability', 'clinicians', 'patient_profiles_demo'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
