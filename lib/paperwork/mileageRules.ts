export type MileageRateMode = "irs-standard" | "custom";

export interface MileageRuleTrip {
  id: string;
  date: string;
  miles: number;
  parking?: number;
  tolls?: number;
}

export interface MileageRuleFuelRecord {
  cost: number;
  gallons: number;
  odometer: number;
}

export interface MileageRuleDraft {
  taxYear: number;
  rateMode: MileageRateMode;
  customRate: number;
  trips: MileageRuleTrip[];
  fuelRecords: MileageRuleFuelRecord[];
}

export const IRS_MILEAGE_RATE_SCHEDULE = {
  2024: [{ effectiveDate: "2024-01-01", rate: 0.67 }],
  2025: [{ effectiveDate: "2025-01-01", rate: 0.7 }],
  2026: [
    { effectiveDate: "2026-01-01", rate: 0.725 },
    { effectiveDate: "2026-07-01", rate: 0.76 },
  ],
} as const;

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function getMileageRate(
  mode: MileageRateMode,
  taxYear: number,
  tripDate: string,
  customRate: number,
): number {
  const schedule = IRS_MILEAGE_RATE_SCHEDULE[taxYear as keyof typeof IRS_MILEAGE_RATE_SCHEDULE];
  if (!schedule) {
    throw new Error(`IRS mileage rules update required for ${taxYear}.`);
  }
  if (!tripDate.startsWith(`${taxYear}-`)) {
    throw new Error(`Trip date must be within tax year ${taxYear}.`);
  }
  if (mode === "custom") {
    if (!Number.isFinite(customRate) || customRate < 0) {
      throw new Error("Custom mileage rate must be zero or greater.");
    }
    return customRate;
  }

  const rule = [...schedule].reverse().find(({ effectiveDate }) => tripDate >= effectiveDate);
  if (!rule) {
    throw new Error(`IRS mileage rules update required for ${tripDate}.`);
  }
  return rule.rate;
}

export function calculateMileageSummary<TTrip extends MileageRuleTrip>(
  draft: Omit<MileageRuleDraft, "trips"> & { trips: TTrip[] },
) {
  const errors: string[] = [];
  const trips = draft.trips.map((trip) => {
    try {
      const rate = getMileageRate(draft.rateMode, draft.taxYear, trip.date, draft.customRate);
      const mileageAmount = money(Number(trip.miles || 0) * rate);
      const parking = Number(trip.parking || 0);
      const tolls = Number(trip.tolls || 0);
      return {
        ...trip,
        rate,
        amount: money(mileageAmount + parking + tolls),
        mileageAmount,
        parking,
        tolls,
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      return {
        ...trip,
        rate: 0,
        amount: 0,
        mileageAmount: 0,
        parking: Number(trip.parking || 0),
        tolls: Number(trip.tolls || 0),
      };
    }
  });

  const standardMileageDeduction = money(
    trips.reduce((total, trip) => total + trip.mileageAmount, 0),
  );
  const parkingAndTolls = money(
    trips.reduce((total, trip) => total + trip.parking + trip.tolls, 0),
  );
  const totalFuelCost = money(
    draft.fuelRecords.reduce((total, record) => total + Number(record.cost || 0), 0),
  );
  const totalGallons = draft.fuelRecords.reduce(
    (total, record) => total + Number(record.gallons || 0),
    0,
  );
  const sortedFuelRecords = [...draft.fuelRecords].sort(
    (left, right) => Number(left.odometer || 0) - Number(right.odometer || 0),
  );
  const odometerDistance =
    sortedFuelRecords.length > 1
      ? Number(sortedFuelRecords.at(-1)?.odometer || 0) -
        Number(sortedFuelRecords[0]?.odometer || 0)
      : 0;
  const gallonsAfterFirstFill = sortedFuelRecords
    .slice(1)
    .reduce((total, record) => total + Number(record.gallons || 0), 0);

  return {
    trips,
    errors: [...new Set(errors)],
    totalMiles: trips.reduce((total, trip) => total + Number(trip.miles || 0), 0),
    standardMileageDeduction,
    parkingAndTolls,
    totalDeduction: money(standardMileageDeduction + parkingAndTolls),
    totalFuelCost,
    totalGallons,
    fuelEconomy:
      odometerDistance > 0 && gallonsAfterFirstFill > 0
        ? odometerDistance / gallonsAfterFirstFill
        : null,
  };
}
