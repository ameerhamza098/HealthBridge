<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

/**
 * Bonus: appointment-policy FAQ assistant.
 * Answers ONLY from the approved, non-sensitive FAQ below. It never reads
 * appointments, patients or clinical notes. If an AI API key is configured
 * the model is only given the approved FAQ text and the question; otherwise a
 * keyword matcher is used. Unsupported questions get a safe fallback.
 */
class FaqController extends Controller
{
    public const FALLBACK = "I can only help with general appointment-policy questions. For anything else, please contact the clinic front desk.";

    public const FAQ = [
        ['k' => ['cancel', 'cancellation'], 'a' => 'You can cancel any active appointment from the Appointments page. Please cancel at least 24 hours ahead so the slot can be offered to others.'],
        ['k' => ['reschedule', 'move', 'change'], 'a' => 'Use Reschedule on an active appointment and pick a new open slot. Your original slot is released only if the new one is available.'],
        ['k' => ['request', 'book', 'booking'], 'a' => 'Search for an open slot, then submit a request. The front desk reviews it and you will be notified when it is confirmed.'],
        ['k' => ['late', 'arrive', 'arrival'], 'a' => 'Please arrive 10 minutes early. Arrivals more than 15 minutes late may need to be rescheduled.'],
        ['k' => ['hours', 'open', 'opening'], 'a' => 'This demo clinic is open Monday to Friday, 09:00 to 17:00. All data is fictional.'],
        ['k' => ['privacy', 'consent', 'notes', 'data'], 'a' => 'Clinical notes are visible only to you and your treating clinician, and only with your consent. Notifications never contain note content.'],
    ];

    public function ask(Request $r)
    {
        $q = $r->validate(['question' => 'required|string|max:300'])['question'];
        $lower = mb_strtolower($q);

        // Refuse anything that tries to reach private records.
        if (preg_match('/\b(my|his|her|their|patient)\b.*\b(note|notes|diagnos|record|result|medication)/', $lower)) {
            return ['answer' => self::FALLBACK, 'source' => 'fallback'];
        }

        $answer = null;
        foreach (self::FAQ as $item) {
            foreach ($item['k'] as $k) {
                if (str_contains($lower, $k)) { $answer = $item['a']; break 2; }
            }
        }
        if ($answer === null) {
            return ['answer' => self::FALLBACK, 'source' => 'fallback'];
        }

        if ($key = config('services.anthropic.key')) {
            try {
                $faqText = implode("\n", array_column(self::FAQ, 'a'));
                $resp = Http::withHeaders(['x-api-key' => $key, 'anthropic-version' => '2023-06-01'])->timeout(10)
                    ->post('https://api.anthropic.com/v1/messages', [
                        'model' => config('services.anthropic.model'), 'max_tokens' => 200,
                        'system' => "Answer using ONLY this approved clinic FAQ. If unsupported, reply exactly: ".self::FALLBACK."\n\n".$faqText,
                        'messages' => [['role' => 'user', 'content' => $q]],
                    ]);
                if ($resp->ok() && ($t = $resp->json('content.0.text'))) {
                    return ['answer' => $t, 'source' => 'ai'];
                }
            } catch (\Throwable) {
                // fall through to the approved static answer
            }
        }
        return ['answer' => $answer, 'source' => 'faq'];
    }
}
