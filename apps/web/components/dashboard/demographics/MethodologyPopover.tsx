'use client';
import type { DemographicsResponse } from '@leaddesk/shared';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export function MethodologyPopover({ thresholds }: { thresholds: DemographicsResponse['thresholds'] }) {
  return (
    <Popover>
      <PopoverTrigger className="text-xs underline" aria-label="How these numbers are calculated">
        Methodology
      </PopoverTrigger>
      <PopoverContent className="w-80 text-xs">
        <p>Conversion = won ÷ (won + lost) for leads closed in the period.</p>
        <p className="mt-1">Channel mix and model interest use leads created in the period, each counted once.</p>
        <p className="mt-1">
          Groups below the minimum sample are hidden: conversion needs {thresholds.conversionMinClosed} closed leads,
          channel mix {thresholds.channelMinLeads} leads, a heatmap cell {thresholds.cellMinCount} leads.
        </p>
      </PopoverContent>
    </Popover>
  );
}
