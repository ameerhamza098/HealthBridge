<?php

use App\Http\Controllers\Api\AdminController;
use App\Http\Controllers\Api\AppointmentController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\FaqController;
use App\Http\Controllers\Api\RecordsController;
use App\Http\Controllers\Api\StaffController;
use Illuminate\Support\Facades\Route;

Route::post('/auth/register', [AuthController::class, 'register'])->middleware('throttle:10,1');
Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:10,1');
Route::post('/faq', [FaqController::class, 'ask'])->middleware('throttle:20,1');

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    // Search
    Route::get('/clinicians', [AppointmentController::class, 'clinicians']);
    Route::get('/slots', [AppointmentController::class, 'slots']);

    // Appointments (object-level checks happen inside the controller via Access)
    Route::get('/appointments', [AppointmentController::class, 'index']);
    Route::post('/appointments', [AppointmentController::class, 'store']);
    Route::get('/appointments/{appointment}', [AppointmentController::class, 'show']);
    Route::post('/appointments/{appointment}/approve', [AppointmentController::class, 'approve']);
    Route::post('/appointments/{appointment}/reject', [AppointmentController::class, 'reject']);
    Route::post('/appointments/{appointment}/cancel', [AppointmentController::class, 'cancel']);
    Route::post('/appointments/{appointment}/complete', [AppointmentController::class, 'complete']);
    Route::post('/appointments/{appointment}/reschedule', [AppointmentController::class, 'reschedule']);

    // Patient timeline (appointments only) and notes
    Route::get('/patients/{patientId}/timeline', [RecordsController::class, 'timeline']);
    Route::get('/patients/{patientId}/notes', [RecordsController::class, 'notes'])
        ->middleware('role:patient,clinician');
    Route::post('/appointments/{appointment}/notes', [RecordsController::class, 'addNote'])
        ->middleware('role:clinician');

    // Patient self-service
    Route::middleware('role:patient')->group(function () {
        Route::get('/consents', [RecordsController::class, 'consents']);
        Route::put('/consents', [RecordsController::class, 'setConsent']);
        Route::get('/notifications', [RecordsController::class, 'notifications']);
    });

    // Staff scheduling
    Route::middleware('role:receptionist,clinician,administrator')->group(function () {
        Route::get('/schedule', [StaffController::class, 'schedule']);
        Route::get('/queue', [StaffController::class, 'queue']);
        Route::post('/slots/{slot}/block', [StaffController::class, 'blockSlot']);
        Route::get('/clinicians/{clinician}/availability', [StaffController::class, 'availability']);
        Route::post('/clinicians/{clinician}/availability', [StaffController::class, 'setAvailability']);
    });

    // Administration
    Route::middleware('role:administrator')->prefix('admin')->group(function () {
        Route::get('/audit-logs', [AdminController::class, 'auditLogs']);
        Route::get('/users', [AdminController::class, 'users']);
        Route::post('/users', [AdminController::class, 'createStaff']);
        Route::patch('/users/{user}/active', [AdminController::class, 'setActive']);
    });
});
