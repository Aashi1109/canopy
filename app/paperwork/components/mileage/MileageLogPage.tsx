"use client";

import { useFormatter, useTranslations } from "next-intl";

import { WorkbenchPanes } from "@/components/tool-workbench/WorkbenchPanes";

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useMemo } from "react";
import type { DocumentTemplate } from "@/lib/invoice-templates/index.ts";
import {
  Caption,
  H3,
  Metric,
  P,
  Text,
  AlertBanner,
  Button,
  ToolActionButton,
  Card,
  Input,
  Label,
  MetricCard,
  Select,
  StatusBadge,
  Tabs,
  TabsList,
  TabsTrigger,
  ToolPageHeader,
} from "@/components/ui/index.tsx";
import {
  FileText,
  Clock,
  Printer,
  FileDown,
  RefreshCw,
  Plus,
  Trash2,
  Copy,
  Check,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Percent,
  CheckCircle,
  HelpCircle,
  ChevronRight,
  Navigation,
  Gauge,
  Milestone,
  Fuel,
} from "lucide-react";
import { DataBridge, DataBridgeKeys, MileageEntry } from "@/lib/paperwork/shared/dataBridge";
import { calculateMileageSummary, MileageRateMode } from "@/lib/paperwork/mileageRules";
import { mileageLogAdapter } from "@/lib/paperwork/documentAdapters";
import AdvancedTemplateWorkspace from "../AdvancedTemplateWorkspace";

export interface MileageFuelRecord {
  id: string;
  date: string;
  gallons: number;
  cost: number;
  merchant: string;
  odometer: number;
}

export interface MileageLogTrip extends MileageEntry {
  parking: number;
  tolls: number;
}

export interface MileageLogDraft {
  taxYear: number;
  rateMode: MileageRateMode;
  customRate: number;
  vehicleModel: string;
  trips: MileageLogTrip[];
  fuelRecords: MileageFuelRecord[];
  notes: string;
}

export const DEFAULT_MILEAGE_DRAFT: MileageLogDraft = {
  taxYear: 2026,
  rateMode: "irs-standard",
  customRate: 0.725,
  vehicleModel: "2024 Tesla Model Y / Hybrid Utility",
  trips: [
    {
      id: "trip-1",
      date: new Date().toISOString().substring(0, 10),
      purpose: "Consulting onsite sprint",
      startLocation: "Asheville Office",
      destination: "CLT Innovation hub",
      startOdometer: 14200,
      endOdometer: 14310,
      miles: 110,
      rate: 0,
      amount: 0,
      parking: 0,
      tolls: 0,
    },
  ],
  fuelRecords: [
    {
      id: "fuel-1",
      date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10),
      gallons: 11.2,
      cost: 38.5,
      merchant: "Shell Station 412",
      odometer: 14190,
    },
  ],
  notes: "Fuel records are informational and do not increase the standard-mileage deduction.",
};

export const SAMPLE_MILEAGE_DRAFT: MileageLogDraft = {
  taxYear: 2026,
  rateMode: "irs-standard",
  customRate: 0.725,
  vehicleModel: "2024 Ford Maverick Hybrid",
  trips: [
    {
      id: "trip-1",
      date: "2026-04-12",
      purpose: "Client pitch review meeting",
      startLocation: "Asheville HQ",
      destination: "Broad St Retail Lab",
      startOdometer: 19120,
      endOdometer: 19175,
      miles: 55,
      rate: 0.725,
      amount: 39.88,
      parking: 8,
      tolls: 0,
    },
    {
      id: "trip-2",
      date: "2026-07-15",
      purpose: "Picked up printed flyer blueprints",
      startLocation: "Asheville HQ",
      destination: "FedEx Print Center CLT",
      startOdometer: 19175,
      endOdometer: 19290,
      miles: 115,
      rate: 0.76,
      amount: 91.4,
      parking: 0,
      tolls: 4,
    },
    {
      id: "trip-3",
      date: "2026-07-20",
      purpose: "Site inspection post development sign-off",
      startLocation: "Charlotte Tech Park",
      destination: "Corporate Center North",
      startOdometer: 19290,
      endOdometer: 19325,
      miles: 35,
      rate: 0.76,
      amount: 26.6,
      parking: 0,
      tolls: 0,
    },
  ],
  fuelRecords: [
    {
      id: "fuel-1",
      date: "2026-04-10",
      gallons: 12.0,
      cost: 42.0,
      merchant: "Shell Asheville Gas",
      odometer: 19050,
    },
    {
      id: "fuel-2",
      date: "2026-04-18",
      gallons: 11.5,
      cost: 40.25,
      merchant: "Chevron CLT Airport",
      odometer: 19220,
    },
  ],
  notes: "Parking and tolls are tracked separately from the mileage rate.",
};

export function normalizeMileageLogDraft(draft: Partial<MileageLogDraft> & { businessRate?: number }): MileageLogDraft {
  return {
    ...DEFAULT_MILEAGE_DRAFT,
    ...draft,
    rateMode: draft.rateMode === "custom" ? "custom" : "irs-standard",
    customRate: Number(draft.customRate ?? draft.businessRate ?? DEFAULT_MILEAGE_DRAFT.customRate),
    trips: (draft.trips || DEFAULT_MILEAGE_DRAFT.trips).map((trip) => ({
      ...trip,
      parking: Number(trip.parking || 0),
      tolls: Number(trip.tolls || 0),
    })),
    fuelRecords: draft.fuelRecords || DEFAULT_MILEAGE_DRAFT.fuelRecords,
    notes: String(draft.notes || ""),
  };
}

export default function MileageLogPage({
  onTrackClick,
  templates = [],
}: {
  onTrackClick: (item: string) => void;
  templates?: readonly DocumentTemplate[];
}) {
  const t = useTranslations("Tool.runtime");
  const format = useFormatter();
  const [data, setData] = useState<MileageLogDraft>(() => {
    return normalizeMileageLogDraft(DataBridge.get(DataBridgeKeys.MILEAGE_DRAFT, DEFAULT_MILEAGE_DRAFT));
  });

  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");
  const [copied, setCopied] = useState(false);
  const mileageSummary = useMemo(
    () =>
      calculateMileageSummary({
        taxYear: data.taxYear,
        rateMode: data.rateMode,
        customRate: data.customRate,
        trips: data.trips,
        fuelRecords: data.fuelRecords,
      }),
    [data],
  );

  // Synchronize draft states
  useEffect(() => {
    // Save to localStorage
    try {
      localStorage.setItem(
        DataBridgeKeys.MILEAGE_DRAFT,
        JSON.stringify({
          ...data,
          trips: mileageSummary.trips,
        }),
      );
    } catch (e) {
      console.error(e);
    }

    // Bridge details for Quarterly tax calculation
    DataBridge.set(DataBridgeKeys.MILEAGE_SUMMARY, {
      year: data.taxYear,
      totalMiles: mileageSummary.totalMiles,
      standardMileageDeduction: mileageSummary.standardMileageDeduction,
      parkingAndTolls: mileageSummary.parkingAndTolls,
      totalAmount: mileageSummary.totalDeduction,
    });
  }, [data, mileageSummary]);

  const handleAddTrip = () => {
    const lastOdo = data.trips.length > 0 ? data.trips[data.trips.length - 1].endOdometer || 0 : 0;
    const newTrip: MileageLogTrip = {
      id: `trip-${Date.now()}`,
      date: new Date().toISOString().substring(0, 10),
      purpose: "",
      startLocation: "",
      destination: "",
      startOdometer: lastOdo || undefined,
      endOdometer: lastOdo ? lastOdo + 10 : undefined,
      miles: 0,
      rate: 0,
      amount: 0,
      parking: 0,
      tolls: 0,
    };
    setData({
      ...data,
      trips: [...data.trips, newTrip],
    });
    onTrackClick("mileage_trip_added");
  };

  const handleRemoveTrip = (id: string) => {
    setData({
      ...data,
      trips: data.trips.filter((t) => t.id !== id),
    });
    onTrackClick("mileage_trip_removed");
  };

  const handleTripChange = (id: string, field: keyof MileageLogTrip, val: any) => {
    const updated = data.trips.map((t) => {
      if (t.id === id) {
        const isNumeric =
          field === "startOdometer" ||
          field === "endOdometer" ||
          field === "miles" ||
          field === "parking" ||
          field === "tolls";
        const u = {
          ...t,
          [field]: isNumeric ? (val === "" ? "" : Number(val)) : val,
        };
        // Auto reconcile miles if start & end odometers are updated
        if (field === "startOdometer" || field === "endOdometer") {
          const start = Number(u.startOdometer || 0);
          const end = Number(u.endOdometer || 0);
          if (end > start) {
            u.miles = end - start;
          }
        }
        return u;
      }
      return t;
    });
    setData({ ...data, trips: updated });
  };

  const handleAddFuel = () => {
    const newFuel: MileageFuelRecord = {
      id: `fuel-${Date.now()}`,
      date: new Date().toISOString().substring(0, 10),
      gallons: 0,
      cost: 0,
      merchant: "",
      odometer: 0,
    };
    setData({
      ...data,
      fuelRecords: [...data.fuelRecords, newFuel],
    });
    onTrackClick("mileage_fuel_added");
  };

  const handleRemoveFuel = (id: string) => {
    setData({
      ...data,
      fuelRecords: data.fuelRecords.filter((f) => f.id !== id),
    });
    onTrackClick("mileage_fuel_removed");
  };

  const handleFuelChange = (id: string, field: keyof MileageFuelRecord, val: any) => {
    const updated = data.fuelRecords.map((f) => {
      if (f.id === id) {
        return {
          ...f,
          [field]:
            field === "gallons" || field === "cost" || field === "odometer" ? (val === "" ? "" : Number(val)) : val,
        };
      }
      return f;
    });
    setData({ ...data, fuelRecords: updated });
  };

  const handleLoadSample = () => {
    setData(SAMPLE_MILEAGE_DRAFT);
    onTrackClick("mileage_sample_loaded");
  };

  const handleClearDraft = () => {
    if (confirm(t("mileage.areYouSureYouWantToClearMileage"))) {
      setData(DEFAULT_MILEAGE_DRAFT);
      onTrackClick("mileage_draft_cleared");
    }
  };

  const stats = {
    totalMiles: mileageSummary.totalMiles,
    totalDue: mileageSummary.totalDeduction,
    avgMiles: data.trips.length ? (mileageSummary.totalMiles / data.trips.length).toFixed(1) : "0",
    fuelEconomy: mileageSummary.fuelEconomy === null ? "N/A" : mileageSummary.fuelEconomy.toFixed(1),
  };

  const handleExportCSV = () => {
    onTrackClick("mileage_csv_exported");
    let content =
      "Date,Business Purpose,Start Location,Destination,Start Odometer,End Odometer,Miles,Effective Rate,Mileage Deduction,Parking,Tolls,Total Deduction\n";
    mileageSummary.trips.forEach((t) => {
      content += `"${t.date}","${t.purpose.replace(/"/g, '""')}","${t.startLocation.replace(/"/g, '""')}","${t.destination.replace(/"/g, '""')}",${t.startOdometer || ""},${t.endOdometer || ""},${t.miles},${t.rate},${t.mileageAmount.toFixed(2)},${t.parking},${t.tolls},${t.amount.toFixed(2)}\n`;
    });

    if (data.fuelRecords.length > 0) {
      content += "\nFUEL & LOGISTIC ENTRIES\n";
      content += "Date,Merchant/Gas Station,Gallons Filled,Total Cost,Odometer Reading\n";
      data.fuelRecords.forEach((f) => {
        content += `"${f.date}","${f.merchant.replace(/"/g, '""')}",${f.gallons},${f.cost},${f.odometer}\n`;
      });
    }

    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `mileage-tax-log-${data.taxYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    onTrackClick("mileage_print_clicked");
    window.print();
  };

  const initialDraft = useRef(JSON.stringify(data));
  const hasEdits = JSON.stringify(data) !== initialDraft.current;

  return (
    <div
      className="grow w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"
      id="mileage-tracker-wrapper"
      data-language-switch-state={hasEdits ? "dirty" : "clean"}
    >
      <ToolPageHeader
        actions={
          <>
            <Button onClick={handleLoadSample} size="sm" variant="secondary">
              <RefreshCw className="size-3.5" />
              <span>{t("mileage.loadSample")}</span>
            </Button>
            <Button onClick={handleClearDraft} size="sm" variant="danger-subtle">
              {t("mileage.clearFields")}
            </Button>
          </>
        }
        className="print:hidden"
        description={t("mileage.logTaxDeductibleDrivingTripsManageFuelConsumption")}
        eyebrow={<StatusBadge variant="success">{t("mileage.irsAuditCompliantMileageFormat")}</StatusBadge>}
        title={t("mileage.mileageLogTracker")}
      />

      <AdvancedTemplateWorkspace
        adapter={mileageLogAdapter}
        draft={data}
        onDraftChange={setData}
        onTrackClick={onTrackClick}
        templates={templates}
      />

      {mileageSummary.errors.length > 0 && (
        <AlertBanner title={t("mileage.mileageRulesNeedAttention")} variant="warning">
          {mileageSummary.errorMessages.map((message) => t(message.key, message.values)).join(" ")}
        </AlertBanner>
      )}

      {/* Metrics Dashboard Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 print:hidden" id="mileage-stats-grid">
        <MetricCard
          className="rounded-2xl border-slate-200/85 bg-white"
          label={t("mileage.totalDrivenMiles")}
          value={
            <Text className="flex items-baseline gap-1.5">
              <Metric className="text-slate-900">{format.number(stats.totalMiles)}</Metric>
              <Caption className="text-slate-500">{t("mileage.miles")}</Caption>
            </Text>
          }
        />

        <MetricCard
          className="rounded-2xl border-slate-200/85 bg-white"
          label={t("mileage.estimatedDeduction")}
          value={
            <Text className="flex items-baseline gap-1">
              <Metric className="text-emerald-600">
                {format.number(stats.totalDue, { style: "currency", currency: "USD" })}
              </Metric>
              <Caption className="text-slate-400">{t("mileage.writeOff")}</Caption>
            </Text>
          }
        />

        <MetricCard
          className="rounded-2xl border-slate-200/85 bg-white"
          label={t("mileage.averageTripLength")}
          value={
            <Text className="flex items-baseline gap-1">
              <Metric className="text-slate-900">
                {format.number(Number(stats.avgMiles), { maximumFractionDigits: 1 })}
              </Metric>
              <Caption className="text-slate-500">{t("mileage.miTrip")}</Caption>
            </Text>
          }
        />

        <MetricCard
          className="rounded-2xl border-slate-200/85 bg-white"
          label={t("mileage.fuelEconomyRating")}
          value={
            <Text className="flex items-baseline gap-1">
              <Metric className="text-blue-600">
                {stats.fuelEconomy !== "N/A"
                  ? format.number(Number(stats.fuelEconomy), { maximumFractionDigits: 1 })
                  : t("mileage.nA")}
              </Metric>
              {stats.fuelEconomy !== "N/A" && <Caption className="text-slate-500">{t("mileage.mpg")}</Caption>}
            </Text>
          }
        />
      </div>

      {/* Mobile tabs mapping */}
      <Tabs
        className="mb-6 md:hidden print:hidden"
        id="mileage-tabs-switch"
        onValueChange={(value) => setActiveTab(value as "edit" | "preview")}
        value={activeTab}
      >
        <TabsList className="grid w-full grid-cols-2 border border-slate-200/50" variant="segmented">
          <TabsTrigger className="whitespace-normal py-1.5" value="edit">
            {t("mileage.label1EditDrivingLogs")}
          </TabsTrigger>
          <TabsTrigger className="whitespace-normal py-1.5" value="preview">
            {t("mileage.label2PrintableRecordsView")}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Editor Grid Split */}
      <WorkbenchPanes className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* EDITING FORM SECTION */}
        <div className={`lg:col-span-7 space-y-6 ${activeTab === "edit" ? "block" : "hidden md:block"} print:hidden`}>
          <Card className="space-y-6">
            {/* Rates & Vehicle info */}
            <div>
              <H3 className="text-slate-500 border-b border-slate-100 pb-2 mb-4">
                {t("mileage.label1VehicleParameters")}
              </H3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="mileage-tax-year">
                    {t("mileage.taxFilingYear")}
                  </Label>
                  <Select
                    id="mileage-tax-year"
                    value={data.taxYear}
                    onChange={(e) => setData({ ...data, taxYear: Number(e.target.value) })}
                  >
                    <option value={2026}>{t("mileage.taxYear2026DateBased")}</option>
                    <option value={2025}>{t("mileage.taxYear202570Mi")}</option>
                    <option value={2024}>{t("mileage.taxYear202467Mi")}</option>
                  </Select>
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="mileage-rate-mode">
                    {t("mileage.rateMode")}
                  </Label>
                  <Select
                    id="mileage-rate-mode"
                    value={data.rateMode}
                    onChange={(e) => setData({ ...data, rateMode: e.target.value as MileageRateMode })}
                  >
                    <option value="irs-standard">{t("mileage.irsStandardByTripDate")}</option>
                    <option value="custom">{t("mileage.customRate")}</option>
                  </Select>
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="mileage-deduction-rate">
                    {t("mileage.customRateMile")}
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.001"
                    disabled={data.rateMode !== "custom"}
                    id="mileage-deduction-rate"
                    value={data.customRate}
                    onChange={(e) => setData({ ...data, customRate: Math.max(0, Number(e.target.value)) })}
                  />
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="mileage-vehicle-model">
                    {t("mileage.vehicleDescriptionModel")}
                  </Label>
                  <Input
                    type="text"
                    id="mileage-vehicle-model"
                    value={data.vehicleModel}
                    onChange={(e) => setData({ ...data, vehicleModel: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Trip items input list */}
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-4">
                <H3 className="text-slate-500">{t("mileage.label2DrivingMileageEntries")}</H3>
                <Button type="button" onClick={handleAddTrip} size="sm" variant="strong">
                  <Plus className="size-3.5" />
                  <span>{t("mileage.addNewTrip")}</span>
                </Button>
              </div>

              <div className="space-y-4">
                {data.trips.map((trip, idx) => (
                  <div
                    key={trip.id}
                    className="p-4 bg-slate-50 border border-slate-200/60 rounded-xl space-y-3 relative"
                  >
                    <Button
                      type="button"
                      onClick={() => handleRemoveTrip(trip.id)}
                      aria-label={t("mileage.removeTrip")}
                      className="absolute right-2 top-2 text-muted-foreground hover:text-destructive"
                      size="icon"
                      variant="ghost"
                    >
                      <Trash2 className="size-4" />
                    </Button>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <Label className="block text-slate-400 mb-1" htmlFor={`mileage-trip-${trip.id}-date`}>
                          {t("mileage.date")}
                        </Label>
                        <Input
                          id={`mileage-trip-${trip.id}-date`}
                          type="date"
                          value={trip.date}
                          onChange={(e) => handleTripChange(trip.id, "date", e.target.value)}
                        />
                      </div>
                      <div className="col-span-2">
                        <Label className="block text-slate-400 mb-1" htmlFor={`mileage-trip-${trip.id}-purpose`}>
                          {t("mileage.purpose")}
                        </Label>
                        <Input
                          type="text"
                          placeholder={t("mileage.eGBroadStreetLabDropOff")}
                          id={`mileage-trip-${trip.id}-purpose`}
                          value={trip.purpose}
                          onChange={(e) => handleTripChange(trip.id, "purpose", e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="block text-slate-500 mb-1" htmlFor={`mileage-trip-${trip.id}-miles`}>
                          {t("mileage.milesDriven")}
                        </Label>
                        <Input
                          type="number"
                          placeholder={t("mileage.eG50")}
                          id={`mileage-trip-${trip.id}-miles`}
                          value={trip.miles || ""}
                          onChange={(e) => handleTripChange(trip.id, "miles", e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-6 gap-3 pt-1 text-slate-500">
                      <div>
                        <Input
                          aria-label={t("mileage.tripValueStartLocation", { value1: idx + 1 })}
                          type="text"
                          placeholder={t("mileage.startLocOptional")}
                          value={trip.startLocation || ""}
                          onChange={(e) => handleTripChange(trip.id, "startLocation", e.target.value)}
                        />
                      </div>
                      <div>
                        <Input
                          aria-label={t("mileage.tripValueDestination", { value1: idx + 1 })}
                          type="text"
                          placeholder={t("mileage.destinationOptional")}
                          value={trip.destination || ""}
                          onChange={(e) => handleTripChange(trip.id, "destination", e.target.value)}
                        />
                      </div>
                      <div>
                        <Input
                          aria-label={t("mileage.tripValueParkingCost", { value1: idx + 1 })}
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder={t("mileage.parking")}
                          value={trip.parking || ""}
                          onChange={(e) => handleTripChange(trip.id, "parking", e.target.value)}
                        />
                      </div>
                      <div>
                        <Input
                          aria-label={t("mileage.tripValueTollCost", { value1: idx + 1 })}
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder={t("mileage.tolls")}
                          value={trip.tolls || ""}
                          onChange={(e) => handleTripChange(trip.id, "tolls", e.target.value)}
                        />
                      </div>
                      <div className="col-span-2 grid grid-cols-2 gap-1.5">
                        <Input
                          aria-label={t("mileage.tripValueStartingOdometer", { value1: idx + 1 })}
                          type="number"
                          placeholder={t("mileage.startOdo")}
                          className="text-center"
                          value={trip.startOdometer || ""}
                          onChange={(e) => handleTripChange(trip.id, "startOdometer", e.target.value)}
                        />
                        <Input
                          aria-label={t("mileage.tripValueEndingOdometer", { value1: idx + 1 })}
                          type="number"
                          placeholder={t("mileage.endOdo")}
                          className="text-center"
                          value={trip.endOdometer || ""}
                          onChange={(e) => handleTripChange(trip.id, "endOdometer", e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Gasoline Fuel Receipts log */}
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-4">
                <H3 className="text-slate-500">{t("mileage.label3FuelPurchaseTrackerForMpgExpenses")}</H3>
                <Button type="button" onClick={handleAddFuel} size="sm" variant="strong">
                  <Plus className="size-3.5" />
                  <span>{t("mileage.addFuelSlip")}</span>
                </Button>
              </div>

              {data.fuelRecords.length === 0 ? (
                <div className="text-center py-6 border border-dashed rounded-xl text-slate-400">
                  <Text>{t("mileage.noFuelReceiptRecordsLoggedEnterGasLogs")}</Text>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.fuelRecords.map((fuel) => (
                    <div
                      key={fuel.id}
                      className="p-3 bg-slate-50 border rounded-xl relative flex flex-col md:flex-row gap-3"
                    >
                      <Button
                        type="button"
                        onClick={() => handleRemoveFuel(fuel.id)}
                        aria-label={t("mileage.removeFuelRecord")}
                        className="absolute right-2 top-2 text-muted-foreground hover:text-destructive"
                        size="icon"
                        variant="ghost"
                      >
                        <Trash2 className="size-4" />
                      </Button>

                      <div className="grow grid grid-cols-2 md:grid-cols-5 gap-2">
                        <div>
                          <Label className="block text-slate-400" htmlFor={`mileage-fuel-${fuel.id}-date`}>
                            {t("mileage.refuelDate")}
                          </Label>
                          <Input
                            id={`mileage-fuel-${fuel.id}-date`}
                            type="date"
                            value={fuel.date}
                            onChange={(e) => handleFuelChange(fuel.id, "date", e.target.value)}
                          />
                        </div>
                        <div className="col-span-2 md:col-span-1">
                          <Label className="block text-slate-400" htmlFor={`mileage-fuel-${fuel.id}-merchant`}>
                            {t("mileage.merchant")}
                          </Label>
                          <Input
                            type="text"
                            placeholder={t("mileage.shellExxon")}
                            id={`mileage-fuel-${fuel.id}-merchant`}
                            value={fuel.merchant}
                            onChange={(e) => handleFuelChange(fuel.id, "merchant", e.target.value)}
                          />
                        </div>
                        <div>
                          <Label className="block text-slate-400" htmlFor={`mileage-fuel-${fuel.id}-gallons`}>
                            {t("mileage.gallons")}
                          </Label>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            id={`mileage-fuel-${fuel.id}-gallons`}
                            value={fuel.gallons || ""}
                            onChange={(e) => handleFuelChange(fuel.id, "gallons", e.target.value)}
                          />
                        </div>
                        <div>
                          <Label className="block text-slate-400" htmlFor={`mileage-fuel-${fuel.id}-cost`}>
                            {t("mileage.cost")}
                          </Label>
                          <Input
                            type="number"
                            placeholder="0.00"
                            id={`mileage-fuel-${fuel.id}-cost`}
                            value={fuel.cost || ""}
                            onChange={(e) => handleFuelChange(fuel.id, "cost", e.target.value)}
                          />
                        </div>
                        <div>
                          <Label className="block text-slate-400" htmlFor={`mileage-fuel-${fuel.id}-odometer`}>
                            {t("mileage.odometer")}
                          </Label>
                          <Input
                            type="number"
                            placeholder={t("mileage.eG19050")}
                            className="text-center"
                            id={`mileage-fuel-${fuel.id}-odometer`}
                            value={fuel.odometer || ""}
                            onChange={(e) => handleFuelChange(fuel.id, "odometer", e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <AlertBanner title={t("mileage.irsMileageLogMandates")} variant="success">
            <P>{t("mileage.taxpayersMustMaintainWrittenRecordsDetailingTripDates")}</P>
          </AlertBanner>
        </div>

        {/* PRINT ACTIONABLE SHEETS COLUMN */}
        <div
          className={`lg:col-span-5 space-y-6 lg:sticky lg:top-20 ${activeTab === "preview" ? "block" : "hidden md:block"}`}
        >
          <Card className="space-y-3 p-4 print:hidden">
            <div className="flex items-center justify-between text-slate-500 border-b border-slate-100 pb-2">
              <Text>{t("mileage.mileageSheetDrivingReport")}</Text>
              <StatusBadge variant="info">{t("mileage.readyToPrint")}</StatusBadge>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button onClick={handlePrint} className="w-full" type="button" variant="strong">
                <Printer className="size-4" />
                <span>{t("mileage.saveToPdf")}</span>
              </Button>
              <ToolActionButton action="download" onClick={handleExportCSV} type="button">
                <span>{t("mileage.exportCsvSheet")}</span>
              </ToolActionButton>
            </div>
          </Card>

          {/* Formulated sheets paper render */}
          <div className="relative group border border-slate-200 shadow-2xl rounded-2xl">
            <div className="p-8 bg-white min-h-[750px] font-sans text-slate-800" id="receipt-print-area" dir="ltr">
              <div className="flex justify-between items-start border-b border-slate-200 pb-5 mb-6">
                <div>
                  <span className="text-[11px] font-black tracking-widest text-[#0066cc] uppercase">
                    IRS TAX SCHEDULE REPORTING
                  </span>
                  <h1 className="text-xl font-black text-slate-950 mt-1 uppercase">
                    MILEAGE &amp; TRIP COMPLIANCE LOG
                  </h1>
                  <span className="text-[10px] text-slate-400 font-bold block font-mono mt-1">
                    TAX FILING CALENDAR YEAR {data.taxYear}
                  </span>
                </div>

                <div className="text-right">
                  <div className="bg-slate-100 border border-slate-200 px-3 py-1 font-black text-xs inline-block text-slate-900 rounded font-mono">
                    LOG-M-{data.taxYear}
                  </div>
                  <span className="block text-[11px] text-slate-500 font-bold font-mono mt-2">
                    {data.rateMode === "custom"
                      ? `CUSTOM RATE: $${data.customRate}/mi`
                      : "IRS RATE: EFFECTIVE ON EACH TRIP DATE"}
                  </span>
                </div>
              </div>

              {/* Vehicle credentials */}
              <div className="bg-slate-50 border rounded-xl p-3 mb-6 text-xs flex justify-between font-semibold">
                <div>
                  <span className="text-[11px] text-slate-400 font-extrabold block uppercase tracking-wider mb-0.5">
                    Primary Vehicle
                  </span>
                  <p className="text-slate-900 font-extrabold">{data.vehicleModel || "Registered Tax Vehicle"}</p>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-slate-400 font-extrabold block uppercase tracking-wider mb-0.5">
                    Deduction Sum
                  </span>
                  <p className="text-emerald-700 font-mono font-black">${stats.totalDue.toFixed(2)}</p>
                </div>
              </div>

              {/* Printable Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden mb-6 text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-black uppercase text-slate-400">
                    <tr>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Trip Purpose / Coordinates</th>
                      <th className="py-2.5 px-3 text-center w-16">Miles</th>
                      <th className="py-2.5 px-3 text-right w-24">Write-off</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mileageSummary.trips.map((t, idx) => (
                      <tr key={t.id || idx} className="border-b last:border-b-0 border-slate-200">
                        <td className="py-3 px-3 font-mono text-slate-500">{t.date}</td>
                        <td className="py-3 px-3 font-bold text-slate-900 leading-snug">
                          {t.purpose || "Business Trip Outing"}
                          {(t.startLocation || t.destination) && (
                            <span className="block text-[11px] text-slate-400/80 font-mono leading-none pt-1">
                              From: {t.startLocation || "HQ"} → To: {t.destination || "Site"}
                            </span>
                          )}
                          {t.startOdometer !== undefined && t.endOdometer !== undefined && (
                            <span className="block text-[11px] text-blue-600/80 font-mono leading-none pt-0.5">
                              Odometer Readings: {t.startOdometer} → {t.endOdometer}
                            </span>
                          )}
                          {(t.parking > 0 || t.tolls > 0) && (
                            <span className="block text-[11px] text-slate-500 font-mono leading-none pt-0.5">
                              Parking ${t.parking.toFixed(2)} · Tolls ${t.tolls.toFixed(2)}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-slate-500 font-mono">{t.miles} mi</td>
                        <td className="py-3 px-3 text-right font-mono font-black text-slate-900">
                          ${t.amount.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Fuel record logs representation */}
              {data.fuelRecords.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden mb-6 text-xs">
                  <div className="bg-slate-100/50 px-3 py-1.5 border-b border-slate-200 text-[10px] font-black text-slate-900 uppercase">
                    Refueling Log &amp; Reconciles
                  </div>
                  <table className="w-full text-left">
                    <thead className="bg-slate-50/75 text-[11px] font-black text-slate-400 uppercase">
                      <tr className="border-b">
                        <th className="py-1.5 px-3">Date</th>
                        <th className="py-1.5 px-3">Gas Station Merchant</th>
                        <th className="py-1.5 px-3 text-center">Gallons</th>
                        <th className="py-1.5 px-3 text-right">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.fuelRecords.map((f, idx) => (
                        <tr key={f.id || idx} className="border-b last:border-b-0 border-slate-100">
                          <td className="py-2.5 px-3 font-mono text-slate-500">{f.date}</td>
                          <td className="py-2.5 px-3 font-bold text-slate-700">{f.merchant || "Fuel Fill Station"}</td>
                          <td className="py-2.5 px-3 text-center font-mono">{f.gallons} gal</td>
                          <td className="py-2.5 px-3 text-right font-mono font-black text-slate-800">
                            ${f.cost.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Declarations credentials signatory info */}
              <div className="border-t border-slate-200/80 pt-6 mt-12 text-center text-xs">
                <p className="font-extrabold text-slate-900 uppercase">Audit Records Declaration Sign-off</p>
                <p className="text-[10px] text-slate-500 leading-normal max-w-xl mx-auto mt-2">
                  I hereby declare that this mileage register accurate details of actual miles, calendar dates, and
                  coordinates driven purely in service of corporate business milestones.
                </p>

                <div className="grid grid-cols-2 gap-8 mt-8 max-w-md mx-auto">
                  <div className="space-y-2">
                    <div className="border-b border-slate-300 h-8" />
                    <span className="block text-[11px] uppercase font-bold text-slate-400">Driver Signatory</span>
                  </div>
                  <div className="space-y-2">
                    <div className="border-b border-slate-300 h-8" />
                    <span className="block text-[11px] uppercase font-bold text-slate-400 font-mono">
                      Reconciled date
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </WorkbenchPanes>
    </div>
  );
}
