<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Clinician;
use App\Models\DoctorApplication;
use App\Models\User;
use App\Services\Audit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rules\Password;

class DoctorApplicationController extends Controller
{
    /** Public: submit an application. Creates no account and grants no access. */
    public function submit(Request $r)
    {
        $r->merge([
            'email' => strtolower(trim((string) $r->input('email'))),
            'license_number' => strtoupper(trim((string) $r->input('license_number'))),
        ]);
        $data = $r->validate([
            'name' => 'required|string|max:100',
            'email' => ['required', 'email', 'max:150', 'unique:users,email', 'unique:doctor_applications,email'],
            'phone' => ['required', 'string', 'max:30', 'regex:/^[0-9+()\-\s.]{7,30}$/'],
            'specialty' => 'required|string|max:80',
            'qualifications' => 'required|string|max:500',
            'license_number' => ['required', 'string', 'max:50', 'unique:doctor_applications,license_number'],
            'experience_years' => 'required|integer|min:0|max:70',
            'password' => ['required', Password::min(8)],
        ], [
            'email.unique' => 'An account or application with this email already exists.',
            'license_number.unique' => 'An application with this license number already exists.',
        ]);
        $app = DoctorApplication::create($data + ['status' => DoctorApplication::PENDING]);
        Audit::log(null, 'create', 'doctor_application', $app->id);
        return response()->json(['message' => 'Application received. An administrator will review it.'], 201);
    }

    public function index(Request $r)
    {
        $q = DoctorApplication::query()->latest('id');
        if ($s = $r->query('status')) {
            $q->where('status', $s);
        }
        Audit::log($r->user(), 'read', 'doctor_application_list');
        return $q->get()->map(fn ($a) => [
            'id' => $a->id, 'name' => $a->name, 'email' => $a->email, 'phone' => $a->phone, 'specialty' => $a->specialty,
            'qualifications' => $a->qualifications, 'license_number' => $a->license_number, 'experience_years' => $a->experience_years,
            'status' => $a->status, 'decision_note' => $a->decision_note, 'reviewed_at' => $a->reviewed_at?->toIso8601String(),
            'created_at' => $a->created_at->toIso8601String(),
        ]);
    }

    public function approve(Request $r, DoctorApplication $application)
    {
        $user = DB::transaction(function () use ($r, $application) {
            $app = DoctorApplication::lockForUpdate()->findOrFail($application->id);
            abort_unless($app->status === DoctorApplication::PENDING, 409, 'This application has already been reviewed.');
            abort_if(User::where('email', $app->email)->exists(), 409, 'An account with this email already exists.');

            // The stored password is already hashed; the "hashed" cast leaves hashed values untouched.
            $u = User::create(['name' => $app->name, 'email' => $app->email, 'password' => $app->getRawOriginal('password'), 'role' => User::CLINICIAN]);
            Clinician::create(['user_id' => $u->id, 'specialty' => $app->specialty]);
            $app->forceFill(['status' => DoctorApplication::APPROVED, 'reviewed_by' => $r->user()->id, 'reviewed_at' => now(), 'user_id' => $u->id])->save();
            return $u;
        });
        Audit::log($r->user(), 'update', 'doctor_application', $application->id, null, ['to' => 'approved', 'user_id' => $user->id]);
        return ['id' => $application->id, 'status' => DoctorApplication::APPROVED, 'user_id' => $user->id];
    }

    public function reject(Request $r, DoctorApplication $application)
    {
        $data = $r->validate(['note' => 'nullable|string|max:200']);
        DB::transaction(function () use ($r, $application, $data) {
            $app = DoctorApplication::lockForUpdate()->findOrFail($application->id);
            abort_unless($app->status === DoctorApplication::PENDING, 409, 'This application has already been reviewed.');
            $app->forceFill(['status' => DoctorApplication::REJECTED, 'reviewed_by' => $r->user()->id, 'reviewed_at' => now(), 'decision_note' => $data['note'] ?? null])->save();
        });
        Audit::log($r->user(), 'update', 'doctor_application', $application->id, null, ['to' => 'rejected']);
        return ['id' => $application->id, 'status' => DoctorApplication::REJECTED];
    }
}
