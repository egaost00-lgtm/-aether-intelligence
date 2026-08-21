"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";

type Row = Record<string, string>;

type Analysis = {
  summary?: string;
  trends?: string[];
  anomalies?: string[];
  opportunities?: string[];
  recommendation?: string;
};

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

  return Math.round(value).toLocaleString();
}

function formatMoney(value: number) {
  if (!Number.isFinite(value)) return "—";

  if (Math.abs(value) >= 1_000_000) {
    return `₹${(value / 1_000_000).toFixed(1)}M`;
  }

  if (Math.abs(value) >= 1_000) {
    return `₹${(value / 1_000).toFixed(1)}K`;
  }

  return `₹${Math.round(value).toLocaleString()}`;
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
  });
}

export default function DataPage() {
  const [uploaded, setUploaded] = useState(false);
  const [fileName, setFileName] = useState("");
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState("");
  const [question, setQuestion] = useState("");
const [answer, setAnswer] = useState("");
const [asking, setAsking] = useState(false);

  /* -------------------------------------------------
     CSV PARSER
  ------------------------------------------------- */

  const parseCSV = (text: string): Row[] => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) return [];

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

  /* -------------------------------------------------
     FILE UPLOAD
  ------------------------------------------------- */
const handleFile = async (file: File | undefined) => {
  if (!file) return;

  setError("");
  setAnalysis(null);

  const extension = file.name
    .split(".")
    .pop()
    ?.toLowerCase();

  if (!["csv", "xlsx", "xls"].includes(extension || "")) {
    setError("Please upload a CSV or Excel file.");
    return;
  }

  try {
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
        setError("The Excel file does not contain a worksheet.");
        return;
      }

      const worksheet = workbook.Sheets[firstSheetName];

      parsedRows = XLSX.utils.sheet_to_json<Row>(
        worksheet,
        {
          defval: "",
          raw: false,
        }
      );
    }

    if (!parsedRows.length) {
      setError("The uploaded file appears to be empty.");
      return;
    }

    const parsedColumns = Object.keys(parsedRows[0]);

    if (!parsedColumns.length) {
      setError("No columns were detected in the uploaded file.");
      return;
    }

    setFileName(file.name);
    setColumns(parsedColumns);
    setRows(parsedRows);
    setUploaded(true);

    console.log("Dataset loaded:", {
      fileName: file.name,
      fileType: extension,
      columns: parsedColumns,
      rows: parsedRows.length,
    });
  } catch (err) {
    console.error("FILE READ ERROR:", err);

    setError(
      "Could not read this file. Please check that it is a valid CSV or Excel file."
    );
  }
};

  /* -------------------------------------------------
     AI ANALYSIS
  ------------------------------------------------- */

  const analyzeWithAI = async () => {
    if (!rows.length || !columns.length) {
      setError("Please upload a CSV dataset first.");
      return;
    }

    setAnalyzing(true);
    setError("");
    setAnalysis(null);

    try {
      const response = await fetch("/api/analyze-data", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileName,
          columns,
          rowCount: rows.length,
          rows,
        }),
      });

      const data = await response.json();

      console.log("AI analysis response:", data);

      if (!response.ok) {
        throw new Error(data?.error || "AI analysis failed.");
      }

      setAnalysis(data.analysis);
    } catch (err) {
      console.error("AI analysis error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while analyzing the dataset."
      );
    } finally {
      setAnalyzing(false);
    }
  };
    const askAether = async () => {
    if (!rows.length || !columns.length) {
      setError("Please upload a dataset first.");
      return;
    }

    if (!question.trim()) {
      setError("Please enter a question.");
      return;
    }

    setAsking(true);
    setAnswer("");
    setError("");

    try {
      const response = await fetch("/api/ask-data", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileName,
          columns,
          rows,
          question,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || "Aether could not answer the question."
        );
      }

      setAnswer(data.answer || "No answer was generated.");
    } catch (err) {
      console.error("Ask Aether error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while asking Aether."
      );
    } finally {
      setAsking(false);
    }
  };

  /* -------------------------------------------------
     DETECT IMPORTANT COLUMNS
  ------------------------------------------------- */

  const detected = useMemo(() => {
const revenueColumn = findColumn(columns, [
  "revenue",
  "net revenue",
  "sales",
  "net sales",
  "gross sales",
  "sales amount",
  "net sales amount",
  "total sales",
  "total sales amount",
  "sales value",
  "order value",
  "order amount",
  "total order value",
  "total order amount",
  "invoice amount",
  "invoice value",
  "transaction amount",
  "gmv",
  "income",
  "turnover",
  "amount",
]);

const unitsColumn = findColumn(columns, [
  "units",
  "unit",
  "units sold",
  "unit sold",
  "quantity",
  "quantity sold",
  "qty",
  "qty sold",
  "order quantity",
  "sales quantity",
  "sales qty",
  "order qty",
  "units purchased",
  "quantity purchased",
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
    "time",
    "period",
  ]);

  const regionColumn = findColumn(columns, [
    "region",
    "sales region",
    "customer region",
    "area",
    "customer area",
    "sales area",
    "territory",
    "sales territory",
    "location",
    "customer location",
    "state",
    "city",
  ]);

  const productColumn = findColumn(columns, [
    "product",
    "product name",
    "product description",
    "item",
    "item name",
    "item description",
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

  /* -------------------------------------------------
     KPI DATA
  ------------------------------------------------- */

  const metrics = useMemo(() => {
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
      customers: rows.length,
    };
  }, [rows, detected]);

  /* -------------------------------------------------
     TREND DATA
  ------------------------------------------------- */

  const trendData = useMemo(() => {
    const dateColumn = detected.dateColumn;
    const revenueColumn = detected.revenueColumn;

    if (!dateColumn || !revenueColumn) return [];

    const grouped: Record<string, number> = {};

    rows.forEach((row) => {
      const rawDate = row[dateColumn];
      const value = toNumber(row[revenueColumn]);

      if (!rawDate || !Number.isFinite(value)) return;

      const date = new Date(rawDate);

      if (Number.isNaN(date.getTime())) return;

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

  /* -------------------------------------------------
     REGION DATA
  ------------------------------------------------- */

  const regionData = useMemo(() => {
    const regionColumn = detected.regionColumn;
    const revenueColumn = detected.revenueColumn;

    if (!regionColumn || !revenueColumn) return [];

    const grouped: Record<string, number> = {};

    rows.forEach((row) => {
      const region = row[regionColumn]?.trim();

      const value = toNumber(row[revenueColumn]);

      if (!region || !Number.isFinite(value)) return;

      grouped[region] = (grouped[region] || 0) + value;
    });

    return Object.entries(grouped)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6)
      .map(([name, value]) => ({
        name,
        value,
      }));
  }, [rows, detected]);

  /* -------------------------------------------------
     PRODUCT DATA
  ------------------------------------------------- */

  const productData = useMemo(() => {
    const productColumn = detected.productColumn;
    const revenueColumn = detected.revenueColumn;

    if (!productColumn || !revenueColumn) return [];

    const grouped: Record<string, number> = {};

    rows.forEach((row) => {
      const product = row[productColumn]?.trim();

      const value = toNumber(row[revenueColumn]);

      if (!product || !Number.isFinite(value)) return;

      grouped[product] = (grouped[product] || 0) + value;
    });

    return Object.entries(grouped)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6)
      .map(([name, value]) => ({
        name,
        value,
      }));
  }, [rows, detected]);

  /* -------------------------------------------------
     SIMPLE GROWTH
  ------------------------------------------------- */

  const growth = useMemo(() => {
    if (trendData.length < 2) return null;

    const first = trendData[0].value;
    const last = trendData[trendData.length - 1].value;

    if (!first) return null;

    return ((last - first) / first) * 100;
  }, [trendData]);

  /* -------------------------------------------------
     RENDER
  ------------------------------------------------- */

  return (
    <main className="min-h-screen bg-[#07090d] text-white">
      {/* BACKGROUND */}

      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-orange-500/[0.08] blur-[140px]" />

        <div className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-emerald-500/[0.06] blur-[140px]" />

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

      <section className="relative min-h-screen">
        {/* HEADER */}

        <header className="border-b border-white/[0.06] bg-[#07090d]/75 px-5 py-5 backdrop-blur-2xl sm:px-8">
          <div className="mx-auto flex max-w-[1500px] items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-300">
                AETHER INTELLIGENCE
              </p>

              <h1 className="mt-1 text-xl font-semibold tracking-tight">
                Data
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white/50 sm:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                System online
              </div>

              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.05] text-xs font-medium">
                AK
              </div>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1500px] px-5 py-8 sm:px-8 lg:py-12">
          {/* HERO */}

          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-400/15 bg-orange-400/[0.06] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-300">
              <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
              Data Workspace
            </div>

            <h2 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              Bring your data.
              <span className="text-white/35">
                {" "}
                Unlock intelligence.
              </span>
            </h2>

            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/40">
              Upload your business data and let Aether Intelligence
              turn it into simple, visual business insights.
            </p>
          </div>

          {/* UPLOAD */}

          <div className="mt-10">
           <label
  htmlFor="data-upload"
  className="group flex min-h-[190px] cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-white/[0.12] bg-white/[0.025] p-8 text-center transition duration-300 hover:border-orange-400/40 hover:bg-white/[0.045]"
>
              <input
                id="data-upload"
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) =>
                  handleFile(e.target.files?.[0])
                }
              />

              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-orange-400/20 bg-gradient-to-br from-orange-400/15 to-emerald-400/10 text-3xl shadow-[0_0_40px_rgba(249,115,22,0.10)]">
                ↑
              </div>

              <h3 className="mt-6 text-xl font-semibold">
                {uploaded
                  ? "Data uploaded"
                  : "Upload your dataset"}
              </h3>

              <p className="mt-2 max-w-md text-sm leading-6 text-white/35">
                {uploaded
                  ? `${fileName} · ${rows.length} rows · ${columns.length} columns`
                  : "Upload your CSV business data here, or click to browse."}
              </p>

              {!uploaded && (
                <span className="mt-6 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black">
                  Choose File
                </span>
              )}

              {uploaded && (
                <span className="mt-6 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-5 py-3 text-sm font-medium text-emerald-300">
                  ✓ Dataset ready
                </span>
              )}
            </label>
          </div>

          {/* ERROR */}

          {error && (
            <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-400/[0.06] p-4 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* DATASET */}

          {uploaded && (
            <div className="mt-6 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-3xl border border-white/[0.07] bg-white/[0.035] p-6">
                <p className="text-xs text-white/35">
                  Uploaded dataset
                </p>

                <h3 className="mt-2 text-lg font-semibold">
                  {fileName}
                </h3>

                <div className="mt-6 grid grid-cols-3 gap-3">
                  <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4">
                    <p className="text-[10px] uppercase tracking-wider text-white/30">
                      Rows
                    </p>
                    <p className="mt-2 text-lg font-semibold text-emerald-300">
                      {rows.length.toLocaleString()}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4">
                    <p className="text-[10px] uppercase tracking-wider text-white/30">
                      Columns
                    </p>
                    <p className="mt-2 text-lg font-semibold">
                      {columns.length}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4">
                    <p className="text-[10px] uppercase tracking-wider text-white/30">
                      AI
                    </p>
                    <p className="mt-2 text-lg font-semibold text-orange-300">
                      Ready
                    </p>
                  </div>
                </div>
              </div>

              {/* AI BUTTON */}

              <div className="relative overflow-hidden rounded-3xl border border-orange-400/15 bg-gradient-to-br from-orange-500/[0.10] via-white/[0.035] to-emerald-500/[0.06] p-6">
                <div className="relative">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-emerald-400 text-lg">
                      ✦
                    </div>

                    <div>
                      <p className="text-sm font-semibold">
                        AI Data Analysis
                      </p>

                      <p className="text-[10px] text-white/35">
                        Powered by Aether Intelligence
                      </p>
                    </div>
                  </div>

                  <p className="mt-5 text-sm leading-6 text-white/50">
                    Turn your raw data into clear charts,
                    business trends and practical recommendations.
                  </p>

                  <button
                    type="button"
                    onClick={analyzeWithAI}
                    disabled={analyzing}
                    className="mt-6 w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {analyzing
                      ? "Analyzing your data..."
                      : "Analyze with AI →"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* =================================================
              BUSINESS DASHBOARD
          ================================================= */}

          {analysis && (
            <div className="mt-8 space-y-6">
              {/* TITLE */}

              <div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />

                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
                    Analysis complete
                  </p>
                </div>

                <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                  Your business at a glance
                </h2>

                <p className="mt-2 text-sm text-white/35">
                  Clear answers from your uploaded data.
                </p>
              </div>

              {/* KPI CARDS */}

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-3xl border border-white/[0.07] bg-white/[0.035] p-5">
                  <p className="text-xs text-white/35">
                    Total Revenue
                  </p>

                  <p className="mt-3 text-2xl font-semibold">
                    {detected.revenueColumn
                      ? formatMoney(metrics.totalRevenue)
                      : "—"}
                  </p>

                  <p className="mt-2 text-xs text-white/25">
                    Based on uploaded sales data
                  </p>
                </div>

                <div className="rounded-3xl border border-white/[0.07] bg-white/[0.035] p-5">
                  <p className="text-xs text-white/35">
                    Units Sold
                  </p>

                  <p className="mt-3 text-2xl font-semibold">
                    {detected.unitsColumn
                      ? formatNumber(metrics.totalUnits)
                      : "—"}
                  </p>

                  <p className="mt-2 text-xs text-white/25">
                    Total quantity recorded
                  </p>
                </div>

                <div className="rounded-3xl border border-white/[0.07] bg-white/[0.035] p-5">
                  <p className="text-xs text-white/35">
                    Records
                  </p>

                  <p className="mt-3 text-2xl font-semibold">
                    {metrics.customers.toLocaleString()}
                  </p>

                  <p className="mt-2 text-xs text-white/25">
                    Rows in your dataset
                  </p>
                </div>

                <div className="rounded-3xl border border-emerald-400/15 bg-emerald-400/[0.04] p-5">
                  <p className="text-xs text-white/35">
                    Overall Direction
                  </p>

                  <p className="mt-3 text-2xl font-semibold text-emerald-300">
                    {growth !== null
                      ? `${growth >= 0 ? "+" : ""}${growth.toFixed(
                          1
                        )}%`
                      : "—"}
                  </p>

                  <p className="mt-2 text-xs text-white/25">
                    First period vs latest period
                  </p>
                </div>
              </div>

              {/* CHARTS */}

              <div className="grid gap-6 lg:grid-cols-2">
                {/* REVENUE TREND */}

                <div className="rounded-3xl border border-white/[0.07] bg-white/[0.035] p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-white/35">
                        Performance
                      </p>

                      <h3 className="mt-1 text-lg font-semibold">
                        Revenue trend
                      </h3>
                    </div>

                    <span className="rounded-full border border-emerald-400/15 bg-emerald-400/[0.06] px-3 py-1 text-[10px] text-emerald-300">
                      {growth !== null
                        ? growth >= 0
                          ? "Growing"
                          : "Declining"
                        : "Trend"}
                    </span>
                  </div>

                  {trendData.length > 0 ? (
                    <div className="mt-8">
                      <div className="flex h-56 items-end gap-2">
                        {trendData.map((item, index) => {
                          const max = Math.max(
                            ...trendData.map((x) => x.value)
                          );

                          const height =
                            max > 0
                              ? Math.max(
                                  8,
                                  (item.value / max) * 100
                                )
                              : 8;

                          return (
                            <div
                              key={`${item.label}-${index}`}
                              className="flex h-full flex-1 flex-col justify-end"
                            >
                              <div className="mb-2 text-center text-[9px] text-white/35">
                                {formatNumber(item.value)}
                              </div>

                              <div
                                className="w-full rounded-t-lg bg-gradient-to-t from-orange-500/70 to-orange-300/90 transition-all"
                                style={{
                                  height: `${height}%`,
                                }}
                              />

                              <div className="mt-2 text-center text-[10px] text-white/30">
                                {item.label}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-8 rounded-2xl border border-white/[0.06] bg-black/10 p-8 text-center text-sm text-white/30">
                      Add a date and revenue column to see the trend.
                    </div>
                  )}
                </div>

                {/* REGIONS */}

                <div className="rounded-3xl border border-white/[0.07] bg-white/[0.035] p-6">
                  <div>
                    <p className="text-xs text-white/35">
                      Where sales are coming from
                    </p>

                    <h3 className="mt-1 text-lg font-semibold">
                      Regional performance
                    </h3>
                  </div>

                  {regionData.length > 0 ? (
                    <div className="mt-8 space-y-5">
                      {regionData.map((item, index) => {
                        const max = Math.max(
                          ...regionData.map((x) => x.value)
                        );

                        const width =
                          max > 0
                            ? (item.value / max) * 100
                            : 0;

                        return (
                          <div key={item.name}>
                            <div className="mb-2 flex items-center justify-between">
                              <span className="text-sm">
                                {item.name}
                              </span>

                              <span className="text-xs text-white/40">
                                {formatMoney(item.value)}
                              </span>
                            </div>

                            <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                              <div
                                className={`h-full rounded-full ${
                                  index === 0
                                    ? "bg-orange-400"
                                    : "bg-white/30"
                                }`}
                                style={{
                                  width: `${width}%`,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-8 rounded-2xl border border-white/[0.06] bg-black/10 p-8 text-center text-sm text-white/30">
                      No region information was detected.
                    </div>
                  )}
                </div>
              </div>

              {/* PRODUCT PERFORMANCE */}

              {productData.length > 0 && (
                <div className="rounded-3xl border border-white/[0.07] bg-white/[0.035] p-6">
                  <div>
                    <p className="text-xs text-white/35">
                      Product performance
                    </p>

                    <h3 className="mt-1 text-lg font-semibold">
                      Which products are making the most money?
                    </h3>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    {productData.map((item, index) => {
                      const max = Math.max(
                        ...productData.map((x) => x.value)
                      );

                      const width =
                        max > 0
                          ? (item.value / max) * 100
                          : 0;

                      return (
                        <div
                          key={item.name}
                          className="rounded-2xl border border-white/[0.06] bg-black/10 p-4"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06] text-xs font-semibold">
                                {index + 1}
                              </div>

                              <span className="text-sm font-medium">
                                {item.name}
                              </span>
                            </div>

                            <span className="text-sm font-semibold">
                              {formatMoney(item.value)}
                            </span>
                          </div>

                          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-orange-400 to-emerald-400"
                              style={{
                                width: `${width}%`,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* AI SUMMARY */}

              <div className="rounded-3xl border border-orange-400/15 bg-gradient-to-br from-orange-400/[0.08] via-white/[0.025] to-emerald-400/[0.05] p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-emerald-400 text-xl">
                    ✦
                  </div>

                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-orange-300">
                      Aether AI
                    </p>

                    <h3 className="mt-1 text-lg font-semibold">
                      What is happening in your business?
                    </h3>
                  </div>
                </div>

                <p className="mt-6 max-w-4xl text-base leading-8 text-white/70">
                  {analysis.summary ||
                    "Aether has completed the analysis of your dataset."}
                </p>
              </div>

              {/* THREE INSIGHT CARDS */}

              <div className="grid gap-5 lg:grid-cols-3">
                {/* TRENDS */}

                <div className="rounded-3xl border border-white/[0.07] bg-white/[0.035] p-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300">
                      ↗
                    </div>

                    <div>
                      <p className="text-xs text-white/35">
                        What's going well
                      </p>

                      <h3 className="font-semibold">
                        Positive trends
                      </h3>
                    </div>
                  </div>

                  <div className="mt-6 space-y-3">
                    {(analysis.trends || []).slice(0, 4).map(
                      (item, index) => (
                        <div
                          key={index}
                          className="rounded-2xl border border-white/[0.06] bg-black/10 p-4 text-sm leading-6 text-white/60"
                        >
                          {item}
                        </div>
                      )
                    )}

                    {!analysis.trends?.length && (
                      <p className="text-sm text-white/30">
                        No major trends were identified.
                      </p>
                    )}
                  </div>
                </div>

                {/* ATTENTION */}

                <div className="rounded-3xl border border-white/[0.07] bg-white/[0.035] p-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-400/10 text-orange-300">
                      !
                    </div>

                    <div>
                      <p className="text-xs text-white/35">
                        Needs attention
                      </p>

                      <h3 className="font-semibold">
                        Watch these areas
                      </h3>
                    </div>
                  </div>

                  <div className="mt-6 space-y-3">
                    {(analysis.anomalies || []).slice(0, 4).map(
                      (item, index) => (
                        <div
                          key={index}
                          className="rounded-2xl border border-orange-400/10 bg-orange-400/[0.04] p-4 text-sm leading-6 text-white/60"
                        >
                          {item}
                        </div>
                      )
                    )}

                    {!analysis.anomalies?.length && (
                      <p className="text-sm text-white/30">
                        No unusual issues were identified.
                      </p>
                    )}
                  </div>
                </div>

                {/* OPPORTUNITIES */}

                <div className="rounded-3xl border border-white/[0.07] bg-white/[0.035] p-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-400/10 text-purple-300">
                      ✦
                    </div>

                    <div>
                      <p className="text-xs text-white/35">
                        Growth potential
                      </p>

                      <h3 className="font-semibold">
                        Opportunities
                      </h3>
                    </div>
                  </div>

                  <div className="mt-6 space-y-3">
                    {(analysis.opportunities || [])
                      .slice(0, 4)
                      .map((item, index) => (
                        <div
                          key={index}
                          className="rounded-2xl border border-white/[0.06] bg-black/10 p-4 text-sm leading-6 text-white/60"
                        >
                          {item}
                        </div>
                      ))}

                    {!analysis.opportunities?.length && (
                      <p className="text-sm text-white/30">
                        No specific opportunities were identified.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* RECOMMENDATION */}

              <div className="rounded-3xl border border-emerald-400/15 bg-emerald-400/[0.045] p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300">
                    →
                  </div>

                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-300">
                      Recommended next step
                    </p>

                    <h3 className="mt-2 text-lg font-semibold">
                      What should you do?
                    </h3>

                    <p className="mt-4 max-w-4xl text-sm leading-7 text-white/60">
                      {analysis.recommendation ||
                        "No recommendation was generated."}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
          {/* ASK AETHER */}

{uploaded && (
  <div className="rounded-3xl border border-orange-400/15 bg-gradient-to-br from-orange-400/[0.08] via-white/[0.025] to-emerald-400/[0.05] p-6">
  <div className="flex items-center gap-3">
    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-emerald-400 text-xl">
      ✦
    </div>

    <div>
      <p className="text-[10px] uppercase tracking-[0.18em] text-orange-300">
        Aether Intelligence
      </p>

      <h3 className="mt-1 text-lg font-semibold">
        Ask Aether
      </h3>
    </div>
  </div>

  <p className="mt-4 text-sm leading-6 text-white/40">
    Ask questions about your uploaded business data and get
    intelligent answers from Aether.
  </p>

  <div className="mt-6 flex flex-col gap-3 sm:flex-row">
    <input
      type="text"
      value={question}
      onChange={(e) => setQuestion(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !asking) {
          askAether();
        }
      }}
      placeholder="e.g. Which region generated the most revenue?"
      className="flex-1 rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-white/20 focus:border-orange-400/30"
    />

    <button
      type="button"
      onClick={askAether}
      disabled={asking}
      className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {asking ? "Thinking..." : "Ask Aether →"}
    </button>
  </div>

  {/* SUGGESTED QUESTIONS */}

  <div className="mt-4 flex flex-wrap gap-2">
    {[
      "Which region has the highest revenue?",
      "What is my best-selling product?",
      "Which month performed best?",
      "How can I increase revenue?",
    ].map((item) => (
      <button
        key={item}
        type="button"
        onClick={() => setQuestion(item)}
        className="rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-[11px] text-white/40 transition hover:border-orange-400/20 hover:text-white/70"
      >
        {item}
      </button>
    ))}
  </div>

  {/* AI ANSWER */}

  {answer && (
    <div className="mt-6 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.04] p-5">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-emerald-400" />

        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
          Aether Answer
        </p>
      </div>

      <p className="mt-4 text-sm leading-7 text-white/70 whitespace-pre-wrap">
        {answer}
      </p>
    </div>
  )}
</div>
)}

          {/* SUPPORTED DATA */}

          <div className="mt-10">
            <p className="text-xs text-white/30">
              Supported data sources
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                ["CSV", "Comma-separated business data"],
                ["Excel", "XLS and XLSX spreadsheets"],
                ["Database", "Coming soon"],
              ].map(([title, description]) => (
                <div
                  key={title}
                  className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-5"
                >
                  <p className="text-sm font-semibold">
                    {title}
                  </p>

                  <p className="mt-2 text-xs leading-5 text-white/30">
                    {description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-12 text-center text-[10px] uppercase tracking-[0.2em] text-white/15">
            Aether Intelligence · Turn data into decisions
          </p>
        </div>
      </section>
    </main>
  );
}