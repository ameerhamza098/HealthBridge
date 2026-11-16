<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ClinicalNote extends Model
{
    protected $table = 'clinical_notes_demo';
    protected $fillable = ['appointment_id', 'patient_id', 'clinician_id', 'body'];
    // Encrypted at rest; also never serialised by accident (e.g. into logs).
    protected $casts = ['body' => 'encrypted'];

    public function clinician(): BelongsTo { return $this->belongsTo(Clinician::class); }
}
