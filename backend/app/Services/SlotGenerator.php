<?php

namespace App\Services;

use App\Models\AppointmentSlot;
use App\Models\Clinician;
use Carbon\CarbonImmutable;

class SlotGenerator
{
    /** Create slots from weekly availability for the next $days days. Idempotent. */
    public static function generate(Clinician $c, int $days = 14): int
    {
        $created = 0;
        $start = CarbonImmutable::today();
        $rules = $c->availability()->get()->groupBy('weekday');
        for ($d = 0; $d <= $days; $d++) {
            $day = $start->addDays($d);
            foreach ($rules->get($day->dayOfWeek, []) as $r) {
                $cursor = $day->setTimeFromTimeString($r->start_time);
                $end = $day->setTimeFromTimeString($r->end_time);
                while ($cursor->addMinutes($r->slot_minutes) <= $end) {
                    $slot = AppointmentSlot::firstOrCreate(
                        ['clinician_id' => $c->id, 'starts_at' => $cursor],
                        ['ends_at' => $cursor->addMinutes($r->slot_minutes), 'status' => 'open'],
                    );
                    $created += $slot->wasRecentlyCreated ? 1 : 0;
                    $cursor = $cursor->addMinutes($r->slot_minutes);
                }
            }
        }
        return $created;
    }
}
