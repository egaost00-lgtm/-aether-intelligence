"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { saveDataset } from "@/lib/datasetStore";

type Row = Record<string, string>;

const navItems = [
  { label: "Overview", icon: "⌂", href: "/" },
  { label: "Analytics", icon: "◫", href: "/analytics" },
  { label: "Data", icon: "▣", href: "/data" },
  { label: "Reports", icon: "▤", href: "/reports" },
];

function cleanName(value: string) {
  return value
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findColumn(columns: string[], keywords: string[]) {
  const normalizedKeywords = keywords.map(cleanName);

  const scored = columns
    .map((column) => {
      const name = cleanName(column);
      let score = 0;

      normalizedKeywords.forEach((keyword) => {
        if (name === keyword) {
          score += 100;
        } else if (name.startsWith(`${keyword} `)) {
          score += 50;
        } else if (name.endsWith(` ${keyword}`)) {
          score += 40;
        } else if (name.includes(keyword)) {
          score += 20;
        }
      });

      return {
        column,
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.column;
}

function toNumber(value: string | undefined) {
  if (!value) return NaN;

  const cleaned = String(value)
    .replace(/[$₹€£,%\s,]/g, "")
    .trim();

  const number = Number(cleaned);

  return Number.isFinite(number) ? number : NaN;
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) return "—";

  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }

  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }

  return Math.round(value).toLocaleString("en-IN");
}

function formatMoney(value: number) {
  if (!Number.isFinite(value)) return "—";

  if (Math.abs(value) >= 1_000_000) {
    return `₹${(value / 1_000_000).toFixed(1)}M`;
  }

  if (Math.abs(value) >= 1_000) {
    return `₹${(value / 1_000).toFixed(1)}K`;
  }

  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

export default function Home() {
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [fileName, setFileName] = useState("");
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("aether-dataset");

      if (saved) {
        const parsed = JSON.parse(saved);

        if (
          parsed &&
          Array.isArray(parsed.rows) &&
          Array.isArray(parsed.columns)
        ) {
          setRows(parsed.rows);
          setColumns(parsed.columns);
          setFileName(parsed.fileName || "Saved Dataset");
          setUploaded(true);
        }
      }
    } catch (err) {
      console.error("Could not restore dataset:", err);
    } finally {
      setHydrated(true);
    }
  }, []);

  const parseCSV = (text: string): Row[] => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      return [];
    }

    const parseLine = (line: string) => {
      const result: string[] = [];
      let current = "";
      let insideQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
          if (insideQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            insideQuotes = !insideQuotes;
          }
        } else if (char === "," && !insideQuotes) {
          result.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }

      result.push(current.trim());

      return result;
    };

    const headers = parseLine(lines[0]).map((header) =>
      header.replace(/^"|"$/g, "").trim()
    );

    return lines.slice(1).map((line) => {
      const values = parseLine(line);

      const row: Row = {};

      headers.forEach((header, index) => {
        row[header] = values[index] ?? "";
      });

      return row;
    });
  };

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;

    setError("");
    setUploading(true);

    try {
      const extension = file.name.split(".").pop()?.toLowerCase();

      if (!["csv", "xlsx", "xls"].includes(extension || "")) {
        throw new Error("Please upload a CSV or Excel file.");
      }

      let parsedRows: Row[] = [];

      if (extension === "csv") {
        const text = await file.text();
        parsedRows = parseCSV(text);
      } else {
        const buffer = await file.arrayBuffer();

        const workbook = XLSX.read(buffer, {
          type: "array",
        });

        const firstSheetName = workbook.SheetNames[0];

        if (!firstSheetName) {
          throw new Error(
            "The Excel file does not contain a worksheet."
          );
        }

        const worksheet = workbook.Sheets[firstSheetName];

        parsedRows = XLSX.utils.sheet_to_json<Row>(worksheet, {
          defval: "",
          raw: false,
        });
      }

      if (!parsedRows.length) {
        throw new Error("The uploaded file appears to be empty.");
      }

      const parsedColumns = Object.keys(parsedRows[0]);

      if (!parsedColumns.length) {
        throw new Error(
          "No columns were detected in the uploaded file."
        );
      }

      setFileName(file.name);
      setColumns(parsedColumns);
      setRows(parsedRows);
      setUploaded(true);

      await saveDataset({
        fileName: file.name,
        columns: parsedColumns,
        rows: parsedRows,
      });

      console.log("Dataset loaded:", {
        fileName: file.name,
        rows: parsedRows.length,
        columns: parsedColumns,
      });
    } catch (err) {
      console.error("UPLOAD ERROR:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Could not read the uploaded file."
      );
    } finally {
      setUploading(false);
    }
  };

  const detected = useMemo(() => {
    const revenueColumn = findColumn(columns, [
      "revenue",
      "sales",
      "net sales",
      "gross sales",
      "sales amount",
      "sales value",
      "order value",
      "order amount",
      "invoice amount",
      "transaction amount",
      "gmv",
      "income",
      "turnover",
      "amount",
    ]);

    const unitsColumn = findColumn(columns, [
      "units",
      "units sold",
      "quantity",
      "quantity sold",
      "qty",
      "qty sold",
      "order quantity",
      "sales quantity",
      "sales qty",
      "volume",
    ]);

    const dateColumn = findColumn(columns, [
      "date",
      "order date",
      "sale date",
      "transaction date",
      "invoice date",
      "purchase date",
      "created date",
      "month",
      "year",
      "period",
    ]);

    const regionColumn = findColumn(columns, [
      "region",
      "sales region",
      "customer region",
      "area",
      "territory",
      "location",
      "state",
      "city",
    ]);

    const productColumn = findColumn(columns, [
      "product",
      "product name",
      "item",
      "item name",
      "service",
      "service name",
      "category",
      "product category",
    ]);

    return {
      revenueColumn,
      unitsColumn,
      dateColumn,
      regionColumn,
      productColumn,
    };
  }, [columns]);

  const datasetMetrics = useMemo(() => {
    const revenueColumn = detected.revenueColumn;
    const unitsColumn = detected.unitsColumn;

    const totalRevenue = revenueColumn
      ? rows.reduce((sum, row) => {
          const value = toNumber(row[revenueColumn]);
          return sum + (Number.isFinite(value) ? value : 0);
        }, 0)
      : 0;

    const totalUnits = unitsColumn
      ? rows.reduce((sum, row) => {
          const value = toNumber(row[unitsColumn]);
          return sum + (Number.isFinite(value) ? value : 0);
        }, 0)
      : 0;

    return {
      totalRevenue,
      totalUnits,
      records: rows.length,
    };
  }, [rows, detected]);

  const trendData = useMemo(() => {
    if (!detected.dateColumn || !detected.revenueColumn) {
      return [];
    }

    const grouped: Record<string, number> = {};

    rows.forEach((row) => {
      const rawDate = row[detected.dateColumn!];
      const value = toNumber(row[detected.revenueColumn!]);

      if (!rawDate || !Number.isFinite(value)) {
        return;
      }

      const date = new Date(rawDate);

      if (Number.isNaN(date.getTime())) {
        return;
      }

      const key = `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}`;

      grouped[key] = (grouped[key] || 0) + value;
    });

    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8)
      .map(([key, value]) => {
        const [year, month] = key.split("-");

        const date = new Date(
          Number(year),
          Number(month) - 1,
          1
        );

        return {
          label: date.toLocaleDateString("en-IN", {
            month: "short",
          }),
          value,
        };
      });
  }, [rows, detected]);

  const growth = useMemo(() => {
    if (trendData.length < 2) {
      return null;
    }

    const first = trendData[0].value;
    const last = trendData[trendData.length - 1].value;

    if (!first) {
      return null;
    }

    return ((last - first) / first) * 100;
  }, [trendData]);

  if (!hydrated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07090d] px-4 text-white">
        <div className="text-center text-sm text-white/40">
          Loading Aether Intelligence...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#07090d] text-white">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[400px] w-[400px] rounded-full bg-orange-500/[0.08] blur-[140px] sm:h-[500px] sm:w-[500px]" />

        <div className="absolute -bottom-40 -right-40 h-[400px] w-[400px] rounded-full bg-emerald-500/[0.06] blur-[140px] sm:h-[500px] sm:w-[500px]" />

        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,.4) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,.4) 1px, transparent 1px)
            `,
            backgroundSize: "64px 64px",
          }}
        />
      </div>

      <div className="relative flex min-h-screen">
        {/* Sidebar */}
        <aside className="hidden w-[250px] shrink-0 border-r border-white/[0.07] bg-white/[0.015] px-5 py-6 lg:block">
          <div className="flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-orange-400 to-emerald-500 text-lg font-bold shadow-[0_0_30px_rgba(249,115,22,0.18)]">
              A
            </div>

            <div>
              <p className="text-sm font-semibold tracking-tight">
                Aether Intelligence
              </p>

              <p className="text-[11px] text-white/40">
                Business Intelligence
              </p>
            </div>
          </div>

          <div className="mt-10">
            <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30">
              Workspace
            </p>

            <nav className="mt-3 space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${
                    item.label === "Overview"
                      ? "border border-white/[0.08] bg-white/[0.08] text-white"
                      : "text-white/45 hover:bg-white/[0.04] hover:text-white"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-lg text-sm ${
                      item.label === "Overview"
                        ? "bg-orange-500/15 text-orange-300"
                        : "bg-white/[0.04] text-white/40"
                    }`}
                  >
                    {item.icon}
                  </span>

                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="absolute bottom-6 left-5 right-5">
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />

                <span className="text-xs text-white/60">
                  Aether systems operational
                </span>
              </div>

              <p className="mt-3 text-[11px] leading-5 text-white/35">
                Upload your business data to activate real
                intelligence.
              </p>
            </div>
          </div>
        </aside>

        {/* Main */}
        <section className="min-w-0 flex-1">
          {/* Hidden file input */}
          <input
            id="overview-upload"
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              handleUpload(e.target.files?.[0]);
              e.currentTarget.value = "";
            }}
          />

          {/* Top bar */}
          <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#07090d]/90 px-4 py-3 backdrop-blur-2xl sm:px-8 sm:py-4">
            <div className="mx-auto flex max-w-[1500px] items-center justify-between">
              <div className="min-w-0">
                <p className="text-[10px] font-medium tracking-[0.16em] text-white/35 lg:hidden">
                  AETHER INTELLIGENCE
                </p>

                <h1 className="truncate text-base font-semibold tracking-tight sm:text-xl">
                  {uploaded ? "Business Intelligence" : "Overview"}
                </h1>
              </div>

              <div className="ml-3 flex shrink-0 items-center gap-2 sm:gap-3">
                <div className="hidden items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white/50 sm:flex">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      uploaded
                        ? "bg-emerald-400"
                        : "bg-white/30"
                    }`}
                  />

                  {uploaded ? "Dataset loaded" : "No dataset"}
                </div>

                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.05] text-xs text-white/70 transition hover:bg-white/[0.09] sm:h-10 sm:w-10 sm:text-sm"
                >
                  AK
                </button>
              </div>
            </div>
          </header>
          {/* Mobile Navigation */}
<nav className="border-b border-white/[0.06] bg-[#07090d]/95 px-4 py-3 lg:hidden">
  <div className="flex gap-2 overflow-x-auto">
    {navItems.map((item) => (
      <Link
        key={item.label}
        href={item.href}
        className={`flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-medium ${
          item.label === "Overview"
            ? "border-orange-400/20 bg-orange-400/[0.08] text-orange-300"
            : "border-white/[0.07] bg-white/[0.035] text-white/50"
        }`}
      >
        <span>{item.icon}</span>
        {item.label}
      </Link>
    ))}
  </div>
</nav>

          <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
            {/* HERO */}
            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div className="min-w-0">
                <div className="mb-3 inline-flex max-w-full items-center gap-2 rounded-full border border-orange-400/15 bg-orange-400/[0.06] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-orange-300 sm:text-[10px] sm:tracking-[0.18em]">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" />

                  <span className="truncate">
                    {uploaded
                      ? "Dataset Intelligence"
                      : "AI Business Intelligence"}
                  </span>
                </div>

                <h2 className="max-w-full break-words text-[2rem] font-semibold leading-[1.08] tracking-[-0.04em] sm:text-4xl">
                  {uploaded ? (
                    <>
                      {fileName}

                      <span className="text-white/35">
                        {" "}
                        is ready.
                      </span>
                    </>
                  ) : (
                    <>
                      Connect your data.

                      <span className="text-white/35">
                        {" "}
                        Turn it into intelligence.
                      </span>
                    </>
                  )}
                </h2>

                <p className="mt-3 max-w-2xl text-sm leading-6 text-white/40">
                  {uploaded
                    ? `${rows.length.toLocaleString()} records · ${columns.length} columns · Your actual data is loaded into Aether Intelligence.`
                    : "Upload your CSV or Excel data to generate real business metrics, trends and AI-powered insights."}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  document
                    .getElementById("overview-upload")
                    ?.click()
                }
                disabled={uploading}
                className="w-full shrink-0 rounded-xl border border-white/10 bg-white/[0.06] px-5 py-3 text-sm font-medium text-white transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50 sm:w-fit"
              >
                {uploading
                  ? "Reading Data..."
                  : uploaded
                  ? "+ Replace Data"
                  : "+ Upload Data"}
              </button>
            </div>

            {/* ERROR */}
            {error && (
              <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-400/[0.06] p-4 text-sm text-red-300">
                {error}
              </div>
            )}

            {!uploaded ? (
              <>
                {/* EMPTY DATA STATE */}
                <div className="mt-6 rounded-2xl border border-white/[0.07] bg-white/[0.035] p-5 sm:mt-8 sm:rounded-3xl sm:p-12">
                  <div className="mx-auto max-w-3xl text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-orange-400/20 bg-orange-400/[0.08] text-xl sm:h-16 sm:w-16 sm:text-2xl">
                      ✦
                    </div>

                    <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-orange-400/15 bg-orange-400/[0.06] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-orange-300 sm:mt-6 sm:text-[10px] sm:tracking-[0.18em]">
                      <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                      Awaiting your data
                    </div>

                    <h3 className="mt-5 text-[1.65rem] font-semibold leading-tight tracking-tight sm:text-3xl">
                      Connect your business data.
                    </h3>

                    <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-white/40 sm:leading-7">
                      Upload a CSV or Excel dataset and Aether
                      Intelligence will calculate your actual
                      business metrics, trends and insights.
                    </p>

                    <button
                      type="button"
                      onClick={() =>
                        document
                          .getElementById("overview-upload")
                          ?.click()
                      }
                      disabled={uploading}
                      className="mt-6 w-full rounded-xl bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50 sm:mt-7 sm:w-auto"
                    >
                      {uploading
                        ? "Reading Data..."
                        : "Upload Dataset →"}
                    </button>

                    <div className="mt-7 grid gap-3 text-left sm:mt-8 sm:grid-cols-3">
                      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4">
                        <p className="text-sm font-medium">
                          Real KPIs
                        </p>

                        <p className="mt-2 text-xs leading-5 text-white/30">
                          Revenue, units and records calculated
                          from your file.
                        </p>
                      </div>

                      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4">
                        <p className="text-sm font-medium">
                          Real Trends
                        </p>

                        <p className="mt-2 text-xs leading-5 text-white/30">
                          Performance trends generated from your
                          actual data.
                        </p>
                      </div>

                      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4">
                        <p className="text-sm font-medium">
                          AI Insights
                        </p>

                        <p className="mt-2 text-xs leading-5 text-white/30">
                          Ask Aether to analyze the uploaded
                          dataset.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4 sm:rounded-3xl sm:p-6">
                  <p className="text-xs text-white/35">
                    Data sources
                  </p>

                  <h3 className="mt-1 text-lg font-semibold">
                    Waiting for connection
                  </h3>

                  <p className="mt-3 text-sm leading-6 text-white/30">
                    No business data is currently connected.
                    Upload a dataset to activate the Aether
                    Intelligence workspace.
                  </p>
                </div>
              </>
            ) : (
              <>
                {/* REAL UPLOADED DATA VIEW */}
                <div className="mt-7">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />

                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
                      Dataset loaded
                    </p>
                  </div>

                  <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                    Your data at a glance
                  </h2>

                  <p className="mt-2 text-sm text-white/35">
                    Aether has loaded your actual file into the
                    workspace.
                  </p>
                </div>

                {/* Dataset info */}
                <div className="mt-5 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.035] p-4 sm:rounded-3xl sm:p-6">
                  <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
                    <div className="min-w-0">
                      <p className="text-xs text-white/35">
                        Uploaded dataset
                      </p>

                      <h3 className="mt-2 break-words text-lg font-semibold sm:text-xl">
                        {fileName}
                      </h3>

                      <p className="mt-2 text-xs text-white/30">
                        CSV / Excel dataset loaded successfully
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
                      <div className="rounded-2xl border border-white/[0.06] bg-black/10 px-3 py-3 sm:px-5 sm:py-4">
                        <p className="text-[10px] uppercase tracking-wider text-white/30">
                          Rows
                        </p>

                        <p className="mt-2 text-lg font-semibold text-emerald-300 sm:text-xl">
                          {rows.length.toLocaleString()}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-white/[0.06] bg-black/10 px-3 py-3 sm:px-5 sm:py-4">
                        <p className="text-[10px] uppercase tracking-wider text-white/30">
                          Columns
                        </p>

                        <p className="mt-2 text-lg font-semibold sm:text-xl">
                          {columns.length}
                        </p>
                      </div>

                      <div className="col-span-2 rounded-2xl border border-white/[0.06] bg-black/10 px-3 py-3 sm:col-span-1 sm:px-5 sm:py-4">
                        <p className="text-[10px] uppercase tracking-wider text-white/30">
                          Status
                        </p>

                        <p className="mt-2 text-lg font-semibold text-emerald-300 sm:text-xl">
                          Ready
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Real KPIs */}
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4 sm:rounded-3xl sm:p-5">
                    <p className="text-xs text-white/35">
                      Total Revenue
                    </p>

                    <p className="mt-3 text-xl font-semibold sm:text-2xl">
                      {detected.revenueColumn
                        ? formatMoney(
                            datasetMetrics.totalRevenue
                          )
                        : "—"}
                    </p>

                    <p className="mt-2 truncate text-xs text-white/25">
                      {detected.revenueColumn
                        ? detected.revenueColumn
                        : "Revenue column not detected"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4 sm:rounded-3xl sm:p-5">
                    <p className="text-xs text-white/35">
                      Units Sold
                    </p>

                    <p className="mt-3 text-xl font-semibold sm:text-2xl">
                      {detected.unitsColumn
                        ? formatNumber(datasetMetrics.totalUnits)
                        : "—"}
                    </p>

                    <p className="mt-2 truncate text-xs text-white/25">
                      {detected.unitsColumn
                        ? detected.unitsColumn
                        : "Units column not detected"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4 sm:rounded-3xl sm:p-5">
                    <p className="text-xs text-white/35">
                      Records
                    </p>

                    <p className="mt-3 text-xl font-semibold sm:text-2xl">
                      {datasetMetrics.records.toLocaleString()}
                    </p>

                    <p className="mt-2 text-xs text-white/25">
                      Actual rows in your file
                    </p>
                  </div>

                  <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.04] p-4 sm:rounded-3xl sm:p-5">
                    <p className="text-xs text-white/35">
                      Direction
                    </p>

                    <p className="mt-3 text-xl font-semibold text-emerald-300 sm:text-2xl">
                      {growth !== null
                        ? `${growth >= 0 ? "+" : ""}${growth.toFixed(
                            1
                          )}%`
                        : "—"}
                    </p>

                    <p className="mt-2 text-xs text-white/25">
                      Based on detected date &amp; revenue
                    </p>
                  </div>
                </div>

                {/* Columns */}
                <div className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4 sm:rounded-3xl sm:p-6">
                  <p className="text-xs text-white/35">
                    Detected columns
                  </p>

                  <h3 className="mt-1 text-lg font-semibold">
                    Your dataset structure
                  </h3>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {columns.map((column) => (
                      <span
                        key={column}
                        className="max-w-full truncate rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 py-2 text-xs text-white/60"
                      >
                        {column}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Preview */}
                <div className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4 sm:rounded-3xl sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-white/35">
                        Live file preview
                      </p>

                      <h3 className="mt-1 text-lg font-semibold">
                        First records
                      </h3>
                    </div>

                    <span className="shrink-0 rounded-full border border-emerald-400/15 bg-emerald-400/[0.06] px-2.5 py-1 text-[9px] text-emerald-300 sm:px-3 sm:text-[10px]">
                      {rows.length.toLocaleString()} records
                    </span>
                  </div>

                  <div className="mt-5 overflow-x-auto rounded-2xl border border-white/[0.06]">
                    <table className="min-w-full text-left text-xs">
                      <thead className="bg-white/[0.04]">
                        <tr>
                          {columns.slice(0, 8).map((column) => (
                            <th
                              key={column}
                              className="whitespace-nowrap px-4 py-3 font-medium text-white/40"
                            >
                              {column}
                            </th>
                          ))}
                        </tr>
                      </thead>

                      <tbody>
                        {rows.slice(0, 8).map(
                          (row, rowIndex) => (
                            <tr
                              key={rowIndex}
                              className="border-t border-white/[0.05]"
                            >
                              {columns
                                .slice(0, 8)
                                .map((column) => (
                                  <td
                                    key={column}
                                    className="max-w-[220px] truncate whitespace-nowrap px-4 py-3 text-white/60"
                                  >
                                    {row[column] || "—"}
                                  </td>
                                ))}
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Trend */}
                <div className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4 sm:rounded-3xl sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-white/35">
                        Performance
                      </p>

                      <h3 className="mt-1 text-lg font-semibold">
                        Revenue trend from your file
                      </h3>
                    </div>

                    {growth !== null && (
                      <span className="shrink-0 rounded-full border border-emerald-400/15 bg-emerald-400/[0.06] px-2.5 py-1 text-[9px] text-emerald-300 sm:px-3 sm:text-[10px]">
                        {growth >= 0
                          ? "Growing"
                          : "Declining"}
                      </span>
                    )}
                  </div>

                  {trendData.length > 0 ? (
                    <div className="mt-8 flex h-48 items-end gap-1.5 sm:h-56 sm:gap-2">
                      {trendData.map((item, index) => {
                        const max = Math.max(
                          ...trendData.map(
                            (x) => x.value
                          )
                        );

                        const height =
                          max > 0
                            ? Math.max(
                                8,
                                (item.value / max) *
                                  100
                              )
                            : 8;

                        return (
                          <div
                            key={`${item.label}-${index}`}
                            className="flex h-full min-w-0 flex-1 flex-col justify-end"
                          >
                            <div className="mb-2 truncate text-center text-[8px] text-white/35 sm:text-[9px]">
                              {formatNumber(item.value)}
                            </div>

                            <div
                              className="w-full rounded-t-lg bg-gradient-to-t from-orange-500/70 to-orange-300/90"
                              style={{
                                height: `${height}%`,
                              }}
                            />

                            <div className="mt-2 truncate text-center text-[9px] text-white/30 sm:text-[10px]">
                              {item.label}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-8 rounded-2xl border border-white/[0.06] bg-black/10 p-6 text-center text-sm text-white/30 sm:p-8">
                      A date column and revenue column are
                      required to generate the trend.
                    </div>
                  )}
                </div>

                {/* AI workspace */}
                <div className="mt-5 rounded-2xl border border-orange-400/15 bg-gradient-to-br from-orange-500/[0.10] via-white/[0.035] to-emerald-500/[0.06] p-4 sm:rounded-3xl sm:p-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-emerald-400 text-lg sm:h-11 sm:w-11 sm:text-xl">
                      ✦
                    </div>

                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-orange-300">
                        Aether AI
                      </p>

                      <h3 className="mt-1 text-base font-semibold sm:text-lg">
                        Dataset intelligence ready
                      </h3>
                    </div>
                  </div>

                  <p className="mt-5 max-w-3xl text-sm leading-6 text-white/50 sm:leading-7">
                    Your actual dataset is loaded. Continue to
                    Analytics or AI Analyst to generate deeper
                    business insights.
                  </p>

                  <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                    <Link
                      href="/analytics"
                      className="rounded-xl bg-white px-5 py-3 text-center text-sm font-semibold text-black transition hover:bg-white/90"
                    >
                      Open Analytics →
                    </Link>

                    <Link
                      href="/ai-analyst"
                      className="rounded-xl border border-white/[0.10] bg-white/[0.05] px-5 py-3 text-center text-sm font-medium text-white transition hover:bg-white/[0.09]"
                    >
                      Ask AI Analyst →
                    </Link>
                  </div>
                </div>
              </>
            )}

            <p className="mt-8 text-center text-[9px] uppercase tracking-[0.16em] text-white/15 sm:mt-10 sm:text-[10px] sm:tracking-[0.2em]">
              Aether Intelligence · Turn data into decisions
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}