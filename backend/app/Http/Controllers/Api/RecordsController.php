<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\ClinicalNote;
use App\Models\Consent;
use App\Models\Notification;
use App\Models\User;
use App\Services\Access;
use App\Services\Audit;
use Illuminate\Http\Request;

class RecordsController extends Controller
{
    private function deny(Request $r, string $type, ?int $id, ?int $patientId)
    {
        Audit::log($r->user(), 'denied', $type, $id, $patientId);
        abort(403, 'You do not have permission to perform this action.');
    }

    /** Appointment timeline (no clinical notes). */
    public function timeline(Request $r, int $patientId)
    {
        $patient = User::where('id', $patientId)->where('role', User::PATIENT)->first();
        if (! $patient || ! Access::viewTimeline($r->user(), $patientId)) {
            $this->deny($r, 'timeline', $patientId, $patientId);
        }
        $u = $r->user();
        $q = Appointment::with('slot', 'clinician.user', 'patient')->where('patient_id', $patientId)->latest('id');
        if ($u->isRole(User::CLINICIAN)) {
            $q->where('clinician_id', $u->clinician->id); // only their own encounters
        }
        Audit::log($u, 'read', 'timeline', $patientId, $patientId);
        return ['patient' => ['id' => $patient->id, 'name' => $patient->name],
            'appointments' => $q->get()->map(fn ($a) => AppointmentController::present($a, true))];
    }

    /** Clinician notes for a patient: patient themself, or treating clinician + consent. */
    public function notes(Request $r, int $patientId)
    {
        if (! Access::readNotes($r->user(), $patientId)) {
            $this->deny($r, 'clinical_note', null, $patientId);
        }
        $notes = ClinicalNote::with('clinician.user')->where('patient_id', $patientId)->latest('id')->get();
        Audit::log($r->user(), 'read', 'clinical_note', null, $patientId, ['count' => $notes->count()]);
        return $notes->map(fn ($n) => [
            'id' => $n->id, 'appointment_id' => $n->appointment_id, 'body' => $n->body,
            'clinician' => $n->clinician->user->name, 'created_at' => $n->created_at->toIso8601String(),
        ]);
    }

    public function addNote(Request $r, Appointment $appointment)
    {
        if (! Access::writeNote($r->user(), $appointment)) {
            $this->deny($r, 'clinical_note', null, $appointment->patient_id);
        }
        $data = $r->validate(['body' => 'required|string|max:2000']);
        $n = ClinicalNote::create([
            'appointment_id' => $appointment->id, 'patient_id' => $appointment->patient_id,
            'clinician_id' => $appointment->clinician_id, 'body' => $data['body'],
        ]);
        Audit::log($r->user(), 'create', 'clinical_note', $n->id, $appointment->patient_id, ['appointment_id' => $appointment->id]);
        return response()->json(['id' => $n->id], 201);
    }

    public function consents(Request $r)
    {
        return Consent::where('patient_id', $r->user()->id)->get(['type', 'granted', 'granted_at', 'revoked_at']);
    }

    public function setConsent(Request $r)
    {
        $data = $r->validate(['type' => 'required|in:'.implode(',', Consent::TYPES), 'granted' => 'required|boolean']);
        $c = Consent::firstOrNew(['patient_id' => $r->user()->id, 'type' => $data['type']]);
        $c->granted = $data['granted'];
        $data['granted'] ? $c->granted_at = now() : $c->revoked_at = now();
        $c->save();
        Audit::log($r->user(), 'update', 'consent', $c->id, $r->user()->id, ['status' => $c->granted ? 'granted' : 'revoked']);
        return $c->only(['type', 'granted', 'granted_at', 'revoked_at']);
    }

    public function notifications(Request $r)
    {
        return Notification::where('user_id', $r->user()->id)->latest('id')->limit(50)
            ->get(['id', 'type', 'payload', 'created_at']);
    }
}
