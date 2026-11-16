<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Clinician;
use App\Models\User;
use App\Services\Audit;
use Illuminate\Http\Request;

class AdminController extends Controller
{
    public function auditLogs(Request $r)
    {
        $q = AuditLog::query()->latest('id');
        foreach (['action', 'resource_type', 'actor_id', 'subject_patient_id'] as $f) {
            if ($r->filled($f)) {
                $q->where($f, $r->query($f));
            }
        }
        return $q->paginate(50);
    }

    public function users()
    {
        return User::orderBy('role')->orderBy('name')->get(['id', 'name', 'email', 'role', 'is_active']);
    }

    public function createStaff(Request $r)
    {
        $data = $r->validate([
            'name' => 'required|string|max:100',
            'email' => 'required|email|unique:users,email',
            'password' => 'required|string|min:8',
            'role' => 'required|in:clinician,receptionist,administrator',
            'specialty' => 'required_if:role,clinician|nullable|string|max:80',
            'room' => 'nullable|string|max:20',
        ]);
        $u = User::create(['name' => $data['name'], 'email' => $data['email'], 'password' => $data['password'], 'role' => $data['role']]);
        if ($u->role === User::CLINICIAN) {
            Clinician::create(['user_id' => $u->id, 'specialty' => $data['specialty'], 'room' => $data['room'] ?? null]);
        }
        Audit::log($r->user(), 'create', 'user', $u->id, null, ['role' => $u->role]);
        return response()->json(['id' => $u->id], 201);
    }

    public function setActive(Request $r, User $user)
    {
        $data = $r->validate(['is_active' => 'required|boolean']);
        abort_if($user->id === $r->user()->id, 422, 'You cannot deactivate your own account.');
        $user->update($data);
        if (! $user->is_active) {
            $user->tokens()->delete();
        }
        Audit::log($r->user(), 'update', 'user', $user->id, null, ['status' => $user->is_active ? 'active' : 'inactive']);
        return ['id' => $user->id, 'is_active' => $user->is_active];
    }
}
