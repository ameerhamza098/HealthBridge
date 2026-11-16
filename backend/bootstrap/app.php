<?php

use App\Http\Middleware\EnsureRole;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias(['role' => EnsureRole::class]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        // Error bodies are deliberately generic: no model names, SQL, ids or
        // submitted values, so protected details never leak through errors.
        $exceptions->render(function (ModelNotFoundException|NotFoundHttpException $e, Request $request) {
            if ($request->is('api/*')) {
                return response()->json(['message' => 'Not found.'], 404);
            }
        });
        $exceptions->render(function (AuthenticationException $e, Request $request) {
            return response()->json(['message' => 'Please sign in.'], 401);
        });
        $exceptions->render(function (HttpException $e, Request $request) {
            // Always a bare message, even with APP_DEBUG=true (no traces, files or classes).
            if ($request->is('api/*')) {
                $code = $e->getStatusCode();
                return response()->json(
                    ['message' => $code >= 500 ? 'Something went wrong.' : ($e->getMessage() ?: 'Request failed.')],
                    $code,
                );
            }
        });
        $exceptions->render(function (\Throwable $e, Request $request) {
            if ($request->is('api/*') && ! config('app.debug')
                && ! $e instanceof \Illuminate\Validation\ValidationException
                && ! $e instanceof HttpException) {
                return response()->json(['message' => 'Something went wrong.'], 500);
            }
        });

        // Never flash/report request content that could hold note text.
        $exceptions->dontFlash(['body', 'password', 'password_confirmation']);
    })->create();
