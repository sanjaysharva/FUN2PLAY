/*
 * ES module for sharing the cumulative total for one day.
 *
 * Usage:
 * import {
 *     getOverallDailyTotal,
 *     watchDailyTotal
 * } from "./daily_revenue_1788453941381.js";
 */

function getCurrentRevenueDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export async function getOverallDailyTotal(date = "") {
    const selectedDate = date || getCurrentRevenueDate();
    const response = await fetch(
        `/daily-revenue?date=${encodeURIComponent(selectedDate)}`,
        {
            method: "GET",
            cache: "no-store"
        }
    );
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(
            data.error || "Could not load daily revenue"
        );
    }

    return Number(data.totalRevenue || 0);
}

export function watchDailyTotal(
    onUpdate,
    date = "",
    intervalMs = 5000
) {
    if (typeof onUpdate !== "function") {
        throw new TypeError("onUpdate must be a function");
    }

    let stopped = false;

    const update = async () => {
        try {
            const total = await getOverallDailyTotal(date);
            if (!stopped) {
                onUpdate(total);
            }
        } catch (error) {
            console.error("Could not update daily total:", error);
        }
    };

    update();
    const timer = setInterval(update, intervalMs);

    return function stopWatchingDailyTotal() {
        stopped = true;
        clearInterval(timer);
    };
}

// Also makes the module convenient when loaded with a normal script tag.
window.getOverallDailyTotal = getOverallDailyTotal;
window.watchDailyTotal = watchDailyTotal;