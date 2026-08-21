"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getDataset } from "@/lib/datasetStore";

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
  if (value === undefined || value === null || value === "") {
    return NaN;
  }

  const cleaned = String(value)
    .replace(/[₹$€£,%\s,]/g, "")
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

function parseDate(value: string | undefined) {
  if (!value) return null;

  const date = new Date(value);

  if (!Number.isNaN(date.getTime())) {
    return date;
  }

  // Handle DD/MM/YYYY
  const parts = value.split(/[/-]/);

  if (parts.length === 3) {
    const day = Number(parts[0]);
    const month = Number(parts[1]);
    const year = Number(parts[2]);

    if (
      Number.isFinite(day) &&
      Number.isFinite(month) &&
      Number.isFinite(year)
    ) {
      const parsed = new Date(year, month - 1, day);

      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }

  return null;
}

function uniqueCount(rows: Row[], column: string | undefined) {
  if (!column) return 0;

  const values = new Set(
    rows
      .map((row) => String(row[column] ?? "").trim())
      .filter(Boolean)
  );

  return values.size;
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState("12 Months");
  const [metric, setMetric] = useState("Revenue");

  const [rows, setRows] = useState<Row[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [hydrated, setHydrated] = useState(false);

  /*
   * Load the SAME dataset uploaded on Overview/Data.
   */
useEffect(() => {
  async function loadDataset() {
    try {
      const saved = await getDataset();

      if (saved) {
        setRows(saved.rows);
        setColumns(saved.columns);
        setFileName(saved.fileName || "Uploaded Dataset");
      }
    } catch (error) {
      console.error("Could not load Aether dataset:", error);
    } finally {
      setHydrated(true);
    }
  }

  loadDataset();
}, []);

  /*
   * Detect columns from the ACTUAL uploaded dataset.
   */
  const detected = useMemo(() => {
    return {
      revenueColumn: findColumn(columns, [
        "revenue",
        "sales",
        "net sales",
        "gross sales",
        "sales amount",
        "sales value",
        "order value",
        "amount",
      ]),

      customerColumn: findColumn(columns, [
        "customer id",
        "customer_id",
        "customer",
        "client id",
        "client",
      ]),

      orderColumn: findColumn(columns, [
        "order id",
        "order_id",
        "invoice id",
        "transaction id",
        "transaction",
      ]),

      dateColumn: findColumn(columns, [
        "order date",
        "order_date",
        "sale date",
        "transaction date",
        "invoice date",
        "purchase date",
        "created date",
        "date",
      ]),

      quantityColumn: findColumn(columns, [
        "quantity",
        "qty",
        "units",
        "units sold",
        "order quantity",
        "sales quantity",
      ]),
    };
  }, [columns]);

  /*
   * Apply selected period to the ACTUAL dataset.
   */
  const filteredRows = useMemo(() => {
    if (!detected.dateColumn || !rows.length) {
      return rows;
    }

    const datedRows = rows
      .map((row) => ({
        row,
        date: parseDate(row[detected.dateColumn!]),
      }))
      .filter(
        (
          item
        ): item is {
          row: Row;
          date: Date;
        } => item.date !== null
      );

    if (!datedRows.length) {
      return rows;
    }

    const latestDate = new Date(
      Math.max(...datedRows.map((item) => item.date.getTime()))
    );

    let startDate = new Date(latestDate);

    if (period === "7 Days") {
      startDate.setDate(startDate.getDate() - 6);
    } else if (period === "30 Days") {
      startDate.setDate(startDate.getDate() - 29);
    } else {
      startDate.setFullYear(startDate.getFullYear() - 1);
    }

    return datedRows
      .filter((item) => item.date >= startDate && item.date <= latestDate)
      .map((item) => item.row);
  }, [rows, detected.dateColumn, period]);

  /*
   * REAL KPIs.
   */
  const metrics = useMemo(() => {
    const revenue = detected.revenueColumn
      ? filteredRows.reduce((sum, row) => {
          const value = toNumber(row[detected.revenueColumn!]);

          return sum + (Number.isFinite(value) ? value : 0);
        }, 0)
      : 0;

    const customers = uniqueCount(
      filteredRows,
      detected.customerColumn
    );

    const orders = uniqueCount(
      filteredRows,
      detected.orderColumn
    );

    const quantity = detected.quantityColumn
      ? filteredRows.reduce((sum, row) => {
          const value = toNumber(row[detected.quantityColumn!]);

          return sum + (Number.isFinite(value) ? value : 0);
        }, 0)
      : 0;

    const avgOrder =
      orders > 0
        ? revenue / orders
        : filteredRows.length > 0
        ? revenue / filteredRows.length
        : 0;

    /*
     * Retention = customers appearing more than once.
     */
    let retention = 0;

    if (detected.customerColumn) {
      const customerOrders: Record<string, number> = {};

      filteredRows.forEach((row) => {
        const customer = String(
          row[detected.customerColumn!] ?? ""
        ).trim();

        if (customer) {
          customerOrders[customer] =
            (customerOrders[customer] || 0) + 1;
        }
      });

      const customerIds = Object.keys(customerOrders);

      const returningCustomers = customerIds.filter(
        (customer) => customerOrders[customer] > 1
      ).length;

      retention =
        customerIds.length > 0
          ? (returningCustomers / customerIds.length) * 100
          : 0;
    }

    return {
      revenue,
      customers,
      orders,
      quantity,
      avgOrder,
      retention,
    };
  }, [filteredRows, detected]);

  /*
   * REAL monthly trend.
   */
  const trendData = useMemo(() => {
    if (!detected.dateColumn) {
      return [];
    }

    const grouped: Record<
      string,
      {
        revenue: number;
        customers: Set<string>;
        quantity: number;
      }
    > = {};

    filteredRows.forEach((row) => {
      const date = parseDate(row[detected.dateColumn!]);

      if (!date) return;

      const key = `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}`;

      if (!grouped[key]) {
        grouped[key] = {
          revenue: 0,
          customers: new Set<string>(),
          quantity: 0,
        };
      }

      if (detected.revenueColumn) {
        const revenue = toNumber(
          row[detected.revenueColumn]
        );

        if (Number.isFinite(revenue)) {
          grouped[key].revenue += revenue;
        }
      }

      if (detected.customerColumn) {
        const customer = String(
          row[detected.customerColumn] ?? ""
        ).trim();

        if (customer) {
          grouped[key].customers.add(customer);
        }
      }

      if (detected.quantityColumn) {
        const quantity = toNumber(
          row[detected.quantityColumn]
        );

        if (Number.isFinite(quantity)) {
          grouped[key].quantity += quantity;
        }
      }
    });

    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, data]) => {
        const [year, month] = key.split("-");

        const date = new Date(
          Number(year),
          Number(month) - 1,
          1
        );

        return {
          key,
          label: date.toLocaleDateString("en-IN", {
            month: "short",
          }),
          revenue: data.revenue,
          customers: data.customers.size,
          quantity: data.quantity,
        };
      });
  }, [filteredRows, detected]);

  /*
   * Current chart metric.
   */
  const activeData = useMemo(() => {
    return trendData.map((item) => ({
      ...item,
      value:
        metric === "Customers"
          ? item.customers
          : metric === "Quantity"
          ? item.quantity
          : item.revenue,
    }));
  }, [trendData, metric]);

  const highest = Math.max(
    ...activeData.map((item) => item.value),
    1
  );

  /*
   * Real growth from first period to latest period.
   */
  const growth = useMemo(() => {
    if (trendData.length < 2) {
      return null;
    }

    const first = trendData[0].revenue;
    const last = trendData[trendData.length - 1].revenue;

    if (!first) {
      return null;
    }

    return ((last - first) / first) * 100;
  }, [trendData]);

  /*
   * Strongest real month.
   */
  const strongestMonth = useMemo(() => {
    if (!trendData.length) return null;

    return [...trendData].sort(
      (a, b) => b.revenue - a.revenue
    )[0];
  }, [trendData]);

  if (!hydrated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07090d] text-white">
        <div className="text-sm text-white/40">
          Loading Aether Analytics...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#07090d] text-white">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-orange-500/[0.07] blur-[140px]" />

        <div className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-emerald-500/[0.06] blur-[140px]" />

        <div
          className="absolute inset-0 opacity-[0.03]"
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
          <Link
            href="/"
            className="flex items-center gap-3 px-2"
          >
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
          </Link>

          <div className="mt-10">
            <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30">
              Workspace
            </p>

            <nav className="mt-3 space-y-1">
              {navItems.map((item) => {
                const active =
                  item.label === "Analytics";

                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={`group flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${
                      active
                        ? "border border-white/[0.08] bg-white/[0.08] text-white"
                        : "text-white/45 hover:bg-white/[0.04] hover:text-white"
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                        active
                          ? "bg-orange-500/15 text-orange-300"
                          : "bg-white/[0.04] text-white/40 group-hover:text-orange-300"
                      }`}
                    >
                      {item.icon}
                    </span>

                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="absolute bottom-6 left-5 right-5">
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />

                <span className="text-xs text-white/60">
                  Analytics engine online
                </span>
              </div>

              <p className="mt-3 text-[11px] leading-5 text-white/35">
                Analytics are calculated from your uploaded
                dataset.
              </p>
            </div>
          </div>
        </aside>

        {/* Main */}
        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#07090d]/75 px-5 py-4 backdrop-blur-2xl sm:px-8">
            <div className="mx-auto flex max-w-[1500px] items-center justify-between">
              <div>
                <p className="text-xs text-white/35 lg:hidden">
                  AETHER INTELLIGENCE
                </p>

                <h1 className="text-lg font-semibold sm:text-xl">
                  Analytics
                </h1>
              </div>

              <div className="flex items-center gap-3">
                <div className="hidden items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white/50 sm:flex">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      rows.length
                        ? "bg-emerald-400"
                        : "bg-white/30"
                    }`}
                  />

                  {rows.length
                    ? "Dataset loaded"
                    : "No dataset"}
                </div>

                <button
                  type="button"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.05] text-sm text-white/70"
                >
                  AK
                </button>
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-[1500px] px-5 py-8 sm:px-8 lg:py-10">
            {!rows.length ? (
              /* NO DATA */
              <div className="flex min-h-[650px] items-center justify-center">
                <div className="max-w-xl text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-orange-400/20 bg-orange-400/[0.08] text-2xl">
                    ◫
                  </div>

                  <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-orange-400/15 bg-orange-400/[0.06] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                    No dataset
                  </div>

                  <h2 className="mt-5 text-3xl font-semibold tracking-tight">
                    Upload your data to unlock Analytics.
                  </h2>

                  <p className="mt-4 text-sm leading-7 text-white/40">
                    Analytics uses the actual CSV or Excel file
                    uploaded into Aether Intelligence. No demo
                    numbers are displayed.
                  </p>

                  <Link
                    href="/"
                    className="mt-7 inline-block rounded-xl bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
                  >
                    Go to Overview →
                  </Link>
                </div>
              </div>
            ) : (
              <>
                {/* Page heading */}
                <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
                  <div>
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-orange-400/15 bg-orange-400/[0.06] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                      Performance Analytics
                    </div>

                    <h2 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                      Understand your business.
                    </h2>

                    <p className="mt-3 max-w-2xl text-sm leading-6 text-white/40">
                      Real analytics generated from{" "}
                      <span className="text-white/60">
                        {fileName}
                      </span>
                      .
                    </p>
                  </div>

                  {/* Period selector */}
                  <div className="flex rounded-xl border border-white/[0.08] bg-white/[0.035] p-1">
                    {["7 Days", "30 Days", "12 Months"].map(
                      (item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setPeriod(item)}
                          className={`rounded-lg px-3 py-2 text-xs transition ${
                            period === item
                              ? "bg-white text-black"
                              : "text-white/40 hover:text-white"
                          }`}
                        >
                          {item}
                        </button>
                      )
                    )}
                  </div>
                </div>

                {/* KPI cards */}
                <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    [
                      "Revenue",
                      detected.revenueColumn
                        ? formatMoney(metrics.revenue)
                        : "—",
                      growth !== null
                        ? `${growth >= 0 ? "+" : ""}${growth.toFixed(
                            1
                          )}%`
                        : "Real data",
                    ],
                    [
                      "Customers",
                      detected.customerColumn
                        ? formatNumber(metrics.customers)
                        : "—",
                      "Unique customers",
                    ],
                    [
                      "Avg. Order",
                      detected.revenueColumn
                        ? formatMoney(metrics.avgOrder)
                        : "—",
                      detected.orderColumn
                        ? `${formatNumber(metrics.orders)} orders`
                        : "Calculated from records",
                    ],
                    [
                      "Retention",
                      detected.customerColumn
                        ? `${metrics.retention.toFixed(1)}%`
                        : "—",
                      "Returning customers",
                    ],
                  ].map(([title, value, change]) => (
                    <div
                      key={title}
                      className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-5 transition hover:-translate-y-1 hover:border-orange-400/15"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs text-white/40">
                          {title}
                        </p>

                        <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] text-emerald-300">
                          {change}
                        </span>
                      </div>

                      <p className="mt-5 text-3xl font-semibold tracking-[-0.04em]">
                        {value}
                      </p>

                      <p className="mt-2 text-[11px] text-white/30">
                        Calculated from uploaded data
                      </p>
                    </div>
                  ))}
                </div>

                {/* Main analytics grid */}
                <div className="mt-5 grid gap-5 xl:grid-cols-[1.5fr_0.8fr]">
                  {/* Chart */}
                  <div className="rounded-3xl border border-white/[0.07] bg-white/[0.035] p-5 sm:p-7">
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                      <div>
                        <p className="text-xs text-white/35">
                          Performance trend
                        </p>

                        <h3 className="mt-2 text-2xl font-semibold">
                          {metric}
                        </h3>

                        <p className="mt-1 text-xs text-white/30">
                          Based on actual uploaded records
                        </p>
                      </div>

                      <div className="flex rounded-lg border border-white/[0.07] bg-white/[0.025] p-1">
                        {["Revenue", "Customers", "Quantity"].map(
                          (item) => (
                            <button
                              key={item}
                              type="button"
                              onClick={() => setMetric(item)}
                              className={`rounded-md px-3 py-2 text-[11px] transition ${
                                metric === item
                                  ? "bg-orange-400 text-black"
                                  : "text-white/40 hover:text-white"
                              }`}
                            >
                              {item}
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    {activeData.length > 0 ? (
                      <>
                        <div className="mt-10 flex h-[320px] items-end gap-2 border-b border-white/[0.06] px-1 sm:gap-3">
                          {activeData.map((item) => {
                            const percentage =
                              (item.value / highest) * 100;

                            return (
                              <div
                                key={item.key}
                                className="group relative flex h-full flex-1 items-end"
                              >
                                <div
                                  className="w-full rounded-t-lg bg-gradient-to-t from-orange-500/10 via-orange-400/60 to-orange-300 transition-all duration-500 group-hover:from-orange-500/30 group-hover:via-orange-400/80"
                                  style={{
                                    height: `${Math.max(
                                      percentage,
                                      3
                                    )}%`,
                                  }}
                                />

                                <div className="absolute -top-8 left-1/2 hidden -translate-x-1/2 rounded-md bg-white px-2 py-1 text-[9px] font-semibold text-black group-hover:block">
                                  {metric === "Revenue"
                                    ? formatMoney(item.value)
                                    : formatNumber(
                                        item.value
                                      )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="mt-3 flex justify-between text-[10px] text-white/25">
                          {activeData.map((item) => (
                            <span key={item.key}>
                              {item.label}
                            </span>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="mt-8 flex h-[320px] items-center justify-center rounded-2xl border border-white/[0.06] bg-black/10 text-center text-sm text-white/30">
                        A valid date column is required to
                        generate the real trend.
                      </div>
                    )}
                  </div>

                  {/* AI Analysis */}
                  <div className="relative overflow-hidden rounded-3xl border border-orange-400/15 bg-gradient-to-br from-orange-500/[0.10] via-white/[0.035] to-emerald-500/[0.06] p-6 sm:p-7">
                    <div className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-orange-400/10 blur-3xl" />

                    <div className="relative">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-emerald-400 text-xl">
                          ✦
                        </div>

                        <div>
                          <p className="text-sm font-semibold">
                            AI Analysis
                          </p>

                          <p className="text-[10px] text-white/35">
                            Aether Intelligence
                          </p>
                        </div>
                      </div>

                      <p className="mt-8 text-xs uppercase tracking-[0.15em] text-orange-300/70">
                        Detected trend
                      </p>

                      <h3 className="mt-4 text-xl font-medium leading-8">
                        {strongestMonth
                          ? `${strongestMonth.label} generated your strongest revenue.`
                          : "Waiting for enough data."}
                      </h3>

                      <p className="mt-4 text-sm leading-6 text-white/40">
                        {growth !== null
                          ? `Revenue changed by ${
                              growth >= 0 ? "+" : ""
                            }${growth.toFixed(
                              1
                            )}% across the available period in your uploaded dataset.`
                          : "Aether is using your actual uploaded records to identify business patterns."}
                      </p>

                      <div className="mt-7 rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                        <p className="text-[10px] uppercase tracking-[0.15em] text-white/30">
                          Dataset signal
                        </p>

                        <p className="mt-2 text-sm leading-6 text-white/70">
                          {metrics.customers > 0
                            ? `${formatNumber(
                                metrics.customers
                              )} unique customers and ${formatNumber(
                                metrics.orders ||
                                  filteredRows.length
                              )} ${
                                detected.orderColumn
                                  ? "orders"
                                  : "records"
                              } were detected.`
                            : `${filteredRows.length.toLocaleString()} records are available for analysis.`}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Insights */}
                <div className="mt-5 grid gap-5 md:grid-cols-3">
                  {[
                    [
                      "Strongest month",
                      strongestMonth
                        ? strongestMonth.label
                        : "—",
                      strongestMonth
                        ? `${formatMoney(
                            strongestMonth.revenue
                          )} revenue`
                        : "Not enough date data.",
                    ],
                    [
                      "Customer momentum",
                      detected.customerColumn
                        ? formatNumber(metrics.customers)
                        : "—",
                      "Unique customers in selected period.",
                    ],
                    [
                      "Growth signal",
                      growth !== null
                        ? `${growth >= 0 ? "+" : ""}${growth.toFixed(
                            1
                          )}%`
                        : "—",
                      "Change from first to latest available period.",
                    ],
                  ].map(([title, value, description]) => (
                    <div
                      key={title}
                      className="rounded-3xl border border-white/[0.07] bg-white/[0.035] p-6"
                    >
                      <p className="text-xs text-white/35">
                        {title}
                      </p>

                      <p className="mt-3 text-2xl font-semibold">
                        {value}
                      </p>

                      <p className="mt-2 text-xs leading-5 text-white/30">
                        {description}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Dataset information */}
                <div className="mt-5 rounded-3xl border border-emerald-400/15 bg-emerald-400/[0.035] p-6">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div>
                      <p className="text-xs text-white/35">
                        Analytics source
                      </p>

                      <h3 className="mt-1 text-lg font-semibold">
                        {fileName}
                      </h3>

                      <p className="mt-2 text-xs text-white/30">
                        {filteredRows.length.toLocaleString()} records
                        analyzed · {columns.length} columns detected
                      </p>
                    </div>

                    <span className="rounded-full border border-emerald-400/15 bg-emerald-400/[0.06] px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                      Real Dataset
                    </span>
                  </div>
                </div>

                {/* Footer */}
                <p className="mt-10 text-center text-[10px] uppercase tracking-[0.2em] text-white/15">
                  Aether Intelligence · Analytics engine
                </p>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}