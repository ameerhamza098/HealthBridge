<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('doctor_applications', function (Blueprint $t) {
            $t->id();
            $t->string('name', 100);
            $t->string('email', 150)->unique();
            $t->string('phone', 30);
            $t->string('specialty', 80);
            $t->string('qualifications', 500);
            $t->string('license_number', 50)->unique();
            $t->unsignedTinyInteger('experience_years');
            $t->string('password'); // hashed; becomes the new doctor login password on approval
            // pending | approved | rejected
            $t->string('status', 10)->default('pending')->index();
            $t->string('decision_note', 200)->nullable();
            $t->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('reviewed_at')->nullable();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('doctor_applications');
    }
};
