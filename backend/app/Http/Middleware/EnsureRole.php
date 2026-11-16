<?php

namespace App\Http\Middleware;

use App\Services\Audit;
use Closure;
use Illuminate\Http\Request;

/** Route-level role gate: role:clinician,administrator */
class EnsureRole
{
    public function handle(Request $request, Closure $next, string ...$roles)
    {
        $user = $request->user();
        if (! $user || ! $user->is_active || ! in_array($user->role, $roles, true)) {
            Audit::log($user, 'denied', 'route', null, null, ['path' => $request->path(), 'method' => $request->method()]);
            abort(403, 'You do not have permission to perform this action.');
        }
        return $next($request);
    }
}
