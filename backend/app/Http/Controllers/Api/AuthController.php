<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Consent;
use App\Models\PatientProfile;
use App\Models\User;
use App\Services\Audit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;

class AuthController extends Controller
{
    public static function userPayload(User $u): array
    {
        return ['id' => $u->id, 'name' => $u->name, 'email' => $u->email, 'role' => $u->role];
    }

    /** Self-registration creates patients only. */
    public function register(Request $r)
    {
        $data = $r->validate([
            'name' => 'required|string|max:100',
            'email' => 'required|email|max:150|unique:users,email',
            'password' => ['required', Password::min(8)],
        ]);
        $u = User::create($data + ['role' => User::PATIENT]);
        PatientProfile::create(['user_id' => $u->id]);
        foreach (Consent::TYPES as $type) {
            Consent::create(['patient_id' => $u->id, 'type' => $type, 'granted' => false]);
        }
        Audit::log($u, 'create', 'user', $u->id, $u->id);
        return response()->json(['token' => $u->createToken('spa')->plainTextToken, 'user' => self::userPayload($u)], 201);
    }

    public function login(Request $r)
    {
        $data = $r->validate(['email' => 'required|email', 'password' => 'required|string']);
        $u = User::where('email', $data['email'])->first();
        if (! $u || ! $u->is_active || ! Hash::check($data['password'], $u->password)) {
            Audit::log(null, 'login_failed', 'auth');
            // Same response whether the account exists or not.
            return response()->json(['message' => 'Invalid email or password.'], 422);
        }
        Audit::log($u, 'login', 'auth', $u->id);
        return response()->json(['token' => $u->createToken('spa')->plainTextToken, 'user' => self::userPayload($u)]);
    }

    public function logout(Request $r)
    {
        $r->user()->currentAccessToken()->delete();
        return response()->noContent();
    }

    public function me(Request $r)
    {
        return self::userPayload($r->user());
    }
}
